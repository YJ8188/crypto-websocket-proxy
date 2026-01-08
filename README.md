# 加密货币 WebSocket 代理服务器

## 功能说明

这是一个 WebSocket 代理服务器，用于转发币安（Binance）的实时加密货币行情数据。

## 主要特性

- ✅ 实时转发币安 WebSocket 数据
- ✅ 支持多客户端连接
- ✅ 自动重连机制
- ✅ 心跳检测（每30秒）
- ✅ 完全免费部署（Render）

## 部署步骤

### 1. 创建 GitHub 仓库

```bash
# 在 GitHub 上创建新仓库，然后执行：
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/你的用户名/仓库名.git
git push -u origin main
```

### 2. 在 Render 上部署

1. 访问 [render.com](https://render.com)
2. 注册/登录账号
3. 点击 "New +" → "Web Service"
4. 连接 GitHub 仓库
5. 配置：
   - **Name**: crypto-websocket-proxy
   - **Region**: Singapore（推荐，距离国内较近）
   - **Branch**: main
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
6. 点击 "Create Web Service"

### 3. 配置自定义域名（可选）

1. 在 Render 项目中点击 "Domains"
2. 添加您的子域名（例如：ws.yourdomain.com）
3. 按照提示配置 DNS 记录

## 使用方法

### 前端连接示例

```javascript
// 连接到 WebSocket 代理服务器
const ws = new WebSocket('wss://your-app-name.onrender.com');

ws.onopen = () => {
    console.log('已连接到代理服务器');
    
    // 订阅币种（可选）
    ws.send(JSON.stringify({
        action: 'subscribe',
        symbols: ['btcusdt', 'ethusdt']
    }));
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'ping') {
        // 心跳响应
        return;
    }
    
    // 处理币安行情数据
    console.log('收到行情数据:', data);
};

ws.onerror = (error) => {
    console.error('WebSocket 错误:', error);
};

ws.onclose = () => {
    console.log('WebSocket 连接已关闭');
};
```

## 注意事项

1. **免费额度**: Render 免费版提供 750 小时/月，足够 24/7 运行
2. **休眠机制**: 15 分钟无流量后会休眠，建议使用保活服务
3. **冷启动**: 首次访问需要 30-60 秒启动时间
4. **自定义域名**: 需要您的域名支持 CNAME 记录

## 保活服务（避免休眠）

可以使用以下免费保活服务：

- [Uptime Robot](https://uptimerobot.com/) - 每 5 分钟 ping 一次
- [Better Uptime](https://betteruptime.com/) - 免费监控服务

## 技术栈

- **Node.js** - 运行时环境
- **ws** - WebSocket 库
- **Render** - 部署平台

## 许可证

MIT License