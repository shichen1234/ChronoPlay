<template>
  <!-- 1. 加载状态 -->
  <div v-if="loading" class="store-detail-loading">
    <div class="spinner"></div>
    <p>正在获取该游戏在 Steam 的最新销售配置与媒体资源...</p>
  </div>

  <!-- 2. 错误状态 -->
  <div v-else-if="!game" class="store-detail-error">
    <p>⚠️ 获取游戏详细档案失败。可能由于网络波动或该游戏已下架。</p>
    <button @click="router.back()" class="btn-back-err">返回商店</button>
  </div>

  <!-- 3. 游戏详情主视图 -->
  <div class="store-detail-container" v-else>
    <!-- 手柄背景容器：限制所有向上飘出的手柄，不允许它们逸出主黑色容器之外 -->
    <div class="gamepads-bg-container">
      <!-- 多个大小不同的游戏手柄图标，均匀分布在整个黑色区域内做轻柔浮动 -->
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

    <!-- 顶部 Banner 区域 -->
    <div class="detail-header" :style="{ background: `linear-gradient(to bottom, rgba(15, 23, 42, 0.15), rgba(15, 23, 42, 0.45)), url(${game.bg || game.cover}) center/cover no-repeat` }">
      <div class="header-content">
        <div class="cover-big">
          <img :src="game.cover" class="img-cover-detail" draggable="false" alt="游戏封面" />
        </div>
        
        <div class="title-area">
          <h1 class="game-title-row">
            <span class="game-name-text">{{ game.name }}</span>
            <span v-if="reviewsSummary && reviewsSummary.totalReviews > 0" class="game-rating-badge" :class="getRatingClass(reviewsSummary.reviewScoreDesc)">
              {{ reviewsSummary.reviewScoreDesc }}（{{ reviewsSummary.totalReviews }}）
            </span>
          </h1>

          <div class="publisher-info-row" v-if="game.publishers && game.publishers.length > 0">
            <span class="pub-label">发行商：</span>
            <span 
              class="pub-link" 
              v-for="(pub, idx) in game.publishers" 
              :key="pub"
              @click="router.push(`/publisher/${encodeURIComponent(pub)}`)"
            >
              {{ pub }}<template v-if="idx < game.publishers.length - 1">, </template>
            </span>
          </div>
          
          <!-- 价格与购买区块 -->
          <div class="store-buy-box">
            <div class="price-display">
              <span v-if="game.price.discount_percent > 0" class="discount-tag">
                -{{ game.price.discount_percent }}%
              </span>
              <div class="price-details">
                <span v-if="game.price.discount_percent > 0" class="original-price">
                  原价: ¥{{ game.price.original }}
                </span>
                <span class="final-price">
                  现价: ¥{{ game.price.is_free ? '免费' : game.price.final }}
                </span>
              </div>
            </div>
            
            <button @click="buyOnSteam(game.id)" class="btn-buy-action">
              🛒 在 Steam 购买
            </button>

            <!-- 历史最低价格展示区 -->
            <div class="buy-box-divider" v-if="!game.fullgame && (priceHistory || historyLoading)"></div>
            
            <div class="lowest-price-box lowest-price-loading" v-if="!game.fullgame && historyLoading && !priceHistory">
              <div class="spinner-small"></div>
              <div class="loading-lowest-text">⏳ 正在查询 Supabase 史低走势...</div>
            </div>
            <div class="lowest-price-box" v-else-if="!game.fullgame && priceHistory" @click="openHistoryModal">
              <div class="lowest-title">📊 历史最低走势 (1年统计)</div>
              <div class="lowest-price-val">¥{{ priceHistory.lowestPrice }}</div>
              <div class="lowest-price-date">
                出现于: {{ priceHistory.lowestDate }}
                <span class="days-ago">({{ priceHistory.daysAgo }}天前)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 详情主内容区域 -->
    <div class="detail-body">
      <div class="info-sidebar">
        <div class="card-info">
          <h3>🎮 游戏基本信息</h3>
          <ul class="info-list">
            <li>
              <span class="label">数据库ID:</span>
              <span class="val">{{ game.id }}</span>
            </li>
            <li>
              <span class="label">平台:</span>
              <span class="val">Steam</span>
            </li>
            <li>
              <span class="label">售价:</span>
              <span class="val highlight-price">¥{{ game.price.is_free ? '免费' : game.price.final }}</span>
            </li>
            <li v-if="!game.fullgame && priceHistory">
              <span class="label">史低价格:</span>
              <span class="val lowest-highlight" @click="openHistoryModal" style="cursor: pointer; color: #10b981; font-weight: 700; text-decoration: underline;" title="点击查看历史变动走势图">
                ¥{{ priceHistory.lowestPrice }}
              </span>
            </li>
            <li v-if="!game.fullgame && priceHistory">
              <span class="label">史低日期:</span>
              <span class="val" style="font-size: 13px; color: #94a3b8;">{{ priceHistory.lowestDate }}</span>
            </li>
          </ul>
          
          <button @click="router.back()" class="btn-back">
            ← 返回商店
          </button>
        </div>

        <!-- 创意工坊区块 -->
        <div class="card-info workshop-card" v-if="game && !game.fullgame && game.has_workshop">
          <h3 class="workshop-header-row">
            <span>🔧 创意工坊</span>
            <span v-if="workshopTotal > 0" class="workshop-total">共 {{ workshopTotal }} 项</span>
          </h3>
          <div class="workshop-search-row">
            <input 
              v-model="workshopSearchQuery" 
              @keyup.enter="searchWorkshop" 
              type="text" 
              placeholder="搜索创意工坊..." 
              class="workshop-search-input" 
            />
            <button @click="searchWorkshop" class="btn-ws-search">搜索</button>
          </div>
          
          <div v-if="workshopLoading" class="reviews-loading">
            <div class="spinner-small"></div>
            <span>正在加载创意工坊...</span>
          </div>
          
          <div v-else-if="workshopItems.length === 0" class="no-reviews text-center">
            <p style="margin-bottom: 12px; font-size: 13px; color: #94a3b8;">暂无推荐项目或连接超时</p>
            <button @click="openWorkshopHub" class="btn-ws-hub-fallback">
              直接前往官方工坊 →
            </button>
          </div>
          
          <div v-else class="workshop-list">
            <div v-for="item in workshopItems" :key="item.id" class="workshop-item" @click="openWorkshopItem(item.id)" title="点击在浏览器中查看此项目">
              <img v-if="item.preview" :src="item.preview" class="ws-preview" alt="preview" />
              <div class="ws-info">
                <span class="ws-title" :title="item.title">{{ item.title }}</span>
                <span class="ws-subs">📥 {{ formatNumber(item.subscriptions) }} 订阅</span>
              </div>
            </div>
          </div>
          
          <div class="workshop-pagination" v-if="workshopItems.length > 0">
            <button class="btn-ws-page" :disabled="workshopPage <= 1 || workshopLoading" @click="loadWorkshopPrev">◀ 上一页</button>
            <span class="ws-page-num">第 {{ workshopPage }} 页</span>
            <button class="btn-ws-page" :disabled="!workshopNextCursor || workshopNextCursor === '*' || workshopLoading" @click="loadWorkshopNext">下一页 ▶</button>
          </div>
          
          <button v-if="workshopItems.length > 0" @click="openWorkshopHub" class="btn-ws-hub-bottom">
            🌐 打开 Steam 工坊主页
          </button>
        </div>

        <!-- 追加内容 (DLC) / 基础原版游戏展示区块 -->
        <div class="card-info dlc-card" v-if="(game.dlc && game.dlc.length > 0) || game.fullgame">
          <h3 v-if="game.fullgame">⬅️ 基础/原版游戏</h3>
          <h3 v-else>➕ 游戏追加内容 (DLC)</h3>
          
          <!-- 如果是 DLC，显示返回原版游戏入口 -->
          <div v-if="game.fullgame" class="dlc-item parent-game" @click="goToStoreDetail(game.fullgame.id)">
            <img v-if="!game.fullgame.coverError" :src="game.fullgame.cover" class="dlc-cover" alt="parent cover" @error="game.fullgame.coverError = true" />
            <div v-else class="dlc-cover dlc-cover-fallback">🎮</div>
            <div class="dlc-info">
              <span class="dlc-name" :title="game.fullgame.name">{{ game.fullgame.name }}</span>
              <span class="dlc-price-tag">返回主游戏</span>
            </div>
          </div>
          
          <!-- 如果是原版游戏，显示其 DLC 列表 -->
          <div v-else class="dlc-list-box">
            <div v-for="dlc in game.dlc" :key="dlc.id" class="dlc-item" @click="goToStoreDetail(dlc.id)">
              <img v-if="!dlc.coverError" :src="dlc.cover" class="dlc-cover" alt="dlc cover" @error="dlc.coverError = true" />
              <div v-else class="dlc-cover dlc-cover-fallback">🎮</div>
              <div class="dlc-info">
                <span class="dlc-name" :title="dlc.name">{{ dlc.name }}</span>
                <span class="dlc-price-tag">¥{{ dlc.price === '0.00' ? '免费' : dlc.price }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 玩家评测展示区块 (移入侧边栏，置于 DLC 块下方) -->
        <div class="card-info reviews-card">
          <h3 class="reviews-header-row">
            <span>👥 玩家评测</span>
            <span v-if="reviewsSummary && reviewsSummary.totalReviews > 0" class="btn-view-all-reviews" @click="openAllReviewsModal">
              查看全部 &gt;&gt;
            </span>
          </h3>
          <div v-if="reviewsLoading" class="reviews-loading">
            <div class="spinner-small"></div>
            <span>正在获取玩家评价...</span>
          </div>
          <div v-else-if="!reviews || reviews.length === 0" class="no-reviews">
            <p>暂无相关中文评测或获取评测失败。</p>
          </div>
          <div v-else class="reviews-list">
            <div v-for="rev in reviews" :key="rev.recommendationId" class="review-item">
              <div class="review-author">
                <img :src="rev.authorAvatar || 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/default_avatar.jpg'" class="author-avatar" alt="avatar" />
                <div class="author-meta">
                  <span class="author-name" :title="rev.authorName">{{ rev.authorName }}</span>
                  <span class="playtime">时长: {{ (((rev.playtimeAtReview || rev.playtimeForever) / 60) || 0).toFixed(1) }} 小时</span>
                </div>
                <div class="review-recommendation" :class="{ 'recommend-up': rev.votedUp, 'recommend-down': !rev.votedUp }">
                  <span class="recommend-icon">{{ rev.votedUp ? '👍' : '👎' }}</span>
                </div>
              </div>
              <div class="review-content">
                <p>{{ rev.review }}</p>
              </div>
              <div class="review-date">
                发布于: {{ new Date(rev.timestampCreated * 1000).toLocaleDateString('zh-CN') }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="main-desc">
        <!-- 游戏截图展示区 (视频已被删除，以保障网络稳定性) -->
        <div 
          v-if="game.screenshots && game.screenshots.length > 0" 
          class="media-gallery-section"
        >
          <h3>🎬 游戏实机截图介绍</h3>
          
          <!-- 滚动视图区 -->
          <div 
            ref="mediaScrollRef" 
            @scroll="syncScrollToSlider" 
            class="media-scroll-container custom-scrollbar"
          >
            <!-- 展示游戏截图 (支持点击放大查看，绑定 @load 自动更新滚动轨道范围，防卡顿防裂图) -->
            <div v-for="(img, idx) in game.screenshots" :key="'img-' + idx" class="media-item img-item" @click="zoomImgIndex = idx">
              <img :src="img" class="media-img clickable-zoom" draggable="false" @load="calculateMaxScroll" alt="Gameplay screenshot" />
            </div>
          </div>

          <!-- 媒体区底部拖拽滚动控制条 (去除了多余文字小提示) -->
          <div class="gallery-slider-bar-wrapper" v-if="maxScroll > 0">
            <input 
              type="range" 
              min="0" 
              :max="maxScroll" 
              v-model="scrollValue" 
              @input="syncSliderToScroll" 
              class="gallery-slider-range"
            />
          </div>
        </div>

        <div class="about-section card-info">
          <h3>关于这款游戏</h3>
          <div class="short-desc" v-if="game.short_description">
            <p>{{ game.short_description }}</p>
          </div>
          <!-- 富文本简介 -->
          <div class="about-html-content" v-html="game.about_the_game"></div>
        </div>

        <!-- 系统配置需求展示区 -->
        <div v-if="game.pc_requirements" class="requirements-section card-info">
          <h3>💻 系统需求</h3>
          <div class="req-grid">
            <div v-if="game.pc_requirements.minimum" class="req-item" v-html="game.pc_requirements.minimum"></div>
            <div v-if="game.pc_requirements.recommended" class="req-item" v-html="game.pc_requirements.recommended"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 图片点击放大查看弹窗 ( lightbox，支持左右键/箭头切换，不能拖动图片 ) -->
  <div v-if="game && zoomImgIndex !== -1" class="lightbox-overlay" @click="zoomImgIndex = -1">
    <div class="lightbox-content" @click.stop>
      <!-- 左切换箭头 -->
      <button class="btn-lightbox-nav btn-lightbox-prev" @click="prevZoomImg" title="上一张">◀</button>
      
      <img 
        :src="game.screenshots[zoomImgIndex]" 
        class="lightbox-img" 
        draggable="false" 
        alt="Zoomed View" 
      />
      
      <!-- 右切换箭头 -->
      <button class="btn-lightbox-nav btn-lightbox-next" @click="nextZoomImg" title="下一张">▶</button>
      
      <button class="btn-close-lightbox" @click="zoomImgIndex = -1">✕</button>
    </div>
  </div>

  <!-- 回到顶部浮动按钮 (动态淡入淡出缩放特效，平滑微弹过渡) -->
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

  <!-- 全屏/大窗玩家评测详情弹窗 -->
  <div v-if="showReviewsModal" class="lightbox-overlay modal-overlay" @click="closeAllReviewsModal">
    <div class="modal-content reviews-modal-container" @click.stop>
      <div class="modal-header">
        <div class="modal-title-box">
          <h2>👥 {{ game ? game.name : '游戏' }} - 玩家评测</h2>
          <span class="rating-info" v-if="reviewsSummary">
            Steam 评价: {{ reviewsSummary.reviewScoreDesc }}（共 {{ reviewsSummary.totalReviews }} 条评测）
          </span>
        </div>
        <button class="btn-close-modal" @click="closeAllReviewsModal">✕</button>
      </div>

      <div class="modal-body custom-scrollbar">
        <div v-if="modalLoading" class="modal-loading-state">
          <div class="spinner"></div>
          <p>正在获取评测数据...</p>
        </div>
        <div v-else-if="modalReviews.length === 0" class="modal-empty-state">
          <p>暂无更多中文评测数据。</p>
        </div>
        <div v-else class="modal-reviews-list">
          <div v-for="rev in modalReviews" :key="rev.recommendationId" class="modal-review-item">
            <div class="review-author">
              <img :src="rev.authorAvatar || 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/default_avatar.jpg'" class="author-avatar" alt="avatar" />
              <div class="author-meta">
                <span class="author-name" :title="rev.authorName">{{ rev.authorName }}</span>
                <span class="playtime">游戏时间: {{ (((rev.playtimeAtReview || rev.playtimeForever) / 60) || 0).toFixed(1) }} 小时</span>
              </div>
              <div class="review-recommendation" :class="{ 'recommend-up': rev.votedUp, 'recommend-down': !rev.votedUp }">
                <span class="recommend-icon">{{ rev.votedUp ? '👍 推荐' : '👎 不推荐' }}</span>
              </div>
            </div>
            <div class="review-content">
              <p>{{ rev.review }}</p>
            </div>
            <div class="review-date">
              发布于: {{ new Date(rev.timestampCreated * 1000).toLocaleDateString('zh-CN') }}
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer" v-if="modalReviews.length > 0">
        <button class="btn-page-nav" :disabled="currentPage === 1 || modalLoading" @click="goToPrevPage">
          ◀ 上一页
        </button>
        <span class="page-indicator">第 {{ currentPage }} 页</span>
        <button class="btn-page-nav" :disabled="!nextCursorStr || nextCursorStr === '*' || modalLoading" @click="goToNextPage">
          下一页 ▶
        </button>
      </div>
    </div>
  </div>

  <!-- 历史价格趋势弹窗 (小黑盒风格) -->
  <div v-if="showHistoryModal && priceHistory" class="lightbox-overlay modal-overlay" @click="showHistoryModal = false">
    <div class="modal-content price-history-modal-container" @click.stop>
      <div class="modal-header">
        <div class="modal-title-box">
          <h2>📊 价格趋势 - {{ game ? game.name : '游戏' }}</h2>
          <span class="rating-info">
            数据源: {{ priceHistory && priceHistory.source === 'supabase' ? 'ITAD 史低及走势实时变动池' : 'SteamDB 模拟接口' }}
          </span>
        </div>
        
        <!-- 时间跨度切换 -->
        <div class="time-range-selectors">
          <button 
            v-for="range in [{id:'3m', label:'3个月'}, {id:'6m', label:'6个月'}, {id:'12m', label:'12个月'}]" 
            :key="range.id"
            class="btn-range"
            :style="{ background: 'transparent' }"
            :class="{ active: historyTimeRange === range.id }"
            @click="historyTimeRange = range.id"
          >
            {{ range.label }}
          </button>
        </div>
        
        <button class="btn-close-modal" @click="showHistoryModal = false">✕</button>
      </div>

      <div class="modal-body custom-scrollbar">
        <!-- SVG 图表区 -->
        <div class="chart-container">
          <svg 
            ref="chartSvgRef"
            :width="svgWidth"
            :height="svgHeight"
            @mousemove="handleMouseMove"
            @mouseleave="handleMouseLeave"
            class="history-svg-chart"
          >
            <!-- 渐变填充背景 -->
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#00f2fe" stop-opacity="0.25" />
                <stop offset="100%" stop-color="#00f2fe" stop-opacity="0.00" />
              </linearGradient>
            </defs>

            <!-- 横向网格线 & Y轴刻度 -->
            <g class="grid-lines">
              <line 
                v-for="tick in yTicks" 
                :key="'line-'+tick.val"
                x1="50" 
                :y1="tick.y" 
                :x2="svgWidth - 20" 
                :y2="tick.y" 
                stroke="rgba(255, 255, 255, 0.08)"
                stroke-dasharray="3,3"
              />
              <text 
                v-for="tick in yTicks" 
                :key="'text-'+tick.val"
                x="40" 
                :y="tick.y + 4" 
                fill="#94a3b8" 
                font-size="11" 
                text-anchor="end"
              >
                {{ tick.val }}
              </text>
            </g>

            <!-- 纵向网格线 & X轴刻度 -->
            <g class="x-grid-lines">
              <line 
                v-for="tick in xTicks" 
                :key="'xline-'+tick.label"
                :x1="tick.x" 
                y1="20" 
                :x2="tick.x" 
                :y2="svgHeight - paddingBottom" 
                stroke="rgba(255, 255, 255, 0.04)"
              />
              <text 
                v-for="tick in xTicks" 
                :key="'xtext-'+tick.label"
                :x="tick.x" 
                :y="svgHeight - paddingBottom + 18" 
                fill="#94a3b8" 
                font-size="11" 
                text-anchor="middle"
              >
                {{ tick.label }}
              </text>
            </g>

            <!-- 阴影填充区域 -->
            <path :d="areaPath" fill="url(#areaGrad)" />

            <!-- 折线路径 -->
            <path :d="linePath" fill="none" stroke="#00f2fe" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

            <!-- 史低点特殊高亮圈圈 -->
            <g v-if="computedPoints.length > 0">
              <circle 
                v-for="(pt, idx) in computedPoints.filter(p => p.price <= parseFloat(priceHistory.lowestPrice) + 0.01)"
                :key="'low-'+idx"
                :cx="pt.x"
                :cy="pt.y"
                r="4.5"
                fill="#a3d200"
                stroke="#171a21"
                stroke-width="1.5"
              />
            </g>

            <!-- Hover 时的辅助虚线与交叉点 -->
            <g v-if="activeHoveredPoint">
              <line 
                :x1="activeHoveredPoint.x" 
                y1="20" 
                :x2="activeHoveredPoint.x" 
                :y2="svgHeight - paddingBottom" 
                stroke="rgba(0, 242, 254, 0.4)" 
                stroke-width="1"
                stroke-dasharray="4,4"
              />
              <circle 
                :cx="activeHoveredPoint.x" 
                :cy="activeHoveredPoint.y" 
                r="6" 
                fill="#00f2fe" 
                stroke="#0b0f19" 
                stroke-width="2" 
              />
            </g>
          </svg>

          <!-- Hover 浮动 Tooltip -->
          <div 
            v-if="activeHoveredPoint" 
            class="chart-tooltip"
            :style="{ 
              left: (activeHoveredPoint.x > svgWidth * 0.65 ? (activeHoveredPoint.x - 130) : (activeHoveredPoint.x + 10)) + 'px', 
              top: (activeHoveredPoint.y - 45) + 'px' 
            }"
          >
            <div class="tooltip-date">{{ activeHoveredPoint.date }}</div>
            <div class="tooltip-price">价格: <span class="val">¥{{ activeHoveredPoint.price }}</span></div>
            <div class="tooltip-discount" v-if="activeHoveredPoint.discount > 0">折扣: <span class="val">-{{ activeHoveredPoint.discount }}%</span></div>
          </div>
        </div>
      </div>

      <div class="modal-footer price-history-footer" :style="{ display: 'flex', gap: '30px', justifyContent: 'flex-start', flexWrap: 'wrap' }">
        <div class="summary-item">
          <span class="lbl">史低价格</span>
          <span class="val green-text">CNY {{ priceHistory.lowestPrice }}</span>
        </div>
        <div class="summary-item">
          <span class="lbl">出现时间</span>
          <span class="val">{{ priceHistory.lowestDate }} <span class="days-ago" style="font-size:12px;color:#94a3b8;">({{ priceHistory.daysAgo }}天前)</span></span>
        </div>
        <div class="summary-item">
          <span class="lbl">一年内出现次数</span>
          <span class="val">{{ priceHistory.countInLastYear }} 次</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import request from '../api/request'

const route = useRoute()
const router = useRouter()
const game = ref(null)
const loading = ref(true)

// 历史价格数据与趋势弹窗控制
const priceHistory = ref(null)
const historyLoading = ref(false)
const showHistoryModal = ref(false)
const historyTimeRange = ref('12m') // '3m' | '6m' | '12m'
const activeHoveredPoint = ref(null)
const chartSvgRef = ref(null)

const svgWidth = 600
const svgHeight = 250
const paddingLeft = 50
const paddingRight = 20
const paddingTop = 20
const paddingBottom = 45

const fetchPriceHistory = async (passedName = '') => {
  if (!priceHistory.value) {
    historyLoading.value = true
  }
  try {
    const appid = route.params.id
    const gameName = passedName || (game.value ? game.value.name : '')
    const res = await request.get(`/api/store/price-history/${appid}?name=${encodeURIComponent(gameName)}`)
    if (res.data.code === 200 && res.data.data) {
      priceHistory.value = res.data.data
    }
  } catch (err) {
    console.error('获取价格历史失败:', err)
  } finally {
    historyLoading.value = false
  }
}

const computedPoints = computed(() => {
  if (!priceHistory.value || !priceHistory.value.history || !priceHistory.value.history.length) return []
  
  const now = Math.floor(Date.now() / 1000)
  let cutoff = 0
  if (historyTimeRange.value === '3m') {
    cutoff = now - 90 * 24 * 60 * 60
  } else if (historyTimeRange.value === '6m') {
    cutoff = now - 180 * 24 * 60 * 60
  } else if (historyTimeRange.value === '12m') {
    cutoff = now - 365 * 24 * 60 * 60
  }
  
  const fullList = priceHistory.value.history
  let filtered = fullList.filter(pt => pt.timestamp >= cutoff)
  
  // 如果起始区间有断层，补充一个边界点以保证图表左侧对齐
  if (cutoff > 0 && (filtered.length === 0 || filtered[0].timestamp > cutoff)) {
    const prevPt = [...fullList].reverse().find(pt => pt.timestamp < cutoff)
    // 关键修正：如果切分区间前无记录而取区间后第一个变动点 filtered[0]，必须使用它的 old_price（即变动前的原始平坦价格）
    const anchorPrice = prevPt ? prevPt.price : (filtered[0] ? ((filtered[0].old_price && filtered[0].old_price > 0 && filtered[0].old_price !== filtered[0].price) ? filtered[0].old_price : filtered[0].price) : fullList[0].price)
    const dt = new Date(cutoff * 1000)
    const y = dt.getFullYear()
    const m = String(dt.getMonth() + 1).padStart(2, '0')
    const d = String(dt.getDate()).padStart(2, '0')
    filtered.unshift({
      ...(prevPt || filtered[0] || fullList[0]),
      price: anchorPrice,
      old_price: anchorPrice,
      timestamp: cutoff,
      date: `${y}-${m}-${d}`
    })
  }

  if (!filtered.length) return []
  
  const prices = filtered.map(pt => pt.price)
  const tsList = filtered.map(pt => pt.timestamp)
  
  const maxPrice = Math.max(...prices, parseFloat(priceHistory.value.originalPrice) || 1)
  const minPrice = Math.min(...prices)
  const yMin = Math.max(0, Math.floor(minPrice * 0.8))
  const yMax = Math.ceil(maxPrice * 1.1)
  
  const xMin = Math.min(...tsList)
  const xMax = Math.max(...tsList)
  
  const widthSpan = svgWidth - paddingLeft - paddingRight
  const heightSpan = svgHeight - paddingTop - paddingBottom
  
  return filtered.map(item => {
    const x = paddingLeft + (xMin === xMax ? 0.5 : (item.timestamp - xMin) / (xMax - xMin)) * widthSpan
    const y = svgHeight - paddingBottom - (yMin === yMax ? 0.5 : (item.price - yMin) / (yMax - yMin)) * heightSpan
    return {
      x,
      y,
      price: item.price,
      date: item.date,
      discount: item.discount,
      timestamp: item.timestamp
    }
  })
})

const linePath = computed(() => {
  const pts = computedPoints.value
  if (!pts.length) return ''
  // 阶梯状走势曲线：到下一个降/升价点时刻才垂直下降/上升
  let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    path += ` L ${pts[i].x.toFixed(1)} ${pts[i - 1].y.toFixed(1)} L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`
  }
  return path
})

