<template>
  <div v-if="loading" class="global-loading">
    <div class="spinner"></div>
    <p>正在载入玩家殿堂...</p>
  </div>
  
  <!-- 其余页面均渲染带有侧边栏的 app-layout -->
  <div v-else class="app-layout" :class="{ 'fullscreen-view': isFullscreenPage }">
    <aside v-if="!isFullscreenPage" class="sidebar" :class="{ 'opaque-sidebar': isStoreDetailPage }">
      <!-- 动态飘浮的手柄 (仅在商店详情页显示) -->
      <div v-if="isStoreDetailPage" class="sidebar-gamepads-bg">
        <div 
          v-for="pad in sidebarGamepads" 
          :key="pad.id" 
          class="sidebar-gamepad"
          :style="{
            left: pad.left,
            fontSize: pad.fontSize,
            animationDuration: pad.duration,
            animationDelay: pad.delay,
            opacity: pad.opacity
          }"
        >
          🎮
        </div>
      </div>

      <div class="brand">
        <img src="/logo.png" alt="系统Logo" class="brand-logo" />
      </div>
      
      <nav class="main-nav">
        <router-link to="/home">
          <span class="icon"></span> 首页
        </router-link>
        <router-link to="/store">
          <span class="icon"></span> 游戏商店
        </router-link>
        <router-link to="/list">
          <span class="icon"></span> 游戏库列表
        </router-link>
        <router-link to="/accelerator">
          <span class="icon"></span> Steam加速器
        </router-link>
        <router-link to="/retro">
          <span class="icon"></span> 复古游戏室
        </router-link>
      </nav>

      <!-- 侧边栏底部用户信息/登录入口 -->
      <div 
        class="user-profile clickable" 
        @click="gameStore.steamUser ? router.push('/profile') : router.push('/login')"
      >
        <div class="avatar" :style="{ backgroundImage: `url(${gameStore.steamUser ? gameStore.steamUser.avatar : '/head.jpg'})` }"></div>
        <div class="info">
          <p class="name">{{ gameStore.steamUser ? gameStore.steamUser.personaname : '点击登录' }}</p>
          <button v-if="gameStore.steamUser" @click.stop="handleLogout" class="btn-logout">
            登出 Steam
          </button>
        </div>
      </div>
    </aside>
    
    <main class="content-area" :class="{ 'no-padding': isStoreDetailPage, 'fullscreen-main': isFullscreenPage }">
      <router-view v-slot="{ Component }">
        <keep-alive include="Store,List,Home">
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from './store/game'
import request from './api/request'

const route = useRoute()
const router = useRouter()
const gameStore = useGameStore()
const loading = ref(true)

// 判断是否是全屏页面（例如登录页面）
const isFullscreenPage = computed(() => {
  return route.path === '/login'
})

// 判断是否是商店详情页（商店详情页、发行商主页、首页及个人页需要侧边栏暗色/无内边距）
const isStoreDetailPage = computed(() => {
  return route.path === '/' || route.path === '/home' || route.path.startsWith('/store/detail/') || route.path.startsWith('/profile') || route.path.startsWith('/publisher/') || route.path === '/accelerator'
})

// 根据当前页面的深浅配色，动态计算顶部窗口栏应该使用的是亮色还是暗色
const isDarkThemePage = computed(() => {
  return isStoreDetailPage.value || isFullscreenPage.value || route.path === '/hof' || route.path.startsWith('/detail/')
})

// 动态通知 Electron 主进程将原生窗口标题栏设为暗色或亮色
watch(
  isDarkThemePage,
  (newVal) => {
    request.post('/api/set-theme', { theme: newVal ? 'dark' : 'light' }).catch(() => {})
  },
  { immediate: true }
)

// 侧边栏专属向上浮动的手柄数据
const sidebarGamepads = ref([])

// 监听路由改变，自动将内容区的滚动位置恢复到顶部（排除有自己恢复逻辑的商店页），防止各个页面间滚动互相影响
watch(
  () => route.path,
  (newPath) => {
    const contentArea = document.querySelector('.content-area')
    if (contentArea) {
      if (newPath !== '/store') {
        contentArea.scrollTop = 0
      }
    }
  },
  { flush: 'post' }
)

