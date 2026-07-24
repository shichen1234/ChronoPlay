<template>
  <!-- 如果未登录，展示登录提示界面 -->
  <div v-if="!gameStore.steamUser" class="login-require-box">
    <div class="lock-icon">🔒</div>
    <h3>登录以查看游戏详情</h3>
    <p>此页面需要读取您的 Steam 游戏详细数据。请先登录您的 Steam 账号。</p>
    <router-link to="/login" class="btn-go-login">去登录</router-link>
  </div>

  <div v-else-if="game" class="detail-container">
    <div class="detail-header" :style="{ background: game.bg || '#34495e' }">
      <div class="header-content">
        <div class="cover-big">
          <img v-if="game.cover && game.cover.startsWith('http')" :src="game.cover" class="img-cover-detail" alt="游戏封面" />
          <span v-else>{{ game.cover }}</span>
        </div>
        <div class="title-area">
          <h1>{{ game.name }}</h1>
          
          <div class="publisher-info-row" v-if="detailData.publishers && detailData.publishers.length > 0">
            <span class="pub-label">发行商：</span>
            <span 
              class="pub-link" 
              v-for="(pub, idx) in detailData.publishers" 
              :key="pub"
              @click="router.push(`/publisher/${encodeURIComponent(pub)}`)"
            >
              {{ pub }}<template v-if="idx < detailData.publishers.length - 1">, </template>
            </span>
          </div>

          <div class="tags">
            <span class="tag" v-for="tag in game.tags" :key="tag">{{ tag }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="detail-body">
      <div class="info-sidebar">
        <div class="info-item">
          <span class="label">游玩状态</span>
          <span class="value">{{ game.status }}</span>
        </div>
        <div class="info-item">
          <span class="label">累计时长</span>
          <span class="value">{{ game.playtime }}</span>
        </div>
        <div class="info-item" v-if="game.original_price">
          <span class="label">购买价格</span>
          <span class="value">¥{{ game.original_price }}</span>
        </div>
        <div class="info-item">
          <span class="label">数据库ID</span>
          <span class="value">#{{ game.id }}</span>
        </div>
        
        <!-- 前往 Steam 官网的定制按钮样式 -->
        <a 
          v-if="game.appid" 
          :href="`https://store.steampowered.com/app/${game.appid}/`" 
          target="_blank" 
          rel="noopener" 
          class="btn-steam-store"
        >
          前往 Steam 官网 ↗
        </a>

        <button @click="router.back()" class="btn-back">⬅ 返回列表</button>
      </div>

      <div class="main-content">
        <h3>关于这款游戏</h3>
        
        <!-- 如果加载成功了 Steam 商店里的富文本 HTML 介绍，则渲染它；否则渲染默认本地简介 -->
        <div v-if="detailData.aboutHtml" class="description-html" v-html="detailData.aboutHtml"></div>
        <p v-else class="description">{{ game.desc }}</p>
        
        <hr class="divider" />

        <!-- 官方成就展柜 -->
        <div class="achievements-section">
          <h3>🏆 玩家成就展柜</h3>
          
          <div v-if="detailLoading" class="ach-loading">
            <svg class="sync-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
            正在从 Steam 服务器同步您的成就进度与图标...
          </div>
          
          <div v-else-if="detailData.achievements && detailData.achievements.length > 0" class="achievements-grid">
            <div 
              class="achievement-item" 
              v-for="ach in detailData.achievements" 
              :key="ach.name"
              :class="{ 'locked': !ach.achieved }"
            >
              <div class="ach-icon-container">
                <img 
                  :src="ach.achieved ? ach.icon : (ach.icongray || ach.icon)" 
                  class="ach-icon" 
                  alt="成就图标"
                  :class="{ 'gray-filter': !ach.achieved }"
                />
              </div>
              <div class="ach-info">
                <div class="ach-title">
                  <h4>{{ ach.name }}</h4>
                  <span class="ach-status-badge" :class="ach.achieved ? 'unlocked' : 'locked'">
                    {{ ach.achieved ? '已解锁' : '未解锁' }}
                  </span>
                </div>
                <p class="ach-desc">{{ ach.desc }}</p>
                <span v-if="ach.achieved && ach.unlockTime" class="ach-time">
                  解锁于: {{ ach.unlockTime }}
                </span>
              </div>
            </div>
          </div>
          
          <div v-else class="placeholder-box">
            暂无本游戏的成就数据（可能此游戏不支持成就，或您未公开游戏详情）
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <div v-else class="loading-fallback">
    <div v-if="gameStore.games && gameStore.games.length > 0 && !gameStore.games.some(g => String(g.id) === String(route.params.id))" class="missing-game-box">
      <div class="missing-icon">🎮</div>
      <h3>该游戏不在您的个人 Steam 库中</h3>
      <p>我们在您已同步的 Steam 个人库档案中未找到 ID 为 <code>{{ route.params.id }}</code> 的游戏。您可直接前往【商店专区】查看该游戏的现价、史低折扣及图表详情：</p>
      <div class="missing-actions">
        <button @click="router.push(`/store/detail/${route.params.id}`)" class="btn-go-store">
          🛍️ 前往商店专区查看详情 →
        </button>
        <button @click="router.back()" class="btn-back-prev">
          ← 返回上一层
        </button>
      </div>
    </div>
    <div v-else class="normal-loading">
      正在加载游戏档案... 或者游戏不存在。
      <button @click="router.back()" class="btn-back-prev" style="margin-top: 16px;">返回上一层</button>
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
import { useRoute, useRouter } from 'vue-router'
import { useGameStore } from '../store/game'
import request from '../api/request'

const route = useRoute()
const router = useRouter()
const gameStore = useGameStore()

const detailLoading = ref(true)
const detailData = ref({
  aboutHtml: '',
  shortDesc: '',
  achievements: [],
  publishers: [],
  developers: []
})

// 回到顶部逻辑
const showBackToTop = ref(false)
const scrollToTop = () => {
  const contentArea = document.querySelector('.content-area')
  if (contentArea) {
    contentArea.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }
}
const handleScroll = () => {
  const contentArea = document.querySelector('.content-area')
  if (contentArea) {
    showBackToTop.value = contentArea.scrollTop > 200
  }
}

// 确保刷新页面时如果有数据丢失，重新拉取一次游戏列表
onMounted(async () => {
  if (gameStore.games.length === 0) {
    await gameStore.fetchGames()
  }
  
  await fetchAdvancedDetail()

  // 监听内容区滚动
  const contentArea = document.querySelector('.content-area')
  if (contentArea) {
    contentArea.addEventListener('scroll', handleScroll)
  }
})

onUnmounted(() => {
  const contentArea = document.querySelector('.content-area')
  if (contentArea) {
    contentArea.removeEventListener('scroll', handleScroll)
  }
})

const game = computed(() => {
  const routeId = route.params.id
  return gameStore.games.find(g => g.id.toString() === routeId.toString())
})

// 获取游戏的商店介绍与玩家成就
const fetchAdvancedDetail = async () => {
  if (!game.value || !game.value.appid) {
    detailLoading.value = false
    return
  }
  
  try {
    detailLoading.value = true
    const res = await request.get(`/api/games/detail/${game.value.appid}`)
    if (res.data.code === 200) {
      detailData.value = res.data.data
    }
  } catch (err) {
    console.error('获取游戏高级详情及成就失败:', err)
  } finally {
    detailLoading.value = false
  }
}
</script>

<style scoped>
.detail-container { padding: 20px; animation: fadeIn 0.5s ease; }
.detail-header {
  border-radius: 12px;
  padding: 40px;
  color: white;
  margin-bottom: 20px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.1);
}
.header-content { display: flex; align-items: center; gap: 30px; }
.cover-big { font-size: 80px; filter: drop-shadow(0 5px 10px rgba(0,0,0,0.4)); display: flex; align-items: center; justify-content: center; }

