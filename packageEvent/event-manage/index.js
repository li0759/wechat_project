const app = getApp();

Page({
  data: {
    userID: '',
    featuredEvent: null,
    uploadAPI: app.globalData.request_url + '/file/upload_file',
    showCostDialog: false,
    showImageDialog: false,
    showContentPopup: false, // 新增：简介编辑弹窗
    showLocationPopup: false, // 新增：地址编辑弹窗
    creating: false,
    activeNames: ['members'], // 默认展开参与人员面板
    costInput: '',
    tempContent: '', // 新增：临时简介内容
    currentDate: new Date().getTime(),
    minDate: new Date().getTime(),
    maxDate: new Date(new Date().getFullYear() + 1, 11, 31).getTime(), // 最大可选日期为明年12月31日
    currentImageIndex: 0, // 当前轮播图索引
    isLoading: false,
    isEmpty: false,
    
    // 新增：面板切换状态
    showMembersPanel: false,
    showImagesPanel: false,
    showOthersPanel: false,
    
    // 新增：地址表单数据
    locationForm: {
      name: '',
      address: '',
      latitude: null,
      longitude: null
    },
    
    // 新增：日程管理相关字段
    currentSchedule: null,
    scheduleDisplay: '',
    showSchedulePopup: false,
    showWeekdayPopup: false,
    showMonthdayPopup: false,
    showTimeOfDayPickerPopup: false,
    showEndScheduleDialog: false,
    scheduleForm: {
      schedule_type: 'weekly',
      weekdays: [],
      month_days: [],
      activity_time: '09:00',
      advance_hours_slider: 1
    },
    timeOfDayValue: '09:00',
    advanceHourLabels: ['不提醒', '提前1小时', '提前2小时', '提前3小时', '提前6小时', '提前12小时', '提前1天', '提前2天'],
    weekdaysDisplay: '',
    monthdaysDisplay: '',
    isCreateMode: true, // 默认为创建模式
    
    // 新增：预计时间编辑相关字段
    showPreSchedulePopup: false,
    showPreScheduleDateTimePickerPopup: false,
    preScheduleCurrentDate: new Date().getTime(),
    preScheduleForm: {
      startTime: '',
      startTimeDisplay: '',
      endTimeDisplay: '',
      duration: 2,
      durationText: '2小时'
    },
    durationLabels: ['1小时', '2小时', '3小时', '4小时', '5小时', '6小时', '7小时', '8小时']
  },

  // 新增：阻止加号点击时的弹窗关闭
  preventClose(e) {
    return false;
  },

  onLoad: function (options) {
    this.checkLoginStatus();
    const token = wx.getStorageSync('token');
    const userId = wx.getStorageSync('userId');
    
    this.setData({
      userID: userId,
      token: token
    });
    
    // 初始化时间选择器数据
    this.initDateTimeRange();
    
    // 加载活动详情
    if (options.eventId) {
      this.loadEvent(options.eventId);
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
 
  },


  // 统一请求方法
  request(options) {
    wx.showLoading({ title: options.loadingText || '加载中...' });
    
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
          wx.hideLoading();
          resolve(res.data);
        },
        fail(err) {
          wx.hideLoading();
          reject(err);
        }
      });
    });
  },

  // 统一API调用处理
  handleApiCall(apiPromise, successMsg, errorMsg) {
    return apiPromise
      .then(res => {
        if (res.Flag == 4000) {
          if (successMsg) {
            wx.showToast({
              title: successMsg,
              icon: 'success'
            });
          }
          return res.data;
        } else {
          this.showErrorToast(res.message || errorMsg);
          return Promise.reject(new Error(res.message || errorMsg));
        }
      })
      .catch(err => {
        this.showErrorToast('网络请求失败');
        return Promise.reject(err);
      });
  },

  // 显示错误提示
  showErrorToast(message) {
    wx.showToast({
      title: message,
      icon: 'none'
    });
  },

  // 加载活动详情
  async loadEvent(eventId) {
    wx.showLoading({ title: '加载中...' });
    
    try {
      // 获取活动详情
      const res = await this.request({
        url: `/event/${eventId}`,
        method: 'GET'
      });
      const event = res.data
      if (event) {
        console.log(event)
        // 添加活动是否已开始的状态
        event.isStarted = new Date(event.start_time) < new Date();
        // 加载活动成员信息
        event.members = await this.loadEventMembers(event.event_id);
        
        if (event.process_images) {
          event.process_images = event.process_images.split(';')
        }
        
        // 格式化时间显示
        if (event.pre_startTime) {
          event.pre_startTime_display = this.formatDateTime(new Date(event.pre_startTime));
        }
        if (event.pre_endTime) {
          event.pre_endTime_display = this.formatDateTime(new Date(event.pre_endTime));
        }
        // 格式化实际开始时间
        if (event.actual_startTime) {
          event.actual_startTime_display = this.formatDateTime(new Date(event.actual_startTime));
        }
        // 格式化实际结束时间
        if (event.actual_endTime) {
          event.actual_endTime_display = this.formatDateTime(new Date(event.actual_endTime));
        }
        
        // 计算是否可以开始活动
        const canStartNow = event.pre_startTime && new Date() >= new Date(event.pre_startTime);
        
        // 计算时间提示文本
        let timeHintText = '';
        if (event.pre_startTime && !canStartNow && !event.actual_startTime && !event.actual_endTime) {
          const preStartTime = new Date(event.pre_startTime);
          const now = new Date();
          const timeDiff = preStartTime.getTime() - now.getTime();
          const hoursLeft = Math.ceil(timeDiff / (1000 * 60 * 60));
          const minutesLeft = Math.ceil(timeDiff / (1000 * 60));
          
          if (hoursLeft > 1) {
            timeHintText = `还需等待 ${hoursLeft} 小时后才能开始`;
          } else if (minutesLeft > 0) {
            timeHintText = `还需等待 ${minutesLeft} 分钟后才能开始`;
          } else {
            timeHintText = '即将可以开始活动';
          }
        }

        this.setData({
          featuredEvent: event,
          canStartNow: canStartNow,
          timeHintText: timeHintText,
          isLoading: false
        });
        
        // 如果不能创建日程且有日程信息，直接获取并显示
        if (!event.can_create_schedule && event.schedule_info && event.schedule_info.schedule_id) {
          this.fetchAndDisplaySchedule(event.schedule_info.schedule_id);
        }
      }

      wx.hideLoading();
    } catch (error) {
      console.error('加载活动失败:', error);
      wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // 加载活动成员
  async loadEventMembers(eventId) {
    try {
      const res = await this.request({
        url: `/event/${eventId}/members`,
        method: 'GET'
      });
      
      // 计算已打卡人数
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

  /**
   * 判断时间是否在当前时间之前
   */
  isTimeBeforeNow(timeString) {
    if (!timeString) return false;
    const targetTime = new Date(timeString).getTime();
    const now = new Date().getTime();
    return targetTime < now;
  },
  
  // 获取当前时间
  now() {
    return new Date().getTime();
  },

  // 保存图片修改
  async saveImageChanges(e) {
    const eventId = e.currentTarget.dataset.eventId;
    const uploadTasks = [];
    
    // 获取拖拽图片组件
    const dragComponent = this.selectComponent(`#drag-img-${eventId}`);
    
    if (!dragComponent || dragComponent.data.dragImgList.length === 0) {
      wx.showToast({ 
        title: '必须有一张图片作为封面', 
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    // 上传新图片
    for (const pic of dragComponent.data.dragImgList) {
      if (pic.src.includes('tmp')) {           
        // 设置图片为加载状态
        dragComponent.setImageLoading(pic.src);
        
        // 添加上传任务到数组
        uploadTasks.push(
          (async () => {
            try {
              const result = await this.uploadImage(pic.src);
              dragComponent.updateImageUrl(pic.src, result.url);
              dragComponent.updateImageLabel(pic.src);
            } catch (error) {
              dragComponent.delImageLoading(pic.src);
              console.error('上传图片失败:', error);
              throw error;
            }
          })()
        );
      }
    }
    
    try {
      // 等待所有任务完成
      await Promise.all(uploadTasks);
      
      // 按顺序收集图片URL
      const sortedImages = [...dragComponent.data.dragImgList]
        .sort((a, b) => a.key - b.key)
        .map(img => img.src);
      const processImagesStr = sortedImages.join(';');
      
      // 保存到服务器
      wx.showLoading({ title: '保存中...' });
      await this.updateProcessImages(eventId, processImagesStr);
      wx.hideLoading();
      
      wx.showToast({ title: '保存成功', icon: 'success' });
      
      // 关闭图片弹窗
      this.closeImageDialog();
      
      // 刷新活动数据
      this.loadEvent(eventId);
    } catch (error) {
      console.error('保存过程中出错:', error);
      wx.hideLoading();
      wx.showToast({
        title: error.message || '保存失败，请重试', 
        icon: 'none',
        duration: 3000
      });
    }
  },

  // 上传单个图片
  async uploadImage(filePath) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: this.data.uploadAPI,
        filePath: filePath,
        name: 'file',
        header: {
          'Authorization': 'Bearer ' + this.data.token
        },
        dataType: 'json',
        success: (res) => {
          try {
            const data = JSON.parse(res.data);
            if (data.Flag === 4000) {
              resolve(data.data);
            } else {
              reject(new Error(data.Message || '上传失败'));
            }
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },

  // 更新活动过程图片
  async updateProcessImages(eventId, processImagesStr) {
    return this.request({
      url: `/event/${eventId}/update_process_images`,
      method: 'POST',
      data: {
        process_images: processImagesStr
      }
    });
  },

  // 开始活动
  async startEvent(e) {
    const eventId = e.currentTarget.dataset.eventId;
    
    wx.showModal({
      title: '确认开始活动',
      content: '开始活动后，参与者将可以打卡签到。确认开始吗？',
      confirmColor: 'rgb(223, 118, 176)',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });
          
          try {
            const result = await this.request({
              url: `/event/${eventId}/begin`,
              method: 'GET'
            });
            
            if (result && result.Flag === '4000') {
              wx.hideLoading();
              wx.showToast({ title: '活动已开始', icon: 'success' });
              const message_data = {
                event_id: result.data.eventID,
                url: `/packageEvent/event-detail/index?eventId=${result.data.eventID}`,
                operation: 'event_begin',
                content: result.data.clubName + '组织的' + result.data.title + '活动已开始，请尽快到场打卡'
              }                   
      
              await app.message_for_event(message_data);
              // 刷新活动数据
              this.loadEvent(result.data.eventID);
            } else {
              throw new Error(result.Message || '操作失败');
            }
          } catch (error) {
            wx.hideLoading();
            wx.showToast({
              title: error.message || '开始活动失败', 
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 结束活动
  async endEvent(e) {
    const eventId = e.currentTarget.dataset.eventId;
    
    wx.showModal({
      title: '确认结束活动',
      content: '结束活动后，将不能再签到。确认结束吗？',
      confirmColor: 'rgb(223, 118, 176)',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });
          
          try {
            const result = await this.request({
              url: `/event/${eventId}/end`,
              method: 'GET'
            });
            
            if (result && result.Flag === '4000') {
              wx.hideLoading();
              wx.showToast({ title: '活动已结束', icon: 'success' });
              const message_data = {
                event_id: result.data.eventID,
                url: `/packageEvent/event-detail/index?eventId=${result.data.eventID}`,
                operation: 'event_end',
                content: result.data.clubName + '组织的' + result.data.title + '活动已结束'
              }                   
      
              await app.message_for_event(message_data);             
              // 刷新活动数据
              this.loadEvent(eventId);
            } else {
              throw new Error(result.Message || '操作失败');
            }
          } catch (error) {
            wx.hideLoading();
            wx.showToast({
              title: error.message || '结束活动失败', 
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 显示费用修改弹窗
  showCostDialog() {
    this.setData({
      showCostDialog: true,
      costInput: this.data.featuredEvent.real_cost || ''
    });
  },

  // 关闭费用弹窗
  closeCostDialog() {
    this.setData({
      showCostDialog: false,
      costInput: ''
    });
  },

  // 费用输入变化
  onCostChange(event) {
    this.setData({
      costInput: event.detail
    });
  },

  // 确认费用修改
  async confirmCost() {
    const cost = parseFloat(this.data.costInput);
    if (isNaN(cost) || cost < 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }

    try {
      await this.updateEventCost(this.data.featuredEvent.event_id, cost);
      this.closeCostDialog();
    } catch (error) {
      console.error('更新费用失败:', error);
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },

  // 更新活动费用
  async updateEventCost(eventId, cost) {
    const res = await this.request({
      url: `/event/${eventId}/update_real_cost`,
      method: 'POST',
      data: { real_cost: cost }
    });

    if (res.Flag === '4000') {
      wx.showToast({ title: '更新成功', icon: 'success' });
      this.setData({
        'featuredEvent.real_cost': cost
      });
    } else {
      throw new Error(res.message || '更新失败');
    }
  },

  // 查看统计
  viewStatistics() {
    wx.showToast({ title: '功能开发中...', icon: 'none' });
  },

  // 折叠面板变化
  onCollapseChange(event) {
    this.setData({
      activeNames: event.detail
    });
  },

  // 导航栏返回
  onClickLeft() {
    wx.navigateBack();
  },

  // 初始化时间选择器数据
  initDateTimeRange() {
    const dates = [];
    const hours = [];
    const minutes = [];
    
    // 生成未来30天的日期
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      dates.push({
        label: `${date.getMonth() + 1}-${date.getDate()}`,
        value: date.toISOString().split('T')[0]
      });
    }
    
    // 生成24小时
    for (let i = 0; i < 24; i++) {
      hours.push({
        label: `${i.toString().padStart(2, '0')}时`,
        value: i
      });
    }
    
    // 生成分钟（每5分钟一个选项）
    for (let i = 0; i < 60; i += 5) {
      minutes.push({
        label: `${i.toString().padStart(2, '0')}分`,
        value: i
      });
    }
    
    this.setData({
      dateTimeRange: [dates, hours, minutes]
    });
  },

  onStartTimeChange(e) {
    const { value } = e.detail;
    const startTime = this.formatDateTime(new Date(this.data.currentDate + value[0] * 24 * 60 * 60 * 1000 + value[1] * 60 * 60 * 1000 + value[2] * 60 * 1000));
    
    this.setData({
      'scheduleForm.start_time': startTime,
      'scheduleForm.dateTimeIndex': value
    });
  },


  // 轮播图片切换事件
  onSwiperChange(e) {
    this.setData({
      currentImageIndex: e.detail.current
    });
  },

  // 预览图片
  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    const images = this.data.featuredEvent.process_images || [];
    
    wx.previewImage({
      current: url,
      urls: images
    });
  },

  // 显示图片管理弹窗
  showImageDialog() {
    this.setData({
      showImageDialog: true
    });
  },

  // 关闭图片管理弹窗
  closeImageDialog() {
    this.setData({
      showImageDialog: false
    });
  },

  // 打开位置导航
  openLocation() {
    if (!this.data.featuredEvent || !this.data.featuredEvent.location_data) {
      wx.showToast({ title: '位置信息不可用', icon: 'none' });
      return;
    }

    const location = this.data.featuredEvent.location_data;
    wx.openLocation({
      latitude: parseFloat(location.latitude),
      longitude: parseFloat(location.longitude),
      name: location.name || this.data.featuredEvent.location,
      address: location.address || this.data.featuredEvent.location,
      scale: 16
    });
  },

  // 查看所有成员
  viewAllMembers() {
    // 这里可以跳转到成员详情页面或者展开显示更多成员
    wx.showToast({ title: '查看所有成员', icon: 'none' });
  },

  // 编辑花费
  editCost() {
    this.setData({
      costInput: this.data.featuredEvent.real_cost || '',
      showCostDialog: true
    });
  },

  // 编辑图片
  editImages() {
    this.setData({
      showImageDialog: true
    });
  },

  // 编辑简介
  editContent() {
    this.setData({
      tempContent: this.data.featuredEvent.content || '',
      showContentPopup: true
    });
  },

  // 关闭简介编辑弹窗
  closeContentPopup() {
    this.setData({
      showContentPopup: false,
      tempContent: ''
    });
  },

  // 简介内容变化
  onTempContentChange(event) {
    this.setData({
      tempContent: event.detail
    });
  },

  // 确认简介修改
  async confirmContent() {
    try {
      const res = await this.request({
        url: `/event/${this.data.featuredEvent.event_id}/update_content`,
        method: 'POST',
        data: {
          title: this.data.featuredEvent.title,
          content: this.data.tempContent
        }
      });

      if (res.Flag === '4000') {
        wx.showToast({ title: '简介更新成功', icon: 'success' });
        this.setData({
          'featuredEvent.content': this.data.tempContent
        });
        this.closeContentPopup();
      } else {
        wx.showToast({ title: res.message || '更新失败', icon: 'none' });
      }
    } catch (error) {
      console.error('更新简介失败:', error);
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },

  // 编辑地址
  editLocation() {
    // 初始化地址表单数据
    const event = this.data.featuredEvent;
    this.setData({
      locationForm: {
        name: event.location_data?.name || event.location || '',
        address: event.location_data?.address || '',
        latitude: event.location_data?.latitude || null,
        longitude: event.location_data?.longitude || null
      },
      showLocationPopup: true
    });
  },

  // 关闭地址编辑弹窗
  closeLocationPopup() {
    this.setData({
      showLocationPopup: false
    });
  },

  // 地址名称输入
  onLocationNameChange(event) {
    this.setData({
      'locationForm.name': event.detail
    });
  },

  // 地址详情输入
  onLocationAddressChange(event) {
    this.setData({
      'locationForm.address': event.detail
    });
  },

  // 选择地图位置
  chooseLocation() {
    const { featuredEvent } = this.data;
    // 优先使用活动位置，否则使用广州中南空管局坐标作为默认位置
    const { latitude = 23.176149, longitude = 113.261868 } = featuredEvent?.location_data || {};
    
    wx.chooseLocation({
      latitude,
      longitude,
      success: (res) => {
        this.setData({
          'locationForm.name': res.name || this.data.locationForm.name,
          'locationForm.address': res.address || this.data.locationForm.address,
          'locationForm.latitude': res.latitude,
          'locationForm.longitude': res.longitude
        });
      },
      fail: (err) => {
        if (err.errMsg.includes('cancel')) {
          return;
        }
        wx.showToast({
          title: '选择位置失败',
          icon: 'none'
        });
      }
    });
  },

  // 确认地址修改
  async confirmLocation() {
    const { name, address, latitude, longitude } = this.data.locationForm;
    
    if (!name.trim()) {
      wx.showToast({
        title: '请输入地址名称',
        icon: 'none'
      });
      return;
    }

    try {
      const res = await this.request({
        url: `/event/${this.data.featuredEvent.event_id}/update_location`,
        method: 'POST',
        data: {
          location: name,
          location_data: {
            name: name,
            address: address,
            latitude: latitude,
            longitude: longitude
          }
        }
      });

      if (res.Flag === '4000') {
        wx.showToast({ title: '地址更新成功', icon: 'success' });
        
        // 更新本地数据
        this.setData({
          'featuredEvent.location': name,
          'featuredEvent.location_data': {
            name: name,
            address: address,
            latitude: latitude,
            longitude: longitude
          }
        });
        
        this.closeLocationPopup();
      } else {
        wx.showToast({ title: res.message || '更新失败', icon: 'none' });
      }
    } catch (error) {
      console.error('更新地址失败:', error);
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },

  // 获取并显示日程信息
  async fetchAndDisplaySchedule(scheduleId) {
    try {
      const res = await this.request({
        url: `/schedule/${scheduleId}`,
        method: 'GET'
      });
      
      if (res.Flag == 4000) {
        const scheduleData = res.data;
        this.setData({ currentSchedule: scheduleData });
        this.updateScheduleDisplay(scheduleData);
      }
    } catch (error) {
      console.error('获取日程信息失败:', error);
    }
  },

  // 更新日程显示
  updateScheduleDisplay(scheduleData) {
    if (!scheduleData) return;
    
    const timeConfig = scheduleData.time_config || {};
    let display = '';
    
    if (scheduleData.schedule_type === 'weekly' && timeConfig.weekdays) {
      const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
      const weekdaysDisplay = timeConfig.weekdays.map(day => dayLabels[day]).join('、');
      const time = `${String(timeConfig.hour || 0).padStart(2, '0')}:${String(timeConfig.minute || 0).padStart(2, '0')}`;
      display = `每周${weekdaysDisplay} ${time}`;
    } else if (scheduleData.schedule_type === 'monthly' && timeConfig.days) {
      const monthdaysDisplay = timeConfig.days.map(day => `${day}日`).join('、');
      const time = `${String(timeConfig.hour || 0).padStart(2, '0')}:${String(timeConfig.minute || 0).padStart(2, '0')}`;
      display = `每月${monthdaysDisplay} ${time}`;
    }
    
    this.setData({ scheduleDisplay: display });
  },

  // ========== 日程管理相关方法（从event-create复用） ==========

  // 编辑日程
  editSchedule() {
    const { featuredEvent, currentSchedule } = this.data;
    
    if (featuredEvent.can_create_schedule) {
      // 可以创建新日程
      this.setData({
        scheduleForm: {
          schedule_type: 'weekly',
          weekdays: [],
          month_days: [],
          activity_time: '09:00',
          advance_hours_slider: 1
        },
        isCreateMode: true
      });
    } else {
      // 修改现有日程 - 加载现有数据到表单
      if (currentSchedule && currentSchedule.time_config) {
        const timeConfig = currentSchedule.time_config;
        const activityTime = `${String(timeConfig.hour || 9).padStart(2, '0')}:${String(timeConfig.minute || 0).padStart(2, '0')}`;
        
        this.setData({
          scheduleForm: {
            schedule_type: currentSchedule.schedule_type || 'weekly',
            weekdays: currentSchedule.schedule_type === 'weekly' ? (timeConfig.weekdays || []) : [],
            month_days: currentSchedule.schedule_type === 'monthly' ? (timeConfig.days || []) : [],
            activity_time: activityTime,
            advance_hours_slider: this.getAdvanceHoursSlider(currentSchedule.advance_hours || 1)
          },
          timeOfDayValue: activityTime,
          isCreateMode: false
        });
      } else {
        // 如果没有现有数据，使用默认值
        this.setData({
          scheduleForm: {
            schedule_type: 'weekly',
            weekdays: [],
            month_days: [],
            activity_time: '09:00',
            advance_hours_slider: 1
          },
          isCreateMode: false
        });
      }
    }
    
    this.setData({ showSchedulePopup: true });
  },

  closeSchedulePopup() {
    this.setData({ showSchedulePopup: false });
  },

  onScheduleTypeChange(event) {
    const value = event.detail !== undefined ? event.detail : 'weekly';
    this.setData({
      'scheduleForm.schedule_type': value
    });
  },

  showWeekdaySelector() {
    this.setData({ showWeekdayPopup: true });
  },

  closeWeekdayPopup() {
    this.setData({ showWeekdayPopup: false });
  },

  onWeekdaysChange(event) {
    const value = event.detail.value !== undefined ? event.detail.value : [0];
    this.setData({
      'scheduleForm.weekdays': value,
      showWeekdayPopup: false
    });
  },

  showMonthdaySelector() {
    this.setData({ showMonthdayPopup: true });
  },

  closeMonthdayPopup() {
    this.setData({ showMonthdayPopup: false });
  },

  onMonthdaysChange(event) {
    const value = event.detail.value !== undefined ? event.detail.value : [1];
    this.setData({
      'scheduleForm.month_days': value,
      showMonthdayPopup: false
    });
  },

  showTimeOfDayPicker() {
    this.setData({ showTimeOfDayPickerPopup: true });
  },

  closeTimeOfDayPicker() {
    this.setData({ showTimeOfDayPickerPopup: false });
  },

  onTimeOfDayConfirm(event) {
    const time = event.detail !== undefined ? event.detail : '09:00';
    this.setData({
      'scheduleForm.activity_time': time,
      timeOfDayValue: time,
      showTimeOfDayPickerPopup: false
    });
  },

  onAdvanceHoursChange(event) {
    const value = event.detail !== undefined ? event.detail : 1;
    this.setData({
      'scheduleForm.advance_hours_slider': value
    });
  },

  async confirmSchedule() {
    try {
      const { featuredEvent, isCreateMode } = this.data;
      
      if (isCreateMode || featuredEvent.can_create_schedule) {
        await this.createSchedule();
      } else {
        await this.updateSchedule();
      }
      
      this.setData({ showSchedulePopup: false });
    } catch (error) {
      console.error('日程操作失败:', error);
      wx.showToast({
        title: error.message || '操作失败',
        icon: 'none'
      });
    }
  },

  clearSchedule() {
    this.setData({
      scheduleDisplay: '',
      scheduleForm: {
        schedule_type: 'weekly',
        weekdays: [],
        month_days: [],
        activity_time: '09:00',
        advance_hours_slider: 1
      },
      showSchedulePopup: false
    });
  },

  async createSchedule() {
    const { scheduleForm } = this.data;
    
    const scheduleData = {
      prototype_event_id: this.data.featuredEvent.event_id,
      schedule_type: scheduleForm.schedule_type,
      time_of_day: scheduleForm.activity_time,
      advance_hours: this.getAdvanceHours(scheduleForm.advance_hours_slider)
    };
    
    if (scheduleForm.schedule_type === 'weekly') {
      scheduleData.weekdays = scheduleForm.weekdays;
    } else if (scheduleForm.schedule_type === 'monthly') {
      scheduleData.month_days = scheduleForm.month_days;
    }
    
    try {
      wx.showLoading({ title: '创建日程中...' });
      
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: app.globalData.request_url + '/schedule/create',
          method: 'PUT',
          data: scheduleData,
          header: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + this.data.token
          },
          success: resolve,
          fail: reject
        });
      });
      
      wx.hideLoading();
      
      if (res.data.Flag == 4000) {
        wx.showToast({ title: '日程创建成功', icon: 'success' });
        this.setData({ currentSchedule: res.data.data });
        this.updateScheduleDisplay(res.data.data);
        
        // 直接更新本地状态，避免重新请求
        this.setData({
          'featuredEvent.can_create_schedule': false,
          'featuredEvent.schedule_info': {
            schedule_id: res.data.data.schedule_id
          }
        });
        
        return res.data.data;
      } else {
        throw new Error(res.data.message || '创建日程失败');
      }
    } catch (error) {
      wx.hideLoading();
      throw error;
    }
  },

  async updateSchedule() {
    const { scheduleForm, featuredEvent } = this.data;
    
    // 获取日程ID
    const scheduleId = featuredEvent?.schedule_info?.schedule_id;
    if (!scheduleId) {
      throw new Error('无法找到要修改的日程ID');
    }
    
    const scheduleData = {
      schedule_type: scheduleForm.schedule_type,
      time_of_day: scheduleForm.activity_time,
      advance_hours: this.getAdvanceHours(scheduleForm.advance_hours_slider)
    };
    
    if (scheduleForm.schedule_type === 'weekly') {
      scheduleData.weekdays = scheduleForm.weekdays;
    } else if (scheduleForm.schedule_type === 'monthly') {
      scheduleData.month_days = scheduleForm.month_days;
    }
    
    try {
      const res = await this.request({
        url: `/schedule/${scheduleId}/update`,
        method: 'POST',
        data: scheduleData,
        loadingText: '修改日程中...'
      });
      
      if (res.Flag == 4000) {
        wx.showToast({ title: '日程修改成功', icon: 'success' });
        this.setData({ currentSchedule: res.data });
        this.updateScheduleDisplay(res.data);
        
        // 直接更新本地的日程信息
        this.setData({
          'featuredEvent.schedule_info': {
            schedule_id: res.data.schedule_id
          }
        });
        
        return res.data;
      } else {
        throw new Error(res.message || '修改日程失败');
      }
    } catch (error) {
      throw error;
    }
  },

  getAdvanceHours(sliderValue) {
    const hours = [0, 1, 2, 3, 6, 12, 24];
    if (typeof sliderValue !== 'number' || sliderValue < 0 || sliderValue >= hours.length) {
      return 1;
    }
    return hours[sliderValue];
  },

  getAdvanceHoursSlider(hours) {
    const hoursArray = [0, 1, 2, 3, 6, 12, 24];
    const index = hoursArray.indexOf(hours);
    return index !== -1 ? index : 1; // 默认返回1（对应1小时）
  },

  showEndScheduleDialog() {
    this.setData({ showEndScheduleDialog: true });
  },

  closeEndScheduleDialog() {
    this.setData({ showEndScheduleDialog: false });
  },

  endScheduleFromPopup() {
    this.setData({ showSchedulePopup: false });
    setTimeout(() => {
      this.showEndScheduleDialog();
    }, 300);
  },

  async confirmEndSchedule() {
    const { featuredEvent } = this.data;
    const scheduleId = featuredEvent?.schedule_info?.schedule_id;
    if (!scheduleId) {
      wx.showToast({ title: '没有找到要结束的日程', icon: 'none' });
      return;
    }
    
    try {
      const res = await this.request({
        url: `/schedule/${scheduleId}/end`,
        method: 'GET',
        loadingText: '结束日程中...'
      });
      
      if (res.Flag == 4000) {
        wx.showToast({ title: '日程已结束', icon: 'success' });
        this.setData({ 
          showEndScheduleDialog: false,
          currentSchedule: null,
          scheduleDisplay: ''
        });
        this.loadEvent(featuredEvent.event_id);
      } else {
        throw new Error(res.message || '结束日程失败');
      }
    } catch (error) {
      wx.showToast({ title: error.message || '结束日程失败', icon: 'none' });
    }
  },

  // ========== 新增：预计时间编辑相关方法 ==========

  // 编辑预计时间
  editPreSchedule() {
    // 初始化表单数据
    this.initPreScheduleFormData();
    this.setData({
      showPreSchedulePopup: true
    });
  },

  // 关闭预计时间编辑弹窗
  closePreSchedulePopup() {
    this.setData({
      showPreSchedulePopup: false
    });
  },

  // 显示预计时间日期时间选择器
  showPreScheduleDateTimePicker() {
    this.setData({
      showPreScheduleDateTimePickerPopup: true
    });
  },

  // 关闭预计时间日期时间选择器
  closePreScheduleDateTimePicker() {
    this.setData({
      showPreScheduleDateTimePickerPopup: false
    });
  },

  // 确认预计时间日期时间选择
  onPreScheduleDateTimeConfirm(event) {
    const selectedDate = new Date(event.detail);
    const startTimeDisplay = this.formatDateTime(selectedDate);
    const startTime = selectedDate.toISOString();

    this.setData({
      preScheduleCurrentDate: event.detail,
      'preScheduleForm.startTime': startTime,
      'preScheduleForm.startTimeDisplay': startTimeDisplay,
      showPreScheduleDateTimePickerPopup: false
    });

    // 计算预计结束时间
    this.calculatePreScheduleEndTime();
  },

  // 计算预计结束时间
  calculatePreScheduleEndTime() {
    const { startTime, duration } = this.data.preScheduleForm;
    
    if (startTime && duration) {
      const startDateTime = new Date(startTime);
      const endDateTime = new Date(startDateTime.getTime() + duration * 60 * 60 * 1000);
      const endTimeDisplay = this.formatDateTime(endDateTime);
      
      this.setData({
        'preScheduleForm.endTimeDisplay': endTimeDisplay
      });
    }
  },

  // 活动时长变化
  onPreScheduleDurationChange(event) {
    const duration = event.detail;
    this.setData({
      'preScheduleForm.duration': duration,
      'preScheduleForm.durationText': duration + '小时'
    });
    this.calculatePreScheduleEndTime();
  },

  // 确认预计时间修改
  async confirmPreSchedule() {
    const { preScheduleForm, featuredEvent } = this.data;
    
    if (!preScheduleForm.startTime) {
      wx.showToast({
        title: '请先选择预计开始时间',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({ title: '更新中...' });
      
      // 计算预计结束时间
      const startDateTime = new Date(preScheduleForm.startTime);
      const endDateTime = new Date(startDateTime.getTime() + preScheduleForm.duration * 60 * 60 * 1000);
      
      // 修复：使用相同的时间格式，避免时区转换问题
      const formatLocalDateTime = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
      };
      
      // 添加调试输出
      const requestData = {
        pre_startTime: formatLocalDateTime(startDateTime),
        pre_endTime: formatLocalDateTime(endDateTime)
      };
      
      console.log('发送到后端的数据:', requestData);
      
      const res = await this.request({
        url: `/event/${featuredEvent.event_id}/update_pre_schedule`,
        method: 'POST',
        data: requestData
      });
      
      if (res.Flag === '4000') {
        wx.hideLoading();
        wx.showToast({ title: '时间更新成功', icon: 'success' });
        const message_data = {
          event_id: res.data.eventID,
          url: `/packageEvent/event-detail/index?eventId=${res.data.eventID}`,
          operation: 'event_pre_starttime_update',
          content: res.data.clubName + '组织的' + res.data.title + '活动预计开始时间或结束时间已更新'
        }                   

        await app.message_for_event(message_data);      
        // 更新本地显示数据
        this.setData({
          showPreSchedulePopup: false
        });
        this.loadEvent(featuredEvent.event_id);
      } else {
        wx.hideLoading();
        wx.showToast({ title: res.message || '更新失败', icon: 'none' });
      }
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: '网络请求失败', icon: 'none' });
      console.error('更新预计时间失败:', error);
    }
  },

  // 初始化预计时间表单数据
  initPreScheduleFormData() {
    const { featuredEvent } = this.data;
    
    if (featuredEvent && featuredEvent.pre_startTime) {
      const preStartDate = new Date(featuredEvent.pre_startTime);
      const startTimeDisplay = this.formatDateTime(preStartDate);
      
      // 计算时长（如果有结束时间）
      let duration = 2; // 默认2小时
      let endTimeDisplay = '';
      
      if (featuredEvent.pre_endTime) {
        const preEndDate = new Date(featuredEvent.pre_endTime);
        duration = Math.round((preEndDate.getTime() - preStartDate.getTime()) / (60 * 60 * 1000));
        endTimeDisplay = this.formatDateTime(preEndDate);
      } else {
        // 如果没有结束时间，按默认时长计算
        const endDateTime = new Date(preStartDate.getTime() + duration * 60 * 60 * 1000);
        endTimeDisplay = this.formatDateTime(endDateTime);
      }
      
      this.setData({
        'preScheduleForm.startTime': featuredEvent.pre_startTime,
        'preScheduleForm.startTimeDisplay': startTimeDisplay,
        'preScheduleForm.endTimeDisplay': endTimeDisplay,
        'preScheduleForm.duration': duration,
        'preScheduleForm.durationText': duration + '小时',
        preScheduleCurrentDate: preStartDate.getTime()
      });
    } else {
      // 如果没有预计开始时间，重置为默认值
      const now = new Date();
      this.setData({
        'preScheduleForm.startTime': '',
        'preScheduleForm.startTimeDisplay': '',
        'preScheduleForm.endTimeDisplay': '',
        'preScheduleForm.duration': 2,
        'preScheduleForm.durationText': '2小时',
        preScheduleCurrentDate: now.getTime()
      });
    }
  },

  // 格式化日期时间
  formatDateTime(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },

  // 显示时间提示
  showTimeHint() {
    const { timeHintText } = this.data;
    if (timeHintText) {
      wx.showToast({
        title: timeHintText,
        icon: 'none',
        duration: 3000
      });
    }
  }
});