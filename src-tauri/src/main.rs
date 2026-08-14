#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};

const STATUS_EVENT: &str = "whisper:status";
const LOG_EVENT: &str = "whisper:log";

#[derive(Default)]
struct AppState {
    active_process: Mutex<Option<Child>>,
    task_running: AtomicBool,
    cancellation_requested: AtomicBool,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WhisperRunOptions {
    input_path: String,
    model_path: String,
    language: String,
    threads: u32,
    keep_converted_wav: bool,
    start_seconds: Option<f64>,
    end_seconds: Option<f64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WhisperStatus {
    state: String,
    message: String,
    output_path: Option<String>,
    converted_wav_path: Option<String>,
    progress: Option<u8>,
}

#[derive(Serialize)]
struct SelectedFile {
    name: String,
    path: String,
    extension: String,
}

struct CommandOutcome {
    code: Option<i32>,
}

fn status(state: &str, message: impl Into<String>) -> WhisperStatus {
    WhisperStatus {
        state: state.into(),
        message: message.into(),
        output_path: None,
        converted_wav_path: None,
        progress: None,
    }
}

fn send_status(app: &AppHandle, status: WhisperStatus) {
    let _ = app.emit(STATUS_EVENT, status);
}

fn send_log(app: &AppHandle, line: impl Into<String>) {
    let _ = app.emit(LOG_EVENT, line.into());
}

fn file_details(file_path: &str) -> Result<SelectedFile, String> {
    let path = Path::new(file_path);
    if !path.is_file() {
        return Err(format!("文件不存在：{file_path}"));
    }

    Ok(SelectedFile {
        name: path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .ok_or_else(|| format!("无效的文件路径：{file_path}"))?,
        path: path.to_string_lossy().into_owned(),
        extension: path
            .extension()
            .map(|extension| format!(".{}", extension.to_string_lossy().to_ascii_lowercase()))
            .unwrap_or_default(),
    })
}

fn model_preferences_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join("preferences.json"))
        .map_err(|error| format!("无法确定应用数据目录：{error}"))
}

fn save_last_model_path(app: &AppHandle, model_path: &str) -> Result<(), String> {
    let preferences_path = model_preferences_path(app)?;
    let parent = preferences_path
        .parent()
        .ok_or_else(|| "无法确定偏好设置目录".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("无法创建偏好设置目录：{error}"))?;
    fs::write(
        preferences_path,
        serde_json::json!({ "lastModelPath": model_path }).to_string(),
    )
    .map_err(|error| format!("无法保存上次使用的模型：{error}"))
}

fn get_last_model_path(app: &AppHandle) -> Option<String> {
    let preferences_path = model_preferences_path(app).ok()?;
    let content = fs::read_to_string(preferences_path).ok()?;
    let preferences = serde_json::from_str::<serde_json::Value>(&content).ok()?;
    let model_path = preferences.get("lastModelPath")?.as_str()?;
    Path::new(model_path)
        .is_file()
        .then(|| model_path.to_owned())
}

#[cfg(target_os = "windows")]
fn new_command(executable: &str) -> Command {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut command = Command::new(executable);
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[cfg(not(target_os = "windows"))]
fn new_command(executable: &str) -> Command {
    Command::new(executable)
}

fn progress_from_output(output: &str) -> Option<u8> {
    let lower_case = output.to_ascii_lowercase();
    let progress_position = lower_case.find("progress")?;
    let after_label = &lower_case[progress_position + "progress".len()..];
    let numeric_start = after_label.find(|character: char| character.is_ascii_digit())?;
    let digits: String = after_label[numeric_start..]
        .chars()
        .take_while(|character| character.is_ascii_digit())
        .collect();
    let progress = digits.parse::<u8>().ok()?;
    after_label[numeric_start + digits.len()..]
        .trim_start()
        .starts_with('%')
        .then_some(progress.min(100))
}

fn forward_output<R>(mut stream: R, app: AppHandle, report_progress: bool)
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut buffer = [0_u8; 4096];
        loop {
            match stream.read(&mut buffer) {
                Ok(0) => break,
                Ok(length) => {
                    let output = String::from_utf8_lossy(&buffer[..length]).into_owned();
                    send_log(&app, output.clone());
                    if report_progress {
                        if let Some(progress) = progress_from_output(&output) {
                            let mut running_status =
                                status("running", format!("正在识别语音：{progress}%"));
                            running_status.progress = Some(progress);
                            send_status(&app, running_status);
                        }
                    }
                }
                Err(error) => {
                    send_log(&app, format!("读取命令输出失败：{error}\n"));
                    break;
                }
            }
        }
    });
}