.img-cover-detail {
  max-width: 280px;
  height: 130px;
  object-fit: cover;
  border-radius: 8px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
}

.title-area h1 { margin: 0 0 10px 0; font-size: 36px; text-shadow: 1px 1px 3px rgba(0,0,0,0.3); color: #ffffff; }
.tags { display: flex; gap: 10px; }
.tag { background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; font-size: 14px; backdrop-filter: blur(5px); color: #ffffff; }

.detail-body { display: flex; gap: 20px; }
@media (max-width: 900px) { .detail-body { flex-direction: column; } }

.info-sidebar { flex: 1; background: white; padding: 20px; border-radius: 12px; height: fit-content; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.info-item { display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding: 12px 0; }
.info-item .label { color: #7f8c8d; }
.info-item .value { font-weight: bold; color: #2c3e50; }

/* 前往 Steam 官网的定制按钮样式 (官方深蓝配色) */
.btn-steam-store {
  display: block;
  width: 100%;
  margin-top: 20px;
  padding: 11px;
  background: linear-gradient(135deg, #171a21 0%, #2a475e 100%);
  border: 1px solid #66c0f4;
  border-radius: 6px;
  text-align: center;
  color: #66c0f4;
  font-weight: bold;
  text-decoration: none;
  font-size: 14px;
  box-sizing: border-box;
  transition: all 0.3s ease;
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

.btn-steam-store:hover {
  border-color: #9ecdf2;
  color: #ffffff;
  box-shadow: 0 0 12px rgba(102, 192, 244, 0.4);
  transform: translateY(-1px);
}

.btn-back { width: 100%; margin-top: 12px; padding: 10px; background: #ecf0f1; border: none; border-radius: 6px; cursor: pointer; color: #34495e; font-weight: bold; }
.btn-back:hover { background: #bdc3c7; }

.main-content { flex: 3; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.description { line-height: 1.8; color: #444; font-size: 16px; margin-bottom: 40px; }

.divider {
  border: 0;
  height: 1px;
  background: #e2e8f0;
  margin: 30px 0;
}

/* 渲染 Steam 富文本介绍的相关限制与优化样式 */
.description-html {
  line-height: 1.8;
  color: #334155;
  font-size: 15px;
  margin-bottom: 20px;
}
.description-html :deep(p) {
  margin-bottom: 14px;
}
.description-html :deep(h2), .description-html :deep(h3) {
  font-size: 18px;
  color: #1e293b;
  margin-top: 25px;
  margin-bottom: 12px;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 6px;
}

/* 确保富文本介绍内的所有多媒体资源、表格及排版元素在任何情况下都不会溢出 */
.description-html :deep(img),
.description-html :deep(video),
.description-html :deep(iframe),
.description-html :deep(table),
.description-html :deep(p),
.description-html :deep(div),
.description-html :deep(.game_area_description_fieldimg) {
  max-width: 100% !important;
  height: auto !important;
  box-sizing: border-box !important;
}

/* 保证表格及嵌套结构自适应，不会被内容撑大 */
.description-html :deep(table) {
  width: 100% !important;
  table-layout: fixed !important;
}

/* 成就板块样式 */
.achievements-section h3 {
  margin: 0 0 20px 0;
  color: #1e293b;
  font-size: 20px;
}
.ach-loading {
  padding: 40px;
  text-align: center;
  color: #64748b;
  font-size: 14px;
}
.sync-spinner {
  width: 14px;
  height: 14px;
  display: inline-block;
  vertical-align: middle;
  margin-right: 6px;
  animation: spinPremium 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
@keyframes spinPremium {
  0% {
    transform: rotate(0deg) scale(1);
  }
  50% {
    transform: rotate(180deg) scale(1.2);
  }
  100% {
    transform: rotate(360deg) scale(1);
  }
}

.achievements-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-top: 15px;
}

.achievement-item {
  display: flex;
  gap: 15px;
  padding: 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}
.achievement-item.locked {
  opacity: 0.65;
  background: #f1f5f9;
  border-color: #cbd5e1;
}
.achievement-item:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
  border-color: #94a3b8;
}

.ach-icon-container {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  background: #e2e8f0;
}
.ach-icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.gray-filter {
  filter: grayscale(100%);
}

.ach-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex-grow: 1;
  min-width: 0;
}

.ach-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 5px;
  gap: 8px;
}
.ach-title h4 {
  margin: 0;
  font-size: 15px;
  color: #0f172a;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ach-status-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: bold;
  flex-shrink: 0;
}
.ach-status-badge.unlocked {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}
.ach-status-badge.locked {
  background: #e2e8f0;
  color: #64748b;
}

.ach-desc {
  margin: 0 0 6px 0;
  font-size: 12px;
  color: #475569;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ach-time {
  font-size: 10px;
  color: #94a3b8;
}

.placeholder-box {
  background: #f8fafc;
  border: 2px dashed #cbd5e1;
  padding: 30px;
  text-align: center;
  color: #64748b;
  border-radius: 12px;
}
.loading { padding: 50px; text-align: center; color: #94a3b8; }
.loading-fallback {
  padding: 60px 20px;
  display: flex;
  justify-content: center;
}
.missing-game-box {
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  padding: 40px;
  max-width: 550px;
  text-align: center;
  border: 1px solid #e2e8f0;
}
.missing-icon {
  font-size: 54px;
  margin-bottom: 16px;
}
.missing-game-box h3 {
  font-size: 22px;
  color: #1e293b;
  margin-bottom: 12px;
}
.missing-game-box p {
  color: #64748b;
  font-size: 14px;
  line-height: 1.6;
  margin-bottom: 24px;
}
.missing-actions {
  display: flex;
  gap: 14px;
  justify-content: center;
  flex-wrap: wrap;
}
.btn-go-store {
  padding: 12px 24px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
  transition: transform 0.2s, box-shadow 0.2s;
}
.btn-go-store:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35);
}
.btn-back-prev {
  padding: 12px 24px;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-back-prev:hover {
  background: #e2e8f0;
}
.normal-loading {
  text-align: center;
  color: #94a3b8;
  padding: 40px;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 登录请求卡片样式 */
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

.publisher-info-row {
  margin-top: -4px;
  margin-bottom: 12px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
}
.pub-link {
  color: #66c0f4;
  text-decoration: underline;
  cursor: pointer;
  font-weight: 500;
  transition: color 0.2s ease;
}
.pub-link:hover {
  color: #a3dcf9;
}
</style>