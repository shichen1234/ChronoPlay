<template>
  <!-- 如果未登录，展示登录提示界面 -->
  <div v-if="!gameStore.steamUser" class="login-require-box">
    <div class="lock-icon">🔒</div>
    <h3>登录以查看我的游戏收藏</h3>
    <p>此页面需要读取您的 Steam 游戏库数据。请先登录您的 Steam 账号。</p>
    <router-link to="/login" class="btn-go-login">去登录</router-link>
  </div>

  <div v-else class="list-container">
    <div class="header-action">
      <h2>我的游戏收藏 ({{ sortedGames.length }})</h2>
      <div class="actions-right">
        <span v-if="gameStore.isSyncing" class="sync-status">
          <svg class="sync-icon spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
          正在同步 Steam 游玩数据...
        </span>
        <router-link to="/hof" class="btn-hof">
          🏆 游戏名人堂
        </router-link>
        <button @click="gameStore.fetchGames" class="btn-sync" :disabled="gameStore.isSyncing">
          <svg class="refresh-svg-btn" :class="{ 'spinning': gameStore.isSyncing }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
          同步
        </button>
      </div>
    </div>
    
    <div v-if="sortedGames.length === 0 && !gameStore.isSyncing" class="empty-list">
      <p>目前还没有收录任何游戏，点击右上角同步按钮获取您的 Steam 游戏库数据！</p>
    </div>

    <div class="cards-grid">
      <!-- 渲染按照游玩时长降序排列的游戏列表 -->
      <div class="game-card" v-for="game in sortedGames" :key="game.id">
        <div class="card-cover" :style="{ backgroundImage: game.cover && game.cover.startsWith('http') && !game.coverError ? 'none' : 'url(/beijing1.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }">
          <img v-if="game.cover && game.cover.startsWith('http') && !game.coverError" :src="game.cover" class="img-cover" alt="游戏封面" loading="lazy" @error="game.coverError = true" />
          <span v-else class="emoji-cover"></span>
          <span class="status-badge" :class="statusClass(game.status)">
            {{ game.status }}
          </span>
        </div>
        
        <div class="card-body">
          <h3 class="game-title">{{ game.name }}</h3>
          
          <div class="card-meta">
            <div class="meta-left">
              <p class="playtime">⏱️ 游玩: {{ game.playtime }}</p>
              <p class="price-info" v-if="game.original_price">💰 价格: ¥{{ game.original_price }}</p>
            </div>
            <span class="platform-badge" :class="game.platform ? game.platform.toLowerCase() : 'other'">
              {{ game.platform || 'Steam' }}
            </span>
          </div>
          
          <div class="card-actions">
            <router-link :to="`/detail/${game.id}`" class="btn-detail">查看详情</router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, computed } from 'vue'
import { useGameStore } from '../store/game'

const gameStore = useGameStore()

onMounted(() => {
  if (gameStore.games.length === 0) {
    gameStore.fetchGames()
  }
})

const statusClass = (status) => {
  return {
    'playing': status === '正在游玩',
    'backlog': status === '吃灰中',
    'not-start': status === '未开始'
  }
}

// 按照累计游玩时间（playtime_forever 或 playtime_minutes）从长到短（降序）排列
const sortedGames = computed(() => {
  return [...gameStore.games].sort((a, b) => {
    const aTime = a.playtime_forever !== undefined 
      ? a.playtime_forever 
      : (a.playtime_minutes !== undefined ? a.playtime_minutes : 0)
    const bTime = b.playtime_forever !== undefined 
      ? b.playtime_forever 
      : (b.playtime_minutes !== undefined ? b.playtime_minutes : 0)
    return bTime - aTime
  })
})
</script>

<style scoped>
.list-container { padding: 20px; animation: fadeIn 0.5s ease; }
.header-action { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.actions-right { display: flex; align-items: center; gap: 15px; }

.sync-status {
  font-size: 13px;
  color: #3498db;
  display: flex;
  align-items: center;
  gap: 5px;
}

.sync-icon {
  width: 14px;
  height: 14px;
  display: inline-block;
  vertical-align: middle;
}
.sync-icon.spinning {
  animation: rotateSyncPremium 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.refresh-svg-btn {
  width: 14px;
  height: 14px;
  display: inline-block;
  vertical-align: middle;
  margin-right: 4px;
  transition: transform 0.3s ease;
}
.btn-sync:hover:not(:disabled) .refresh-svg-btn {
  transform: rotate(180deg);
}
.refresh-svg-btn.spinning {
  animation: rotateSyncPremium 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes rotateSyncPremium {
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

.btn-sync {
  background: #34495e;
  color: white;
  border: none;
  padding: 10px 18px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  font-size: 14px;
  transition: background 0.3s;
}
.btn-hof {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #ffffff;
  border-radius: 6px;
  text-decoration: none;
  font-weight: bold;
  font-size: 14px;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.25);
  transition: transform 0.2s, box-shadow 0.2s;
}
.btn-hof:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(245, 158, 11, 0.35);
}
.btn-sync:hover:not(:disabled) {
  background: #2c3e50;
}
.btn-sync:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.empty-list {
  background: white;
  padding: 40px;
  text-align: center;
  border-radius: 12px;
  color: #7f8c8d;
  box-shadow: 0 4px 15px rgba(0,0,0,0.05);
}

.cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
.game-card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.08); transition: transform 0.3s; display: flex; flex-direction: column; }
.game-card:hover { transform: translateY(-5px); box-shadow: 0 8px 25px rgba(0,0,0,0.15); }

.card-cover { height: 140px; position: relative; display: flex; justify-content: center; align-items: center; overflow: hidden; }
.img-cover { width: 100%; height: 100%; object-fit: cover; }
.emoji-cover { font-size: 60px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3)); }

.status-badge { position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.6); color: white; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; }
.status-badge.playing { background: #f1c40f; color: #2c3e50; }
.status-badge.backlog { background: #e74c3c; }
.status-badge.not-start { background: #95a5a6; }

.card-body { padding: 15px; display: flex; flex-direction: column; flex-grow: 1; }
.game-title { margin: 0 0 10px 0; font-size: 18px; color: #2c3e50; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.card-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
.meta-left { display: flex; flex-direction: column; gap: 4px; text-align: left; }
.playtime { margin: 0; font-size: 13px; color: #7f8c8d; }
.price-info { margin: 0; font-size: 12px; color: #eab308; font-weight: bold; }

.platform-badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: bold;
  color: white;
  text-transform: uppercase;
}
.platform-badge.manual { background: #7f8c8d; }
.platform-badge.steam { background: #171a21; color: #66c0f4; border: 1px solid #66c0f4; }
.platform-badge.epic { background: #2a2a2a; color: #f5f5f5; }
.platform-badge.battlenet { background: #00aeff; }
.platform-badge.xbox { background: #107c10; }
.platform-badge.playstation { background: #003087; }
.platform-badge.nintendo { background: #e60012; }
.platform-badge.other { background: #95a5a6; }

.card-actions { display: block; margin-top: auto; }
.btn-detail { display: block; text-align: center; background: #ecf0f1; color: #2c3e50; text-decoration: none; padding: 8px 12px; border-radius: 6px; font-size: 13px; font-weight: bold; width: 100%; box-sizing: border-box; transition: all 0.3s; }
.btn-detail:hover { background: #bdc3c7; }

@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

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
  margin: 120px auto; /* 统一对齐外边距 */
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
  animation: fadeIn 0.5s ease; /* 添加出现动画 */
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
