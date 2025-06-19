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

    // 未缴费数量
    unpaidCount: 0,
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
    
    // 加载初始数据
    this.initData();
  },

  /**
   * 初始化数据
   */
  initData: function() {
    wx.showLoading({ title: '加载中...' });
    
    // 并行加载日历和列表数据
    Promise.all([
      // 日历数据 - 当前月份
      this.loadEventsForCalendar(this.data.currentYear, this.data.currentMonth),
      // 列表数据 - 使用分页方式获取第1页数据
      this.loadInitialTimelineData(),
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
    const requestUrl = `/money/paypersonal/user_payable/list/all?mode=page&page=1`;

    return this.request({
      url: requestUrl,
      method: 'GET'
    }).then(res => {
      if (res.Flag === '4000') {
        const records = res.data.records;
        const totalPages = res.data.pagination.total_pages;
        const currentPage = res.data.pagination.current_page;
        
        // 处理数据并显示
        if (records.length > 0) {
          // 处理数据
          const processedRecords = this.processTimelineData(records);
          // 设置时间线数据
          this.setData({
            timeline: processedRecords,
            hasMore: currentPage < totalPages,
            totalPages: totalPages,
            currentPage: currentPage
          })
          this.updateTopVisibleItemDate();        
          return true;
        } else {
          console.log('没有获取到初始数据');
          this.setData({ 
            timeline: [],
            hasMore: false,
            totalPages: 1,
            currentPage: 1
          });
          wx.showToast({
            title: '暂无收款记录',
            icon: 'none'
          });
          return false;
        }
      } else {
        console.log('请求错误:', res.message);
        wx.showToast({ 
          title: res.message || '获取数据失败', 
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
   * 请求指定年月的时间线数据
   */
  requestTimelineByMonth: function(year, month) {
    this.setData({ isLoading: true });
    
    const requestUrl = `/money/paypersonal/user_payable/list/all?mode=month&year=${year}&month=${month}`;

    return this.request({
      url: requestUrl,
      method: 'GET'
    }).then(res => {
      if (res.Flag === '4000') {
        // 返回收款记录数据
        const records = res.data.records || [];
        return records;
      } else {
        console.log('请求错误:', res.message);
        wx.showToast({ 
          title: res.message || '获取数据失败', 
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
  processTimelineData: function(records) {
    const result = records.map(record => {
      // 格式化日期
      const createDate = new Date(record.create_date);
      record.ori_create_date = record.create_date; // 保存原始日期
      
      // 格式化为YYYY-MM-DD格式
      const formattedDate = `${createDate.getFullYear()}-${String(createDate.getMonth() + 1).padStart(2, '0')}-${String(createDate.getDate()).padStart(2, '0')}`;
      record.create_date = formattedDate;
      
      // 判断是否已支付
      record.isPaid = record.pay_date !== null;
      record.type = 'personal_payment';  // 类型全部为个人支付
      
      return record;
    });
    
    // 按日期降序排序（最新的在前）
    const sortedResult = result.sort((a, b) => {
        return new Date(b.ori_create_date) - new Date(a.ori_create_date);
    });
    return sortedResult;
  },

  /**
   * 加载更多数据
   */
  loadMoreData: function() {
    if (this.data.isLoading || !this.data.hasMore) {
      return Promise.resolve(false);
    }

    const nextPage = this.data.currentPage + 1;
    
    this.setData({ isLoading: true });
    
    // 使用分页API获取下一页
    const requestUrl = `/money/paypersonal/user_payable/list/all?mode=page&page=${nextPage}`;
    
    return this.request({
      url: requestUrl,
      method: 'GET'
    }).then(res => {
      if (res.Flag === '4000') {
        const records = res.data && res.data.records ? res.data.records : [];
        const totalPages = res.data ? res.data.total_pages : 1;
        const currentPage = res.data ? res.data.current_page : 1;
        
        if (records.length > 0) {
          // 处理数据
          const processedRecords = this.processTimelineData(records);
          
          // 合并并更新数据
          this.setData({
            timeline: [...this.data.timeline, ...processedRecords],
            hasMore: currentPage < totalPages,
            totalPages: totalPages,
            currentPage: currentPage
          });
          return true;
        } else {
          this.setData({ hasMore: false });
          return false;
        }
      } else {
        wx.showToast({ 
          title: res.message || '获取更多数据失败', 
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
   * 点击加载更多按钮事件
   */
  onLoadMoreClick: function() {
    if (!this.data.isLoading && this.data.hasMore) {
      this.loadMoreData();
    }
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
    return this.requestTimelineByMonth(year, month).then(records => {
      const processedRecords = this.processTimelineData(records);
      
      // 更新缓存
      const updatedEventData = {...this.data.calendarEventData};
      updatedEventData[key] = processedRecords;
      
      this.setData({
        calendarEventData: updatedEventData
      });
      
      // 更新日历事件显示
      this.updateCalendarEvents(processedRecords);
    });
  },
  
  /**
   * 更新日历事件显示
   */
  updateCalendarEvents: function(events) {
    const calendarEvents = events.map(item => {
      // 解析日期时间，获取时间戳
      let dateStr = item.ori_create_date;
      let timestamp;
      

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
      

      if (item.pay_date) {
        eventObj.active_title = `已为为: ${item.description}缴费`;
        if (item.payment !== undefined) {
          eventObj.active_title += ` (¥${item.payment})`;
        }
      } else {
        eventObj.active_title = `需要为: ${item.description}缴费`;
        if (item.payment !== undefined) {
          eventObj.active_title += ` (¥${item.payment})`;
        }
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
   * 更新顶部可见项的日期展示
   */
  updateTopVisibleItemDate: function() {
    // 获取所有时间轴项目
    const query = wx.createSelectorQuery();
    query.selectAll('.timeline-item').boundingClientRect();
    query.exec(res => {
      if (!res || !res[0] || res[0].length === 0) {
        
        // 无数据时显示当前日期
        this.setData({
          listDisplayYear: this.data.currentYear,
          listDisplayMonth: this.data.currentMonth
        });
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
   * 点击刷新按钮
   */
  onRefresh: function() {
    this.loadInitialTimelineData();
  },

  /**
   * 标签页切换事件
   */
  onTabChange: function(event) {
    const activeTab = event.detail.index;
    this.setData({ activeTab });
  },

  /**
   * 时间轴滚动事件
   */
  onTimelineScroll: function(e) {
    this.updateTopVisibleItemDate();
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
      // 列表视图：加载指定月份数据
      this.loadDataByYearMonth(year, month);
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
   * 加载指定年月的数据
   */
  loadDataByYearMonth: function(year, month) {
    wx.showLoading({ title: '加载中...' });
    
    this.requestTimelineByMonth(year, month).then(records => {
      if (records.length > 0) {
        // 处理数据
        const processedRecords = this.processTimelineData(records);
        
        // 更新数据
        this.setData({
          timeline: processedRecords,
          listDisplayYear: year,
          listDisplayMonth: month,
          hasMore: false  // 按月查询不支持分页
        });
      } else {
        this.setData({ 
          timeline: [],
          listDisplayYear: year,
          listDisplayMonth: month
        });
        wx.showToast({
          title: '该月份无收款记录',
          icon: 'none'
        });
      }
    }).finally(() => {
      wx.hideLoading();
    });
  },

  /**
   * 日历月份变更事件
   */
  onCalendarMonthChange: function(e) {
    const { year, month } = e.detail;
    
    // 检查是否已有该月数据
    const yearMonthKey = `${year}-${month}`;
    if (!this.data.calendarEventData[yearMonthKey]) {
      this.loadEventsForCalendar(year, month);
    } else {
      // 已有数据，直接更新显示
      this.updateCalendarEvents(this.data.calendarEventData[yearMonthKey]);
      this.setData({
        currentDisplayYear: year,
        currentDisplayMonth: month
      });
    }
  },

  /**
   * 日历日期选择事件
   */
  onCalendarSelect: function(e) {
    const { year, month, day } = e.detail;
    
    // 可以在这里添加选中日期的逻辑
  },


  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function() {
    if (this.data.activeTab === 0) {
      this.loadMoreData();
    }
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
   * 请求封装
   */
  request: function(options) {
    const baseUrl = app.globalData.request_url;
    
    return new Promise((resolve, reject) => {
      wx.request({
        url: baseUrl + options.url,
        method: options.method || 'GET',
        data: options.data,
        header: {
          'content-type': 'application/json',
          'Authorization': 'Bearer ' + this.data.token
        },
        success(res) {
          if (res.statusCode === 200) {
            resolve(res.data);
          } else if (res.statusCode === 401) {
            // Token失效，跳转到登录页
            wx.showToast({
              title: '登录已过期，请重新登录',
              icon: 'none'
            });
            
            setTimeout(() => {
              wx.navigateTo({ url: '/pages/login/index' });
            }, 300);
            
            reject('登录已过期');
          } else {
            reject(res.data.message || '请求失败');
          }
        },
        fail(err) {
          reject(err);
        }
      });
    });
  }
}); 