fn run_command(
    app: &AppHandle,
    state: &AppState,
    executable: &str,
    args: &[String],
    working_directory: &Path,
    report_progress: bool,
) -> io::Result<CommandOutcome> {
    let mut command = new_command(executable);
    command
        .args(args)
        .current_dir(working_directory)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command.spawn()?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| io::Error::other("无法读取命令标准输出"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| io::Error::other("无法读取命令错误输出"))?;

    {
        let mut active_process = state
            .active_process
            .lock()
            .map_err(|_| io::Error::other("任务进程状态异常"))?;
        *active_process = Some(child);
    }

    forward_output(stdout, app.clone(), report_progress);
    forward_output(stderr, app.clone(), report_progress);

    let exit_status = loop {
        let result = {
            let mut active_process = state
                .active_process
                .lock()
                .map_err(|_| io::Error::other("任务进程状态异常"))?;
            let child = active_process
                .as_mut()
                .ok_or_else(|| io::Error::other("任务进程已丢失"))?;
            child.try_wait()?
        };

        if let Some(exit_status) = result {
            break exit_status;
        }
        thread::sleep(Duration::from_millis(100));
    };

    {
        let mut active_process = state
            .active_process
            .lock()
            .map_err(|_| io::Error::other("任务进程状态异常"))?;
        *active_process = None;
    }

    Ok(CommandOutcome {
        code: exit_status.code(),
    })
}

fn executable_error(executable: &str, error: &io::Error) -> String {
    if error.kind() == io::ErrorKind::NotFound {
        return format!("无法执行 {executable}。请确认它已安装并加入系统 PATH。");
    }
    format!("无法执行 {executable}：{error}")
}

fn command_log(executable: &str, args: &[String]) -> String {
    let formatted_args = args
        .iter()
        .map(|argument| format!("{argument:?}"))
        .collect::<Vec<_>>()
        .join(" ");
    format!("> {executable} {formatted_args}\n")
}

fn format_srt_timestamp(total_milliseconds: i64) -> String {
    let clamped = total_milliseconds.max(0);
    let hours = clamped / 3_600_000;
    let minutes = (clamped % 3_600_000) / 60_000;
    let seconds = (clamped % 60_000) / 1_000;
    let milliseconds = clamped % 1_000;
    format!("{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}")
}

fn shift_srt_timestamps(srt_path: &Path, offset_seconds: f64) -> Result<(), String> {
    if offset_seconds <= 0.0 {
        return Ok(());
    }

    let offset_milliseconds = (offset_seconds * 1_000.0).round() as i64;
    let content = fs::read_to_string(srt_path)
        .map_err(|error| format!("无法读取字幕文件以对齐时间戳：{error}"))?;
    let shifted = content
        .lines()
        .map(|line| {
            if let Some((start, end)) = line.split_once(" --> ") {
                let shifted_start = shift_srt_timestamp(start, offset_milliseconds);
                let shifted_end = shift_srt_timestamp(end, offset_milliseconds);
                return format!("{shifted_start} --> {shifted_end}");
            }
            line.to_owned()
        })
        .collect::<Vec<_>>()
        .join("\n");

    fs::write(srt_path, format!("{shifted}\n"))
        .map_err(|error| format!("无法写入已对齐时间戳的字幕文件：{error}"))
}

