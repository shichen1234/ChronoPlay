<template>
  <div class="login-container">
    <!-- 返回首页按钮 -->
    <button @click="goBackToHome" class="btn-back-home">
      <span class="back-arrow">←</span> 返回首页
    </button>

    <div class="glow-bg">
      <div class="glow-circle cyan"></div>
      <div class="glow-circle purple"></div>
      
      <!-- 动态游戏手柄背景：按照不同速度向上平移，模糊度保持不变 -->
      <div 
        v-for="pad in gamepads" 
        :key="pad.id" 
        class="floating-gamepad" 
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

    <div class="login-card animate-card">
      <div class="card-header">
        <img src="/logo.png" alt="Logo" class="login-brand-logo" />
        <h2>游戏收藏中心</h2>
        <p class="subtitle">连接 Steam 库，打造属于你自己的玩家殿堂</p>
      </div>

      <div class="card-body">
        <a href="/api/auth/steam" class="btn-steam-login" @click.prevent="handleSteamLoginClick">
          <svg class="steam-logo" viewBox="0 0 24 24" width="22" height="22">
            <path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.285 3.417 9.773 8.163 11.353l1.83-2.617c-.126-.143-.223-.306-.297-.478l-.004-.006c-.052-.119-.091-.24-.121-.365L6.09 17.9c-.397-.058-.772-.218-1.085-.473a2.7 2.7 0 0 1-1.034-2.11 2.7 2.7 0 0 1 2.7-2.7c1.178 0 2.185.761 2.545 1.815l2.678 1.096c.216-.067.443-.11.677-.123v-4.108c-.784-.233-1.428-.809-1.748-1.554l-.004-.008a2.53 2.53 0 0 1 0-2.064c.32-.745.964-1.321 1.748-1.554V3.535a2.537 2.537 0 0 1 2.537-2.537 2.537 2.537 0 0 1 2.537 2.537v2.573c.784.233 1.428.809 1.748 1.554l.004.008a2.53 2.53 0 0 1 0 2.064 2.53 2.53 0 0 1-1.748 1.554v4.108c.234.013.461.056.677.123l2.678-1.096c.36-1.054 1.367-1.815 2.545-1.815a2.7 2.7 0 0 1 2.7 2.7c0 1.319-.949 2.42-2.193 2.656l1.81 2.593c4.767-1.571 8.193-6.064 8.193-11.353 0-6.627-5.373-12-12-12m-3.486 16.71c-.707 0-1.282-.575-1.282-1.282 0-.707.575-1.282 1.282-1.282.707 0 1.282.575 1.282 1.282 0 .707-.575 1.282-1.282 1.282"/>
          </svg>
          使用 Steam 账号登录
        </a>

        <!-- 分割线 -->
        <div class="separator-line">
          <span>或者</span>
        </div>

        <!-- 方法二：昵称搜索快捷登录 -->
        <div class="quick-login-form">
          <div class="input-group">
            <input 
              v-model="searchQuery" 
              type="text" 
              placeholder="输入您的 Steam 游戏昵称" 
              class="input-steam-id"
              :disabled="searchLoading"
              @keyup.enter="handleSearchUsers"
            />
            <button 
              @click="handleSearchUsers" 
              class="btn-quick-login"
              :disabled="searchLoading || !searchQuery.trim()"
            >
              <!-- 修复为高品质的 CSS Border Spinner，避免 Unicode 旋转抖动 -->
              <span v-if="searchLoading" class="spinner-loader"></span>
              <span v-else>搜索账号</span>
            </button>
          </div>
          
          <!-- 搜索结果列表 -->
          <div v-if="searchResults.length > 0" class="search-results-list custom-scrollbar">
            <div 
              v-for="user in searchResults" 
              :key="user.steamid"
              class="search-user-item"
              @click="selectUser(user)"
              :class="{ 'disabled': loginLoading }"
            >
              <img :src="user.avatar" class="user-avatar-small" alt="avatar" />
              <div class="user-info-text">
                <span class="user-name-text">{{ user.personaname }}</span>
                <span v-if="user.location" class="user-loc-text">{{ user.location }}</span>
              </div>
              <span class="btn-select-text">选择登录</span>
            </div>
          </div>
          
          <div v-if="searched && searchResults.length === 0 && !searchLoading" class="no-results-tip">
            未搜到匹配的公开 Steam 账号，请检查拼写，并确保个人主页已设为公开。
          </div>
          
          <p v-if="errorMessage" class="error-msg">⚠️ {{ errorMessage }}</p>
        </div>

        <div class="privacy-tip">
          <span class="info-icon">ℹ️</span>
          <p>
            <b>提示</b>：请登录后确保您的 Steam 账户的 <a href="https://steamcommunity.com/my/edit/settings" target="_blank" rel="noopener">“隐私设置”</a> 中，<b>“我的个人资料”</b>与<b>“游戏详情”</b>均已设为<b>“公开”</b>，以便系统安全读取您的游戏库 and 时长。
          </p>
        </div>
      </div>
    </div>


  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import request from '../api/request'
