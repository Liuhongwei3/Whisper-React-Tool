import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('未找到根节点 #root')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// 等首帧绘制后再切换，避免用户只看到空白底色
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.whisper.notifyReady()
  })
})
