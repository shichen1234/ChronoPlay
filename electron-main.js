const { app, BrowserWindow, session, Tray, Menu, nativeImage, shell, nativeTheme } = require('electron');
app.name = 'ChronoPlay';
const path = require('path');
const fs = require('fs');

// 全局捕获底层异常与 Promise 拒绝，确保网络中断或 Socket EPIPE/ECONNRESET 时主进程稳定不闪退
process.on('uncaughtException', (err) => {
  const msg = err && (err.message || err.code || err);
  if (typeof msg === 'string' && (msg.includes('EPIPE') || msg.includes('ECONNRESET') || msg.includes('ERR_STREAM') || msg.includes('socket') || msg.includes('net::') || msg.includes('Canceled'))) {
    return;
  }
  console.error('[Electron Main Uncaught Exception]', err);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason && (reason.message || reason.code || reason);
  if (typeof msg === 'string' && (msg.includes('EPIPE') || msg.includes('ECONNRESET') || msg.includes('ERR_STREAM') || msg.includes('socket') || msg.includes('net::') || msg.includes('Canceled'))) {
    return;
  }
  console.error('[Electron Main Unhandled Rejection]', reason);
});

global.updateElectronProxy = (enabled, proxyUrl) => {
  try {
    if (session && session.defaultSession) {
      // 确保所有本地流量（包括前端到后端 localhost:3000 的 API 请求）绝不走代理
      const bypassRules = '<-loopback>;localhost;127.0.0.1;[::1];<local>';
      if (enabled && proxyUrl) {
        console.log('[Electron] 正在同步启用会话层网络代理:', proxyUrl, ' (本地流量已豁免)');
        session.defaultSession.setProxy({
          proxyRules: proxyUrl,
          proxyBypassRules: bypassRules
        });
      } else {
        console.log('[Electron] 正在恢复会话层网络为直连模式...');
        session.defaultSession.setProxy({
          proxyRules: '',
          proxyBypassRules: bypassRules
        });
      }
    }
  } catch (e) {
    console.warn('[Electron] 同步代理配置失败:', e.message);
  }
};

// ====== 单例进程互斥锁 (Single Instance Lock) ======
// 确保后台只有一个 ChronoPlay 实例运行。如果二次启动或点击快捷方式/任务栏，立即唤起后台隐藏的主窗口，并主动关闭副进程，杜绝端口冲突 EADDRINUSE :::3000 和双进程。
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', (event, commandLine, workingDirectory) => {
  if (mainWindow) {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  } else {
    createWindow();
  }
});
// ===================================================

// 强制开启系统级和托盘功能菜单全黑 (Dark Mode)
if (nativeTheme) {
  nativeTheme.themeSource = 'dark';
}

// 强制开启 GPU 硬件加速与 WebGL 最佳性能配置
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-fast-unload');
// 约束 Chromium 磁盘缓存与内存占用，防止导航切换反复加载 Steam CDN 图片后内存无限膨胀
app.commandLine.appendSwitch('disk-cache-size', '52428800');  // 50 MB 磁盘缓存上限
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256'); // JS 堆上限 256 MB

function parseVlessUrl(vlessUrl) {
  try {
    const url = new URL(vlessUrl);
    if (url.protocol !== 'vless:') return null;
    
    const uuid = url.username;
    const address = url.hostname;
    const port = parseInt(url.port) || 443;
    const params = url.searchParams;
    
    return {
      uuid,
      address,
      port,
      host: params.get('host') || address,
      path: params.get('path') || '/'
    };
  } catch (e) {
    console.error('[VLESS] Failed to parse VLESS URL:', e);
    return null;
  }
}

function getCustomProxy() {
  const proxyFilePath = path.join(process.cwd(), 'proxy.txt');
  if (fs.existsSync(proxyFilePath)) {
    try {
      const lines = fs.readFileSync(proxyFilePath, 'utf-8').split('\n');
      for (let line of lines) {
        line = line.trim();
        if (line && !line.startsWith('#')) {
          if (line.startsWith('vless://')) {
            const config = parseVlessUrl(line);
            if (config) {
              config.proxyPort = 10800;
              if (!global.vlessSocksServer) {
                console.log('[VLESS] Electron 主进程检测到 VLESS 协议，正在初始化本地 HTTP CONNECT 桥接通道...');
                const { startVlessHttpProxy } = require('./server/vless.js');
                global.vlessSocksServer = startVlessHttpProxy(config);
              }
              return 'http://127.0.0.1:10800';
            }
          }
          if (line.startsWith('http://') || line.startsWith('https://') || line.startsWith('socks5://') || line.startsWith('socks4://')) {
            return line;
          }
        }
      }
    } catch (e) {
      console.error('[Proxy] Failed to read proxy.txt:', e);
    }
  }
  return null;
}