import { useGameStore } from '../store/game'

const router = useRouter()
const gameStore = useGameStore()

const goBackToHome = () => {
  router.push('/home')
}

const searchLoading = ref(false)
const loginLoading = ref(false)
const searchQuery = ref('')
const searchResults = ref([])
const searched = ref(false)
const errorMessage = ref('')

const dontShowAgain = ref(false)
const gamepads = ref([])

onMounted(() => {
  // 检查本地存储中是否设置了不再提示
  const skipHint = localStorage.getItem('chronoplay_skip_steam_hint') === 'true'
  if (skipHint) {
    dontShowAgain.value = true
  }

  // 动态生成 12 个漂浮的游戏手柄
  const list = []
  for (let i = 0; i < 12; i++) {
    list.push({
      id: i,
      left: `${Math.random() * 100}%`,
      fontSize: `${24 + Math.random() * 32}px`, // 大小从 24px 到 56px 不等
      duration: `${15 + Math.random() * 20}s`, // 速度提升至 15s 到 35s 不等，使漂移更明显
      delay: `${Math.random() * -35}s`, // 负延时使得一开始就散落在屏幕各高度
      opacity: 0.15 + Math.random() * 0.25 // 提升透明度至 15% 到 40% 之间，确保清晰可见
    })
  }
  gamepads.value = list
})

const handleSteamLoginClick = () => {
  window.location.href = '/api/auth/steam'
}

const handleSearchUsers = async () => {
  const queryVal = searchQuery.value.trim()
  if (!queryVal) return
  
  try {
    searchLoading.value = true
    errorMessage.value = ''
    searched.value = true
    searchResults.value = []
    
    const res = await request.get(`/api/auth/search-users?query=${encodeURIComponent(queryVal)}`)
    if (res.data.code === 200) {
      searchResults.value = res.data.data
    } else {
      errorMessage.value = res.data.message || '搜索失败，请重试'
    }
  } catch (err) {
    console.error('搜索用户异常:', err)
    errorMessage.value = '搜索请求超时，请检查加速器或网络连接'
  } finally {
    searchLoading.value = false
  }
}

const selectUser = async (user) => {
  if (loginLoading.value) return
  
  try {
    loginLoading.value = true
    errorMessage.value = ''
    
    const res = await request.post('/api/auth/quick-login', { steamid: user.steamid })
    if (res.data.code === 200) {
      await gameStore.checkSession()
      router.push('/')
    } else {
      errorMessage.value = res.data.message || '登录失败，无法解析玩家资料'
    }
  } catch (err) {
    console.error('选择用户登录失败:', err)
    errorMessage.value = '登录请求超时，请检查您的网络连接或加速器'
  } finally {
    loginLoading.value = false
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  width: 100%;
  background-color: #0b0f19;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 9999;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 40px 0;
}

* {
  box-sizing: border-box;
}

/* 动态背景光源 */
.glow-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  z-index: 1;
}

.glow-circle {
  position: absolute;
  border-radius: 50%;
  filter: blur(120px);
  opacity: 0.18;
  animation: floatCircle 15s infinite ease-in-out;
}

.glow-circle.cyan {
  width: 450px;
  height: 450px;
  background: radial-gradient(circle, #00f2fe 0%, rgba(0, 242, 254, 0) 70%);
  top: -100px;
  right: -50px;
}

.glow-circle.purple {
  width: 550px;
  height: 550px;
  background: radial-gradient(circle, #9b51e0 0%, rgba(155, 81, 224, 0) 70%);
  bottom: -100px;
  left: -100px;
  animation-delay: -7s;
}

@keyframes floatCircle {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-30px) scale(1.05); }
}

