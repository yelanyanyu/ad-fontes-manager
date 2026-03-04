/**
 * ============================================================================
 * Request - HTTP 请求工具模块（Axios 封装）
 * ============================================================================
 *
 * 【功能简介】
 * 本模块是前端 HTTP 通信的核心工具，基于 Axios 库封装。
 * 提供统一的请求配置、响应处理和错误提示机制，简化组件中的 HTTP 调用。
 * 实现了请求/响应拦截器，统一处理全局错误和用户反馈。
 *
 * 核心职责：
 * - 创建预配置的 Axios 实例（baseURL、timeout）
 * - 统一响应数据处理（直接返回 response.data）
 * - 全局错误捕获和 Toast 提示
 * - 支持跳过错误提示的配置选项
 *
 * 在整个前端架构中的定位：
 * - 上层：被所有 Store 和组件调用（WordStore、AppStore 等）
 * - 下层：基于 axios 库实现
 * - 同级：依赖 appStore 进行错误提示
 * - 设计模式：单例模式（默认导出单一实例）
 *
 * 【实现思路】
 * 1. Axios 实例配置：
 *    - baseURL: '/api' - 所有请求自动添加此前缀
 *    - timeout: 10000ms - 请求超时时间 10 秒
 *    - 可根据环境变量扩展更多配置
 *
 * 2. 请求拦截器：
 *    - 当前仅做透传，预留扩展空间
 *    - 可用于：添加认证头、请求日志、Loading 状态等
 *
 * 3. 响应拦截器：
 *    - 成功响应：直接返回 response.data，简化调用方代码
 *    - 错误响应：
 *      a. 检查 skipErrorToast 配置，决定是否显示错误提示
 *      b. 提取错误消息（优先使用服务端返回的消息）
 *      c. 调用 appStore.addToast 显示错误提示
 *      d. 继续抛出错误，供调用方处理
 *
 * 4. 错误处理策略：
 *    - 默认显示错误 Toast 提示用户
 *    - 支持 skipErrorToast 选项静默处理错误
 *    - 保留完整错误对象，供调用方做进一步处理
 *
 * 【特别注意】
 * 1. 潜在风险：
 *    - appStore 在拦截器中动态导入，确保在 Pinia 初始化后使用
 *    - 循环依赖风险：appStore 可能也依赖 request（当前无此问题）
 *    - 请求超时时间固定为 10 秒，不适合大文件上传场景
 *
 * 2. 性能考虑：
 *    - 每个错误都会触发 Toast，高频错误可能导致 UI 卡顿
 *    - 考虑添加错误节流机制
 *
 * 3. 边界条件处理：
 *    - error.response 不存在时的处理（网络错误）
 *    - error.response.data.message 不存在时的降级处理
 *    - skipErrorToast 为任意真值时跳过提示
 *
 * 4. 依赖关系：
 *    - 强依赖：axios（HTTP 客户端库）
 *    - 运行时依赖：@/stores/appStore（错误提示）
 *
 * 5. 使用示例：
 *    import request from '@/utils/request';
 *
 *    // GET 请求
 *    const data = await request.get('/words', { params: { page: 1 } });
 *
 *    // POST 请求
 *    const result = await request.post('/words', { yaml: content });
 *
 *    // 静默请求（不显示错误提示）
 *    const data = await request.get('/status', { skipErrorToast: true });
 *
 * 6. 未来优化方向：
 *    - 添加请求重试机制（网络错误时自动重试）
 *    - 实现请求缓存，避免重复请求
 *    - 添加请求/响应日志，便于调试
 *    - 支持请求取消（AbortController）
 *    - 添加请求并发控制
 * ============================================================================
 */

import axios from 'axios';
import { useAppStore } from '@/stores/appStore';

// 创建 Axios 实例
const service = axios.create({
  baseURL: '/api', // API 基础路径
  timeout: 10000, // 请求超时时间（10秒）
});

/**
 * 请求拦截器
 * 在请求发送前执行，可用于添加认证头、日志记录等
 */
service.interceptors.request.use(
  config => {
    // 当前仅透传配置，预留扩展空间
    return config;
  },
  error => {
    // 请求错误处理
    return Promise.reject(error);
  }
);

/**
 * 响应拦截器
 * 在收到响应后执行，统一处理响应数据和错误
 */
service.interceptors.response.use(
  response => {
    // 直接返回响应数据，简化调用方代码
    return response.data;
  },
  error => {
    // 获取 appStore 用于显示错误提示
    const appStore = useAppStore();

    // 提取错误消息（优先服务端消息，其次错误对象消息，最后默认消息）
    const message = error.response?.data?.message || error.message || 'Error';

    // 检查是否跳过错误提示
    if (error.config && error.config.skipErrorToast) {
      return Promise.reject(error);
    }

    // 显示错误提示
    appStore.addToast(message, 'error');

    // 继续抛出错误，供调用方处理
    return Promise.reject(error);
  }
);

export default service;