const areaPath = computed(() => {
  const pts = computedPoints.value
  if (!pts.length) return ''
  const firstX = pts[0].x.toFixed(1)
  const lastX = pts[pts.length - 1].x.toFixed(1)
  const bottomY = (svgHeight - paddingBottom).toFixed(1)
  let path = `M ${firstX} ${bottomY} L ${firstX} ${pts[0].y.toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    path += ` L ${pts[i].x.toFixed(1)} ${pts[i - 1].y.toFixed(1)} L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`
  }
  path += ` L ${lastX} ${bottomY} Z`
  return path
})

const yTicks = computed(() => {
  const pts = computedPoints.value
  if (!pts.length) return []
  const prices = pts.map(p => p.price)
  const maxPrice = Math.max(...prices, parseFloat(priceHistory.value.originalPrice) || 1)
  const minPrice = Math.min(...prices)
  const yMin = Math.max(0, Math.floor(minPrice * 0.8))
  const yMax = Math.ceil(maxPrice * 1.1)
  const step = (yMax - yMin) / 3
  return [
    { val: yMin.toFixed(0), y: svgHeight - paddingBottom },
    { val: (yMin + step).toFixed(0), y: svgHeight - paddingBottom - 1 / 3 * (svgHeight - paddingTop - paddingBottom) },
    { val: (yMin + 2 * step).toFixed(0), y: svgHeight - paddingBottom - 2 / 3 * (svgHeight - paddingTop - paddingBottom) },
    { val: yMax.toFixed(0), y: paddingTop }
  ]
})

const xTicks = computed(() => {
  const pts = computedPoints.value
  if (pts.length < 2) return []
  const idxs = [
    0,
    Math.floor((pts.length - 1) * 0.33),
    Math.floor((pts.length - 1) * 0.66),
    pts.length - 1
  ]
  return idxs.map(idx => {
    const pt = pts[idx]
    const parts = pt.date.split('-')
    const label = `${parts[1]}-${parts[2]}`
    return {
      label,
      x: pt.x
    }
  })
})

const handleMouseMove = (e) => {
  if (!chartSvgRef.value || !computedPoints.value.length) return
  const rect = chartSvgRef.value.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  
  let closestPoint = null
  let minDiff = Infinity
  
  computedPoints.value.forEach(pt => {
    const diff = Math.abs(pt.x - mouseX)
    if (diff < minDiff) {
      minDiff = diff
      closestPoint = pt
    }
  })
  
  if (closestPoint && minDiff < 40) {
    activeHoveredPoint.value = closestPoint
  } else {
    activeHoveredPoint.value = null
  }
}

const handleMouseLeave = () => {
  activeHoveredPoint.value = null
}

// 玩家评测数据、评价摘要与加载状态
const reviews = ref([])
const reviewsSummary = ref(null)
const reviewsLoading = ref(false)

const fetchReviews = async () => {
  reviewsLoading.value = true
  reviews.value = []
  reviewsSummary.value = null
  try {
    const appid = route.params.id
    // 侧边栏卡片仅展示 3 条评测以保持布局精炼
    const res = await request.get(`/api/store/reviews/${appid}?num_per_page=3`)
    if (res.data.code === 200) {
      reviews.value = res.data.data.reviews || []
      reviewsSummary.value = res.data.data.summary || null
    }
  } catch (err) {
    console.error('获取玩家评测失败:', err)
  } finally {
    reviewsLoading.value = false
  }
}

// 创意工坊数据
const workshopItems = ref([])
const workshopTotal = ref(0)
const workshopLoading = ref(false)
const workshopSearchQuery = ref('')
const workshopSearched = ref(false)
const workshopNextCursor = ref('*')
const workshopPage = ref(1)
const workshopCursorHistory = ref(['*'])

const fetchWorkshop = async (cursor = '*') => {
  workshopLoading.value = true
  try {
    const appid = route.params.id
    const searchParam = workshopSearchQuery.value ? `&search_text=${encodeURIComponent(workshopSearchQuery.value)}` : ''
    const res = await request.get(`/api/store/workshop/${appid}?cursor=${encodeURIComponent(cursor)}&numperpage=6${searchParam}`)
    if (res.data.code === 200) {
      workshopItems.value = res.data.data.items || []
      workshopTotal.value = res.data.data.total || 0
      workshopNextCursor.value = res.data.data.nextCursor || '*'
      workshopSearched.value = true
    }
  } catch (err) {
    console.error('获取创意工坊失败:', err)
  } finally {
    workshopLoading.value = false
  }
}

const searchWorkshop = () => {
  workshopPage.value = 1
  workshopCursorHistory.value = ['*']
  fetchWorkshop('*')
}

const loadWorkshopNext = () => {
  if (!workshopNextCursor.value || workshopNextCursor.value === '*' || workshopLoading.value) return
  workshopCursorHistory.value.push(workshopNextCursor.value)
  workshopPage.value++
  fetchWorkshop(workshopNextCursor.value)
}

const loadWorkshopPrev = () => {
  if (workshopPage.value <= 1 || workshopLoading.value) return
  workshopCursorHistory.value.pop()
  const prevCursor = workshopCursorHistory.value[workshopCursorHistory.value.length - 1]
  workshopPage.value--
  fetchWorkshop(prevCursor)
}

const openWorkshopItem = (itemId) => {
  window.open(`https://steamcommunity.com/sharedfiles/filedetails/?id=${itemId}`, '_blank')
}

const openWorkshopHub = () => {
  window.open(`https://steamcommunity.com/app/${route.params.id}/workshop/`, '_blank')
}

const formatNumber = (num) => {
  if (!num) return '0'
  if (num >= 10000) return (num / 10000).toFixed(1) + '万'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k'
  return String(num)
}

// 获取评价等级对应的 CSS 类名
const getRatingClass = (desc) => {
  if (!desc) return 'rating-neutral'
  if (desc.includes('好评如潮') || desc.includes('特别好评')) return 'rating-very-positive'
  if (desc.includes('好评')) return 'rating-positive'
  if (desc.includes('褒贬不一')) return 'rating-mixed'
  if (desc.includes('差评')) return 'rating-negative'
  return 'rating-neutral'
}

// 评测弹窗分页控制变量与逻辑
const showReviewsModal = ref(false)
const modalReviews = ref([])
const modalLoading = ref(false)
const currentPage = ref(1)
const nextCursorStr = ref('*')
const cursorHistory = ref(['*']) // 游标历史栈以支持“上一页”操作

const openAllReviewsModal = () => {
  showReviewsModal.value = true
  currentPage.value = 1
  cursorHistory.value = ['*']
  fetchModalReviews('*')
}

const closeAllReviewsModal = () => {
  showReviewsModal.value = false
  modalReviews.value = []
}

const fetchModalReviews = async (cursor) => {
  modalLoading.value = true
  modalReviews.value = []
  try {
    const appid = route.params.id
    // 弹窗中每页获取 10 条评测
    const res = await request.get(`/api/store/reviews/${appid}?num_per_page=10&cursor=${encodeURIComponent(cursor)}`)
    if (res.data.code === 200) {
      modalReviews.value = res.data.data.reviews || []
      nextCursorStr.value = res.data.data.nextCursor || '*'
    }
  } catch (err) {
    console.error('获取弹窗玩家评测失败:', err)
  } finally {
    modalLoading.value = false
  }
}

const goToNextPage = () => {
  if (!nextCursorStr.value || nextCursorStr.value === '*' || modalLoading.value) return
  cursorHistory.value.push(nextCursorStr.value)
  currentPage.value++
  fetchModalReviews(nextCursorStr.value)
}

const goToPrevPage = () => {
  if (currentPage.value <= 1 || modalLoading.value) return
  cursorHistory.value.pop()
  const prevCursor = cursorHistory.value[cursorHistory.value.length - 1]
  currentPage.value--
  fetchModalReviews(prevCursor)
}

// 跳转至新详情页并更新路由
const goToStoreDetail = (appid) => {
  router.push(`/store/detail/${appid}`)
}

// 弹出价格趋势图，并在弹出时重新拉取价格历史以实现真实数据就绪
const openHistoryModal = async () => {
  showHistoryModal.value = true
  await fetchPriceHistory()
}

// 监听路由 AppID 参数发生变化时，立即重新拉取对应商品、DLC 以及评测与价格历史信息
watch(
  () => route.params.id,
  (newId) => {
    if (newId && route.path.startsWith('/store/detail/')) {
      fetchStoreDetail()
      fetchReviews()
      fetchPriceHistory()
    }
  }
)

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

// 动态背景上浮手柄
const gamepads = ref([])

// 点击截图放大蒙层控制 (切换为 index 控制方便左右切换)
const zoomImgIndex = ref(-1)

// 左右切换截图逻辑
const prevZoomImg = () => {
  if (!game.value || !game.value.screenshots.length) return
  if (zoomImgIndex.value > 0) {
    zoomImgIndex.value--
  } else {
    zoomImgIndex.value = game.value.screenshots.length - 1
  }
}

const nextZoomImg = () => {
  if (!game.value || !game.value.screenshots.length) return
  if (zoomImgIndex.value < game.value.screenshots.length - 1) {
    zoomImgIndex.value++
  } else {
    zoomImgIndex.value = 0
  }
}

// 滚动条绑定控制
const mediaScrollRef = ref(null)
const scrollValue = ref(0)
const maxScroll = ref(0)

const fetchStoreDetail = async () => {
  loading.value = true
  try {
    const appid = route.params.id
    const res = await request.get(`/api/store/detail/${appid}`)
    if (res.data.code === 200) {
      game.value = res.data.data
      
      // 当拉取到准确的游戏名称后，若非 DLC 游戏则触发补充拉取史低价格趋势数据
      if (!game.value.fullgame) {
        fetchPriceHistory(game.value.name)
      }
      
      // 等待 DOM 渲染后计算最大可滚动区间
      nextTick(() => {
        setTimeout(calculateMaxScroll, 1200) // 延迟确保图片等资源已经渲染出尺寸
      })
      
      // 如果游戏具有创意工坊，则主动拉取创意工坊的数据
      if (game.value.has_workshop) {
        fetchWorkshop()
      } else {
        workshopItems.value = []
        workshopTotal.value = 0
      }
    }
  } catch (err) {
    console.error('获取游戏商店详情失败:', err)
  } finally {
    loading.value = false
  }
}

// 计算最大可滚动范围
const calculateMaxScroll = () => {
  const el = mediaScrollRef.value
  if (el) {
    maxScroll.value = Math.max(0, el.scrollWidth - el.clientWidth)
  }
}

// 当用户拖动滑块时，控制上面内容区滚动
const syncSliderToScroll = () => {
  const el = mediaScrollRef.value
  if (el) {
    el.scrollLeft = scrollValue.value
  }
}

// 当内容区本身发生滚动时，更新滑块位置
const syncScrollToSlider = () => {
  const el = mediaScrollRef.value
  if (el) {
    calculateMaxScroll() // 滚动时动态校准，以防图片延迟加载改变了 scrollWidth
    scrollValue.value = el.scrollLeft
  }
}

const buyOnSteam = (appid) => {
  window.open(`https://store.steampowered.com/app/${appid}/`)
}

onMounted(() => {
  fetchStoreDetail()
  fetchReviews()
  fetchPriceHistory()
  
  // 窗口缩放时自适应重新计算
  window.addEventListener('resize', calculateMaxScroll)

  // 监听内容区滚动，用于回到顶部按钮的展示与隐藏
  const contentArea = document.querySelector('.content-area')
  if (contentArea) {
    contentArea.addEventListener('scroll', handleScroll)
  }

  // 生成 18 个手柄，分布在不同的起始高度，向上漂浮覆盖整个黑色区域
  const list = []
  for (let i = 0; i < 18; i++) {
    list.push({
      id: i,
      left: `${5 + Math.random() * 90}%`,
      top: `${(i / 18) * 110 + Math.random() * 6}%`, // 均匀分布在 0%-110% 的垂直高度，确保全页覆盖
      fontSize: `${28 + Math.random() * 28}px`, // 28px - 56px
      duration: `${14 + Math.random() * 12}s`, // 14-26 秒完成一次向上漂浮
      delay: `${-Math.random() * 26}s`, // 负延时让每个手柄处于动画的不同阶段
      opacity: 0.15 + Math.random() * 0.20 // 透明度 15%-35%
    })
  }
  gamepads.value = list
})

onUnmounted(() => {
  window.removeEventListener('resize', calculateMaxScroll)
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
  padding: 0 0 40px 0; /* 移除外层间距，使黑色大背景完全撑满右半部分 */
  animation: fadeIn 0.5s ease;
  overflow-x: clip; /* clip 仅裁剪横向溢出渲染，但不创建滚动容器，因此滚轮事件能正常穿透到父级 */
  overflow-y: visible; /* 纵向完全不拦截，滚轮事件由父级 .content-area 处理 */
  box-sizing: border-box;
  background-color: #0b0f19;
  position: relative;
  min-height: 100%;
  z-index: 1;
}

/* 背景手柄裁剪定位器 */
.gamepads-bg-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden; /* 核心：完美将上浮飘出边缘的手柄裁剪在容器内部 */
  pointer-events: none; /* 穿透所有鼠标事件 */
  z-index: 0;
}

/* 漂浮手柄动画效果 - 分布在各个高度，向上漂浮 */
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
    transform: translateY(0) rotate(0deg);
    opacity: 0;
  }
  10% {
    opacity: 1; /* 淡入 */
  }
  90% {
    opacity: 1;
  }
  100% {
    transform: translateY(-500px) rotate(360deg);
    opacity: 0; /* 淡出 */
  }
}

