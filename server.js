/**
 * WebSocket 代理服务器
 * 功能：代理币安 WebSocket 连接，转发实时行情数据
 * 部署平台：Render
 */

const WebSocket = require('ws');

// 配置
const PORT = process.env.PORT || 3000;
// 使用所有币种的数组数据流（支持多个币种）
const BINANCE_WS_URL = 'wss://stream.binance.com:9443/ws/!ticker@arr';

// 存储所有连接的客户端
const clients = new Set();

// 创建币安 WebSocket 连接
let binanceWs = null;

function connectToBinance() {
    console.log('[代理服务器] 正在连接币安 WebSocket...');
    console.log('[代理服务器] 连接地址:', BINANCE_WS_URL);
    
    binanceWs = new WebSocket(BINANCE_WS_URL);

    binanceWs.on('open', () => {
        console.log('[代理服务器] ✅ 成功连接到币安 WebSocket');
    });

    binanceWs.on('message', (data) => {
        // 收到币安数据，直接转发原始数据（Buffer）
        // 只在首次收到数据时打印日志，避免日志过多
        if (!binanceWs.hasReceivedData) {
            try {
                const message = data.toString();
                const parsed = JSON.parse(message);
                console.log(`[代理服务器] 📦 首次收到币安数据: 类型=${Array.isArray(parsed) ? 'Array' : typeof parsed}, 长度=${Array.isArray(parsed) ? parsed.length : 'N/A'}`);
                binanceWs.hasReceivedData = true;
            } catch (e) {
                console.log(`[代理服务器] 📦 首次收到币安数据: 无法解析，原始长度=${data.length}`);
                binanceWs.hasReceivedData = true;
            }
        }

        broadcast(data);
    });

    binanceWs.on('error', (error) => {
        console.error('[代理服务器] ❌ 币安 WebSocket 错误:', error.message);
        console.error('[代理服务器] 错误详情:', error);
    });

    binanceWs.on('close', (code, reason) => {
        console.log(`[代理服务器] ⚠️ 币安 WebSocket 连接断开`);
        console.log(`[代理服务器] 关闭代码: ${code}, 原因: ${reason || '无'}`);
        console.log(`[代理服务器] 5秒后重连...`);
        setTimeout(connectToBinance, 5000);
    });
}

// 广播消息给所有客户端
function broadcast(message) {
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                // 直接发送原始数据（Buffer 或 String）
                client.send(message);
            } catch (error) {
                console.error('[代理服务器] 发送消息失败:', error.message);
                clients.delete(client);
            }
        }
    });
}

// 创建 HTTP 服务器（用于健康检查和 K 线数据代理）
const http = require('http');
const https = require('https');
const url = require('url');