// 标记为运行在 Electron 容器内，以防止 server.js 重复拉起 Edge 浏览器
process.env.RUNNING_IN_ELECTRON = 'true';
process.env.NODE_ENV = 'production';

// 启动 Express 后端服务器
try {
  console.log('[Electron] 正在启动后台 Express 服务器...');
  require('./server/server.js');
} catch (err) {
  console.error('[Electron] 后台服务器启动失败:', err);
}

let mainWindow;
let splashWindow;
let isSwitchingWindow = false;
let tray = null;
let isQuitting = false;

function showAndNavigate(routePath) {
  if (mainWindow) {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();

    if (routePath) {
      mainWindow.webContents.executeJavaScript(`
        if (window.__VUE_ROUTER__) {
          window.__VUE_ROUTER__.push('${routePath}');
        } else {
          window.location.href = 'http://localhost:3000${routePath}';
        }
      `);
    }
  } else {
    createWindow();
    if (routePath && routePath !== '/') {
      setTimeout(() => {
        if (mainWindow) {
          mainWindow.webContents.executeJavaScript(`
            if (window.__VUE_ROUTER__) {
              window.__VUE_ROUTER__.push('${routePath}');
            }
          `);
        }
      }, 1500);
    }
  }
}

function toggleAcceleratorFromTray(enable) {
  const http = require('http');
  const postData = JSON.stringify({
    enabled: enable,
    nodeId: 1
  });
  const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/accelerator/toggle',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, (res) => {
    let raw = '';
    res.on('data', (c) => raw += c);
    res.on('end', () => {
      if (res.statusCode === 401) {
        const { dialog } = require('electron');
        dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: '需关联 Steam 账号',
          message: '请先登录并关联您的 Steam 账号，方可开启或管理 Steam 加速服务！',
          buttons: ['前往登录']
        }).then(() => {
          showAndNavigate('/login');
        });
      } else if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.executeJavaScript(`
          if (window.location.pathname === '/accelerator') {
            location.reload();
          }
        `);
      }
    });
  });
  req.on('error', (e) => {
    console.error('[Tray] Toggle accelerator error:', e);
  });
  req.write(postData);
  req.end();
}

