// pages/share-redirect/index.js
// 分享链接重定向页面
const app = getApp();

Page({
  data: {
    eventId: '',
    autoOpen: ''
  },

  onLoad(options) {    
    const { eventId, autoOpen } = options;
    
    // 保存在data 数
      this.setData({
      eventId: eventId || '',
      autoOpen: autoOpen || ''
    });
    
    if (!eventId || !autoOpen) {      wx.switchTab({
        url: '/pages/home/index'
      });
      return;
    }    
    // 保存参数到全局
    app.globalData.pendingEventPanel = {
      eventId: eventId,
      type: autoOpen
    };  },
  
  onShow() {    
    const { eventId, autoOpen } = this.data;
    
    if (eventId && autoOpen) {      
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/profile/index',
          success: () => {          },
          fail: (err) => {            wx.reLaunch({
              url: '/pages/profile/index',
              success: () => {              },
              fail: (err2) => {                wx.showToast({
                  title: '跳转失败，请手动打开',
                  icon: 'none',
                  duration: 3000
                });
              }
            });
          }
        });
      }, 100);
    }
  },
  
  onReady() {  }
});
