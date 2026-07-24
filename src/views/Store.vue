<template>
  <!-- 如果未登录，展示登录提示界面 -->
  <div v-if="!gameStore.steamUser" class="login-require-box">
    <div class="lock-icon">🔒</div>
    <h3>登录以浏览 Steam 游戏商店</h3>
    <p>此页面需要对接 Steam 实时特惠与游戏检索服务。请先登录您的 Steam 账号。</p>
    <router-link to="/login" class="btn-go-login">去登录</router-link>
  </div>

  <div v-else class="store-container">
    <!-- 顶部导航与搜索区 -->
    <div class="store-header">
      <div class="store-title-area">
        <div class="title-with-refresh">
          <h2>🛍️ Steam 游戏商店</h2>
          <button @click="refreshStore" class="btn-refresh" :disabled="loading || refreshLoading || searchLoading" title="刷新特惠游戏">
            <svg class="refresh-svg" :class="{ 'spinning': refreshLoading }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
            刷新
          </button>
        </div>
        <p>探索热销特惠，抢先获取最低折扣价格</p>
      </div>
      <div class="search-box">
        <input 
          type="text" 
          v-model="searchQuery" 
          @keyup.enter="handleSearch"
          placeholder="搜索游戏名称..." 
          class="search-input"
        />
        <button @click="handleSearch" class="btn-search" :disabled="loading || searchLoading || refreshLoading">
          <span v-if="searchLoading" class="search-spinner"></span>
          <span v-else>🔍</span>
          搜索
        </button>
        <button v-if="isSearched" @click="clearSearch" class="btn-clear-search">
          重置
        </button>
      </div>
    </div>

    <!-- 骨架屏加载 -->
    <div v-if="loading && gamesList.length === 0" class="store-loading">
      <div class="loading-spinner"></div>
      <p>正在连接 Steam 商店，获取最新折扣数据...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error && gamesList.length === 0" class="store-error">
      <p>⚠️ {{ error }}</p>
      <button @click="fetchStoreData" class="btn-retry">重新加载</button>
    </div>

    <div v-else class="store-content">
      <!-- 官方大促 Banner 展示区 (仅在未搜索时显示) -->
      <div v-if="!isSearched" class="promo-banner-container" :class="{ 'clickable-banner': bannerAppId }" @click="handleBannerClick">
        <!-- 黑屏亮屏过渡遮罩 -->
        <div class="banner-blackout-overlay" :class="{ 'blackout-active': isBlackScreen }"></div>

        <img v-if="bannerUrl" :key="bannerUrl" :src="bannerUrl" class="promo-banner-img" alt="Steam Sale Banner" />
        <!-- 默认秒级展示 ChronoPlay 精致促销图，不转圈等待 -->
        <div v-else class="promo-banner-default">
          <div class="default-banner-content">
            <h2 class="text-shadow-heading">🎮 CHRONOPLAY STORE 特惠中心</h2>
            <p class="text-shadow-sub">官方打折热销佳作，真实价格实时价格比对与推荐</p>
          </div>
        </div>
      </div>

      <!-- 列表标题 -->
      <div class="section-title">
        <h3>{{ isSearched ? `🔍 搜索结果 (${gamesList.length})` : '🔥 热门大促推荐' }}</h3>
      </div>

      <!-- 游戏卡片网格 -->
      <div v-if="gamesList.length === 0" class="empty-store">
        <p>未找到符合条件的特价游戏商品</p>
      </div>

      <div v-else class="store-grid">
        <div 
          v-for="game in gamesList" 
          :key="game.id" 
          class="store-card"
          @click="goToDetail(game.id)"
        >
          <!-- 封面图 -->
          <div class="game-cover-wrapper">
            <img 
              v-if="!game.coverError" 
              :src="game.cover" 
              class="game-cover-img" 
              alt="Cover" 
              loading="lazy"
              @error="game.coverError = true" 
            />
            <div v-else class="game-cover-fallback">
              <span>🎮 {{ game.name }}</span>
            </div>
            <!-- 折扣标签 -->
            <div v-if="game.discount_percent > 0" class="discount-badge">
              -{{ game.discount_percent }}%
            </div>
          </div>

          <!-- 游戏信息 -->
          <div class="game-details">
            <h4 class="game-title" :title="game.name">{{ game.name }}</h4>
            
            <div class="price-row">
              <div class="prices">
                <span v-if="game.discount_percent > 0" class="original-price">
                  ¥{{ game.original_price }}
                </span>
                <span class="final-price">
                  ¥{{ game.final_price === '0.00' ? '免费' : game.final_price }}
                </span>
              </div>
              
              <!-- 购买 / 详情按钮 -->
              <button class="btn-buy" @click.stop="goToDetail(game.id)">
                购买
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部加载更多指示器 -->
      <div v-if="loadingMore" class="loading-more-box">
        <div class="loading-spinner-small"></div>
        <span>正在加载更多随机折扣游戏...</span>
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

