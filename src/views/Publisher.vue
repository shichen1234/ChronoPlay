<template>
  <div class="store-detail-container">
    <!-- 飘浮手柄背景特效 -->
    <div class="gamepads-bg-container">
      <div 
        v-for="pad in gamepads" 
        :key="pad.id" 
        class="floating-gamepad"
        :style="{
          left: pad.left,
          top: pad.top,
          fontSize: pad.fontSize,
          animationDuration: pad.duration,
          animationDelay: pad.delay,
          opacity: pad.opacity
        }"
      >
        🎮
      </div>
    </div>

    <!-- 发行商头部区域 -->
    <div class="detail-header">
      <div class="header-content">
        <div class="publisher-logo-container" v-if="avatarUrl">
          <img :src="avatarUrl" class="publisher-avatar" alt="厂商头像" />
        </div>
        <div class="publisher-logo-icon" v-else>🏢</div>
        <div class="title-area">
          <h1 class="game-title-row">
            <span class="game-name-text">{{ publisherName }}</span>
          </h1>
          <p class="publisher-subtitle">Steam 认证游戏发行商 / 开发商</p>
        </div>
      </div>
    </div>

    <!-- 主体布局 -->
    <div class="detail-body">
      <!-- 侧边栏 -->
      <div class="info-sidebar">
        <div class="card-info">
          <h3>🏢 厂商档案</h3>
          <ul class="info-list">
            <li>
              <span class="label">厂商名称:</span>
              <span class="val">{{ publisherName }}</span>
            </li>
            <li>
              <span class="label">收录游戏:</span>
              <span class="val">{{ games.length }} 款</span>
            </li>
            <li>
              <span class="label">服务平台:</span>
              <span class="val">Steam</span>
            </li>
          </ul>
          
          <button @click="router.back()" class="btn-back-action">
            ⬅ 返回上一页
          </button>
        </div>
      </div>

      <!-- 右侧游戏列表 -->
      <div class="main-content-wrapper">
        <div class="publisher-games-header">
          <h3>🎮 旗下发行/开发的游戏</h3>
        </div>

        <div v-if="loading" class="publisher-loading">
          <div class="spinner"></div>
          <p>正在获取该厂商在 Steam 旗下的所有游戏列表...</p>
        </div>

        <div v-else-if="games.length === 0" class="publisher-empty">
          <p>⚠️ 未找到该厂商在 Steam 平台的公开游戏数据。</p>
        </div>

        <div v-else class="games-list-vertical">
          <div 
            v-for="game in games" 
            :key="game.id" 
            class="game-list-row"
            @click="navigateToGame(game.id)"
          >
            <!-- 封面图及已拥有角标 -->
            <div class="row-cover">
              <img :src="game.cover" class="img-cover" alt="游戏封面" />
              <span v-if="game.isOwned" class="badge-owned">已收录库</span>
            </div>
            
            <!-- 文字介绍 -->
            <div class="row-content">
              <div class="row-main-info">
                <h4 class="game-title" :title="game.name">{{ game.name }}</h4>
                <p class="game-desc">{{ game.desc }}</p>
              </div>
              
              <!-- 价格及折扣 -->
              <div class="row-price-info">
                <div class="discount-wrapper" v-if="game.price.discount_percent > 0">
                  <span class="badge-discount">-{{ game.price.discount_percent }}%</span>
                </div>
                <div class="price-wrapper">
                  <span class="game-price">
                    {{ game.price.is_free ? '免费' : `¥${game.price.final}` }}
                  </span>
                  <span v-if="game.price.discount_percent > 0" class="original-price">
                    ¥{{ game.price.original }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 回到顶部浮动按钮 -->
    <transition name="fade-scale">
      <button v-if="showBackToTop" @click="scrollToTop" class="back-to-top" title="回到顶部">
        ▲
      </button>
    </transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, onActivated, onDeactivated, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../store/game'
import request from '../api/request'

const route = useRoute()
const router = useRouter()
const gameStore = useGameStore()

const showBackToTop = ref(false)

const handleScroll = (e) => {
  const target = e.target
  if (target) {
    showBackToTop.value = target.scrollTop > 400
  }
}

const scrollToTop = () => {
  const contentArea = document.querySelector('.content-area')
  if (contentArea) {
    contentArea.scrollTo({ top: 0, behavior: 'smooth' })
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

const publisherName = computed(() => decodeURIComponent(route.params.name))
const loading = ref(true)
const games = ref([])
const avatarUrl = ref(null)

// 背景手柄飘浮动画数据
const gamepads = ref([])
const initGamepads = () => {
  const arr = []
  for (let i = 0; i < 15; i++) {
    arr.push({
      id: i,
      left: Math.random() * 90 + 5 + '%',
      top: Math.random() * 85 + 5 + '%',
      fontSize: Math.random() * 24 + 16 + 'px',
      duration: Math.random() * 12 + 8 + 's',
      delay: Math.random() * -10 + 's',
      opacity: Math.random() * 0.08 + 0.03
    })
  }
  gamepads.value = arr
}

const fetchPublisherGames = async () => {
  loading.value = true
  try {
    const res = await request.get(`/api/publisher/${encodeURIComponent(route.params.name)}/games`)
    if (res.data.code === 200) {
      games.value = res.data.data
      avatarUrl.value = res.data.avatar
    }
  } catch (err) {
    console.error('获取发行商游戏列表失败:', err)
  } finally {
    loading.value = false
  }
}

// 智能跳转：若已在本地库中则去本地库详情页，否则去商店详情页
const navigateToGame = (gameId) => {
  const isOwned = gameStore.games.some(g => g.appid.toString() === gameId.toString())
  if (isOwned) {
    const libGame = gameStore.games.find(g => g.appid.toString() === gameId.toString())
    router.push(`/detail/${libGame.id}`)
  } else {
    router.push(`/store/detail/${gameId}`)
  }
}

onMounted(async () => {
  initGamepads()
  if (gameStore.games.length === 0) {
    await gameStore.fetchGames()
  }
  fetchPublisherGames()
  const contentArea = document.querySelector('.content-area')
  if (contentArea) {
    contentArea.addEventListener('scroll', handleScroll)
  }
})

onActivated(() => {
  const contentArea = document.querySelector('.content-area')
  if (contentArea) {
    contentArea.addEventListener('scroll', handleScroll)
  }
})

onDeactivated(() => {
  const contentArea = document.querySelector('.content-area')
  if (contentArea) {
    contentArea.removeEventListener('scroll', handleScroll)
  }
})

onUnmounted(() => {
  const contentArea = document.querySelector('.content-area')
  if (contentArea) {
    contentArea.removeEventListener('scroll', handleScroll)
  }
})
</script>

<style scoped>
.store-detail-container {
  max-width: 100%;
  margin: 0;
  padding: 0 0 40px 0;
  background-color: #0b0f19;
  position: relative;
  min-height: 100%;
  z-index: 1;
  color: #e2e8f0;
  font-family: "SF Pro Text", "SF Pro Display", "Inter", system-ui, -apple-system, sans-serif;
}

.gamepads-bg-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.floating-gamepad {
  position: absolute;
  color: rgba(255, 255, 255, 0.85);
  pointer-events: none;
  user-select: none;
  animation-name: floatUp;
  animation-iteration-count: infinite;
  animation-timing-function: linear;
  z-index: 0;
}

@keyframes floatUp {
  0% {
    transform: translateY(100px) rotate(0deg);
  }
  100% {
    transform: translateY(-1200px) rotate(360deg);
  }
}

.detail-header {
  border-radius: 0;
  padding: 50px 40px;
  color: white;
  margin-bottom: 30px;
  background: linear-gradient(135deg, #111827 0%, #1f2937 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.header-content {
  display: flex;
  align-items: center;
  gap: 30px;
}

.publisher-logo-container {
  width: 80px;
  height: 80px;
  border-radius: 12px;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
  background: rgba(15, 23, 42, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.publisher-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.publisher-logo-icon {
  font-size: 70px;
  filter: drop-shadow(0 5px 15px rgba(0, 0, 0, 0.5));
  display: flex;
  align-items: center;
  justify-content: center;
}

.game-title-row {
  margin: 0 0 8px 0;
  font-size: 38px;
  font-weight: 800;
  text-shadow: 0 4px 10px rgba(0,0,0,0.5);
  background: linear-gradient(to right, #ffffff, #94a3b8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.publisher-subtitle {
  margin: 0;
  font-size: 16px;
  color: #94a3b8;
  font-weight: 500;
}

.detail-body {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 30px;
  padding: 0 40px;
  box-sizing: border-box;
  z-index: 2;
  position: relative;
}

@media (max-width: 900px) {
  .detail-body {
    grid-template-columns: 1fr;
    padding: 0 20px;
  }
}

.card-info {
  background: rgba(15, 23, 42, 0.25) !important;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  color: #e2e8f0 !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3) !important;
  border-radius: 16px;
  padding: 24px;
  box-sizing: border-box;
}

.info-sidebar h3 {
  margin: 0 0 20px 0;
  font-size: 16px;
  color: #ffffff !important;
  font-weight: bold;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 10px;
}

.info-list {
  list-style: none;
  padding: 0;
  margin: 0 0 24px 0;
}

.info-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 14px;
}

.info-list li:last-child {
  border-bottom: none;
}

.info-list .label {
  color: #94a3b8;
}

.info-list .val {
  font-weight: 600;
  color: #ffffff;
}

.btn-back-action {
  width: 100%;
  padding: 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #ffffff;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-back-action:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}

.main-content-wrapper {
  background: rgba(15, 23, 42, 0.15);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 30px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.publisher-games-header h3 {
  margin: 0 0 24px 0;
  font-size: 20px;
  color: #ffffff;
  font-weight: bold;
}

.publisher-loading, .publisher-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  text-align: center;
  color: #94a3b8;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255, 255, 255, 0.1);
  border-left-color: #66c0f4;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.games-list-vertical {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.game-list-row {
  display: flex;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  height: 110px; /* 强行规定每行高度一致 */
  box-sizing: border-box;
}

.game-list-row:hover {
  transform: translateX(4px);
  border-color: rgba(102, 192, 244, 0.4);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 12px rgba(102, 192, 244, 0.1);
}

.row-cover {
  width: 200px;
  min-width: 200px;
  height: 100%;
  position: relative;
  background: #111827;
  overflow: hidden;
}

.img-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s ease;
}

.game-list-row:hover .img-cover {
  transform: scale(1.04);
}

.row-content {
  display: flex;
  flex: 1;
  padding: 12px 20px;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  box-sizing: border-box;
  overflow: hidden;
}

.row-main-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  height: 100%;
  justify-content: center;
}

.game-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #f1f5f9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.game-desc {
  margin: 6px 0 0 0;
  font-size: 13px;
  color: #94a3b8;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2; /* 限制介绍文字在两行 */
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  height: 38px;
}

.row-price-info {
  display: flex;
  align-items: center;
  gap: 15px;
  min-width: 140px;
  justify-content: flex-end;
}

.price-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.game-price {
  font-size: 16px;
  font-weight: 700;
  color: #ffffff;
}

.original-price {
  font-size: 12px;
  color: #64748b;
  text-decoration: line-through;
}

.badge-owned {
  position: absolute;
  top: 6px;
  left: 6px;
  background: linear-gradient(135deg, #10b981, #059669);
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: bold;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

.badge-discount {
  background: #a3d200;
  color: #111827;
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
}

/* 回到顶部浮动按钮及过度动画 */
.back-to-top {
  position: fixed;
  bottom: 30px;
  right: 40px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
  color: #0b0f19;
  border: none;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 15px rgba(0, 242, 254, 0.4);
  z-index: 999;
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.back-to-top:hover {
  transform: translateY(-3px) scale(1.08);
  box-shadow: 0 6px 20px rgba(0, 242, 254, 0.6);
}
.back-to-top:active {
  transform: scale(0.95);
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0);
}
.fade-scale-enter-to,
.fade-scale-leave-from {
  opacity: 1;
  transform: scale(1);
}
</style>
