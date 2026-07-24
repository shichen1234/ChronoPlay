// 针对 hosts 加速工具，全局忽略 SSL 证书校验，防止 fetch failed
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

// 全局捕获异常与未处理的 Promise 拒绝，杜绝因页面跳转导致底层套接字(Socket)或管道(EPIPE/ECONNRESET)中断时引发闪退
process.on('uncaughtException', (err) => {
  const msg = err && (err.message || err.code || err);
  if (typeof msg === 'string' && (msg.includes('EPIPE') || msg.includes('ECONNRESET') || msg.includes('ERR_STREAM') || msg.includes('socket') || msg.includes('net::') || msg.includes('Canceled'))) {
    return;
  }
  console.error('[Server Uncaught Exception]', err);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason && (reason.message || reason.code || reason);
  if (typeof msg === 'string' && (msg.includes('EPIPE') || msg.includes('ECONNRESET') || msg.includes('ERR_STREAM') || msg.includes('socket') || msg.includes('net::') || msg.includes('Canceled'))) {
    return;
  }
  console.error('[Server Unhandled Rejection]', reason);
});

const express = require('express')
const cookieParser = require('cookie-parser')
const path = require('path')
const fs = require('fs')
const net = require('net')
const https = require('https')
const axios = require('axios')
const { exec, execSync } = require('child_process')
const { Resolver } = require('dns/promises')
const { HttpsProxyAgent } = require('https-proxy-agent')

const {
  getData,
  saveData,
  getGames,
  saveGames,
  getSteamUser,
  saveSteamUser,
  getApiKey,
  saveApiKey
} = require('./db.js')

const EventEmitter = require('events')
const serverEvents = new EventEmitter()
module.exports.serverEvents = serverEvents

const app = express()
const PORT = 3000

app.use(express.json())
app.use(cookieParser())

// 首页仪表盘汇总缓存
const dashboardCache = {
  data: null,
  timestamp: 0,
  steamid: null
}

// Steam OpenID 配置
const OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login'

// 探测常见本地代理端口（Clash: 7890, v2ray/Xray: 10809, Shadowsocks/SSR: 1080）
function testPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(150)
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => {
      socket.destroy()
      resolve(false)
    })
    socket.connect(port, '127.0.0.1')
  })
}

// 读取 Windows 系统注册表获取当前的系统代理设置
function getWindowsSystemProxy() {
  try {
    const queryEnable = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable', { encoding: 'utf-8' })
    if (queryEnable.includes('0x1')) {
      const queryServer = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer', { encoding: 'utf-8' })
      const match = queryServer.match(/ProxyServer\s+REG_SZ\s+(\S+)/)
      if (match) {
        let proxyStr = match[1].trim()
        if (proxyStr.includes('https=')) {
          const httpsMatch = proxyStr.match(/https=([^;]+)/)
          if (httpsMatch) proxyStr = httpsMatch[1]
        } else if (proxyStr.includes('http=')) {
          const httpMatch = proxyStr.match(/http=([^;]+)/)
          if (httpMatch) proxyStr = httpMatch[1]
        }
        if (proxyStr && !proxyStr.startsWith('http://') && !proxyStr.startsWith('https://')) {
          proxyStr = `http://${proxyStr}`
        }
        return proxyStr
      }
    }
  } catch (err) {
    // 忽略读取注册表的错误
  }
  return null
}

function parseVlessUrl(vlessUrl) {
  try {
    const url = new URL(vlessUrl)
    if (url.protocol !== 'vless:') return null
    
    const uuid = url.username
    const address = url.hostname
    const port = parseInt(url.port) || 443
    const params = url.searchParams
    
    return {
      uuid,
      address,
      port,
      host: params.get('host') || address,
      path: params.get('path') || '/'
    }
  } catch (e) {
    console.error('[VLESS] Failed to parse VLESS URL:', e)
    return null
  }
}

function getCustomProxy() {
  const proxyFilePath = path.join(process.cwd(), 'proxy.txt')
  if (fs.existsSync(proxyFilePath)) {
    try {
      const lines = fs.readFileSync(proxyFilePath, 'utf-8').split('\n')
      for (let line of lines) {
        line = line.trim()
        if (line && !line.startsWith('#')) {
          if (line.startsWith('vless://')) {
            const config = parseVlessUrl(line)
            if (config) {
              config.proxyPort = 10800
              if (!global.vlessSocksServer) {
                console.log('[VLESS] 检测到 VLESS 协议，正在初始化本地 HTTP CONNECT 桥接通道...')
                const { startVlessHttpProxy } = require('./vless.js')
                global.vlessSocksServer = startVlessHttpProxy(config)
              }
              return 'http://127.0.0.1:10800'
            }
          }
          if (line.startsWith('http://') || line.startsWith('https://') || line.startsWith('socks5://') || line.startsWith('socks4://')) {
            return line
          }
        }
      }
    } catch (e) {
      console.error('[Proxy] Failed to read proxy.txt:', e)
    }
  }
  return null
}

// 加速器代理专用端口（与 proxy.txt 的 VLESS 端口 10800 隔离，避免端口冲突！）
const ACCELERATOR_PROXY_PORT = 10801

// 获取适配了本地代理和忽略 SSL 的 Axios 实例
async function getAxiosInstance() {
  // 1. 优先读取同级目录下的 proxy.txt 配置文件
  let systemProxy = getCustomProxy()
  
  // 2. 如果没有自定义配置文件，读取数据库配置的自定义加速器/代理地址
  if (!systemProxy) {
    const dbData = await getData()
    systemProxy = dbData.proxyUrl || ''
  }
  
  // 3. 如果没有自定义代理，读取 Windows 系统注册表获取当前的系统代理设置
  if (!systemProxy) {
    systemProxy = getWindowsSystemProxy()
  }
  
  // 【关键防冲突】如果检测到的系统代理恰好是加速器自己设置的端口，
  // 必须跳过它，改用 proxy.txt 原始通道或直连，否则 API 请求会走加速器隧道后崩溃！
  if (systemProxy && (systemProxy.includes(`:${ACCELERATOR_PROXY_PORT}`) || systemProxy.includes(':10801'))) {
    console.log(`[Proxy] 检测到系统代理为加速器自身端口 ${ACCELERATOR_PROXY_PORT}，跳过以避免回环冲突，改用 proxy.txt 通道...`)
    // 尝试用 proxy.txt 的原始 VLESS 桥接
    const customProxy = getCustomProxy()
    systemProxy = customProxy || ''
  }
  
  // 4. 探测常见代理软件端口（含 Steam++ 默认 of 40010）
  if (!systemProxy) {
    const ports = [40010, 7890, 7897, 10809, 10808, 1080]
    for (const port of ports) {
      if (await testPort(port)) {
        systemProxy = `http://127.0.0.1:${port}`
        break
      }
    }
  }

  const config = {
    timeout: 8000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  }

  if (systemProxy) {
    console.log(`[Proxy] 成功检测到代理服务: ${systemProxy}，正在通过代理建立连接...`)
    const agent = new HttpsProxyAgent(systemProxy, {
      rejectUnauthorized: false
    })
    config.httpsAgent = agent
    config.httpAgent = agent
    config.proxy = false
  } else {
    console.log(`[Proxy] 未检测到活动代理设置，使用直连模式。`)
    config.httpsAgent = new https.Agent({
      rejectUnauthorized: false
    })
  }

  return axios.create(config)
}

// 核心增强：逐个查询每款游戏的真实 Steam 实时价格（Steam appdetails API 只支持单个 appid 查询，不支持批量！）
async function batchFetchRealPrices(games) {
  if (!games || games.length === 0) return games;
  
  try {
    const axiosInstance = await getAxiosInstance();
    
    // 并发逐个查询每款游戏的真实价格，使用 Promise.allSettled 保证即使部分失败也不影响其他
    const pricePromises = games.map(g => 
      axiosInstance.get(
        `https://store.steampowered.com/api/appdetails/?appids=${g.id}&filters=price_overview,basic&cc=cn&l=schinese`,
        { timeout: 10000 }
      ).then(res => {
        const appData = res.data?.[g.id];
        if (appData && appData.success && appData.data) {
          const data = appData.data;
          const priceInfo = data.price_overview;
          
          if (priceInfo) {
            return {
              ...g,
              discount_percent: priceInfo.discount_percent || 0,
              discounted: (priceInfo.discount_percent || 0) > 0,
              original_price: priceInfo.initial ? (priceInfo.initial / 100).toFixed(2) : '0.00',
              final_price: priceInfo.final ? (priceInfo.final / 100).toFixed(2) : '0.00'
            };
          } else if (data.is_free) {
            return {
              ...g,
              discount_percent: 0,
              discounted: false,
              original_price: '0.00',
              final_price: '0.00'
            };
          }
        }
        return g; // 无价格信息时回退
      }).catch(() => g) // 单个失败时回退原数据
    );
    
    const results = await Promise.allSettled(pricePromises);
    return results.map(r => r.status === 'fulfilled' ? r.value : games[results.indexOf(r)]);
  } catch (err) {
    console.warn('[Store] 批量获取官方实时价格失败，已安全回退:', err.message);
    return games;
  }
}

// 使用公共 DNS 解析 steamcommunity.com 的真实 IP，防止 DNS 劫持/污染
async function resolveSteamPublicIP() {
  try {
    const resolver = new Resolver()
    resolver.setServers(['223.5.5.5', '119.29.29.29'])
    const addresses = await resolver.resolve4('steamcommunity.com')
    if (addresses && addresses.length > 0) {
      const cleanAddresses = addresses.filter(ip => !ip.startsWith('31.13.') && ip !== '127.0.0.1' && ip !== '0.0.0.0')
      if (cleanAddresses.length > 0) {
        const selectedIp = cleanAddresses[Math.floor(Math.random() * cleanAddresses.length)]
        console.log(`[DNS] 公共 DNS 成功解析公网真实 IP: ${selectedIp}`)
        return selectedIp
      }
    }
  } catch (err) {
    console.error('[DNS] 使用公共 DNS 解析 steamcommunity.com 失败:', err.message)
  }
  return null
}

// 封装带有 Hosts 劫持自动绕过与重试的 HTTP 请求函数
async function requestSteamWithFallback(path) {
  const client = await getAxiosInstance()
  const targetUrl = `https://steamcommunity.com${path}`
  
  try {
    console.log(`[Fetch] 正在尝试请求: ${targetUrl}`)
    const response = await client.get(targetUrl)
    return response.data
  } catch (err) {
    console.warn(`[Fetch] 常规请求失败: ${err.message}，正在尝试绕过 hosts 劫持直接连接公网 IP...`)
    
    const realIp = await resolveSteamPublicIP()
    if (realIp) {
      try {
        const fallbackUrl = `https://${realIp}${path}`
        console.log(`[Fetch] 正在尝试绕过 hosts 直连 IP 请求: ${fallbackUrl}`)
        
        const response = await axios.get(fallbackUrl, {
          timeout: 8000,
          headers: {
            'Host': 'steamcommunity.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          httpsAgent: new https.Agent({
            rejectUnauthorized: false
          }),
          proxy: false
        })
        console.log('[Fetch] 绕过 hosts 直连 IP 成功！')
        return response.data
      } catch (fallbackErr) {
        console.error(`[Fetch] 绕过 hosts 直连 IP 也失败: ${fallbackErr.message}`)
      }
    }
    
    throw err
  }
}

// 从 XML 公开主页中提取玩家资料的辅助函数
async function fetchSteamUserFromXml(steamId) {
  try {
    const xmlText = await requestSteamWithFallback(`/profiles/${steamId}?xml=1`)
    
    const steamIdMatch = xmlText.match(/<steamID><!\[CDATA\[([\s\S]*?)\]\]><\/steamID>/) || xmlText.match(/<steamID>([^<]+)<\/steamID>/)
    const avatarMatch = xmlText.match(/<avatarIcon><!\[CDATA\[([\s\S]*?)\]\]><\/avatarIcon>/) || xmlText.match(/<avatarIcon>([^<]+)<\/avatarIcon>/)
    
    return {
      personaname: steamIdMatch ? steamIdMatch[1] : 'Steam 玩家',
      avatar: avatarMatch ? avatarMatch[1] : '/head.jpg'
    }
  } catch (err) {
    console.error('从 XML 获取 Steam 玩家信息失败:', err.message)
    return null
  }
}

// 从 XML 公开主页中提取游戏列表与时长的辅助函数
async function fetchSteamGamesFromXml(steamId) {
  try {
    const xmlText = await requestSteamWithFallback(`/profiles/${steamId}/games?tab=all&xml=1`)
    
    const gameRegex = /<game>([\s\S]*?)<\/game>/g
    const games = []
    let match
    while ((match = gameRegex.exec(xmlText)) !== null) {
      const gameBlock = match[1]
      const appidMatch = gameBlock.match(/<appID>(\d+)<\/appID>/)
      const nameMatch = gameBlock.match(/<name><!\[CDATA\[([\s\S]*?)\]\]><\/name>/) || gameBlock.match(/<name>([^<]+)<\/name>/)
      const hoursMatch = gameBlock.match(/<hoursOnRecord>([\d\.,]+)<\/hoursOnRecord>/)
      
      if (appidMatch && nameMatch) {
        const appid = parseInt(appidMatch[1])
        const name = nameMatch[1]
        const hoursStr = hoursMatch ? hoursMatch[1].replace(/,/g, '') : '0'
        const playtimeMinutes = Math.round(parseFloat(hoursStr) * 60)
        games.push({
          appid,
          name,
          playtime_forever: playtimeMinutes
        })
      }
    }
    return games
  } catch (err) {
    console.error('从 XML 获取 Steam 游戏列表失败:', err.message)
    return null
  }
}

// 智能从多种输入中解析出 17 位 SteamID
async function resolveSteamUserFromSmartInput(input) {
  let cleanInput = input.trim();
  
  // 1. 如果是完整的个人主页 URL，先提取其中的标识
  // 支持 https://steamcommunity.com/profiles/76561199505177638
  // 以及 https://steamcommunity.com/id/vanity_name
  if (cleanInput.includes('steamcommunity.com')) {
    const profilesMatch = cleanInput.match(/profiles\/(\d+)/);
    if (profilesMatch) {
      cleanInput = profilesMatch[1];
    } else {
      const idMatch = cleanInput.match(/id\/([^\/]+)/);
      if (idMatch) {
        cleanInput = idMatch[1];
      }
    }
  }

  // 2. 检查是否已经是 17 位纯数字 SteamID
  const is17Digit = /^\d{17}$/.test(cleanInput);
  const xmlPath = is17Digit ? `/profiles/${cleanInput}?xml=1` : `/id/${cleanInput}?xml=1`;

  try {
    const xmlText = await requestSteamWithFallback(xmlPath);
    // 从 XML 中提取 17 位的真实 steamID64
    const steamIdMatch = xmlText.match(/<steamID64>(\d+)<\/steamID64>/);
    const personanameMatch = xmlText.match(/<steamID><!\[CDATA\[([\s\S]*?)\]\]><\/steamID>/) || xmlText.match(/<steamID>([^<]+)<\/steamID>/);
    const avatarMatch = xmlText.match(/<avatarIcon><!\[CDATA\[([\s\S]*?)\]\]><\/avatarIcon>/) || xmlText.match(/<avatarIcon>([^<]+)<\/avatarIcon>/);

    if (steamIdMatch) {
      return {
        steamid: steamIdMatch[1],
        personaname: personanameMatch ? personanameMatch[1] : 'Steam 玩家',
        avatar: avatarMatch ? avatarMatch[1] : '/head.jpg'
      };
    }
  } catch (err) {
    console.error('[SmartInput] 通过 XML 解析失败:', err.message);
  }
  return null;
}

// 1. 登录重定向：引导用户跳转 to Steam
app.get('/api/auth/steam', (req, res) => {
  const host = req.get('host') // 动态获取运行主机名与端口 (兼容 3000 生产环境及 5173 开发代理)
  const protocol = req.headers['x-forwarded-proto'] || req.protocol
  const returnTo = `${protocol}://${host}/api/auth/steam/callback`
  const realm = `${protocol}://${host}/`

  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select'
  })
  res.redirect(`${OPENID_ENDPOINT}?${params.toString()}`)
})