fn shift_srt_timestamp(timestamp: &str, offset_milliseconds: i64) -> String {
    let parsed = timestamp
        .split([':', ','])
        .map(str::parse::<i64>)
        .collect::<Result<Vec<_>, _>>();
    let Ok(parts) = parsed else {
        return timestamp.to_owned();
    };
    if parts.len() != 4 {
        return timestamp.to_owned();
    }

    let total_milliseconds =
        ((parts[0] * 3_600 + parts[1] * 60 + parts[2]) * 1_000) + parts[3] + offset_milliseconds;
    format_srt_timestamp(total_milliseconds)
}

fn run_transcription(app: AppHandle, state: Arc<AppState>, options: WhisperRunOptions) {
    let mut temporary_wav_path: Option<PathBuf> = None;
    let mut preserved_wav_path: Option<PathBuf> = None;
    let result = (|| -> Result<(PathBuf, Option<PathBuf>), String> {
        let input_path = PathBuf::from(&options.input_path);
        let model_path = PathBuf::from(&options.model_path);
        if !input_path.is_file() {
            return Err(format!("文件不存在：{}", input_path.display()));
        }
        if !model_path.is_file() {
            return Err(format!("模型文件不存在：{}", model_path.display()));
        }
        if !matches!(options.language.as_str(), "zh" | "en" | "ja") {
            return Err("不支持的识别语言".to_string());
        }
        if options.threads == 0 {
            return Err("线程数必须至少为 1".to_string());
        }

        let output_base_path = input_path.with_extension("");
        let output_path = output_base_path.with_extension("srt");
        let _ = fs::remove_file(&output_path);
        let start_seconds = options.start_seconds.unwrap_or(0.0).max(0.0);
        let duration_seconds = options
            .end_seconds
            .map(|end_seconds| end_seconds.max(start_seconds) - start_seconds);
        let is_partial = options.start_seconds.is_some() || options.end_seconds.is_some();
        let input_extension = input_path
            .extension()
            .map(|extension| extension.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default();
        let needs_ffmpeg = input_extension == "mp4" || is_partial;
        let working_directory = input_path.parent().unwrap_or_else(|| Path::new("."));
        let mut transcription_input_path = input_path.clone();

        if needs_ffmpeg {
            if input_extension == "mp4" && options.keep_converted_wav {
                let converted_path = PathBuf::from(format!(
                    "{}.whisper.wav",
                    output_base_path.to_string_lossy()
                ));
                temporary_wav_path = Some(converted_path.clone());
                preserved_wav_path = Some(converted_path);
            } else {
                let temporary_directory = std::env::temp_dir().join("whisper-subtitle-tool");
                fs::create_dir_all(&temporary_directory)
                    .map_err(|error| format!("无法创建临时目录：{error}"))?;
                let timestamp = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map_err(|error| format!("无法生成临时文件名：{error}"))?
                    .as_nanos();
                temporary_wav_path = Some(
                    temporary_directory.join(format!("{}-{timestamp}.wav", std::process::id())),
                );
            }

            let wav_path = temporary_wav_path
                .as_ref()
                .ok_or_else(|| "无法创建临时 WAV 文件路径".to_string())?;
            let mut ffmpeg_args = vec!["-y".to_string()];
            if start_seconds > 0.0 {
                ffmpeg_args.extend(["-ss".to_string(), format!("{start_seconds:.3}")]);
            }
            ffmpeg_args.extend(["-i".to_string(), input_path.to_string_lossy().into_owned()]);
            if let Some(duration_seconds) = duration_seconds {
                ffmpeg_args.extend(["-t".to_string(), format!("{duration_seconds:.3}")]);
            }
            ffmpeg_args.extend([
                "-vn".to_string(),
                "-ac".to_string(),
                "1".to_string(),
                "-ar".to_string(),
                "16000".to_string(),
                "-c:a".to_string(),
                "pcm_s16le".to_string(),
                wav_path.to_string_lossy().into_owned(),
            ]);

            let range_label = duration_seconds.map_or_else(
                || "全部".to_string(),
                |duration| format!("{start_seconds:.0}s–{:.0}s", start_seconds + duration),
            );
            send_status(
                &app,
                status(
                    "running",
                    if input_extension == "mp4" {
                        format!("正在将 MP4 转换为兼容的 WAV 音频（{range_label}）…")
                    } else {
                        format!("正在裁剪音频片段（{range_label}）…")
                    },
                ),
            );
            send_log(&app, command_log("ffmpeg", &ffmpeg_args));
            let conversion = run_command(
                &app,
                &state,
                "ffmpeg",
                &ffmpeg_args,
                working_directory,
                false,
            )
            .map_err(|error| executable_error("ffmpeg", &error))?;
            if state.cancellation_requested.load(Ordering::SeqCst) {
                return Ok((output_path, preserved_wav_path.clone()));
            }
            if conversion.code != Some(0) {
                return Err(format!(
                    "FFmpeg 转码失败（退出码：{}）",
                    conversion
                        .code
                        .map_or_else(|| "未知".to_string(), |code| code.to_string())
                ));
            }
            if !wav_path.is_file() {
                return Err("FFmpeg 未生成 WAV 文件，无法继续识别".to_string());
            }
            transcription_input_path = wav_path.clone();
        }

        if state.cancellation_requested.load(Ordering::SeqCst) {
            return Ok((output_path, preserved_wav_path.clone()));
        }

        let whisper_args = vec![
            "-m".to_string(),
            model_path.to_string_lossy().into_owned(),
            "-f".to_string(),
            transcription_input_path.to_string_lossy().into_owned(),
            "-l".to_string(),
            options.language,
            "--output-srt".to_string(),
            "-of".to_string(),
            output_base_path.to_string_lossy().into_owned(),
            "--print-progress".to_string(),
            "-t".to_string(),
            options.threads.to_string(),
        ];
        send_status(&app, status("running", "正在启动 whisper-cli…"));
        send_log(&app, command_log("whisper-cli", &whisper_args));
        let transcription = run_command(
            &app,
            &state,
            "whisper-cli",
            &whisper_args,
            working_directory,
            true,
        )
        .map_err(|error| executable_error("whisper-cli", &error))?;
        if state.cancellation_requested.load(Ordering::SeqCst) {
            return Ok((output_path, preserved_wav_path.clone()));
        }
        if transcription.code != Some(0) {
            return Err(format!(
                "whisper-cli 执行失败（退出码：{}）",
                transcription
                    .code
                    .map_or_else(|| "未知".to_string(), |code| code.to_string())
            ));
        }
        if !output_path.is_file() {
            return Err(format!(
                "whisper-cli 已结束，但未找到输出字幕文件：{}",
                output_path.display()
            ));
        }
        if start_seconds > 0.0 {
            send_status(&app, status("running", "正在将字幕时间戳对齐到原片…"));
            shift_srt_timestamps(&output_path, start_seconds)?;
        }

        Ok((output_path, preserved_wav_path.clone()))
    })();

    if let Some(temporary_wav_path) = temporary_wav_path.filter(|_| preserved_wav_path.is_none()) {
        if let Err(error) = fs::remove_file(temporary_wav_path) {
            if error.kind() != io::ErrorKind::NotFound {
                send_log(&app, format!("临时 WAV 清理失败：{error}\n"));
            }
        }
    }

    if state.cancellation_requested.load(Ordering::SeqCst) {
        send_status(&app, status("cancelled", "字幕生成已取消"));
    } else {
        match result {
            Ok((output_path, converted_wav_path)) => {
                let mut success_status = status(
                    "success",
                    if converted_wav_path.is_some() {
                        "字幕生成完成，已保留转换后的 WAV 文件"
                    } else {
                        "字幕生成完成"
                    },
                );
                success_status.output_path = Some(output_path.to_string_lossy().into_owned());
                success_status.converted_wav_path =
                    converted_wav_path.map(|path| path.to_string_lossy().into_owned());
                success_status.progress = Some(100);
                send_status(&app, success_status);
            }
            Err(error) => send_status(&app, status("error", error)),
        }
    }

    if let Ok(mut active_process) = state.active_process.lock() {
        *active_process = None;
    }
    state.task_running.store(false, Ordering::SeqCst);
    state.cancellation_requested.store(false, Ordering::SeqCst);
}

#[tauri::command]
fn get_file_details(file_path: String) -> Result<SelectedFile, String> {
    file_details(&file_path)
}

#[tauri::command]
fn save_last_model(app: AppHandle, model_path: String) -> Result<(), String> {
    let model = file_details(&model_path)?;
    if model.extension != ".bin" {
        return Err("请选择 .bin Whisper 模型文件".to_string());
    }
    save_last_model_path(&app, &model.path)
}

#[tauri::command]
fn get_last_model(app: AppHandle) -> Option<SelectedFile> {
    get_last_model_path(&app).and_then(|model_path| file_details(&model_path).ok())
}

#[tauri::command]
fn get_cpu_count() -> usize {
    thread::available_parallelism().map_or(1, usize::from)
}

#[tauri::command]
fn get_media_duration(file_path: String) -> Result<f64, String> {
    if !Path::new(&file_path).is_file() {
        return Err(format!("文件不存在：{file_path}"));
    }

    let output = new_command("ffprobe")
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            &file_path,
        ])
        .output()
        .map_err(|error| executable_error("ffprobe", &error))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let duration = stdout.trim().parse::<f64>().ok();
    if !output.status.success()
        || !duration.is_some_and(|duration| duration.is_finite() && duration > 0.0)
    {
        return Err(if stderr.trim().is_empty() {
            "无法读取媒体时长。".to_string()
        } else {
            stderr.trim().to_string()
        });
    }
    Ok(duration.expect("duration was checked above"))
}

