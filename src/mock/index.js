import Mock from 'mockjs'

// 1. 让 MockJS 启动时，先去 localStorage 看看有没有你存过的数据
const localData = localStorage.getItem('my_game_collection_v3')

// 2. 如果本地有数据，就用本地的；如果是第一次进网站（没数据），才用默认的这几个
let gameList = localData ? JSON.parse(localData) : [
  { 
    id: 1, name: 'DOOM Eternal', status: '正在游玩', playtime: '45小时', cover: '🔥', 
    desc: '撕碎并扯烂！地狱军团入侵了地球。化身毁灭战士，在跨越各个维度的史诗级单人战役中斩妖除魔。', tags: ['FPS', '动作', '硬核'], bg: 'linear-gradient(135deg, #ff416c, #ff4b2b)'
  },
  { 
    id: 2, name: '我的世界 (Bedrock)', status: '正在游玩', playtime: '200+小时', cover: '🟫', 
    desc: '探索无限的世界，建造各种事物。在创造模式中体验无限资源，或在生存模式中深入世界。', tags: ['沙盒', '生存', '建造'], bg: 'linear-gradient(135deg, #56ab2f, #a8e063)'
  },
  { 
    id: 3, name: '冰与火之舞', status: '正在游玩', playtime: '30小时', cover: '❄️', 
    desc: '一款高难度单按键节奏游戏。控制盘旋的冰与火双星，跟随音乐的节奏在轨道上不断前行。', tags: ['音游', '独立', '节奏'], bg: 'linear-gradient(135deg, #36d1dc, #5b86e5)'
  },
  { 
    id: 4, name: '使命召唤：现代战争', status: '正在游玩', playtime: '120小时', cover: '🔫', 
    desc: '准备好暗转。经典系列重启，体验极具沉浸感的单人战役与快节奏的多人对战模式。', tags: ['FPS', '射击', '多人'], bg: 'linear-gradient(135deg, #3f4c6b, #606c88)'
  },
  { 
    id: 5, name: '赛博朋克 2077', status: '吃灰中', playtime: '80小时', cover: '🌃', 
    desc: '夜之城，一个对力量、魅力和身体改造痴迷的巨型都市。化身雇佣兵 V，寻找永生的关键。', tags: ['RPG', '开放世界', '科幻'], bg: 'linear-gradient(135deg, #fceabb, #f8b500)'
  },
  { 
    id: 6, name: '空洞骑士', status: '吃灰中', playtime: '65小时', cover: '💀', 
    desc: '在错综复杂的地下昆虫王国中探索、战斗。经典的银河恶魔城风格，极致的 2D 动作体验。', tags: ['类银河恶魔城', '2D', '困难'], bg: 'linear-gradient(135deg, #141e30, #243b55)'
  },
  { 
    id: 7, name: '双人成行', status: '正在游玩', playtime: '15小时', cover: '👫', 
    desc: '踏上生命中最疯狂的旅程。这是一款专门为双人合作设计的平台冒险游戏，充满各种意想不到的挑战。', tags: ['合作', '冒险', '解谜'], bg: 'linear-gradient(135deg, #74ebd5, #acb6e5)'
  }

]

// 封装一个函数：每次后台数据有变化，立刻同步到本地抽屉
const saveToLocal = () => {
  localStorage.setItem('my_game_collection_v3', JSON.stringify(gameList))
}

// ================= 模拟接口 =================

// 1. 获取列表数据 (每次刷新页面，Pinia 都会调用这个接口)
Mock.mock('/api/games/list', 'get', () => {
  return { code: 200, message: '获取成功', data: gameList }
})
     
// 2. 新增数据
Mock.mock('/api/games/update', 'post', (options) => {
  const newGame = JSON.parse(options.body)
  newGame.id = Date.now()
  // 随机分配一个炫酷渐变背景（如果前端没传的话）
  if (!newGame.bg) {
    const colors = ['#f12711, #f5af19', '#834d9b, #d04ed6', '#11998e, #38ef7d', '#36d1dc, #5b86e5']
    newGame.bg = `linear-gradient(135deg, ${colors[Math.floor(Math.random() * colors.length)]})`
  }
  
  gameList.unshift(newGame) 
  
  // 核心：模拟后台保存成功后，立马写入 localStorage！
  saveToLocal() 
  
  return { code: 200, message: '新增成功' }
})

// 3. 删除数据
Mock.mock(/\/api\/games\/update\/\d+/, 'delete', (options) => {
  const id = parseInt(options.url.split('/').pop())
  gameList = gameList.filter(game => game.id !== id)
  
  // 核心：模拟后台删除成功后，也要同步写入 localStorage！
  saveToLocal() 
  
  return { code: 200, message: '删除成功' }
})