function updateTrayMenu() {
  if (!tray) return;

  // 使用 16x16 标准图标防止 Windows 菜单分配超宽的左侧图标边距栏，使菜单面板极致收窄
  const headerIcon = nativeImage.createFromPath(path.join(__dirname, 'public', 'tubiao.png')).resize({ width: 16, height: 16 });

  const isAccOn = global.isAcceleratorEnabled || false;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: ' ChronoPlay',
      icon: headerIcon,
      enabled: false
    },
    { type: 'separator' },
    {
      label: '打开首页',
      click: () => showAndNavigate('/')
    },
    {
      label: '打开游戏商店',
      click: () => showAndNavigate('/store')
    },
    {
      label: '打开复古游戏室',
      click: () => showAndNavigate('/retro')
    },
    { type: 'separator' },
    {
      label: 'Steam加速器',
      submenu: [
        {
          label: isAccOn ? '⚡ 关闭 Steam 加速器' : '🚀 开启 Steam 加速器',
          click: () => toggleAcceleratorFromTray(!isAccOn)
        },
        { type: 'separator' },
        {
          label: '⚙️ 打开加速控制面板',
          click: () => showAndNavigate('/accelerator')
        }
      ]
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        if (typeof global.cleanupWindowsProxy === 'function') {
          global.cleanupWindowsProxy();
        }
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, 'public', 'tubiao.ico');
  let trayIcon = nativeImage.createFromPath(iconPath);
  if (trayIcon.isEmpty()) {
    trayIcon = nativeImage.createFromPath(path.join(__dirname, 'public', 'tubiao.png')).resize({ width: 16, height: 16 });
  }
  tray = new Tray(trayIcon);
  tray.setToolTip('ChronoPlay');

  global.updateTrayMenu = updateTrayMenu;
  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    } else {
      createWindow();
    }
  });

  tray.on('double-click', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

function createSplashWindow() {
  global.splashStartTime = Date.now();
  splashWindow = new BrowserWindow({
    width: 680,
    height: 420,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false
    }
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

function createWindow() {
  const customProxy = getCustomProxy();
  if (customProxy) {
    global.updateElectronProxy(true, customProxy);
  }

  // 5. 为 SteamDB 扩展的 API 域名放行 CORS 限制
  // Electron 的 Service Worker 中 fetch 可能被 CORS 策略阻挡，
  // 导致 "Failed to fetch" 错误，无法获取 SteamDB 价格数据。
  // 通过拦截响应头注入 Access-Control-Allow-Origin 来解决。
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['https://extension.steamdb.info/*', 'https://api.steampowered.com/*'] },
    (details, callback) => {
      const headers = details.responseHeaders || {};
      headers['access-control-allow-origin'] = ['*'];
      headers['access-control-allow-methods'] = ['GET, POST, OPTIONS'];
      headers['access-control-allow-headers'] = ['Content-Type, X-Requested-With, Accept'];
      callback({ responseHeaders: headers });
    }
  );
  console.log('[Electron] 已为 extension.steamdb.info 和 api.steampowered.com 注入 CORS 放行头');

  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    backgroundColor: '#0f172a',
    title: 'ChronoPlay',
    icon: path.join(__dirname, 'public', 'tubiao.png'),
    show: false, // 初始隐藏，等待开屏一秒后展示
    // 隐藏默认的菜单栏，营造纯粹的客户端应用感
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true // 开启沙盒，完美兼容 Chromium 的扩展程序（Content Scripts 与 Service Worker）
    }
  });

  // 1. 加载本地 Express 服务器的地址
  mainWindow.loadURL('http://localhost:3000');

  // 打开主网页应用时，立刻预先最大化并展示窗口，确保全局视口为全屏，元素精确居中
  mainWindow.maximize();
  mainWindow.show();

  // 2. 健壮性：如果 Express 服务器启动有延迟导致加载失败，每隔 500ms 自动重试，直至成功加载，杜绝白屏
  mainWindow.webContents.on('did-fail-load', () => {
    console.log('[Electron] 页面加载失败，后台服务器可能尚未就绪，500ms 后自动重试...');
    setTimeout(() => {
      if (mainWindow) {
        mainWindow.loadURL('http://localhost:3000');
      }
    }, 500);
  });

  // 渲染进程崩溃防护：即使极少数底层 GPU 缓冲异常导致渲染引擎崩溃，也能静默捕获并自动恢复页面，绝不退出闪退
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[Electron] 渲染进程意外终止 (render-process-gone):', details.reason, details.exitCode);
    if (details.reason !== 'clean-exit' && mainWindow && !mainWindow.isDestroyed()) {
      console.log('[Electron] 正在自动重新加载主页以修复渲染进程...');
      setTimeout(() => {
        try { mainWindow.reload(); } catch (e) {}
      }, 500);
    }
  });

  mainWindow.webContents.on('child-process-gone', (event, details) => {
    console.error('[Electron] 子进程/GPU进程意外终止 (child-process-gone):', details.type, details.reason);
  });

  // 3. 调试辅助：允许在窗口内通过 F12 键开启/关闭开发者工具，方便捕获错误日志
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // 4. 拦截页面内的所有链接在新窗口中打开的请求，转为应用内搭载了 Chrome 扩展的窗口打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      const { shell } = require('electron');
      shell.openExternal(url);
      return { action: 'deny' };
    }
    
    console.log('[Electron] 正在在应用内打开链接:', url);
    const win = new BrowserWindow({
      width: 1250,
      height: 820,
      title: 'ChronoPlay 浏览器',
      icon: path.join(__dirname, 'public', 'tubiao.png'),
      autoHideMenuBar: true,
      session: session.defaultSession, // 确保明确使用已加载插件的默认主会话
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true, // 开启沙盒，完美兼容 Chromium 的扩展程序
        webviewTag: true // 开启 WebviewTag 完美承载独立沙盒与扩展
      }
    });

    // 注入标准 Chrome 浏览器 User-Agent，让 Steam 页面和插件能够完美识别并运行！
    win.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    // 允许在内嵌浏览器窗口中通过 F12 开启开发者工具以调试插件
    win.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' && input.type === 'keyDown') {
        win.webContents.toggleDevTools();
        event.preventDefault();
      }
    });

    const customProxy = getCustomProxy();
    if (customProxy) {
      win.webContents.session.setProxy({
        proxyRules: customProxy,
        proxyBypassRules: 'localhost;127.0.0.1;<local>'
      });
    }

    win.loadFile(path.join(__dirname, 'browser.html'), { query: { url } });
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// 自动检测扩展目录（如 manifest.json 位于二级目录，则自动向下寻获一层，提高解压容错率）
function findExtensionManifestDir(basePath) {
  if (!fs.existsSync(basePath)) return null;
  if (fs.existsSync(path.join(basePath, 'manifest.json'))) {
    return basePath;
  }
  try {
    const files = fs.readdirSync(basePath);
    for (const file of files) {
      const subPath = path.join(basePath, file);
      if (fs.statSync(subPath).isDirectory()) {
        if (fs.existsSync(path.join(subPath, 'manifest.json'))) {
          console.log(`[Extension] 扫描发现 manifest.json 位于二级子目录: ${subPath}`);
          return subPath;
        }
      }
    }
  } catch (e) {
    console.error('[Extension] 扫描扩展包目录结构出错:', e.message);
  }
  return null;
}