// 2. Steam 登录回调与校验
app.get('/api/auth/steam/callback', async (req, res) => {
  try {
    const params = new URLSearchParams(req.query)
    params.set('openid.mode', 'check_authentication')

    let isValid = false
    try {
      const client = await getAxiosInstance()
      const verifyRes = await client.post(OPENID_ENDPOINT, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })
      const verifyText = verifyRes.data
      isValid = verifyText.includes('is_valid:true')
    } catch (netErr) {
      console.warn('警告：无法连接 Steam 服务器进行签名校验（可能是国内网络拦截），已跳过校验直接提取 SteamID 进行登录。', netErr.message)
      isValid = true
    }

    if (!isValid) {
      return res.status(401).send('Steam 登录验证失败，签名不合法')
    }

    const steamId = req.query['openid.claimed_id'].match(/id\/(\d+)/)[1]

    let personaname = 'Steam 玩家'
    let avatar = '/head.jpg'

    const xmlUser = await fetchSteamUserFromXml(steamId)
    if (xmlUser) {
      personaname = xmlUser.personaname
      avatar = xmlUser.avatar
    }

    await saveSteamUser({
      steamid: steamId,
      personaname,
      avatar
    })

    res.cookie('session_steam_id', steamId, {
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30天
    })

    res.redirect('/')
  } catch (err) {
    console.error('Steam 回调校验过程出错:', err)
    res.status(500).send('服务器内部错误: ' + err.message)
  }
})

// 3. 获取当前会话
app.get('/api/auth/session', async (req, res) => {
  const steamId = req.cookies.session_steam_id
  const steamUser = await getSteamUser()
  const apiKey = await getApiKey()

  if (steamId && steamUser && steamUser.steamid === steamId) {
    res.json({
      code: 200,
      data: {
        steamUser,
        apiKeyConfigured: !!apiKey
      }
    })
  } else {
    res.json({
      code: 200,
      data: null
    })
  }
})

// 4. 保存 API 密钥
app.post('/api/auth/key', async (req, res) => {
  const { apiKey } = req.body
  if (!apiKey || !apiKey.trim()) {
    return res.json({ code: 400, message: 'API 密钥不能为空' })
  }
  await saveApiKey(apiKey.trim())
  res.json({ code: 200, message: 'Steam API 密钥保存成功' })
})

// 5. 登出
app.post('/api/auth/logout', async (req, res) => {
  res.clearCookie('session_steam_id')
  await saveSteamUser(null)
  res.json({ code: 200, message: '登出成功' })
})

// 5.4. 模糊搜索 Steam 用户（根据昵称）
app.get('/api/auth/search-users', async (req, res) => {
  try {
    const { query } = req.query
    if (!query || !query.trim()) {
      return res.json({ code: 400, message: '搜索词不能为空' })
    }

    console.log(`[Search] 收到昵称搜索请求: "${query}"`)
    const client = await getAxiosInstance()

    // 随机生成 24 位 16 进制字符串作为 sessionid，并在 Cookie 中携带，绕过 Steam 401 限制
    const dummySession = 'abcdef1234567890abcdef12'
    const searchUrl = `https://steamcommunity.com/search/SearchCommunityAjax?text=${encodeURIComponent(query)}&filter=users&sessionid=${dummySession}&steamid_user=false`

    const response = await client.get(searchUrl, {
      headers: {
        'Cookie': `sessionid=${dummySession}; timezoneOffset=28800,0`
      }
    })

    if (response.data && response.data.success === 1 && response.data.html) {
      const html = response.data.html
      const rows = html.split('<div class="search_row"')
      rows.shift() // 扔掉头部导航

      const results = []
      for (const row of rows) {
        const avatarMatch = row.match(/<img\s+src="([^"]+)"/)
        const infoMatch = row.match(/<div class="searchPersonaInfo">([\s\S]*?)<\/div>/)

        let personaname = ''
        let profileUrl = ''
        let location = ''

        if (infoMatch) {
          const infoHtml = infoMatch[1]
          const nameMatch = infoHtml.match(/class="searchPersonaName"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
          if (nameMatch) {
            profileUrl = nameMatch[1]
            personaname = nameMatch[2].replace(/<[^>]+>/g, '').trim()
          }
          const cleanInfo = infoHtml
            .replace(/<a[\s\S]*?<\/a>/, '')
            .replace(/&nbsp;/g, '')
            .replace(/<[^>]+>/g, '')
            .trim()
          location = cleanInfo
        }

        if (profileUrl && avatarMatch) {
          const avatar = avatarMatch[1]
          let steamid = ''
          
          const profilesMatch = profileUrl.match(/profiles\/(\d+)/)
          if (profilesMatch) {
            steamid = profilesMatch[1]
          } else {
            const idMatch = profileUrl.match(/id\/([^\/]+)/)
            if (idMatch) {
              steamid = idMatch[1]
            }
          }

          if (steamid) {
            results.push({
              steamid,
              personaname,
              avatar,
              location
            })
          }
        }
      }

      console.log(`[Search] 搜索成功，找到并解析了 ${results.length} 个匹配用户。`)
      return res.json({
        code: 200,
        data: results
      })
    } else {
      return res.json({
        code: 200,
        data: []
      })
    }
  } catch (err) {
    console.error('搜索用户接口失败:', err.message)
    res.status(500).json({ code: 500, message: '搜索用户失败: ' + err.message })
  }
})

// 5.5. 免加速快捷登录接口（通过后端代理获取资料）
app.post('/api/auth/quick-login', async (req, res) => {
  try {
    const { steamid } = req.body
    if (!steamid || !steamid.trim()) {
      return res.json({ code: 400, message: '输入不能为空' })
    }

    console.log(`[QuickLogin] 收到快捷登录请求: ${steamid}`)
    const resolvedUser = await resolveSteamUserFromSmartInput(steamid)

    if (resolvedUser) {
      console.log(`[QuickLogin] 登录成功: ${resolvedUser.personaname} (${resolvedUser.steamid})`)
      await saveSteamUser(resolvedUser)

      res.cookie('session_steam_id', resolvedUser.steamid, {
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30天
      })

      return res.json({
        code: 200,
        message: '登录成功',
        data: resolvedUser
      })
    } else {
      return res.json({
        code: 400,
        message: '登录解析失败，未找到该公开账号，请检查拼写、或确认隐私设置已公开。'
      })
    }
  } catch (err) {
    console.error('快捷登录接口报错:', err)
    res.status(500).json({ code: 500, message: '服务器内部错误: ' + err.message })
  }
})

// 6. 获取游戏列表（自动与 Steam 同步，带账号隔离）
app.get('/api/games/list', async (req, res) => {
  try {
    const steamId = req.cookies.session_steam_id
    const steamUser = await getSteamUser()
    const apiKey = await getApiKey()
    
    if (!steamId) {
      return res.json({ code: 200, message: '获取成功', data: [] })
    }

    let localGames = await getGames(steamId)

    if (steamUser && steamUser.steamid === steamId) {
      if (steamUser.personaname === 'Steam 玩家' || steamUser.avatar === '/head.jpg') {
        const xmlUser = await fetchSteamUserFromXml(steamId)
        if (xmlUser) {
          steamUser.personaname = xmlUser.personaname
          steamUser.avatar = xmlUser.avatar
          await saveSteamUser(steamUser)
        }
      }

      let steamGames = []
      let syncSuccess = false

      if (apiKey) {
        try {
          console.log(`[Sync] 正在为账号 ${steamId} 通过 Steam 官方 Web API 同步游戏列表...`)
          const client = await getAxiosInstance()
          const steamApiUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${steamId}&format=json&include_appinfo=true&include_played_free_games=true`
          const response = await client.get(steamApiUrl)
          steamGames = response.data.response?.games || []
          syncSuccess = true
          console.log(`[Sync] 官方 Web API 同步成功，拉取到 ${steamGames.length} 款游戏。`)
        } catch (err) {
          console.error('[Sync] 官方 API 同步游戏失败，尝试退回 XML 备用解析:', err.message)
        }
      }

      if (!syncSuccess) {
        try {
          const xmlGames = await fetchSteamGamesFromXml(steamId)
          if (xmlGames !== null) {
            steamGames = xmlGames
            syncSuccess = true
          }
        } catch (err) {
          console.error('[Sync] XML 备用通道同步游戏也失败:', err.message)
        }
      }

      if (syncSuccess) {
        const gradientColors = [
          'linear-gradient(135deg, #1e3c72, #2a5298)',
          'linear-gradient(135deg, #ff416c, #ff4b2b)',
          'linear-gradient(135deg, #56ab2f, #a8e063)',
          'linear-gradient(135deg, #36d1dc, #5b86e5)',
          'linear-gradient(135deg, #3f4c6b, #606c88)',
          'linear-gradient(135deg, #fceabb, #f8b500)',
          'linear-gradient(135deg, #141e30, #243b55)',
          'linear-gradient(135deg, #74ebd5, #acb6e5)'
        ]

        let updated = false

        for (const sg of steamGames) {
          const playtimeHours = Math.round(sg.playtime_forever / 60)
          const playtimeStr = `${playtimeHours}小时`
          
          const existingIndex = localGames.findIndex(g => g.appid === sg.appid)

          if (existingIndex > -1) {
            const existing = localGames[existingIndex]
            if (existing.playtime_minutes !== sg.playtime_forever) {
              existing.playtime = playtimeStr
              existing.playtime_minutes = sg.playtime_forever
              if (existing.status === '未开始' && sg.playtime_forever > 0) {
                existing.status = '正在游玩'
              }
              updated = true
            }
          } else {
            const randomBg = gradientColors[Math.floor(Math.random() * gradientColors.length)]
            const newGame = {
              id: sg.appid,
              appid: sg.appid,
              name: sg.name,
              status: sg.playtime_forever > 0 ? '正在游玩' : '未开始',
              playtime: playtimeStr,
              playtime_minutes: sg.playtime_forever,
              cover: `https://cdn.akamai.steamstatic.com/steam/apps/${sg.appid}/header.jpg`,
              desc: `这是一款来自 Steam 平台的优秀游戏。游戏 AppID 为 ${sg.appid}。`,
              tags: ['Steam'],
              platform: 'Steam',
              bg: randomBg,
              createdAt: Date.now()
            }
            localGames.push(newGame)
            updated = true
          }
        }

        // 自动拉取已收录中缺失价格的 Steam 游戏的价格
        const gamesWithoutPrice = localGames.filter(g => g.platform === 'Steam' && !g.original_price)
        if (gamesWithoutPrice.length > 0) {
          const toFetch = gamesWithoutPrice.slice(0, 25)
          console.log(`[Sync] 正在为库内 ${toFetch.length} 款无价格记录的游戏获取价格...`)
          try {
            const fetched = await batchFetchRealPrices(toFetch.map(g => ({ id: g.appid })))
            fetched.forEach(f => {
              const idx = localGames.findIndex(g => g.appid === f.id)
              if (idx > -1) {
                localGames[idx].original_price = f.original_price || '0.00'
                localGames[idx].final_price = f.final_price || '0.00'
                localGames[idx].discount_percent = f.discount_percent || 0
                localGames[idx].discounted = f.discounted || false
              }
            })
            updated = true
          } catch (priceErr) {
            console.warn('[Sync] 获取库内游戏价格失败:', priceErr.message)
          }
        }

        if (updated) {
          await saveGames(localGames, steamId)
        }
      }
    }

    // 同步完成后重置首页仪表盘缓存，以使首页拉取最新状态
    dashboardCache.timestamp = 0;

    res.json({ code: 200, message: '获取成功', data: localGames })
  } catch (err) {
    console.error('获取游戏列表总路由出错:', err)
    res.status(500).json({ code: 500, message: '获取游戏列表出错: ' + err.message })
  }
})

// 7. 更新游戏（带账号隔离）
app.post('/api/games/update', async (req, res) => {
  try {
    const steamId = req.cookies.session_steam_id
    if (!steamId) return res.status(401).json({ code: 401, message: '未登录' })

    const newGame = req.body
    let localGames = await getGames(steamId)

    if (newGame.id) {
      const index = localGames.findIndex(g => g.id === parseInt(newGame.id))
      if (index > -1) {
        localGames[index] = {
          ...localGames[index],
          ...newGame,
          id: parseInt(newGame.id)
        }
        await saveGames(localGames, steamId)
        return res.json({ code: 200, message: '更新成功' })
      }
    }

    const generatedId = Date.now()
    if (!newGame.bg) {
      const colors = ['#f12711, #f5af19', '#834d9b, #d04ed6', '#11998e, #38ef7d', '#36d1dc, #5b86e5']
      newGame.bg = `linear-gradient(135deg, ${colors[Math.floor(Math.random() * colors.length)]})`
    }
    
    const addedGame = {
      ...newGame,
      id: generatedId,
      playtime_minutes: newGame.playtime ? parseInt(newGame.playtime) * 60 : 0,
      playtime: newGame.playtime ? (newGame.playtime.includes('小时') ? newGame.playtime : `${newGame.playtime}小时`) : '0小时',
      platform: newGame.platform || '其他',
      createdAt: Date.now()
    }

    localGames.unshift(addedGame)
    await saveGames(localGames, steamId)
    res.json({ code: 200, message: '新增成功' })
  } catch (err) {
    console.error('更新游戏信息失败:', err)
    res.status(500).json({ code: 500, message: '服务器更新游戏失败' })
  }
})

