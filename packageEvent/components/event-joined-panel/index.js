const app = getApp();

Component({
  properties: {
    eventId: {
      type: String,
      value: ''
    }
  },

  data: {
    featuredEvent: null,
    isLoading: true,
    autoActionExecuted: false, // 标记是否已执行自动操数
      // 选项卡相数
      currentTab: 'timeline',
    
    // 时间线相数
      stepsCurrent: 0,
    stepStatuses: {
      preStart: 'default',
      actualStart: 'default',
      clockin: 'default',
      preEnd: 'default',
      actualEnd: 'default',
      payment: 'default'
    },
    canClockIn: false,
    canPay: false,
    
    // 动态相数
      momentsList: [],
    momentsLoading: false,
    isMomentsLoading: false,
    momentsPage: 1,
    momentsTotalPages: 1,
    isEmpty: false,
    showAddMomentPopup: false,
    showMomentImageViewer: false,
    momentPreviewImages: [],
    momentPreviewIndex: 0,
    addMomentForm: {
      description: '',
      uploadFiles: [],
      imageIds: [],
      isUploading: false
    },
    uploadGridConfig: {
      column: 3,
      width: 200,
      height: 200
    },
    
    // 动态操作菜数
      momentOpsVisible: false,
    currentActionMomentId: null,
    
    // 缴费弹窗
    showPaymentDialog: false,
    paymentAmount: ''
  },

  lifetimes: {
    attached() {
      this._loaded = false;
      this._hasExpanded = false;
    }
  },

  observers: {
    'eventId': function(eventId) {
      // 如果 eventId 没有真正变化，不要重新加数
      // 同时检查是否是占位置ID，占位符不应该触摸API 请求
    const isPlaceholder = !eventId || eventId.startsWith('placeholder');
      if (isPlaceholder) {
        this._lastEventId = null;
        this._loaded = false;
        this.setData({ isLoading: false, featuredEvent: null });
        return;
      }
      // 只记?eventId，不自动加载数据（懒加载数
      if (eventId !== this._lastEventId) {
        this._lastEventId = eventId;
        this._loaded = false;
        // 如果已经展开过，则重新加数
      if (this._hasExpanded) {
          this.loadData();
        }
      }
    }
  },

  methods: {
    // 懒加载入口：供外部调用，只有弹窗展开时才加载数据
  loadData() {      this._hasExpanded = true;
      if (this._loaded) {        return Promise.resolve();
      }
      if (!this.data.eventId || this.data.eventId.startsWith('placeholder')) {        return Promise.resolve();
      }
      this._loaded = true;      return this.loadEventData();
    },

  // 加载活动数据
  async loadEventData() {
    try {
      this.setData({ isLoading: true });

      const eventResult = await this.loadEventDetail();
      
      if (eventResult && eventResult.data) {
        await this.processEventData(eventResult.data);
      }

      this.setData({ isLoading: false });
      this.triggerEvent('loaded');
    } catch (error) {      this.setData({ isLoading: false });
      this.triggerEvent('loaded');
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  // 加载活动详情
  loadEventDetail() {
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.request_url + `/event/${this.data.eventId}`,
        method: 'GET',
        header: {
          'Authorization': 'Bearer ' + wx.getStorageSync('token'),
          'Content-Type': 'application/json'
        },
        success: (res) => {
          if (res.data.Flag === '4000') {
            resolve(res.data);
          } else {
            reject(new Error(res.data.message || '加载失败'));
          }
        },
        fail: reject
      });
    });
  },

  // 处理活动数据
  async processEventData(eventData) {
    this.setData({ featuredEvent: eventData });

    // 计算步骤状数
      const nowTs = Date.now();
    const hasStarted = !!eventData.actual_startTime;
    const hasEnded = !!eventData.actual_endTime;
    const hasClockedIn = !!eventData.cur_user_clockin_date;
    const hasJoined = !!eventData.cur_user_join_date;
    
    const stepStatuses = {
      preStart: hasStarted ? 'finish' : 'default',
      actualStart: hasStarted ? 'finish' : 'default',
      clockin: hasClockedIn ? 'finish' : (hasStarted && !hasEnded ? 'process' : 'default'),
      preEnd: hasEnded ? 'finish' : (hasStarted ? 'process' : 'default'),
      actualEnd: hasEnded ? 'finish' : 'default',
      payment: 'default'
    };

    let stepsCurrent = 0;
    if (hasEnded) stepsCurrent = 5;
    else if (hasClockedIn) stepsCurrent = 3;
    else if (hasStarted) stepsCurrent = 2;
    else stepsCurrent = 0;

    // 判断是否可以打卡（活动已开始且未结束且未打卡）
    const canClockIn = hasStarted && !hasEnded && !hasClockedIn;
    
    // 判断是否可以缴费（这里简化处理，实际应该查询是否有待缴费记录数
      const canPay = false;

    this.setData({
      stepStatuses,
      stepsCurrent,
      canClockIn,
      canPay
    });

    // 执行自动操作（仅执行一次）
    if (!this.data.autoActionExecuted) {
      this.setData({ autoActionExecuted: true });
      await this.executeAutoAction(hasStarted, hasJoined, hasClockedIn);
    }
  },

  // 执行自动操作（从分享链接进入时）
  async executeAutoAction(hasStarted, hasJoined, hasClockedIn) {
    // 检查是否从分享链接进入（通过 URL 参数判断数
      const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];
    const options = currentPage.options || {};
    
    // 只有从分享链接进入时才执行自动操数
      if (!options.eventId || !options.autoOpen) {
      return;
    }

    try {
      if (!hasStarted && !hasJoined) {
        // 活动未开始且用户未参数-> 自动参加
        await this.autoJoinEvent();
      } else if (hasStarted && !hasClockedIn) {
        // 活动已开始且用户未打开-> 自动打卡
        await this.autoClockIn();
      }
    } catch (error) {    }
  },

  // 自动参加活动
  async autoJoinEvent() {
    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: getApp().globalData.request_url + `/event/${this.data.eventId}/join`,
          method: 'GET',
          header: {
            'Authorization': 'Bearer ' + wx.getStorageSync('token'),
            'Content-Type': 'application/json'
          },
          success: resolve,
          fail: reject
        });
      });

      if (res.data.Flag === '4000') {
        wx.showToast({
          title: '已参加活动',
          icon: 'success',
          duration: 2000
        });
        
        // 重新加载数据
        setTimeout(() => {
          this.loadEventData();
        }, 1000);
      } else {
        throw new Error(res.data.message || '参加失败');
      }
    } catch (error) {      wx.showToast({
        title: error.message || '参加失败',
        icon: 'none'
      });
    }
  },

  // 自动打卡
  async autoClockIn() {
    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: getApp().globalData.request_url + `/event/clockin/${this.data.eventId}`,
          method: 'GET',
          header: {
            'Authorization': 'Bearer ' + wx.getStorageSync('token'),
            'Content-Type': 'application/json'
          },
          success: resolve,
          fail: reject
        });
      });

      if (res.data.Flag === '4000') {
        wx.showToast({
          title: '打卡成功',
          icon: 'success',
          duration: 2000
        });
        
        // 重新加载数据
        setTimeout(() => {
          this.loadEventData();
        }, 1000);
      } else {
        throw new Error(res.data.message || '打卡失败');
      }
    } catch (error) {      wx.showToast({
        title: error.message || '打卡失败',
        icon: 'none'
      });
    }
  },

  // 选项卡切数
      onTabChange(e) {
    const value = e.detail.value;
    this.setData({ currentTab: value });
    
    // 切换到动态选项卡时加载动态数数
      if (value === 'moments') {
      if (this.data.momentsList.length === 0) {
        this.setData({
          momentsList: Array(4).fill({ loading: true })
        });
      }
      this.loadEventMoments(1);
    }
  },

  // 打卡
  async onClockIn() {
    if (!this.data.canClockIn) return;

    try {
      wx.showLoading({ title: '打卡?..' });
      
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: app.globalData.request_url + `/event/clockin/${this.data.eventId}`,
          method: 'GET',
          header: {
            'Authorization': 'Bearer ' + wx.getStorageSync('token'),
            'Content-Type': 'application/json'
          },
          success: resolve,
          fail: reject
        });
      });

      wx.hideLoading();

      if (res.data.Flag === '4000') {
        wx.showToast({
          title: '打卡成功',
          icon: 'success'
        });
        
        // 重新加载数据
    this.loadEventData();
      } else {
        throw new Error(res.data.message || '打卡失败');
      }
    } catch (error) {
      wx.hideLoading();      wx.showToast({
        title: error.message || '打卡失败',
        icon: 'none'
      });
    }
  },

  // 显示缴费弹窗
  onPayment() {
    this.setData({
      showPaymentDialog: true,
      paymentAmount: ''
    });
  },

  // 关闭缴费弹窗
  closePaymentDialog() {
    this.setData({
      showPaymentDialog: false,
      paymentAmount: ''
    });
  },

  // 缴费金额输入
  onPaymentAmountChange(e) {
    this.setData({
      paymentAmount: e.detail.value || e.detail
    });
  },

  // 确认缴费
  async confirmPayment() {
    const amount = parseFloat(this.data.paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      wx.showToast({
        title: '请输入有效金', icon: 'none'
      });
      return;
    }

    // TODO: 调用缴费接口
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
    
    this.closePaymentDialog();
  },

  // 弹窗状态变数
      onPaymentDialogVisibleChange(e) {
    if (!e.detail.visible) {
      this.closePaymentDialog();
    }
  },

  // 退出活动
  async onQuitEvent() {
    const result = await new Promise((resolve) => {
      wx.showModal({
        title: '确认退',
        content: '确定要退出这个活动吗',
        confirmText: '退',
        confirmColor: '#ff4757',
        success: resolve,
        fail: () => resolve({ confirm: false })
      });
    });

    if (!result.confirm) return;

    try {
      wx.showLoading({ title: '处理?..' });
      
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: app.globalData.request_url + `/event/${this.data.eventId}/quit`,
          method: 'GET',
          header: {
            'Authorization': 'Bearer ' + wx.getStorageSync('token'),
            'Content-Type': 'application/json'
          },
          success: resolve,
          fail: reject
        });
      });

      wx.hideLoading();

      if (res.data.Flag === '4000') {
        wx.showToast({
          title: '退出成', icon: 'success'
        });
        
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        throw new Error(res.data.message || '退出失');
      }
    } catch (error) {
      wx.hideLoading();      wx.showToast({
        title: error.message || '退出失', icon: 'none'
      });
    }
  },

  // ========== 动态管理相关方法==========

  // 加载活动动态列表（只显示本人发布的?
  async loadEventMoments(page = 1) {
    if (this.data.isMomentsLoading || (this.data.momentsTotalPages && page > this.data.momentsTotalPages)) return;
    
    this.setData({ isMomentsLoading: true });
    
    if (page > 1) {
      const skeletons = Array(2).fill({ loading: true });
      this.setData({
        momentsList: this.data.momentsList.concat(skeletons)
      });
    }

    try {
      const token = wx.getStorageSync('token');
      const userId = wx.getStorageSync('userInfo').id;

      const response = await new Promise((resolve, reject) => {
        wx.request({
          url: app.globalData.request_url + `/moment/event/${this.data.featuredEvent.event_id}?mode=page&page=${page}`,
          method: 'GET',
          header: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          success: resolve,
          fail: reject
        });
      });
      
      if (response.data && response.data.Flag == 4000) {
        const moments = response.data.data.moments || [];
        
        // 只显示本人发布的动数
      const myMoments = moments.filter(moment => moment.is_my_moment);
        
        const realData = myMoments.map(moment => ({
          ...moment,
          create_time: this.formatTime(moment.createDate),
          like_count: moment.likeIDs ? moment.likeIDs.length : 0,
          loading: false
        }));
        
        const isEmpty = page === 1 && realData.length === 0;
        
        if (page === 1) {
          this.setData({
            momentsList: []
          }, () => {
            this.setData({
              momentsList: realData,
              momentsPage: response.data.data.pagination.current_page || page,
              momentsTotalPages: response.data.data.pagination.total_pages || 1,
              momentsLoading: false,
              isEmpty: isEmpty,
              isMomentsLoading: false
            });
          });
        } else {
          const remain = this.data.momentsList.length - 2;
          this.setData({
            momentsList: [
              ...this.data.momentsList.slice(0, remain),
              ...realData
            ],
            momentsPage: response.data.data.pagination.current_page || page,
            momentsTotalPages: response.data.data.pagination.total_pages || 1,
            momentsLoading: false,
            isMomentsLoading: false
          });
        }
      } else {
        if (page === 1) {
          this.setData({ momentsLoading: false });
        } else {
          const remain = this.data.momentsList.length - 2;
          this.setData({
            momentsList: this.data.momentsList.slice(0, remain),
            momentsLoading: false
          });
        }
        throw new Error(response.data?.message || '获取动态失');
      }
    } catch (error) {      if (page === 1) {
        this.setData({ 
          momentsLoading: false,
          isMomentsLoading: false
        });
      } else {
        const remain = this.data.momentsList.length - 2;
        this.setData({
          momentsList: this.data.momentsList.slice(0, remain),
          momentsLoading: false,
          isMomentsLoading: false
        });
      }
    }
  },

  // 动态列表滚动到底部加载更多
  onMomentsScrollToLower() {
    this.loadEventMoments(this.data.momentsPage + 1);
  },

  // 显示添加动态弹数
      showAddMomentDialog() {
    this.setData({ 
      showAddMomentPopup: true,
      addMomentForm: {
        description: '',
        uploadFiles: [],
        imageIds: [],
        isUploading: false
      }
    });
  },

  // 取消添加动数
      cancelAddMoment() {
    this.setData({ showAddMomentPopup: false });
  },

  // 动态弹窗状态变数
      onAddMomentPopupChange(e) {
    if (!e.detail.visible) {
      this.setData({ showAddMomentPopup: false });
    }
  },

  // 动态内容输数
      onMomentDescInput(e) {
    this.setData({
      'addMomentForm.description': e.detail.value
    });
  },

  // 添加动态图数
      onMomentImageAdd(e) {
    const { files } = e.detail;
    this.setData({
      'addMomentForm.uploadFiles': files
    });
  },

  // 移除动态图数
      onMomentImageRemove(e) {
    const { index } = e.detail;
    const files = [...this.data.addMomentForm.uploadFiles];
    files.splice(index, 1);
    
    this.setData({
      'addMomentForm.uploadFiles': files
    });
  },

  // 上传动态图标
  async uploadMomentImage(filePath, index) {
    const token = wx.getStorageSync('token');
    
    try {
      const result = await new Promise((resolve, reject) => {
        wx.uploadFile({
          url: app.globalData.request_url + '/file/upload_file',
          filePath: filePath,
          name: 'file',
          header: {
            'Authorization': `Bearer ${token}`
          },
          success: (res) => {
            try {
              const data = JSON.parse(res.data);
              if (data.Flag == '4000') {
                resolve(data.data);
              } else {
                reject(new Error(data.message || '上传失败'));
              }
            } catch (error) {
              reject(new Error('解析响应失败'));
            }
          },
          fail: reject
        });
      });

      const uploadFiles = [...this.data.addMomentForm.uploadFiles];
      if (uploadFiles[index]) {
        uploadFiles[index].status = 'done';
        uploadFiles[index].percent = 100;
        this.setData({ 'addMomentForm.uploadFiles': uploadFiles });
      }

      return result;
    } catch (error) {
      const uploadFiles = [...this.data.addMomentForm.uploadFiles];
      if (uploadFiles[index]) {
        uploadFiles[index].status = 'fail';
        uploadFiles[index].percent = 0;
      }
      
      const failedFiles = uploadFiles.filter(file => file.status === 'fail');
      this.setData({ 'addMomentForm.uploadFiles': failedFiles });
      
      throw error;
    }
  },

  // 确认添加动?
  async confirmAddMoment() {
    const { description, uploadFiles } = this.data.addMomentForm;
    
    if (!description.trim()) {
      wx.showToast({
        title: '请输入动态内', icon: 'none'
      });
      return;
    }

    this.setData({
      'addMomentForm.isUploading': true
    });

    try {
      let imageIds = [];

      if (uploadFiles && uploadFiles.length > 0) {
        wx.showLoading({ title: '上传图片?..' });
        
        const loadingFiles = uploadFiles.map(file => ({
          ...file,
          status: 'loading',
          percent: 0
        }));
        this.setData({ 'addMomentForm.uploadFiles': loadingFiles });

        for (let i = 0; i < uploadFiles.length; i++) {
          const file = uploadFiles[i];
          try {
            const result = await this.uploadMomentImage(file.url, i);
            imageIds.push(result.file_id);
          } catch (error) {            throw new Error(`?${i + 1} 张图片上传失效 ${error.message}`);
          }
        }
      }

      wx.showLoading({ title: '发布动态中...' });

      const result = await app.createMomentWithParams({
        description: description.trim(),
        imageIds: imageIds,
        refEventId: this.data.featuredEvent.event_id,
        refClubId: this.data.featuredEvent.club_id,
        throwError: true
      });
      
      wx.hideLoading();
      wx.showToast({
        title: '发布成功',
        icon: 'success'
      });
      
      this.setData({ 
        showAddMomentPopup: false,
        'addMomentForm.isUploading': false
      });
      
      this.loadEventMoments(1);
      
    } catch (error) {
      wx.hideLoading();      wx.showToast({
        title: error.message || '发布失败',
        icon: 'none'
      });
      
      this.setData({
        'addMomentForm.isUploading': false
      });
    }
  },

  // 切换动态操作菜数
      toggleMomentOps(e) {
    const id = e.currentTarget.dataset.id;
    const isVisible = this.data.momentOpsVisible && this.data.currentActionMomentId == id;
    
    this.setData({
      momentOpsVisible: !isVisible,
      currentActionMomentId: isVisible ? null : id
    });
  },

  // 关闭动态操作菜数
      closeMomentOps() {
    this.setData({
      momentOpsVisible: false,
      currentActionMomentId: null
    });
  },

  // 删除动画
  async deleteMoment(e) {
    const momentId = e.currentTarget.dataset.id;
    
    this.closeMomentOps();
    
    const result = await new Promise((resolve) => {
      wx.showModal({
        title: '确认删除',
        content: '确定要删除这条动态吗？删除后无法恢复',
        confirmText: '删除',
        confirmColor: '#ff4757',
        success: resolve,
        fail: () => resolve({ confirm: false })
      });
    });

    if (!result.confirm) return;

    try {
      wx.showLoading({ title: '删除?..' });
      
      const token = wx.getStorageSync('token');
      const response = await new Promise((resolve, reject) => {
        wx.request({
          url: `${app.globalData.request_url}/moment/${momentId}`,
          method: 'DELETE',
          header: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          success: resolve,
          fail: reject
        });
      });

      wx.hideLoading();

      if (response.data?.Flag === 2000) {
        wx.showToast({
          title: '删除成功',
          icon: 'success',
          duration: 2000
        });
        
        this.loadEventMoments(1);
      } else {
        throw new Error(response.data?.message || '删除失败');
      }
    } catch (error) {
      wx.hideLoading();      wx.showToast({
        title: error.message || '删除失败',
        icon: 'none',
        duration: 3000
      });
    }
  },

  // 预览动态图数
      previewMomentImage(e) {
    const { momentId, index } = e.currentTarget.dataset;
    const moment = this.data.momentsList.find(m => m.momentID === momentId);
    
    if (moment && moment.image_files) {
      const images = moment.image_files.map(img => img.fileUrl);
      this.setData({
        showMomentImageViewer: true,
        momentPreviewImages: images,
        momentPreviewIndex: index
      });
    }
  },

  // 关闭动态图片预数
      onCloseMomentImageViewer() {
    this.setData({
      showMomentImageViewer: false,
      momentPreviewImages: [],
      momentPreviewIndex: 0
    });
  },

  // 切换点赞状态
  async toggleLike(e) {
    const { momentId, isLiked } = e.currentTarget.dataset;
    try {
      const token = wx.getStorageSync('token');

      const url = app.globalData.request_url + `/moment/${momentId}/${isLiked ? 'unlike' : 'like'}`;

      const response = await new Promise((resolve, reject) => {
        wx.request({
          url,
          method: 'GET',
          header: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          success: resolve,
          fail: reject
        });
      });
      
      if (response.data && response.data.Flag == 4000) {
        const momentsList = this.data.momentsList.map(moment => {
          if (moment.momentID === momentId) {
            return {
              ...moment,
              is_liked: !isLiked,
              like_count: response.data.data.like_count
            };
          }
          return moment;
        });
        
        this.setData({ momentsList });
        
        wx.showToast({
          title: isLiked ? '取消点赞' : '点赞成功',
          icon: 'success',
          duration: 1000
        });
      } else {
        throw new Error(response.data?.message || '操作失败');
      }
    } catch (error) {      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
    }
  },

  // 跳转到协会详数
      navigateToClub(e) {
    const clubId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/packageClub/club-detail/index?clubId=${clubId}`
    });
  },

  // 跳转到活动详数
      navigateToEvent(e) {
    const eventId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/packageEvent/event-detail/index?eventId=${eventId}`
    });
  },

  // 格式化时数
      formatTime(dateString) {
    if (!dateString) return '';
    
    const now = new Date();
    const date = new Date(dateString);
    const diff = now - date;
    
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    
    if (diff < minute) {
      return '刚刚';
    } else if (diff < hour) {
      return Math.floor(diff / minute) + '分钟';
    } else if (diff < day) {
      return Math.floor(diff / hour) + '小时';
    } else if (diff < 7 * day) {
      return Math.floor(diff / day) + '天前';
    } else {
      return date.toLocaleDateString();
    }
  },

  // 防止事件冒泡的空方法
  noop() {}
  }
});

