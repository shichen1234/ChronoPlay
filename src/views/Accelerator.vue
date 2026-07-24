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

    <!-- 加速器页头 -->
    <div class="detail-header">
      <div class="header-content">
        <div class="acc-logo-icon">⚡</div>
        <div class="title-area">
          <h1 class="game-title-row">
            <span class="game-name-text">ChronoPlay加速器</span>
          </h1>
        </div>
      </div>
    </div>

    <!-- 主体布局（已登录状态） -->
    <div v-if="gameStore.steamUser" class="detail-body">
      <!-- 左侧：开关卡片 -->
      <div class="power-section">
        <div class="card-info power-card">
          <h3>⚡ 加速状态控制</h3>
          <div class="power-button-container">
            <div 
              class="power-btn" 
              :class="{ 'active': enabled, 'toggling': toggling }" 
              @click="toggleAccelerator"
              title="点击切换加速状态"
            >
              <!-- 涟漪特效环 -->
              <div class="ring ring-1"></div>
              <div class="ring ring-2"></div>
              <div class="ring ring-3"></div>
              
              <!-- 开关按钮图标 -->
              <div class="power-icon">
                <span class="icon-glyph">⏻</span>
              </div>
            </div>
            
            <div class="status-indicator">
              <span class="status-dot" :class="{ 'active': enabled }"></span>
              <span class="status-text">
                {{ toggling ? '正在切换...' : (enabled ? '加速服务运行中' : '加速服务已关闭') }}
              </span>
            </div>
            
            <div class="active-node-info" v-if="enabled && activeNodeName">
              当前节点: <span class="node-highlight">{{ activeNodeName }}</span>
            </div>
          </div>
        </div>

        <div class="accelerator-tips-box">
          <h4>💡 加速说明</h4>
          <ul>
            <li>开启加速器可以加速 Steam 客户端应用商店页面加载及游戏满速下载，还有一些奇妙的用处</li>
          </ul>
        </div>
      </div>

      <!-- 右侧：节点列表与测速 -->
      <div class="main-content-wrapper">
        <div class="publisher-games-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h3 style="margin: 0;">🔗 极速加速节点</h3>
          <button 
            class="btn-speed-test-all" 
            :disabled="isTestingAll"
            @click="testAllNodesSpeed"
          >
            {{ isTestingAll ? '🚀 测速中...' : '🚀 一键测速' }}
          </button>
        </div>

        <div class="nodes-list">
          <div 
            v-for="(node, index) in nodes" 
            :key="node.id" 
            class="node-card"
            :class="{ 'selected': selectedNodeId === node.id, 'active-node': enabled && currentNodeId === node.id }"
            @click="selectNode(node.id)"
          >
            <div class="node-icon-wrapper">
              <span class="node-index-icon">{{ ['❶', '❷', '❸', '❹', '❺'][index] || '⚡' }}</span>
            </div>
            
            <div class="node-details">
              <h4 class="node-name">{{ node.name }}</h4>
              <p class="node-desc">专线低延迟加速通道</p>
            </div>
            
            <div class="node-actions" @click.stop>
              <!-- 延迟毫秒数 -->
              <span 
                v-if="latencies[node.id] !== undefined" 
                class="latency-badge"
                :class="getLatencyClass(latencies[node.id])"
              >
                {{ latencies[node.id] === -1 ? '超时' : `${latencies[node.id]} ms` }}
              </span>
              
              <button 
                class="btn-speed-test" 
                :disabled="testingId === node.id"
                @click="testNodeSpeed(node.id)"
              >
                {{ testingId === node.id ? '测试中...' : '测试延迟' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 封锁页面（未登录时渲染的高定极客锁区页面） -->
    <div v-else class="locked-body-container">
      <div class="locked-glass-card">
        <div class="lock-icon-wrapper">
          <div class="lock-ring ring-outer"></div>
          <div class="lock-ring ring-inner"></div>
          <div class="lock-glyph">🔒</div>
        </div>
        
        <h2 class="locked-title">加速器专区已封锁锁定</h2>
        <p class="locked-subtitle">
          需关联登录您的 Steam 账号后方可解锁并接管 Steam 客户端加速服务，为您智能分配专属的高速无延迟节点与电竞专线隧道。
        </p>
        
        <div class="locked-features-grid">
          <div class="feature-pill"><span class="pill-icon">⚡</span> 专线无延时智能穿透</div>
          <div class="feature-pill"><span class="pill-icon">🎮</span> Steam商店/社区秒开</div>
          <div class="feature-pill"><span class="pill-icon">🚀</span> 满速宽带极速下载游戏</div>
        </div>
        
        <button class="btn-unlock-login" @click="router.push('/login')">
          <span>立即登录关联 Steam 账号</span>
          <span class="arrow-icon">➔</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../store/game'
import request from '../api/request'

const router = useRouter()
const gameStore = useGameStore()

const enabled = ref(false)
const currentNodeId = ref(null)
const selectedNodeId = ref(1)
const toggling = ref(false)
const testingId = ref(null)

// 加速节点数据 (按节点一至节点五展示)
const nodes = ref([
  { id: 1, name: '节点一' },
  { id: 2, name: '节点二' },
  { id: 3, name: '节点三' },
  { id: 4, name: '节点四' },
  { id: 5, name: '节点五' }
])

const latencies = ref({})

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

const fetchStatus = async () => {
  try {
    const res = await request.get('/api/accelerator/status')
    if (res.data.code === 200) {
      enabled.value = res.data.data.enabled
      currentNodeId.value = res.data.data.currentNodeId
      if (currentNodeId.value) {
        selectedNodeId.value = currentNodeId.value
      }
    }
  } catch (err) {
    console.error('获取加速器状态失败:', err)
  }
}

const activeNodeName = computed(() => {
  if (!currentNodeId.value) return ''
  const node = nodes.value.find(n => n.id === currentNodeId.value)
  return node ? node.name : ''
})

const selectNode = (id) => {
  if (toggling.value) return
  selectedNodeId.value = id
}

const toggleAccelerator = async () => {
  if (!gameStore.steamUser) {
    alert('需关联登录 Steam 账号后，才可开启和使用 Steam 加速器！')
    router.push('/login')
    return
  }
  if (toggling.value) return
  toggling.value = true
  
  const targetState = !enabled.value
  const targetNodeId = selectedNodeId.value
  
  try {
    const res = await request.post('/api/accelerator/toggle', {
      enabled: targetState,
      nodeId: targetNodeId
    })
    
    if (res.data.code === 200) {
      enabled.value = targetState
      currentNodeId.value = targetState ? targetNodeId : null
    }
  } catch (err) {
    console.error('切换加速状态失败:', err)
    alert(err.response?.data?.message || '加速器配置失败')
  } finally {
    toggling.value = false
  }
}

const isTestingAll = ref(false)
const testAllNodesSpeed = async () => {
  if (!gameStore.steamUser) {
    alert('需关联登录 Steam 账号后，才可测速和使用 Steam 加速器！')
    router.push('/login')
    return
  }
  if (isTestingAll.value) return
  isTestingAll.value = true
  try {
    const promises = nodes.value.map(n => testNodeSpeed(n.id))
    await Promise.all(promises)
  } finally {
    isTestingAll.value = false
  }
}

const testNodeSpeed = async (id) => {
  if (!gameStore.steamUser) return
  testingId.value = id
  try {
    const res = await request.post('/api/accelerator/test-speed', { nodeId: id })
    if (res.data.code === 200) {
      latencies.value = {
        ...latencies.value,
        [id]: res.data.latency
      }
    }
  } catch (err) {
    console.error('测试速度失败:', err)
    latencies.value = {
      ...latencies.value,
      [id]: -1
    }
  } finally {
    testingId.value = null
  }
}

const getLatencyClass = (lat) => {
  if (lat === -1) return 'bad'
  if (lat < 120) return 'good'
  if (lat < 240) return 'medium'
  return 'bad'
}

onMounted(() => {
  initGamepads()
  if (!gameStore.steamUser) {
    // 未登录时仅显示背景手柄特效与锁区封锁页面，不再弹出 alert 和跳转
    return
  }
  fetchStatus()
  // 初始化时自动为所有节点测试一次速度
  nodes.value.forEach(n => testNodeSpeed(n.id))
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

.acc-logo-icon {
  font-size: 64px;
  color: #00f2fe;
  filter: drop-shadow(0 0 20px rgba(0, 242, 254, 0.6));
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
  grid-template-columns: 340px minmax(0, 1fr);
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

.power-card h3 {
  margin: 0 0 24px 0;
  font-size: 16px;
  color: #ffffff !important;
  font-weight: bold;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 10px;
}

.power-button-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
}

/* 巨型电源开关按钮 */
.power-btn {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  background: radial-gradient(circle, #1e293b 0%, #0f172a 100%);
  border: 4px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 10px 30px rgba(0,0,0,0.5), inset 0 2px 5px rgba(255,255,255,0.05);
  cursor: pointer;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.power-btn:hover {
  transform: scale(1.05);
  border-color: rgba(255, 255, 255, 0.15);
  box-shadow: 0 15px 40px rgba(0,0,0,0.6), 0 0 15px rgba(0, 242, 254, 0.1);
}

.power-btn:active {
  transform: scale(0.95);
}

/* 电源标志 */
.power-icon {
  font-size: 48px;
  color: #64748b;
  z-index: 5;
  transition: color 0.4s ease, text-shadow 0.4s ease;
}

.power-btn.active .power-icon {
  color: #00f2fe;
  text-shadow: 0 0 15px rgba(0, 242, 254, 0.8);
}

/* 呼吸涟漪特效环 */
.ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 2px solid #00f2fe;
  opacity: 0;
  z-index: 1;
  pointer-events: none;
}

.power-btn.active .ring-1 {
  animation: ripple 2s infinite ease-out;
}
.power-btn.active .ring-2 {
  animation: ripple 2s infinite ease-out 0.6s;
}
.power-btn.active .ring-3 {
  animation: ripple 2s infinite ease-out 1.2s;
}

@keyframes ripple {
  0% {
    transform: scale(1);
    opacity: 0.5;
  }
  100% {
    transform: scale(1.6);
    opacity: 0;
  }
}

.status-indicator {
  margin-top: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #64748b;
  box-shadow: 0 0 5px rgba(100, 116, 139, 0.5);
  transition: background 0.3s ease, box-shadow 0.3s ease;
}

.status-dot.active {
  background: #00f2fe;
  box-shadow: 0 0 12px rgba(0, 242, 254, 0.8);
}

.status-text {
  font-size: 14px;
  font-weight: bold;
  color: #f1f5f9;
}

.active-node-info {
  margin-top: 15px;
  font-size: 13px;
  color: #94a3b8;
}

.node-highlight {
  color: #00f2fe;
  font-weight: 700;
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

/* 节点卡片列表 */
.nodes-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 30px;
}

.node-card {
  display: flex;
  align-items: center;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 16px 20px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  justify-content: space-between;
}

.node-card:hover {
  background: rgba(15, 23, 42, 0.6);
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateX(4px);
}

.node-card.selected {
  border-color: #00f2fe;
  background: rgba(0, 242, 254, 0.04);
  box-shadow: 0 0 15px rgba(0, 242, 254, 0.05);
}

.node-card.active-node {
  border-color: #00f2fe;
  background: rgba(0, 242, 254, 0.08);
  box-shadow: 0 0 15px rgba(0, 242, 254, 0.1);
}

.node-icon-wrapper {
  font-size: 24px;
  color: #94a3b8;
  margin-right: 15px;
  display: flex;
  align-items: center;
}

.node-card.selected .node-index-icon,
.node-card.active-node .node-index-icon {
  color: #00f2fe;
}

.node-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.node-name {
  margin: 0 0 4px 0;
  font-size: 15px;
  font-weight: 700;
  color: #f1f5f9;
}

.node-desc {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.node-actions {
  display: flex;
  align-items: center;
  gap: 15px;
}

.latency-badge {
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: bold;
}

.latency-badge.good {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.latency-badge.medium {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.latency-badge.bad {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.btn-speed-test {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #f1f5f9;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-speed-test:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}

.btn-speed-test:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-speed-test-all {
  padding: 6px 14px;
  background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
  border: none;
  border-radius: 8px;
  color: #0f172a;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 242, 254, 0.3);
  transition: all 0.2s ease;
}

.btn-speed-test-all:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 242, 254, 0.45);
}

.btn-speed-test-all:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.accelerator-tips-box {
  margin-top: 20px;
  background: rgba(0, 242, 254, 0.03);
  border: 1px dashed rgba(0, 242, 254, 0.2);
  border-radius: 12px;
  padding: 20px;
}

.accelerator-tips-box h4 {
  margin: 0 0 12px 0;
  font-size: 15px;
  color: #00f2fe;
  font-weight: 700;
}

.accelerator-tips-box ul {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  color: #94a3b8;
  line-height: 1.8;
}

.accelerator-tips-box ul strong {
  color: #00f2fe;
}

/* ================== 未登录锁区封锁页面专属高级样式 ================== */
.locked-body-container {
  max-width: 860px;
  margin: 40px auto;
  padding: 0 24px;
  position: relative;
  z-index: 2;
}

.locked-glass-card {
  background: rgba(30, 41, 59, 0.65);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 242, 254, 0.25);
  border-radius: 24px;
  padding: 56px 40px;
  text-align: center;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 40px rgba(0, 242, 254, 0.08);
  position: relative;
  overflow: hidden;
  animation: lockCardFadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes lockCardFadeIn {
  from { opacity: 0; transform: translateY(24px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.lock-icon-wrapper {
  position: relative;
  width: 96px;
  height: 96px;
  margin: 0 auto 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lock-ring {
  position: absolute;
  border-radius: 50%;
  border: 2px solid #00f2fe;
}

.ring-outer {
  width: 100%;
  height: 100%;
  border-color: rgba(0, 242, 254, 0.2);
  animation: lockPulseRing 3s infinite ease-out;
}

.ring-inner {
  width: 76%;
  height: 76%;
  border-color: rgba(0, 242, 254, 0.45);
  animation: lockPulseRing 3s infinite ease-out 1.5s;
}

@keyframes lockPulseRing {
  0% { transform: scale(0.9); opacity: 0.8; }
  100% { transform: scale(1.35); opacity: 0; }
}

.lock-glyph {
  font-size: 44px;
  filter: drop-shadow(0 0 16px rgba(0, 242, 254, 0.8));
  animation: lockFloat 4s infinite ease-in-out;
}

@keyframes lockFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.locked-title {
  font-size: 28px;
  font-weight: 800;
  color: #ffffff;
  margin: 0 0 16px 0;
  letter-spacing: 1px;
  background: linear-gradient(135deg, #ffffff 0%, #a5f3fc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.locked-subtitle {
  font-size: 15px;
  color: #94a3b8;
  max-width: 620px;
  margin: 0 auto 36px;
  line-height: 1.8;
}

.locked-features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 16px;
  margin-bottom: 40px;
  text-align: left;
}

.feature-pill {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px 18px;
  font-size: 14px;
  color: #e2e8f0;
  display: flex;
  align-items: center;
  transition: all 0.3s ease;
}

.feature-pill:hover {
  background: rgba(0, 242, 254, 0.08);
  border-color: rgba(0, 242, 254, 0.3);
  transform: translateY(-2px);
}

.pill-icon {
  font-size: 18px;
  margin-right: 12px;
}

.btn-unlock-login {
  background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
  border: none;
  border-radius: 14px;
  padding: 16px 36px;
  font-size: 16px;
  font-weight: 700;
  color: #0b0f19;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 10px 25px rgba(0, 242, 254, 0.35);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.btn-unlock-login:hover {
  transform: translateY(-3px) scale(1.02);
  box-shadow: 0 15px 35px rgba(0, 242, 254, 0.55);
}

.btn-unlock-login:active {
  transform: translateY(0) scale(0.98);
}

.arrow-icon {
  font-size: 18px;
  transition: transform 0.3s ease;
}

.btn-unlock-login:hover .arrow-icon {
  transform: translateX(4px);
}

.locked-hint {
  margin-top: 24px;
  font-size: 13px;
  color: #64748b;
}
</style>