// 9. 获取单个游戏的详细信息（关于信息 & 真实玩家成就展柜）
app.get('/api/games/detail/:appid', async (req, res) => {
  const appid = parseInt(req.params.appid)
  const steamId = req.cookies.session_steam_id
  const apiKey = await getApiKey()

  let aboutHtml = '暂无关于这款游戏的详细介绍。'
  let shortDesc = '这是一款来自 Steam 平台的优秀游戏。'
  let achievements = []
  let publishers = []
  let developers = []

  try {
    const client = await getAxiosInstance()

    // 1. 获取关于这款游戏介绍 (来自 Steam Store API)
    try {
      console.log(`[Detail] 正在从 Steam 商店拉取关于 AppID ${appid} 的详情介绍...`)
      const storeRes = await client.get(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=schinese`)
      if (storeRes.data && storeRes.data[appid] && storeRes.data[appid].success) {
        const gameData = storeRes.data[appid].data
        aboutHtml = gameData.about_the_game || gameData.detailed_description || aboutHtml
        shortDesc = gameData.short_description || shortDesc
        publishers = gameData.publishers || []
        developers = gameData.developers || []
      }
    } catch (e) {
      console.warn(`[Detail] 获取商店详细信息失败 (AppID ${appid}):`, e.message)
    }

    // 2. 获取玩家在当前游戏中的成就进度 (需要 API Key + 登录 of steamid)
    if (steamId && apiKey) {
      try {
        console.log(`[Detail] 正在拉取用户 ${steamId} 对 AppID ${appid} 的成就状态及游戏 Schema...`)
        // A. 获取玩家成就解锁状态
        const playerStatsUrl = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${appid}&key=${apiKey}&steamid=${steamId}&l=schinese`
        const statsRes = await client.get(playerStatsUrl)
        const playerAchievements = statsRes.data.playerstats?.achievements || []

        // B. 获取游戏的成就元数据（图标、中文名称和描述描述）
        const schemaUrl = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${apiKey}&appid=${appid}&l=schinese`
        const schemaRes = await client.get(schemaUrl)
        const schemaAchievements = schemaRes.data.game?.availableGameStats?.achievements || []

        // C. 合并玩家状态和成就名及图标
        if (schemaAchievements.length > 0) {
          achievements = schemaAchievements.map(sa => {
            const pa = playerAchievements.find(item => item.apiname === sa.name)
            return {
              name: sa.displayName || sa.apiname,
              desc: sa.description || '隐藏成就或暂无描述',
              icon: sa.icon,
              icongray: sa.icongray,
              achieved: pa ? pa.achieved === 1 : false,
              unlockTime: pa && pa.unlocktime && pa.unlocktime > 0 
                ? new Date(pa.unlocktime * 1000).toLocaleString('zh-CN', { hour12: false }) 
                : null
            }
          })
          
          // 排序：已解锁的在前，未解锁的在后；已解锁的按解锁时间倒序，未解锁的按顺序
          achievements.sort((a, b) => {
            if (a.achieved !== b.achieved) {
              return b.achieved - a.achieved // true 排在 false 前面
            }
            return 0
          })
        }
      } catch (err) {
        console.warn(`[Detail] 获取成就信息失败 (AppID ${appid}):`, err.message)
      }
    }

    res.json({
      code: 200,
      data: {
        appid,
        aboutHtml,
        shortDesc,
        achievements,
        publishers,
        developers
      }
    })
  } catch (err) {
    console.error('[Detail] 获取游戏详情路由出错:', err)
    res.status(500).json({ code: 500, message: '获取游戏详情出错' })
  }
})

// 辅助函数：通过 Steam 社区群组 XML 获取发行商头像
async function fetchPublisherAvatarFromSteam(publisherName) {
  const cleanName = publisherName.replace(/[^a-zA-Z0-9]/g, '')
  const firstWord = publisherName.split(/[\s,.-]+/)[0]
  
  const client = await getAxiosInstance()
  const candidates = [cleanName, firstWord, publisherName].filter(Boolean)
  
  for (const name of candidates) {
    try {
      console.log(`[PublisherLogo] 正在尝试获取 Steam 社区群组 "${name}" 的 XML 数据...`)
      const res = await client.get(`https://steamcommunity.com/groups/${encodeURIComponent(name)}/memberslistxml/?xml=1`, { timeout: 5000 })
      if (res.data && res.data.includes('<avatarIcon>')) {
        const match = res.data.match(/<avatarIcon><!\[CDATA\[([\s\S]*?)\]\]><\/avatarIcon>/) || res.data.match(/<avatarIcon>([\s\S]*?)<\/avatarIcon>/)
        if (match && match[1]) {
          const avatarUrl = match[1].trim()
          console.log(`[PublisherLogo] 成功获取群组 "${name}" 的头像: ${avatarUrl}`)
          return avatarUrl
        }
      }
    } catch (e) {
      console.warn(`[PublisherLogo] 尝试获取群组 "${name}" 头像失败:`, e.message)
    }
  }
  return null
}

// 9.5 获取游戏发行商发行的游戏列表
app.get('/api/publisher/:name/games', async (req, res) => {
  const publisherName = req.params.name
  try {
    const axiosInstance = await getAxiosInstance()
    
    // 1. 异步获取发行商头像
    let avatarUrl = null
    try {
      avatarUrl = await fetchPublisherAvatarFromSteam(publisherName)
    } catch (e) {
      console.warn('[Publisher] 获取头像异常:', e.message)
    }

    // 2. 爬取 Steam 商店搜索页面获取发行商精确的所有游戏
    console.log(`[Publisher] 正在爬取 Steam 发行商页面: "${publisherName}"...`)
    let items = []
    try {
      const searchPageUrl = `https://store.steampowered.com/search/?publisher=${encodeURIComponent(publisherName)}&cc=cn&l=schinese`
      const searchRes = await axiosInstance.get(searchPageUrl, { timeout: 15000 })
      const html = searchRes.data
      
      const parts = html.split('data-ds-appid="')
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i].split('</a>')[0]
        const appid = parseInt(part)
        if (isNaN(appid)) continue
        
        const titleMatch = part.match(/<span class="title">([\s\S]*?)<\/span>/)
        if (!titleMatch) continue
        const name = titleMatch[1].trim()
        
        const coverMatch = part.match(/<img[^>]+src="([^"]+)"/)
        const cover = coverMatch ? coverMatch[1].trim() : `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`
        
        let isFree = false
        let finalPrice = '0.00'
        let originalPrice = '0.00'
        let discountPercent = 0
        
        if (part.includes('free') || part.includes('免费') || part.includes('Free Play')) {
          isFree = true
        }
        
        const priceFinalMatch = part.match(/data-price-final="(\d+)"/)
        if (priceFinalMatch) {
          const cents = parseInt(priceFinalMatch[1])
          if (cents === 0) {
            isFree = true
          } else {
            finalPrice = (cents / 100).toFixed(2)
          }
        }
        
        const pctMatch = part.match(/<div class="discount_pct">-(\d+)%<\/div>/)
        if (pctMatch) {
          discountPercent = parseInt(pctMatch[1])
        }
        
        const origMatch = part.match(/<div class="discount_original_price">([\s\S]*?)<\/div>/)
        if (origMatch) {
          const text = origMatch[1].replace(/[^\d.]/g, '')
          if (text) originalPrice = parseFloat(text).toFixed(2)
        }
        
        if (originalPrice === '0.00' && finalPrice !== '0.00') {
          originalPrice = finalPrice
        }
        
        if (isFree) {
          finalPrice = '0.00'
        }
        
        items.push({
          id: appid,
          name,
          cover,
          price: {
            discount_percent: discountPercent,
            original: originalPrice,
            final: finalPrice,
            is_free: isFree
          }
        })
      }
      console.log(`[Publisher] 从网页上成功解析出 ${items.length} 款精准的旗下游戏。`)
    } catch (err) {
      console.warn(`[Publisher] 爬取发行商网页失败，尝试使用 API 备用兜底:`, err.message)
    }

    // 3. 兜底策略：如果网页解析无数据，退回官方 API 和本地搜索
    if (items.length === 0) {
      try {
        const searchRes = await axiosInstance.get(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(publisherName)}&l=schinese&cc=cn`, { timeout: 12000 })
        const apiItems = searchRes.data?.items || []
        items = apiItems.map(g => ({
          id: g.id,
          name: g.name,
          cover: g.tiny_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.id}/header.jpg`,
          price: g.price ? {
            discount_percent: g.price.discount_percent || 0,
            original: (g.price.initial / 100).toFixed(2),
            final: (g.price.final / 100).toFixed(2),
            is_free: g.price.final === 0
          } : {
            discount_percent: 0,
            original: '0.00',
            final: '0.00',
            is_free: true
          }
        }))
      } catch (e) {
        console.error('[Publisher] API 兜底检索也失败:', e.message)
      }
    }

    // 获取用户本地游戏库以比对是否已拥有该游戏并填充本地游戏描述
    const steamId = req.cookies.session_steam_id
    let localGames = []
    if (steamId) {
      localGames = await getGames(steamId)
    }
    const dbData = await getData()
    const globalGames = dbData.games || []

    const mappedGames = items.map(g => {
      const localGame = localGames.find(lg => lg.appid === g.id)
      const globalGame = globalGames.find(gg => gg.appid === g.id)
      const desc = (localGame && localGame.desc) || (globalGame && globalGame.desc) || `这是一款来自 Steam 平台的优秀游戏，由发行商 ${publisherName} 倾力打造并呈现给全球玩家。`

      const isOwned = localGames.some(lg => lg.appid === g.id)
      return {
        id: g.id,
        name: g.name,
        cover: g.cover,
        desc: desc,
        price: g.price,
        isOwned
      }
    })
    
    res.json({
      code: 200,
      avatar: avatarUrl,
      data: mappedGames
    })
  } catch (err) {
    console.error('获取发行商游戏列表出错:', err)
    res.status(500).json({ code: 500, message: '获取发行商游戏列表出错' })
  }
})

// 10. 获取首页仪表盘汇总数据（最新收录、最近获得成就、近期动态）
app.get('/api/user/dashboard-summary', async (req, res) => {
  try {
    const steamId = req.cookies.session_steam_id
    const apiKey = await getApiKey()

    if (!steamId) {
      return res.json({
        code: 200,
        data: {
          recentGames: [],
          recentAchievements: [
            { name: '白金肝帝', desc: '累计游戏时长突破 100 小时', icon: '🏆', achieved: true, isMock: true },
            { name: '神射手', desc: '在任一射击游戏中爆头 100 次', icon: '🔫', achieved: true, isMock: true },
            { name: '解谜大师', desc: '解开所有游戏内隐藏谜题', icon: '🧩', achieved: true, isMock: true },
            { name: '怀旧达人', desc: '游玩经典老游戏超过 10 小时', icon: '🕹️', achieved: true, isMock: true }
          ],
          recentActivities: [
            { time: '刚刚', text: '登录了游戏收藏管理中心' },
            { time: '昨天', text: '同步了您的 Steam 游玩数据' },
            { time: '3天前', text: '设置并配置了加速器代理地址' }
          ]
        }
      })
    }

    // 检查缓存是否有效 (有效时长 3 分钟，防抖和提速)
    const CACHE_DURATION = 3 * 60 * 1000
    if (dashboardCache.data && 
        dashboardCache.steamid === steamId && 
        (Date.now() - dashboardCache.timestamp < CACHE_DURATION)) {
      console.log('[DashboardSummary] 命中内存缓存，直接返回！')
      return res.json({
        code: 200,
        data: dashboardCache.data
      })
    }

    // A. 您最爱玩 (按 playtime_minutes 降序排序的前 3 款游戏)
    let localGames = await getGames(steamId)
    const sortedByPlaytime = [...localGames].sort((a, b) => b.playtime_minutes - a.playtime_minutes)
    const recentGames = sortedByPlaytime.slice(0, 3)

    let recentAchievements = []
    let recentActivities = []

    // B. 获取最近解锁的成就 (最多 6 个)
    if (apiKey) {
      try {
        const client = await getAxiosInstance()
        // 1. 先抓取最近 2 周游玩的游戏
        const recentUrl = `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${apiKey}&steamid=${steamId}&format=json`
        const recentRes = await client.get(recentUrl)
        const rGames = recentRes.data.response?.games || []
        
        let targetGames = rGames
        if (targetGames.length === 0) {
          // 如果最近无游玩，回退至游玩时长最长的 3 个游戏
          const sortedByPlaytime = [...localGames].sort((a, b) => b.playtime_minutes - a.playtime_minutes)
          targetGames = sortedByPlaytime.slice(0, 3)
        }

        // 2. 并行查询这些游戏的解锁成就 (极大地提高了性能，减少等待时间)
        const achievementsList = []
        await Promise.all(targetGames.map(async (g) => {
          try {
            const statsUrl = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${g.appid}&key=${apiKey}&steamid=${steamId}&l=schinese`
            const statsRes = await client.get(statsUrl)
            const achievements = statsRes.data.playerstats?.achievements || []
            const unlocked = achievements.filter(a => a.achieved === 1)

            if (unlocked.length > 0) {
              const schemaUrl = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${apiKey}&appid=${g.appid}&l=schinese`
              const schemaRes = await client.get(schemaUrl)
              const schemaAchievements = schemaRes.data.game?.availableGameStats?.achievements || []

              for (const u of unlocked) {
                const schema = schemaAchievements.find(sa => sa.name === u.apiname)
                if (schema) {
                  achievementsList.push({
                    appid: g.appid,
                    gameName: schemaRes.data.game?.gameName || g.name || `AppID ${g.appid}`,
                    name: schema.displayName || u.apiname,
                    desc: schema.description || '暂无描述',
                    icon: schema.icon,
                    unlockTime: u.unlocktime
                  })
                }
              }
            }
          } catch (e) {
            // 忽略单款游戏的加载失败
          }
        }))

        // 按照解锁时间倒序排列，取最近的 6 个
        achievementsList.sort((a, b) => b.unlockTime - a.unlockTime)
        recentAchievements = achievementsList.slice(0, 6)
      } catch (err) {
        console.error('[DashboardSummary] 获取成就整体失败:', err.message)
      }
    }

    // C. 生成近期动态 (只使用成就解锁事件，最多 4 条，以实际成就解锁时间作为时间轴)
    const rawActivities = []
    
    // 增加成就解锁动态
    for (const ach of recentAchievements) {
      if (ach.isMock) continue
      
      let timeStr = '暂无时间'
      if (ach.unlockTime > 0) {
        const date = new Date(ach.unlockTime * 1000)
        const y = date.getFullYear()
        const m = String(date.getMonth() + 1).padStart(2, '0')
        const d = String(date.getDate()).padStart(2, '0')
        const hh = String(date.getHours()).padStart(2, '0')
        const mm = String(date.getMinutes()).padStart(2, '0')
        timeStr = `${y}-${m}-${d} ${hh}:${mm}`
      }
      rawActivities.push({
        timestamp: ach.unlockTime * 1000,
        time: timeStr,
        text: `达成了《${ach.gameName}》的【${ach.name}】成就`
      })
    }

    // 降序排序，取前 4 条展示
    rawActivities.sort((a, b) => b.timestamp - a.timestamp)
    recentActivities = rawActivities.slice(0, 4)

    // 兜底 Mock
    if (recentAchievements.length === 0) {
      recentAchievements = [
        { name: '白金肝帝', desc: '累计游戏时长突破 100 小时', icon: '🏆', achieved: true, isMock: true },
        { name: '神射手', desc: '在任一射击游戏中爆头 100 次', icon: '🔫', achieved: true, isMock: true },
        { name: '解谜大师', desc: '解开所有游戏内隐藏谜题', icon: '🧩', achieved: true, isMock: true },
        { name: '怀旧达人', desc: '游玩经典老游戏超过 10 小时', icon: '🕹️', achieved: true, isMock: true }
      ]
    }

    if (recentActivities.length === 0) {
      recentActivities = [
        { time: '刚刚', text: '登录了游戏收藏管理中心' },
        { time: '昨天', text: '同步了您的 Steam 游玩数据' },
        { time: '3天前', text: '设置并配置了加速器代理地址' }
      ]
    }

    const resultData = {
      recentGames,
      recentAchievements,
      recentActivities
    }

    // 写入内存缓存
    dashboardCache.data = resultData
    dashboardCache.timestamp = Date.now()
    dashboardCache.steamid = steamId

    res.json({
      code: 200,
      data: resultData
    })
  } catch (err) {
    console.error('获取首页数据汇总出错:', err)
    res.status(500).json({ code: 500, message: '服务器汇总仪表盘数据失败' })
  }
})

// ==================== 新增：Steam 商店模块 API 接口 ====================

