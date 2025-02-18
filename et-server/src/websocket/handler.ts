import WebSocket from 'ws';
import http from 'http';
import Device from '../models/device';

interface DeviceConnection {
  ws: WebSocket;
  serialNumber?: string;
  lastPing: number;
}

const connections = new Map<WebSocket, DeviceConnection>();

export function setupWebSocketServer(server: http.Server) {
  const wss = new WebSocket.Server({ 
    server,
    path: '/ws',
    perMessageDeflate: false
  });

  wss.on('error', (error) => {
    console.error('WebSocket Server Error:', error);
  });

  wss.on('connection', (ws, req) => {
    console.log('新的 WebSocket 连接:', req.socket.remoteAddress);
    
    connections.set(ws, { 
      ws, 
      lastPing: Date.now() 
    });

    ws.on('message', async (message: string) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === 'device_info') {
          const deviceInfo = data.data;
          const connection = connections.get(ws);
          
          if (connection) {
            connection.serialNumber = deviceInfo.serialNumber;
            connection.lastPing = Date.now();
          }

          // 更新数据库中的设备信息
          await Device.findOneAndUpdate(
            { serialNumber: deviceInfo.serialNumber },
            {
              $set: {
                networkInfo: deviceInfo.networkInfo,
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
        console.error('处理消息时出错:', error);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket Client Error:', error);
    });

    ws.on('close', async (code, reason) => {
      console.log('WebSocket 连接关闭:', code, reason);
      const connection = connections.get(ws);
      if (connection?.serialNumber) {
        await Device.findOneAndUpdate(
          { serialNumber: connection.serialNumber },
          { isOnline: false }
        );
      }
      connections.delete(ws);
    });
  });

  // 定期检查连接状态
  setInterval(() => {
    const now = Date.now();
    connections.forEach(async (connection, ws) => {
      if (now - connection.lastPing > 60000) { // 60秒超时
        console.log('连接超时:', connection.serialNumber);
        if (connection.serialNumber) {
          await Device.findOneAndUpdate(
            { serialNumber: connection.serialNumber },
            { isOnline: false }
          );
        }
        ws.terminate();
        connections.delete(ws);
      }
    });
  }, 30000); // 每30秒检查一次
}