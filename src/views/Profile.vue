<template>
  <div class="profile-page">
    <!-- Translucent button to return to own profile if viewing a friend -->
    <button v-if="isViewingFriend" class="back-to-my-profile-btn" @click="router.push('/profile')">
      🏠 返回我的主页
    </button>

    <!-- Dynamic WebM/MP4 Video Background -->
    <video 
      v-if="profile && profile.profileBackgroundVideo" 
      :key="profile.profileBackgroundVideo"
      autoplay 
      loop 
      muted 
      playsinline 
      class="profile-bg-video"
    >
      <source :src="profile.profileBackgroundVideo" type="video/mp4" />
    </video>
    
    <!-- Static Fallback Image Background -->
    <div 
      v-else-if="profile && profile.profileBackground" 
      :key="profile.profileBackground"
      class="profile-bg-static"
      :style="{ backgroundImage: `url(${profile.profileBackground})` }"
    ></div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-container">
      <div class="spinner"></div>
      <p class="loading-text">加载个人资料中...</p>
    </div>

    <!-- Profile Content -->
    <div v-else-if="profile" class="profile-wrapper">
      <div class="profile-card">
        <!-- Avatar Section -->
        <div class="avatar-section">
          <div class="avatar-container">
            <img class="avatar-img" :src="profile.avatarfull" alt="avatar" />
            <img v-if="profile.avatarFrame" class="avatar-frame" :src="profile.avatarFrame" alt="avatar frame" />
            <span class="status-dot" :style="{ backgroundColor: statusColor }"></span>
          </div>
        </div>

        <!-- User Info -->
        <div class="user-info">
          <div class="username-row">
            <h1 class="username">{{ profile.personaname }}</h1>
            <div class="level-badge" :style="{ borderColor: levelColor }">
              <span class="level-number">{{ profile.playerLevel }}</span>
            </div>
          </div>
          <p class="status-text" :style="{ color: statusColor }">{{ statusText }}</p>
        </div>

        <!-- Details -->
        <div class="details-section">
          <div class="detail-item">
            <span class="detail-label">Steam ID</span>
            <span class="detail-value">{{ profile.steamid }}</span>
          </div>
          <div v-if="profile.loccountrycode" class="detail-item">
            <span class="detail-label">地区</span>
            <span class="detail-value">{{ profile.loccountrycode }}</span>
          </div>
          <div v-if="profile.timecreated" class="detail-item">
            <span class="detail-label">注册时间</span>
            <span class="detail-value">{{ formattedDate }}</span>
          </div>
        </div>

        <!-- Friends List Section -->
        <div class="friends-section" v-if="friends && friends.length > 0">
          <h2 class="section-title">
            {{ isViewingFriend ? '他的 Steam 好友' : '我的 Steam 好友' }}
          </h2>
          <div class="friends-list">
            <div 
              v-for="friend in friends" 
              :key="friend.steamid" 
              class="friend-item"
              @click="navigateToFriend(friend.steamid)"
            >
              <div class="friend-avatar-container">
                <img :src="friend.avatar" class="friend-avatar" alt="avatar" />
                <img v-if="friend.avatarFrame" :src="friend.avatarFrame" class="friend-frame" alt="frame" />
              </div>
              <span class="friend-name">{{ friend.personaname }}</span>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="actions">
          <button class="action-btn primary" @click="openSteamProfile">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            <span>打开 Steam 个人资料</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Error State -->
    <div v-else class="loading-container">
      <p class="loading-text">无法加载个人资料</p>
      <button class="action-btn primary" style="margin-top: 16px;" @click="router.back()">返回</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import request from '../api/request'
import { useGameStore } from '../store/game'

defineOptions({ name: 'Profile' })

const route = useRoute()
const router = useRouter()
const gameStore = useGameStore()

const profile = ref(null)
const friends = ref([])
const loading = ref(true)

// 根据路由参数自适应获取目标 SteamID，未指定则获取当前登录用户
const steamid = computed(() => route.params.steamid || gameStore.steamUser?.steamid)

// 判断当前是否在浏览好友的空间
const isViewingFriend = computed(() => {
  return route.params.steamid && route.params.steamid !== gameStore.steamUser?.steamid
})

// Persona state mapping
const stateMap = {
  0: { text: '离线', color: '#8b8b8b' },
  1: { text: '在线', color: '#2ecc71' },
  2: { text: '忙碌', color: '#e74c3c' },
  3: { text: '离开', color: '#f39c12' },
  4: { text: '打盹', color: '#f39c12' },
  5: { text: '想交易', color: '#00f2fe' },
  6: { text: '想游戏', color: '#2ecc71' }
}

const statusText = computed(() => {
  const state = profile.value?.personastate
  return stateMap[state]?.text ?? '未知'
})

const statusColor = computed(() => {
  const state = profile.value?.personastate
  return stateMap[state]?.color ?? '#8b8b8b'
})

// Level badge color
const levelColor = computed(() => {
  const level = profile.value?.playerLevel ?? 0
  if (level >= 100) return '#9b59b6'
  if (level >= 50) return '#4bb5c1'
  if (level >= 40) return '#59a648'
  if (level >= 30) return '#e8a631'
  if (level >= 20) return '#d95b43'
  if (level >= 10) return '#c02942'
  return '#8b8b8b'
})