/* 顶部 Header - 铺满边缘，仅下方有圆角 */
.detail-header {
  padding: 60px 40px;
  border-radius: 0 0 16px 16px;
  margin-bottom: 30px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.4);
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
  z-index: 1;
  backdrop-filter: blur(8px);
  border: none !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 30px;
  position: relative;
  z-index: 2;
  flex-wrap: wrap;
}

.cover-big {
  width: 230px;
  height: 108px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 8px 25px rgba(0,0,0,0.5);
  background: rgba(0,0,0,0.2);
  flex-shrink: 0;
}
.img-cover-detail {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.title-area {
  flex: 1;
  color: white;
  min-width: 280px;
}

.title-area h1 {
  font-size: 30px;
  font-weight: 800;
  margin: 0 0 16px 0;
  text-shadow: 0 2px 10px rgba(0,0,0,0.8);
}

/* 价格与购买控制台 */
.store-buy-box {
  display: flex;
  align-items: center;
  gap: 25px;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 14px 20px;
  width: max-content;
  backdrop-filter: blur(10px);
}

.price-display {
  display: flex;
  align-items: center;
  gap: 15px;
}

.discount-tag {
  background: #a3d200;
  color: #000;
  font-weight: 900;
  font-size: 18px;
  padding: 4px 8px;
  border-radius: 4px;
}

.price-details {
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
  font-size: 18px;
  color: #00f2fe;
  font-weight: bold;
}

.btn-buy-action {
  background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
  color: #0b0f19;
  border: none;
  font-weight: bold;
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  box-shadow: 0 4px 15px rgba(0, 242, 254, 0.3);
}

.btn-buy-action:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 242, 254, 0.5);
}

