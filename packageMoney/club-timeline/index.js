const app = getApp();

Page({
  /**
   * 页面的初始数据
   */
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
    clubId: null,                              // 俱乐部ID
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
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function(options) {
    // 检查登录状态
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo) {
      return wx.navigateTo({ url: '/pages/login/index' });
    }
    
    // 初始化用户数据
    this.setData({
      userInfo: userInfo,
      token: wx.getStorageSync('token'),
      userID: wx.getStorageSync('userId')
    });
    
    // 从路由参数中获取clubId
    if (options.clubId) {
      this.setData({
        clubId: parseInt(options.clubId)
      }, () => {      
        // 获取协会信息
        this.fetchClubInfo();
        
        // 加载初始数据
        this.initData();
      });
    } else {
      // 没有传入协会ID，提示错误并返回
      wx.showToast({
        title: '缺少协会信息',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
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
    const requestUrl = `/money/timeline_for_club/${this.data.clubId}/list?mode=by_page&page=1`;
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
        console.log('请求错误:', res.message);
        wx.showToast({ 
          title: res.message || '获取时间线数据失败', 
          icon: 'none' 
        });
        return false;
      }
    }).catch(error => {
      console.error('请求异常:', error);
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
   * 导航到创建支出页面
   */
  navigateToCreateClubfee: function() {
    wx.navigateTo({
      url: `/packageMoney/create-clubfee/index?clubId=${this.data.clubId}`
    });
  },

  /**
   * 导航到创建收款页面
   */
  navigateToCreatePayment: function() {
    wx.navigateTo({
      url: `/packageMoney/create-payment/index?clubId=${this.data.clubId}`
    });
  },

  /**
   * 请求指定年月的时间线数据
   */
  requestTimelineByMonth: function(year, month) {
    this.setData({ isLoading: true });
    
    const requestUrl = `/money/timeline_for_club/${this.data.clubId}/list?mode=by_month&year=${year}&month=${month}`;

    return this.request({
      url: requestUrl,
      method: 'GET'
    }).then(res => {
      if (res.Flag === '4000') {
        // 返回时间线数据
        const events = res.data.records;
        return events;
      } else {
        console.log('请求错误:', res.message);
        wx.showToast({ 
          title: res.message || '获取时间线数据失败', 
          icon: 'none' 
        });
        return [];
      }
    }).catch(error => {
      console.error('请求异常:', error);
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
   * 生命周期函数--监听页面显示
   */
  onShow: function() {
    // 设置底部标签栏（如果有）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().init();
    }
    
    // 根据当前Tab刷新数据（从其他页面返回时可能有数据更新）
    if (this.data.activeTab === 0) {
      // 列表视图：重新加载初始数据
      this.loadInitialTimelineData();
    } else if (this.data.activeTab === 1) {
      // 日历视图：强制刷新当前年月数据
      this.forceRefreshCalendar();
    }
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
    const requestUrl = `/money/timeline_for_club/${this.data.clubId}/list?mode=by_page&page=${page}`;
    console.log(`请求数据：第${page}页`, requestUrl);
    
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
        console.error('请求错误:', res.message);
        wx.showToast({
          title: res.message || '加载更多数据失败',
          icon: 'none'
        });
      }
    }).catch(error => {
      console.error('加载更多数据出错:', error);
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
      url: `/club/${this.data.clubId}`,
      method: 'GET',
    }).then(res => {
      if (res.Flag == 4000) {
        this.setData({ 
          clubName: res.data.name || '协会收支'
        });
        
        // 更新导航栏标题
        wx.setNavigationBarTitle({
          title: this.data.clubName + '收支'
        });
      } else {
        wx.showToast({
          title: res.message || '获取协会信息失败',
          icon: 'none'
        });
      }
    }).catch(err => {
      console.error('获取协会信息出错:', err);
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
   * 加载指定月份的列表数据
   * 注意: 这个方法保留但不再使用，因为列表视图现在使用分页加载
   */
  loadListDataForMonth: function(year, month) {
    // 将功能重定向到加载初始页数据
    this.loadInitialTimelineData();
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
    // 获取所有时间线项目
    const query = wx.createSelectorQuery();
    query.selectAll('.timeline-item').boundingClientRect();
    query.exec(res => {
      if (!res || !res[0] || res[0].length === 0) {
        console.log('没有找到时间线项目');
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
}); 