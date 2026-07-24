const packager = require('electron-packager');
const { execSync } = require('child_process');
const path = require('path');

console.log('1. 正在终止所有运行中的 ChronoPlay 进程以释放文件锁...');
try {
  execSync('taskkill /F /IM ChronoPlay.exe /T', { stdio: 'ignore' });
} catch (e) {}

console.log('1.5 正在自动修补浏览器扩展以解决 Electron 兼容性问题...');
try {
  execSync('node patch-extensions.js', { stdio: 'inherit' });
} catch (e) {
  console.error('扩展自动修补失败:', e);
}

console.log('2. 正在运行 npm run build 编译前端资产...');
try {
  execSync('npm run build', { stdio: 'inherit' });
} catch (err) {
  console.error('前端编译失败:', err);
  process.exit(1);
}

console.log('3. 开始使用精确过滤打包 ChronoPlay 原生客户端 (从本地缓存直接加载)...');
packager({
  dir: '.',
  name: 'ChronoPlay',
  platform: 'win32',
  arch: 'x64',
  out: 'desktop-app',
  icon: path.join(__dirname, 'public', 'tubiao.ico'),
  overwrite: true,
  // 精确过滤：忽略未编译的 public 重复大资源包、src 源码、scratch 临时目录、已打包的 desktop-app 以及测试脚本
  ignore: [
    /^\/(desktop-app|desktop|src|\.git|public|scratch)/,
    /\.(sql|csv|log|ps1|bat)$/i,
    /^\/(test_|check_|find_|_tmp_|popular_|search_)/
  ]
})
.then(appPaths => {
  const fs = require('fs');
  const path = require('path');
  appPaths.forEach(appPath => {
    const srcProxy = path.join(__dirname, 'proxy.txt');
    const destProxy = path.join(appPath, 'proxy.txt');
    if (fs.existsSync(srcProxy)) {
      fs.copyFileSync(srcProxy, destProxy);
      console.log(`[Build] 成功复制 proxy.txt 配置文件至原生包目录: ${destProxy}`);
    }
  });
  console.log('4. 打包成功！原生应用已输出至目录:', appPaths);
})
.catch(err => {
  console.error('打包过程中出错:', err);
  process.exit(1);
});
