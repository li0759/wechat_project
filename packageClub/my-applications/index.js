const app = getApp();

Page({
  data: {
    applications: [],
    isLoading: false
  },

  onLoad: function () {
    const token = wx.getStorageSync('token');
    const userId = wx.getStorageSync('userId');
    
    this.setData({
      userID: userId,
      token: token
    });
    
    this.fetchMyApplications();
  },

  onShow: function () {
    this.fetchMyApplications();
  },

  onPullDownRefresh: function () {
    this.fetchMyApplications();
    wx.stopPullDownRefresh();
  },

  // 统一请求方法
  request(options) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.request_url + options.url,
        method: options.method || 'GET',
        header: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.data.token
        },
        data: options.data,
        success(res) {
          resolve(res.data);
        },
        fail(err) {
          reject(err);
        }
      });
    });
  },

  // 获取我的申请列表数据
  async fetchMyApplications() {
    this.setData({ isLoading: true });
    
    try {
      const res = await this.request({
        url: '/club/application/user_applicated/list',
        method: 'GET'
      });
      
      if (res.Flag === '4000') {
        // 格式化日期
        let formattedData = res.data.map(item => {
          return {
            ...item,
            applicatedDate: item.applicatedDate ? this.formatDate(item.applicatedDate) : '',
            processedDate: item.processedDate ? this.formatDate(item.processedDate) : ''
          };
        });
        
        // 按申请时间排序（从新到旧）
        formattedData.sort((a, b) => {
          return new Date(b.applicatedDate) - new Date(a.applicatedDate);
        });
        
        this.setData({
          applications: formattedData
        });
      } else if (res.Flag === '4004') {
        // 用户未发起任何加入申请
        this.setData({
          applications: []
        });
      } else {
        wx.showToast({
          title: res.message || '获取申请列表失败',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.showToast({
        title: '网络错误，请重试',
        icon: 'none'
      });
      console.error('获取申请列表失败:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  // 格式化日期
  formatDate(dateString) {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },

  // 获取状态文字和颜色
  getStatusInfo(item) {
    if (!item.processedDate) {
      return { text: '审核中', class: 'status-pending' };
    }
    
    if (item.approved) {
      return { text: '已通过', class: 'status-approved' };
    } else {
      return { text: '已拒绝', class: 'status-rejected' };
    }
  },

  // 返回上一页
  navigateBack() {
    wx.navigateBack();
  }
}); 