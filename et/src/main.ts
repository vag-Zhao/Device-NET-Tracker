import { app, Tray, Menu, dialog } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';
import WebSocket from 'ws';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

const execAsync = promisify(exec);
const WS_SERVER_URL = `ws://xxx.xxx.xx.xxx:3000/ws`;
const RECONNECT_INTERVAL = 5000;

let tray: Tray | null = null;
let wsClient: WebSocket | null = null;
let isTrayHidden = false;  // 修改变量名和实现方式

// 添加接口定义
interface NetworkInterface {
  family: string;
  address: string;
  netmask: string;
  internal: boolean;
}

interface NetworkInfo {
  [key: string]: {
    type: string;
    interfaces: NetworkInterface[];
  };
}

// 在文件开头添加单实例锁的检查
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // 如果无法获得锁，说明已经有实例在运行
  console.log('应用程序已经在运行中');
  app.quit();
} else {
  // 添加自启动管理函数
  function manageAutoLaunch(enable: boolean): boolean {
    try {
      const exePath = path.resolve(app.getPath('exe'));
      const startupArgs = '--autostart --hidden';
      const regKey = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run';
      const valueName = '设备监控';

      if (enable) {
        // 添加到注册表
        execSync(`reg add "${regKey}" /v "${valueName}" /t REG_SZ /d "${exePath} ${startupArgs}" /f`);
        console.log('已启用自启动');
        return true;
      } else {
        // 从注册表删除
        execSync(`reg delete "${regKey}" /v "${valueName}" /f`);
        console.log('已禁用自启动');
        return false;
      }
    } catch (error) {
      console.error('设置自启动失败:', error);
      dialog.showErrorBox('错误', '设置自启动失败，请确保以管理员权限运行');
      return false;
    }
  }

  // 检查自启动状态
  function checkAutoLaunchStatus(): boolean {
    try {
      const regKey = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run';
      const valueName = '设备监控';
      const result = execSync(`reg query "${regKey}" /v "${valueName}"`, { encoding: 'utf8' });
      return result.includes(app.getPath('exe'));
    } catch {
      return false;
    }
  }

  function toggleTrayVisibility(hide?: boolean) {
    if (!tray) return;
    
    isTrayHidden = hide !== undefined ? hide : !isTrayHidden;
    
    if (isTrayHidden) {
      // 隐藏托盘时，我们创建一个新的空菜单
      tray.setContextMenu(Menu.buildFromTemplate([]));
      tray.setToolTip('');  // 清空提示文本
      console.log('托盘已隐藏，可通过任务管理器查看进程');
    } else {
      // 显示托盘时，恢复菜单和状态
      updateTrayStatus('正在恢复...');
    }
  }

  function createTray() {
    // 修改图标路径处理
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, 'assets/icon.png')
      : path.join(__dirname, '../assets/icon.png');
      
    tray = new Tray(iconPath);
    updateTrayStatus('初始化...');
  }

  function updateTrayStatus(status: string) {
    if (!tray || isTrayHidden) return;
    
    const isAutoLaunch = process.argv.includes('--autostart');
    const isAutoLaunchEnabled = checkAutoLaunchStatus();
    
    tray.setToolTip(`设备监控 - ${status}`);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: `状态: ${status}`, enabled: false },
      { type: 'separator' },
      { 
        label: '开机自启动', 
        type: 'checkbox',
        checked: isAutoLaunchEnabled,
        click: (menuItem) => {
          const success = manageAutoLaunch(menuItem.checked);
          menuItem.checked = success ? menuItem.checked : !menuItem.checked;
        }
      },
      { 
        label: isAutoLaunch ? '自启动模式' : '手动启动模式',
        enabled: false
      },
      { type: 'separator' },
      { 
        label: isTrayHidden ? '显示托盘图标' : '隐藏托盘图标',
        click: () => toggleTrayVisibility()
      },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ]));
  }

  async function getDeviceInfo() {
    try {
      // 获取序列号
      let serialNumber = '未知';
      if (process.platform === 'win32') {
        const { stdout } = await execAsync('wmic bios get serialnumber');
        serialNumber = stdout.split('\n')[1]?.trim() || '未知';
      }

      // 获取网络信息
      const networkInfo = await getNetworkInfo();

      return {
        serialNumber,
        networkInfo,
        timestamp: new Date().toISOString(),
        platform: process.platform
      };
    } catch (error) {
      console.error('获取设备信息失败:', error);
      return null;
    }
  }

  async function getNetworkInfo() {
    const networkInterfaces = os.networkInterfaces();
    const networkInfo: { [key: string]: any } = {};

    if (process.platform === 'win32') {
      try {
        // 获取 WLAN 信息
        const { stdout: wlanInfo } = await execAsync('netsh wlan show interfaces');
        const lines = wlanInfo.split('\n');
        let currentSSID = '';
        let authType = '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('SSID')) {
            currentSSID = trimmedLine.split(':')[1]?.trim() || '';
          }
          if (trimmedLine.startsWith('Authentication')) {
            authType = trimmedLine.split(':')[1]?.trim() || '';
          }
        }

        // 处理网络接口信息
        for (const [name, interfaces] of Object.entries(networkInterfaces)) {
          if (interfaces) {
            // 检查是否是 WLAN 接口
            if (name.toLowerCase().includes('wlan') || name.toLowerCase().includes('wi-fi')) {
              networkInfo[name] = {
                type: 'wifi',
                interfaces,
                ssid: currentSSID,
                authType: authType.toLowerCase() // 添加认证类型信息
              };
            } else if (name.toLowerCase().includes('ethernet')) {
              networkInfo[name] = {
                type: 'ethernet',
                interfaces
              };
            } else {
              networkInfo[name] = {
                type: 'other',
                interfaces
              };
            }
          }
        }
      } catch (error) {
        console.error('获取 WLAN 信息失败:', error);
        // 如果获取 WLAN 信息失败，仍然返回基本网络信息
        for (const [name, interfaces] of Object.entries(networkInterfaces)) {
          if (interfaces) {
            networkInfo[name] = {
              type: name.toLowerCase().includes('wlan') || name.toLowerCase().includes('wi-fi') ? 'wifi' : 
                    name.toLowerCase().includes('ethernet') ? 'ethernet' : 'other',
              interfaces
            };
          }
        }
      }
    } else {
      // 非 Windows 系统的处理逻辑
      for (const [name, interfaces] of Object.entries(networkInterfaces)) {
        if (interfaces) {
          networkInfo[name] = {
            type: name.toLowerCase().includes('wlan') || name.toLowerCase().includes('wi-fi') ? 'wifi' : 
                  name.toLowerCase().includes('ethernet') ? 'ethernet' : 'other',
            interfaces
          };
        }
      }
    }

    return networkInfo;
  }

  async function handleWiFiDisconnect() {
    try {
      if (process.platform === 'win32') {
        // 获取当前WiFi信息
        const { stdout: wlanInfo } = await execAsync('netsh wlan show interfaces');
        const lines = wlanInfo.split('\n');
        let ssid = '';
        let authType = ''; // 添加认证类型检查
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('SSID')) {
            ssid = trimmedLine.split(':')[1].trim();
          }
          // 检查认证类型
          if (trimmedLine.startsWith('Authentication')) {
            authType = trimmedLine.split(':')[1].trim();
          }
        }

        if (ssid) {
          // 断开当前WiFi连接
          await execAsync('netsh wlan disconnect');
          
          // 如果不是开放网络，则删除配置文件
          if (authType.toLowerCase() !== 'open') {
            await execAsync(`netsh wlan delete profile name="${ssid}"`);
            return { 
              success: true, 
              message: `已断开并删除 WiFi 配置: ${ssid}`,
              isPublic: false 
            };
          } else {
            // 对于开放网络，阻止自动连接
            await execAsync(`netsh wlan set profileparameter name="${ssid}" connectionmode=manual`);
            return { 
              success: true, 
              message: `已断开公共 WiFi: ${ssid}`,
              isPublic: true 
            };
          }
        }
        return { success: false, message: '未找到当前连接的 WiFi' };
      }
      return { success: false, message: '当前系统不支持此操作' };
    } catch (error) {
      console.error('断开 WiFi 时出错:', error);
      return { success: false, message: '操作失败: ' + (error as Error).message };
    }
  }

  function setupWebSocket() {
    try {
      wsClient = new WebSocket(WS_SERVER_URL);

      wsClient.on('open', async () => {
        console.log('WebSocket已连接');
        updateTrayStatus('已连接');
        const info = await getDeviceInfo();
        if (info) wsClient?.send(JSON.stringify({ type: 'device_info', data: info }));
      });

      wsClient.on('close', () => {
        updateTrayStatus('已断开');
        setTimeout(setupWebSocket, RECONNECT_INTERVAL);
      });

      wsClient.on('error', () => {
        updateTrayStatus('连接错误');
        wsClient?.close();
      });

      wsClient.on('message', async (data) => {
        try {
          const { type, action } = JSON.parse(data.toString());
          if (type === 'command' && action === 'disconnect_wifi') {
            await handleWiFiDisconnect();
          }
        } catch {}
      });

    } catch (error) {
      console.error('WebSocket设置失败:', error);
      updateTrayStatus('连接失败');
      setTimeout(setupWebSocket, RECONNECT_INTERVAL);
    }
  }

  // 修改启动检查部分
  app.whenReady().then(() => {
    const isAutoLaunch = process.argv.includes('--autostart');
    const isHidden = process.argv.includes('--hidden');
    
    // 创建托盘
    createTray();
    
    // 默认启用自启动
    if (!checkAutoLaunchStatus()) {
      manageAutoLaunch(true);
    }
    
    // 默认隐藏托盘（除非明确指定不隐藏）
    if (!process.argv.includes('--show')) {
      toggleTrayVisibility(true);
    }
    
    // 启动 WebSocket
    setupWebSocket();
    
    // 设备信息上报
    setInterval(async () => {
      if (wsClient?.readyState === WebSocket.OPEN) {
        const info = await getDeviceInfo();
        if (info) {
          try {
            wsClient.send(JSON.stringify({ 
              type: 'device_info', 
              data: info 
            }));
            console.log('设备信息已发送:', new Date().toLocaleString());
          } catch (error) {
            console.error('发送设备信息失败:', error);
          }
        }
      }
    }, 1000);
  });

  // 处理第二个实例的启动
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // 只有在明确要求显示时才显示托盘
    if (commandLine.includes('--show')) {
      toggleTrayVisibility(false);
    }
  });

  // 修改退出处理
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      // 清理资源
      if (wsClient) {
        wsClient.close();
      }
      if (tray) {
        tray.destroy();
        tray = null;
      }
      app.quit();
    }
  });

  // 添加 before-quit 事件处理
  app.on('before-quit', () => {
    // 清理资源
    if (wsClient) {
      wsClient.close();
    }
    if (tray) {
      tray.destroy();
      tray = null;
    }
  });
}