<script>
export default {
  name: 'Store'
}
</script>

<script setup>
import { ref, onMounted, onActivated, onDeactivated } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { useGameStore } from '../store/game'
import request from '../api/request'

const router = useRouter()
const gameStore = useGameStore()
const searchQuery = ref('')
const isSearched = ref(false)
const loading = ref(false)
const loadingMore = ref(false)
const searchLoading = ref(false)
const refreshLoading = ref(false)
const error = ref('')

const bannerUrl = ref('')
const targetLoadingUrl = ref('')
const isBlackScreen = ref(false)
const bannerAppId = ref(null)
const specialsList = ref([])
const gamesList = ref([])
const showBackToTop = ref(false)

const triggerBlackoutTransition = (targetBannerUrl, targetAppId) => {
  if (!targetBannerUrl || targetBannerUrl === bannerUrl.value) {
    if (targetAppId) bannerAppId.value = targetAppId
    return
  }
  
  // 第一步：黑屏（遮罩渐入 100% 黑色）
  isBlackScreen.value = true
  
  // 等待黑屏过渡盖住（350ms）后，在后台黑屏背部静默替换 DOM 与 AppId
  setTimeout(() => {
    bannerUrl.value = targetBannerUrl
    if (targetAppId) {
      bannerAppId.value = targetAppId
    }
    
    // 稍等待 DOM 渲染完（60ms）后，第二步：亮屏（遮罩渐出揭开新图）
    setTimeout(() => {
      isBlackScreen.value = false
    }, 60)
  }, 360)
}

const backgroundLoadBannerAndReplace = (targetBanner, targetAppId) => {
  if (!targetBanner || targetBanner === bannerUrl.value || targetBanner === targetLoadingUrl.value) {
    if (targetAppId && targetBanner === bannerUrl.value) {
      bannerAppId.value = targetAppId
    }
    return
  }
  targetLoadingUrl.value = targetBanner
  const img = new Image()
  img.src = targetBanner
  img.onload = () => {
    // 获取到图片，触发黑屏再亮屏的过渡替换
    triggerBlackoutTransition(targetBanner, targetAppId)
  }
  img.onerror = () => {
    // 获取或加载失败，没有的话就保持默认大促销图的样子，也不进行黑屏亮屏
    console.warn('[Store] 后台获取促销海报失败，保持原有默认展示。')
  }
}

const shuffleArray = (arr) => {
  const newArr = [...arr]
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]]
  }
  return newArr
}

const backgroundRefreshPrices = async (gamesToRefresh, retryCount = 0) => {
  if (!gamesToRefresh || gamesToRefresh.length === 0) return
  const appids = gamesToRefresh.map(g => g.id).join(',')
  try {
    const res = await request.get(`/api/store/refresh-prices?appids=${appids}`)
    if (res.data.code === 200 && res.data.data) {
      const priceMap = {}
      res.data.data.forEach(p => {
        priceMap[p.id] = p
      })

      // 静默替换价格，不造成界面闪烁和重载，仅更新改变的字样
      gamesList.value.forEach(g => {
        const fresh = priceMap[g.id]
        if (fresh) {
          if (g.original_price !== fresh.original_price) {
            g.original_price = fresh.original_price
          }
          if (g.final_price !== fresh.final_price) {
            g.final_price = fresh.final_price
          }
          if (g.discount_percent !== fresh.discount_percent) {
            g.discount_percent = fresh.discount_percent
            g.discounted = fresh.discount_percent > 0
          }
        }
      })
    }
  } catch (err) {
    console.warn(`[Store] 后台刷新价格失败 (尝试 ${retryCount + 1}/3):`, err.message)
    if (retryCount < 2) {
      setTimeout(() => {
        backgroundRefreshPrices(gamesToRefresh, retryCount + 1)
      }, (retryCount + 1) * 1200)
    }
  }
}

