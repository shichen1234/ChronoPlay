const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const net = require('net');

function uuidToBytes(uuidStr) {
  const clean = uuidStr.replace(/-/g, '');
  const bytes = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

function buildVlessHeader(uuidBytes, host, port) {
  const version = Buffer.from([0x00]);
  const addLen = Buffer.from([0x00]);
  const cmd = Buffer.from([0x01]); // 0x01: TCP
  
  const portBuf = Buffer.alloc(2);
  portBuf.writeUInt16BE(port, 0);
  
  let addrType;
  let addrBuf;
  if (net.isIPv4(host)) {
    addrType = 0x01;
    addrBuf = Buffer.from(host.split('.').map(Number));
  } else {
    addrType = 0x02;
    const len = Buffer.byteLength(host);
    addrBuf = Buffer.alloc(1 + len);
    addrBuf[0] = len;
    addrBuf.write(host, 1);
  }
  
  return Buffer.concat([
    version,
    uuidBytes,
    addLen,
    cmd,
    portBuf,
    Buffer.from([addrType]),
    addrBuf
  ]);
}

function startVlessHttpProxy(config) {
  const { uuid, address, port, host, path: wsPath, proxyPort } = config;
  const uuidBytes = uuidToBytes(uuid);

  const server = http.createServer((req, res) => {
    req.on('error', () => {});
    res.on('error', () => {});
    try {
      res.writeHead(501);
      res.end('Not Implemented');
    } catch (e) {}
  });

  // 处理 HTTPS CONNECT 隧道请求
  server.on('connect', (req, clientSocket, head) => {
    const [destHost, destPortStr] = (req.url || '').split(':');
    const destPort = parseInt(destPortStr) || 443;

    let ws = null;
    let isFirstMessage = true;
    let earlyData = [];
    let isClosed = false;

    const cleanup = () => {
      if (isClosed) return;
      isClosed = true;
      try {
        if (clientSocket && !clientSocket.destroyed) {
          clientSocket.destroy();
        }
      } catch (e) {}
      if (ws) {
        try {
          ws.close();
        } catch (e) {}
      }
    };

    const safeWrite = (socket, chunk) => {
      if (isClosed || !socket || socket.destroyed || !socket.writable) return false;
      try {
        socket.write(chunk, (err) => {
          if (err) cleanup();
        });
        return true;
      } catch (err) {
        cleanup();
        return false;
      }
    };

    clientSocket.on('error', (err) => {
      cleanup();
    });

    clientSocket.on('close', () => {
      cleanup();
    });

    try {
      // 构建 VLESS 请求首包头部
      const vlessHeader = buildVlessHeader(uuidBytes, destHost, destPort);

      // 连接远程 VLESS WebSocket 节点
      const wsUrl = `ws://${address}:${port}${wsPath}`;
      ws = new WebSocket(wsUrl, {
        headers: {
          'Host': host,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      ws.on('open', () => {
        if (isClosed) return;
        try {
          // 1. 发送 VLESS 首包
          if (ws.readyState === WebSocket.OPEN) ws.send(vlessHeader);
          // 2. 发送已接收的头部数据
          if (head && head.length > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(head);
          }
          // 3. 发送早期积压数据
          if (earlyData.length > 0 && ws.readyState === WebSocket.OPEN) {
            earlyData.forEach(d => {
              try { ws.send(d); } catch (e) {}
            });
            earlyData = [];
          }
          // 4. 响应客户端 HTTP CONNECT 隧道已建立
          safeWrite(clientSocket, 'HTTP/1.1 200 Connection Established\r\n\r\n');
        } catch (err) {
          cleanup();
        }
      });

      ws.on('message', (message) => {
        if (isClosed) return;
        try {
          let data = Buffer.from(message);
          if (isFirstMessage) {
            isFirstMessage = false;
            // 剥离 VLESS 2 字节响应头 [version, addLen]
            if (data.length > 2) {
              data = data.slice(2);
            } else {
              return;
            }
          }
          safeWrite(clientSocket, data);
        } catch (err) {
          cleanup();
        }
      });

      ws.on('error', (err) => {
        cleanup();
      });

      ws.on('close', () => {
        cleanup();
      });

      clientSocket.on('data', (chunk) => {
        if (isClosed) return;
        try {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(chunk);
          } else {
            earlyData.push(chunk);
          }
        } catch (err) {
          cleanup();
        }
      });
    } catch (outerErr) {
      cleanup();
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[VLESS HTTP Proxy] 端口 ${proxyPort} 已被占用 (EADDRINUSE)，正在自动尝试释放端口...`);
      const { exec } = require('child_process');
      if (process.platform === 'win32') {
        exec(`for /f "tokens=5" %a in ('netstat -aon ^| findstr :${proxyPort}') do taskkill /f /pid %a`, () => {
          setTimeout(() => {
            try {
              server.close();
              server.listen(proxyPort, '127.0.0.1', () => {
                console.log(`[VLESS HTTP Proxy] 成功释放占用并重新启动 HTTP 代理端口: 127.0.0.1:${proxyPort}`);
              });
            } catch (e) {
              console.error(`[VLESS HTTP Proxy] 重新绑定监听失败:`, e.message);
            }
          }, 600);
        });
      }
    } else {
      console.error(`[VLESS HTTP Proxy] 监听发生错误:`, err.message);
    }
  });

  server.listen(proxyPort, '127.0.0.1', () => {
    console.log(`[VLESS HTTP Proxy] 成功在本地启动 HTTP 代理端口: 127.0.0.1:${proxyPort}`);
  });

  return server;
}

module.exports = { startVlessHttpProxy };
