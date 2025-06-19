/**
 * API请求工具模块
 */

// 基础URL配置
const BASE_URL = 'http://127.0.0.1:5000';

/**
 * 封装微信请求方法
 * @param {Object} options - 请求配置
 */
const request = (options) => {
  // 获取token
  const token = wx.getStorageSync('token');
  
  // 请求头
  const header = options.header || {};
  
  // 如果存在token，添加到请求头
  if (token) {
    header['Authorization'] = `Bearer ${token}`;
  }

  // 设置内容类型
  if (!header['Content-Type']) {
    header['Content-Type'] = 'application/json';
  }

  // 完整URL
  const url = /^https?:\/\//.test(options.url) 
    ? options.url 
    : `${BASE_URL}${options.url}`;

  // 发起请求
  wx.request({
    url,
    method: options.method || 'GET',
    data: options.data,
    header,
    success: (res) => {
      // 处理响应状态码
      if (res.statusCode === 401) {
        // token过期或未授权
        wx.removeStorageSync('token');
        wx.removeStorageSync('userInfo');
        
        // 跳转到登录页面
        wx.navigateTo({
          url: '/pages/login/index'
        });
        return;
      }
      
      // 成功回调
      if (options.success && typeof options.success === 'function') {
        options.success(res);
      }
    },
    fail: (err) => {
      // 处理网络错误等
      wx.showToast({
        title: '网络请求失败',
        icon: 'none'
      });
      
      // 失败回调
      if (options.fail && typeof options.fail === 'function') {
        options.fail(err);
      }
    },
    complete: (res) => {
      // 完成回调
      if (options.complete && typeof options.complete === 'function') {
        options.complete(res);
      }
    }
  });
};

// 导出API方法
module.exports = {
  request
}; 