const BOOT_SPLASH_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>Whisper 字幕生成器</title>
    <style>
      html, body {
        margin: 0;
        height: 100%;
        background: #f1f5f9;
        color: #0f172a;
        font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      html.boot-dark, html.boot-dark body {
        background: #020617;
        color: #f1f5f9;
      }
      #boot-loading {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
      }
      .spinner {
        width: 40px;
        height: 40px;
        border: 3px solid rgba(79, 70, 229, 0.25);
        border-top-color: #4f46e5;
        border-radius: 50%;
        animation: boot-spin 0.75s linear infinite;
      }
      .label {
        font-size: 14px;
        opacity: 0.8;
      }
      @keyframes boot-spin {
        to { transform: rotate(360deg); }
      }
    </style>
  </head>
  <body>
    <div id="boot-loading">
      <div class="spinner"></div>
      <div class="label">正在加载…</div>
    </div>
    <script>
      try {
        if (localStorage.getItem('theme') === 'dark') {
          document.documentElement.classList.add('boot-dark')
        }
      } catch (_) {}
    </script>
  </body>
</html>`

export function getBootSplashUrl() {
  return `data:text/html;charset=utf-8,${encodeURIComponent(BOOT_SPLASH_HTML)}`
}
