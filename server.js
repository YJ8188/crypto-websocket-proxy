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
        // 收到币安数据，转发给所有客户端
        const message = data.toString();
        broadcast(message);
    });

    binanceWs.on('error', (error) => {
        console.error('[代理服务器] ❌ 币安 WebSocket 错误:', error.message);
    });

    binanceWs.on('close', () => {
        console.log('[代理服务器] ⚠️ 币安 WebSocket 连接断开，5秒后重连...');
        setTimeout(connectToBinance, 5000);
    });
}

// 广播消息给所有客户端
function broadcast(message) {
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            } catch (error) {
                console.error('[代理服务器] 发送消息失败:', error.message);
                clients.delete(client);
            }
        }
    });
}

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ 
    port: PORT,
    clientTracking: true 
});

wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`[代理服务器] 📱 新客户端连接: ${clientIp}, 当前连接数: ${clients.size + 1}`);
    
    // 添加到客户端集合
    clients.add(ws);

    // 发送欢迎消息
    ws.send(JSON.stringify({
        type: 'connected',
        message: '已连接到 WebSocket 代理服务器',
        timestamp: new Date().toISOString()
    }));

    // 处理客户端消息
    ws.on('message', (message) => {
        console.log(`[代理服务器] 收到客户端消息: ${message}`);
        
        try {
            const data = JSON.parse(message);
            
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

// 心跳检测 - 每30秒发送一次
setInterval(() => {
    const pingMessage = JSON.stringify({
        type: 'ping',
        timestamp: new Date().toISOString()
    });
    
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(pingMessage);
        } else {
            clients.delete(client);
        }
    });
    
    console.log(`[代理服务器] 💓 心跳检测 - 当前连接数: ${clients.size}`);
}, 30000);

// 启动币安连接
connectToBinance();

// 启动服务器
wss.on('listening', () => {
    console.log(`[代理服务器] 🚀 WebSocket 代理服务器已启动`);
    console.log(`[代理服务器] 📡 监听端口: ${PORT}`);
    console.log(`[代理服务器] 🌐 外部访问: wss://your-app-name.onrender.com`);
});

// 优雅关闭
process.on('SIGTERM', () => {
    console.log('[代理服务器] 收到 SIGTERM 信号，正在关闭...');
    
    // 关闭所有客户端连接
    clients.forEach(client => {
        client.close();
    });
    
    // 关闭币安连接
    if (binanceWs) {
        binanceWs.close();
    }
    
    // 关闭服务器
    wss.close(() => {
        console.log('[代理服务器] 服务器已关闭');
        process.exit(0);
    });
});

console.log('[代理服务器] 🎉 服务器初始化完成，等待连接...');