/* 主内容布局 */
.detail-body {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 30px;
  padding: 0 40px; /* 增加左右内边距，保持与其余内容一致 */
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

/* 毛玻璃磨砂卡片质感 */
.card-info, .media-gallery-section {
  background: rgba(15, 23, 42, 0.18) !important; /* 超高透明度，让手柄背景清晰透过 */
  backdrop-filter: blur(6px); /* 减少模糊，使后面内容更清晰 */
  border: 1px solid rgba(255, 255, 255, 0.06) !important;
  color: #e2e8f0 !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25) !important;
  border-radius: 16px;
  padding: 24px;
  box-sizing: border-box;
}

.info-sidebar h3, 
.media-gallery-section h3, 
.about-section h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: #ffffff !important;
  font-weight: bold;
}

.info-list {
  list-style: none;
  padding: 0;
  margin: 0 0 24px 0;
}

.info-list li {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 14px;
}

.info-list li:last-child {
  border-bottom: none;
}

.info-list .label {
  color: #94a3b8;
}

.info-list .val {
  color: #f1f5f9 !important;
  font-weight: bold;
}

.highlight-price {
  color: #00f2fe !important;
  font-size: 16px;
}

.btn-back {
  width: 100%;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e2e8f0;
  padding: 10px;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-back:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #00f2fe;
  border-color: #00f2fe;
}

