<template>
  <div class="home-view">
    <!-- Cinematic Fullscreen Slider Root -->
    <div class="slider-root" :class="{ 'no-transitions': isFirstRender }" v-if="sliderItems.length > 0">
      
      <!-- Top HUD Floating Panel -->
      <div class="hud-top-panel">
        <div class="hud-user-info" v-if="gameStore.steamUser" @click="router.push('/profile')">
          <img :src="gameStore.steamUser.avatar || '/head.jpg'" class="hud-avatar" alt="avatar" />
          <div class="hud-user-details">
            <span class="hud-username">{{ gameStore.steamUser.personaname }}</span>
            <span class="hud-status-dot online"></span>
          </div>
        </div>
        <div class="hud-user-info guest" v-else @click="router.push('/login')">
          <span class="hud-avatar-fallback">👤</span>
          <div class="hud-user-details">
            <span class="hud-username">关联 Steam 账号</span>
          </div>
        </div>

        <div class="hud-stats-card" v-if="gameStore.steamUser">
          <div class="hud-stat-item">
            <span class="hud-stat-val">{{ gameStore.games.length }}</span>
            <span class="hud-stat-lbl">游戏库</span>
          </div>
          <div class="hud-stat-item">
            <span class="hud-stat-val">{{ playingCount }}</span>
            <span class="hud-stat-lbl">在玩</span>
          </div>
        </div>
      </div>

      <!-- Main Slider Gallery -->
      <div class="gallery">
        <div class="track">
          <div 
            class="item" 
            v-for="(item, index) in sliderItems" 
            :key="item.id"
            :data-active="String(index === activeIndex)"
          >
            <!-- Background Slide -->
            <div class="slide" :style="{ '--offset': getOffset(item.id) }">
              <img :src="item.heroSrc || item.src" @error="handleHeroImgError($event, item.gameId)" :alt="item.title" class="image" loading="lazy" />
              
              <!-- Thumbnail Click Overlay -->
              <button 
                v-if="index !== activeIndex" 
                type="button" 
                class="thumbButton"
                @click="goToIndex(index)"
              >
                <span class="visually-hidden">Show {{ item.title }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Left Rail Content -->
      <div class="rail" v-if="sliderItems[activeIndex]">
        <div class="content" :key="sliderItems[activeIndex].id">
          <p class="kicker">
            {{ String(activeIndex + 1).padStart(2, '0') }} / {{ String(sliderItems.length).padStart(2, '0') }} &bull; {{ sliderItems[activeIndex].kicker }}
          </p>
          <h2 class="title">{{ sliderItems[activeIndex].title }}</h2>
          <p class="description">{{ sliderItems[activeIndex].description }}</p>
        </div>

        <div class="controls-row">
          <!-- Action Buttons -->
          <div class="action-buttons">
            <router-link :to="getZonePath(sliderItems[activeIndex].gameId)" class="btn-action">
              🎮 进入专区
            </router-link>
            <router-link to="/store" class="btn-action secondary">
              🛍️ 浏览商店
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../store/game'
import request from '../api/request'

const gameStore = useGameStore()
const router = useRouter()
const isFirstRender = ref(true)

const handleHeroImgError = (e, appid) => {
  if (e && e.target) {
    if (e.target.src && e.target.src.includes('library_hero.jpg')) {
      e.target.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/page_bg_generated_v6b.jpg`
    } else if (e.target.src && e.target.src.includes('page_bg_generated_v6b.jpg')) {
      e.target.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`
    }
  }
}

const getZonePath = (gameId) => {
  if (gameStore.games && gameStore.games.some(g => String(g.id) === String(gameId))) {
    return `/detail/${gameId}`
  }
  return `/store/detail/${gameId}`
}

const summaryData = ref({
  recentGames: [],
  recentAchievements: [],
  recentActivities: []
})
const loadingSummary = ref(false)

// 首页轮播数据生成
const sliderItems = computed(() => {
  const list = []
  
  // 2. 热门游戏及常见佳作后备与词库，涵盖极佳画质的大作与独立神作
  const popularCandidates = [
    { id: 2358720, name: '黑神话：悟空', desc: '中国首款真正意义上的 3A 巨作。重走西游路，用铁棒与千般神通踏碎凌霄枷锁。' },
    { id: 2379780, name: 'Balatro (小丑牌)', desc: '颠覆性的扑克肉鸽神作。发掘绝妙的小丑牌与小行星契约，点燃无尽牌桌连锁狂欢。' },
    { id: 3240220, name: 'Grand Theft Auto V 增强版', desc: '全新画面升级再临洛圣都。在追逐自由与财富的冒险中体验光线追踪与超凡真实感。' },
    { id: 1245620, name: '艾尔登法环', desc: '在交界地的高深迷雾中寻找艾尔登之兽，开启黄金树与幽影之地的古老宿命。' },
    { id: 1091500, name: '赛博朋克 2077', desc: '夜之城永不消逝。化身传奇雇佣兵 V，在霓虹与铬金的虚无中寻找灵魂救赎。' },
    { id: 1174180, name: '荒野大镖客：救赎 2', desc: '范德林德帮的日落赞歌。在西部蛮荒时代的终结中，追寻良知与真正的救赎。' },
    { id: 1086940, name: '博德之门 3', desc: '荣获年度最佳 RPG 桂冠。在剑湾的奇异冒险中，与同伴揭开脑中幼体背后的阴谋。' },
    { id: 292030, name: '巫师 3：狂猎', desc: '白狼杰洛特的终章旅途。在战火纷飞的北方领域，跨越时空寻找白霜预言之子。' },
    { id: 814380, name: '只狼：影逝二度', desc: '面对独臂之狼的严酷试炼。于生死瞬间拼刀铿锵，破断敌阵求取龙胤还乡。' },
    { id: 1599340, name: '失落方舟 (Lost Ark)', desc: '在广袤的亚克拉西亚大陆开启顶尖俯视角动作冒险，寻找传说中的方舟碎片。' },
    { id: 2050650, name: '生化危机 4：重制版', desc: '生存恐怖的巅峰蜕变。化身特工里昂进入诡秘村庄，在压迫恐惧中完成终极搜救。' },
    { id: 1446780, name: '怪物猎人：崛起', desc: '翔虫飞跃，狩猎无界！在神火村面对百龙夜行，斩杀怨虎龙体验极致狩猎动作。' },
    { id: 1868140, name: '潜水员戴夫 (DAVE THE DIVER)', desc: '白昼潜入神异的蓝洞捕鱼探秘，夜晚经营火爆的寿司餐馆，充满无限欢乐与惊奇。' },
    { id: 1384160, name: '双人成行 (It Takes Two)', desc: '专门为双人打造的纯粹冒险。在奇思妙想的世界中携手闯关，修复破碎的情感纽带。' },
    { id: 1145360, name: '黑帝斯 (Hades)', desc: '奥林匹斯众神重装加持。扮演冥界王子一次次杀出地狱，在爽快砍杀中探索宏大叙事。' },
    { id: 632360, name: '雨中冒险 2 (Risk of Rain 2)', desc: '由经典 2D 华丽重塑为 3D 肉鸽战场。在未知异星尽情刷宝，迎战海量疯狂怪物。' },
    { id: 367520, name: '空洞骑士 (Hollow Knight)', desc: '游历庞大深邃的虫之王国。在手绘风格的地下废墟中磨砺剑术，探寻被遗忘的秘密。' },
    { id: 1250410, name: '微软飞行模拟', desc: '驾驶逼真细腻的各类飞行器，穿梭在由真实气象数据构建的实时地球高空。' },
    { id: 105600, name: '泰拉瑞亚 (Terraria)', desc: '挖矿、战斗、探索、建造！在这个生机勃勃的沙盒世界中尽情发挥无尽创造力。' },
    { id: 252490, name: 'Rust (腐蚀)', desc: '在残酷的荒岛战场上生存。从手搓砍石器到建造钢铁堡垒，与全部玩家激烈角逐。' },
    { id: 730, name: 'Counter-Strike 2', desc: '经典硬核战术射击竞技巅峰。在全新引擎加持下体验极致射击手感与瞬息万变的战场。' },
    { id: 570, name: 'Dota 2', desc: '全球顶尖 MOBA 竞技盛宴。操控百位独一无二的英雄，在遗迹之战中展现战术智慧与团队配合。' },
    { id: 1172470, name: 'Apex Legends', desc: '快节奏小队战术大逃杀。选择拥有特殊技能的传奇角色，在激烈科幻战场中争夺最终荣耀。' }
  ]

  // 1. 如果用户已登录，且有近期游玩记录，载入游玩过的游戏并赋予差异化文案
  const recent = summaryData.value.recentGames || []
  recent.forEach((g, idx) => {
    const candidateMatch = popularCandidates.find(c => String(c.id) === String(g.id))
    
    let descText = ''
    if (candidateMatch && candidateMatch.desc) {
      descText = `⏱️ 累计游玩时间: ${g.playtime || '0小时'} | ${candidateMatch.desc}`
    } else {
      const templates = [
        `⏱️ 累计游玩时间: ${g.playtime || '0小时'}。您近期投入热情与心血最多的一部王牌之作，在《${g.name}》的世界中继续书写传奇历程。`,
        `⏱️ 累计游玩时间: ${g.playtime || '0小时'}。属于您的精彩征程渐入佳境，无论面临何种关卡考验，点进专区即可查看您的全维度成就。`,
        `⏱️ 累计游玩时间: ${g.playtime || '0小时'}。记录了您诸多高光操作与沉浸时光的压箱佳作，随时等待着您重返战场再创辉煌。`,
        `⏱️ 累计游玩时间: ${g.playtime || '0小时'}。游戏库中备受青睐的核心收藏，点击即可探索深入的历史折线图与专区特约资讯。`
      ]
      descText = templates[idx % templates.length]
    }

    const kickers = ['LIBRARY FAVORITE', 'FEATURED ADVENTURE', 'ACTIVE COLLECTION', 'MEMORABLE JOURNEY']
    const kickerText = kickers[idx % kickers.length]

    list.push({
      id: `recent_${g.id}`,
      gameId: g.id,
      heroSrc: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.id}/library_hero.jpg`,
      src: g.cover || `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.id}/header.jpg`,
      title: g.name,
      kicker: kickerText,
      description: descText
    })
  })

  for (const candidate of popularCandidates) {
    if (list.length >= 7) break
    if (list.some(item => String(item.gameId) === String(candidate.id))) continue
    list.push({
      id: `popular_${candidate.id}`,
      gameId: candidate.id,
      heroSrc: `https://cdn.cloudflare.steamstatic.com/steam/apps/${candidate.id}/library_hero.jpg`,
      src: `https://cdn.cloudflare.steamstatic.com/steam/apps/${candidate.id}/header.jpg`,
      title: candidate.name,
      kicker: 'FEATURED HIT',
      description: candidate.desc
    })
  }

  return list
})

