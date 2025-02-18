const { createApp, ref, onMounted, onUnmounted } = Vue;
const { ElMessage } = ElementPlus;

// 配置 axios
axios.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, error => {
    return Promise.reject(error);
});

axios.interceptors.response.use(response => {
    return response;
}, error => {
    if (error.response?.status === 401) {
        ElMessage.error('登录已过期，请重新登录');
        window.location.href = '/login';
        return Promise.reject(error);
    }
    return Promise.reject(error);
});

// 创建Vue应用
const app = createApp({
    setup() {
        const devices = ref([]);
        const loading = ref(true);
        const autoRefresh = ref(false);
        const dialogVisible = ref(false);
        const currentDevice = ref(null);
        const contentLoaded = ref(false);
        let refreshInterval = ref(null);

        // 初始化粒子效果
        const initParticles = () => {
            const isMobile = window.innerWidth <= 768;
            
            particlesJS('particles-js', {
                particles: {
                    number: {
                        value: isMobile ? 30 : 60,
                        density: {
                            enable: true,
                            value_area: isMobile ? 400 : 800
                        }
                    },
                    size: {
                        value: isMobile ? 1 : 2,
                        random: true
                    },
                    move: {
                        speed: isMobile ? 0.3 : 0.5,
                        out_mode: "out"
                    },
                    opacity: {
                        value: isMobile ? 0.2 : 0.4
                    }
                },
                interactivity: {
                    detect_on: isMobile ? "none" : "canvas",
                    events: {
                        onhover: {
                            enable: !isMobile
                        },
                        onclick: {
                            enable: !isMobile
                        }
                    }
                }
            });
        };

        // 获取设备列表
        const fetchDevices = async () => {
            try {
                loading.value = true;
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                
                const response = await axios.get('/api/devices', {
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                devices.value = response.data.map(device => ({
                    ...device,
                    loading: false
                }));
                
                contentLoaded.value = true;
            } catch (error) {
                if (error.name === 'AbortError') {
                    console.warn('请求超时已取消');
                    return;
                }
                console.error('获取设备列表失败:', error);
                ElMessage.error('获取设备列表失败');
            } finally {
                loading.value = false;
            }
        };

        // 显示设备详情
        const showDeviceDetail = (device) => {
            currentDevice.value = device;
            dialogVisible.value = true;
        };

        // 断开 WiFi 连接
        const disconnectWiFi = async (serialNumber) => {
            const device = devices.value.find(d => d.serialNumber === serialNumber);
            if (!device) return;

            try {
                device.loading = true;
                const response = await axios.post(`/api/device/${serialNumber}/wifi/disconnect`);
                
                if (response.data.isPublic) {
                    ElMessage({
                        type: 'success',
                        message: '已断开公共 WiFi 并禁用自动重连',
                        duration: 3000
                    });
                } else {
                    ElMessage({
                        type: 'success',
                        message: response.data.message,
                        duration: 3000
                    });
                }
                
                dialogVisible.value = false;
                setTimeout(fetchDevices, 2000);
            } catch (error) {
                console.error('断开 WiFi 失败:', error);
                ElMessage.error(error.response?.data?.message || '断开 WiFi 失败');
            } finally {
                device.loading = false;
            }
        };

        // 格式化日期
        const formatDate = (date) => {
            return new Date(date).toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        };

        // 处理自动刷新变化
        const handleAutoRefreshChange = (value) => {
            if (value) {
                let lastTime = 0;
                const animate = (currentTime) => {
                    if (!autoRefresh.value) return;
                    
                    if (currentTime - lastTime >= 5000) {
                        lastTime = currentTime;
                        fetchDevices();
                    }
                    
                    refreshInterval.value = requestAnimationFrame(animate);
                };
                
                refreshInterval.value = requestAnimationFrame(animate);
                ElMessage.success('自动刷新已开启');
            } else {
                if (refreshInterval.value) {
                    cancelAnimationFrame(refreshInterval.value);
                    ElMessage.info('自动刷新已关闭');
                }
            }
        };

        // 处理弹窗关闭
        const handleDialogClosed = () => {
            fetchDevices();
        };

        // 生命周期钩子
        onMounted(() => {
            Promise.all([
                new Promise(resolve => setTimeout(() => {
                    initParticles();
                    resolve();
                }, 100)),
                fetchDevices()
            ]).catch(console.error);

            if (autoRefresh.value) {
                handleAutoRefreshChange(true);
            }
        });

        onUnmounted(() => {
            if (refreshInterval.value) {
                cancelAnimationFrame(refreshInterval.value);
            }
            
            if (window.pJSDom && window.pJSDom[0]) {
                window.pJSDom[0].pJS.fn.vendors.destroypJS();
            }
        });

        return {
            devices,
            loading,
            autoRefresh,
            dialogVisible,
            currentDevice,
            contentLoaded,
            fetchDevices,
            showDeviceDetail,
            disconnectWiFi,
            formatDate,
            handleAutoRefreshChange,
            handleDialogClosed,
        };
    }
});

app.use(ElementPlus);
app.mount('#app');

// 性能监控代码
if (window.performance) {
    const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            if (entry.entryType === 'largest-contentful-paint') {
                console.log('LCP:', entry.startTime);
            }
        }
    });
    observer.observe({ entryTypes: ['largest-contentful-paint'] });
}

// 开发环境性能监控
if (process.env.NODE_ENV === 'development') {
    const reportWebVitals = ({ name, value }) => {
        console.log(`${name}:`, value);
    };

    new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
            reportWebVitals({
                name: entry.name,
                value: entry.startTime
            });
        }
    }).observe({ entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift'] });
} 