const fs = require('fs').promises
const path = require('path')

// 针对运行环境自适应数据库路径：
// 1. 如果在 Electron 容器中运行，保存在系统的 AppData/Roaming 目录中以确保完全的写权限与跨版本数据持久化
// 2. 如果是 pkg 打包运行，保存在进程同级的 database.json 中
// 3. 开发环境下保存在当前代码同级的 database.json 中
let DB_PATH
try {
  const { app } = require('electron')
  if (app) {
    DB_PATH = path.join(app.getPath('userData'), 'database.json')
  } else {
    throw new Error('Not inside Electron main process')
  }
} catch (e) {
  const isPkg = typeof process.pkg !== 'undefined'
  DB_PATH = isPkg 
    ? path.join(process.cwd(), 'database.json') 
    : path.join(__dirname, 'database.json')
}

const DEFAULT_DB = {
  steamUser: null,
  apiKey: 'DFF99CB8CCF23AB32A7769B2BD9706AF',
  proxyUrl: '',
  userGames: {},
  games: []
}

async function ensureDbExists() {
  try {
    await fs.access(DB_PATH)
    const data = await fs.readFile(DB_PATH, 'utf-8')
    const parsed = JSON.parse(data)
    let modified = false
    if (!parsed.apiKey) {
      parsed.apiKey = 'DFF99CB8CCF23AB32A7769B2BD9706AF'
      modified = true
    }
    if (parsed.proxyUrl === undefined) {
      parsed.proxyUrl = ''
      modified = true
    }
    if (!parsed.userGames) {
      parsed.userGames = {}
      modified = true
    }
    if (modified) {
      await fs.writeFile(DB_PATH, JSON.stringify(parsed, null, 2), 'utf-8')
    }
  } catch (err) {
    await fs.writeFile(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2), 'utf-8')
  }
}

async function getData() {
  await ensureDbExists()
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8')
    return JSON.parse(data)
  } catch (err) {
    console.error('读取数据库文件失败，返回默认值:', err)
    return { ...DEFAULT_DB }
  }
}

async function saveData(data) {
  await ensureDbExists()
  try {
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch (err) {
    console.error('写入数据库文件失败:', err)
    return false
  }
}

async function getGames(steamId) {
  const data = await getData()
  if (!steamId) return []
  if (!data.userGames) data.userGames = {}
  return data.userGames[steamId] || []
}

async function saveGames(games, steamId) {
  const data = await getData()
  if (!steamId) return false
  if (!data.userGames) data.userGames = {}
  data.userGames[steamId] = games
  return await saveData(data)
}

async function getSteamUser() {
  const data = await getData()
  return data.steamUser
}

async function saveSteamUser(steamUser) {
  const data = await getData()
  data.steamUser = steamUser
  return await saveData(data)
}

async function getApiKey() {
  const data = await getData()
  return data.apiKey || 'DFF99CB8CCF23AB32A7769B2BD9706AF'
}

async function saveApiKey(apiKey) {
  const data = await getData()
  data.apiKey = apiKey
  return await saveData(data)
}

module.exports = {
  getData,
  saveData,
  getGames,
  saveGames,
  getSteamUser,
  saveSteamUser,
  getApiKey,
  saveApiKey
}