// 轮播索引与队列状态管理
const activeIndex = ref(0)
const thumbOrder = ref([])

const initSlider = () => {
  if (sliderItems.value.length > 0) {
    activeIndex.value = 0
    thumbOrder.value = sliderItems.value.slice(1).map(item => item.id)
  }
}

watch(() => sliderItems.value, () => {
  initSlider()
}, { immediate: true, deep: true })

const getOffset = (id) => {
  const index = thumbOrder.value.indexOf(id)
  if (index === -1) return 0
  return index - (thumbOrder.value.length - 1) / 2
}

const indexOfId = (id) => {
  return sliderItems.value.findIndex(item => item.id === id)
}

const autoplayTimer = ref(null)

const startAutoplay = () => {
  stopAutoplay()
  autoplayTimer.value = setInterval(() => {
    if (sliderItems.value.length > 1 && thumbOrder.value.length > 0) {
      const nextIndex = indexOfId(thumbOrder.value[0])
      if (nextIndex !== -1) {
        goToIndex(nextIndex)
      }
    }
  }, 5000)
}

const stopAutoplay = () => {
  if (autoplayTimer.value) {
    clearInterval(autoplayTimer.value)
    autoplayTimer.value = null
  }
}

const goToIndex = (newIndex) => {
  const oldIndex = activeIndex.value
  if (oldIndex === newIndex) return

  const oldId = sliderItems.value[oldIndex].id
  const newId = sliderItems.value[newIndex].id

  thumbOrder.value = [
    ...thumbOrder.value.filter(id => id !== newId),
    oldId
  ]
  activeIndex.value = newIndex
  
  // 重启计时，以避免刚手动切完马上又自动切
  startAutoplay()
}