const fetchStoreData = async () => {
  loading.value = true
  error.value = ''
  // 首次进入页面立刻让底层显示默认大促销图，绝不阻塞等待
  bannerUrl.value = ''
  targetLoadingUrl.value = ''
  bannerAppId.value = null
  try {
    // 1. 优先读取商店缓存池以实现秒级开屏
    const cacheRes = await request.get('/api/store/cache')
    let cachedGames = []
    if (cacheRes.data.code === 200 && cacheRes.data.data.games && cacheRes.data.data.games.length > 0) {
      cachedGames = cacheRes.data.data.games
      if (cacheRes.data.data.banner) {
        backgroundLoadBannerAndReplace(cacheRes.data.data.banner, cacheRes.data.data.banner_appid)
      }
    } else {
      // 备用：若缓存池未就绪，拉取精选
      const featRes = await request.get('/api/store/featured')
      cachedGames = featRes.data.data.games
      if (featRes.data.data.banner) {
        backgroundLoadBannerAndReplace(featRes.data.data.banner, featRes.data.data.banner_appid)
      }
    }

    // 随机打乱大缓存池，提取前 12 款
    const shuffled = shuffleArray(cachedGames)
    const selected12 = shuffled.slice(0, 12)
    specialsList.value = selected12
    gamesList.value = [...selected12]
    
    loading.value = false // 立即完成加载！

    // 2. 后台静默发起价格同步校验
    backgroundRefreshPrices(selected12)

    // 3. Stale-While-Revalidate (SWR) 海报校验与后台加载预热逻辑
    request.get('/api/store/featured').then(res => {
      if (res.data.code === 200 && res.data.data) {
        const freshBanner = res.data.data.banner
        const freshAppId = res.data.data.banner_appid
        if (freshBanner) {
          backgroundLoadBannerAndReplace(freshBanner, freshAppId)
        } else if (freshAppId && !bannerUrl.value) {
          bannerAppId.value = freshAppId
        }
      }
    }).catch(() => {
      // 报错则保持默认样式，不进行黑屏亮屏
    })
  } catch (err) {
    console.error('获取商店数据异常:', err)
    error.value = '无法载入 Steam 商店折扣，请开启加速器后重试'
    loading.value = false
  }
}

const handleBannerClick = () => {
  if (bannerAppId.value) {
    router.push(`/store/detail/${bannerAppId.value}`)
  }
}

const handleSearch = async () => {
  if (!searchQuery.value.trim()) return
  
  searchLoading.value = true
  error.value = ''
  try {
    const res = await request.get(`/api/store/search?q=${encodeURIComponent(searchQuery.value)}`)
    if (res.data.code === 200) {
      gamesList.value = res.data.data
      isSearched.value = true
    } else {
      error.value = '搜索失败'
    }
  } catch (err) {
    console.error('商店搜索异常:', err)
    error.value = '搜索出错，请稍后重试'
  } finally {
    searchLoading.value = false
  }
}

const clearSearch = () => {
  searchQuery.value = ''
  gamesList.value = specialsList.value
  isSearched.value = false
}

const refreshStore = async () => {
  clearSearch()
  refreshLoading.value = true
  try {
    await fetchStoreData()
  } finally {
    refreshLoading.value = false
  }
}

const goToDetail = (appid) => {
  router.push(`/store/detail/${appid}`)
}

// 加载下一页 12 个随机特惠大作
const loadMoreGames = async () => {
  if (loadingMore.value) return
  loadingMore.value = true
  try {
    const cacheRes = await request.get('/api/store/cache')
    if (cacheRes.data.code === 200 && cacheRes.data.data.games) {
      const cachedGames = cacheRes.data.data.games
      const existingIds = new Set(gamesList.value.map(g => g.id))
      const uniqueNewGames = cachedGames.filter(g => !existingIds.has(g.id))
      
      if (uniqueNewGames.length > 0) {
        const shuffled = shuffleArray(uniqueNewGames)
        const next12 = shuffled.slice(0, 12)
        gamesList.value = [...gamesList.value, ...next12]
        
        // 后台静默拉取这一页 12 个的新价格
        backgroundRefreshPrices(next12)
      } else if (cachedGames.length > 0) {
        // 兜底无限加载：当商品池内所有游戏均已渲染后，开始打乱并循环推荐商品，保证无限加载滚动流畅
        const shuffled = shuffleArray(cachedGames)
        const next12 = shuffled.slice(0, 12)
        gamesList.value = [...gamesList.value, ...next12]
        backgroundRefreshPrices(next12)
      }
    }
  } catch (err) {
    console.error('加载更多随机商店大作异常:', err)
  } finally {
    loadingMore.value = false
  }
}

const scrollToTop = () => {
  const contentArea = document.querySelector('.content-area')
  if (contentArea) {
    contentArea.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }
}

// 记录滚动位置
const savedScrollTop = ref(0)