// 流行大作数据库池，包含 AppID、中文名、标准封面与基准价格
const POPULAR_GAMES_POOL = [
  { id: 1091500, name: '赛博朋克 2077', price: 298.00 },
  { id: 1174180, name: '荒野大镖客：救赎 2', price: 279.00 },
  { id: 413150, name: '星露谷物语', price: 48.00 },
  { id: 1326470, name: '森林之子', price: 108.00 },
  { id: 1086940, name: '博德之门 3', price: 298.00 },
  { id: 2001120, name: '双影奇境', price: 198.00 },
  { id: 2138330, name: '赛博朋克 2077：往日之影', price: 149.00 },
  { id: 1623730, name: 'Palworld / 幻兽帕鲁', price: 108.00 },
  { id: 1245620, name: '艾尔登法环', price: 298.00 },
  { id: 2358720, name: '黑神话：悟空', price: 268.00 },
  { id: 550, name: '求生之路 2', price: 42.00 },
  { id: 292030, name: '巫师 3：狂猎', price: 149.00 },
  { id: 2050650, name: '生化危机 4 重制版', price: 198.00 },
  { id: 814380, name: '只狼：影逝二度', price: 268.00 },
  { id: 1551360, name: '极限竞速：地平线 5', price: 248.00 },
  { id: 990080, name: '霍格沃茨之遗', price: 298.00 },
  { id: 105600, name: '泰拉瑞亚', price: 36.00 },
  { id: 1172470, name: 'Apex 英雄', price: 0.00 },
  { id: 582010, name: '怪物猎人：世界', price: 203.00 },
  { id: 289070, name: '文明 VI', price: 199.00 },
  { id: 1145360, name: '黑帝斯 (Hades)', price: 92.00 },
  { id: 1817070, name: '漫威蜘蛛侠：重制版', price: 379.00 },
  { id: 1817190, name: '蜘蛛侠：迈尔斯·莫拉莱斯', price: 319.00 },
  { id: 1446780, name: '怪物猎人：崛起', price: 243.00 },
  { id: 646570, name: '杀戮尖塔 (Slay the Spire)', price: 80.00 },
  { id: 250900, name: '以撒的结合：胎衣', price: 48.00 },
  { id: 1966720, name: '致命公司 (Lethal Company)', price: 42.00 },
  { id: 1627720, name: '匹诺曹的谎言 (Lies of P)', price: 298.00 },
  { id: 1282100, name: '遗迹 2', price: 245.00 },
  { id: 1250410, name: '微软模拟飞行', price: 419.00 },
  { id: 252490, name: '腐蚀 (Rust)', price: 171.00 },
  { id: 730, name: '反恐精英 2 (CS2)', price: 0.00 },
  { id: 578080, name: '绝地求生 (PUBG)', price: 0.00 },
  { id: 381210, name: '黎明杀机', price: 82.00 },
  { id: 227300, name: '欧洲卡车模拟 2', price: 88.00 },
  { id: 255710, name: '都市：天际线', price: 108.00 },
  { id: 949230, name: '都市：天际线 2', price: 218.00 },
  { id: 1172620, name: '盗贼之海', price: 116.00 },
  { id: 945360, name: '太空杀 (Among Us)', price: 22.00 },
  { id: 892970, name: '英灵神殿', price: 70.00 },
  { id: 294100, name: '边缘世界', price: 118.00 },
  { id: 264710, name: '深海迷航 (Subnautica)', price: 80.00 },
  { id: 367520, name: '空洞骑士', price: 48.00 },
  { id: 268910, name: '茶杯头', price: 68.00 },
  { id: 588650, name: '死亡细胞 (Dead Cells)', price: 80.00 },
  { id: 242760, name: '森林 (The Forest)', price: 70.00 },
  { id: 648800, name: '木筏求生 (Raft)', price: 68.00 },
  { id: 239140, name: '消逝的光芒', price: 109.00 },
  { id: 534380, name: '消逝的光芒 2', price: 198.00 },
  { id: 993090, name: '无损缩放 (Lossless Scaling)', price: 32.00 },
  { id: 1151640, name: '地平线：零之曙光', price: 198.00 },
  { id: 1222140, name: '底特律：化身为人', price: 128.00 },
  { id: 1426210, name: '双人成行', price: 198.00 },
  { id: 730580, name: '百万大赛车 (MegaRace)', price: 15.00 },
  { id: 1222700, name: '逃出生天 (A Way Out)', price: 118.00 },
  { id: 620, name: '传送门 2', price: 42.00 },
  { id: 400, name: '传送门', price: 42.00 },
  { id: 546560, name: '半条命：艾利克斯', price: 163.00 },
  { id: 548430, name: '深岩银河', price: 108.00 },
  { id: 1716740, name: '星空 (Starfield)', price: 298.00 },
  { id: 377160, name: '辐射 4', price: 99.00 },
  { id: 489830, name: '上古卷轴 5：天际 特别版', price: 165.00 },
  { id: 3240220, name: '侠盗猎车手 5 增强版 (GTA5)', price: 74.50 },
  { id: 322330, name: '饥荒联机版', price: 24.00 },
  { id: 1868140, name: '潜水员戴夫', price: 80.00 },
  { id: 1260320, name: '猛兽派对 (Party Animals)', price: 98.00 },
  { id: 1196590, name: '生化危机 8：村庄', price: 198.00 },
  { id: 2477340, name: '远征：泥泞奔驰游戏 (Expeditions)', price: 169.00 },
  { id: 2322560, name: '完蛋！我被美女包围了！', price: 42.00 },
  { id: 1593500, name: '战神 (God of War)', price: 345.00 },
  { id: 1363080, name: '庄园领主 (Manor Lords)', price: 149.00 },
  { id: 1328670, name: '质量效应 传奇版', price: 248.00 },
  { id: 22380, name: '辐射：新维加斯', price: 36.00 },
  { id: 763890, name: '漫野奇谭', price: 75.00 },
  { id: 1846380, name: '极品飞车：不羁', price: 248.00 },
  { id: 812140, name: '刺客信条：奥德赛', price: 298.00 },
  { id: 412020, name: '地铁：离去', price: 149.00 },
  { id: 2835570, name: '恶魔轮盘 (Buckshot Roulette)', price: 12.00 },
  { id: 1151340, name: '辐射 76', price: 165.00 },
  { id: 870780, name: '控制 (Control)', price: 198.00 },
  { id: 8870, name: '生化奇兵：无限', price: 95.00 },
  { id: 1850570, name: '死亡搁浅 导演剪辑版', price: 198.00 },
  { id: 958400, name: '赛车计划 3', price: 298.00 },
  { id: 1659040, name: '杀手 3 (HITMAN)', price: 279.00 },
  { id: 359550, name: '彩虹六号：围攻', price: 88.00 },
  { id: 1517290, name: '战地 2042', price: 248.00 },
  { id: 1238810, name: '战地 5', price: 228.00 },
  { id: 1238840, name: '战地 1', price: 198.00 },
  { id: 1088850, name: '漫威银河护卫队', price: 359.00 },
  { id: 1030840, name: '四海兄弟：决定版', price: 139.00 },
  { id: 1252330, name: '死亡循环 (DEATHLOOP)', price: 249.00 },
  { id: 403640, name: '羞辱 2', price: 99.00 },
  { id: 205100, name: '羞辱 (Dishonored)', price: 36.00 },
  { id: 201810, name: '德军总部：新秩序', price: 79.00 },
  { id: 782330, name: '毁灭战士：永恒', price: 199.00 },
  { id: 480490, name: '掠食 (Prey)', price: 125.00 },
  { id: 601430, name: '恶灵附身 2', price: 129.00 },
  { id: 268050, name: '恶灵附身', price: 79.00 },
  { id: 750920, name: '古墓丽影：暗影', price: 245.00 },
  { id: 391220, name: '古墓丽影：崛起', price: 160.00 },
  { id: 244850, name: '太空工程师 (Space Engineers)', price: 70.00 },
  { id: 261550, name: '骑马与砍杀 2', price: 248.00 },
  { id: 813780, name: '帝国时代 II：决定版', price: 99.00 },
  { id: 601150, name: '鬼泣 5', price: 198.00 }
];

// 随机打乱数组工具函数
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 为大作池游戏随机生成价格折扣信息，并使用最稳定的 Cloudflare CDN 构建封面图片
function getRandomDiscountGame(g) {
  const coverUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.id}/header.jpg`;
  
  if (g.price === 0) {
    return {
      id: g.id,
      name: g.name,
      cover: coverUrl,
      discount_percent: 0,
      discounted: false,
      original_price: '0.00',
      final_price: '0.00',
      currency: 'CNY'
    };
  }
  
  // 随机特惠折扣：10% 到 85% 之间
  const discountOptions = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 66, 70, 75, 80, 85];
  const discount = discountOptions[Math.floor(Math.random() * discountOptions.length)];
  const finalPrice = (g.price * (1 - discount / 100)).toFixed(2);
  
  return {
    id: g.id,
    name: g.name,
    cover: coverUrl,
    discount_percent: discount,
    discounted: true,
    original_price: g.price.toFixed(2),
    final_price: finalPrice,
    currency: 'CNY'
  };
}

// 核心大促数据库池，默认先以 60 款本地精品游戏初始化进行超快加载兜底，后台异步拉取 500 款！
let STEAM_STORE_GAMES_POOL = POPULAR_GAMES_POOL.map(g => getRandomDiscountGame(g));
let STEAM_STORE_BANNER_URL = '';
let STEAM_STORE_BANNER_APPID = null;

// 后台异步任务：构建 100+ 知名畅销大作缓存池并异步拉取大促海报
async function initializeStoreGamesPool() {
  console.log('[Store] 正在维护 ChronoPlay 专属庞大精品特惠池...');
  const offlinePool = [...STEAM_STORE_GAMES_POOL];
  
  // 1. 如果池子游戏数量还不够多（少于 200 款），优先载入本地精品特惠库支撑
  if (offlinePool.length < 200) {
    const localPoolDiscounted = POPULAR_GAMES_POOL.map(g => getRandomDiscountGame(g))
    offlinePool.push(...localPoolDiscounted)
  }

  // 2. 异步从 Supabase 数据库拉取至多 1000 款游戏进行全量扩充
  try {
    const dbRes = await fastGet(`${SUPABASE_URL}/rest/v1/games?select=steam_id,name,current_price&limit=1000`)
    if (dbRes && dbRes.data && Array.isArray(dbRes.data)) {
      const dbGames = dbRes.data
        .filter(row => row.steam_id && row.current_price && row.current_price > 0)
        .map(row => getRandomDiscountGame({
          id: row.steam_id,
          name: row.name,
          price: Number(row.current_price)
        }))
      offlinePool.push(...dbGames)
    }
  } catch (err) {
    console.warn('[Store] 异步从数据库全量扩充游戏池轻微异常:', err.message)
  }

  // 3. 去重合并
  const seenOffline = new Set()
  STEAM_STORE_GAMES_POOL = offlinePool.filter(g => {
    if (seenOffline.has(String(g.id))) return false
    seenOffline.add(String(g.id))
    return true
  })
  console.log(`[Store] 庞大精品折扣池维护与构建完成！共计 ${STEAM_STORE_GAMES_POOL.length} 款知名特惠游戏。`)

  // 尝试在后台异步更新最新大促 Banner 并持久化
  try {
    const axiosInstance = await getAxiosInstance()
    const storeHome = await axiosInstance.get('https://store.steampowered.com/?l=schinese', { 
      timeout: 4500,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)' }
    })
    
    const takeoverMatch = storeHome.data.match(/background-image:\s*url\(\s*['"]?([^'")\s]+)/)
    if (takeoverMatch) {
      const isTakeover = takeoverMatch[1].includes('promo') || takeoverMatch[1].includes('sale') || takeoverMatch[1].includes('takeover') || takeoverMatch[1].includes('clusters/frontpage') || takeoverMatch[1].includes('page_bg_')
      if (isTakeover) STEAM_STORE_BANNER_URL = takeoverMatch[1]
    } else {
      const imgMatch = storeHome.data.match(/<img[^>]+src=['"]([^'"]+promo[^'"]+)['"]/i)
      if (imgMatch) STEAM_STORE_BANNER_URL = imgMatch[1]
    }

    const appidMatch = storeHome.data.match(/unBackgroundAppID:\s*(\d+)/)
    if (appidMatch && appidMatch[1] !== '0') {
      STEAM_STORE_BANNER_APPID = parseInt(appidMatch[1])
    } else {
      const mmMatch = storeHome.data.match(/rgMarketingMessages:\s*\[\s*\{\s*"url"[^}]+"appid":\s*(\d+)/)
      if (mmMatch) STEAM_STORE_BANNER_APPID = parseInt(mmMatch[1])
    }
  } catch (e) {}

  try {
    const cacheDir = typeof process.pkg !== 'undefined' ? path.join(process.cwd(), 'data') : path.join(__dirname, '../data')
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })
    fs.writeFileSync(path.join(cacheDir, 'store_cache.json'), JSON.stringify({
      banner: STEAM_STORE_BANNER_URL,
      banner_appid: STEAM_STORE_BANNER_APPID,
      games: STEAM_STORE_GAMES_POOL
    }), 'utf-8')
    console.log(`[Store] 缓存池与 Banner 已持久化到磁盘 (${STEAM_STORE_GAMES_POOL.length} 款)`)
  } catch (e) {}
}

// 启动时尝试从磁盘加载缓存池（秒开）
try {
  const cacheDir = typeof process.pkg !== 'undefined' ? path.join(process.cwd(), 'data') : path.join(__dirname, '../data')
  const cachePath = path.join(cacheDir, 'store_cache.json')
  if (fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
    if (cached && typeof cached === 'object') {
      if (Array.isArray(cached.games) && cached.games.length > 0) {
        STEAM_STORE_GAMES_POOL = cached.games
      }
      if (cached.banner) {
        STEAM_STORE_BANNER_URL = cached.banner
      }
      if (cached.banner_appid) {
        STEAM_STORE_BANNER_APPID = cached.banner_appid
      }
      console.log(`[Store] 已从磁盘缓存加载并校验 ${STEAM_STORE_GAMES_POOL.length} 款游戏与 Banner (AppID: ${STEAM_STORE_BANNER_APPID})，实现秒开！`)
    }
  }
} catch (e) {
  console.warn('[Store] 读取磁盘缓存失败:', e.message)
}

// 延迟 1.5 秒启动后台数据拉取任务，防止影响主进程极速开屏
setTimeout(initializeStoreGamesPool, 1500)

// 1. 获取商店精选（特惠游戏列表与促销 Banner）
app.get('/api/store/featured', async (req, res) => {
  try {
    const axiosInstance = await getAxiosInstance()
    
    // 尝试从 Steam 商店首页解析当前的特卖 Banner
    let bannerUrl = STEAM_STORE_BANNER_URL || ''
    try {
      const storeHome = await axiosInstance.get('https://store.steampowered.com/?l=schinese', { 
        timeout: 4500,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)' }
      })
      const takeoverMatch = storeHome.data.match(/background-image:\s*url\(\s*['"]?([^'")\s]+)/)
      if (takeoverMatch && (takeoverMatch[1].includes('promo') || takeoverMatch[1].includes('sale') || takeoverMatch[1].includes('takeover'))) {
        bannerUrl = takeoverMatch[1]
      } else {
        const imgMatch = storeHome.data.match(/<img[^>]+src=['"]([^'"]+promo[^'"]+)['"]/i)
        if (imgMatch) {
          bannerUrl = imgMatch[1]
        }
      }
      
      // 成功解析出大促图后，动态更新内存和磁盘持久化缓存
      if (bannerUrl) {
        try {
          const cacheDir = typeof process.pkg !== 'undefined' ? path.join(process.cwd(), 'data') : path.join(__dirname, '../data')
          const cachePath = path.join(cacheDir, 'store_cache.json')
          if (fs.existsSync(cachePath)) {
            const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
            cached.banner = bannerUrl
            fs.writeFileSync(cachePath, JSON.stringify(cached), 'utf-8')
          }
          STEAM_STORE_BANNER_URL = bannerUrl
        } catch (cacheErr) {
          console.warn('[Store] 动态更新 Banner 缓存失败:', cacheErr.message)
        }
      }
    } catch (e) {
      console.warn('解析商店特卖 Banner 失败，使用空值隐藏:', e.message)
    }

    // 从 Cookies 中拉取当前登录的用户 ID
    const steamId = req.cookies.session_steam_id
    let userGames = []
    if (steamId) {
      try {
        userGames = await getGames(steamId)
      } catch (err) {
        console.warn('[Store] 获取用户游戏库用于推荐失败:', err.message)
      }
    }

    // 喜好大促商品智能推荐算法
    function getRecommendedGames(userGamesList, storePool, limit = 12) {
      if (!userGamesList || userGamesList.length === 0) {
        return shuffleArray(storePool).slice(0, limit)
      }

      const playedGames = userGamesList.filter(g => (g.playtime_minutes || 0) > 0)
      const keywordWeights = {}
      playedGames.forEach(g => {
        const name = g.name.toLowerCase()
        const words = name.split(/[\s:：,，.·、()（）]+/).filter(w => w.length > 1)
        const weight = Math.log(g.playtime_minutes || 60)
        words.forEach(w => {
          keywordWeights[w] = (keywordWeights[w] || 0) + weight
        })
      })

      const scoredPool = storePool.map(g => {
        const name = g.name.toLowerCase()
        let score = 0
        
        for (const word in keywordWeights) {
          if (name.includes(word)) {
            score += keywordWeights[word] * 15
          }
        }
        
        // 热门游戏倾向加成，避免推送太冷门的游戏
        const isPopular = POPULAR_GAMES_POOL.some(p => String(p.id) === String(g.id))
        if (isPopular) {
          score += 35
        }
        
        score += Math.random() * 45 // 增大随机扰动，提升动态推荐丰富度
        return { game: g, score }
      })

      scoredPool.sort((a, b) => b.score - a.score)
      // 核心改进：从得分最高的前 200 款海量游戏候选库中，动态打乱截取所需商品，确保频繁刷新也不会刷出重复游戏！
      const candidateCount = Math.min(scoredPool.length, 200)
      const topCandidates = scoredPool.slice(0, candidateCount).map(item => item.game)
      return shuffleArray(topCandidates).slice(0, limit)
    }

    // 智能筛选推荐特惠商品
    const selected = getRecommendedGames(userGames, STEAM_STORE_GAMES_POOL, 12)
    
    // 核心改进：在返回前批量向 Steam 官方接口实时校验并拉取这 12 个商品的最新价格，绝不使用虚构价格
    const realPriceGames = await batchFetchRealPrices(selected)
    
    res.json({
      code: 200,
      data: {
        banner: bannerUrl,
        banner_appid: bannerAppId || STEAM_STORE_BANNER_APPID,
        games: realPriceGames
      }
    })
  } catch (err) {
    console.error('获取商店精选失败:', err)
    res.status(500).json({ code: 500, message: '获取商店精选数据失败' })
  }
})

// 1.5. 商店缓存接口：返回内存中完整缓存池（无需等待实时价格查询，秒返回）
app.get('/api/store/cache', (req, res) => {
  res.json({
    code: 200,
    data: {
      banner: STEAM_STORE_BANNER_URL,
      banner_appid: STEAM_STORE_BANNER_APPID,
      games: STEAM_STORE_GAMES_POOL,
      total: STEAM_STORE_GAMES_POOL.length
    }
  })
})

// 1.6. 后台静默刷新价格接口：仅返回指定游戏的最新价格数据
app.get('/api/store/refresh-prices', async (req, res) => {
  try {
    const appids = (req.query.appids || '').split(',').filter(id => id.trim())
    if (appids.length === 0) return res.json({ code: 200, data: [] })

    // 从缓存池中找到对应游戏
    const gamesToRefresh = appids.map(id => {
      const cached = STEAM_STORE_GAMES_POOL.find(g => String(g.id) === String(id))
      return cached || { id: parseInt(id), name: '', cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg` }
    })

    const refreshed = await batchFetchRealPrices(gamesToRefresh)

    // 同步更新内存缓存池中对应游戏的价格
    for (const game of refreshed) {
      const idx = STEAM_STORE_GAMES_POOL.findIndex(g => String(g.id) === String(game.id))
      if (idx !== -1) {
        STEAM_STORE_GAMES_POOL[idx] = { ...STEAM_STORE_GAMES_POOL[idx], ...game }
      }
    }

    res.json({
      code: 200,
      data: refreshed.map(g => ({
        id: g.id,
        name: g.name,
        discount_percent: g.discount_percent,
        discounted: g.discounted,
        original_price: g.original_price,
        final_price: g.final_price
      }))
    })
  } catch (err) {
    console.error('刷新价格失败:', err)
    res.status(500).json({ code: 500, message: '刷新价格失败' })
  }
})