#[tauri::command]
fn start_transcription(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    options: WhisperRunOptions,
) -> Result<(), String> {
    if state.task_running.swap(true, Ordering::SeqCst) {
        return Err("已有字幕生成任务正在运行".to_string());
    }
    state.cancellation_requested.store(false, Ordering::SeqCst);
    let app_state = state.inner().clone();
    thread::spawn(move || run_transcription(app, app_state, options));
    Ok(())
}

#[tauri::command]
fn cancel_transcription(state: State<'_, Arc<AppState>>) {
    if !state.task_running.load(Ordering::SeqCst) {
        return;
    }
    state.cancellation_requested.store(true, Ordering::SeqCst);
    if let Ok(mut active_process) = state.active_process.lock() {
        if let Some(process) = active_process.as_mut() {
            let _ = process.kill();
        }
    }
}

#[tauri::command]
fn is_task_running(state: State<'_, Arc<AppState>>) -> bool {
    state.task_running.load(Ordering::SeqCst)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Arc::new(AppState::default()))
        .invoke_handler(tauri::generate_handler![
            get_file_details,
            save_last_model,
            get_last_model,
            get_cpu_count,
            get_media_duration,
            start_transcription,
            cancel_transcription,
            is_task_running
        ])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用时发生错误");
}

#[cfg(test)]
mod tests {
    use super::{format_srt_timestamp, progress_from_output, shift_srt_timestamp};

    #[test]
    fn parses_whisper_progress() {
        assert_eq!(progress_from_output("progress = 42%"), Some(42));
        assert_eq!(progress_from_output("completed"), None);
    }

    #[test]
    fn shifts_srt_timestamp() {
        assert_eq!(shift_srt_timestamp("00:00:02,500", 1_500), "00:00:04,000");
        assert_eq!(format_srt_timestamp(-1), "00:00:00,000");
    }
}
