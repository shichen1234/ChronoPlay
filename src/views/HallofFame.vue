<template>
  <!-- 如果未登录，展示登录提示界面 -->
  <div v-if="!gameStore.steamUser" class="login-require-box">
    <div class="lock-icon">🔒</div>
    <h3>登录以查看游戏名人堂</h3>
    <p>此页面需要读取您的 Steam 游戏数据。请先登录您的 Steam 账号。</p>
    <router-link to="/login" class="btn-go-login">去登录</router-link>
  </div>

  <div v-else class="hof-container">
    <div class="hof-top-bar">
      <router-link to="/list" class="btn-back-hof">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="back-icon">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        <span>返回游戏库列表</span>
      </router-link>
    </div>

    <div class="header-text">
      <h2>🏆 个人游戏名人堂</h2>
      <p>数据不会撒谎，这里记录着你倾注心血最多的游戏殿堂。</p>
    </div>

    <div v-if="gameStore.games.length === 0" class="empty-state">
      还没收录游戏呢，快去游戏库添加几款再来看看吧！
    </div>

    <div v-else class="podium-wrapper">
      <div class="podium-container">
        <!-- 亚军 -->
        <div class="podium-item silver" v-if="topGames[1]" @click="goToDetail(topGames[1].id)">
          <div class="game-info">
            <span class="emoji-avatar">
              <img v-if="topGames[1].cover && topGames[1].cover.startsWith('http')" :src="topGames[1].cover" class="img-hof-cover" alt="封面" />
              <span v-else>{{ topGames[1].cover }}</span>
            </span>
            <div class="game-name">{{ topGames[1].name }}</div>
            <div class="play-time">{{ topGames[1].playtime }}</div>
          </div>
          <div class="pillar step-2">
            <span class="rank-num">2</span>
          </div>
        </div>

        <!-- 冠军 -->
        <div class="podium-item gold" v-if="topGames[0]" @click="goToDetail(topGames[0].id)">
          <div class="crown">👑</div>
          <div class="game-info">
            <span class="emoji-avatar">
              <img v-if="topGames[0].cover && topGames[0].cover.startsWith('http')" :src="topGames[0].cover" class="img-hof-cover" alt="封面" />
              <span v-else>{{ topGames[0].cover }}</span>
            </span>
            <div class="game-name">{{ topGames[0].name }}</div>
            <div class="play-time">{{ topGames[0].playtime }}</div>
          </div>
          <div class="pillar step-1">
            <span class="rank-num">1</span>
          </div>
        </div>

        <!-- 季军 -->
        <div class="podium-item bronze" v-if="topGames[2]" @click="goToDetail(topGames[2].id)">
          <div class="game-info">
            <span class="emoji-avatar">
              <img v-if="topGames[2].cover && topGames[2].cover.startsWith('http')" :src="topGames[2].cover" class="img-hof-cover" alt="封面" />
              <span v-else>{{ topGames[2].cover }}</span>
            </span>
            <div class="game-name">{{ topGames[2].name }}</div>
            <div class="play-time">{{ topGames[2].playtime }}</div>
          </div>
          <div class="pillar step-3">
            <span class="rank-num">3</span>
          </div>
        </div>
      </div>

      <div class="honorable-mentions" v-if="topGames.length > 3">
        <h3>✨ 荣誉提名</h3>
        <div class="mention-list">
          <div class="mention-item" v-for="(game, index) in topGames.slice(3)" :key="game.id" @click="goToDetail(game.id)">
            <div class="rank-badge">NO.{{ index + 4 }}</div>
            <div class="mention-emoji">
              <img v-if="game.cover && game.cover.startsWith('http')" :src="game.cover" class="img-mention-cover" alt="封面" />
              <span v-else>{{ game.cover }}</span>
            </div>
            <div class="mention-name">{{ game.name }}</div>
            <div class="mention-time">{{ game.playtime }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 回到顶部浮动按钮 -->
  <transition name="fade-scale">
    <button 
      v-if="showBackToTop" 
      @click="scrollToTop" 
      class="back-to-top"
      title="回到顶部"
    >
      ▲
    </button>
  </transition>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../store/game'

const router = useRouter()
const gameStore = useGameStore()

// 回到顶部逻辑
const showBackToTop = ref(false)
const scrollToTop = () => {
  const contentArea = document.querySelector('.content-area')
  if (contentArea) {
    contentArea.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  } else {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }
}
const handleScroll = () => {
  const contentArea = document.querySelector('.content-area')
  if (contentArea) {
    showBackToTop.value = contentArea.scrollTop > 200
  } else {
    showBackToTop.value = window.scrollY > 200
  }
}

onMounted(() => {
  if (gameStore.games.length === 0) {
    gameStore.fetchGames()
  }
  const contentArea = document.querySelector('.content-area')
  if (contentArea) {
    contentArea.addEventListener('scroll', handleScroll)
  }
  window.addEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  const contentArea = document.querySelector('.content-area')
  if (contentArea) {
    contentArea.removeEventListener('scroll', handleScroll)
  }
  window.removeEventListener('scroll', handleScroll)
})

const goToDetail = (id) => {
  if (id) {
    router.push(`/detail/${id}`)
  }
}

// 按照游玩时长降序排列
const topGames = computed(() => {
  const gamesList = [...gameStore.games]
  
  return gamesList.sort((a, b) => {
    const timeA = parseInt(a.playtime) || 0
    const timeB = parseInt(b.playtime) || 0
    return timeB - timeA
  })
})
</script>

<style scoped>
.hof-top-bar {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  margin-bottom: 20px;
}

.btn-back-hof {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  color: #1e293b;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
  cursor: pointer;
}

.btn-back-hof:hover {
  transform: translateX(-4px);
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(79, 172, 254, 0.4);
  box-shadow: 0 6px 16px rgba(79, 172, 254, 0.15);
  color: #0284c7;
}

.back-icon {
  width: 18px;
  height: 18px;
  transition: transform 0.2s;
}

.btn-back-hof:hover .back-icon {
  transform: translateX(-3px);
}

/* 名人堂主容器 - 移除暗色背景，改回明亮通透的风格 */
.hof-container {
  padding: 40px;
  animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  min-height: calc(100vh - 60px);
  color: #1e293b; /* 基础文字改为暗色 */
  box-sizing: border-box;
  position: relative;
}

.header-text {
  text-align: center;
  margin-bottom: 50px;
  position: relative;
  z-index: 1;
}
.header-text h2 {
  color: #1e293b; /* 标题改为暗色 */
  font-size: 32px;
  font-weight: 800;
  margin-bottom: 12px;
  letter-spacing: 1px;
  display: inline-block;
}
.header-text p {
  color: #64748b; /* 副标题改为暗灰色 */
  font-size: 15px;
  margin: 0;
}

.empty-state {
  text-align: center;
  color: #94a3b8;
  font-size: 16px;
  margin-top: 80px;
  padding: 40px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 12px;
  border: 1px dashed #cbd5e1;
}

/* 领奖台核心布局 */
.podium-wrapper {
  position: relative;
  z-index: 1;
}
.podium-container {
  display: flex;
  justify-content: center;
  align-items: flex-end; /* 底部对齐 */
  gap: 30px;
  margin-bottom: 60px;
  height: 380px;
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.podium-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 160px;
  position: relative;
  animation: slideUp 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
  cursor: pointer;
  transition: transform 0.2s ease;
}

.podium-item:hover {
  transform: translateY(-10px);
}

/* 冠亚季军依次出场的动画延迟 */
.silver { animation-delay: 0.2s; animation-fill-mode: both; }
.gold { animation-delay: 0s; animation-fill-mode: both; z-index: 2; }
.bronze { animation-delay: 0.4s; animation-fill-mode: both; }

.crown {
  font-size: 40px;
  position: absolute;
  top: -50px;
  animation: float 2.5s infinite ease-in-out;
  filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.4));
}

