# Whisper 字幕生成器

Windows 桌面 GUI：通过已安装的 `whisper-cli` 将 WAV 或 MP4 文件转换为中文 SRT 字幕。

## 前置条件

- Windows 10 或更高版本
- 已安装 `whisper-cli`，并可在命令提示符或 PowerShell 中直接运行
- 已下载 Whisper 模型文件，例如 `ggml-large-v3-turbo.bin`
- 若处理 MP4：已安装 `ffmpeg`，并可执行 `ffmpeg -version`

本工具不会捆绑模型或 Whisper CLI；请在界面中选择模型文件。

## 使用

```bash
npm install
npm run dev
```

1. 选择或拖放 WAV / MP4 文件。
2. 选择 `.bin` Whisper 模型。
3. 选择中文或英文，设置线程数（默认 8）。
4. 点击「开始生成字幕」。

WAV 会直接送入 Whisper。MP4 会先由 FFmpeg 转换为临时的 16 kHz 单声道 PCM WAV，完成或失败后自动删除临时文件。

程序会执行等价命令：

```text
whisper-cli -m "<模型路径>" -f "<媒体路径>" -l zh --output-srt -t 8
```

SRT 文件将由 `whisper-cli` 输出到输入媒体文件所在目录，通常与媒体文件同名且扩展名为 `.srt`。

## 构建

```bash
npm run package
```

## 发布 Windows 安装包

推送 `v*` 标签（例如 `v1.0.0`）会触发 GitHub Actions，在 Windows 上生成 Squirrel 安装程序并自动附加到对应的 GitHub Release。

```bash
git tag v1.0.0
git push origin v1.0.0
```

也可以从 GitHub Actions 手动运行 **Build Windows release**，下载构建产物进行测试。