/* 媒体展示区 */
.media-gallery-section {
  margin-bottom: 30px;
  overflow: hidden;
  box-sizing: border-box;
  width: 100%;
}

.media-scroll-container {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 12px;
  width: 100%;
  box-sizing: border-box;
  overscroll-behavior-x: none; /* 防止横向滑动手势触发 Electron 窗口返回 */
}

.media-item {
  flex-shrink: 0;
  height: 200px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 10px rgba(0,0,0,0.15);
  background: #000;
}

.img-item {
  width: 320px;
}

.media-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}
.media-img:hover {
  transform: scale(1.02);
}

/* 隐藏横向滚动条，用我们的 Range 轴控制 */
.media-scroll-container::-webkit-scrollbar {
  height: 0px;
  display: none;
}

/* 截图悬浮放大光标 */
.clickable-zoom {
  cursor: zoom-in;
}

/* 媒体区底部拖拽滚动控制条 */
.gallery-slider-bar-wrapper {
  margin-top: 15px;
  padding: 10px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.gallery-slider-range {
  -webkit-appearance: none;
  width: 100%;
  max-width: 480px;
  height: 6px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 3px;
  outline: none;
  transition: background 0.3s;
}

.gallery-slider-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 36px;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 242, 254, 0.4);
  transition: transform 0.1s;
}