.game-info {
  text-align: center;
  margin-bottom: 15px;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.emoji-avatar {
  width: 120px;
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  overflow: hidden;
  border-radius: 10px;
  transition: transform 0.3s ease;
  background: rgba(0, 0, 0, 0.03);
}

.gold .emoji-avatar {
  border: 2px solid #ffd700;
  box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3);
}
.silver .emoji-avatar {
  border: 2px solid #cbd5e1;
  box-shadow: 0 4px 12px rgba(203, 213, 225, 0.2);
}
.bronze .emoji-avatar {
  border: 2px solid #cd7f32;
  box-shadow: 0 4px 12px rgba(205, 127, 50, 0.2);
}

.img-hof-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.podium-item:hover .img-hof-cover {
  transform: scale(1.08);
}

.game-name {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b; /* 游戏名改为暗色 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  margin-bottom: 4px;
}
.play-time {
  font-size: 13px;
  color: #4facfe; /* 时长保持高亮浅蓝色 */
  font-weight: bold;
}

/* 领奖台柱子 */
.pillar {
  width: 100%;
  border-radius: 14px 14px 0 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 15px;
  box-sizing: border-box;
}

.rank-num {
  font-size: 42px;
  font-weight: 900;
  opacity: 0.65;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
}

/* 柱子高度与霓虹渐变 */
.step-1 {
  height: 160px;
  background: linear-gradient(to bottom, #ffd700, #ffb300);
  box-shadow: 0 8px 20px rgba(255, 215, 0, 0.2), inset 0 2px 10px rgba(255, 255, 255, 0.3);
}
.step-2 {
  height: 110px;
  background: linear-gradient(to bottom, #e0e0e0, #a6b1b9);
  box-shadow: 0 8px 16px rgba(224, 224, 224, 0.15), inset 0 2px 10px rgba(255, 255, 255, 0.3);
}
.step-3 {
  height: 80px;
  background: linear-gradient(to bottom, #cd7f32, #9c5c22);
  box-shadow: 0 8px 16px rgba(205, 127, 50, 0.15), inset 0 2px 10px rgba(255, 255, 255, 0.3);
}

/* 荣誉提名列表 - 通透白色毛玻璃拟态卡片 */
.honorable-mentions {
  background: rgba(255, 255, 255, 0.45);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 20px;
  padding: 35px;
  max-width: 800px;
  margin: 0 auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.04);
}
.honorable-mentions h3 {
  margin: 0 0 25px 0;
  color: #1e293b; /* 标题改为暗色 */
  text-align: center;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.5px;
}

.mention-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mention-item {
  display: flex;
  align-items: center;
  padding: 14px 24px;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.03);
  border-radius: 12px;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  box-sizing: border-box;
  cursor: pointer;
}

.mention-item:hover {
  transform: translateX(8px);
  background: linear-gradient(135deg, rgba(0, 242, 254, 0.05) 0%, rgba(79, 172, 254, 0.05) 100%);
  border-color: rgba(0, 242, 254, 0.25);
  box-shadow: 0 4px 15px rgba(0, 242, 254, 0.08);
}

.rank-badge {
  font-weight: 800;
  color: #94a3b8;
  width: 70px;
  font-size: 13px;
  font-family: monospace;
}

.mention-emoji {
  margin-right: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 40px;
  overflow: hidden;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.03);
}