// Formatted creation date
const formattedDate = computed(() => {
  if (!profile.value?.timecreated) return ''
  const date = new Date(profile.value.timecreated * 1000)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
})

function openSteamProfile() {
  if (profile.value?.profileurl) {
    window.open(profile.value.profileurl, '_blank')
  }
}

// 核心加载逻辑
const fetchProfile = async () => {
  if (!steamid.value) {
    loading.value = false
    return
  }
  loading.value = true
  
  // 关键修复：在开始发起新请求前，清空先前的 profile 缓存，从而只展示目标背景，好友空间背景不残留
  profile.value = null
  
  try {
    const res = await request.get(`/api/user/profile/${steamid.value}`)
    if (res.data?.code === 200 && res.data?.data) {
      profile.value = res.data.data
    }
  } catch (e) {
    console.error('Failed to load profile:', e)
  } finally {
    loading.value = false
  }
}

const fetchFriends = async () => {
  if (!steamid.value) return
  try {
    const res = await request.get(`/api/user/friends/${steamid.value}`)
    if (res.data?.code === 200) {
      friends.value = res.data.data || []
    }
  } catch (e) {
    console.error('Failed to load friends:', e)
  }
}

// 监听路由参数变化，实现流畅的跨好友空间切换
watch(steamid, () => {
  fetchProfile()
  fetchFriends()
}, { immediate: true })

const navigateToFriend = (friendId) => {
  router.push(`/profile/${friendId}`)
}
</script>

<style scoped>
/* Layout root matches the template */
.profile-page {
  position: relative;
  width: 100%;
  height: 100vh;
  background-color: #0b0b0f;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.profile-bg-video,
.profile-bg-static {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
  pointer-events: none;
}

.back-to-my-profile-btn {
  position: absolute;
  top: 24px;
  left: 24px;
  z-index: 10;
  background: rgba(11, 11, 15, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fff;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  font-size: 13px;
  font-weight: 600;
  transition: background 0.2s, border-color 0.2s, transform 0.2s;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}
.back-to-my-profile-btn:hover {
  background: rgba(11, 11, 15, 0.85);
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateY(-1px);
}

/* Loading */
.loading-container {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  animation: fadeIn 0.4s ease;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: #2997ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.loading-text {
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
}

/* Profile Wrapper */
.profile-wrapper {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 600px;
  padding: 24px;
  animation: fadeIn 0.6s ease;
}

/* Profile Card */
.profile-card {
  position: relative;
  background: rgba(11, 11, 15, 0.7);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 40px 32px 32px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
}


/* Avatar Section */
.avatar-section {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
}

.avatar-container {
  position: relative;
  width: 110px;
  height: 110px;
}

.avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid rgba(255, 255, 255, 0.1);
}

.avatar-frame {
  position: absolute;
  top: -15px;
  left: -15px;
  width: 140px;
  height: 140px;
  pointer-events: none;
  max-width: none;
}

.status-dot {
  position: absolute;
  bottom: 6px;
  right: 6px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 3px solid #0f172a;
}

/* User Info */
.user-info {
  text-align: center;
  margin-bottom: 24px;
}

.username-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 6px;
}

.username {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  margin: 0;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
}

.level-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid;
  background: rgba(0, 0, 0, 0.4);
}

.level-number {
  font-size: 12px;
  font-weight: 700;
  color: #fff;
}

.status-text {
  font-size: 14px;
  font-weight: 500;
  margin: 0;
}

/* Details Section */
.details-section {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 24px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 14px;
}

.detail-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.detail-item:first-child {
  padding-top: 0;
}

.detail-label {
  color: rgba(255, 255, 255, 0.5);
}

.detail-value {
  color: #fff;
  font-family: monospace;
}

/* Friends Section */
.friends-section {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 20px;
  margin-bottom: 24px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 14px 0;
  text-align: left;
  letter-spacing: 0.5px;
}

.friends-list {
  display: flex;
  gap: 20px;
  overflow-x: auto;
  padding: 4px 0 16px 0;
  /* 确保横向滑动条可见并提供舒适拖拽控制 */
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.25) rgba(255, 255, 255, 0.05);
}

/* Chrome/Safari/Edge Scrollbar styles */
.friends-list::-webkit-scrollbar {
  height: 8px;
  display: block !important;
}
.friends-list::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}
.friends-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.25);
  border-radius: 4px;
}
.friends-list::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.4);
}

.friend-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  width: 80px;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.friend-item:hover {
  transform: scale(1.05);
}

.friend-avatar-container {
  position: relative;
  width: 48px;
  height: 48px;
}

.friend-avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.friend-frame {
  position: absolute;
  top: -6px;
  left: -6px;
  width: 60px;
  height: 60px;
  pointer-events: none;
  max-width: none;
}

.friend-name {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Actions */
.actions {
  display: flex;
  justify-content: center;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: none;
  border: none;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  padding: 12px 24px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  width: 100%;
}

.action-btn.primary {
  background: #2997ff;
  color: #fff;
  box-shadow: 0 4px 15px rgba(41, 151, 255, 0.3);
}

.action-btn.primary:hover {
  background: #0077ee;
  transform: translateY(-2px);
}

/* Keyframes */
@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
