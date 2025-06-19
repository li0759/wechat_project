const app = getApp();

Page({
  data: {
    userID: '',
    clubId: null,
    clubInfo: {},
    submitting: false,
    uploadAPI: app.globalData.request_url + `/file/upload_file`,
    formData: {
      title: '',
      clubName: '',
      clubId: '',
      eventDate: '',
      preStartTime: '',
      preStartTimeDisplay: '',
      preEndTime: '',
      preEndTimeDisplay: '',
      duration: 1,
      location: '',
      locationName: '',
      locationAddress: '',
      latitude: '',
      longitude: '',
      content: '',
      budget: ''
    },
    currentDate: new Date().getTime(),
    minDate: new Date().getTime(),
    maxDate: new Date(new Date().getFullYear() + 1, 11, 31).getTime(), // 最大可选日期为明年12月31日
    locationMarkers: [],
    imageList: [],
    dragImgCount: 0,
    clubList: [],
    showClubPopup: false,
    showTitlePopup: false,
    showTimePopup: false,
    showBudgetPopup: false,
    showContentPopup: false,
    showImagePopup: false,
    showLocationPopup: false,
    showDateTimePickerPopup: false,
    // 日程相关数据
    showSchedulePopup: false,
    showWeekdayPopup: false,
    showMonthdayPopup: false,
    showTimeOfDayPickerPopup: false,
    scheduleDisplay: '',
    scheduleForm: {
      schedule_type: 'weekly',
      weekdays: [0], // 默认周一
      month_days: [1], // 默认1号
      activity_time: '09:00',
      advance_hours_slider: 1
    },
    timeOfDayValue: '09:00',
    advanceHourLabels: ['不提醒', '提前1小时', '提前2小时', '提前3小时', '提前6小时', '提前12小时', '提前1天', '提前2天'],
    durationLabels: ['1小时', '1.5小时', '2小时', '3小时', '4小时', '6小时', '8小时', '全天'],
    weekdaysDisplay: '', // 初始为空，只有确认后才显示
    monthdaysDisplay: '', // 初始为空，只有确认后才显示
    selectedClubId: '',
    tempTitle: '',
    tempDate: '',
    tempTime: '',
    tempBudget: '',
    tempContent: '',
    tempLocation: '',
    creating: false
  },

  onLoad: function (options) {
    // 检查登录状态并获取用户信息
    this.checkLoginStatus()
    
    // 设置用户ID和token
    const userId = wx.getStorageSync('userId');
    this.setData({
      userID: userId,
      token: wx.getStorageSync('token')
    });
    
    // 获取用户管理的协会列表
    this.fetchUserClubList();
    
    // 如果有clubId参数，则设置为默认选中
    if (options.clubId) {
      this.setData({ clubId: options.clubId });
    }
  },

  // 检查登录状态
  checkLoginStatus: function() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({
        userInfo: userInfo
      });
      return true;
    } else {
      wx.navigateTo({
        url: '/pages/login'
      });
      return false;
    }
  },

  onShow() {
    // 更新图片计数
    this.updateImageCount();
  },

  // 更新图片计数
  updateImageCount() {
    const dragComponent = this.selectComponent('#drag-img');
    if (dragComponent && dragComponent.data.dragImgList) {
      this.setData({
        dragImgCount: dragComponent.data.dragImgList.length
      });
    }
  },

  // 拖拽组件图片列表更新回调
  onImageListUpdate(event) {
    // 更新图片计数
    this.updateImageCount();
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
          console.log(err)
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

  // 获取用户管理的协会列表
  fetchUserClubList() {
    const apiPromise = this.request({
      url: `/club/user_lead/list`,
      method: 'GET',
      loadingText: '加载协会列表...'
    });
    
    this.handleApiCall(apiPromise, null, '获取协会列表失败')
      .then(data => {
        if (!data) return;
        // 转换数据格式
        const clubList = data.map(club => ({
          id: club.club_id,
          name: club.club_name
        }));
        this.setData({ clubList });
        
        // 处理默认选择
        if (clubList.length > 0) {
          const defaultIndex = this.data.clubId 
            ? clubList.findIndex(club => club.id == this.data.clubId) 
            : 0;
          
          const selectedIndex = defaultIndex !== -1 ? defaultIndex : 0;
          const selectedClub = clubList[selectedIndex];
          
          this.setData({
            'formData.clubId': selectedClub.id,
            'formData.clubName': selectedClub.name,
            selectedClubId: selectedClub.id
          });
        }
      });
  },

  // 显示错误提示
  showErrorToast(message) {
    wx.showToast({
      title: message,
      icon: 'none'
    });
  },

  // 返回上一页
  navigateBack() {
    wx.navigateBack();
  },

  // ========== 编辑弹窗相关方法 ==========
  
  // 编辑协会
  editClub() {
    this.setData({
      showClubPopup: true,
      selectedClubId: this.data.formData.clubId
    });
  },

  closeClubPopup() {
    this.setData({ showClubPopup: false });
  },

  onClubChange(event) {
    this.setData({ selectedClubId: event.detail });
  },

  selectClub(event) {
    const clubId = event.currentTarget.dataset.name;
    this.setData({ selectedClubId: clubId });
  },

  confirmClub() {
    const selectedClub = this.data.clubList.find(club => club.id === this.data.selectedClubId);
    if (selectedClub) {
      this.setData({
        'formData.clubId': selectedClub.id,
        'formData.clubName': selectedClub.name,
        showClubPopup: false
      });
    }
  },

  // 编辑活动名称
  editTitle() {
    this.setData({
      showTitlePopup: true,
      tempTitle: this.data.formData.title
    });
  },

  closeTitlePopup() {
    this.setData({ showTitlePopup: false });
  },

  onTempTitleChange(event) {
    this.setData({ tempTitle: event.detail });
  },

  confirmTitle() {
    this.setData({
      'formData.title': this.data.tempTitle,
      showTitlePopup: false
    });
  },

  // 编辑开始时间
  editStartTime() {
    this.setData({
      showTimePopup: true,
      tempDate: this.data.formData.eventDate,
      tempTime: this.data.formData.preStartTime
    });
  },

  closeTimePopup() {
    this.setData({ showTimePopup: false });
  },

  onTempDateChange(event) {
    this.setData({ tempDate: event.detail.value });
  },

  onTempTimeChange(event) {
    this.setData({ tempTime: event.detail.value });
  },

  confirmTime() {
    // 重新计算预计结束时间，确保时长变更后的结果被保存
    this.calculateEndTime();
    // 关闭弹窗
    this.setData({
      showTimePopup: false
    });
  },

  // 编辑预算
  editBudget() {
    this.setData({
      showBudgetPopup: true,
      tempBudget: this.data.formData.budget
    });
  },

  closeBudgetPopup() {
    this.setData({ showBudgetPopup: false });
  },

  onTempBudgetChange(event) {
    this.setData({ tempBudget: event.detail });
  },

  confirmBudget() {
    this.setData({
      'formData.budget': this.data.tempBudget,
      showBudgetPopup: false
    });
  },

  // 编辑活动描述
  editContent() {
    this.setData({
      showContentPopup: true,
      tempContent: this.data.formData.content
    });
  },

  closeContentPopup() {
    this.setData({ showContentPopup: false });
  },

  onTempContentChange(event) {
    this.setData({ tempContent: event.detail });
  },

  confirmContent() {
    this.setData({
      'formData.content': this.data.tempContent,
      showContentPopup: false
    });
  },

  // ========== 地图选择相关方法 ==========
  
  // 表单输入
  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    const value = e.detail;
    
    this.setData({
      [`formData.${field}`]: value
    });
  },

  // 选择地点
  chooseLocation() {
    const { latitude = 23.176149, longitude = 113.261868 }  = {};
    wx.chooseLocation({
      latitude,
      longitude,
      success: (res) => {
       
        // 创建地图标记
        const markers = [{
          id: 1,
          latitude: res.latitude,
          longitude: res.longitude,
          title: res.name,
          iconPath: '/assets/icons/location.png',
          width: 30,
          height: 30
        }];
        
        this.setData({
          'formData.locationName': res.name,
          'formData.locationAddress': res.address,
          'formData.latitude': res.latitude,
          'formData.longitude': res.longitude,
          'formData.location': res.name,
          locationMarkers: markers
        });
      },
      fail: (err) => {
        if (err.errMsg.includes('cancel')) {
          return;
        }
        this.showErrorToast('选择位置失败，请重试');
      }
    });
  },

  // 清除位置
  clearLocation() {
    this.setData({
      'formData.locationName': '',
      'formData.locationAddress': '',
      'formData.latitude': '',
      'formData.longitude': '',
      'formData.location': '',
      locationMarkers: []
    });
  },

  // ========== 表单提交相关方法 ==========
  
  // 表单验证
  validateForm() {
    const { formData } = this.data;
    
    if (!formData.clubId) {
      this.showErrorToast('请选择活动协会');
      return false;
    }
    
    if (!formData.title || formData.title.trim() === '') {
      this.showErrorToast('请输入活动名称');
      return false;
    }
    
    if (!formData.eventDate) {
      this.showErrorToast('请选择活动日期');
      return false;
    }
    
    if (!formData.preStartTime) {
      this.showErrorToast('请选择活动预计开始时间');
      return false;
    }
    
    if (!formData.content || formData.content.trim() === '') {
      this.showErrorToast('请输入活动描述');
      return false;
    }
    
    // 检查图片
    const dragComponent = this.selectComponent('#drag-img');
    if (!dragComponent || !dragComponent.data.dragImgList || dragComponent.data.dragImgList.length === 0) {
      this.showErrorToast('请至少上传一张活动图片');
      return false;
    }
    
    return true;
  },

  // 提交表单
  async submitForm() {
    if (this.data.submitting) return;
    
    if (!this.validateForm()) return;
    
    this.setData({ submitting: true });
    
    try {
      // 先保存图片变更
      await this.saveImageChanges();
      
      // 创建活动
      const eventResult = await this.createEvent();
      
      // 只有在用户确认设置了日程（scheduleDisplay不为空）时才创建日程
      if (this.data.scheduleDisplay && this.data.scheduleDisplay.trim() !== '') {
        await this.createSchedule(eventResult.eventID);
      } else {
        console.log('未设置日程，跳过日程创建');
      }
      
      // 所有操作完成后发送通知
      const message_data = {
        club_id: eventResult.clubId,
        event_id: eventResult.eventID,
        url: `/packageEvent/event-detail/index?eventId=${eventResult.eventID}`,
        operation: 'event_create',
        content: eventResult.clubName + '发布了新活动：' + eventResult.title + '，快来查看详情并报名参加吧！'
      };
      
      await app.message_for_club(message_data);
      
      // 创建成功后返回上一页
      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
    } catch (error) {
      console.error('提交失败:', error);
      this.showErrorToast('提交失败，请重试');
    } finally {
      this.setData({ submitting: false });
    }
  },

  // 创建活动 - 返回活动信息
  async createEvent() {
    const { formData } = this.data;
    
    // 获取已上传的图片URL列表
    const dragComponent = this.selectComponent('#drag-img');
    const uploadedImages = dragComponent ? 
      (dragComponent.data.dragImgList || [])
        .sort((a, b) => a.key - b.key)
        .map(img => img.src) : 
      [];
    
    const eventData = {
      club_id: formData.clubId,
      title: formData.title.trim(),
      pre_startTime: `${formData.eventDate} ${formData.preStartTime}`,
      pre_endTime: formData.preEndTime,
      content: formData.content.trim(),
      location: formData.location || formData.locationName,
      budget: formData.budget ? parseFloat(formData.budget) : 0,
      process_images: uploadedImages.join(';')
    };
    
    // 添加位置数据
    if (formData.latitude && formData.longitude) {
      eventData.location_data = {
        name: formData.locationName,
        address: formData.locationAddress,
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude)
      };
    }
    
    const apiPromise = this.request({
      url: '/event/create',
      method: 'PUT',
      data: eventData,
      loadingText: '创建活动中...'
    });
    
    const data = await this.handleApiCall(apiPromise, '活动创建成功', '创建活动失败');
    
    // 返回包含活动信息的对象，用于后续通知
    return {
      eventID: data.eventID,
      title: formData.title.trim(),
      clubName: formData.clubName,
      clubId: formData.clubId
    };
  },

  // 保存图片变更
  async saveImageChanges() {
    const dragComponent = this.selectComponent('#drag-img');
    if (!dragComponent) return;
    
    const imageList = dragComponent.data.dragImgList || [];
    
    for (let i = 0; i < imageList.length; i++) {
      const pic = imageList[i];
      if (pic.src.includes('tmp'))  {
        await this.uploadSingleImage(pic, dragComponent);
      }
    }
    
    this.setData({ imageList });
  },

  // 上传单张图片
  async uploadSingleImage(pic, dragComponent) {
    try {
      const uploadedUrl = await this.uploadImage(pic.src);
      
      // 更新组件中的图片状态
      dragComponent.updateImageUrl(pic.src, uploadedUrl);
      
      pic.src = uploadedUrl;
      pic.uploaded = true;
      
    } catch (error) {
      console.error('图片上传失败:', error);
      throw new Error('图片上传失败');
    }
  },

  // 上传图片到服务器
  async uploadImage(filePath) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: this.data.uploadAPI,
        filePath: filePath,
        name: 'file',
        header: {
          'Authorization': 'Bearer ' + this.data.token
        },
        success: (res) => {
          try {
            const data = JSON.parse(res.data);
            if (data.Flag === 4000) {
              resolve(data.data.url);
            } else {
              reject(new Error(data.message || '上传失败'));
            }
          } catch (error) {
            reject(new Error('解析上传结果失败'));
          }
        },
        fail: (error) => {
          reject(error);
        }
      });
    });
  },

  // 编辑图片
  editImages() {
    this.setData({ showImagePopup: true });
  },

  closeImagePopup() {
    this.setData({ showImagePopup: false });
  },

  confirmImages() {
    this.updateImageCount();
    this.setData({ showImagePopup: false });
  },

  // 编辑地点
  editLocation() {
    this.setData({
      showLocationPopup: true,
      tempLocation: this.data.formData.location
    });
  },

  closeLocationPopup() {
    this.setData({ showLocationPopup: false });
  },

  onTempLocationChange(event) {
    this.setData({ tempLocation: event.detail });
  },

  confirmLocation() {
    if (this.data.tempLocation && !this.data.formData.locationName) {
      this.setData({
        'formData.location': this.data.tempLocation
      });
    }
    this.setData({ showLocationPopup: false });
  },

  // 开始时间相关方法
  showDateTimePicker() {
    this.setData({ showDateTimePickerPopup: true });
  },

  closeDateTimePicker() {
    this.setData({ showDateTimePickerPopup: false });
  },

  onDateTimeConfirm(event) {
    const date = new Date(event.detail);
    const formattedTime = this.formatDateTime(date);
    
    // 分离日期和时间
    const dateStr = formattedTime.split(' ')[0];
    const timeStr = formattedTime.split(' ')[1];
    
    this.setData({
      'formData.eventDate': dateStr,
      'formData.preStartTime': timeStr,
      'formData.preStartTimeDisplay': formattedTime,
      showDateTimePickerPopup: false
    });
    
    // 计算预计结束时间
    this.calculateEndTime();
  },

  // 计算预计结束时间
  calculateEndTime() {
    const { eventDate, preStartTime, duration } = this.data.formData;
    
    if (!eventDate || !preStartTime) return;
    
    try {
      // 创建开始时间的Date对象
      const startDateTime = new Date(`${eventDate} ${preStartTime}`);
      
      // 根据时长计算结束时间
      let durationHours;
      if (duration === 7) { // 全天
        durationHours = 24;
      } else {
        // 对应 durationLabels 数组的索引
        const durationValues = [1, 1.5, 2, 3, 4, 6, 8, 24];
        durationHours = durationValues[duration] || 1;
      }
      
      // 计算结束时间
      const endDateTime = new Date(startDateTime.getTime() + durationHours * 60 * 60 * 1000);
      const endTimeFormatted = this.formatDateTime(endDateTime);
      
      // 分离日期和时间
      const endDateStr = endTimeFormatted.split(' ')[0];
      const endTimeStr = endTimeFormatted.split(' ')[1];
      
      this.setData({
        'formData.preEndTime': `${endDateStr} ${endTimeStr}`,
        'formData.preEndTimeDisplay': endTimeFormatted
      });
    } catch (error) {
      console.error('计算结束时间失败:', error);
    }
  },

  // 活动时长变更
  onDurationChange(event) {
    const value = event.detail !== undefined ? event.detail : 1;
    
    this.setData({
      'formData.duration': value
    });
    
    // 重新计算预计结束时间
    this.calculateEndTime();
  },

  formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },

  // ========== 日程管理相关方法 ==========
  
  // 编辑日程
  editSchedule() {
    this.setData({ showSchedulePopup: true });
  },

  closeSchedulePopup() {
    // 关闭弹窗时不更新显示内容，只有确认时才更新
    this.setData({ showSchedulePopup: false });
  },

  // 日程类型变更
  onScheduleTypeChange(event) {
    // 添加对undefined值的检查，如果为undefined则使用默认值'weekly'
    const value = event.detail !== undefined ? event.detail : 'weekly';
    this.setData({
      'scheduleForm.schedule_type': value
    });
    // 移除自动更新显示文本，只有确认时才更新
  },

  // 显示星期选择器
  showWeekdaySelector() {
    this.setData({ showWeekdayPopup: true });
  },

  closeWeekdayPopup() {
    this.setData({ showWeekdayPopup: false });
  },

  // 星期选择确认
  onWeekdaysChange(event) {
    // 添加对undefined值的检查，如果为undefined则使用默认值[0]
    const value = event.detail.value !== undefined ? event.detail.value : [0];
    this.setData({
      'scheduleForm.weekdays': value,
      showWeekdayPopup: false
    });
  },

  // 显示月份日期选择器
  showMonthdaySelector() {
    this.setData({ showMonthdayPopup: true });
  },

  closeMonthdayPopup() {
    this.setData({ showMonthdayPopup: false });
  },

  // 月份日期选择确认
  onMonthdaysChange(event) {
    // 添加对undefined值的检查，如果为undefined则使用默认值[1]
    const value = event.detail.value !== undefined ? event.detail.value : [1];
    this.setData({
      'scheduleForm.month_days': value,
      showMonthdayPopup: false
    });
  },

  // 显示活动时间选择器
  showTimeOfDayPicker() {
    this.setData({ showTimeOfDayPickerPopup: true });
  },

  closeTimeOfDayPicker() {
    this.setData({ showTimeOfDayPickerPopup: false });
  },

  // 活动时间确认
  onTimeOfDayConfirm(event) {
    // 添加对undefined值的检查，如果为undefined则使用默认值'09:00'
    const time = event.detail !== undefined ? event.detail : '09:00';
    this.setData({
      'scheduleForm.activity_time': time,
      timeOfDayValue: time,
      showTimeOfDayPickerPopup: false
    });
    // 移除自动更新显示文本，只有确认时才更新
  },

  // 提前通知时间变更
  onAdvanceHoursChange(event) {
    // 修复：使用event.detail而不是event.detail.value来获取滑块值
    const value = event.detail !== undefined ? event.detail : 1;
    
    this.setData({
      'scheduleForm.advance_hours_slider': value
    });
  },

  // 确认日程设置
  confirmSchedule() {
    // 只有在确认时才更新显示文本
    this.updateScheduleDisplay();
    this.setData({ showSchedulePopup: false });
  },

  // 清除日程设置
  clearSchedule() {
    this.setData({
      scheduleDisplay: '',
      weekdaysDisplay: '',
      monthdaysDisplay: '',
      // 重置日程表单为默认值
      'scheduleForm.schedule_type': 'weekly',
      'scheduleForm.weekdays': [0],
      'scheduleForm.month_days': [1],
      'scheduleForm.activity_time': '09:00',
      'scheduleForm.advance_hours_slider': 1,
      timeOfDayValue: '09:00',
      // 关闭弹窗
      showSchedulePopup: false
    });
  },

  // 更新日程显示文本
  updateScheduleDisplay() {
    const { scheduleForm } = this.data;
    let display = '';
    let weekdaysDisplay = '';
    let monthdaysDisplay = '';
    
    if (scheduleForm.schedule_type === 'weekly') {
      if (scheduleForm.weekdays && scheduleForm.weekdays.length > 0) {
        weekdaysDisplay = this.getWeekdaysDisplay(scheduleForm.weekdays);
        display = `每周${weekdaysDisplay} ${scheduleForm.activity_time}`;
      }
    } else if (scheduleForm.schedule_type === 'monthly') {
      if (scheduleForm.month_days && scheduleForm.month_days.length > 0) {
        monthdaysDisplay = this.getMonthdaysDisplay(scheduleForm.month_days);
        display = `每月${monthdaysDisplay} ${scheduleForm.activity_time}`;
      }
    }
    
    this.setData({ 
      scheduleDisplay: display,
      weekdaysDisplay: weekdaysDisplay,
      monthdaysDisplay: monthdaysDisplay
    });
  },

  // 获取星期显示文本
  getWeekdaysDisplay(weekdays) {
    const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    return weekdays.map(day => dayLabels[day]).join('、');
  },

  // 获取月份日期显示文本
  getMonthdaysDisplay(monthdays) {
    return monthdays.map(day => `${day}日`).join('、');
  },

  // 创建日程
  async createSchedule(eventId) {
    const { scheduleForm } = this.data;
    
    // 构建日程数据
    const scheduleData = {
      prototype_event_id: eventId,
      schedule_type: scheduleForm.schedule_type,
      time_of_day: scheduleForm.activity_time,
      advance_hours: this.getAdvanceHours(scheduleForm.advance_hours_slider)
    };
    
    // 根据类型添加执行日期
    if (scheduleForm.schedule_type === 'weekly') {
      scheduleData.weekdays = scheduleForm.weekdays;
    } else if (scheduleForm.schedule_type === 'monthly') {
      scheduleData.month_days = scheduleForm.month_days;
    }
    
    const apiPromise = this.request({
      url: '/schedule/create',
      method: 'PUT',
      data: scheduleData,
      loadingText: '创建日程中...'
    });
    
    return this.handleApiCall(apiPromise, '日程创建成功', '创建日程失败');
  },

  // 获取提前通知小时数
  getAdvanceHours(sliderValue) {
    const hours = [0, 1, 2, 3, 6, 12, 24];
    // 确保sliderValue是有效的数字且在合理范围内
    if (typeof sliderValue !== 'number' || sliderValue < 0 || sliderValue >= hours.length) {
      return 1; // 默认返回1小时
    }
    return hours[sliderValue];
  },

  getAdvanceHoursSlider(hours) {
    const hoursArray = [0, 1, 2, 3, 6, 12, 24];
    const index = hoursArray.indexOf(hours);
    return index !== -1 ? index : 1; // 默认返回1（对应1小时）
  }
});