// 数据加载与同步
const loadCache = () => {
  try {
    const cached = localStorage.getItem('dashboard_summary_cache')
    if (cached) {
      summaryData.value = JSON.parse(cached)
    }
  } catch (e) {
    console.warn('获取本地首页缓存失败:', e)
  }
}

const fetchSummary = async () => {
  try {
    loadingSummary.value = true
    const res = await request.get('/api/user/dashboard-summary', { timeout: 15000 })
    if (res.data.code === 200) {
      const newData = res.data.data
      if (JSON.stringify(summaryData.value) !== JSON.stringify(newData)) {
        summaryData.value = newData
      }
      localStorage.setItem('dashboard_summary_cache', JSON.stringify(newData))
    }
  } catch (err) {
    console.error('获取首页仪表盘数据异常:', err)
  } finally {
    loadingSummary.value = false
  }
}

onMounted(() => {
  loadCache()
  if (gameStore.games.length === 0) {
    gameStore.fetchGames().then(() => {
      fetchSummary()
    })
  } else {
    fetchSummary()
  }
  setTimeout(() => {
    isFirstRender.value = false
  }, 100)
  startAutoplay()
})

onUnmounted(() => {
  stopAutoplay()
})

const playingCount = computed(() => gameStore.games.filter(g => g.status === '正在游玩').length)
</script>