.gallery-slider-range::-webkit-slider-thumb:hover {
  transform: scaleY(1.2);
}

/* 关于游戏内容 */
.about-section {
  width: 100%;
  box-sizing: border-box;
}

.short-desc {
  background: rgba(255, 255, 255, 0.03);
  padding: 16px;
  border-radius: 8px;
  font-size: 14px;
  color: #cbd5e1;
  line-height: 1.6;
  margin-bottom: 20px;
  border-left: 4px solid #00f2fe;
}

.about-html-content {
  font-size: 14px;
  color: #cbd5e1 !important;
  line-height: 1.7;
}

.about-html-content :deep(p) {
  margin-bottom: 12px;
  color: #94a3b8;
  line-height: 1.6;
}

/* 确保富文本介绍内的所有多媒体资源、表格及排版元素在任何情况下都不会溢出黑色主体容器 */
.about-html-content :deep(img),
.about-html-content :deep(video),
.about-html-content :deep(iframe),
.about-html-content :deep(table),
.about-html-content :deep(p),
.about-html-content :deep(div),
.about-html-content :deep(.game_area_description_fieldimg) {
  max-width: 100% !important;
  height: auto !important;
  box-sizing: border-box !important;
}

/* 保证表格及嵌套结构自适应，不会被内容撑大 */
.about-html-content :deep(table) {
  width: 100% !important;
  table-layout: fixed !important;
}

