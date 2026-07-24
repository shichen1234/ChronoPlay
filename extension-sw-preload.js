/**
 * ChronoPlay 扩展 Service Worker 预加载脚本
 * 
 * 用途：在扩展的 Background Service Worker 启动之前，预先注入兼容性补丁，
 * 将 Electron 不支持的 Chrome API（如 chrome.storage.sync、chrome.webRequest 等）
 * 进行 polyfill/桥接，使其能够正常运行而不会崩溃。
 * 
 * 解决的核心报错：
 *   - Uncaught (in promise) Error: "sync" is not available in this instance of Chrome
 *   - No source for require(webRequest)
 */

(function () {
  'use strict';

  // ===== 1. Polyfill chrome.storage.sync → chrome.storage.local =====
  // Electron 不支持 chrome.storage.sync，但许多扩展（SteamDB、沉浸式翻译等）
  // 都会在 Service Worker 启动时立即调用它。
  // 将 sync 桥接到 local，确保数据读写操作不崩溃。
  if (typeof chrome !== 'undefined' && chrome.storage) {
    if (!chrome.storage.sync || typeof chrome.storage.sync.get !== 'function') {
      chrome.storage.sync = chrome.storage.local;
      console.log('[ChronoPlay Polyfill] chrome.storage.sync → 已桥接至 chrome.storage.local');
    }
  }

  // ===== 2. Polyfill chrome.storage.session =====
  // 部分扩展也会用到 session storage，Electron 可能不支持
  if (typeof chrome !== 'undefined' && chrome.storage) {
    if (!chrome.storage.session || typeof chrome.storage.session.get !== 'function') {
      chrome.storage.session = chrome.storage.local;
      console.log('[ChronoPlay Polyfill] chrome.storage.session → 已桥接至 chrome.storage.local');
    }
  }

  // ===== 3. Stub chrome.webRequest（如果缺失） =====
  // 沉浸式翻译等扩展会尝试加载 webRequest 模块，Electron 不提供。
  // 注入一个无操作的空壳对象以防止 require 崩溃。
  if (typeof chrome !== 'undefined' && !chrome.webRequest) {
    chrome.webRequest = {
      onBeforeRequest: { addListener: function () {}, removeListener: function () {}, hasListener: function () { return false; } },
      onBeforeSendHeaders: { addListener: function () {}, removeListener: function () {}, hasListener: function () { return false; } },
      onHeadersReceived: { addListener: function () {}, removeListener: function () {}, hasListener: function () { return false; } },
      onCompleted: { addListener: function () {}, removeListener: function () {}, hasListener: function () { return false; } },
      onErrorOccurred: { addListener: function () {}, removeListener: function () {}, hasListener: function () { return false; } }
    };
    console.log('[ChronoPlay Polyfill] chrome.webRequest → 已注入无操作存根');
  }

  // ===== 4. Stub chrome.declarativeNetRequest（如果缺失） =====
  // SteamDB 可能会尝试使用 declarativeNetRequest
  if (typeof chrome !== 'undefined' && !chrome.declarativeNetRequest) {
    chrome.declarativeNetRequest = {
      updateDynamicRules: function () { return Promise.resolve(); },
      getDynamicRules: function () { return Promise.resolve([]); },
      updateSessionRules: function () { return Promise.resolve(); },
      getSessionRules: function () { return Promise.resolve([]); },
      updateEnabledRulesets: function () { return Promise.resolve(); },
      getEnabledRulesets: function () { return Promise.resolve([]); }
    };
    console.log('[ChronoPlay Polyfill] chrome.declarativeNetRequest → 已注入无操作存根');
  }

  // ===== 5. Stub chrome.contextMenus（如果缺失） =====
  // 沉浸式翻译在 manifest 中声明了 contextMenus 权限
  if (typeof chrome !== 'undefined' && !chrome.contextMenus) {
    chrome.contextMenus = {
      create: function () {},
      update: function () {},
      remove: function () { return Promise.resolve(); },
      removeAll: function () { return Promise.resolve(); },
      onClicked: { addListener: function () {}, removeListener: function () {}, hasListener: function () { return false; } }
    };
    console.log('[ChronoPlay Polyfill] chrome.contextMenus → 已注入无操作存根');
  }

  // ===== 6. Stub chrome.sidePanel（如果缺失） =====
  if (typeof chrome !== 'undefined' && !chrome.sidePanel) {
    chrome.sidePanel = {
      setOptions: function () { return Promise.resolve(); },
      setPanelBehavior: function () { return Promise.resolve(); },
      getOptions: function () { return Promise.resolve({}); },
      open: function () { return Promise.resolve(); }
    };
    console.log('[ChronoPlay Polyfill] chrome.sidePanel → 已注入无操作存根');
  }

  console.log('[ChronoPlay Polyfill] Service Worker 预加载兼容性补丁注入完毕！');
})();