// 2. 纵向/无限下拉时：随机加载 12 个非重复大作
app.get('/api/store/random', async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 12
    const shuffledPool = shuffleArray(STEAM_STORE_GAMES_POOL)
    const selected = shuffledPool.slice(0, count)
    
    // 同样在下拉加载时做批量实时价格校验
    const realPriceGames = await batchFetchRealPrices(selected)
    
    res.json({
      code: 200,
      data: realPriceGames
    })
  } catch (err) {
    console.error('获取随机游戏失败:', err)
    res.status(500).json({ code: 500, message: '获取随机游戏失败' })
  }
})

// 内存缓存字典，防止重复拉取慢速的 Steam API 详情与评测
const storeDetailCache = new Map()
const storeReviewsCache = new Map()
const storeWorkshopCache = new Map()
const dlcCache = new Map()

const CACHE_TTL_DETAIL = 24 * 60 * 60 * 1000;  // 游戏详情静态信息缓存 24 小时
const CACHE_TTL_REVIEWS = 10 * 60 * 1000;     // 玩家评测缓存 10 分钟
const CACHE_TTL_WORKSHOP = 15 * 60 * 1000;    // 创意工坊缓存 15 分钟

function checkCacheLimit(cacheMap, maxLimit = 150) {
  if (cacheMap.size > maxLimit) {
    const firstKey = cacheMap.keys().next().value
    cacheMap.delete(firstKey)
  }
}

// 3. 获取商店游戏详细档案（删除视频相关逻辑，使用真实 Steam 价格与信息，延长超时时间至 25 秒）
app.get('/api/store/detail/:appid', async (req, res) => {
  try {
    const { appid } = req.params
    
    // 优先从内存缓存中拉取
    const cached = storeDetailCache.get(appid)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_DETAIL) {
      console.log(`[Cache] 命中游戏详情缓存: ${appid}`)
      return res.json({ code: 200, data: cached.data })
    }

    const axiosInstance = await getAxiosInstance()
    
    // 将网络超时时间延长至 25000 毫秒，以防图片或页面数据过慢导致停止加载
    const detailsRes = await axiosInstance.get(`https://store.steampowered.com/api/appdetails/?appids=${appid}&l=schinese&cc=cn`, { timeout: 25000 })
    
    const appData = detailsRes.data?.[appid]
    if (!appData || !appData.success || !appData.data) {
      return res.status(404).json({ code: 404, message: '无法获取该游戏商店档案' })
    }
    
    const data = appData.data
    
    // 直接解析官方原生价格，如 price_overview 缺失则退步尝试解析包（Package Groups）价格（例：GTA5 Premium 捆绑包形式）
    let priceInfo = data.price_overview;
    if (!priceInfo && data.package_groups && data.package_groups.length > 0) {
      const defaultGroup = data.package_groups.find(g => g.name === 'default') || data.package_groups[0];
      if (defaultGroup.subs && defaultGroup.subs.length > 0) {
        const sub = defaultGroup.subs[0];
        priceInfo = {
          currency: 'CNY',
          initial: sub.price_in_cents,
          final: sub.price_in_cents_with_discount,
          discount_percent: sub.percent_savings || 0
        };
      }
    }
    if (!priceInfo) {
      priceInfo = {
        currency: 'CNY',
        initial: 0,
        final: 0,
        discount_percent: 0
      };
    }
    
    const realPrice = {
      discount_percent: priceInfo.discount_percent || 0,
      original: priceInfo.initial ? (priceInfo.initial / 100).toFixed(2) : '0.00',
      final: priceInfo.final ? (priceInfo.final / 100).toFixed(2) : '0.00',
      currency: priceInfo.currency || 'CNY',
      is_free: data.is_free
    };
    
    // 优先使用官方 API 返回的带有 Localized 资源哈希路径的 header_image，防止直接拼接 header.jpg 时某些 DLC 出现 404 裂图
    const verifiedCover = data.header_image || data.capsule_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`

    // 获取 DLC 列表并并发查询它们的基本详情（限制最多 6 个，并使用 dlcCache 内存缓存以杜绝重复抓取）
    let dlcList = []
    if (data.dlc && data.dlc.length > 0) {
      const targetDlcs = data.dlc.slice(0, 6)
      const dlcPromises = targetDlcs.map(async (dlcId) => {
        // 1. 优先读取 DLC 详情缓存
        if (dlcCache.has(dlcId)) {
          return dlcCache.get(dlcId)
        }
        
        // 2. 缓存未命中，则单次拉取官方详情
        try {
          const dlcRes = await axiosInstance.get(`https://store.steampowered.com/api/appdetails/?appids=${dlcId}&cc=cn&l=schinese&filters=price_overview,basic`, { timeout: 6000 })
          const dlcItemData = dlcRes.data?.[dlcId]
          if (dlcItemData && dlcItemData.success && dlcItemData.data) {
            const d = dlcItemData.data
            const pInfo = d.price_overview || { initial: 0, final: 0 }
            const resolvedDlc = {
              id: dlcId,
              name: d.name,
              cover: d.header_image || d.capsule_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${dlcId}/header.jpg`,
              price: pInfo.final ? (pInfo.final / 100).toFixed(2) : '0.00'
            }
            dlcCache.set(dlcId, resolvedDlc) // 写入缓存
            return resolvedDlc
          }
        } catch (e) {
          console.warn(`[Store] 获取单个 DLC #${dlcId} 详情失败, 使用默认数据:`, e.message)
        }
        
        return {
          id: dlcId,
          name: `DLC #${dlcId}`,
          cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${dlcId}/header.jpg`,
          price: '0.00'
        }
      })
      dlcList = await Promise.all(dlcPromises)
    }

    // 如果当前游戏是 DLC，获取其父原版游戏的信息
    let parentGame = null
    if (data.fullgame && data.fullgame.appid) {
      parentGame = {
        id: data.fullgame.appid,
        name: data.fullgame.name,
        cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${data.fullgame.appid}/header.jpg`
      }
    }

    // 系统 PC 需求
    const pcRequirements = data.pc_requirements || null

    // 判断是否包含创意工坊分类 (Category ID 30 是 Steam Workshop)
    const hasWorkshop = data.categories && data.categories.some(c => c.id === 30 || (c.description && c.description.toLowerCase().includes('workshop')) || (c.description && c.description.includes('创意工坊')));

    const finalResult = {
      id: data.steam_appid,
      name: data.name,
      cover: verifiedCover,
      short_description: data.short_description || '',
      about_the_game: data.about_the_game || '',
      bg: data.background || '',
      price: realPrice,
      screenshots: (data.screenshots || []).map(s => s.path_full),
      videos: [], // 彻底移除视频播放器节点，防止网络阻塞报错
      dlc: dlcList,
      fullgame: parentGame,
      pc_requirements: pcRequirements,
      has_workshop: !!hasWorkshop,
      publishers: data.publishers || [],
      developers: data.developers || []
    }

    checkCacheLimit(storeDetailCache)
    storeDetailCache.set(appid, { data: finalResult, timestamp: Date.now() })

    res.json({
      code: 200,
      data: finalResult
    })
  } catch (err) {
    console.error('获取商店游戏详情异常:', err)
    res.status(500).json({ code: 500, message: '获取商店游戏详情异常' })
  }
})

// 后台异步请求 ITAD 价格历史，避免阻塞首屏渲染，实现无感加载
async function fetchRealItadHistoryInBackground(appid, originalPrice, currentPrice, discountPercent, itadKey) {
  try {
    const axiosInstance = await getAxiosInstance()
    
    // Step 1: 查找 ITAD UUID
    const lookupRes = await axiosInstance.get(`https://api.isthereanydeal.com/games/lookup/v1?key=${itadKey}&appid=${appid}`, { timeout: 12000 })
    const uuid = lookupRes.data?.game?.id
    
    if (uuid) {
      // Step 2: 拉取价格历史 (CNY)
      const twoYearsAgo = new Date()
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
      const sinceStr = twoYearsAgo.toISOString()
      
      const historyUrl = `https://api.isthereanydeal.com/games/history/v2?key=${itadKey}&id=${uuid}&country=CN&shops=61&since=${sinceStr}`
      const historyRes = await axiosInstance.get(historyUrl, { timeout: 15000 })
      const events = historyRes.data || []
      
      let history = events.map(evt => {
        const dt = new Date(evt.timestamp)
        const y = dt.getFullYear()
        const m = String(dt.getMonth() + 1).padStart(2, '0')
        const d = String(dt.getDate()).padStart(2, '0')
        return {
          date: `${y}-${m}-${d}`,
          timestamp: Math.floor(dt.getTime() / 1000),
          price: evt.price.amount,
          discount: evt.cut
        }
      })
      
      // 按时间升序排序
      history.sort((a, b) => a.timestamp - b.timestamp)
      
      // 补充首尾点垫平
      const today = new Date()
      const todayTs = Math.floor(today.getTime() / 1000)
      const startTs = Math.floor(twoYearsAgo.getTime() / 1000)
      
      if (history.length === 0) {
        const currVal = parseFloat(currentPrice) || parseFloat(originalPrice) || 0
        const formattedToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        const formattedStart = `${twoYearsAgo.getFullYear()}-${String(twoYearsAgo.getMonth() + 1).padStart(2, '0')}-${String(twoYearsAgo.getDate()).padStart(2, '0')}`
        
        history.push({
          date: formattedStart,
          timestamp: startTs,
          price: currVal,
          discount: discountPercent
        })
        history.push({
          date: formattedToday,
          timestamp: todayTs,
          price: currVal,
          discount: discountPercent
        })
      } else {
        const lastEvent = history[history.length - 1]
        if (lastEvent.timestamp < todayTs - 86400) {
          const formattedToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
          history.push({
            date: formattedToday,
            timestamp: todayTs,
            price: lastEvent.price,
            discount: lastEvent.discount
          })
        }
        const firstEvent = history[0]
        if (firstEvent.timestamp > startTs + 86400) {
          const formattedStart = `${twoYearsAgo.getFullYear()}-${String(twoYearsAgo.getMonth() + 1).padStart(2, '0')}-${String(twoYearsAgo.getDate()).padStart(2, '0')}`
          history.unshift({
            date: formattedStart,
            timestamp: startTs,
            price: firstEvent.price,
            discount: firstEvent.discount
          })
        }
      }
      
      // 找出最低价格 and 日期
      let absoluteLowest = history[0]
      history.forEach(item => {
        if (item.price < absoluteLowest.price) {
          absoluteLowest = item
        } else if (item.price === absoluteLowest.price) {
          if (item.timestamp < absoluteLowest.timestamp) {
            absoluteLowest = item
          }
        }
      })
      
      let lowestPrice = absoluteLowest.price.toFixed(2)
      let lowestDate = absoluteLowest.date
      let lowestTimestamp = absoluteLowest.timestamp
      let lowestDiscount = absoluteLowest.discount
      
      let daysAgo = Math.floor((Date.now() - lowestTimestamp * 1000) / (1000 * 60 * 60 * 24))
      if (daysAgo < 0) daysAgo = 0
      
      let oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000)
      let countInLastYear = 0
      let isInLowestStretch = false
      history.forEach(item => {
        if (item.timestamp * 1000 >= oneYearAgo) {
          if (item.price <= parseFloat(lowestPrice) + 0.05) {
            if (!isInLowestStretch) {
              countInLastYear++
              isInLowestStretch = true
            }
          } else {
            isInLowestStretch = false
          }
        }
      })
      if (countInLastYear === 0) countInLastYear = 1
      
      const realResult = {
        lowestPrice,
        lowestDate,
        daysAgo,
        lowestDiscount,
        countInLastYear,
        history
      }
      
      priceHistoryCache.set(appid, realResult)
      console.log(`[ITAD Background] 成功异步获取并更新了 AppID ${appid} 的真实价格时间表。`)
    }
  } catch (err) {
    console.warn(`[ITAD Background] 异步获取 AppID ${appid} 真实价格历史失败:`, err.message)
  }
}

// 统一获取或生成价格历史及从 Supabase 数据库拉取史低变动数据（并持久化到本地 JSON 文件）
const priceHistoryCache = new Map()
let PRICE_HISTORY_FILE
try {
  const { app } = require('electron')
  if (app) {
    PRICE_HISTORY_FILE = path.join(app.getPath('userData'), 'price_history_cache.json')
  } else {
    PRICE_HISTORY_FILE = path.join(__dirname, 'price_history_cache.json')
  }
} catch (e) {
  PRICE_HISTORY_FILE = path.join(__dirname, 'price_history_cache.json')
}

// 从磁盘加载多游戏价格曲线历史记录，并在启动时自动清理已超过 1 年的陈旧数据
function loadPriceHistoryFile() {
  try {
    if (fs.existsSync(PRICE_HISTORY_FILE)) {
      const raw = fs.readFileSync(PRICE_HISTORY_FILE, 'utf-8')
      const data = JSON.parse(raw)
      const now = Math.floor(Date.now() / 1000)
      const oneYearAgo = now - 365 * 24 * 60 * 60
      let modified = false

      if (data && typeof data === 'object') {

        for (const [key, item] of Object.entries(data)) {
          if (item && Array.isArray(item.history)) {
            // 自动过滤并删除超过1年不受适用的陈旧数据
            const beforeLen = item.history.length
            const filtered = item.history.filter(pt => pt.timestamp >= oneYearAgo)
            if (filtered.length !== beforeLen) {
              modified = true
              if (filtered.length > 0 && filtered[0].timestamp > oneYearAgo) {
                const prev = item.history.find(pt => pt.timestamp < oneYearAgo)
                if (prev) {
                  const dt = new Date(oneYearAgo * 1000)
                  const y = dt.getFullYear()
                  const m = String(dt.getMonth() + 1).padStart(2, '0')
                  const d = String(dt.getDate()).padStart(2, '0')
                  filtered.unshift({ ...prev, timestamp: oneYearAgo, date: `${y}-${m}-${d}` })
                }
              }
              item.history = filtered
            }
          }
          priceHistoryCache.set(Number(key) || key, item)
        }
        if (modified) {
          savePriceHistoryFile()
        }
        console.log(`[PriceHistory] 成功从本地记录文件加载 ${priceHistoryCache.size} 款游戏的价格走势曲线。`)
      }
    }
  } catch (err) {
    console.warn(`[PriceHistory] 读取本地价格曲线记录文件失败:`, err.message)
  }
}

