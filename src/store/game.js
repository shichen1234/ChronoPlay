import { defineStore } from 'pinia'
import request from '../api/request'

export const useGameStore = defineStore('game', {
  state: () => ({
    games: [],
    steamUser: null,
    apiKeyConfigured: false,
    isSyncing: false
  }),
  actions: {
    async checkSession() {
      try {
        const res = await request.get('/api/auth/session')
        if (res.data.code === 200 && res.data.data) {
          this.steamUser = res.data.data.steamUser
          this.apiKeyConfigured = res.data.data.apiKeyConfigured
          return true
        } else {
          this.steamUser = null
          this.apiKeyConfigured = false
          return false
        }
      } catch (err) {
        console.error('检查登录会话失败:', err)
        this.steamUser = null
        this.apiKeyConfigured = false
        return false
      }
    },
    async logout() {
      const res = await request.post('/api/auth/logout')
      if (res.data.code === 200) {
        this.steamUser = null
        this.apiKeyConfigured = false
        this.games = []
      }
    },
    async saveApiKey(apiKey) {
      try {
        const res = await request.post('/api/auth/key', { apiKey })
        if (res.data.code === 200) {
          this.apiKeyConfigured = true
          return true
        }
        return false
      } catch (err) {
        console.error('保存 API 密钥失败:', err)
        return false
      }
    },
    async fetchGames() {
      this.isSyncing = true
      try {
        const res = await request.get('/api/games/list')
        if (res.data.code === 200) {
          this.games = res.data.data
        }
      } catch (err) {
        console.error('获取游戏列表失败:', err)
      } finally {
        this.isSyncing = false
      }
    }
  }
})
