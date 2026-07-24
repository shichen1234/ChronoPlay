import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
// import './mock/index.js' 
import './style.css'
const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
window.__VUE_ROUTER__ = router

// 全局拦截并禁用所有拖拽行为（防止拖动出链接、图片、文字和任何 UI 组件）
window.addEventListener('dragstart', (e) => {
  e.preventDefault()
  return false
}, true)

app.mount('#app')
