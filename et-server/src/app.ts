import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import http from 'http';
import WebSocket from 'ws';
import Device from './models/device';
import authRouter from './routes/auth';
import deviceRouter from './routes/device';
import { verifyToken } from './middleware/auth';
import path from 'path';

// 设置 mongoose
mongoose.set('strictQuery', false);

const app = express();
const server = http.createServer(app);

// 中间件
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// 请求日志中间件
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// 静态文件中间件 - 登录页面不需要验证
app.use('/login', express.static(path.join(__dirname, '../public/login')));

// 认证路由 - 不需要验证
app.use('/api/auth', authRouter);

// 保护其他所有路由
app.use('/api', verifyToken);
app.use('/api', deviceRouter);
app.use('/dashboard', verifyToken, express.static(path.join(__dirname, '../public/dashboard')));

// 更新设备在线状态的函数
const updateDeviceStatuses = async () => {
  try {
    const thirtySecondsAgo = new Date(Date.now() - 30000); // 30秒前
    await Device.updateMany(
      { lastSeen: { $lt: thirtySecondsAgo } },
      { $set: { isOnline: false } }
    );
  } catch (error) {
    console.error('更新设备状态失败:', error);
  }
};

// API 路由
app.get('/api/devices', async (req, res) => {
  try {
    console.log('正在获取设备列表...');
    await updateDeviceStatuses();
    const devices = await Device.find().sort({ lastSeen: -1 });
    console.log('找到设备数量:', devices.length);
    res.json(devices);
  } catch (error) {
    console.error('获取设备列表失败:', error);
    if (error instanceof Error) {
      res.status(500).json({ 
        error: '获取设备列表失败', 
        details: error.message 
      });
    } else {
      res.status(500).json({ 
        error: '获取设备列表失败', 
        details: '未知错误' 
      });
    }
  }
});

// WiFi 控制路由
app.post('/api/device/:serialNumber/wifi/disconnect', async (req: Request, res: Response) => {
  try {
    const { serialNumber } = req.params;
    const device = await Device.findOne({ serialNumber });
    
    if (!device) {
      return res.status(404).json({ success: false, message: '设备未找到' });
    }

    if (!device.isOnline) {
      return res.status(400).json({ success: false, message: '设备当前离线' });
    }

    const ws = deviceConnections.get(serialNumber);
    if (!ws) {
      return res.status(400).json({ success: false, message: '设备连接已断开' });
    }

    // 发送断开 WiFi 的命令给客户端
    ws.send(JSON.stringify({
      type: 'command',
      action: 'disconnect_wifi'
    }));

    res.json({ success: true, message: '断开 WiFi 命令已发送' });
  } catch (error) {
    console.error('处理 WiFi 断开请求时出错:', error);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

// WebSocket 服务器
const wss = new WebSocket.Server({ 
  server,
  path: '/ws'
});

// 存储 WebSocket 连接和设备序列号的映射
const deviceConnections = new Map<string, WebSocket>();

wss.on('connection', (ws, req) => {
  console.log('新的 WebSocket 连接:', req.socket.remoteAddress);
  let deviceSerialNumber: string | undefined;

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'device_info' && data.data?.serialNumber) {
        const deviceInfo = data.data;
        deviceSerialNumber = deviceInfo.serialNumber;
        
        // 存储连接
        if (deviceSerialNumber) {
          deviceConnections.set(deviceSerialNumber, ws);
        }
        
        // 更新设备信息，保留认证类型信息
        await Device.findOneAndUpdate(
          { serialNumber: deviceInfo.serialNumber },
          {
            $set: {
              networkInfo: deviceInfo.networkInfo, // 现在包含了认证类型信息
              platform: deviceInfo.platform,
              lastSeen: new Date(),
              isOnline: true
            }
          },
          { upsert: true, new: true }
        );

        console.log('设备信息已更新:', deviceInfo.serialNumber);
      }
    } catch (error) {
      console.error('处理 WebSocket 消息时出错:', error);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket 连接错误:', error);
  });

  ws.on('close', async () => {
    console.log('WebSocket 连接关闭');
    if (deviceSerialNumber) {
      deviceConnections.delete(deviceSerialNumber);
      try {
        await Device.findOneAndUpdate(
          { serialNumber: deviceSerialNumber },
          { $set: { isOnline: false } }
        );
        console.log('设备已标记为离线:', deviceSerialNumber);
      } catch (error) {
        console.error('更新设备离线状态失败:', error);
      }
    }
  });
});

// 定期检查并更新设备状态
setInterval(updateDeviceStatuses, 15000); // 每15秒检查一次

// 数据库连接
const MONGODB_URI = 'mongodb://localhost:27017/et-server';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB 连接成功');
    console.log('数据库 URI:', MONGODB_URI);
    
    // 启动服务器
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`服务器运行在 http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('MongoDB 连接失败:', err);
    process.exit(1);
  });

// 错误处理
process.on('unhandledRejection', (error: unknown) => {
  console.error('未处理的 Promise 拒绝:', error);
});

process.on('uncaughtException', (error: unknown) => {
  console.error('未捕获的异常:', error);
});

export default app;