// 离开路由前，精确捕获并锁定当前的滚动条位置，彻底解决页面切换引起的归零竞争！
onBeforeRouteLeave((to, from) => {
  const contentArea = document.querySelector('.content-area')
  if (contentArea) {
    savedScrollTop.value = contentArea.scrollTop
  }
})

// 监听页面滚动以展示/隐藏回到顶部按钮，并加载更多
const handleScroll = () => {
  const contentArea = document.querySelector('.content-area')
  if (!contentArea) return
  
  showBackToTop.value = contentArea.scrollTop > 200

  if (loading.value || isSearched.value) return // 搜索结果或首次大加载时不触发底部加载
  
  // 滚动条距离底部小于 100 像素，开始加载下一批
  const isNearBottom = contentArea.scrollHeight - contentArea.scrollTop - contentArea.clientHeight < 100
  if (isNearBottom) {
    loadMoreGames()
  }
}

onMounted(() => {
  if (gameStore.steamUser) {
    fetchStoreData()
  }
})

onActivated(() => {
  const contentArea = document.querySelector('.content-area')
  if (contentArea) {
    // 每次进入页面重新监听滚动，避免对其他非缓存路由造成干扰
    contentArea.addEventListener('scroll', handleScroll)
    // 瞬间还原上次滚动高度，实现零卡顿零跳转的无缝续看体验
    contentArea.scrollTop = savedScrollTop.value
  }
  // 如果进入时有登录用户，但之前列表为空，就加载一下
  if (gameStore.steamUser && gamesList.value.length === 0 && !loading.value) {
    fetchStoreData()
  }
})

onDeactivated(() => {
  const contentArea = document.querySelector('.content-area')
  if (contentArea) {
    contentArea.removeEventListener('scroll', handleScroll)
  }
})
</script>

<style scoped>
.store-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 10px 0;
  animation: fadeIn 0.4s ease;
}

/* 顶部导航 */
.store-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
  flex-wrap: wrap;
  gap: 15px;
}
.store-title-area h2 {
  margin: 0 0 6px 0;
  color: #1e293b;
  font-size: 26px;
  font-weight: 800;
}
.store-title-area p {
  margin: 0;
  color: #64748b;
  font-size: 14px;
}

/* 搜索框 */
.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
}
.search-input {
  background: white;
  border: 1px solid #cbd5e1;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  color: #1e293b;
  width: 220px;
  outline: none;
  transition: all 0.3s ease;
}
.search-input:focus {
  border-color: #00f2fe;
  box-shadow: 0 0 0 3px rgba(0, 242, 254, 0.15);
}
.btn-search {
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: bold;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.btn-search:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.25);
}
.btn-search:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.search-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: #ffffff;
  animation: spin 0.8s linear infinite;
  margin-right: 6px;
}
.btn-clear-search {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #475569;
  padding: 9px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
}
.btn-clear-search:hover {
  background: #e2e8f0;
}

/* 加载与错误状态 */
.store-loading, .store-error, .empty-store {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 40px;
  background: rgba(255, 255, 255, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  backdrop-filter: blur(8px);
  text-align: center;
  margin: 30px 0;
}
.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(0, 242, 254, 0.2);
  border-top-color: #00f2fe;
  border-radius: 50%;
  animation: spinPremium 0.8s infinite linear;
  margin-bottom: 16px;
}
@keyframes spinPremium {
  0% { transform: rotate(0deg) scale(1); }
  50% { transform: rotate(180deg) scale(1.15); }
  100% { transform: rotate(360deg) scale(1); }
}
.store-loading p { color: #64748b; font-size: 14px; margin: 0; }
.store-error p { color: #ef4444; font-size: 15px; font-weight: bold; margin-bottom: 16px; }
.btn-retry {
  background: #00f2fe;
  color: #0b0f19;
  border: none;
  padding: 10px 24px;
  border-radius: 8px;
  font-weight: bold;
  font-size: 13px;
  cursor: pointer;
}
.empty-store p { color: #64748b; font-size: 14px; margin: 0; }

/* 促销 Banner */
.promo-banner-container {
  position: relative;
  width: 100%;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 8px 30px rgba(0,0,0,0.12);
  margin-bottom: 30px;
  background: #000;
  display: flex;
  aspect-ratio: 21 / 9;
  max-height: 340px;
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
  border: 1px solid transparent;
}
.promo-banner-container.clickable-banner {
  cursor: pointer;
}
.promo-banner-container.clickable-banner:hover {
  border-color: rgba(0, 242, 254, 0.4);
  box-shadow: 0 12px 35px rgba(0, 242, 254, 0.15);
}
.promo-banner-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s ease;
}
.promo-banner-container:hover .promo-banner-img {
  transform: scale(1.01);
}

.banner-blackout-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #000;
  z-index: 20;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}
.banner-blackout-overlay.blackout-active {
  opacity: 1;
}

.promo-banner-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  color: #94a3b8;
  gap: 12px;
  font-size: 13px;
  box-sizing: border-box;
}