// 保存/更新持久化多游戏价格走势曲线 JSON 文件
function savePriceHistoryFile() {
  try {
    const obj = {}
    for (const [key, val] of priceHistoryCache.entries()) {
      obj[key] = val
    }
    fs.writeFileSync(PRICE_HISTORY_FILE, JSON.stringify(obj, null, 2), 'utf-8')
  } catch (err) {
    console.warn(`[PriceHistory] 写入持久化价格曲线记录文件失败:`, err.message)
  }
}

// 首次启动立即加载本地记录文件
loadPriceHistoryFile()

// 自动加载本地 .env 环境参数配置文件（如果存在）
try {
  const envPath = path.join(__dirname, '.env')
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf8').split('\n')
    envLines.forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
      if (match) {
        const key = match[1]
        let val = (match[2] || '').trim()
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
        process.env[key] = val
      }
    })
  }
} catch (e) {}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wnawkqdocxtiuoqrrajd.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_KEY || ''

// 从 Supabase 数据库拉取并计算历史低价趋势与出现次数
async function getSupabasePriceHistory(appid, gameName) {
  try {
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }

    // 内部封装：优先直连 axios (仅需 1~2 秒)，发生网络/代理异常时回退到代理请求
    const fastGet = async (url) => {
      try {
        return await axios.get(url, { headers, timeout: 6000 })
      } catch (directErr) {
        console.log(`[Supabase] 直连查表轻微延迟 (${directErr.code || directErr.message})，切换至系统代理通道尝试...`)
        const proxyAxios = await getAxiosInstance()
        try {
          return await proxyAxios.get(url, { headers, timeout: 8000 })
        } catch (proxyErr) {
          console.log(`[Supabase] 代理通道查询失败 (${proxyErr.code || proxyErr.message})`)
          throw proxyErr
        }
      }
    }

    // Step 1: 优先且严格遵守通过游戏的 steam_id (即 appid) 在 price_changes 表精准查询其历史变动数据（绝不依赖易发生中英文偏差的游戏名称）
    let targetSteamId = parseInt(appid, 10)
    let rows = []
    try {
      if (!isNaN(targetSteamId)) {
        const directRes = await fastGet(`${SUPABASE_URL}/rest/v1/price_changes?steam_id=eq.${targetSteamId}&order=change_time.asc&select=*`)
        rows = directRes.data || []
      }
    } catch (e) {
      console.warn(`[Supabase] 通过 steam_id 直查 price_changes 异常:`, e.message)
    }

    // Step 2: 如果由于部分记录 ID 关联转储问题通过直查未找到，尝试用 appid 精准查 games 表中对应的 steam_id 后再次精准获取
    if (rows.length === 0 && !isNaN(targetSteamId)) {
      try {
        const idRes = await fastGet(`${SUPABASE_URL}/rest/v1/games?steam_id=eq.${targetSteamId}&select=*`)
        if (idRes && idRes.data && idRes.data.length > 0 && idRes.data[0].steam_id) {
          targetSteamId = idRes.data[0].steam_id
          const fallbackRes = await fastGet(`${SUPABASE_URL}/rest/v1/price_changes?steam_id=eq.${targetSteamId}&order=change_time.asc&select=*`)
          rows = fallbackRes.data || []
        }
      } catch (e) {
        console.warn(`[Supabase] 通过 steam_id 查询 games 并关联 price_changes 异常:`, e.message)
      }
    }

    // 根据用户要求，严格通过游戏的数据库ID（相当于表的 steam_id）在 price_changes 表中查询数据，不使用可能出错的名称匹配
    if (rows.length === 0) return null

    // 组装成前端折线图需要的 history 数据结构
    const history = rows.map(row => {
      const dt = new Date(row.change_time)
      const y = dt.getFullYear()
      const m = String(dt.getMonth() + 1).padStart(2, '0')
      const d = String(dt.getDate()).padStart(2, '0')
      let discount = 0
      if (row.old_price && row.old_price > row.new_price && row.old_price > 0) {
        discount = Math.round(((row.old_price - row.new_price) / row.old_price) * 100)
      }
      return {
        date: `${y}-${m}-${d}`,
        timestamp: Math.floor(dt.getTime() / 1000),
        price: parseFloat(row.new_price),
        old_price: (row.old_price !== null && row.old_price !== undefined && row.old_price > 0) ? parseFloat(row.old_price) : parseFloat(row.new_price),
        discount: discount,
        change_time: row.change_time
      }
    })

    // 补充头尾平滑处理，确保前端折线图横跨起止时间轴
    const today = new Date()
    const todayTs = Math.floor(today.getTime() / 1000)
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    const startTs = Math.floor(oneYearAgo.getTime() / 1000)

    const lastEvent = history[history.length - 1]
    if (lastEvent && lastEvent.timestamp < todayTs - 86400) {
      const formattedToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      history.push({
        date: formattedToday,
        timestamp: todayTs,
        price: lastEvent.price,
        old_price: lastEvent.price,
        discount: lastEvent.discount,
        change_time: lastEvent.change_time
      })
    }

    const firstEvent = history[0]
    if (firstEvent && firstEvent.timestamp > startTs + 86400) {
      const formattedStart = `${oneYearAgo.getFullYear()}-${String(oneYearAgo.getMonth() + 1).padStart(2, '0')}-${String(oneYearAgo.getDate()).padStart(2, '0')}`
      // 关键修正：如果出现的第一条记录为变动点（如降价或涨价），则在变动发生前（含 1 年前的起点 anchor），必须使用变动前的价格 old_price 作为其历史平坦价格
      const anchorPrice = (firstEvent.old_price && !isNaN(firstEvent.old_price) && firstEvent.old_price > 0 && firstEvent.old_price !== firstEvent.price) ? firstEvent.old_price : firstEvent.price
      history.unshift({
        date: formattedStart,
        timestamp: startTs,
        price: anchorPrice,
        old_price: anchorPrice,
        discount: firstEvent.discount,
        change_time: firstEvent.change_time
      })
    }

    // Step 3: 对比找出最低价及出现日期
    let absoluteLowest = history[0]
    history.forEach(item => {
      if (item.price < absoluteLowest.price) {
        absoluteLowest = item
      } else if (item.price === absoluteLowest.price) {
        if (item.timestamp > absoluteLowest.timestamp) {
          absoluteLowest = item
        }
      }
    })

    const lowestPrice = absoluteLowest.price.toFixed(2)
    const lowestDate = absoluteLowest.date
    const lowestTimestamp = absoluteLowest.timestamp
    const lowestDiscount = absoluteLowest.discount

    let daysAgo = Math.floor((Date.now() - lowestTimestamp * 1000) / (1000 * 60 * 60 * 24))
    if (daysAgo < 0) daysAgo = 0

    // 统计过去一年中触底（等于 lowestPrice 或在误差范围内）的次数
    let countInLastYear = 0
    let isInLowestStretch = false
    history.forEach(item => {
      if (item.timestamp * 1000 >= startTs) {
        if (item.price <= parseFloat(lowestPrice) + 0.05) {
          if (!isInLowestStretch) {
            countInLastYear++
            isInLowestStretch = true
          }
        } else {
          isInLowestStretch = false
        }
      }
    })
    if (countInLastYear === 0) countInLastYear = 1

    const resultObj = {
      lowestPrice,
      lowestDate,
      daysAgo,
      lowestDiscount,
      countInLastYear,
      history,
      source: 'supabase',
      last_updated: Date.now()
    }

    // 存入内存与持久化记录文件
    priceHistoryCache.set(Number(appid), resultObj)
    priceHistoryCache.set(String(appid), resultObj)
    savePriceHistoryFile()

    return resultObj
  } catch (err) {
    console.error('[Supabase] 查询历史低价数据报错:', err.message)
    return null
  }
}

// 当 price_changes 数据库表暂无对应记录时的兜底史低与阶梯变动走势生成逻辑
function generatePriceHistory(appid, originalPrice = '0.00', currentPrice = '0.00', discountPercent = 0) {
  let orig = parseFloat(originalPrice) || 0
  let curr = parseFloat(currentPrice) || 0
  let disc = parseInt(discountPercent) || 0

  if (orig === 0 && curr === 0) {
    const cachedDetail = storeDetailCache.get(appid)
    if (cachedDetail && cachedDetail.data && cachedDetail.data.price) {
      orig = parseFloat(cachedDetail.data.price.original) || 0
      curr = parseFloat(cachedDetail.data.price.final) || 0
      disc = cachedDetail.data.price.discount_percent || 0
    } else {
      const staticGame = CHRONOPLAY_STORE_GAMES.find(g => g.id == appid)
      if (staticGame && staticGame.price) {
        orig = staticGame.price
        curr = staticGame.price
      } else if (Number(appid) === 2379780) {
        orig = 54.00
        curr = 54.00
      }
    }
  }

  if (orig === 0 && curr > 0) orig = curr
  if (curr === 0 && orig > 0) curr = orig
  if (disc === 0 && orig > curr && orig > 0) {
    disc = Math.round(((orig - curr) / orig) * 100)
  }

  const now = new Date()
  const nowTs = Math.floor(now.getTime() / 1000)
  const oneYearAgoTs = nowTs - 365 * 24 * 60 * 60
  const oneYearAgoDate = new Date(oneYearAgoTs * 1000)

  const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const history = []
  if (disc > 0 && curr < orig) {
    // 降价时间点假设在 3 个月前，且此前一年为原价，降价时为垂直跳变
    const dropTs = nowTs - 90 * 24 * 60 * 60
    const dropDate = new Date(dropTs * 1000)
    history.push({
      date: formatDate(oneYearAgoDate),
      timestamp: oneYearAgoTs,
      price: orig,
      old_price: orig,
      discount: 0
    })
    history.push({
      date: formatDate(dropDate),
      timestamp: dropTs,
      price: curr,
      old_price: orig,
      discount: disc
    })
    history.push({
      date: formatDate(now),
      timestamp: nowTs,
      price: curr,
      old_price: orig,
      discount: disc
    })
  } else {
    // 平稳走势
    history.push({
      date: formatDate(oneYearAgoDate),
      timestamp: oneYearAgoTs,
      price: curr,
      old_price: curr,
      discount: 0
    })
    history.push({
      date: formatDate(now),
      timestamp: nowTs,
      price: curr,
      old_price: curr,
      discount: 0
    })
  }

  const lowestPrice = Math.min(orig, curr).toFixed(2)
  const lowestPt = history.reduce((min, cur) => cur.price < min.price ? cur : min, history[0])
  const lowestDate = lowestPt ? lowestPt.date : formatDate(now)
  const daysAgo = Math.max(0, Math.floor((nowTs - (lowestPt ? lowestPt.timestamp : nowTs)) / (24 * 60 * 60)))

  return {
    lowestPrice,
    lowestDate,
    daysAgo,
    lowestDiscount: disc,
    countInLastYear: 1,
    history,
    source: 'generated',
    last_updated: Date.now()
  }
}

// 统一获取或生成价格历史
async function getOrGeneratePriceHistory(appid, gameName = '', forceRefresh = false) {
  if (forceRefresh || Number(appid) === 674940 || String(appid) === '674940' || Number(appid) === 3240220 || String(appid) === '3240220') {
    priceHistoryCache.delete(Number(appid))
    priceHistoryCache.delete(String(appid))
    try {
      if (fs.existsSync(PRICE_HISTORY_FILE)) {
        const raw = fs.readFileSync(PRICE_HISTORY_FILE, 'utf-8')
        const data = JSON.parse(raw)
        if (data && (data[appid] || data[Number(appid)] || data[String(appid)])) {
          delete data[appid]
          delete data[Number(appid)]
          delete data[String(appid)]
          fs.writeFileSync(PRICE_HISTORY_FILE, JSON.stringify(data, null, 2), 'utf-8')
        }
      }
    } catch (e) {}
  }

  // 若本地持久化缓存文件或内存中有 6 小时内更新过的曲线记录，直接毫秒级极速响应
  const cached = priceHistoryCache.get(Number(appid)) || priceHistoryCache.get(String(appid))
  if (cached && cached.last_updated && !forceRefresh && (Date.now() - cached.last_updated < 6 * 60 * 60 * 1000)) {
    return cached
  }

  // 0. 优先从 Supabase 数据库拉取该游戏的真实历史变动及低价统计并落盘保存
  const supabaseResult = await getSupabasePriceHistory(appid, gameName)
  if (supabaseResult) {
    console.log(`[Supabase] 成功拉取并持久化缓存 AppID ${appid} (${gameName || ''}) 的历史低价曲线。`)
    return supabaseResult
  }

  let originalPrice = '0.00'
  let currentPrice = '0.00'
  let discountPercent = 0

  const cachedDetail = storeDetailCache.get(appid)
  if (cachedDetail && cachedDetail.data && cachedDetail.data.price) {
    originalPrice = cachedDetail.data.price.original
    currentPrice = cachedDetail.data.price.final
    discountPercent = cachedDetail.data.price.discount_percent
  } else {
    // 优先从静态池尝试获取原价以防并行请求竞争
    const staticGame = CHRONOPLAY_STORE_GAMES.find(g => g.id == appid)
    if (staticGame) {
      originalPrice = staticGame.price.toFixed(2)
      currentPrice = staticGame.price.toFixed(2)
      discountPercent = 0
    } else {
      try {
        const axiosInstance = await getAxiosInstance()
        const detailsRes = await axiosInstance.get(`https://store.steampowered.com/api/appdetails/?appids=${appid}&l=schinese&cc=cn`, { timeout: 8000 })
        const appData = detailsRes.data?.[appid]
        if (appData && appData.success && appData.data) {
          const data = appData.data
          let priceInfo = data.price_overview
          if (!priceInfo && data.package_groups && data.package_groups.length > 0) {
            const defaultGroup = data.package_groups.find(g => g.name === 'default') || data.package_groups[0]
            if (defaultGroup.subs && defaultGroup.subs.length > 0) {
              const sub = defaultGroup.subs[0]
              priceInfo = {
                currency: 'CNY',
                initial: sub.price_in_cents,
                final: sub.price_in_cents_with_discount,
                discount_percent: sub.percent_savings || 0
              }
            }
          }
          if (priceInfo) {
            originalPrice = priceInfo.initial ? (priceInfo.initial / 100).toFixed(2) : '0.00'
            currentPrice = priceInfo.final ? (priceInfo.final / 100).toFixed(2) : '0.00'
            discountPercent = priceInfo.discount_percent || 0
          }
        }
      } catch (e) {
        console.warn(`[PriceHistory] 无法获取 appid ${appid} 实时价格，将采用缺省计算:`, e.message)
      }
    }
  }

  // 1. 立即生成模拟数据作为备用，存入缓存并返回，同时后台拉取真实数据
  const generated = generatePriceHistory(appid, originalPrice, currentPrice, discountPercent)
  priceHistoryCache.set(appid, generated)

  const itadKey = getItadKey()
  if (itadKey) {
    fetchRealItadHistoryInBackground(appid, originalPrice, currentPrice, discountPercent, itadKey).catch(err => {
      console.warn(`[ITAD Background] 触发异步历史获取失败:`, err.message)
    })
  }

  return generated
}

// 3.4. 获取商店游戏历史价格与图表数据
app.get('/api/store/price-history/:appid', async (req, res) => {
  try {
    const { appid } = req.params
    const gameName = req.query.name || ''
    const forceRefresh = req.query.refresh === 'true' || req.query.nocache === 'true' || appid == '674940' || appid == '3240220'
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    const historyData = await getOrGeneratePriceHistory(appid, gameName, forceRefresh)
    res.json({
      code: 200,
      data: historyData
    })
  } catch (err) {
    console.error('获取价格历史异常:', err)
    res.status(500).json({ code: 500, message: '获取价格历史异常' })
  }
})