.about-html-content :deep(h2), .about-html-content :deep(h3) {
  font-size: 16px;
  font-weight: bold;
  color: #ffffff !important;
  margin: 20px 0 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: 6px;
}

/* 状态组件 */
.store-detail-loading, .store-detail-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100px 40px;
  background: #0b0f19;
  border-radius: 0;
  border: none;
  text-align: center;
  box-shadow: none;
  height: 100vh;
  box-sizing: border-box;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(0, 242, 254, 0.15);
  border-top-color: #00f2fe;
  border-radius: 50%;
  animation: spin 0.8s infinite linear;
  margin-bottom: 20px;
}

@keyframes spin { to { transform: rotate(360deg); } }

.store-detail-loading p {
  color: #94a3b8;
  font-size: 14px;
}

.store-detail-error p {
  color: #ef4444;
  font-weight: bold;
  font-size: 15px;
  margin-bottom: 20px;
}

.btn-back-err {
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 10px 24px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.2s;
}
.btn-back-err:hover {
  background: #1e293b;
  border-color: #00f2fe;
  color: #00f2fe;
}

/* 放大看图遮罩弹窗 */
.lightbox-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(8, 10, 18, 0.92);
  backdrop-filter: blur(12px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 99999;
  cursor: zoom-out;
  animation: fadeInOverlay 0.25s ease-out;
}

@keyframes fadeInOverlay {
  from { opacity: 0; }
  to { opacity: 1; }
}

.lightbox-content {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  max-width: 90%;
  max-height: 90%;
}

.lightbox-img {
  max-width: 100%;
  max-height: 80vh;
  border-radius: 12px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.85);
  animation: scaleUpLightbox 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  cursor: default;
  user-select: none;
}

@keyframes scaleUpLightbox {
  from {
    transform: scale(0.96);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

/* 左右导航切换按钮 */
.btn-lightbox-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.7);
  width: 48px;
  height: 60px;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  border-radius: 6px;
  z-index: 10;
}

.btn-lightbox-nav:hover {
  background: rgba(0, 242, 254, 0.25);
  color: #00f2fe;
  border-color: #00f2fe;
  box-shadow: 0 0 10px rgba(0, 242, 254, 0.4);
}

.btn-lightbox-prev {
  left: -70px;
}

.btn-lightbox-next {
  right: -70px;
}

@media (max-width: 800px) {
  .btn-lightbox-prev { left: 10px; }
  .btn-lightbox-next { right: 10px; }
}

.btn-close-lightbox {
  position: absolute;
  top: -45px;
  right: 0;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  color: white;
  width: 36px;
  height: 36px;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-close-lightbox:hover {
  background: rgba(255, 255, 255, 0.25);
  color: #00f2fe;
  border-color: #00f2fe;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* --- 新增：DLC 追加内容及基础原游戏样式 --- */
.dlc-card {
  margin-top: 25px !important;
}

.dlc-list-box {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-top: 15px;
}

.dlc-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.dlc-item:hover {
  background: rgba(0, 242, 254, 0.08);
  border-color: rgba(0, 242, 254, 0.3);
  transform: translateY(-2px);
}

.dlc-cover {
  width: 80px;
  height: 38px;
  object-fit: cover;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
.dlc-cover-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: url('/beijing1.png') no-repeat center center;
  background-size: cover;
  color: #ffffff;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8);
  font-size: 14px;
  font-weight: bold;
}

.dlc-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.dlc-name {
  font-size: 13px;
  color: #f8fafc;
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}

.dlc-price-tag {
  font-size: 11px;
  color: #00f2fe;
  font-weight: bold;
}

/* 基础原版游戏特定样式 */
.dlc-item.parent-game {
  border-color: rgba(79, 172, 254, 0.3);
  background: rgba(79, 172, 254, 0.04);
}
.dlc-item.parent-game:hover {
  background: rgba(79, 172, 254, 0.1);
  border-color: rgba(79, 172, 254, 0.5);
}

/* --- 新增：系统配置要求样式 --- */
.requirements-section {
  margin-top: 30px !important;
}

.requirements-section :deep(h1), 
.requirements-section :deep(h2), 
.requirements-section :deep(h3) {
  font-size: 15px;
  color: #ffffff;
  margin-top: 0;
  margin-bottom: 12px;
}

.requirements-section :deep(ul) {
  list-style-type: none;
  padding-left: 0;
  margin: 10px 0;
}

.requirements-section :deep(li) {
  font-size: 13px;
  color: #94a3b8;
  margin-bottom: 6px;
  line-height: 1.5;
}

.requirements-section :deep(strong) {
  color: #ffffff;
}

.req-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
  margin-top: 15px;
}

.req-item {
  background: rgba(255, 255, 255, 0.02);
  padding: 20px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

/* 游戏标题排版与评价标签 */
.game-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  margin: 0;
}
.game-name-text {
  font-size: 32px;
  font-weight: 800;
  color: #ffffff;
  line-height: 1.2;
}
.game-rating-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
  border: 1px solid transparent;
}
.rating-very-positive {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
  border-color: rgba(16, 185, 129, 0.2);
}
.rating-positive {
  background: rgba(52, 211, 153, 0.1);
  color: #34d399;
  border-color: rgba(52, 211, 153, 0.15);
}
.rating-mixed {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
  border-color: rgba(245, 158, 11, 0.15);
}
.rating-negative {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.15);
}
.rating-neutral {
  background: rgba(255, 255, 255, 0.05);
  color: #94a3b8;
  border-color: rgba(255, 255, 255, 0.08);
}

/* 玩家评测侧边栏卡片样式 */
.reviews-card {
  margin-top: 20px;
}
.reviews-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 0;
  color: #94a3b8;
  font-size: 13px;
}
.spinner-small {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(0, 242, 254, 0.1);
  border-top-color: #00f2fe;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.no-reviews {
  padding: 20px 0;
  color: #64748b;
  font-size: 13px;
}
.reviews-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 15px;
}
.review-item {
  background: rgba(255, 255, 255, 0.012);
  border: 1px solid rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  padding: 14px;
  transition: all 0.3s ease;
}
.review-item:hover {
  background: rgba(255, 255, 255, 0.025);
  border-color: rgba(255, 255, 255, 0.05);
}
.review-author {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  position: relative;
}
.author-avatar {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.2);
  object-fit: cover;
}
.author-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-width: 120px;
}
.author-name {
  font-size: 13px;
  font-weight: 600;
  color: #f1f5f9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.playtime {
  font-size: 11px;
  color: #64748b;
}
.review-recommendation {
  margin-left: auto;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
}
.recommend-up {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}
.recommend-down {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}
.review-content {
  font-size: 13px;
  line-height: 1.5;
  color: #cbd5e1;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 120px;
  overflow-y: auto;
  padding-right: 4px;
}
.review-content::-webkit-scrollbar {
  width: 4px;
}
.review-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}
.review-date {
  margin-top: 8px;
  font-size: 11px;
  color: #475569;
  text-align: right;
}

