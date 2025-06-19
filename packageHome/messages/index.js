const app = getApp();
Page({
  data: {
    // 当前活动标签页
    activeTab: 0,
    // 通知数据
    clubNotices: [],  // 协会通知
    eventNotices: [], // 活动通知
    systemNotices: [], // 系统通知
    // 加载状态
    loading_messages: false,
    // 是否为空状态
    emptyClubNotices: false,
    emptyEventNotices: false,
    emptySystemNotices: false,
    // 总计未读通知数
    totalUnreadCount: 0
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    // 如果传入了特定标签，切换到该标签
    if (options.tab) {
      this.setData({
        activeTab: parseInt(options.tab) || 0
      });
    }
    
    this.fetchMessages();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    // 每次页面显示时刷新消息
    this.fetchMessages();
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    this.fetchMessages(() => {
      wx.stopPullDownRefresh();
      wx.showToast({
        title: '刷新成功',
        icon: 'success'
      });
    });
  },

  /**
   * 标签页切换事件
   */
  onTabChange: function(event) {
    this.setData({ 
      activeTab: event.detail.index 
    });
  },

  /**
   * 获取所有消息并按类型分类
   */
  fetchMessages: function() {
    // 设置加载状态
    this.setData({ 
      loading_messages: true
    });
    const token = wx.getStorageSync('token');
    // 从后台获取所有消息
    wx.request({
      url: app.globalData.request_url + `/message/user_get/list`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'   
      },
      success: (res) => {
        if (res.data && res.data.Flag == 4000) {
          const messages = res.data.data || [];     
          // 初始化分类消息数组
          let clubMessages = [];
          let eventMessages = [];
          let systemMessages = [];
          
          // 根据operation类型分类消息
          messages.forEach(message => {
            // 处理时间格式
            const processedMessage = {
              ...message,
              created_time: app.formatDateTime(new Date(message.createDate))
            };
            
            // 根据operation类型分类
            // 协会相关通知
            if (this.isClubMessage(message.operation)) {
              clubMessages.push(processedMessage);
            } 
            // 活动相关通知
            else if (this.isEventMessage(message.operation)) {
              eventMessages.push(processedMessage);
            } 
            // 系统通知
            else {
              systemMessages.push(processedMessage);
            }
          });
          
          // 更新状态
          this.setData({ 
            clubNotices: clubMessages,
            eventNotices: eventMessages,
            systemNotices: systemMessages,
            loading_messages: false,
            emptyClubNotices: clubMessages.length === 0,
            emptyEventNotices: eventMessages.length === 0,
            emptySystemNotices: systemMessages.length === 0,
            totalUnreadCount: this.calculateTotalUnread(clubMessages, eventMessages, systemMessages)
          });
        } else {
          this.setData({ 
            loading_messages: false,
            emptyClubNotices: true,
            emptyEventNotices: true,
            emptySystemNotices: true,
            clubNotices: [],
            eventNotices: [],
            systemNotices: []
          });
        }
      },
      fail: (err) => {
        console.error('请求失败:', err)
        this.setData({ 
          loading_messages: false,
          emptyClubNotices: true,
          emptyEventNotices: true,
          emptySystemNotices: true,
          clubNotices: [],
          eventNotices: [],
          systemNotices: []
        });
        
        wx.showToast({
          title: '网络请求失败',
          icon: 'none'
        })
      }
    });
  },

  /**
   * 判断是否为协会相关消息
   */
  isClubMessage: function(operation) {
    const clubOperations = [
      'user_applicated',        // 用户申请加入协会
      'application_processed',  // 协会申请处理结果
      'club_created',          // 创建协会
      'promoted_to_admin',     // 提拔为会长
      'leadership_changed',    // 会长变更
      'club_expense_created',  // 协会支出创建
      'join_club',            // 加入协会（可能的其他场景）
      'association'           // 协会相关（可能的其他场景）
    ];
    return clubOperations.includes(operation);
  },

  /**
   * 判断是否为活动相关消息
   */
  isEventMessage: function(operation) {
    const eventOperations = [
      'event_begin',    // 活动开始
      'event_end',      // 活动结束
      'join_event',     // 加入活动（可能的其他场景）
      'event_create',    // 创建活动（可能的其他场景）
      'schedule_new_event', //加入订阅的日程发布的活动
      'schedule_new_event_author', //日程发布了活动
      'event_pre_starttime_update'//活动开始时间更新
    ];
    return eventOperations.includes(operation);
  },

  /**
   * 计算总未读消息数量
   */
  calculateTotalUnread: function(clubMessages, eventMessages, systemMessages) {
    const unreadClub = clubMessages.filter(msg => !msg.readed).length;
    const unreadEvent = eventMessages.filter(msg => !msg.readed).length;
    const unreadSystem = systemMessages.filter(msg => !msg.readed).length;
    
    return unreadClub + unreadEvent + unreadSystem;
  },

  /**
   * 查看通知详情
   */
  viewMessageDetail: function(e) {
    const message_id = e.currentTarget.dataset.message_id;
    const url = e.currentTarget.dataset.url || null
    
    const token = wx.getStorageSync('token');
    // 跳转到通知详情页

    wx.request({
      url: app.globalData.request_url + `/message/${message_id}/read`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'   
      },
      success: (res) => {
          if(url){
            wx.navigateTo({
              url: url
            });
          }
          else{
            this.fetchMessages();
          }
      }
    });       

  },


  /**
   * 格式化日期时间
   */
  formatDateTime: function(date) {
    if (!(date instanceof Date) || isNaN(date)) {
      return '';
    }
    
    const now = new Date();
    const diff = now - date; // 时间差（毫秒）
    
    // 今天内的消息显示时间
    if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `今天 ${hours}:${minutes}`;
    }
    
    // 昨天的消息
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth() && date.getFullYear() === yesterday.getFullYear()) {
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `昨天 ${hours}:${minutes}`;
    }
    
    // 一周内的消息显示星期几
    if (diff < 7 * 24 * 60 * 60 * 1000) {
      const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
      const weekday = weekdays[date.getDay()];
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${weekday} ${hours}:${minutes}`;
    }
    
    // 更早的消息显示完整日期
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },


}); 