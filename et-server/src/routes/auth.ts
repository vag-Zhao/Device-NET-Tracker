import { Router } from 'express';
import { createPool } from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { dbConfig } from '../config/database';
import { JWT_SECRET_KEY } from '../middleware/auth';

// 定义 MySQL 错误类型
interface MySQLError extends Error {
    code?: string;
    errno?: number;
    sqlState?: string;
    sqlMessage?: string;
}

const router = Router();

// 创建数据库连接池
const pool = createPool(dbConfig);

// 创建测试用户的函数
const createTestUser = async () => {
    let connection;
    try {
        connection = await pool.getConnection();
        
        // 生成密码哈希
        const username = 'zgs';
        const password = '20040429s';
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // 先删除已存在的用户
        await connection.execute('DELETE FROM users WHERE username = ?', [username]);
        
        // 创建新用户
        const [result]: any = await connection.execute(
            'INSERT INTO users (username, password) VALUES (?, ?)',
            [username, hashedPassword]
        );
        
        console.log('测试用户创建成功');
        console.log('用户名:', username);
        console.log('原始密码:', password);
        console.log('密码哈希:', hashedPassword);
        
        // 验证测试
        const [rows]: any = await connection.execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );
        console.log('数据库中的用户数据:', rows[0]);
        
        // 测试密码验证
        const isValid = await bcrypt.compare(password, rows[0].password);
        console.log('密码验证测试:', isValid);
        
    } catch (error) {
        console.error('创建测试用户失败:', error);
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

// 执行测试用户创建
createTestUser().catch(console.error);

// 登录路由
router.post('/login', async (req, res) => {
    let connection;
    try {
        const { username, password } = req.body;
        console.log('\n登录尝试:');
        console.log('请求体:', req.body);
        console.log('用户名类型:', typeof username);
        console.log('密码类型:', typeof password);
        console.log('用户名:', username);
        console.log('密码:', password);

        // 验证输入
        if (!username || !password) {
            console.log('登录失败 - 缺少用户名或密码');
            return res.status(400).json({ message: '用户名和密码都是必需的' });
        }

        // 确保用户名和密码是字符串类型
        const usernameStr = String(username).trim();
        const passwordStr = String(password);

        // 从数据库中获取用户
        console.log('正在查询数据库...');
        try {
            connection = await pool.getConnection();
            const [rows]: any = await connection.execute(
                'SELECT * FROM users WHERE username = ?',
                [usernameStr]
            );
            console.log('数据库查询结果:', JSON.stringify(rows, null, 2));

            const user = rows[0];

            // 验证用户是否存在
            if (!user) {
                console.log('登录失败 - 用户不存在');
                return res.status(401).json({ message: '用户名或密码错误' });
            }

            // 验证密码
            console.log('正在验证密码...');
            console.log('输入的密码:', passwordStr);
            console.log('数据库中的密码哈希:', user.password);
            
            const isValidPassword = await bcrypt.compare(passwordStr, user.password);
            console.log('密码验证结果:', isValidPassword);
            
            if (!isValidPassword) {
                console.log('登录失败 - 密码错误');
                return res.status(401).json({ message: '用户名或密码错误' });
            }

            // 生成 JWT token
            console.log('生成 JWT token...');
            const token = jwt.sign(
                { userId: user.id, username: user.username },
                JWT_SECRET_KEY,
                { expiresIn: '24h' }
            );

            console.log('登录成功 - 用户:', username);
            res.json({
                message: '登录成功',
                token,
                user: {
                    id: user.id,
                    username: user.username
                }
            });
        } finally {
            if (connection) {
                connection.release();
            }
        }
    } catch (error: unknown) {
        console.error('登录错误详情:', error);
        if (error && typeof error === 'object' && 'code' in error && (error as MySQLError).code === 'ETIMEDOUT') {
            return res.status(503).json({ 
                message: '服务暂时不可用，请稍后重试',
                error: '数据库连接超时'
            });
        }
        if (error instanceof Error) {
            res.status(500).json({ 
                message: '服务器错误', 
                error: error.message
            });
        } else {
            res.status(500).json({ 
                message: '服务器错误',
                error: '未知错误'
            });
        }
    }
});

// 注册路由
router.post('/register', async (req, res) => {
    let connection;
    try {
        const { username, password } = req.body;
        console.log('注册尝试 - 用户名:', username, '密码长度:', password.length);

        // 验证输入
        if (!username || !password) {
            console.log('注册失败 - 缺少用户名或密码');
            return res.status(400).json({ message: '用户名和密码都是必需的' });
        }

        try {
            connection = await pool.getConnection();
            
            // 检查用户名是否已存在
            console.log('检查用户名是否存在...');
            const [existingUsers]: any = await connection.execute(
                'SELECT * FROM users WHERE username = ?',
                [username]
            );
            console.log('现有用户查询结果:', JSON.stringify(existingUsers, null, 2));

            if (existingUsers.length > 0) {
                console.log('注册失败 - 用户名已存在');
                return res.status(400).json({ message: '用户名已存在' });
            }

            // 加密密码
            console.log('正在加密密码...');
            console.log('原始密码:', password);
            const hashedPassword = await bcrypt.hash(password, 10);
            console.log('加密后的密码哈希:', hashedPassword);
            console.log('密码哈希长度:', hashedPassword.length);

            // 创建新用户
            console.log('正在创建新用户...');
            const [result]: any = await connection.execute(
                'INSERT INTO users (username, password) VALUES (?, ?)',
                [username, hashedPassword]
            );
            console.log('插入结果:', JSON.stringify(result, null, 2));

            console.log('注册成功 - 用户:', username);
            res.status(201).json({ message: '用户注册成功' });
        } finally {
            if (connection) {
                connection.release();
            }
        }
    } catch (error: unknown) {
        console.error('注册错误详情:', error);
        // 检查是否是连接超时错误
        if (error && typeof error === 'object' && 'code' in error && (error as MySQLError).code === 'ETIMEDOUT') {
            return res.status(503).json({ 
                message: '服务暂时不可用，请稍后重试',
                error: '数据库连接超时'
            });
        }
        if (error instanceof Error) {
            res.status(500).json({ 
                message: '服务器错误', 
                error: error.message
            });
        } else {
            res.status(500).json({ 
                message: '服务器错误',
                error: '未知错误'
            });
        }
    }
});

export default router; 