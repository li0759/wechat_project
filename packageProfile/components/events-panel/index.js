const app = getApp();
const { runPanelLoad, emitPanelLoaded } = require('../../../components/panel-loading-transition/run-load');
const panelLazy = require('../../../utils/panel-lazy-load');

/**
 * 活动列表Panel组件
 * 从packageEvent/index页面转换而来
 */

Component({

  properties: {
    requestUrl: {
      type: String,
      value: '/event/user_joined/list/all'
    },
    clientFilter: {
      type: String,
      value: ''
    }
  },

  data: {
    pltCommand: '',
    // 控制面板相关
    activeTab: 0,
    
    // 数据相关 - 列表视图
    eventList: [],
    panelLoading: false,
    isEventLoading: false,
    eventPage: 1,
    eventTotalPages: 1,
    eventEmpty: false,
    
    // 显示控制
    showAllEvents: false, // 是否显示所有活动（用于控制状态标签显示）
    
    // 日历视图数据
    calendarEventData: {},
    calendarEvents: [],
    
    // 年月信息
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
    currentDisplayYear: new Date().getFullYear(),
    currentDisplayMonth: new Date().getMonth() + 1,
    
    // 日期选择器相数
      minDate: new Date(2020, 0, 1).getTime(),
    maxDate: new Date(new Date().getFullYear() + 1, 11, 31).getTime(),
    monthPickerVisible: false,
    monthPickerDate: new Date().getTime(),
    monthYearRange: [],
    monthPickerValue: [0, 0],
    
    // 加载状数
      isLoading: false,
    hasMore: true,
    currentPage: 1,
    totalPages: 1,
    
    // 嵌套弹窗状态- event-manage-panel
    nestedEventManage: {
      visible: false,
      loading: true,
      renderPanel: false,
      eventId: '',
      tapX: 0,
      tapY: 0
    },
    
    // 嵌套弹窗状态- event-detail-panel
    nestedEventDetail: {
      visible: false,
      loading: true,
      renderPanel: false,
      eventId: '',
      tapX: 0,
      tapY: 0
    },
    
    // 嵌套弹窗状态- event-joined-panel
    nestedEventJoined: {
      visible: false,
      loading: true,
      renderPanel: false,
      eventId: '',
      tapX: 0,
      tapY: 0
    }
  },

  lifetimes: {
    attached() {
      this._syncListRouteContext();
    }
  },

  methods: {
    /**
     * 只同步 WXML 需要的派生状态。不要在 data 里再写 requestUrl/clientFilter（与 properties 同名
     * 易干扰基础库；列表请求一律读 this.properties）。
     */
    _syncListRouteContext() {
      const url = this.properties.requestUrl || '/event/user_joined/list/all';
      this.setData({
        showAllEvents: url.indexOf('/all') !== -1
      });
    },

    applyClientFilter(list) {
      const mode = `${this.properties.clientFilter == null ? '' : this.properties.clientFilter}`;
      if (!mode) return list || [];
      const arr = Array.isArray(list) ? list : [];
      if (mode === 'managedCancelled') {
        return arr.filter(e => !!e && (e.is_cancelled || e.club_deleted));
      }
      if (mode === 'joinedQuit') {
        // 仅协会已删除（与「已取消」列表区分；后者走 /user_joined/list/cancelled）
        return arr.filter(e => !!e && e.club_deleted);
      }
      return arr;
    },
    /**
     * 供外部调用的数据加载方法
     */
    onPanelLoadTransitionDone() {
      emitPanelLoaded(this);
    },

    loadData() {
      this._syncListRouteContext();
      return runPanelLoad(this, {
        fetch: () =>
          Promise.all([
            this.loadEventsForCalendar(this.data.currentYear, this.data.currentMonth),
            this.loadEventList(1, { silent: true }),
          ]),
      });
    },

    /**
     * 加载活动列表
     */
    async loadEventList(page = 1, options = {}) {
      const silent = !!(options && options.silent) && page === 1;
      if (this.data.isEventLoading || (this.data.eventTotalPages && page > this.data.eventTotalPages)) return;
      
      if (!silent) {
        this.setData({ isEventLoading: true });
      }
      
      if (page > 1) {
        const skeletons = Array(2).fill({ loading: true });
        this.setData({
          eventList: this.data.eventList.concat(skeletons)
        });
      } else if (page === 1 && this.data.eventList.length === 0 && !silent) {
        this.setData({
          eventList: Array(4).fill({ loading: true })
        });
      }

      try {
        const base = this.properties.requestUrl || '/event/user_joined/list/all';
        const requestUrl = `${base}?mode=page&page=${page}`;
        const response = await this.request({
          url: requestUrl,
          method: 'GET'
        });
        
        if (this._isApiSuccess(response && response.Flag)) {
          const events = response.data.records || [];
          const realData = events.map(event => ({
            ...event,
            loading: false,
            cover_url_thumb: event.event_imgs ? app.convertToThumbnailUrl(event.event_imgs[0], 150) : '',
            pre_startTime: event.pre_startTime ? this.formatEventTime(event.pre_startTime) : '',
            actual_startTime: event.actual_startTime ? this.formatEventTime(event.actual_startTime) : '',
            club_info: {
              club_name: event.club_name,
              club_cover: event.club_cover
            }
          }));

          const filteredRealData = this.applyClientFilter(realData);
          const totalPages = response.data.pagination.total_pages || 1;

          // 过滤后首页为空但后续页可能有数据：继续拉取直到有数据或拉完
          if (page === 1 && filteredRealData.length === 0 && totalPages > 1) {
            this.setData({
              eventList: [],
              eventPage: 1,
              eventTotalPages: totalPages,
              eventEmpty: false,
              ...(silent ? {} : { isEventLoading: false }),
            }, () => {
              this.loadEventList(2);
            });
            return;
          }
          
          const isEmpty = page === 1 && filteredRealData.length === 0;
          
          if (page === 1) {
            this.setData({
              eventList: []
            }, () => {
              this.setData({
                eventList: filteredRealData,
                eventPage: response.data.pagination.current_page || page,
                eventTotalPages: totalPages,
                eventEmpty: isEmpty,
                ...(silent ? {} : { isEventLoading: false }),
              });
            });
          } else {
            const remain = this.data.eventList.length - 2;
            this.setData({
              eventList: [
                ...this.data.eventList.slice(0, remain),
                ...filteredRealData
              ],
              eventPage: response.data.pagination.current_page || page,
              eventTotalPages: totalPages,
              ...(silent ? {} : { isEventLoading: false }),
            });
          }
        } else {
          if (page === 1) {
            if (!silent) {
              this.setData({ isEventLoading: false });
            }
          } else {
            const remain = this.data.eventList.length - 2;
            this.setData({
              eventList: this.data.eventList.slice(0, remain),
              ...(silent ? {} : { isEventLoading: false }),
            });
          }
          throw new Error(response.message || '获取活动列表失败');
        }
      } catch (error) {        if (page === 1) {
          wx.showToast({
            title: '加载活动列表失败',
            icon: 'none'
          });
          if (!silent) {
            this.setData({ isEventLoading: false });
          }
        } else {
          const remain = this.data.eventList.length - 2;
          this.setData({
            eventList: this.data.eventList.slice(0, remain),
            ...(silent ? {} : { isEventLoading: false }),
          });
        }
      }
    },

    formatEventTime(timeString) {
      if (!timeString) return '';
      return app.formatDateTime(timeString);
    },

    _isApiSuccess(flag) {
      return flag === '4000' || flag === 4000 || String(flag) === '4000';
    },

    requestEventsByMonth(year, month) {
      this.setData({ isLoading: true });
      
      const base = this.properties.requestUrl || '/event/user_joined/list/all';
      const requestUrl = `${base}?mode=month&year=${year}&month=${month}`;

      return this.request({
        url: requestUrl,
        method: 'GET'
      }).then(res => {
        if (this._isApiSuccess(res && res.Flag)) {
          return res;
        } else {
          wx.showToast({ 
            title: res.message || '获取活动数据失败', 
            icon: 'none' 
          });
          return [];
        }
      }).catch(error => {        wx.showToast({ 
          title: typeof error === 'string' ? error : (error.message || '请求失败'), 
          icon: 'none' 
        });
        return [];
      }).finally(() => {
        this.setData({ isLoading: false });
      });
    },

    getEffectiveTime(actualTime, preTime) {
      return (actualTime && actualTime !== null) ? actualTime : preTime;
    },

    processEvents(events) {
      const result = events.map(event => {
        // 使用 event_imgs 的第一张图作为封面
        event.cover_url = event.event_imgs && event.event_imgs.length > 0 ? event.event_imgs[0] : '';
        event.cover_image = event.cover_url;
        
        // 获取有效的开始时数
      const effectiveStartTime = this.getEffectiveTime(event.actual_startTime, event.pre_startTime);
        event.ori_start_time = effectiveStartTime;
        event.startTime = effectiveStartTime; // 用于日历
        event.start_time = app.formatDateTime(effectiveStartTime);
        return event;
      });
      
      const sortedResult = result.sort((a, b) => {
        return new Date(b.ori_start_time) - new Date(a.ori_start_time);
      });
      
      return sortedResult;
    },
    
    loadEventsForCalendar(year, month) {
      const key = `${year}-${month}`;
      
      this.setData({
        currentDisplayYear: year,
        currentDisplayMonth: month
      });
      
      if (this.data.calendarEventData[key]) {
        this.updateCalendarEvents(this.data.calendarEventData[key]);
        return Promise.resolve();
      }
      
      return this.requestEventsByMonth(year, month).then(res => {
        let processedEvents = [];
        if (res.data && res.data.length > 0) {
          processedEvents = this.applyClientFilter(this.processEvents(res.data));
        }

        const updatedEventData = {...this.data.calendarEventData};
        updatedEventData[key] = processedEvents;
        this.setData({
          calendarEventData: updatedEventData
        });

        this.updateCalendarEvents(processedEvents);
      });
    },
    
    updateCalendarEvents(events) {
      const calendarEvents = events.map(event => {
        let dateStr = event.startTime;
        let timestamp;
        
        try {
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) {
            timestamp = date.getTime();
          } else {
            timestamp = new Date().getTime();
          }
        } catch (e) {
          timestamp = new Date().getTime();
        }
        
        const dateObj = new Date(timestamp);
        const day = dateObj.getDate();
        
        return {
          active_time: timestamp,
          active_title: event.title,
          active_url: event.cover_url ? app.convertToThumbnailUrl(event.cover_url, 100) : '',
          url: `/packageEvent/event-detail/index?eventId=${event.event_id}`,
          day
        };
      });
      this.setData({ calendarEvents });
    },
    
    forceRefreshCalendar() {
      const key = `${this.data.currentDisplayYear}-${this.data.currentDisplayMonth}`;
      const updatedEventData = {...this.data.calendarEventData};
      delete updatedEventData[key];
      
      this.setData({
        calendarEventData: updatedEventData
      });
      
      return this.loadEventsForCalendar(
        this.data.currentDisplayYear, 
        this.data.currentDisplayMonth
      );
    },

    onScrollToLower() {
      if (this.data.activeTab === 0) {
        this.loadEventList(this.data.eventPage + 1);
      }
    },
    
    onTabChange(event) {
      const activeTab = event?.detail?.value ?? 0
      this.setData({ activeTab: Number(activeTab) || 0 });
    },

    onCalendarMonthChange(e) {
      const { year, month } = e.detail;
      this.loadEventsForCalendar(year, month);
    },
    
    onCalendarSelect(e) {
      if (e.detail && e.detail.url) {
        wx.navigateTo({
          url: e.detail.url
        });
      }
    },
    
    _openNestedEventPopup(panelType, stateKey, popupSelector, eventId, tapX, tapY) {
      panelLazy.preloadForPanelType(panelType).then(() => {
        this.setData({
          [stateKey]: {
            visible: true,
            loading: true,
            renderPanel: false,
            eventId,
            tapX,
            tapY
          }
        }, () => {
          setTimeout(() => {
            const popup = this.selectComponent(popupSelector);
            if (popup && popup.expand) {
              popup.expand(tapX, tapY);
            }
          }, 50);
        });
      });
    },

    _renderNestedPanel(panelType, renderPanelKey, panelSelector) {
      panelLazy.preloadForPanelType(panelType).then(() => {
        this.setData({
          [renderPanelKey]: true
        }, () => {
          panelLazy.invokePanelLoadData(this, panelSelector);
        });
      });
    },

    onEventTap(e) {
      const eventId = e.currentTarget.dataset.event_id;
      
      const route = this.properties.requestUrl || '';
      const isUserManage = route.includes('user_manage');
      const isUserJoined = route.includes('user_joined');
      
      // 获取点击坐标
    let tapX, tapY;
      if (e.changedTouches && e.changedTouches[0]) {
        tapX = e.changedTouches[0].clientX;
        tapY = e.changedTouches[0].clientY;
      } else if (e.touches && e.touches[0]) {
        tapX = e.touches[0].clientX;
        tapY = e.touches[0].clientY;
      } else {
        const sys = wx.getSystemInfoSync();
        tapX = sys.windowWidth / 2;
        tapY = sys.windowHeight / 2;
      }
      
      if (isUserManage) {
        this._openNestedEventPopup(
          'event-manage',
          'nestedEventManage',
          '#nestedEventManagePopup',
          eventId,
          tapX,
          tapY
        );
      } else if (isUserJoined) {
        this._openNestedEventPopup(
          'event-joined',
          'nestedEventJoined',
          '#nestedEventJoinedPopup',
          eventId,
          tapX,
          tapY
        );
      } else {
        this._openNestedEventPopup(
          'event-detail',
          'nestedEventDetail',
          '#nestedEventDetailPopup',
          eventId,
          tapX,
          tapY
        );
      }
    },

    previewEventImage(e) {
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

    showMonthPicker() {
      const years = []
      const minY = new Date(this.data.minDate).getFullYear()
      const maxY = new Date(this.data.maxDate).getFullYear()
      for (let y = minY; y <= maxY; y++) years.push(y)
      const yearIdx = Math.max(0, years.indexOf(this.data.currentDisplayYear))
      const monthIdx = Math.max(0, (this.data.currentDisplayMonth - 1))
      
      this.setData({
        monthPickerVisible: true,
        monthYearRange: years,
        monthPickerValue: [yearIdx, monthIdx]
      });
    },

    onMonthPickerChange(e) {
      const val = e?.detail?.value
      if (!Array.isArray(val)) return
      this.setData({ monthPickerValue: val })
    },

    confirmMonthPicker() {
      const years = this.data.monthYearRange || []
      const pv = this.data.monthPickerValue || [0, 0]
      const year = years[pv[0]] || this.data.currentDisplayYear
      const month = (pv[1] || 0) + 1
      this.setData({
        currentDisplayYear: year,
        currentDisplayMonth: month,
        monthPickerVisible: false
      })
      this.loadEventsForCalendar(year, month);
    },

    closeMonthPicker() {
      this.setData({
        monthPickerVisible: false
      });
    },

    // ========= 嵌套弹窗相关方法 =========
    
    /**
     * 嵌套弹窗内容准备就绪
     */
    onNestedEventManageContentReady() {
      this._renderNestedPanel('event-manage', 'nestedEventManage.renderPanel', '#nestedEventManagePanel');
    },

    /**
     * 嵌套弹窗加载完成
     */
    onNestedEventManageLoaded() {      this.setData({
        'nestedEventManage.loading': false
      });
    },

    /**
     * 嵌套弹窗更新回调
     */
    onNestedEventManageUpdate() {      // 刷新活动列表
    this.loadEventList(1);
      this.forceRefreshCalendar();
      // 通知父页面更新统计数数
      this.triggerEvent('update');
  },

    /**
     * 关闭嵌套弹窗
     */
    closeNestedEventManage() {
      const popup = this.selectComponent('#nestedEventManagePopup');
      if (popup && popup.collapse) {
        popup.collapse();
      }
    },

    /**
     * 嵌套弹窗开始收?     */
    onNestedEventManageCollapse() {    },

    /**
     * 嵌套弹窗完全收起
     */
    onNestedEventManageCollapsed() {      this.setData({
        nestedEventManage: {
          visible: false,
          loading: true,
          renderPanel: false,
          eventId: '',
          tapX: 0,
          tapY: 0
        }
      });
    },

    // ========= 嵌套 Event Detail 弹窗相关方法 =========
    onNestedEventDetailContentReady() {
      this._renderNestedPanel('event-detail', 'nestedEventDetail.renderPanel', '#nestedEventDetailPanel');
    },

    onNestedEventDetailLoaded() {      this.setData({
        'nestedEventDetail.loading': false
      });
    },

    onNestedEventDetailUpdate() {      this.loadEventList(1);
      this.forceRefreshCalendar();
    },

    closeNestedEventDetail() {
      const popup = this.selectComponent('#nestedEventDetailPopup');
      if (popup && popup.collapse) {
        popup.collapse();
      }
    },

    onNestedEventDetailCollapse() {    },

    onNestedEventDetailCollapsed() {      this.setData({
        nestedEventDetail: {
          visible: false,
          loading: true,
          renderPanel: false,
          eventId: '',
          tapX: 0,
          tapY: 0
        }
      });
    },

    // ========= 嵌套 Event Joined 弹窗相关方法 =========
    onNestedEventJoinedContentReady() {
      this._renderNestedPanel('event-joined', 'nestedEventJoined.renderPanel', '#nestedEventJoinedPanel');
    },

    onNestedEventJoinedLoaded() {      this.setData({
        'nestedEventJoined.loading': false
      });
    },

    onNestedEventJoinedUpdate() {      this.loadEventList(1);
      this.forceRefreshCalendar();
    },

    closeNestedEventJoined() {
      const popup = this.selectComponent('#nestedEventJoinedPopup');
      if (popup && popup.collapse) {
        popup.collapse();
      }
    },

    onNestedEventJoinedCollapse() {    },

    onNestedEventJoinedCollapsed() {      this.setData({
        nestedEventJoined: {
          visible: false,
          loading: true,
          renderPanel: false,
          eventId: '',
          tapX: 0,
          tapY: 0
        }
      });
    },

    request(options) {
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
    }
  }
});