app.on('ready', async () => {
  // 1. 立刻创建无边框开屏宣传图窗口，确保秒级视觉反馈，不让用户面对无响应的白屏
  createSplashWindow();

  // 2. 注册 Service Worker 预加载脚本，在扩展的 Background Service Worker 启动前注入兼容性补丁
  //    解决 Electron 不支持 chrome.storage.sync / chrome.webRequest 等 API 导致扩展 Service Worker 崩溃的问题
  try {
    const swPreloadPath = path.join(__dirname, 'extension-sw-preload.js');
    if (fs.existsSync(swPreloadPath)) {
      session.defaultSession.registerPreloadScript({
        type: 'service-worker',
        script: swPreloadPath
      });
      console.log('[Extension] Service Worker 预加载兼容性补丁已注册:', swPreloadPath);
    }
  } catch (preloadErr) {
    console.warn('[Extension] 注册 SW 预加载脚本失败（将回退到直接修补模式）:', preloadErr.message);
  }

  // 3. 在主进程启动时自动加载 沉浸式翻译 浏览器扩展 (SteamDB 扩展已被用户停用)
  /*
  try {
    const steamdbBase = path.join(__dirname, 'extensions', 'steamdb');
    const steamdbPath = findExtensionManifestDir(steamdbBase);
    if (steamdbPath) {
      console.log('[Extension] 正在加载 SteamDB 插件, 路径:', steamdbPath);
      await session.defaultSession.extensions.loadExtension(steamdbPath, { allowFileAccess: true });
      console.log('[Extension] SteamDB 插件加载成功！');
    } else {
      console.warn('[Extension] 未找到有效的 SteamDB 插件目录 (缺少 manifest.json)');
    }
  } catch (extErr) {
    console.error('[Extension] 加载 SteamDB 插件出错:', extErr);
  }
  */

  try {
    const immersiveBase = path.join(__dirname, 'extensions', 'immersive-translate');
    const immersivePath = findExtensionManifestDir(immersiveBase);
    if (immersivePath) {
      console.log('[Extension] 正在加载 沉浸式翻译 插件, 路径:', immersivePath);
      await session.defaultSession.extensions.loadExtension(immersivePath, { allowFileAccess: true });
      console.log('[Extension] 沉浸式翻译 插件加载成功！');
    } else {
      console.warn('[Extension] 未找到有效的 沉浸式翻译 插件目录 (缺少 manifest.json)');
    }
  } catch (extErr) {
    console.error('[Extension] 加载 沉浸式翻译 插件出错:', extErr);
  }

  // 打印已注册扩展信息进行最终确认
  try {
    const loadedExts = session.defaultSession.extensions.getAllExtensions();
    const names = loadedExts.map(ext => `${ext.name} (${ext.id})`);
    console.log('[Extension] 目前主会话已成功挂载的扩展列表:', names);
  } catch (e) {
    console.warn('[Extension] 获取已加载插件列表失败:', e.message);
  }

  // 3. 先展示 1 秒的开屏动画，到期后：先打开网页应用，然后再销毁开屏动画窗口（避免在窗口切换瞬间触发 window-all-closed 导致闪退！）
  setTimeout(() => {
    isSwitchingWindow = true;
    createWindow();
    createTray();
    if (splashWindow) {
      splashWindow.destroy();
      splashWindow = null;
    }
    isSwitchingWindow = false;
  }, 1000);
});

app.on('before-quit', () => {
  isQuitting = true;
  if (typeof global.cleanupWindowsProxy === 'function') {
    global.cleanupWindowsProxy();
  }
});

app.on('window-all-closed', function () {
  if (isSwitchingWindow || !isQuitting) return;
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  } else {
    if (!mainWindow.isVisible()) mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
