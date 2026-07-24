/**
 * ChronoPlay 扩展修补脚本 v2
 * 
 * 在 Electron 中，chrome.storage.sync 不被支持。
 * 此脚本自动将所有扩展 JS 文件中的 storage.sync 调用替换为 storage.local，
 * 确保扩展的 Background Service Worker 不会崩溃，Content Scripts 能正常获取数据。
 */

const fs = require('fs');
const path = require('path');

function findJsFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  fs.readdirSync(dir).forEach(f => {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      results = results.concat(findJsFiles(full));
    } else if (f.endsWith('.js')) {
      results.push(full);
    }
  });
  return results;
}

const extensionsDir = path.join(__dirname, 'extensions');
if (!fs.existsSync(extensionsDir)) {
  console.log('[Patch] 未找到 extensions 目录，跳过修补。');
  process.exit(0);
}

let totalPatched = 0;
const extDirs = fs.readdirSync(extensionsDir).map(d => path.join(extensionsDir, d)).filter(d => fs.statSync(d).isDirectory());

extDirs.forEach(extDir => {
  const jsFiles = findJsFiles(extDir);
  
  jsFiles.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    const originalContent = content;
    
    // ===== 修补策略 =====
    
    // 1. 显式的 chrome.storage.sync → chrome.storage.local
    content = content.replace(/chrome\.storage\.sync/g, 'chrome.storage.local');
    
    // 2. 任何 .storage.sync 模式（变量名.storage.sync）
    content = content.replace(/\.storage\.sync/g, '.storage.local');
    
    // 3. browser.storage.sync → browser.storage.local
    content = content.replace(/browser\.storage\.sync/g, 'browser.storage.local');
    
    // 4. 沉浸式翻译特有的压缩模式：uu("sync") → uu("local")
    //    原文：var N4={local:uu("local"),sync:uu("sync"),session:uu("session"),...}
    //    这是创建 storage wrapper 的工厂函数，传入 "sync" 参数时会调用 chrome.storage.sync
    content = content.replace(/sync:uu\("sync"\)/g, 'sync:uu("local")');
    content = content.replace(/sync:uu\('sync'\)/g, "sync:uu('local')");
    
    // 5. 更通用的压缩模式：任何函数(\"sync\") 后跟 storage 相关上下文
    //    匹配类似 XX("sync") 的工厂调用（仅在同一行有 "local" 和 "session" 的情况下替换，避免误伤）
    content = content.replace(/(local:\w+\("local"\),\s*sync:\w+\()"sync"(\))/g, '$1"local"$2');
    content = content.replace(/(local:\w+\('local'\),\s*sync:\w+\()'sync'(\))/g, "$1'local'$2");
    
    // 6. 沉浸式翻译中通过变量 G.sync 调用的模式
    //    G.sync.get(...) → G.local.get(...)
    //    G.sync.set(...) → G.local.set(...)
    content = content.replace(/G\.sync\.(get|set|remove|clear|getBytesInUse)/g, 'G.local.$1');
    
    // 7. 处理 session storage 的兼容问题（Electron 也可能不支持 chrome.storage.session）
    content = content.replace(/chrome\.storage\.session/g, 'chrome.storage.local');
    content = content.replace(/\.storage\.session/g, '.storage.local');
    content = content.replace(/session:uu\("session"\)/g, 'session:uu("local")');
    content = content.replace(/session:uu\('session'\)/g, "session:uu('local')");
    content = content.replace(/(sync:\w+\("local"\),\s*session:\w+\()"session"(\))/g, '$1"local"$2');
    content = content.replace(/G\.session\.(get|set|remove|clear|getBytesInUse)/g, 'G.local.$1');
    
    // 8. 重定向 SteamDB 远程 API 域名到本地服务，彻底绕过国内网络阻断并实现无缝数据代理
    if (content.includes('https://extension.steamdb.info/api/')) {
      content = content.replace(/https:\/\/extension\.steamdb\.info\/api\//g, 'http://localhost:3000/api/steamdb/');
    }
    
    if (content !== originalContent) {
      fs.writeFileSync(file, content, 'utf8');
      const relPath = path.relative(__dirname, file);
      console.log(`[Patch] ✅ ${relPath}`);
      totalPatched++;
    }
  });
});

console.log(`\n[Patch] JS 文件修补完毕！共修补了 ${totalPatched} 个文件。`);
console.log('[Patch] 所有 storage.sync / storage.session 调用已桥接至 storage.local。');

// ===== Phase 2: 修补 SteamDB manifest.json =====
// Electron 的扩展系统不像真正的 Chrome 那样让同一扩展的多个 content_script 条目共享隔离世界。
// 在 Electron 中，每个 content_script 条目运行在独立上下文中，
// 导致只在第一个条目中注入的 common.js（定义了 GetOption、GetLanguage 等核心函数）
// 在后续条目中不可见，报 ReferenceError: GetOption is not defined。
// 解决方案：将 common.js 前置添加到所有需要它的 content_script 条目中。

const steamdbManifestPath = path.join(__dirname, 'extensions', 'steamdb', 'manifest.json');
if (fs.existsSync(steamdbManifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(steamdbManifestPath, 'utf8'));
    let manifestPatched = 0;
    
    manifest.content_scripts.forEach((cs) => {
      const hasCommon = cs.js.some(j => j.includes('common.js'));
      const matchesSteam = cs.matches.some(m => 
        m.includes('steampowered.com') || m.includes('steamcommunity.com') || m.includes('steamdb.info')
      );
      // 只为 ISOLATED world（非 MAIN）的条目添加 common.js
      if (!hasCommon && matchesSteam && cs.world !== 'MAIN') {
        cs.js.unshift('scripts/common.js');
        manifestPatched++;
      }
    });
    
    if (manifestPatched > 0) {
      // 保存将在 Phase 2.5 统一写入
    }

    // ===== Phase 2.5: 修补 host_permissions =====
    // SteamDB 的 Service Worker 需要 fetch https://extension.steamdb.info/api/... 来获取价格数据，
    // 但该域名不在原始 manifest 的 host_permissions 中。
    // 在标准 Chrome 中 MV3 Service Worker 的 fetch 不受 host_permissions 限制，
    // 但在 Electron 中会被阻挡，导致 "Failed to fetch" 错误。
    const requiredHosts = [
      'https://extension.steamdb.info/*',
      'https://api.steampowered.com/*'
    ];
    let hostsAdded = 0;
    if (!manifest.host_permissions) manifest.host_permissions = [];
    requiredHosts.forEach(host => {
      if (!manifest.host_permissions.includes(host)) {
        manifest.host_permissions.push(host);
        hostsAdded++;
      }
    });
    if (hostsAdded > 0) {
      console.log(`[Patch] ✅ SteamDB manifest.json: 添加了 ${hostsAdded} 个缺失的 host_permissions`);
    }

    // 统一写入所有 manifest 修改
    if (manifestPatched > 0 || hostsAdded > 0) {
      fs.writeFileSync(steamdbManifestPath, JSON.stringify(manifest, null, 3), 'utf8');
      if (manifestPatched > 0) {
        console.log(`[Patch] ✅ SteamDB manifest.json: 为 ${manifestPatched} 个 content_script 条目前置添加了 common.js`);
      }
    } else {
      console.log('[Patch] SteamDB manifest.json: 无需修补。');
    }
  } catch (e) {
    console.error('[Patch] 修补 SteamDB manifest.json 失败:', e.message);
  }
} else {
  console.log('[Patch] 未找到 SteamDB manifest.json，跳过 manifest 修补。');
}

console.log('[Patch] 全部修补流程完毕！');
