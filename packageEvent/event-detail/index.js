const app = getApp();

Page({
  data: {
    active: 0,
    activeTab: 0,
    userID: '',
    clubList: [],
    featuredEvent: null,
    isLoading: true,
    isEmpty: false,
    uploadAPI: app.globalData.request_url + '/file/upload_file',
    now: new Date().getTime(), // 当前时间戳
    locationMarkers: [], // 地图标记点
    currentTime: '',
    timeInterval: null,
    currentImageIndex: 0, // 当前轮播图索引
    expandedPanels: {
      time: false,
      content: false,
      images: false,
      members: false,
      cost: false,
      survey: false,
      schedule: false
    },
    memberStats: {
      total: 0,
      checkedIn: 0,
      notCheckedIn: 0
    },
    costStats: {
      budget: 0,
      actual: 0,
      difference: 0,
      isOverBudget: false
    },
    imageList: [],
    surveyInfo: null,
    mapMarkers: [],
    mapLocation: null,
    animationReady: false,
    showTimePanel: false,
    showContentPanel: false,
    showImagesPanel: false,
    showMembersPanel: false,
    showCostPanel: false,
    showSurveyPanel: false,
    showSchedulePanel: false,
    // 日程相关数据
    scheduleInfo: null,
    hasSchedule: false,
    userSubscribed: false,
    canSubscribe: false,
    eventId: null, // 新增eventId到data中
    schedulePeriodText: ''
  },

  onLoad: function (options) {
    this.checkLoginStatus()
    const token = wx.getStorageSync('token');
    const userId = wx.getStorageSync('userId');
    
    this.setData({
      userID: userId,
      token: token,
      isLoading: true,
      now: new Date().getTime(), // 初始化当前时间
      isEmpty: false,
      eventId: options.eventId // 保存eventId到data中
    });
    
    // 如果有指定eventId，则加载这个活动
    if(options.eventId) {
      this.loadEvent(options.eventId);
    } else {
      this.setData({ 
        isLoading: false,
        isEmpty: true 
      });
      wx.showToast({
        title: '活动不存在',
        icon: 'none',
        duration: 2000
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 2000);
    }

    // 延迟启动动画
    setTimeout(() => {
      this.setData({ animationReady: true });
    }, 100);
  },

  onUnload: function() {
    // 在页面卸载时清除定时器
    if(this.timer) {
      clearInterval(this.timer);
    }
    if (this.data.timeInterval) {
      clearInterval(this.data.timeInterval);
    }
  },

  // 检查登录状态
  checkLoginStatus: function() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({
        userInfo: userInfo
      });
    } else {
      wx.navigateTo({
        url: '/pages/login'
      });
    }
  },

  onShow() {
    // 设置TabBar显示
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        active: -1 // 活动详情页不属于任何特定tab
      });
    }
    
    // 如果有eventId且不在加载中，刷新数据
    if (this.data.eventId && !this.data.isLoading) {
      this.loadEvent(this.data.eventId);
      // 加载日程信息
      if (this.data.hasSchedule) {
        this.loadScheduleInfo(this.data.eventId);
      }
    }
  },
  

  // 统一请求方法
  request(options) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.request_url + options.url,
        method: options.method || 'GET',
        data: options.data,
        header: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.data.token
        },
        success(res) {
          resolve(res.data);
        },
        fail(err) {
          reject(err);
        }
      });
    });
  },

  // 加载活动详情
  async loadEvent(eventId) {
    this.setData({ isLoading: true });
    
    try {
      // 获取活动详情
      const res = await this.request({
        url: `/event/${eventId}`,
        method: 'GET'
      });
      
      // 检查API响应状态
      if (res && res.Flag === '4000' && res.data) {
        // 加载活动成员信息
        res.data.members = await this.loadEventMembers(res.data.event_id);
        
        // 处理活动图片
        this.processEventImages(res.data);
      
        
        // 保存用户打卡时间
        if (res.data.cur_user_clockin_date) {
          res.data.cur_user_clockin_date = app.formatDateTime(res.data.cur_user_clockin_date);
        }
        
        // 格式化时间为可读格式
        if (res.data.start_time) {
          const startTime = new Date(res.data.start_time);
          res.data.start_time = app.formatDateTime(startTime);
        }

        if (res.data.end_time) {
          const endTime = new Date(res.data.end_time);
          res.data.end_time = app.formatDateTime(endTime);
        }

        // 处理位置数据，设置地图标记点
        let locationMarkers = [];
        let mapLocation = null;
        
        if (res.data.location_data) {
          const marker = {
            id: 1,
            latitude: res.data.location_data.latitude,
            longitude: res.data.location_data.longitude,
            title: res.data.location_data.name || res.data.location,
            iconPath: '/assets/images/marker.png',
            width: 30,
            height: 30
          };
          
          locationMarkers = [marker];
          mapLocation = {
            latitude: marker.latitude,
            longitude: marker.longitude
          };
        }
        
        // 处理日程信息 - 从后端返回的数据中获取
        let scheduleInfo = res.data.schedule_info || null;
        let canSubscribe = res.data.can_subscribe_schedule || false;
        let userSubscribed = res.data.cur_user_joined_schedule || false;
        
        // 计算订阅周期文本
        let schedulePeriodText = '';
        if (scheduleInfo) {
          schedulePeriodText = this.getSchedulePeriodText(scheduleInfo);
        }
        
        // 处理活动数据
        this.processEventData(res.data);
        this.setData({ 
          featuredEvent: res.data,
          locationMarkers: locationMarkers,
          mapLocation: mapLocation,
          scheduleInfo: scheduleInfo,
          canSubscribe: canSubscribe,
          userSubscribed: userSubscribed,
          schedulePeriodText: schedulePeriodText,
          isLoading: false,
          isEmpty: false
        });
        
      } else {
        // API返回错误状态
        console.error('API返回错误:', res);
        this.setData({ 
          isLoading: false,
          isEmpty: true 
        });
        wx.showToast({ 
          title: res?.message || '活动不存在', 
          icon: 'none' 
        });
      }
    } catch (error) {
      console.error('加载活动失败:', error);
      this.setData({ 
        isLoading: false,
        isEmpty: true 
      });
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
    }
  },
  
  // 判断时间是否在当前时间之后
  isTimeAfterNow: function(timeStr) {
    if (!timeStr) return false;
    
    // 处理ISO格式的时间字符串
    const date = new Date(timeStr);
    const now = new Date();
    
    return date.getTime() > now.getTime();
  },
  
  // 处理活动图片
  processEventImages(event) {
    // 初始化图片列表
    let images = [];   
    
    // 整合所有图片为一个统一数组
    if (event.process_images) {
      images = event.process_images
        .split(';')
        .filter(url => url && url.trim());
    }   
    
    event.process_images = images;
    return event;
  },
  
  // 加载活动成员
  async loadEventMembers(eventId) {
    try {
      const res = await this.request({
        url: `/event/${eventId}/members`,
        method: 'GET'
      });
      
      if (res && res.Flag === '4000' && res.data) {
        // 格式化打卡时间
        for (let member of res.data) {
          if (member.clockinDate) {
            member.clockinDate = app.formatDateTime(new Date(member.clockinDate));
          }
        }
        
        // 按打卡时间排序，已打卡的排在前面，先打卡的在前面
        const sortedMembers = res.data.sort((a, b) => {
          // 如果两人都打卡了，按打卡时间排序（先打卡的在前）
          if (a.clockinDate && b.clockinDate) {
            return new Date(a.clockinDate) - new Date(b.clockinDate);
          }
          // 如果a打卡了而b没打卡，a排在前面
          if (a.clockinDate && !b.clockinDate) {
            return -1;
          }
          // 如果b打卡了而a没打卡，b排在前面
          if (!a.clockinDate && b.clockinDate) {
            return 1;
          }
          // 都没打卡，保持原顺序
          return 0;
        });
        
        // 计算已打卡人数
        const clockinCount = sortedMembers.filter(member => member.clockinDate).length;
        this.setData({
          'featuredEvent.clockin_count': clockinCount
        });
        
        return sortedMembers;
      }
      return [];
    } catch (error) {
      console.error(`加载活动成员失败 [${eventId}]:`, error);
      return [];
    }
  },


  // 处理活动数据
  processEventData(eventData) {
    // 处理活动状态
    const now = new Date();
    const startTime = new Date(eventData.start_time);
    const endTime = new Date(eventData.end_time);
    
    let status = 'upcoming';
    let statusText = '即将开始';
    
    if (now >= startTime && now <= endTime) {
      status = 'ongoing';
      statusText = '进行中';
    } else if (now > endTime) {
      status = 'ended';
      statusText = '已结束';
    }
    
    // 计算成员统计
    if (eventData.members) {
      const total = eventData.members.length;
      const checkedIn = eventData.members.filter(member => member.clockinDate).length;
      const notCheckedIn = total - checkedIn;
      const checkinRate = total > 0 ? Math.round((checkedIn / total) * 100) : 0;
      
      this.setData({
        memberStats: {
          total,
          checkedIn,
          notCheckedIn,
          checkinRate
        }
      });
      
      // 添加计算好的打卡率到活动数据
      eventData.checkinRate = checkinRate;
    }
    
    // 计算费用统计
    const budget = parseFloat(eventData.budget || 0);
    const realCost = parseFloat(eventData.real_cost || 0);
    const difference = Math.abs(budget - realCost);
    const budgetUsageRate = budget > 0 ? ((realCost / budget) * 100).toFixed(1) : '0.0';
    const isOverBudget = realCost > budget;
    
    // 添加计算好的费用数据到活动数据
    eventData.budgetDifference = difference.toFixed(2);
    eventData.budgetUsageRate = budgetUsageRate;
    eventData.isOverBudget = isOverBudget;
    
    // 更新活动数据
    eventData.status = status;
    eventData.statusText = statusText;
  },

  // 参加活动
  async toggleAttendEvent() {
    if (!this.data.featuredEvent) return;
    
    const eventId = this.data.featuredEvent.event_id;
    const isAttended = this.data.featuredEvent.user_attended;
    
    // 如果已参加，显示提示是否退出
    if (isAttended) {
      wx.showModal({
        title: '提示',
        content: '您已参加此活动，是否要退出？',
        confirmText: '退出活动',
        confirmColor: '#F56C6C',
        success: (res) => {
          if (res.confirm) {
            this.quitEvent();
          }
        }
      });
      return;
    }
    
    this.setData({ isLoading: true });
    
    try {
      const res = await this.request({
        url: `/event/${eventId}/join`,
        method: 'GET'
      });
      
      if (res && res.Flag === '4000') {
        this.setData({ isLoading: false });
        wx.showToast({ title: '成功参加活动', icon: 'success' });
        
        // 重新加载活动详情
        this.loadEvent(eventId);
      } else {
        throw new Error(res.Message || '参加失败');
      }
    } catch (error) {
      this.setData({ isLoading: false });
      wx.showToast({
        title: error.message || '参加活动失败',
        icon: 'none'
      });
    }
  },
  
  // 退出活动
  async quitEvent() {
    if (!this.data.featuredEvent) return;
    
    const eventId = this.data.featuredEvent.event_id;
    
    // 检查活动是否已结束
    if (this.data.featuredEvent.end_time) {
      wx.showToast({
        title: '活动已结束',
        icon: 'none'
      });
      return;
    }
    
    // 如果已经打卡，则不允许退出
    if (this.data.featuredEvent.cur_user_clockin_date) {
      wx.showToast({
        title: '已打卡不能退出',
        icon: 'none'
      });
      return;
    }
    
    wx.showModal({
      title: '确认退出',
      content: '确定要退出该活动吗？退出后可能无法再参加',
      success: async (res) => {
        if (res.confirm) {
          this.setData({ isLoading: true });
          
          try {
            const response = await this.request({
              url: `/event/${eventId}/quit`,
              method: 'GET'
            });
            
            if (response && response.Flag === '4000') {
              wx.showToast({ title: '已退出活动', icon: 'success' });
              
              // 刷新活动详情
              this.loadEvent(eventId);
            } else {
              throw new Error(response.message || '退出失败');
            }
          } catch (error) {
            console.error('退出活动失败:', error);
            wx.showToast({
              title: error.message || '退出活动失败',
              icon: 'none'
            });
          } finally {
            this.setData({ isLoading: false });
          }
        }
      }
    });
  },
  
  // 活动打卡
  async clockinEvent() {
    if (!this.data.featuredEvent) return;
    
    const eventId = this.data.featuredEvent.event_id;
    // 检查用户是否已打卡
    if (this.data.featuredEvent.cur_user_clockin_date) {
      wx.showToast({
        title: '您已完成打卡',
        icon: 'success'
      });
      return;
    }
    
    this.setData({ isLoading: true });
    
    try {
      const res = await this.request({
        url: `/event/clockin/${eventId}`,
        method: 'GET'
      });
      
      if (res && res.Flag === '4000') {
        wx.showToast({
          title: '打卡成功',
          icon: 'success'
        });
        
        // 刷新活动详情
        this.loadEvent(eventId);
      } else {
        throw new Error(res.message || '打卡失败');
      }
    } catch (error) {
      console.error('活动打卡失败:', error);
      wx.showToast({
        title: error.message || '打卡失败',
        icon: 'none'
      });
    } finally {
      this.setData({ isLoading: false });
    }
  },
  
  // 查看所有参与者
  viewMembers() {
    this.viewAllMembers();
  },
  
  // 参与调查问卷
  joinSurvey() {
    if (!this.data.featuredEvent || !this.data.featuredEvent.hasSurvey) {
      wx.showToast({
        title: '暂无调查问卷',
        icon: 'none'
      });
      return;
    }
    
    this.participateSurvey();
  },

  // 预览图片
  previewImage(e) {
    const { url, index } = e.currentTarget.dataset;
    const images = this.data.featuredEvent.process_images;
    
    wx.previewImage({
      current: url,
      urls: images
    });
  },
  
  // 判断日期是否大于当前时间
  isDateAfterNow(dateStr) {
    return this.isTimeAfterNow(dateStr);
  },

  // 新增参加活动的方法
  async joinEvent(e) {
    if (!this.data.featuredEvent) return;
    
    const eventId = this.data.featuredEvent.event_id;
    const clubId = this.data.featuredEvent.club_id;
    
    // 检查活动是否已结束
    if (this.data.featuredEvent.end_time) {
      wx.showToast({
        title: '活动已结束，无法参加',
        icon: 'none'
      });
      return;
    }
    
    // 如果已经参加活动，提示用户
    if (this.data.featuredEvent.cur_user_is_joined) {
      wx.showToast({
        title: '您已参加该活动',
        icon: 'none'
      });
      return;
    }
    
    // 检查用户是否可以参加活动
    if (!this.data.featuredEvent.cur_user_can_join) {
      // 显示提示并跳转到社团详情页
      wx.showModal({
        title: '无法参加活动',
        content: '未加入该协会，先加入协会再参加活动',
        confirmText: '去加入',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: `/packageClub/club-detail/index?clubId=${clubId}`
            });
          }
        }
      });
      return;
    }
    
    this.setData({ isLoading: true });
    
    try {
      const res = await this.request({
        url: `/event/${eventId}/join`,
        method: 'GET'
      });
      
      if (res && res.Flag === '4000') {
        wx.showToast({
          title: '成功参加活动',
          icon: 'success'
        });
        
        // 重新加载活动详情
        this.loadEvent(eventId);
      } else {
        throw new Error(res.message || '参加失败');
      }
    } catch (error) {
      console.error('参加活动失败:', error);
      wx.showToast({
        title: error.message || '参加活动失败',
        icon: 'none'
      });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  // 加入协会
  async joinClub() {
    if (!this.data.featuredEvent) return;
    
    const clubId = this.data.featuredEvent.club_id;
    // 确认对话框
    wx.showModal({
      title: '申请加入协会',
      content: `确定要申请加入 ${this.data.featuredEvent.club_name} 吗？`,
      confirmText: '确定',
      success: async (res) => {
        if (res.confirm) {
          this.setData({ isLoading: true });
          
          try {
            const response = await this.request({
              url: `/club/${clubId}/applicated`,
              method: 'GET'
            });
            
            if (response && response.Flag === '4000') {
              wx.showToast({
                title: '申请已提交',
                icon: 'success'
              });
              
            } else if (response && response.Flag === '4001') {
              wx.showToast({
                title: '您已经是协会会员',
                icon: 'none'
              });
              // 重新加载活动详情以更新状态
              this.loadEvent(this.data.eventId);
            } else if (response && response.Flag === '4002') {
              wx.showToast({
                title: '您已有待审核的申请',
                icon: 'none'
              });
            } else {
              throw new Error(response.message || '申请失败');
            }
          } catch (error) {
            console.error('申请加入协会失败:', error);
            wx.showToast({
              title: error.message || '申请加入协会失败',
              icon: 'none'
            });
          } finally {
            this.setData({ isLoading: false });
          }
        }
      }
    });
  },

  // 打开微信导航
  openLocation() {
    this.navigateToLocation();
  },


  // 查看所有图片
  viewAllImages() {
    const images = this.data.imageList;
    if (!images || images.length === 0) {
      const eventImages = this.data.featuredEvent?.process_images;
      if (eventImages && eventImages.length > 0) {
        wx.previewImage({
          urls: eventImages,
          current: eventImages[0]
        });
      }
      return;
    }
    
    wx.previewImage({
      urls: images.map(img => img.url || img),
      current: images[0].url || images[0]
    });
  },

  // 导航到地点
  navigateToLocation() {
    const location = this.data.mapLocation;
    if (!location) return;
    
    wx.openLocation({
      latitude: location.latitude,
      longitude: location.longitude,
      name: this.data.featuredEvent.location_name || this.data.featuredEvent.location || '活动地点',
      address: this.data.featuredEvent.location_address || ''
    });
  },

  // 参与调查
  participateSurvey() {
    const survey = this.data.surveyInfo;
    if (!survey) return;
    
    wx.navigateTo({
      url: `/packageEvent/event-survey/index?surveyId=${survey.id}`
    });
  },

  // 修改费用
  modifyCost() {
    const event = this.data.featuredEvent;
    if (!event) return;
    
    wx.navigateTo({
      url: `/packageEvent/event-cost/index?eventId=${event.event_id}`
    });
  },

  // 分享到朋友圈
  onShareTimeline() {
    const event = this.data.featuredEvent;
    if (!event) {
      return {
        title: 'WeTest活动',
        query: ''
      };
    }
    
    return {
      title: `${event.title} - WeTest活动`,
      query: `eventId=${event.event_id}`,
      imageUrl: event.process_images && event.process_images.length > 0 ? 
               event.process_images[0] : '/assets/icons/activity.png'
    };
  },

  // 返回上一页（兼容旧方法）
  goBack() {
    wx.navigateBack();
  },

  // 查看所有参与者（兼容旧方法）
  viewAllMembers() {
    if (!this.data.featuredEvent) return;
    
    wx.navigateTo({
      url: `/packageEvent/event-members/index?eventId=${this.data.featuredEvent.event_id}`
    });
  },

  // 判断日期是否大于当前时间（兼容旧方法）
  isDateAfterNow(dateStr) {
    return this.isTimeAfterNow(dateStr);
  },

  // 订阅日程
  async subscribeSchedule() {  
    this.setData({ isLoading: true });
    
    try {
      let res;
      
      // 如果有scheduleInfo，直接订阅日程
      if (this.data.scheduleInfo && this.data.scheduleInfo.schedule_id) {
        const scheduleId = this.data.scheduleInfo.schedule_id;
        res = await this.request({
          url: `/schedule/${scheduleId}/join`,
          method: 'GET'
        });
      } else {
        // 否则尝试基于活动创建订阅
        res = await this.request({
          url: `/event/${this.data.eventId}/subscribe`,
          method: 'POST'
        });
      }
      
      if (res && res.Flag === '4000') {
        wx.showToast({ title: '订阅成功', icon: 'success' });
        
        // 更新订阅状态
        this.setData({
          userSubscribed: true
        });
      } else {
        throw new Error(res.message || '订阅失败');
      }
    } catch (error) {
      console.error('订阅失败:', error);
      wx.showToast({
        title: error.message || '订阅失败',
        icon: 'none'
      });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  // 轮播图切换处理
  onSwiperChange(e) {
    this.setData({
      currentImageIndex: e.detail.current
    });
  },

  // 获取订阅周期描述文本
  getSchedulePeriodText(scheduleInfo) {
    if (!scheduleInfo || !scheduleInfo.period) {
      return '一次性活动';
    }
    
    const period = scheduleInfo.period;
    const startTime = scheduleInfo.start_time;

    // 如果没有开始时间，只显示周期
    if (!startTime) {
      const periodMap = {
        1: '每日',
        7: '每周',
        30: '每月',
        365: '每年'
      };
      return periodMap[period] || `每${period}天`;
    }
    
    // 解析开始时间
    const date = new Date(startTime);
    const time = date.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
    
    let result = '';
    switch (period) {
      case 1:
        result = `每日 ${time}`;
        break;
      case 7:
        const weekDay = date.getDay();
        const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
        result = `每周${weekDays[weekDay]} ${time}`;
        break;
      case 30:
        const monthDay = date.getDate();
        result = `每月${monthDay}日 ${time}`;
        break;
      case 365:
        const month = date.getMonth() + 1;
        const yearDay = date.getDate();
        result = `每年${month}月${yearDay}日 ${time}`;
        break;
      default:
        result = `每${period}天 ${time}`;
    }
    return result;
  },

  // 取消订阅日程
  async unsubscribeSchedule() {
    
    this.setData({ isLoading: true });
    
    try {
      let res;
      
      // 如果有scheduleInfo，直接取消订阅日程
      if (this.data.scheduleInfo && this.data.scheduleInfo.schedule_id) {
        const scheduleId = this.data.scheduleInfo.schedule_id;
        res = await this.request({
          url: `/schedule/${scheduleId}/quit`,
          method: 'GET'
        });
      } else {
        // 否则尝试基于活动取消订阅
        res = await this.request({
          url: `/event/${this.data.eventId}/unsubscribe`,
          method: 'POST'
        });
      }
      
      if (res && res.Flag === '4000') {
        wx.showToast({ title: '已取消订阅', icon: 'success' });
        
        // 更新订阅状态
        this.setData({
          userSubscribed: false
        });
      } else {
        throw new Error(res.message || '取消订阅失败');
      }
    } catch (error) {
      console.error('取消订阅失败:', error);
      wx.showToast({
        title: error.message || '取消订阅失败',
        icon: 'none'
      });
    } finally {
      this.setData({ isLoading: false });
    }
  }
});