.img-mention-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mention-name {
  flex: 1;
  font-weight: 700;
  color: #334155; /* 名字改为深灰色 */
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 15px;
}

.mention-time {
  color: #4facfe; /* 游玩时间高亮蓝色 */
  font-weight: 800;
  font-family: 'Outfit', sans-serif;
  font-size: 15px;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideUp {
  0% { opacity: 0; transform: translateY(60px); }
  100% { opacity: 1; transform: translateY(0); }
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

/* 登录请求卡片样式 - 与商店、库存列表统一 */
.login-require-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 40px;
  background: rgba(255, 255, 255, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 20px;
  backdrop-filter: blur(12px);
  text-align: center;
  max-width: 500px;
  margin: 120px auto;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
  animation: fadeIn 0.5s ease;
}
.lock-icon {
  font-size: 50px;
  margin-bottom: 20px;
  animation: hoverLock 3s infinite ease-in-out;
}
@keyframes hoverLock {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
.login-require-box h3 {
  font-size: 22px;
  color: #2c3e50;
  margin: 0 0 12px 0;
  font-weight: bold;
}
.login-require-box p {
  font-size: 14px;
  color: #64748b;
  margin: 0 0 28px 0;
  line-height: 1.6;
}
.btn-go-login {
  background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
  color: #0b0f19;
  font-weight: bold;
  border: none;
  padding: 12px 35px;
  border-radius: 10px;
  font-size: 14px;
  text-decoration: none;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(0, 242, 254, 0.2);
  transition: all 0.3s ease;
}
.btn-go-login:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 242, 254, 0.45);
}

/* 回到顶部浮动按钮 */
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

/* Vue fade-scale 动画 */
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
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
</style>