.promo-banner-default {
  width: 100%;
  height: 100%;
  min-height: 200px;
  max-height: 340px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: url('/beijing.png') no-repeat center center;
  background-size: cover;
  color: white;
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 4px 15px rgba(0,0,0,0.05);
}
.default-banner-content h2 {
  font-size: 24px;
  font-weight: 800;
  margin: 0 0 8px 0;
  background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.text-shadow-heading {
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.4), 0 4px 10px rgba(0, 242, 254, 0.2);
}
.default-banner-content p {
  margin: 0;
  font-size: 13px;
  color: #ffffff;
  font-weight: 500;
}
.text-shadow-sub {
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9), 0 0 10px rgba(0, 0, 0, 0.5);
}

.banner-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(59, 130, 246, 0.15);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spinPremium 0.8s infinite linear;
}

/* fade 跨页切换过渡效果 */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* 列表标题 */
.section-title {
  margin-bottom: 20px;
}
.section-title h3 {
  margin: 0;
  font-size: 18px;
  color: #1e293b;
  font-weight: bold;
}

/* 商店卡片网格 */
.store-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 20px;
}
.store-card {
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 15px rgba(0,0,0,0.03);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  cursor: pointer;
  display: flex;
  flex-direction: column;
}
.store-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 25px rgba(0,0,0,0.08);
  border-color: rgba(0, 242, 254, 0.3);
}

.game-cover-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 460 / 215;
  background: #f1f5f9;
  overflow: hidden;
}
.game-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}
.store-card:hover .game-cover-img {
  transform: scale(1.05);
}
.game-cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: url('/beijing1.png') no-repeat center center;
  background-size: cover;
  color: #ffffff;
  text-shadow: 0 1px 4px rgba(0,0,0,0.8);
  font-size: 13px;
  font-weight: bold;
  padding: 12px;
  text-align: center;
  box-sizing: border-box;
}

.discount-badge {
  position: absolute;
  bottom: 8px;
  left: 8px;
  background: #a3d200;
  color: #000;
  font-weight: bold;
  font-size: 13px;
  padding: 3px 6px;
  border-radius: 4px;
}

.game-details {
  padding: 16px;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.game-title {
  margin: 0 0 12px 0;
  font-size: 15px;
  color: #1e293b;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.price-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
}

.prices {
  display: flex;
  flex-direction: column;
}

.original-price {
  font-size: 12px;
  color: #94a3b8;
  text-decoration: line-through;
  margin-bottom: 2px;
}

.final-price {
  font-size: 16px;
  color: #1e293b;
  font-weight: bold;
}

.btn-buy {
  background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
  color: #0b0f19;
  border: none;
  font-weight: bold;
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.btn-buy:hover {
  transform: scale(1.03);
  box-shadow: 0 2px 8px rgba(0, 242, 254, 0.4);
}

/* 底部加载更多样式 */
.loading-more-box {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  margin-top: 30px;
  padding: 20px 0;
  color: #64748b;
  font-size: 14px;
}
.loading-spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(0, 242, 254, 0.2);
  border-top-color: #00f2fe;
  border-radius: 50%;
  animation: spin 0.8s infinite linear;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 标题与刷新按钮对齐 */
.title-with-refresh {
  display: flex;
  align-items: center;
  gap: 12px;
}
.btn-refresh {
  background: rgba(71, 85, 105, 0.04);
  border: 1px solid rgba(71, 85, 105, 0.2);
  color: #475569;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.3s ease;
}
.btn-refresh:hover:not(:disabled) {
  background: #475569;
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(71, 85, 105, 0.25);
  transform: translateY(-1px);
}
.btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.refresh-svg {
  width: 14px;
  height: 14px;
  display: inline-block;
  transition: transform 0.3s ease;
}
.btn-refresh:hover:not(:disabled) .refresh-svg {
  transform: rotate(180deg);
}
.refresh-svg.spinning {
  animation: spinPremium 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
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

/* Vue fade-scale 动画，逐渐放大淡入，逐渐缩小淡出 */
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

/* 登录请求卡片样式（与 List.vue 风格统一） */
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
</style>