const httpServer = http.createServer(async (req, res) => {
    // 设置 CORS 头（允许所有域名访问）
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 处理 OPTIONS 预检请求
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // 健康检查端点
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            clients: clients.size,
            binance_connected: binanceWs && binanceWs.readyState === 1
        }));
        return;
    }

    // K 线数据代理端点
    if (req.url.startsWith('/api/klines')) {
        try {
            const parsedUrl = url.parse(req.url, true);
            const { symbol, interval, limit } = parsedUrl.query;

            if (!symbol) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing symbol parameter' }));
                return;
            }

            // 转发请求到币安 K 线 API
            const binanceKlinesUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval || '1d'}&limit=${limit || '7'}`;
            
            console.log(`[代理服务器] 📊 代理 K 线请求: ${binanceKlinesUrl}`);

            // 使用 https 模块请求币安 API
            https.get(binanceKlinesUrl, (binanceRes) => {
                let data = '';

                binanceRes.on('data', (chunk) => {
                    data += chunk;
                });

                binanceRes.on('end', () => {
                    try {
                        const jsonData = JSON.parse(data);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(jsonData));
                        console.log(`[代理服务器] ✅ K 线数据获取成功: ${symbol}`);
                    } catch (error) {
                        console.error('[代理服务器] ❌ 解析币安响应失败:', error);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Failed to parse response' }));
                    }
                });
            }).on('error', (error) => {
                console.error('[代理服务器] ❌ 请求币安 K 线 API 失败:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to fetch klines data' }));
            });

        } catch (error) {
            console.error('[代理服务器] ❌ K 线代理错误:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
        return;
    }

    // 404 处理
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});

// 创建 WebSocket 服务器（复用 HTTP 服务器）
const wss = new WebSocket.Server({ 
    server: httpServer,
    clientTracking: true 
});

wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`[代理服务器] 📱 新客户端连接: ${clientIp}, 当前连接数: ${clients.size + 1}`);
    
    // 添加到客户端集合
    clients.add(ws);

    // 不发送欢迎消息，避免干扰币安数据格式

    // 处理客户端消息
    ws.on('message', (message) => {
        console.log(`[代理服务器] 收到客户端消息: ${message}`);
        
        try {
            const data = JSON.parse(message);
            
            // 处理客户端心跳响应
            if (data.type === 'heartbeat_response' || data.type === 'client_heartbeat') {
                console.log(`[代理服务器] 💓 收到客户端心跳响应`);
                // 不需要回复，只是保持连接活跃
                return;
            }
            
            // 如果客户端请求订阅特定币种
            if (data.action === 'subscribe' && data.symbols) {
                console.log(`[代理服务器] 客户端请求订阅: ${data.symbols.join(', ')}`);
                // 这里可以扩展为订阅多个币种
                ws.send(JSON.stringify({
                    type: 'subscribed',
                    symbols: data.symbols,
                    message: '订阅成功'
                }));
            }
        } catch (error) {
            console.error('[代理服务器] 解析客户端消息失败:', error.message);
        }
    });

    // 处理客户端断开
    ws.on('close', () => {
        console.log(`[代理服务器] 🔌 客户端断开连接: ${clientIp}, 当前连接数: ${clients.size - 1}`);
        clients.delete(ws);
    });

    // 处理错误
    ws.on('error', (error) => {
        console.error(`[代理服务器] 客户端错误: ${error.message}`);
        clients.delete(ws);
    });
});

// 心跳检测 - 每30秒记录一次并发送心跳给客户端
setInterval(() => {
    // 清理断开的连接
    const disconnectedClients = [];
    clients.forEach(client => {
        if (client.readyState !== WebSocket.OPEN) {
            disconnectedClients.push(client);
            clients.delete(client);
        }
    });

    // 只在有变化时打印日志
    if (disconnectedClients.length > 0) {
        console.log(`[代理服务器] 🧹 清理了 ${disconnectedClients.length} 个断开的连接`);
    }

    // 发送心跳消息给所有客户端（保持连接活跃）
    const heartbeatMessage = JSON.stringify({
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
        server_time: Date.now()
    });

    let sentCount = 0;
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(heartbeatMessage);
                sentCount++;
            } catch (error) {
                console.error('[代理服务器] 发送心跳失败:', error.message);
                clients.delete(client);
            }
        }
    });

    // 只在有客户端连接时打印心跳日志
    if (clients.size > 0) {
        console.log(`[代理服务器] 💓 心跳检测 - 当前连接数: ${clients.size}, 已发送: ${sentCount}`);
    }
}, 30000);

// 启动币安连接
connectToBinance();

// 启动服务器
httpServer.listen(PORT, () => {
    console.log(`[代理服务器] 🚀 WebSocket 代理服务器已启动`);
    console.log(`[代理服务器] 📡 监听端口: ${PORT}`);
    console.log(`[代理服务器] 🌐 WebSocket: wss://crypto-websocket-proxy.onrender.com`);
    console.log(`[代理服务器] 🏥 健康检查: https://crypto-websocket-proxy.onrender.com/health`);
    console.log(`[代理服务器] 🎉 服务器初始化完成，等待连接...`);
});

// 优雅关闭
process.on('SIGTERM', () => {
    // 防止多次处理 SIGTERM
    if (process.isShuttingDown) {
        console.log('[代理服务器] ⚠️ 已经在关闭中，忽略重复的 SIGTERM');
        return;
    }

    process.isShuttingDown = true;

    console.log('[代理服务器] ⚠️ 收到 SIGTERM 信号，Render 正在重启服务器...');
    console.log('[代理服务器] 💾 保存当前状态...');

    // 关闭所有客户端连接（优雅关闭）
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(JSON.stringify({
                    type: 'server_restart',
                    message: '服务器正在重启，请重新连接',
                    timestamp: new Date().toISOString()
                }));
            } catch (e) {
                // 忽略发送失败
            }
            client.close();
        }
    });

    console.log(`[代理服务器] 已通知 ${clients.size} 个客户端服务器即将重启`);

    // 关闭币安连接
    if (binanceWs && binanceWs.readyState === WebSocket.OPEN) {
        binanceWs.close();
        console.log('[代理服务器] 币安连接已关闭');
    }

    // 关闭服务器
    wss.close(() => {
        console.log('[代理服务器] ✅ 服务器已准备关闭');
        process.exit(0);
    });

    // 10秒后强制退出（防止卡住）
    setTimeout(() => {
        console.error('[代理服务器] ⚠️ 强制退出（超时）');
        process.exit(1);
    }, 10000);
});

console.log('[代理服务器] 🎉 服务器初始化完成，等待连接...');