.reviews-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
.btn-view-all-reviews {
  font-size: 12px;
  color: #34d399;
  cursor: pointer;
  font-weight: 600;
  transition: color 0.3s ease;
}
.btn-view-all-reviews:hover {
  color: #00f2fe;
}

/* 弹窗专用样式 */
.modal-overlay {
  z-index: 1000 !important;
}
.reviews-modal-container {
  width: 90%;
  max-width: 750px;
  height: 80vh;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
  animation: modalScaleIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  overflow: hidden;
}
@keyframes modalScaleIn {
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
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.modal-title-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.modal-header h2 {
  font-size: 18px;
  color: #f8fafc;
  margin: 0;
  text-align: left;
}
.rating-info {
  font-size: 12.5px;
  color: #94a3b8;
  text-align: left;
}
.btn-close-modal {
  background: transparent;
  border: none;
  font-size: 20px;
  color: #64748b;
  cursor: pointer;
  transition: color 0.3s;
}
.btn-close-modal:hover {
  color: #f8fafc;
}
.modal-body {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}
.modal-loading-state, .modal-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #94a3b8;
  gap: 15px;
}
.modal-reviews-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.modal-review-item {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  padding: 20px;
  text-align: left;
}
.modal-review-item .review-recommendation {
  padding: 4px 10px;
}
.modal-review-item .review-content {
  max-height: none;
  overflow: visible;
  padding: 0;
  font-size: 14px;
}
.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
}
.btn-page-nav {
  padding: 8px 18px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #f8fafc;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}
.btn-page-nav:hover:not(:disabled) {
  background: #34d399;
  color: #0b0f19;
  border-color: #34d399;
  box-shadow: 0 0 10px rgba(52, 211, 153, 0.3);
}
.btn-page-nav:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.page-indicator {
  font-size: 14px;
  font-weight: 700;
  color: #cbd5e1;
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
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* 创意工坊样式 */
.workshop-card {
  margin-top: 20px;
}
.workshop-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}
.workshop-total {
  font-size: 12px;
  color: #94a3b8;
  font-weight: normal;
}
.workshop-search-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.workshop-search-input {
  flex: 1;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 8px 12px;
  color: #f8fafc;
  font-size: 13px;
  outline: none;
  transition: all 0.3s;
}
.workshop-search-input:focus {
  border-color: #34d399;
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.2);
}
.btn-ws-search {
  background: #34d399;
  color: #0b0f19;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  white-space: nowrap;
  flex-shrink: 0;
}
.btn-ws-search:hover {
  background: #059669;
  color: #ffffff;
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.3);
}
.workshop-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.workshop-item {
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  flex-direction: column;
}
.workshop-item:hover {
  transform: translateY(-2px);
  border-color: #34d399;
  background: rgba(15, 23, 42, 0.8);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
.ws-preview {
  width: 100%;
  height: 90px;
  object-fit: cover;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.ws-info {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.ws-title {
  font-size: 12px;
  color: #f8fafc;
  font-weight: 600;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
  height: 33px;
}
.ws-subs {
  font-size: 11px;
  color: #94a3b8;
}
.workshop-pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.btn-ws-page {
  padding: 6px 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #f8fafc;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}
.btn-ws-page:hover:not(:disabled) {
  background: rgba(52, 211, 153, 0.2);
  color: #34d399;
  border-color: #34d399;
}
.btn-ws-page:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.ws-page-num {
  font-size: 12px;
  color: #94a3b8;
  font-weight: bold;
}
.btn-ws-hub-fallback {
  width: 100%;
  padding: 10px;
  background: rgba(52, 211, 153, 0.1);
  border: 1px solid #34d399;
  color: #34d399;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}
.btn-ws-hub-fallback:hover {
  background: #34d399;
  color: #0b0f19;
  box-shadow: 0 0 10px rgba(52, 211, 153, 0.3);
}
.btn-ws-hub-bottom {
  width: 100%;
  margin-top: 15px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.btn-ws-hub-bottom:hover {
  background: rgba(52, 211, 153, 0.15);
  border-color: #34d399;
  color: #34d399;
}

/* 历史价格折合面板 */
.buy-box-divider {
  width: 1px;
  height: 40px;
  background: rgba(255, 255, 255, 0.15);
}

.lowest-price-box {
  display: flex;
  flex-direction: column;
  justify-content: center;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.3s ease;
  user-select: none;
}

.lowest-price-box:hover {
  background: rgba(255, 255, 255, 0.05);
  box-shadow: 0 0 10px rgba(0, 242, 254, 0.1);
}

.lowest-price-loading {
  cursor: default !important;
  min-width: 140px;
  align-items: center;
  justify-content: center;
  flex-direction: row;
  gap: 6px;
}

.loading-lowest-text {
  font-size: 11px;
  color: #00f2fe;
}

.lowest-title {
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 2px;
}

.lowest-price-val {
  font-size: 16px;
  color: #a3d200;
  font-weight: bold;
}

.lowest-price-date {
  font-size: 10px;
  color: #64748b;
}

.lowest-price-date .days-ago {
  color: #94a3b8;
  margin-left: 2px;
}

/* 小黑盒风格价格趋势弹窗 */
.price-history-modal-container {
  max-width: 660px !important;
  background: #0f172a !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  border-radius: 16px !important;
}

.price-history-modal-container .modal-body {
  overflow-x: hidden !important; /* 彻底去除底部可能出现的灰色横向滚动条 */
}

.time-range-selectors {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  flex-shrink: 0 !important;
  white-space: nowrap !important;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 2px;
  gap: 2px;
  margin-right: 15px;
}

.btn-range {
  background: transparent;
  border: none;
  color: #94a3b8;
  padding: 4px 12px;
  font-size: 11px;
  font-weight: bold;
  border-radius: 18px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap !important; /* 坚决防止文字如 '6个' '月' 发生换行 */
}

.btn-range:hover {
  color: #f8fafc;
}

.btn-range.active {
  background: rgba(255, 255, 255, 0.12) !important;
  color: #00f2fe !important;
}

.chart-container {
  position: relative;
  width: 100%;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 8px;
  padding: 10px 0;
  margin: 15px 0;
  display: flex;
  justify-content: center;
}

.history-svg-chart {
  display: block;
  user-select: none;
}

.chart-tooltip {
  position: absolute;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(0, 242, 254, 0.5);
  border-radius: 6px;
  padding: 6px 10px;
  pointer-events: none;
  z-index: 10;
  box-shadow: 0 4px 15px rgba(0,0,0,0.5);
  font-size: 11px;
  font-family: monospace;
}

.tooltip-date {
  color: #94a3b8;
  font-size: 10px;
  margin-bottom: 3px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 2px;
}

.tooltip-price {
  color: #ffffff;
  font-weight: bold;
}

.tooltip-price .val {
  color: #00f2fe;
}

.tooltip-discount {
  color: #cbd5e1;
  font-size: 10px;
  margin-top: 2px;
}

.tooltip-discount .val {
  color: #a3d200;
  font-weight: bold;
}

.price-history-footer {
  display: flex;
  gap: 40px;
  padding: 15px 24px !important;
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.price-history-footer .summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.price-history-footer .summary-item .lbl {
  font-size: 11px;
  color: #64748b;
  font-weight: bold;
}

.price-history-footer .summary-item .val {
  font-size: 16px;
  color: #f1f5f9;
  font-weight: bold;
}

.price-history-footer .summary-item .green-text {
  color: #a3d200;
}

.publisher-info-row {
  margin-top: 6px;
  margin-bottom: 12px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
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
