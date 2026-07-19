# Whisper 字幕生成器

Windows 桌面 GUI：通过已安装的 `whisper-cli` 将 WAV 或 MP4 文件转换为中文 SRT 字幕。

## 前置条件

- Windows 10 或更高版本
- 已安装 `whisper-cli`，并可在命令提示符或 PowerShell 中直接运行
- 已下载 Whisper 模型文件，例如 `ggml-large-v3-turbo.bin`

本工具不会捆绑模型或 Whisper CLI；请在界面中选择模型文件。

## 使用

```bash
npm install
npm run dev
```

1. 选择或拖放 WAV / MP4 文件。
2. 选择 `.bin` Whisper 模型。
3. 设置线程数（默认 8）并保持中文识别。
4. 点击「开始生成字幕」。

程序会执行等价命令：

```text
whisper-cli -m "<模型路径>" -f "<媒体路径>" -l zh --output-srt -t 8
```

SRT 文件将由 `whisper-cli` 输出到输入媒体文件所在目录，通常与媒体文件同名且扩展名为 `.srt`。

## 构建

```bash
npm run package
```
