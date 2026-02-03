const app = getApp();
import Dialog from '@vant/weapp/dialog/dialog';

/**
 * 我的入会申请Panel组件
 * 从packageClub/my-applications页面转换而来
 */

Component({
  properties: {},

  data: {
    applications: [],
    userInfo: {},
    currentWithdrawId: null,
    showWithdrawDialog: false,
    isLoading: false
  },

  lifetimes: {
    attached() {
      // 组件初始化，但不加载数据
    const userInfo = wx.getStorageSync('userInfo');
      this.setData({
        userInfo: userInfo || {}
      });
    }
  },

  methods: {
    /**
     * 供外部调用的数据加载方法
     */
    loadData() {
      this.fetchMyApplications();
      // 触发loaded事件
    this.triggerEvent('loaded');
    },

    // 切换展开/折叠状数
      toggleExpand(e) {
      const index = e.currentTarget.dataset.index;
      const applications = this.data.applications;
      
      applications[index].expanded = !applications[index].expanded;
      
      this.setData({
        applications: applications
      });
    },

    // 阻止事件冒泡
  stopPropagation(e) {
      // 阻止事件冒泡，避免触发展开/折叠
  },

    // 显示撤回确认对话数
      showWithdrawDialog(e) {
      const applicationId = e.currentTarget.dataset.applicationid;
      
      this.setData({
        currentWithdrawId: applicationId,
        showWithdrawDialog: true
      });
    },

    // 关闭对话数
      closeDialog() {
      this.setData({
        showWithdrawDialog: false,
        currentWithdrawId: null
      });
    },

    // 处理撤回申请
    async handleWithdraw() {
      if (!this.data.currentWithdrawId) return;
      
      const applicationId = this.data.currentWithdrawId;
      
      wx.showLoading({
        title: '处理?..',
      });
      
      try {
        const res = await this.request({
          url: `/club/application/${applicationId}/delete`,
          method: 'GET'
        });
        
        if (res.Flag === '4000') {
          wx.showToast({
            title: '申请已撤', icon: 'success'
          });
          
          this.fetchMyApplications();
          
          // 触发更新事件
    this.triggerEvent('update');
        } else {
          wx.showToast({
            title: res.message || '撤回失败',
            icon: 'none'
          });
        }
      } catch (error) {
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none'
        });      } finally {
        wx.hideLoading();
        this.closeDialog();
      }
    },

    // 统一请求方法
  request(options) {
      return new Promise((resolve, reject) => {
        wx.request({
          url: app.globalData.request_url + options.url,
          method: options.method || 'GET',
          header: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + wx.getStorageSync('token')
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
          // 格式化日期并添加展开状数
      let formattedData = res.data.map(item => {
            return {
              ...item,
              applicatedDate: item.applicatedDate ? this.formatDate(item.applicatedDate) : '',
              processedDate: item.processedDate ? this.formatDate(item.processedDate) : '',
              expanded: false // 默认为折叠状数
      };
          });
          
          // 按申请时间排序（从新到旧数
      formattedData.sort((a, b) => {
            return new Date(b.applicatedDate) - new Date(a.applicatedDate);
          });
          
          // 将已处理的申请排到后数
      formattedData.sort((a, b) => {
            if (a.processedDate && !b.processedDate) return 1;
            if (!a.processedDate && b.processedDate) return -1;
            return 0;
          });
          
          this.setData({
            applications: formattedData
          });
        } else if (res.Flag === '4004') {
          // 用户未发起任何加入申数
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
        });      } finally {
        this.setData({ isLoading: false });
      }
    },

    // 格式化日数
      formatDate(dateString) {
      if (!dateString) return '';
      
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    }
  }
});