let heartbeatTimer = null

onMounted(async () => {
  // 生成 10 个分布合理的侧边栏手柄，用于详情页浮动
  const list = []
  for (let i = 0; i < 10; i++) {
    list.push({
      id: i,
      left: `${10 + Math.random() * 75}%`,
      fontSize: `${16 + Math.random() * 16}px`,
      duration: `${12 + Math.random() * 10}s`,
      delay: `${Math.random() * -20}s`,
      opacity: 0.12 + Math.random() * 0.15
    })
  }
  sidebarGamepads.value = list
  try {
    await gameStore.checkSession()
  } catch (err) {
    console.error('Session check failed:', err)
  } finally {
    loading.value = false
    // 通知后台及 Electron 主进程：前端界面与会话数据均已完全准备就绪，可以立刻无缝关闭开屏图进入主页面！
    request.post('/api/app-ready').catch(() => {})
  }

  // 维持客户端与后端的心跳，若窗口关闭，后端服务将自动随之关闭
  heartbeatTimer = setInterval(() => {
    request.post('/api/heartbeat').catch(() => {})
  }, 2000)
})

onUnmounted(() => {
  if (heartbeatTimer) clearInterval(heartbeatTimer)
})

const handleLogout = async () => {
  if (confirm('确定要退出当前 Steam 登录状态并清空视图吗？')) {
    await gameStore.logout()
    // 延迟 150ms 并重新聚焦窗口，彻底避开 Electron 确认框在特定场景下引起的页面输入框聚焦失效 bug
    setTimeout(() => {
      router.push('/home')
      if (typeof window !== 'undefined' && window.focus) {
        window.focus()
      }
    }, 150)
  }
}
</script>