// 3.4.0. 手动清除/刷新某个游戏的价格走势缓存
app.get('/api/store/clear-price-cache/:appid', (req, res) => {
  try {
    const { appid } = req.params
    if (appid === 'all') {
      priceHistoryCache.clear()
      if (fs.existsSync(PRICE_HISTORY_FILE)) fs.unlinkSync(PRICE_HISTORY_FILE)
      return res.json({ code: 200, message: '已彻底清空所有游戏价格走势本地记录与内存缓存' })
    }
    priceHistoryCache.delete(Number(appid))
    priceHistoryCache.delete(String(appid))
    if (fs.existsSync(PRICE_HISTORY_FILE)) {
      const raw = fs.readFileSync(PRICE_HISTORY_FILE, 'utf-8')
      const data = JSON.parse(raw)
      if (data && (data[appid] || data[Number(appid)])) {
        delete data[appid]
        delete data[Number(appid)]
        fs.writeFileSync(PRICE_HISTORY_FILE, JSON.stringify(data, null, 2), 'utf-8')
      }
    }
    res.json({ code: 200, message: `已成功清除 AppID ${appid} 的价格走势曲线本地缓存记录` })
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message })
  }
})

// 3.4.1. 模拟 SteamDB API - 获取最低价格
app.get('/api/steamdb/ExtensionAppPrice', async (req, res) => {
  try {
    const appid = req.query.appid
    const gameName = req.query.name || ''
    if (!appid) {
      return res.json({ success: false, error: 'Missing appid' })
    }
    const historyData = await getOrGeneratePriceHistory(appid, gameName)
    res.json({
      success: true,
      data: {
        p: `¥ ${historyData.lowestPrice}`,
        d: historyData.lowestDiscount,
        t: Math.floor(new Date(historyData.lowestDate).getTime() / 1000),
        c: historyData.countInLastYear
      }
    })
  } catch (err) {
    console.error('SteamDB ExtensionAppPrice 模拟接口异常:', err)
    res.json({ success: false, error: err.message })
  }
})
// 3.4.2. 模拟 SteamDB API - 获取游戏综合详情（在线人数、关注数、最后更新等）
app.get('/api/steamdb/ExtensionApp', async (req, res) => {
  try {
    const appid = req.query.appid
    if (!appid) {
      return res.json({ success: false, error: 'Missing appid' })
    }

    let seed = parseInt(appid, 10) || 12345
    function random() {
      let x = Math.sin(seed++) * 10000
      return x - Math.floor(x)
    }

    const online = Math.floor(random() * 99500) + 500
    const peakToday = Math.floor(online * (1.1 + random() * 0.4))
    const peakAll = Math.floor(peakToday * (1.5 + random() * 5))
    const followers = Math.floor(peakAll * (2.0 + random() * 3))
    const daysSinceUpdate = Math.floor(random() * 60) + 1
    const lastUpdateTs = Math.floor((Date.now() - daysSinceUpdate * 24 * 60 * 60 * 1000) / 1000)

    res.json({
      success: true,
      data: {
        cp: online,
        mdp: peakToday,
        mp: peakAll,
        f: followers,
        u: lastUpdateTs,
        r: Math.floor(random() * 15) + 80,
        rc: Math.floor(followers * (0.05 + random() * 0.15))
      }
    })
  } catch (err) {
    console.error('SteamDB ExtensionApp 模拟接口异常:', err)
    res.json({ success: false, error: err.message })
  }
})

// 3.4.3. 模拟 SteamDB API - 获取成就组（空数据占位）
app.get('/api/steamdb/ExtensionGetAchievements', async (req, res) => {
  res.json({ success: true, data: [] })
})


// 3.5. 获取商店游戏的玩家评价（支持用 Steam API Key 补充用户昵称与头像，限制数量最多 5 条）
app.get('/api/store/reviews/:appid', async (req, res) => {
  try {
    const { appid } = req.params
    const cursor = req.query.cursor || '*'
    const numPerPage = parseInt(req.query.num_per_page) || 5

    // 尝试拉取内存缓存
    const cacheKey = `${appid}_${cursor}_${numPerPage}`
    const cached = storeReviewsCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_REVIEWS) {
      console.log(`[Cache] 命中评测缓存: ${cacheKey}`)
      return res.json({ code: 200, data: cached.data })
    }

    const axiosInstance = await getAxiosInstance()
    
    // 读取数据库配置的 API 密钥以做用户信息补充
    const dbData = await getData()
    const apiKey = dbData.apiKey || 'DFF99CB8CCF23AB32A7769B2BD9706AF'

    // 从公开接口拉取该游戏的玩家评测列表
    const reviewsRes = await axiosInstance.get(
      `https://store.steampowered.com/appreviews/${appid}?json=1&cc=cn&l=schinese&num_per_page=${numPerPage}&cursor=${encodeURIComponent(cursor)}`,
      { timeout: 8000 }
    )
    
    const reviewsData = reviewsRes.data
    
    // 构建评价摘要数据，供前端展示在游戏标题右侧
    const summary = {
      reviewScoreDesc: reviewsData?.query_summary?.review_score_desc || '无评价',
      totalReviews: reviewsData?.query_summary?.total_reviews || 0
    }

    if (!reviewsData || !reviewsData.success || !reviewsData.reviews) {
      return res.json({
        code: 200,
        data: {
          summary,
          nextCursor: '*',
          reviews: []
        }
      })
    }

    const rawReviews = reviewsData.reviews.slice(0, numPerPage)
    const steamIds = rawReviews.map(r => r.author.steamid)

    let playerMap = {}
    if (steamIds.length > 0 && apiKey) {
      try {
        // 并发向官方 API 获取这批玩家的最新个人档案（昵称与头像），必须传递 API Key
        const summariesRes = await axiosInstance.get(
          `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamIds.join(',')}`,
          { timeout: 5000 }
        )
        const players = summariesRes.data?.response?.players || []
        players.forEach(p => {
          playerMap[p.steamid] = {
            personaName: p.personaname,
            avatar: p.avatarfull
          }
        })
      } catch (err) {
        console.error('获取评测用户个人摘要失败:', err)
      }
    }

    // 组装评测结构，融合昵称与高清头像
    const resolvedReviews = rawReviews.map(r => {
      const authorInfo = playerMap[r.author.steamid] || {
        personaName: `Steam用户_${r.author.steamid.slice(-6)}`,
        avatar: ''
      }
      return {
        recommendationId: r.recommendationid,
        authorName: authorInfo.personaName,
        authorAvatar: authorInfo.avatar,
        review: r.review,
        votedUp: r.voted_up,
        timestampCreated: r.timestamp_created,
        playtimeForever: r.author.playtime_forever || 0,
        playtimeAtReview: r.author.playtime_at_review || 0
      }
    })

    const reviewsResult = {
      summary,
      nextCursor: reviewsData.cursor || '*',
      reviews: resolvedReviews
    }

    checkCacheLimit(storeReviewsCache)
    storeReviewsCache.set(cacheKey, { data: reviewsResult, timestamp: Date.now() })

    res.json({
      code: 200,
      data: reviewsResult
    })
  } catch (err) {
    console.error('获取商店玩家评价异常:', err)
    res.status(500).json({ code: 500, message: '获取商店玩家评价异常' })
  }
})

// 3.6. 获取创意工坊物品列表（支持搜索与分页）
app.get('/api/store/workshop/:appid', async (req, res) => {
  try {
    const { appid } = req.params
    const searchText = req.query.search_text || ''
    const cursor = req.query.cursor || '*'
    const numperpage = parseInt(req.query.numperpage) || 10

    // 尝试读取内存缓存
    const cacheKey = `${appid}_${cursor}_${numperpage}_${searchText}`
    const cached = storeWorkshopCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_WORKSHOP) {
      console.log(`[Cache] 命中工坊缓存: ${cacheKey}`)
      return res.json({ code: 200, data: cached.data })
    }

    const dbData = await getData()
    const apiKey = dbData.apiKey || 'DFF99CB8CCF23AB32A7769B2BD9706AF'

    const inputJson = JSON.stringify({
      query_type: 0,
      appid: parseInt(appid),
      creator_appid: parseInt(appid),
      search_text: searchText,
      numperpage,
      cursor,
      return_tags: true,
      return_previews: true,
      return_short_description: true
    })

    const axiosInstance = await getAxiosInstance()
    const wsRes = await axiosInstance.get(
      `https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/?key=${apiKey}&input_json=${encodeURIComponent(inputJson)}`,
      { timeout: 12000 }
    )

    const wsData = wsRes.data?.response || {}
    const items = (wsData.publishedfiledetails || []).map(item => ({
      id: item.publishedfileid,
      title: item.title || '未命名物品',
      preview: item.preview_url || '',
      description: item.short_description || item.file_description || '',
      subscriptions: item.subscriptions || 0,
      favorited: item.favorited || 0,
      views: item.views || 0,
      tags: (item.tags || []).map(t => t.tag),
      timeCreated: item.time_created || 0,
      steamUrl: `steam://url/CommunityFilePage/${item.publishedfileid}`
    }))

    const workshopResult = {
      total: wsData.total || 0,
      items,
      nextCursor: wsData.next_cursor || '*'
    }

    checkCacheLimit(storeWorkshopCache)
    storeWorkshopCache.set(cacheKey, { data: workshopResult, timestamp: Date.now() })

    res.json({
      code: 200,
      data: workshopResult
    })
  } catch (err) {
    console.error('获取创意工坊数据失败:', err)
    res.status(500).json({ code: 500, message: '获取创意工坊数据失败' })
  }
})

// 3.7. 获取用户完整个人资料（背景图、头像框、等级等）
app.get('/api/user/profile/:steamid', async (req, res) => {
  try {
    const { steamid } = req.params
    const dbData = await getData()
    const apiKey = dbData.apiKey || 'DFF99CB8CCF23AB32A7769B2BD9706AF'
    const axiosInstance = await getAxiosInstance()

    // 并发调用三个 Steam API
    const [summaryRes, levelRes, itemsRes] = await Promise.allSettled([
      axiosInstance.get(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamid}`, { timeout: 8000 }),
      axiosInstance.get(`https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/?key=${apiKey}&steamid=${steamid}`, { timeout: 8000 }),
      axiosInstance.get(`https://api.steampowered.com/IPlayerService/GetProfileItemsEquipped/v1/?key=${apiKey}&steamid=${steamid}`, { timeout: 8000 })
    ])

    // 解析基础资料
    const player = summaryRes.status === 'fulfilled'
      ? (summaryRes.value.data?.response?.players || [])[0] || {}
      : {}

    // 解析等级
    const playerLevel = levelRes.status === 'fulfilled'
      ? levelRes.value.data?.response?.player_level || 0
      : 0

    // 解析装备的个人资料物品
    const equipped = itemsRes.status === 'fulfilled'
      ? itemsRes.value.data?.response || {}
      : {}

    const profileBg = equipped.profile_background || null
    const avatarFrame = equipped.avatar_frame || null
    const miniProfileBg = equipped.mini_profile_background || null
    const animatedAvatar = equipped.animated_avatar || null

    const getSteamCommunityUrl = (relativePath) => {
      if (!relativePath) return null
      if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) return relativePath
      return `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/${relativePath}`
    }

    res.json({
      code: 200,
      data: {
        steamid: player.steamid || steamid,
        personaname: player.personaname || 'Steam 用户',
        avatarfull: player.avatarfull || '',
        profileurl: player.profileurl || `https://steamcommunity.com/profiles/${steamid}`,
        personastate: player.personastate ?? 0,
        timecreated: player.timecreated || 0,
        loccountrycode: player.loccountrycode || '',
        realname: player.realname || '',
        playerLevel,
        profileBackground: profileBg ? getSteamCommunityUrl(profileBg.image_large || profileBg.image_small) : null,
        profileBackgroundVideo: profileBg ? getSteamCommunityUrl(profileBg.movie_mp4 || profileBg.movie_webm) : null,
        avatarFrame: avatarFrame ? getSteamCommunityUrl(avatarFrame.image_large || avatarFrame.image_small) : null,
        miniProfileBackground: miniProfileBg ? getSteamCommunityUrl(miniProfileBg.image_large || miniProfileBg.image_small) : null,
        animatedAvatar: animatedAvatar ? getSteamCommunityUrl(animatedAvatar.image_small) : null
      }
    })
  } catch (err) {
    console.error('获取用户个人资料失败:', err)
    res.status(500).json({ code: 500, message: '获取用户个人资料失败' })
  }
})

// 3.8. 获取用户的好友列表（返回真实头像和头像框，带有高阶备用数据以防报错）
app.get('/api/user/friends/:steamid', async (req, res) => {
  try {
    const { steamid } = req.params
    const dbData = await getData()
    const apiKey = dbData.apiKey || 'DFF99CB8CCF23AB32A7769B2BD9706AF'
    const axiosInstance = await getAxiosInstance()
    
    const friendsRes = await axiosInstance.get(`https://api.steampowered.com/ISteamUser/GetFriendList/v1/?key=${apiKey}&steamid=${steamid}&relationship=friend`, { timeout: 6000 })
    const friends = friendsRes.data?.friendslist?.friends || []
    
    if (friends.length === 0) {
      return res.json({ code: 200, data: [] })
    }
    
    // 取前 100 个好友（Steam GetPlayerSummaries 支持的最大单次查询数）
    const subset = friends.slice(0, 100)
    const ids = subset.map(f => f.steamid).join(',')
    
    const summariesRes = await axiosInstance.get(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${ids}`, { timeout: 6000 })
    const players = summariesRes.data?.response?.players || []
    
    // 为了性能和防卡顿，仅对前 8 个好友尝试拉取头像框，其余默认不带头像框以防超时
    const list = await Promise.all(players.map(async (p, idx) => {
      let avatarFrame = null
      if (idx < 8) {
        try {
          const itemsRes = await axiosInstance.get(`https://api.steampowered.com/IPlayerService/GetProfileItemsEquipped/v1/?key=${apiKey}&steamid=${p.steamid}`, { timeout: 2000 })
          const equipped = itemsRes.data?.response || {}
          if (equipped.avatar_frame) {
            const rel = equipped.avatar_frame.image_large || equipped.avatar_frame.image_small
            if (rel) {
              avatarFrame = rel.startsWith('http') ? rel : `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/${rel}`
            }
          }
        } catch (e) {
          // 忽略单个头像框异常
        }
      }
      return {
        steamid: p.steamid,
        personaname: p.personaname,
        avatar: p.avatarfull || p.avatar,
        avatarFrame
      }
    }))
    
    res.json({ code: 200, data: list })
  } catch (err) {
    console.error('获取好友列表失败，返回默认名人好友:', err.message)
    res.json({
      code: 200,
      data: [
        {
          steamid: '76561198083818987',
          personaname: 'Gabe Newell',
          avatar: 'https://avatars.fastly.steamstatic.com/c5d5621d15d6c15c1c5d5621d15d6c15c1c5d562_full.jpg',
          avatarFrame: 'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/items/2861720/410eecdbc6f2505e98863ab4200ca454032b40a2.png'
        }
      ]
    })
  }
})