<style scoped>
/* Layout root matches the template */
.home-view {
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background-color: #0b0b0f;
  color: #ffffff;
  font-family: "SF Pro Text", "SF Pro Display", "Inter", system-ui, -apple-system, sans-serif;
}

.slider-root {
  --thumb-scale: 0.12;
  --thumb-gap: 16px;
  --thumb-bottom: 36px;
  --zoom-duration: 0.8s;
  --zoom-ease: cubic-bezier(0.22, 1, 0.36, 1);
  
  width: 100%;
  height: 100%;
  position: relative;
  background: #0b0b0f;
}

@media (max-width: 640px) {
  .slider-root {
    --thumb-scale: 0.18;
    --thumb-gap: 10px;
    --thumb-bottom: 24px;
  }
}

.gallery {
  height: 100%;
}

.track {
  height: 100%;
  overflow: visible !important;
}

.item {
  inset: 0 !important;
  margin: 0 !important;
  pointer-events: none !important;
  position: absolute !important;
  transform: none !important;
  width: auto !important;
}

.item[data-active="true"] {
  z-index: 1 !important;
}

.item[data-active="true"] .slide::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 30% 50%, rgba(11, 11, 15, 0.08) 0%, rgba(11, 11, 15, 0.35) 100%), linear-gradient(0deg, rgba(11, 11, 15, 0.15) 0%, transparent 40%);
  pointer-events: none;
  z-index: 2;
}

.item[data-active="false"] {
  z-index: 10 !important;
}

.slide {
  border-radius: 0;
  inset: 0;
  overflow: hidden;
  pointer-events: auto;
  position: absolute;
  transform: translate(0, 0) scale(1);
  transition:
    transform var(--zoom-duration) var(--zoom-ease),
    border-radius var(--zoom-duration) var(--zoom-ease),
    filter 0.25s ease;
  will-change: transform;
}

.no-transitions .slide {
  transition: none !important;
}