/* 多个浮动背景游戏手柄的样式与动画 */
.floating-gamepad {
  position: absolute;
  bottom: -100px; /* 从屏幕底部外开始 */
  color: rgba(255, 255, 255, 0.8); /* 极大地提高手柄颜色清晰度 */
  pointer-events: none;
  user-select: none;
  animation-name: moveUp;
  animation-iteration-count: infinite;
  animation-timing-function: linear;
  filter: blur(0.5px); /* 减少模糊，使手柄更加锐利、清晰可见 */
  z-index: 1;
}

@keyframes moveUp {
  0% {
    transform: translateY(0) rotate(0deg);
  }
  100% {
    transform: translateY(-120vh) rotate(360deg);
  }
}

/* 玻璃拟态登录卡片 */
.login-card {
  width: 95%;
  max-width: 480px;
  background: rgba(17, 24, 39, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  padding: 40px 30px;
  text-align: center;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  z-index: 10;
  position: relative;
}

.animate-card {
  animation: cardFadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes cardFadeIn {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 品牌 Logo 样式 */
.login-brand-logo {
  max-width: 140px;
  height: auto;
  margin-bottom: 20px;
  filter: drop-shadow(0 4px 15px rgba(0, 242, 254, 0.4));
  animation: bounceLogo 3s infinite ease-in-out;
}

@keyframes bounceLogo {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.card-header h2 {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 1px;
  margin: 0 0 8px 0;
  background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.subtitle {
  color: #9ca3af;
  font-size: 14px;
  margin: 0;
  line-height: 1.6;
}

.card-body {
  margin-top: 25px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
}

.steam-login-prompt p {
  margin: 0;
  font-size: 13px;
  color: #9ca3af;
  line-height: 1.5;
  text-align: left;
}

/* 官方风格 Steam 登录按钮 */
.btn-steam-login {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
  padding: 14px;
  background: linear-gradient(135deg, #171a21 0%, #2a475e 100%);
  border: 1px solid #66c0f4;
  border-radius: 12px;
  color: #e5e4e2;
  font-size: 16px;
  font-weight: bold;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.btn-steam-login:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 25px rgba(102, 192, 244, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
  border-color: #9ecdf2;
  color: white;
}

.steam-logo {
  color: #66c0f4;
  transition: color 0.3s;
}

.btn-steam-login:hover .steam-logo {
  color: #9ecdf2;
}

/* 装饰分割线 */
.separator-line {
  display: flex;
  align-items: center;
  margin: 10px 0;
  color: rgba(255, 255, 255, 0.2);
  font-size: 13px;
}
.separator-line::before,
.separator-line::after {
  content: "";
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
}
.separator-line span {
  padding: 0 12px;
}

/* 快捷免加速登录表单 */
.quick-login-form {
  text-align: left;
}
.quick-login-desc {
  font-size: 13px;
  color: #9ca3af;
  line-height: 1.5;
  margin-bottom: 12px;
}
.input-group {
  display: flex;
  gap: 10px;
  position: relative;
  z-index: 5;
}
.input-steam-id {
  flex: 1;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 12px 14px;
  color: white;
  font-size: 14px;
  transition: all 0.3s ease;
}
.input-steam-id:focus {
  outline: none;
  border-color: #00f2fe;
  box-shadow: 0 0 8px rgba(0, 242, 254, 0.2);
  background: rgba(15, 23, 42, 0.85);
}
.input-steam-id:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-quick-login {
  background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
  color: #0b0f19;
  border: none;
  padding: 0 20px;
  border-radius: 8px;
  font-weight: bold;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  flex-shrink: 0;
}
.btn-quick-login:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 15px rgba(0, 242, 254, 0.35);
}
.btn-quick-login:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 帮助指导盒子 */
.help-guide-box {
  margin-top: 15px;
  background: rgba(30, 41, 59, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.guide-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.guide-badge {
  background: rgba(0, 242, 254, 0.12);
  color: #00f2fe;
  font-size: 10px;
  font-weight: bold;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
  margin-top: 2px;
}
.guide-item p {
  margin: 0;
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.5;
}
.guide-item p b {
  color: #e2e8f0;
}

/* 搜索结果样式 */
.search-results-list {
  margin-top: 15px;
  max-height: 180px;
  overflow-y: auto;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 5px;
}
.search-user-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.search-user-item:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.08);
}
.search-user-item.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.user-avatar-small {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.user-info-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.user-name-text {
  font-size: 14px;
  color: white;
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-loc-text {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}
.btn-select-text {
  font-size: 12px;
  color: #00f2fe;
  font-weight: bold;
  opacity: 0.8;
  transition: opacity 0.2s;
  flex-shrink: 0;
}
.search-user-item:hover .btn-select-text {
  opacity: 1;
}

.no-results-tip {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 10px;
  text-align: center;
  background: rgba(30, 41, 59, 0.2);
  padding: 10px;
  border-radius: 6px;
}

.spinner-loader {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(11, 15, 25, 0.2);
  border-top-color: #0b0f19;
  border-radius: 50%;
  animation: spin 0.8s infinite linear;
  display: inline-block;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 弹窗遮罩层 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(11, 15, 25, 0.75);
  backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
}

/* 弹窗内容 */
.modal-content {
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  width: 90%;
  max-width: 460px;
  padding: 24px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(16px);
  color: #e2e8f0;
  text-align: left;
}

.animate-modal {
  animation: modalEnter 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes modalEnter {
  from {
    transform: scale(0.9);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.warning-icon {
  font-size: 24px;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: #fff;
  font-weight: bold;
}

.modal-tip-desc {
  font-size: 14px;
  color: #94a3b8;
  margin: 0 0 16px 0;
  line-height: 1.5;
}

/* 加速器提示盒 */
.accelerator-box {
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(0, 242, 254, 0.15);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 20px;
}

.acc-title {
  color: #00f2fe;
  font-size: 13px;
  font-weight: bold;
  margin-bottom: 8px;
}

.acc-text {
  font-size: 12px;
  color: #94a3b8;
  margin: 0 0 8px 0;
  line-height: 1.5;
}

.acc-highlight {
  font-size: 12px;
  color: #e2e8f0;
  margin: 0;
  line-height: 1.5;
}

.acc-highlight b {
  color: #00f2fe;
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
}

/* 复选框美化 */
.checkbox-container {
  display: flex;
  align-items: center;
  position: relative;
  padding-left: 24px;
  cursor: pointer;
  font-size: 13px;
  color: #94a3b8;
  user-select: none;
  transition: color 0.2s;
}

.checkbox-container:hover {
  color: #e2e8f0;
}

.checkbox-container input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  height: 0;
  width: 0;
}

.checkmark {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  height: 16px;
  width: 16px;
  background-color: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  transition: all 0.2s ease;
}

.checkbox-container input:checked ~ .checkmark {
  background-color: #00f2fe;
  border-color: #00f2fe;
}

.checkmark:after {
  content: "";
  position: absolute;
  display: none;
}

.checkbox-container input:checked ~ .checkmark:after {
  display: block;
}

.checkbox-container .checkmark:after {
  left: 5px;
  top: 2px;
  width: 4px;
  height: 8px;
  border: solid #0b0f19;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

/* 我知道了按钮 */
.btn-confirm-login {
  background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
  color: #0b0f19;
  border: none;
  padding: 10px 24px;
  border-radius: 8px;
  font-weight: bold;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-confirm-login:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 15px rgba(0, 242, 254, 0.4);
}

.error-msg {
  color: #ff7675;
  font-size: 12px;
  margin-top: 10px;
  margin-bottom: 0;
  animation: shake 0.3s ease-in-out;
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

/* 隐私提示区 */
.privacy-tip {
  display: flex;
  gap: 12px;
  background: rgba(30, 41, 59, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 15px;
  text-align: left;
  line-height: 1.5;
  width: 100%;
  box-sizing: border-box;
}

.info-icon {
  font-size: 16px;
  flex-shrink: 0;
  margin-top: 1px;
}

.privacy-tip p {
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
}

.privacy-tip a {
  color: #00f2fe;
  text-decoration: none;
  font-weight: bold;
  transition: color 0.2s;
}

.privacy-tip a:hover {
  color: #4facfe;
  text-decoration: underline;
}

.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 2px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.3); }

/* 返回首页按钮样式 */
.btn-back-home {
  position: absolute;
  top: 30px;
  left: 40px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 10px 20px;
  color: #94a3b8;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s ease;
  z-index: 100;
  backdrop-filter: blur(10px);
}
.btn-back-home:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: #00f2fe;
  color: #00f2fe;
  transform: translateX(-2px);
  box-shadow: 0 0 15px rgba(0, 242, 254, 0.2);
}
.back-arrow {
  font-size: 16px;
  transition: transform 0.3s ease;
}
.btn-back-home:hover .back-arrow {
  transform: translateX(-3px);
}
</style>