<style>
/* 整个应用的基础 Flex 布局 */
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* 全局加载界面 */
.global-loading {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  z-index: 999999;
  background-color: #0f172a;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #94a3b8;
  font-family: inherit;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 3px solid rgba(0, 242, 254, 0.1);
  border-top-color: #00f2fe;
  border-radius: 50%;
  animation: spin 1s infinite linear;
  margin-bottom: 20px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 左侧边栏样式 */
.sidebar {
  width: 260px;
  background-color: rgba(30,41,59,0.7); /* 深蓝色背景 */
  backdrop-filter: blur(8px);
  color: white;
  display: flex;
  flex-direction: column;
  box-shadow: 2px 0 10px rgba(0,0,0,0.1);
  position: sticky;
  top: 0;
  height: 100vh; /* 固定在屏幕左侧高度 */
  transition: background-color 0.3s ease, box-shadow 0.3s ease, backdrop-filter 0.3s ease;
  will-change: background-color;
}

/* 让 Logo 居中，并在上下留出足够的优雅间隔 */
.brand {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px 20px; /* 增加上下留白间隔 */
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

/* 品牌 logo 最高设为 52px，使其更为醒目大气 */
.brand-logo {
  max-width: 95%;
  max-height: 52px;
  height: auto;
  object-fit: contain;
}

/* 导航菜单样式 */
.main-nav {
  padding: 20px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-grow: 1; /* 让导航占满中间剩余空间 */
}
.main-nav a {
  color: #94a3b8;
  text-decoration: none;
  padding: 15px 25px;
  display: flex;
  align-items: center;
  font-size: 16px;
  transition: all 0.3s ease;
  border-left: 4px solid transparent;
}
.main-nav a .icon { margin-right: 12px; font-size: 20px; }

/* 鼠标悬停和选中状态（高亮） */
.main-nav a:hover {
  background-color: #334155;
  color: white;
}
.main-nav a.active-link {
  background-color: #334155;
  color: #42b983; /* Vue 的经典绿色 */
  border-left-color: #42b983;
  font-weight: bold;
}

/* 底部个人信息 */
.user-profile {
  padding: 20px;
  display: flex;
  align-items: center;
  background-color: rgba(30,41,59,0.6); /* 深蓝色背景 */
  backdrop-filter: blur(8px);
  border-top: 1px solid rgba(255,255,255,0.05);
}
.avatar {  
  background-size: cover;         /* 让图片等比例缩放铺满整个屏幕 */
  background-position: center;    /* 让图片居中显示 */
  background-repeat: no-repeat;   /* 防止图片重复平铺 */
  border-radius: 50%; 
  width: 40px; 
  height: 40px; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  margin-right: 15px;
}
.info p { margin: 0; }
.info .name { font-size: 15px; font-weight: bold; color: white; }
.btn-logout {
  background: transparent;
  border: none;
  color: #ff7675;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  margin-top: 5px;
  display: block;
  text-align: left;
}
.btn-logout:hover {
  color: #ff4757;
  text-decoration: underline;
}

/* 右侧内容区样式 */
.content-area {
  flex: 1; /* 占据剩余的所有宽度 */
  background-color: rgba(248,250,252,0.4);
  padding: 30px 40px;
  height: 100vh;
  box-sizing: border-box;
  overflow-y: scroll; /* 始终显示滚动条以防布局和背景图微移 */
  overscroll-behavior: none; /* 全局禁止边界回弹与滚轴穿透，提高 Electron 客户端的交互质感 */
}

/* 全屏登录页面容器 */
.fullscreen-login {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: #0b0f19;
}

/* 侧边栏登录入口可点击状态 */
.user-profile.clickable {
  cursor: pointer;
  transition: all 0.3s ease;
}
.user-profile.clickable:hover {
  background: rgba(255, 255, 255, 0.08);
}
.user-profile.clickable:hover .name {
  color: #00f2fe;
}

/* 详情页时，将内容区 padding 设为 0，使黑色详情容器完全占满右半部分，并同时将全局右侧滑动条改为极致暗黑色 */
.content-area.no-padding {
  padding: 0 !important;
}
.content-area.no-padding::-webkit-scrollbar {
  width: 8px;
}
.content-area.no-padding::-webkit-scrollbar-track {
  background: #0b0f19 !important; /* 匹配详情页大背景色 */
}
.content-area.no-padding::-webkit-scrollbar-thumb {
  background: #1e293b !important;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}
.content-area.no-padding::-webkit-scrollbar-thumb:hover {
  background: #334155 !important;
}

/* 使侧边栏内的各个主体元素浮动在飘浮背景之上 */
.brand, .main-nav, .user-profile {
  position: relative;
  z-index: 2;
}

/* 详情页时，将侧边栏背景和底部个人信息卡片设为 100% 不透明极客深蓝 */
.sidebar.opaque-sidebar {
  background-color: #0b0f19 !important;
  backdrop-filter: none !important;
  box-shadow: 2px 0 15px rgba(0, 0, 0, 0.5);
  transition: background-color 0.3s ease, box-shadow 0.3s ease;
  will-change: background-color;
}
.sidebar.opaque-sidebar .user-profile {
  background-color: #080c14 !important;
  backdrop-filter: none !important;
  transition: background-color 0.3s ease;
  will-change: background-color;
}

/* 侧边栏专属向上浮动的手柄容器 */
.sidebar-gamepads-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  pointer-events: none;
  z-index: 1;
}

.sidebar-gamepad {
  position: absolute;
  bottom: -60px;
  color: rgba(255, 255, 255, 0.7);
  animation: sidebarFloatUp infinite linear;
  user-select: none;
}

@keyframes sidebarFloatUp {
  0% {
    transform: translateY(0) rotate(0deg);
  }
  100% {
    transform: translateY(-115vh) rotate(360deg);
  }
}

/* 全屏登录页面容器样式重构 */
.app-layout.fullscreen-view {
  display: block !important;
  height: 100vh !important;
  width: 100vw !important;
  overflow: hidden !important;
}

.content-area.fullscreen-main {
  width: 100vw !important;
  height: 100vh !important;
  padding: 0 !important;
  margin: 0 !important;
  overflow: hidden !important;
  background-color: #0b0f19 !important;
}
</style>
