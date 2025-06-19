const app = getApp();

Page({
  /**
   * 页面的初始数据
   */
  data: {
    // 控制面板相关
    activeTab: 0,                              // 当前选中的标签页索引
    
    // 数据相关
    eventList: [],                              // 活动列表数据（仅用于列表视图）
    listDisplayYear: null,                     // 列表视图当前显示年份
    listDisplayMonth: null,                    // 列表视图当前显示月份
    calendarEventData: {},                     // 日历事件原始数据 {year-month: events}
    calendarEvents: [],                        // 日历事件展示数据
    
    // URL和请求相关
    baseUrl: '',                               // 基础URL（从options获取）
    
    // 年月信息
    currentYear: new Date().getFullYear(),     // 当前年份
    currentMonth: new Date().getMonth() + 1,   // 当前月份
    currentDisplayYear: new Date().getFullYear(), // 显示的年份（日历视图）
    currentDisplayMonth: new Date().getMonth() + 1, // 显示的月份（日历视图）
    
    // 日期选择器相关
    minDate: new Date(2020, 0, 1).getTime(),   // 最小可选日期
    maxDate: new Date(new Date().getFullYear() + 1, 11, 31).getTime(), // 最大可选日期
    monthPickerVisible: false,                 // 月份选择器显示状态
    monthPickerDate: new Date().getTime(),     // 月份选择器当前值
    
    // 加载状态
    isLoading: false,                          // 是否正在加载数据
    hasMore: true,                             // 是否还有更多数据
    
    // 分页相关
    currentPage: 1,                            // 当前页码
    totalPages: 1,                             // 总页数
    
    // 用户信息
    userInfo: null,                            // 用户信息
    token: '',                                 // 用户令牌
    userID: ''                                 // 用户ID
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
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
    
    // 从路由参数中获取baseUrl
    if (options.url) {
      this.setData({
        baseUrl: options.url
      }, () => {
        // 加载初始数据
        this.initData();
      });
    } else {
      // 没有传入url，提示错误并返回
      wx.showToast({
        title: '缺少URL信息',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  /**
   * 格式化基础URL
   */
  formatBaseUrl: function(url) {
    if (!url) return '';
    url = url.startsWith('/') ? url.substring(1) : url;
    url = url.endsWith('/') ? url.substring(0, url.length - 1) : url;
    return url;
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
   * 加载初始活动列表数据
   * 加载第1页的数据
   */
  loadInitialTimelineData: function() {
    this.setData({ 
      isLoading: true,
      currentPage: 1
    });
    
    // 使用分页API获取第1页数据
    const requestUrl = `${this.data.baseUrl}?mode=page&page=1`;

    return this.request({
      url: requestUrl,
      method: 'GET'
    }).then(res => {
      if (res.Flag === '4000') {
        const events = res.data.records;
        const totalPages = res.data.pagination.total_pages;
        const currentPage = res.data.pagination.current_page;
        
        // 处理数据并显示
        if (events.length > 0) {
          // 处理数据
          const processedEvents = this.processEvents(events);
          
          // 设置活动列表数据
          this.setData({
            eventList: processedEvents,
            hasMore: currentPage < totalPages,
            totalPages: totalPages,
            currentPage: currentPage
          }, () => {
            // 数据设置完成后，延迟更新月份显示，确保DOM渲染完成
            setTimeout(() => {
              this.updateTopVisibleItemDate();
            }, 200);
          });
          
          return true;
        } else {
          this.setData({ 
            eventList: [],
            hasMore: false,
            totalPages: 1,
            currentPage: 1
          });
          wx.showToast({
            title: '暂无活动记录',
            icon: 'none'
          });
          return false;
        }
      } else {
        wx.showToast({ 
          title: res.message || '获取活动列表数据失败', 
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
   * 请求指定年月的活动数据
   */
  requestEventsByMonth: function(year, month) {
    this.setData({ isLoading: true });
    
    const requestUrl = `${this.data.baseUrl}?mode=month&year=${year}&month=${month}`;

    return this.request({
      url: requestUrl,
      method: 'GET'
    }).then(res => {
      if (res.Flag === '4000') {
        // 返回活动数据
        const events = res.data || [];
        return events;
      } else {
        wx.showToast({ 
          title: res.message || '获取活动数据失败', 
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
   * 处理活动数据
   */
  processEvents: function(events) {
    // 对每个事件进行处理
    const result = events.map(event => {

      // 处理封面图片
      const images = event.process_images ? event.process_images.split(';').filter(url => url && url.trim()) : [];
      event.cover_image = images.length > 0 ? images[0] : '';
      
      // 保存原始时间供排序和过滤使用
      event.ori_start_time = event.start_time;
      event.start_time = app.formatDateTime(event.start_time);   
      return event;

    });
    
    // 按日期降序排序（最新的在前）
    const sortedResult = result.sort((a, b) => {
        return new Date(b.ori_start_time) - new Date(a.ori_start_time);
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
    return this.requestEventsByMonth(year, month).then(events => {
      const processedEvents = this.processEvents(events);
      
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
    const calendarEvents = events.map(event => {
      // 解析日期时间，获取时间戳
      let dateStr = event.ori_start_time || event.start_time;
      let timestamp;
      
      try {
        // 尝试解析日期字符串
        const date = new Date(dateStr);
        
        if (!isNaN(date.getTime())) {
          timestamp = date.getTime();
        } else {
          timestamp = new Date().getTime(); // 默认使用当前时间
        }
      } catch (e) {
        timestamp = new Date().getTime(); // 出错时使用当前时间
      }
      
      // 提取日期用于显示（仅日期，不包含月份）
      const dateObj = new Date(timestamp);
      const day = dateObj.getDate();
      
      // 构建日历事件对象
      return {
        active_time: timestamp,
        active_title: event.title,
        active_url: event.cover_image,
        url: `/packageEvent/event-detail/index?eventId=${event.event_id}`,
        day      // 只包含日期，不包含月份
      };
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
   * 下拉刷新
   */
  onPullDownRefresh: function() {
    // 根据当前标签页刷新对应的数据
    if (this.data.activeTab === 0) {
      // 列表视图：刷新最新数据
      this.loadInitialTimelineData();
    } else {
      // 日历视图：刷新当前显示月份数据
      this.forceRefreshCalendar();
    }
    wx.stopPullDownRefresh();
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
   * 日历项点击事件处理
   */
  onCalendarSelect: function(e) {
    // 如果有事件URL，跳转到对应页面
    if (e.detail && e.detail.url) {
      wx.navigateTo({
        url: e.detail.url
      });
    }
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
    const requestUrl = `${this.data.baseUrl}?mode=page&page=${page}`;
    
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
          const processedEvents = this.processEvents(events);
          
          // 将新数据追加到现有数据后
          this.setData({
            eventList: [...this.data.eventList, ...processedEvents],
            hasMore: currentPage < totalPages,
            totalPages: totalPages,
            currentPage: currentPage
          }, () => {
            // 加载更多数据后，延迟更新月份显示
            setTimeout(() => {
              this.updateTopVisibleItemDate();
            }, 100);
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
   * 页面滚动事件（备用方案）
   */
  onPageScroll: function(e) {
    // 只在列表视图时处理
    if (this.data.activeTab === 0) {
      if (this.pageScrollTimer) {
        clearTimeout(this.pageScrollTimer);
      }
      this.pageScrollTimer = setTimeout(() => {
        this.updateTopVisibleItemDate();
      }, 50);
    }
  },
  
  /**
   * 点击活动项跳转到详情页
   */
  onEventTap: function(e) {
    if(e.currentTarget.dataset.user_managed)
      {
        wx.navigateTo({
          url: `/packageEvent/event-manage/index?eventId=${e.currentTarget.dataset.event_id}`
        });
      }
      else
      {
        wx.navigateTo({
          url: `/packageEvent/event-detail/index?eventId=${e.currentTarget.dataset.event_id}`
        });
      }
  },

  /**
   * 处理时间线滚动事件，更新顶部年月显示
   */
  onTimelineScroll: function(e) {
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
    }
    this.scrollTimer = setTimeout(() => {
      this.updateTopVisibleItemDate();
    }, 50);
  },
  
  /**
   * 更新顶部可见记录的日期显示
   */
  updateTopVisibleItemDate: function() {
    // 检查是否在列表视图且有数据
    if (this.data.activeTab !== 0 || !this.data.eventList || this.data.eventList.length === 0) {
      return;
    }
    
    const query = wx.createSelectorQuery();
    query.selectAll('.timeline-item').boundingClientRect();
    query.exec(res => {
      if (!res || !res[0] || res[0].length === 0) return;
      
      const visibleItems = res[0];
      let targetIndex = -1;
      
      // 找到第一个可见的项目
      for (let i = 0; i < visibleItems.length; i++) {
        const item = visibleItems[i];
        if (item.top >= 0 && item.bottom > 100) {
          targetIndex = i;
          break;
        }
      }
      
      // 如果没有找到，使用第一个项目
      if (targetIndex === -1 && visibleItems.length > 0) {
        targetIndex = 0;
      }
      
      if (targetIndex >= 0 && this.data.eventList[targetIndex]) {
        const item = this.data.eventList[targetIndex];
        
        if (item && item.ori_start_time) {
          const date = new Date(item.ori_start_time);
          const year = date.getFullYear();
          const month = date.getMonth() + 1;
          
          // 只有变化时才更新
          if (year !== this.data.listDisplayYear || month !== this.data.listDisplayMonth) {
            this.setData({
              listDisplayYear: year,
              listDisplayMonth: month
            });
          }
        }
      }
    });
  },

  /**
   * 显示月份选择器
   */
  showMonthPicker: function() {
    this.setData({
      monthPickerVisible: true,
      monthPickerDate: new Date(this.data.currentDisplayYear, this.data.currentDisplayMonth - 1).getTime()
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
  confirmMonthPicker: function(event) {
    const selectedDate = new Date(event.detail);
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth() + 1;
    
    // 更新显示的年月
    this.setData({
      currentDisplayYear: year,
      currentDisplayMonth: month,
      monthPickerVisible: false
    });
    
    // 重新加载该月份的数据
    this.loadEventsForCalendar(year, month);
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