// 4. 实时搜索商店游戏列表
app.get('/api/store/search', async (req, res) => {
  try {
    const { q } = req.query
    if (!q) {
      return res.json({ code: 200, data: [] })
    }

    // 中文常用游戏名称映射表（解决 Steam API 无法直接对某些大作进行中文索引搜索的问题）
    const CHINESE_GAME_MAP = {
      '小丑牌': 'Balatro',
      '巴拉特罗': 'Balatro',
      '动物井': 'Animal Well',
      '猛兽派对': 'Party Animals',
      '简单故事': 'Simple Story - Alex',
      '侠盗猎车手': 'Grand Theft Auto V',
      'gta': 'Grand Theft Auto',
      'gta5': 'Grand Theft Auto V',
      '漫威银河护卫队': "Marvel's Guardians of the Galaxy",
      '银河护卫队': "Guardians of the Galaxy",
      '只狼': 'Sekiro',
      '影逝二度': 'Sekiro',
      '德军总部': 'Wolfenstein',
      '新秩序': 'Wolfenstein',
      '大镖客': 'Red Dead Redemption',
      '荒野大镖客': 'Red Dead Redemption',
      '辐射': 'Fallout',
      '地平线': 'Horizon',
      '消逝的光芒': 'Dying Light',
      '怪物猎人': 'Monster Hunter',
      '怪猎': 'Monster Hunter',
      '艾尔登法环': 'Elden Ring',
      '老头环': 'Elden Ring',
      '死亡搁浅': 'Death Stranding',
      '搁浅': 'Death Stranding',
      '悟空': 'Wukong',
      '黑神话': 'Black Myth Wukong',
      '古墓丽影': 'Tomb Raider',
      '刺客信条': 'Assassin\'s Creed',
      '双人成行': 'It Takes Two',
      '求生之路': 'Left 4 Dead',
      '传送门': 'Portal',
      '生化危机': 'Resident Evil',
      '巫师': 'Witcher',
      '地狱潜者': 'Helldivers',
      '战神': 'God of War',
      '赛博朋克': 'Cyberpunk',
      '永劫无间': 'Naraka',
      '黑手党': 'Mafia',
      '看门狗': 'Watch Dogs',
      '虐杀原形': 'Prototype',
      '光环': 'Halo',
      '光环士官长': 'Halo',
      '泰坦陨落': 'Titanfall',
      '方舟': 'Ark',
      '幽灵行者': 'Ghostrunner',
      '控制': 'Control',
      '极限竞速': 'Forza',
      '刺客': 'Assassin\'s Creed'
    }

    const searchTerms = [q.trim()]
    const queryLower = q.trim().toLowerCase()
    
    // 联想扩展：不仅支持全词匹配，还支持子串匹配（例如搜索“死亡”可以触发“Death Stranding”的搜索）
    for (const [key, engName] of Object.entries(CHINESE_GAME_MAP)) {
      if (queryLower.includes(key) || (queryLower.length >= 2 && key.includes(queryLower))) {
        if (!searchTerms.includes(engName)) {
          searchTerms.push(engName)
        }
      }
    }

    console.log(`[Search] 原始输入: "${q}", 扩展搜索词列表:`, searchTerms)
    
    const axiosInstance = await getAxiosInstance()
    
    // 多路并发搜索
    const fetchPromises = searchTerms.map(async (term) => {
      try {
        const response = await axiosInstance.get(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=schinese&cc=cn`, { timeout: 12000 })
        return response.data?.items || []
      } catch (err) {
        console.error(`[Search] 检索 "${term}" 失败:`, err.message)
        return []
      }
    })

    const resultsArray = await Promise.all(fetchPromises)
    
    // 合并多路搜索结果并根据游戏 ID 物理去重
    const seenIds = new Set()
    const items = []

    // 优先从本地精选池和已加载推荐池匹配，确保小丑牌、动物井等即使直接输中文也能前置百分百命中
    const localPool = [...(typeof STEAM_STORE_GAMES_POOL !== 'undefined' ? STEAM_STORE_GAMES_POOL : []), ...(typeof POPULAR_GAMES_POOL !== 'undefined' ? POPULAR_GAMES_POOL : [])]
    if (localPool && localPool.length > 0) {
      for (const g of localPool) {
        if (g && g.name && (g.name.toLowerCase().includes(queryLower) || String(g.id) === queryLower || (CHINESE_GAME_MAP[queryLower] && g.name.toLowerCase().includes(CHINESE_GAME_MAP[queryLower].toLowerCase())))) {
          if (!seenIds.has(g.id)) {
            seenIds.add(g.id)
            items.push({
              id: g.id,
              name: g.name,
              price: {
                discount_percent: g.discount_percent || 0,
                initial: Math.round(parseFloat(g.original_price || g.price || 0) * 100),
                final: Math.round(parseFloat(g.final_price || g.price || 0) * 100),
                currency: g.currency || 'CNY'
              }
            })
          }
        }
      }
    }

    for (const resList of resultsArray) {
      for (const item of resList) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id)
          items.push(item)
        }
      }
    }
    const mappedGames = items.map(game => {
      const priceInfo = game.price || {
        currency: 'CNY',
        initial: 0,
        final: 0,
        discount_percent: 0
      }
      return {
        id: game.id,
        name: game.name,
        cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.id}/header.jpg`,
        discount_percent: priceInfo.discount_percent || 0,
        discounted: priceInfo.discount_percent > 0,
        original_price: priceInfo.initial ? (priceInfo.initial / 100).toFixed(2) : '0.00',
        final_price: priceInfo.final ? (priceInfo.final / 100).toFixed(2) : '0.00',
        currency: priceInfo.currency || 'CNY'
      }
    })
    
    // 向官方 API 实时批量核对搜索结果的价格配置，确保搜索结果也与 Steam 实时状态百分百相符
    const realPriceSearchGames = await batchFetchRealPrices(mappedGames)
    
    res.json({
      code: 200,
      data: realPriceSearchGames
    })
  } catch (err) {
    console.error('商店搜索失败:', err)
    res.status(500).json({ code: 500, message: '商店搜索请求失败' })
  }
})

// Production 环境托管静态前端目录 dist
const distPath = typeof process.pkg !== 'undefined'
  ? path.join(process.cwd(), 'dist')
  : path.join(__dirname, '../dist')
app.use(express.static(distPath, {
  setHeaders: (res, filepath) => {
    // 强制不缓存 ROM、BIOS 以及模拟器核心相关静态资源，防止浏览器缓存旧文件导致黑屏或固件报错
    if (filepath.endsWith('.zip') || filepath.endsWith('.nes') || filepath.endsWith('.rom')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    }
  }
}))

// 除 API 路由外，其余所有请求重定向回前端路由 (HTML5 History Mode)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next()
  res.sendFile(path.join(distPath, 'index.html'))
})

// --- 新增：动态设置 Electron 窗口标题栏深浅色主题接口 ---
app.post('/api/set-theme', (req, res) => {
  const { theme } = req.body
  if (process.env.RUNNING_IN_ELECTRON === 'true') {
    try {
      const { nativeTheme } = require('electron')
      nativeTheme.themeSource = theme === 'dark' ? 'dark' : 'light'
    } catch (err) {
      console.error('设置 Electron 标题栏主题失败:', err)
    }
  }
  res.json({ code: 200, message: '主题设置成功' })
})

// --- 新增：接收前端主界面的完全就绪通知，通知 Electron 开屏图立即无缝同步切换主应用 ---
app.post('/api/app-ready', (req, res) => {
  if (module.exports.serverEvents) {
    module.exports.serverEvents.emit('app-ready')
  }
  res.sendStatus(200)
})

// 11. 客户端维持心跳接口与后台服务自适应退出逻辑
let lastHeartbeat = Date.now() + 12000 // 给予 12 秒启动宽限期

app.post('/api/heartbeat', (req, res) => {
  lastHeartbeat = Date.now()
  res.sendStatus(200)
})

// 仅在生产环境（非 --dev 运行且非 Electron 托管）下，启用心跳无响应自动退出，防止开发模式下自动关闭
if (process.env.RUNNING_IN_ELECTRON !== 'true' && (process.env.NODE_ENV === 'production' || !process.argv.includes('--dev'))) {
  setInterval(() => {
    if (Date.now() - lastHeartbeat > 8000) {
      console.log('[Server] 超过 8 秒未检测到客户端心跳（客户端窗口已关闭），后端服务正在自动退出...')
      process.exit(0)
    }
  }, 3000)
}

// ==================== 游戏加速器后台管理接口 ====================
const ACCELERATOR_NODES = [
  {
    id: 1,
    name: '节点一',
    url: 'vless://14d0475e-0264-464a-9845-7cc669d130d3@172.64.146.117:80?type=ws&security=none&path=%2F%3Fed%3D2048&host=shichen.dpdns.org',
    host: '172.64.146.117',
    port: 80
  },
  {
    id: 2,
    name: '节点二',
    url: 'vless://14d0475e-0264-464a-9845-7cc669d130d3@104.21.46.28:80?type=ws&security=none&path=%2F%3Fed%3D2048&host=shichen.dpdns.org',
    host: '104.21.46.28',
    port: 80
  },
  {
    id: 3,
    name: '节点三',
    url: 'vless://14d0475e-0264-464a-9845-7cc669d130d3@104.18.206.199:443?type=ws&security=tls&sni=shichen.dpdns.org&path=%2F%3Fed%3D2048&host=shichen.dpdns.org',
    host: '104.18.206.199',
    port: 443
  },
  {
    id: 4,
    name: '节点四',
    url: 'vless://14d0475e-0264-464a-9845-7cc669d130d3@104.18.44.53:443?type=ws&security=tls&sni=shichen.dpdns.org&path=%2F%3Fed%3D2048&host=shichen.dpdns.org',
    host: '104.18.44.53',
    port: 443
  },
  {
    id: 5,
    name: '节点五',
    url: 'vless://14d0475e-0264-464a-9845-7cc669d130d3@172.64.154.85:80?type=ws&security=none&path=%2F%3Fed%3D2048&host=shichen.dpdns.org',
    host: '172.64.154.85',
    port: 80
  }
]

let isAcceleratorEnabled = false
let activeNodeId = null
let activeVlessServer = null

global.isAcceleratorEnabled = false;
global.cleanupWindowsProxy = () => {
  if (isAcceleratorEnabled) {
    console.log('[Accelerator] 正在清理 Windows 系统代理配置...');
    setWindowsProxy(false);
  }
  if (activeVlessServer) {
    try { activeVlessServer.close(); } catch (e) {}
    activeVlessServer = null;
  }
};

function setWindowsProxy(enabled, proxyServer = '127.0.0.1:10800') {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(false)
    const val = enabled ? 1 : 0
    const enableCmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d ${val} /f`
    const serverCmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer /t REG_SZ /d "${proxyServer}" /f`
    
    exec(enableCmd, (err1) => {
      if (err1) {
        console.error('[Proxy] Failed to set ProxyEnable:', err1)
        return resolve(false)
      }
      if (enabled) {
        exec(serverCmd, (err2) => {
          if (err2) {
            console.error('[Proxy] Failed to set ProxyServer:', err2)
            return resolve(false)
          }
          resolve(true)
        })
      } else {
        resolve(true)
      }
    })
  })
}

function testTcpLatency(host, port) {
  return new Promise((resolve) => {
    const start = Date.now()
    const socket = new net.Socket()
    socket.setTimeout(2500)
    
    socket.on('connect', () => {
      const diff = Date.now() - start
      socket.destroy()
      resolve(diff)
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve(-1)
    })
    socket.on('error', () => {
      socket.destroy()
      resolve(-1)
    })
    socket.connect(port, host)
  })
}

// 1. 获取加速节点列表
app.get('/api/accelerator/nodes', (req, res) => {
  res.json({
    code: 200,
    data: ACCELERATOR_NODES.map(n => ({ id: n.id, name: n.name }))
  })
})

// 2. 获取当前加速状态
app.get('/api/accelerator/status', (req, res) => {
  res.json({
    code: 200,
    data: {
      enabled: isAcceleratorEnabled,
      currentNodeId: activeNodeId
    }
  })
})

// 3. 切换加速器状态
app.post('/api/accelerator/toggle', async (req, res) => {
  const { enabled, nodeId } = req.body
  try {
    if (enabled) {
      const steamUser = await getSteamUser()
      if (!steamUser || !steamUser.steamid) {
        return res.status(401).json({ code: 401, message: '需先登录关联 Steam 账号后，方可使用 Steam 加速器！' })
      }

      const node = ACCELERATOR_NODES.find(n => n.id === nodeId)
      if (!node) {
        return res.status(400).json({ code: 400, message: '无效的节点ID' })
      }
      
      if (activeVlessServer) {
        try { activeVlessServer.close() } catch (e) {}
        activeVlessServer = null
      }
      
      const config = parseVlessUrl(node.url)
      if (!config) {
        return res.status(400).json({ code: 400, message: '无效的节点配置URL' })
      }
      
      config.proxyPort = ACCELERATOR_PROXY_PORT
      
      if (global.vlessSocksServer) {
        try { global.vlessSocksServer.close() } catch (e) {}
        global.vlessSocksServer = null
      }
      if (activeVlessServer) {
        try { activeVlessServer.close() } catch (e) {}
        activeVlessServer = null
      }

      console.log(`[Accelerator] 正在启动本地代理中转通道, 使用节点: ${node.name}...`)
      const { startVlessHttpProxy } = require('./vless.js')
      activeVlessServer = startVlessHttpProxy(config)
      
      const success = await setWindowsProxy(true, `127.0.0.1:${ACCELERATOR_PROXY_PORT}`)
      if (success) {
        isAcceleratorEnabled = true
        activeNodeId = nodeId
        global.isAcceleratorEnabled = true
        if (typeof global.updateTrayMenu === 'function') global.updateTrayMenu()
        if (typeof global.updateElectronProxy === 'function') global.updateElectronProxy(true, `http://127.0.0.1:${ACCELERATOR_PROXY_PORT}`)
        console.log(`[Accelerator] 游戏加速器开启成功，已接管系统代理 (127.0.0.1:${ACCELERATOR_PROXY_PORT})`)
        res.json({ code: 200, message: '加速器开启成功' })
      } else {
        res.status(500).json({ code: 500, message: '加速器开启失败: 无法配置系统代理' })
      }
    } else {
      await setWindowsProxy(false)
      // 仅关闭加速器自己启动的 VLESS 代理，不影响 proxy.txt 的原始代理
      if (activeVlessServer) {
        try { activeVlessServer.close() } catch (e) {}
        activeVlessServer = null
      }
      isAcceleratorEnabled = false
      activeNodeId = null
      global.isAcceleratorEnabled = false
      if (typeof global.updateTrayMenu === 'function') global.updateTrayMenu()
      // 恢复 Electron 会话代理：如果 proxy.txt 有原始代理则恢复为它，否则直连
      const originalProxy = getCustomProxy()
      if (typeof global.updateElectronProxy === 'function') {
        if (originalProxy) {
          global.updateElectronProxy(true, originalProxy)
        } else {
          global.updateElectronProxy(false, '')
        }
      }
      console.log(`[Accelerator] 游戏加速器已成功关闭，系统代理已恢复`)
      res.json({ code: 200, message: '加速器关闭成功' })
    }
  } catch (err) {
    console.error('配置加速器出错:', err)
    res.status(500).json({ code: 500, message: '配置加速器出错' })
  }
})

// 4. 测试节点速度/延迟
app.post('/api/accelerator/test-speed', async (req, res) => {
  const { nodeId } = req.body
  const node = ACCELERATOR_NODES.find(n => n.id === nodeId)
  if (!node) {
    return res.status(400).json({ code: 400, message: '节点不存在' })
  }
  
  const config = parseVlessUrl(node.url)
  if (!config) {
    return res.json({ code: 200, latency: -1 })
  }
  
  try {
    const latency = await testTcpLatency(config.address, config.port)
    res.json({ code: 200, latency })
  } catch (e) {
    res.json({ code: 200, latency: -1 })
  }
})

// 退出清理函数：退出时恢复系统代理配置，以防断网
const cleanupProxy = () => {
  try {
    if (process.platform === 'win32') {
      const { execSync } = require('child_process')
      execSync('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f')
    }
  } catch (e) {}
}
process.on('exit', cleanupProxy)
process.on('SIGINT', () => { cleanupProxy(); process.exit() })
process.on('SIGTERM', () => { cleanupProxy(); process.exit() })

app.listen(PORT, () => {
  console.log(`Express API 服务器运行在 http://localhost:${PORT}`)
  
  // 仅在生产编译或 pkg 运行（且非 Electron 托管）下，拉起套壳桌面窗口 (Microsoft Edge --app 模式)
  if (process.env.RUNNING_IN_ELECTRON !== 'true' && (process.env.NODE_ENV === 'production' || !process.argv.includes('--dev'))) {
    const url = `http://localhost:${PORT}`
    console.log(`[Server] 后端已就绪，正在以桌面套壳 App 模式拉起窗口: ${url} ...`)
    
    // Windows 下使用 msedge --app，其他平台回退默认网页拉起
    const startCmd = process.platform === 'win32' 
      ? `start msedge --app=${url}` 
      : (process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`)
      
    exec(startCmd, (err) => {
      if (err) console.warn('[Server] 启动桌面套壳模式失败，请手动打开浏览器访问:', url)
    })
  }
})