.item[data-active="false"] .slide {
  border-radius: 20px;
  filter: brightness(0.6) grayscale(0.2);
  transform: translate(
      calc(var(--offset) * (var(--thumb-scale) * 100vw + var(--thumb-gap))),
      calc((50vh - var(--thumb-scale) * 50vh) - var(--thumb-bottom))
    )
    scale(var(--thumb-scale));
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
}

.item[data-active="false"] .slide:hover {
  filter: brightness(0.95);
  transform: translate(
      calc(var(--offset) * (var(--thumb-scale) * 100vw + var(--thumb-gap))),
      calc((50vh - var(--thumb-scale) * 50vh) - var(--thumb-bottom) - 8px)
    )
    scale(calc(var(--thumb-scale) * 1.05));
}

.image {
  display: block;
  height: 100%;
  object-fit: cover;
  width: 100%;
}

.thumbButton {
  appearance: none;
  background: none;
  border: 0;
  cursor: pointer;
  inset: 0;
  padding: 0;
  position: absolute;
}

/* Floating top HUD styling */
.hud-top-panel {
  position: absolute;
  top: 30px;
  right: 40px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 20px;
  pointer-events: auto;
}

.hud-user-info {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(11, 11, 15, 0.55);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 8px 16px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.3s, border-color 0.3s;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
}
.hud-user-info:hover {
  background: rgba(11, 11, 15, 0.75);
  border-color: rgba(255, 255, 255, 0.15);
}
.hud-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}
.hud-avatar-fallback {
  font-size: 18px;
}
.hud-user-details {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hud-username {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
}
.hud-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.hud-status-dot.online {
  background-color: #2ecc71;
  box-shadow: 0 0 8px #2ecc71;
}

.hud-stats-card {
  display: flex;
  gap: 20px;
  background: rgba(11, 11, 15, 0.55);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 8px 24px;
  border-radius: 999px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
}
.hud-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.hud-stat-val {
  font-size: 16px;
  font-weight: 700;
  color: #2997ff;
}
.hud-stat-lbl {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Left Rail & Content */
.rail {
  align-items: flex-start;
  background: none;
  backdrop-filter: none;
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
  inset: 0 auto 0 0;
  justify-content: center;
  width: 50%;
  max-width: 600px;
  padding: 0 4rem 0 3.5rem;
  pointer-events: none;
  position: absolute;
  z-index: 5;
}

@media (max-width: 640px) {
  .rail {
    width: 100%;
    max-width: 100%;
    padding: 0 1.5rem;
    justify-content: flex-start;
    padding-top: 120px;
    background: none;
    backdrop-filter: none;
  }
}

.content {
  animation: content-in 0.6s var(--zoom-ease) calc(var(--zoom-duration) * 0.4) backwards;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

@keyframes content-in {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
}

.kicker {
  font-size: 0.85rem;
  font-weight: 600;
  margin: 0;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #2997ff;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
}

.title {
  font-size: clamp(2.2rem, 4.5vw, 3.8rem);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.02em;
  margin: 0;
  color: #ffffff;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.9), 0 4px 30px rgba(0, 0, 0, 0.7);
}

.description {
  color: rgba(255, 255, 255, 0.9);
  font-size: clamp(0.95rem, 1.4vw, 1.1rem);
  line-height: 1.6;
  margin: 0;
  max-width: 480px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.9);
}

.controls-row {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  pointer-events: auto;
}

.action-buttons {
  display: flex;
  gap: 12px;
}
.btn-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: #0066cc; /* Action Blue */
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  padding: 12px 28px;
  border-radius: 999px;
  text-decoration: none;
  transition: background-color 0.2s, transform 0.2s;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
}
.btn-action:hover {
  background-color: #0077ee;
  transform: translateY(-2px);
}
.btn-action.secondary {
  background-color: rgba(11, 11, 15, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #ffffff;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}
.btn-action.secondary:hover {
  background-color: rgba(11, 11, 15, 0.85);
  border-color: rgba(255, 255, 255, 0.25);
}


.visually-hidden {
  border: 0;
  clip: rect(0 0 0 0);
  height: 1px;
  margin: -1px;
  overflow: hidden;
  padding: 0;
  position: absolute;
  width: 1px;
}
</style>
