const app = getApp();

/**
 * 活动包页面 - 参考 event-detail 动态列表样式重构
 * 
 * 新增功能：
 * - 骨架屏预加载效果
 * - 宫格图片展示
 * - 下拉加载更多
 * - 协会信息显示
 */

Page({
  /**
   * 页面的初始数据
   */
  data: {
    // 控制面板相关
    activeTab: 0,                              // 当前选中的标签页索引
    
    // 骨架屏配置
    skeletonRowCol: [
      { width: '180rpx', height: '24rpx', marginBottom: '16rpx' },
      { type: 'row', height: '150rpx' }
    ],
    
    // 数据相关 - 列表视图（参考动态列表结构）
    eventList: [],                             // 活动列表数据
    isEventLoading: false,                     // 是否正在加载活动数据
    eventPage: 1,                             // 当前页码
    eventTotalPages: 1,                       // 总页数
    eventEmpty: false,                        // 是否为空状态
    
    // 日历视图数据
    listDisplayYear: null,                     // 列表视图当前显示年份
    listDisplayMonth: null,                    // 列表视图当前显示月份
    calendarEventData: {},                     // 日历事件原始数据 {year-month: events}
    calendarEvents: [],                        // 日历事件展示数据
    
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
                             // 用户ID
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    if (options && options.url) {
      this.setData({
        requestUrl: options.url
      });
    }


  },

  onShow: async function () {
    if(await app.checkLoginStatus()){
      this.initData();
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
    // 并行加载日历和列表数据
    Promise.all([
      // 日历数据 - 当前月份（即使没有数据也要加载）
    this.loadEventsForCalendar(this.data.currentYear, this.data.currentMonth),
      // 列表数据 - 使用新的加载方法
    this.loadEventList(1)
    ]);
  },

  /**
   * 加载活动列表（参考 event-detail 的 loadEventMoments 方法）
   */
  async loadEventList(page = 1) {
    // 防止重复请求
    if (this.data.isEventLoading || (this.data.eventTotalPages && page > this.data.eventTotalPages)) return;
    
    this.setData({ isEventLoading: true });
    
    // 只在加载更多时添加骨架屏，首次加载保持原有骨架屏
    if (page > 1) {
      const skeletons = Array(2).fill({ loading: true });
      this.setData({
        eventList: this.data.eventList.concat(skeletons)
      });
    } else if (page === 1 && this.data.eventList.length === 0) {
      // 首次加载显示骨架屏
    this.setData({
        eventList: Array(4).fill({ loading: true })
      });
    }

    try {
      const requestUrl = `${this.data.requestUrl}?mode=page&page=${page}`;

      const response = await this.request({
        url: requestUrl,
        method: 'GET'
      });
      
      if (response.Flag == '4000') {
        const events = response.data.records || [];
        const realData = events.map(event => ({
          ...event,
          loading: false,
          // 处理封面缩略图
          cover_url_thumb: event.event_imgs ? app.convertToThumbnailUrl(event.event_imgs[0], 150) : '',
          // 格式化时间显示
          pre_startTime: event.pre_startTime ? this.formatEventTime(event.pre_startTime) : '',
          actual_startTime: event.actual_startTime ? this.formatEventTime(event.actual_startTime) : '',
          // 处理协会信息
          club_info: {
            club_name: event.club_name,
            club_cover: event.club_cover
          }
        }));

        const isEmpty = page === 1 && realData.length === 0;
        
        if (page === 1) {
          // 首次加载，清空后设置数据
    this.setData({
            eventList: []
          }, () => {
            this.setData({
              eventList: realData,
              eventPage: response.data.pagination.current_page || page,
              eventTotalPages: response.data.pagination.total_pages || 1,
              eventEmpty: isEmpty,
              isEventLoading: false
            });
          });
        } else {
          // 加载更多时，移除骨架屏并拼接新数据
    const remain = this.data.eventList.length - 2;
          this.setData({
            eventList: [
              ...this.data.eventList.slice(0, remain),
              ...realData
            ],
            eventPage: response.data.pagination.current_page || page,
            eventTotalPages: response.data.pagination.total_pages || 1,
            isEventLoading: false
          });
        }
      } else {
        if (page === 1) {
          this.setData({ 
            isEventLoading: false
          });
        } else {
          // 加载更多失败，移除刚添加的骨架屏
    const remain = this.data.eventList.length - 2;
          this.setData({
            eventList: this.data.eventList.slice(0, remain),
            isEventLoading: false
          });
        }
        throw new Error(response.message || '获取活动列表失败');
      }
    } catch (error) {
      console.error('加载活动列表失败:', error);
      if (page === 1) {
        wx.showToast({
          title: '加载活动列表失败',
          icon: 'none'
        });
        this.setData({ 
          isEventLoading: false
        });
      } else {
        // 加载更多失败，移除刚添加的骨架屏
    const remain = this.data.eventList.length - 2;
        this.setData({
          eventList: this.data.eventList.slice(0, remain),
          isEventLoading: false
        });
      }
    }
  },

  /**
   * 格式化活动时间显示
   */
  formatEventTime: function(timeString) {
    if (!timeString) return '';
    return app.formatDateTime(timeString);
  },

  /**
   * 请求指定年月的活动数据
   */
  requestEventsByMonth: function(year, month) {
    this.setData({ isLoading: true });
    
    const requestUrl = `${this.data.requestUrl}?mode=month&year=${year}&month=${month}`;

    return this.request({
      url: requestUrl,
      method: 'GET'
    }).then(res => {
      if (res.Flag == '4000') {

        return res;
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
   * 获取活动的有效时间（优先使用actual时间，没有则使用pre时间）
   * @param {string|null} actualTime - 实际时间
   * @param {string} preTime - 预计时间
   * @returns {string} 有效时间
   */
  getEffectiveTime: function(actualTime, preTime) {
    return (actualTime && actualTime !== null) ? actualTime : preTime;
  },

  /**
   * 处理活动数据
   * 时间处理规则：
   * - 优先使用actual_startTime/actual_endTime（活动已开始/结束的实际时间）
   * - 如果没有actual时间，则使用pre_startTime/pre_endTime（预计时间）
   * - 这样可以显示活动的真实时间状态
   */
  processEvents: function(events) {
    // 对每个事件进行处理
    const result = events.map(event => {

      // 处理封面图片 - 优先使用cover_url，如果没有则尝试event_imgs
      event.cover_image = event.cover_url;

      
      // 获取有效的开始时间（优先使用actual_startTime，没有则使用pre_startTime）
    const effectiveStartTime = this.getEffectiveTime(event.actual_startTime, event.pre_startTime);
      
      // 保存原始时间供排序和过滤使用
      event.ori_start_time = effectiveStartTime;
      
      // 格式化显示时间
      event.start_time = app.formatDateTime(effectiveStartTime);
      
      return event;
    });
    
    // 按日期降序排序（最新的在前）- 使用有效开始时间进行排序
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
    return this.requestEventsByMonth(year, month).then(res => {
      // 只有当res.records不为空时才处理数据
    let processedEvents = [];
      if (res.data && res.data.length > 0) {
        processedEvents = this.processEvents(res.data);
      }

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
   * 使用processEvents函数处理后的ori_start_time字段
   * 该字段已经按照actual_startTime优先，pre_startTime备用的规则处理过
   */
  updateCalendarEvents: function(events) {
    const calendarEvents = events.map(event => {
      // 使用已经处理过的原始开始时间（有效开始时间）
    let dateStr = event.startTime;
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
        active_url: app.convertToThumbnailUrl(event.cover, 100),
        url: `/packageEvent/event-detail/index?eventId=${event.event_id}`,
        day,      // 只包含日期，不包含月份
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
    // 设置底部标签栏高亮
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setActive(1);
    }
    // 根据当前标签页刷新对应的数据
    if (this.data.activeTab === 0) {
      this.loadEventList(1);
    } else if (this.data.activeTab === 1) {
      this.forceRefreshCalendar();
    }
  },
  


  /**
   * 列表滚动到底部加载更多
   */
  onScrollToLower: function() {
    if (this.data.activeTab === 0) {
      this.loadEventList(this.data.eventPage + 1);
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
   * 点击活动项跳转到详情页
   */
  onEventTap: function(e) {
    const eventId = e.currentTarget.dataset.event_id;
    const userManaged = e.currentTarget.dataset.user_managed;
    
    // 判断是否是 user_joined 页面
    const isUserJoined = this.data.requestUrl && this.data.requestUrl.includes('user_joined');
    
    if (userManaged) {
      // 用户管理的活动，跳转到 event-manage
      wx.navigateTo({
        url: `/packageEvent/event-manage/index?eventId=${eventId}`
      });
    } else if (isUserJoined) {
      // 用户参加的活动，跳转到 event-joined
      wx.navigateTo({
        url: `/packageEvent/event-joined/index?eventId=${eventId}`
      });
    } else {
      // 其他活动，跳转到 event-detail
      wx.navigateTo({
        url: `/packageEvent/event-detail/index?eventId=${eventId}`
      });
    }
  },

  /**
   * 预览活动图片
   */
  previewEventImage: function(e) {
    const { eventId, index } = e.currentTarget.dataset;
    const event = this.data.eventList.find(e => e.event_id === eventId);
    
    if (event && event.event_imgs) {
      const images = event.event_imgs.map(img => img);
      wx.previewImage({
        current: images[index],
        urls: images
      });
    }
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
});