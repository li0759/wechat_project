const app = getApp();

/**
 * 协会收支时间线Panel组件
 * 从packageMoney/club-timeline页面转换而来
 */

Component({
  properties: {
    clubId: {
      type: Number,
      value: null
    }
  },

  data: {
    // 控制面板相关
    activeTab: 0,                              // 当前选中的标签页索引
    
    // 数据相关
    timeline: [],                              // 时间线数据（仅用于列表视图）
    listDisplayYear: null,                     // 列表视图当前显示年份
    listDisplayMonth: null,                    // 列表视图当前显示月份
    calendarEventData: {},                     // 日历事件原始数据 {year-month: events}
    calendarEvents: [],                        // 日历事件展示数据
    
    // URL和请求相关
    clubName: '',                              // 俱乐部名称
    
    // 年月信息
    currentYear: new Date().getFullYear(),     // 当前年份
    currentMonth: new Date().getMonth() + 1,   // 当前月份
    currentDisplayYear: new Date().getFullYear(), // 显示的年份（日历视图）
    currentDisplayMonth: new Date().getMonth() + 1, // 显示的月份（日历视图）
    
    // 加载状态
    isLoading: false,                          // 是否正在加载数据
    hasMore: true,                             // 是否还有更多数据
    
    // 分页相关
    currentPage: 1,                            // 当前页码
    totalPages: 1,                             // 总页数
    
    // 月份选择器
    monthPickerVisible: false,
    monthPickerDate: new Date().getTime(),
    minDate: new Date(2020, 0, 1).getTime(),
    maxDate: new Date(new Date().getFullYear() + 1, 11, 31).getTime(),
    
    // 用户信息
    userInfo: null,                            // 用户信息
    token: '',                                 // 用户令牌
    userID: '',                                // 用户ID
    
    // 收款详情弹窗状态
    payDetailsDialogVisible: false,
    currentPayGroup: null,
    currentPayGroupDetails: [],

    // 创建支出弹窗相关
    showCreateClubfeePopup: false,
    clubfeeForm: {
      feement: '',
      description: '',
      createDate: null
    },
    clubfeeSubmitting: false,
    showClubfeeDatetimePicker: false,
    clubfeeCurrentDate: new Date().getTime(),
    clubfeeMinDate: new Date(2020, 0, 1).getTime(),
    clubfeeMaxDate: new Date(2030, 11, 31).getTime(),
    clubfeeFormattedDate: '',

    // 创建收款弹窗相关
    showCreatePaymentPopup: false,
    paymentForm: {
      total_fee: '',
      description: '',
      createDate: ''
    },
    paymentSubmitting: false,
    paymentCalendarShow: false,
    paymentSelectedDateRange: [
      new Date(new Date().setDate(1)).toISOString().split('T')[0], // 月初
      new Date().toISOString().split('T')[0] // 今天
    ],
    paymentFeeList: [],
    paymentMinDate: new Date(2020, 0, 1).getTime(),
    paymentMaxDate: new Date().getTime(),
    paymentDefaultDate: [
      new Date(new Date().setDate(1)).getTime(),
      new Date().getTime()
    ],
    paymentTotalExpense: 0, // 总支出金额

    // 编辑支出相关数据
    showEditClubfeePopup: false,
    editClubfeeForm: {
      id: '',
      feement: '',
      description: ''
    },
    editClubfeeSubmitting: false,

    // 收款日历相关
    paymentCalendarType: 'range', // 默认为范围选择
    paymentCalendarMinDate: new Date().getTime(),
    paymentCalendarValue: '',
    paymentCalendarFormatter: '',
    paymentDatetimeShow: false,
    paymentDatetimeValue: '',
    paymentDatetimeMinDate: new Date().getTime(),
    createPaymentForm: {
      amount: '',
      description: '',
      time_range: ''
    },
  },

  lifetimes: {
    attached() {
      // 组件初始化
    const userInfo = wx.getStorageSync('userInfo');
      const token = wx.getStorageSync('token');
      const userID = wx.getStorageSync('userId');
      
      this.setData({
        userInfo: userInfo,
        token: token,
        userID: userID
      });
    }
  },

  methods: {
    /**
     * 供外部调用的数据加载方法
     */
    loadData() {
      if (this.properties.clubId) {
        // 获取协会信息
    this.fetchClubInfo();
        
        // 加载初始数据
    this.initData();
        
        // 触发loaded事件
    this.triggerEvent('loaded');
      } else {
        this.triggerEvent('loaded');
      }
    },

  /**
   * 初始化数据
   */
  initData: function() {
    wx.showLoading({ title: '加载中...' });
    
    // 并行加载日历和列表数据
    Promise.all([
      // 日历数据 - 当前月份（即使没有数据也要加载）
    this.loadEventsForCalendar(this.data.currentYear, this.data.currentMonth),
      // 列表数据 - 使用分页方式获取第1页数据
    this.loadInitialTimelineData()
    ]).finally(() => {
      wx.hideLoading();
    });
  },

  /**
   * 加载初始时间线数据
   * 加载第1页的数据
   */
  loadInitialTimelineData: function() {
    this.setData({ 
      isLoading: true,
      currentPage: 1
    });
    
    // 使用分页API获取第1页数据
    const requestUrl = `/money/timeline_for_club/${this.properties.clubId}/list?mode=by_page&page=1`;
    return this.request({
      url: requestUrl,
      method: 'GET'
    }).then(res => {
      if (res.Flag === '4000') {
        const events = res.data && res.data.records ? res.data.records : [];
        const totalPages = res.data ? res.data.total_pages : 1;
        const currentPage = res.data ? res.data.current_page : 1;
        
        // 处理数据并显示
    if (events.length > 0) {
          // 处理数据
    const processedEvents = this.processTimelineData(events);
          
          // 设置时间线数据
    this.setData({
            timeline: processedEvents,
            hasMore: currentPage < totalPages,
            totalPages: totalPages,
            currentPage: currentPage
          })
          this.updateTopVisibleItemDate();        
          return true;
        } else {

          this.setData({ 
            timeline: [],
            hasMore: false,
            totalPages: 1,
            currentPage: 1
          });
          wx.showToast({
            title: '暂无收支记录',
            icon: 'none'
          });
          return false;
        }
      } else {
        wx.showToast({ 
          title: res.message || '获取时间线数据失败', 
          icon: 'none' 
        });
        return false;
      }
    }).catch(error => {
      wx.showToast({ 
        title: typeof error === 'string' ? error : (error.message || '请求失败'), 
        icon: 'none' 
      });
      return false;
    }).finally(() => {
      this.setData({ isLoading: false });
    });
  },

  /**
   * 显示创建支出弹窗
   */
  navigateToCreateClubfee: function() {
    // 初始化支出表单数据
    const now = new Date();
    const dateString = now.toISOString();
    const formattedDate = this.formatClubfeeDate(dateString);
    
    this.setData({
      showCreateClubfeePopup: true,
      'clubfeeForm.feement': '',
      'clubfeeForm.description': '',
      'clubfeeForm.createDate': dateString,
      clubfeeFormattedDate: formattedDate,
      clubfeeCurrentDate: now.getTime(),
      clubfeeSubmitting: false
    });
  },

  /**
   * 显示创建收款弹窗
   */
  navigateToCreatePayment: function() {
    // 初始化收款表单数据
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    this.setData({
      showCreatePaymentPopup: true,
      'paymentForm.total_fee': '',
      'paymentForm.description': '',
      'paymentForm.createDate': now.toISOString().split('T')[0],
      paymentSelectedDateRange: [
        monthStart.toISOString().split('T')[0],
        now.toISOString().split('T')[0]
      ],
      paymentDefaultDate: [
        monthStart.getTime(),
        now.getTime()
      ],
      paymentSubmitting: false,
      paymentFeeList: []
    }, () => {
      // 加载支出列表
    this.fetchPaymentFeeList();
    });
  },

  /**
   * 请求指定年月的时间线数据
   */
  requestTimelineByMonth: function(year, month) {
    this.setData({ isLoading: true });
    
    const requestUrl = `/money/timeline_for_club/${this.properties.clubId}/list?mode=by_month&year=${year}&month=${month}`;

    return this.request({
      url: requestUrl,
      method: 'GET'
    }).then(res => {
      if (res.Flag === '4000') {
        // 返回时间线数据
    const events = res.data.records;
        return events;
      } else {
        wx.showToast({ 
          title: res.message || '获取时间线数据失败', 
          icon: 'none' 
        });
        return [];
      }
    }).catch(error => {
      wx.showToast({ 
        title: typeof error === 'string' ? error : (error.message || '请求失败'), 
        icon: 'none' 
      });
      return [];
    }).finally(() => {
      this.setData({ isLoading: false });
    });
  },

  /**
   * 处理时间线数据
   */
  processTimelineData: function(events) {
      // 对每个事件进行处理
    const result = events.map(item => {
      item.ori_create_date = item.create_date;
      item.create_date = app.formatDateTime(item.create_date);
      // 如果格式化失败，保持原样
      item.create_date = item.create_date || new Date().toISOString();       
      return item;

    });
    
    // 按日期降序排序（最新的在前）
    const sortedResult = result.sort((a, b) => {
        return new Date(b.create_date) - new Date(a.create_date);
    });   
    return sortedResult;
  },
  
  /**
   * 加载日历事件数据
   */
  loadEventsForCalendar: function(year, month) {
    // 生成缓存键
    const key = `${year}-${month}`;
    
    // 更新日历当前显示年月
    this.setData({
      currentDisplayYear: year,
      currentDisplayMonth: month
    });
    
    // 如果有缓存，直接使用缓存数据
    if (this.data.calendarEventData[key]) {
      this.updateCalendarEvents(this.data.calendarEventData[key]);
      return Promise.resolve();
    }
    
    // 没有缓存，请求新数据
    return this.requestTimelineByMonth(year, month).then(events => {
      const processedEvents = this.processTimelineData(events);
      
      // 更新缓存
    const updatedEventData = {...this.data.calendarEventData};
      updatedEventData[key] = processedEvents;
      
      this.setData({
        calendarEventData: updatedEventData
      });
      
      // 更新日历事件显示
    this.updateCalendarEvents(processedEvents);
    });
  },
  
  /**
   * 更新日历事件显示
   */
  updateCalendarEvents: function(events) {
    const calendarEvents = events.map(item => {
      // 解析日期时间，获取时间戳
    let dateStr = item.create_date;
      let timestamp;     

      // 尝试解析日期字符串
    const date = new Date(dateStr);
      
      if (!isNaN(date.getTime())) {
        timestamp = date.getTime();
      } else {
        timestamp = new Date().getTime(); // 默认使用当前时间
  }
     
      // 提取日期和月份用于显示
    const dateObj = new Date(timestamp);
      const day = dateObj.getDate();
      const month = dateObj.getMonth() + 1;
      
      // 构建日历事件对象
    let eventObj = {
        active_time: timestamp,
        active_title: '',
        active_url: '', // 可选
        url: '', // 可选
        day,      // 日期（日）
        month     // 月份
  };
      
      // 根据事件类型设置相应的标题和属性
    if (item.type === 'pay_group') {
        // 收入项目
        eventObj.active_title = `收入: ${item.description}`;
        if (item.paid !== undefined) {
          eventObj.active_title += ` (已收¥${item.paid})`;
        }
      } else if (item.type === 'club_fee') {
        // 自定义支出
        eventObj.active_title = `支出: ${item.description}`;
        if (item.feement !== undefined) {
          eventObj.active_title += ` (¥${item.feement})`;
        }
      } else if (item.type === 'event_real_cost') {
        // 活动支出
        eventObj.active_title = `活动: ${item.title}`;
        if (item.real_cost !== undefined) {
          eventObj.active_title += ` (¥${item.real_cost})`;
        }
        
        // 设置封面图(如果有)
    if (item.cover) {
          eventObj.active_url = item.cover;
        }
        
        // 设置活动详情页面URL
        eventObj.url = `/pages/event/event-detail/index?eventId=${item.id}`;
      }
      
      return eventObj;
    });
    
    this.setData({ calendarEvents });
  },
  
  /**
   * 强制刷新日历数据
   */
  forceRefreshCalendar: function() {
    // 清除当前显示月份的缓存，强制重新加载
    const key = `${this.data.currentDisplayYear}-${this.data.currentDisplayMonth}`;
    const updatedEventData = {...this.data.calendarEventData};
    delete updatedEventData[key];
    
    this.setData({
      calendarEventData: updatedEventData
    });
    
    // 重新加载当前显示月份的数据
    return this.loadEventsForCalendar(
      this.data.currentDisplayYear, 
      this.data.currentDisplayMonth
    );
  },


  

  
  /**
   * Tab切换事件处理
   */
  onTabChange: function(event) {
    const activeTab = event.detail.index;
    this.setData({ activeTab });
    
    // 切换Tab时不自动加载数据，保持各自的状态
  },

  /**
   * 日历月份变化事件处理（仅影响日历视图）
   */
  onCalendarMonthChange: function(e) {
    const { year, month } = e.detail;
    
    // 加载新月份的数据
    this.loadEventsForCalendar(year, month);
  },
  

  /**
   * 点击加载更多按钮
   */
  onLoadMoreClick: function() {
    // 防止重复加载或无数据可加载
    if (this.data.isLoading || !this.data.hasMore) return;
    
    // 计算下一页
    const nextPage = this.data.currentPage + 1;
    
    // 检查是否超出总页数
    if (nextPage > this.data.totalPages) {
      this.setData({ hasMore: false });
      wx.showToast({
        title: '没有更多数据了',
        icon: 'none',
        duration: 1500
      });
      return;
    }
    
    // 加载下一页的数据
    this.loadMoreData(nextPage);
  },
  
  /**
   * 加载更多数据
   */
  loadMoreData: function(page) {
    if (this.data.isLoading) return;
    
    this.setData({ isLoading: true });
    
    // 请求指定页码的数据
    const requestUrl = `/money/timeline_for_club/${this.properties.clubId}/list?mode=by_page&page=${page}`;
    
    this.request({
      url: requestUrl,
      method: 'GET'
    }).then(res => {
      if (res.Flag === '4000') {
        const events = res.data && res.data.records ? res.data.records : [];
        const totalPages = res.data ? res.data.total_pages : this.data.totalPages;
        const currentPage = res.data ? res.data.current_page : page;
        
        if (events && events.length > 0) {
          // 处理新数据
    const processedEvents = this.processTimelineData(events);
          
          // 将新数据追加到现有数据后
    this.setData({
            timeline: [...this.data.timeline, ...processedEvents],
            hasMore: currentPage < totalPages,
            totalPages: totalPages,
            currentPage: currentPage
          });
          
          wx.showToast({
            title: `已加载${events.length}条记录`,
            icon: 'none'
          });
        } else {
          // 没有更多数据
    this.setData({ 
            hasMore: false,
            currentPage: currentPage,
            totalPages: totalPages
          });
          wx.showToast({
            title: '没有更多数据了',
            icon: 'none',
            duration: 1500
          });
        }
      } else {
        wx.showToast({
          title: res.message || '加载更多数据失败',
          icon: 'none'
        });
      }
    }).catch(error => {
      wx.showToast({
        title: '加载更多数据失败，请重试',
        icon: 'none'
      });
    }).finally(() => {
      this.setData({ isLoading: false });
    });
  },

  /**
   * 获取协会信息
   */
  fetchClubInfo: function() {
    this.request({
      url: `/club/${this.properties.clubId}`,
      method: 'GET',
    }).then(res => {
      if (res.Flag == 4000) {
        this.setData({ 
          clubName: res.data.name || '协会收支'
        });
      } else {
        wx.showToast({
          title: res.message || '获取协会信息失败',
          icon: 'none'
        });
      }
    }).catch(err => {
      wx.showToast({
        title: '网络错误，请重试',
        icon: 'none'
      });
    });
  },
  
  /**
   * 显示月份选择器
   */
  showMonthPicker: function() {
    // 根据当前标签页设置日期选择器的初始值
    let year, month;
    
    if (this.data.activeTab === 0 && this.data.listDisplayYear && this.data.listDisplayMonth) {
      // 列表视图：使用当前显示的年月
      year = this.data.listDisplayYear;
      month = this.data.listDisplayMonth;
    } else {
      // 日历视图或列表视图无数据：使用当前显示年月
      year = this.data.currentDisplayYear;
      month = this.data.currentDisplayMonth;
    }
    
    const date = new Date(year, month - 1, 1).getTime();
    
    this.setData({
      monthPickerDate: date,
      monthPickerVisible: true
    });
  },
  
  /**
   * 关闭月份选择器
   */
  closeMonthPicker: function() {
    this.setData({
      monthPickerVisible: false
    });
  },
  
  /**
   * 确认月份选择
   */
  confirmMonthPicker: function(e) {
    const date = new Date(e.detail);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript月份从0开始
    this.setData({
      monthPickerVisible: false
    });
    
    if (this.data.activeTab === 0) {
      // 列表视图：不再支持按月份加载，直接重置为第1页
    this.loadInitialTimelineData();
    } else if (this.data.activeTab === 1) {
      // 日历视图：更新当前年月并加载数据
    this.setData({
        currentYear: year,
        currentMonth: month
      });
      this.loadEventsForCalendar(year, month);
    }
  },
  
 

  /**
   * 显示收款详情弹窗
   */
  showPayDetails: function(e) {
    const index = e.currentTarget.dataset.index;
    const payGroup = this.data.timeline[index];
    
    if (!payGroup || payGroup.type !== 'pay_group') {
      return wx.showToast({
        title: '未找到收款数据',
        icon: 'none'
      });
    }
    
    this.setData({
      currentPayGroup: payGroup,
      currentPayGroupDetails: payGroup.details || [],
      payDetailsDialogVisible: true
    });
  },
  
  /**
   * 关闭收款详情弹窗
   */
  closePayDetails: function() {
    this.setData({
      payDetailsDialogVisible: false,
      currentPayGroup: null,
      currentPayGroupDetails: []
    });
  },

  /**
   * 处理时间线滚动事件，更新顶部年月显示
   */
  onTimelineScroll: function(e) {

    this.updateTopVisibleItemDate();
  },
  
  /**
   * 更新顶部可见记录的日期显示
   * 根据当前可见的最上方记录来设置显示的年月
   */
  updateTopVisibleItemDate: function() {
    // 获取所有时间线项目 - 在组件中需要使用 in(this)
    const query = wx.createSelectorQuery().in(this);
    query.selectAll('.timeline-item').boundingClientRect();
    query.exec(res => {
      if (!res || !res[0] || res[0].length === 0) {
        return;
      }
      
      // 找到第一个完全可见的项目
    const visibleItems = res[0];
      const headerHeight = 200; // 估计的头部高度
      
      // 查找第一个可见的项目
    let firstVisibleItem = null;
      for (let i = 0; i < visibleItems.length; i++) {
        const item = visibleItems[i];
        // 项目顶部位置在视图区域内
    if (item.top >= 0 && item.top <= headerHeight) {
          firstVisibleItem = item;
          break;
        }
      }
      
      // 如果没有找到第一个可见项目，使用第一个项目
    if (!firstVisibleItem && visibleItems.length > 0) {
        firstVisibleItem = visibleItems[0];
      }
      
      if (firstVisibleItem) {
        const index = firstVisibleItem.dataset.index;
        if (index !== undefined && this.data.timeline[index]) {
          const item = this.data.timeline[index];
          
          if (item && item.ori_create_date) {
            // 从日期中提取年月
    const date = new Date(item.ori_create_date);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            
            // 更新显示年月（只有变化时才更新）
    if (year !== this.data.listDisplayYear || month !== this.data.listDisplayMonth) {
              this.setData({
                listDisplayYear: year,
                listDisplayMonth: month
              });
            }
          }
        }
      }
    });
  },

  /**
   * 删除自定义支出
   */
  deleteClubFee: function(e) {
    const feeId = e.currentTarget.dataset.feeId;
    // 显示确认对话框
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条支出记录吗？删除后无法恢复。',
      confirmText: '删除',
      confirmColor: '#ff4444',
      success: (res) => {
        if (res.confirm) {
          // 用户确认删除
    this.performDeleteClubFee(feeId);
        }
      }
    });
  },

  /**
   * 执行删除自定义支出操作
   */
  performDeleteClubFee: function(feeId) {
    wx.showLoading({ title: '删除中...' });
    
    // 调用删除API
    this.request({
      url: `/money/clubfee/${feeId}/delete`,
      method: 'GET'
    }).then(res => {
      wx.hideLoading();
      
      if (res.Flag === '4000') {
        wx.showToast({
          title: '删除成功',
          icon: 'success'
        });
        
        // 删除成功后，从本地数据中移除该项并重新渲染
    const updatedTimeline = this.data.timeline.filter(item => {
          return !(item.type === 'club_fee' && item.id === feeId);
        });
        
        this.setData({
          timeline: updatedTimeline
        });
        
        // 更新日历数据
    this.refreshCalendarData();
        
      } else {
        wx.showToast({
          title: res.message || '删除失败',
          icon: 'none'
        });
      }
    }).catch(error => {
      wx.hideLoading();
      wx.showToast({
        title: '删除失败，请稍后重试',
        icon: 'none'
      });
    });
  },

  /**
   * 刷新日历数据
   */
  refreshCalendarData: function() {
    // 重新加载当前显示月份的日历数据
    const year = this.data.currentDisplayYear || this.data.currentYear;
    const month = this.data.currentDisplayMonth || this.data.currentMonth;
    this.loadEventsForCalendar(year, month);
  },

  // =================== 创建支出弹窗相关方法 ===================

  /**
   * 关闭创建支出弹窗
   */
  closeCreateClubfeePopup: function() {
    this.setData({
      showCreateClubfeePopup: false,
      showClubfeeDatetimePicker: false
    });
  },

  /**
   * 支出表单输入变化
   */
  onClubfeeInputChange: function(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail;
    this.setData({
      [`clubfeeForm.${field}`]: value
    });
  },

  /**
   * 显示支出日期时间选择器
   */
  showClubfeeDatetimePicker: function() {
    this.setData({
      showClubfeeDatetimePicker: true
    });
  },

  /**
   * 支出日期时间选择器确认
   */
  onClubfeeDateTimeConfirm: function(event) {
    const date = new Date(event.detail);
    const dateString = date.toISOString();
    const formattedDate = this.formatClubfeeDate(dateString);
    
    this.setData({
      'clubfeeForm.createDate': dateString,
      clubfeeFormattedDate: formattedDate,
      showClubfeeDatetimePicker: false
    });
  },

  /**
   * 支出日期时间选择器取消
   */
  onClubfeeDateTimeCancel: function() {
    this.setData({
      showClubfeeDatetimePicker: false
    });
  },

  /**
   * 格式化支出日期显示
   */
  formatClubfeeDate: function(dateString) {
    if (!dateString) return '请选择日期时间';
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },

  /**
   * 验证支出表单
   */
  validateClubfeeForm: function() {
    const { feement, description, createDate } = this.data.clubfeeForm;
    
    if (!feement || feement <= 0) {
      wx.showToast({
        title: '请输入有效的支出金额',
        icon: 'none'
      });
      return false;
    }
    
    if (!description || description.trim() === '') {
      wx.showToast({
        title: '请输入支出描述',
        icon: 'none'
      });
      return false;
    }
    
    if (!createDate) {
      wx.showToast({
        title: '请选择支出时间',
        icon: 'none'
      });
      return false;
    }
    
    return true;
  },

  /**
   * 提交创建支出
   */
  confirmCreateClubfee: function() {
    if (!this.validateClubfeeForm()) return;
    
    this.setData({ clubfeeSubmitting: true });
    
    const feeData = {
      feement: parseFloat(this.data.clubfeeForm.feement),
      description: this.data.clubfeeForm.description,
      createDate: this.data.clubfeeForm.createDate
    };
    
    this.request({
      url: `/money/clubfee/${this.properties.clubId}/create`,
      method: 'PUT',
      data: feeData
    }).then(res => {
      if (res.Flag === '4000') {
        wx.showToast({
          title: '创建支出成功',
          icon: 'success'
        });
        
        // 关闭弹窗
    this.closeCreateClubfeePopup();
        
        // 刷新时间轴数据
    this.loadInitialTimelineData();
        
        // 刷新日历数据
    this.refreshCalendarData();
        
      } else {
        wx.showToast({
          title: res.message || '创建支出失败',
          icon: 'none'
        });
      }
    }).catch(error => {
      wx.showToast({
        title: '创建支出失败，请重试',
        icon: 'none'
      });
    }).finally(() => {
      this.setData({ clubfeeSubmitting: false });
    });
  },

  // =================== 创建收款弹窗相关方法 ===================

  /**
   * 关闭创建收款弹窗
   */
  closeCreatePaymentPopup: function() {
    this.setData({
      showCreatePaymentPopup: false,
      paymentCalendarShow: false
    });
  },

  /**
   * 收款表单输入变化
   */
  onPaymentInputChange: function(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail;
    this.setData({
      [`paymentForm.${field}`]: value
    });
  },

  /**
   * 收款日期选择变化
   */
  onPaymentDateChange: function(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`paymentForm.${field}`]: value
    });
  },

  /**
   * 显示收款日历
   */
  showPaymentCalendar() {
    this.setData({
      paymentCalendarShow: true
    });
  },

  // 收款日历关闭
  onPaymentCalendarClose() {
    this.setData({
      paymentCalendarShow: false
    });
  },

  // 收款日历确认选择
  onPaymentCalendarConfirm(e) {
    const [start, end] = e.detail;
    const startDate = this.formatDate(start);
    const endDate = this.formatDate(end);
    
    this.setData({
      paymentCalendarShow: false,
      paymentSelectedDateRange: [startDate, endDate]
    });
    
    // 根据选择的日期范围加载支出数据
    this.fetchPaymentFeeList();
  },

  /**
   * 获取收款弹窗的支出列表
   */
  fetchPaymentFeeList: function() {
    if (!this.properties.clubId || !this.data.paymentSelectedDateRange[0] || !this.data.paymentSelectedDateRange[1]) {
      return;
    }

    const startDate = this.data.paymentSelectedDateRange[0];
    const endDate = this.data.paymentSelectedDateRange[1];
    
    wx.showLoading({ title: '加载支出列表...' });
    
    this.request({
      url: `/money/clubfee/${this.properties.clubId}/list/${startDate}/${endDate}`,
      method: 'GET'
    }).then(res => {
      if (res.Flag === '4000') {
        const feeList = res.data.expense_list || [];
        // 计算总支出
    const totalExpense = feeList.reduce((sum, item) => {
          return sum + (parseFloat(item.feement) || 0);
        }, 0);
        
        this.setData({
          paymentFeeList: feeList,
          paymentTotalExpense: totalExpense.toFixed(2)
        });
      } else {
        this.setData({
          paymentFeeList: [],
          paymentTotalExpense: 0
        });
      }
    }).catch(error => {
      wx.showToast({
        title: '获取支出列表失败',
        icon: 'none'
      });
    }).finally(() => {
      wx.hideLoading();
    });
  },

  /**
   * 验证收款表单
   */
  validatePaymentForm: function() {
    const { total_fee, description, createDate } = this.data.paymentForm;
    
    if (!total_fee) {
      wx.showToast({
        title: '请输入收款金额',
        icon: 'none'
      });
      return false;
    }
    
    if (isNaN(parseFloat(total_fee)) || parseFloat(total_fee) <= 0) {
      wx.showToast({
        title: '收款金额必须大于0',
        icon: 'none'
      });
      return false;
    }
    
    if (!description || description.trim() === '') {
      wx.showToast({
        title: '请输入收款说明',
        icon: 'none'
      });
      return false;
    }
    
    if (!createDate) {
      wx.showToast({
        title: '请选择收款日期',
        icon: 'none'
      });
      return false;
    }
    
    return true;
  },

  /**
   * 提交创建收款
   */
  confirmCreatePayment: function() {
    if (!this.validatePaymentForm()) return;
    
    this.setData({ paymentSubmitting: true });
    
    const paymentData = {
      total_fee: parseFloat(this.data.paymentForm.total_fee),
      description: this.data.paymentForm.description,
      createDate: this.data.paymentForm.createDate
    };
    
    this.request({
      url: `/money/paygroup/create/for_club/${this.properties.clubId}`,
      method: 'PUT',
      data: paymentData
    }).then(async (res) => {
      if (res.Flag === '4000') {
        // 发送通知给所有协会成员
        try {
          const message_data = {
            club_id: this.properties.clubId,
            url: `/packageMoney/paypersonal/index?clubId=${this.properties.clubId}`,
            operation: 'club_expense_created',
            text: `${this.data.clubName}协会产生新的支出：${paymentData.description}，人均支付：¥${res.data.per_payment}，请查看个人缴费页面`
          };
          
          await app.message_for_club(message_data);
        } catch (error) {
        }
        
        // 显示成功提示
        wx.showModal({
          title: '创建成功',
          content: `成功创建群收款，人均支付金额: ${res.data.per_payment} 元`,
          showCancel: false,
          success: () => {
            // 关闭弹窗
    this.closeCreatePaymentPopup();
            
            // 刷新时间轴数据
    this.loadInitialTimelineData();
            
            // 刷新日历数据
    this.refreshCalendarData();
          }
        });
        
      } else {
        wx.showToast({
          title: res.message || '创建收款失败',
          icon: 'none'
        });
      }
    }).catch(error => {
      wx.showToast({
        title: '创建收款失败，请重试',
        icon: 'none'
      });
    }).finally(() => {
      this.setData({ paymentSubmitting: false });
    });
  },

  /**
   * 封装请求方法
   */
  request: function(options) {
    return new Promise((resolve, reject) => {
      const url = app.globalData.request_url + options.url;
      
      wx.request({
        url: url,
        method: options.method || 'GET',
        header: options.header || {
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

  /**
   * 格式化日期为 YYYY-MM-DD 格式
   */
  formatDate: function(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 编辑支出相关方法
  // 编辑支出
  editClubFee(e) {
    const { feeId, feement, description } = e.currentTarget.dataset;
    
    const formData = {
      id: feeId,
      feement: feement ? feement.toString() : '',
      description: description ? description.toString() : ''
    };
    
    this.setData({
      editClubfeeForm: formData,
      showEditClubfeePopup: true
    });
  },

  // 关闭编辑支出弹窗
  closeEditClubfeePopup() {
    this.setData({
      showEditClubfeePopup: false,
      editClubfeeForm: {
        id: '',
        feement: '',
        description: ''
      }
    });
  },

  // 编辑支出表单输入处理
  onEditClubfeeInputChange(e) {
    const { field } = e.currentTarget.dataset;
    // van-field 的 input 事件中，值在 e.detail.value 中
    const value = e.detail.value || e.detail || '';
    
    this.setData({
      [`editClubfeeForm.${field}`]: value
    });
    
    // 打印更新后的表单数据
  },

  // 确认编辑支出
  async confirmEditClubfee() {
    const { editClubfeeForm } = this.data;
    
    console.log('编辑支出表单数据:', editClubfeeForm);
    
    // 表单验证 - 修正字符串检查逻辑
    if (!editClubfeeForm.feement || editClubfeeForm.feement.toString().trim() === '') {
      wx.showToast({
        title: '请输入支出金额',
        icon: 'none'
      });
      return;
    }

    if (!editClubfeeForm.description || editClubfeeForm.description.toString().trim() === '') {
      wx.showToast({
        title: '请输入支出描述',
        icon: 'none'
      });
      return;
    }

    // 验证金额格式
    const amount = parseFloat(editClubfeeForm.feement);
    if (isNaN(amount) || amount <= 0) {
      wx.showToast({
        title: '请输入有效的金额',
        icon: 'none'
      });
      return;
    }

    this.setData({ editClubfeeSubmitting: true });

    try {
      const result = await this.request({
        url: `/money/clubfee/${editClubfeeForm.id}/update`,
        method: 'POST',
        data: {
          feement: amount,
          description: editClubfeeForm.description.toString().trim()
        }
      });

      if (result.Flag === '4000') {
        wx.showToast({
          title: '修改成功',
          icon: 'success'
        });

        // 关闭弹窗
    this.closeEditClubfeePopup();
        
        // 刷新数据
    this.loadInitialTimelineData();
        this.refreshCalendarData();
      } else {
        throw new Error(result.message || '修改失败');
      }
    } catch (error) {
      wx.showToast({
        title: error.message || '修改失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ editClubfeeSubmitting: false });
    }
  },

  /**
   * 选择支出类型（创建支出）
   */
  selectExpenseType: function(e) {
    const type = e.currentTarget.dataset.type;
    
    this.setData({
      'clubfeeForm.description': type
    });
  },

  /**
   * 选择支出类型（编辑支出）
   */
  selectEditExpenseType: function(e) {
    const type = e.currentTarget.dataset.type;
    
    this.setData({
      'editClubfeeForm.description': type
    });
  }
  }
}); 