import { Router } from 'express';
import Device from '../models/device';

const router = Router();

// 获取所有设备列表
router.get('/devices', async (req, res) => {
  try {
    const devices = await Device.find().sort({ lastSeen: -1 });
    res.json(devices);
  } catch (error) {
    console.error('获取设备列表失败:', error);
    res.status(500).json({ error: '获取设备列表失败' });
  }
});

// 获取单个设备详情
router.get('/devices/:serialNumber', async (req, res) => {
  try {
    const device = await Device.findOne({ serialNumber: req.params.serialNumber });
    if (!device) {
      return res.status(404).json({ error: '设备不存在' });
    }
    res.json(device);
  } catch (error) {
    console.error('获取设备详情失败:', error);
    res.status(500).json({ error: '获取设备详情失败' });
  }
});

export default router;