// 引入API请求工具
const app = getApp();

Page({
  data: {
    // 用户信息
    userInfo: {},
    // 活动列表
    default_avatar:app.globalData.static_url+'/assets/default_avatar.webp',
    // 协会列表
    clubList: [],
    clubPage: 1,
    clubTotalPages: 1,
    isClubLoading: false,
    
    // 侧边抽屉相关
    drawerLeft: -800, // 初始位置，隐藏侧边栏
    drawerTouching: false,
    drawerStartX: 0,
    drawerCurrentLeft: 0,
    drawerAnimationEnded: false, // 动画是否结束
    
    // Swiper到Drawer的过渡控制
    swiperTransitioning: false,
    swiperDx: 0,
    swiperToDrawerMode: false, // 是否已进入drawer接管模式
    swiperDisableTouch: false, // 禁用swiper触摸
    
    // 活动item触摸追踪
    eventItemTouchStartX: 0,
    eventItemTouchStartY: 0,
    eventItemTouching: false,
    eventItemCatchMove: false, // 是否捕获touchmove事件（只在右滑时捕获）
    
    // 热门活动列表
    hotActivities: [
      { event_id: 'placeholder-1', title: '加载中...', cover_url: '', join_count: 0},
      { event_id: 'placeholder-2', title: '加载中...', cover_url: '', join_count: 0},
      { event_id: 'placeholder-3', title: '加载中...', cover_url: '', join_count: 0}
    ],
    // 热门协会列表
    hotClubs: [
      { club_id: 'placeholder-1', club_name: '加载中...', logo: ''},
      { club_id: 'placeholder-2', club_name: '加载中...', logo: ''},
      { club_id: 'placeholder-3', club_name: '加载中...', logo: ''}
    ],

    // Isotope 组件配置
    masonryHorizontalConfig: {
      rowHeight: 10,  // 设置为 10rpx，让图片高度更灵活
  },

    // 未读通知数量
    unread_messages_count: 0,
    // 地图密钥
    mapKey: app.globalData.key, 
    // 地图URL
    mapUrl: app.globalData.staticMapUrl,
    
    // Skyline相关的UI状态
    userInfoActive: false,
    searchInputActive: false,
    
    // 标签页状态
    activeTab: 0,

    // 通知面板状态
    messagesActiveTab: 0,
    messagesLoading: false,
    messagesClubNotices: [],
    messagesEventNotices: [],
    messagesSystemNotices: [],
    messagesEmptyClub: false,
    messagesEmptyEvent: false,
    messagesEmptySystem: false,
    messagesPanelExpanded: false,

    // 全局弹窗状态（用于 swiper 内的卡片点击）
    globalPopup: {
      visible: false,
      loading: true,
      renderPanel: false,  // 是否渲染 panel 组件
      type: '', // 'event-detail', 'event-manage', 'club-detail', 'club-manage'
      id: '',
      tapX: 0,
      tapY: 0
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    // 注册变更监听器
    const app = getApp();
    this._changeListener = (changes) => {
      console.log('[home] 收到变更广播:', changes);
      this.applyLocalChanges();
    };
    app.registerChangeListener(this._changeListener);
    
    // 监听分包异步化组件加载失败
    if (wx.onLazyLoadError) {
      wx.onLazyLoadError(({ errMsg, mod }) => {
        console.error('分包组件加载失败:', mod, errMsg);
        wx.showToast({
          title: '组件加载失败',
          icon: 'none'
        });
        // 加载失败也要隐藏 loading
        if (this.data.globalPopup && this.data.globalPopup.loading) {
          this.setData({
            'globalPopup.loading': false
          });
        }
      });
    }
    
    this.initPage();
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {
    // 注销变更监听器
    const app = getApp();
    if (this._changeListener) {
      app.unregisterChangeListener(this._changeListener);
      this._changeListener = null;
    }
  },

  /**
   * 初始化页面
   */
  initPage: function() {
    this.mapCtx = wx.createMapContext('hotEventMap');
    if (this.mapCtx) {
      this.mapCtx.setCenterOffset({
        offset: [0.25, 0.25]
      });
    }
    
    // 初始渲染骨架屏
    this.setData({
      clubList: Array(6).fill({ loading: true }),
      eventList: Array(6).fill({ loading: true })
    });
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: async function () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      // 设置tabbar索引为0（首页）
    this.getTabBar().setActive(0);
    }
    console.log("onShow")
    if(await app.checkLoginStatus()){
      this.setData({
        userInfo: wx.getStorageSync('userInfo')
      });
      // 智能检查：超过5分钟才整体刷新，否则只做局部变更
    this.smartCheckAndUpdate();
      // 加载通知数据
    this.fetchMessagesForPanel();
    }
  },

  // 智能检查与更新（5分钟规则 + 局部更新）
  smartCheckAndUpdate: function() {
    const currentTime = Date.now();
    const ctrl = wx.getStorageSync('home_refresh_control') || { last_refresh_time: 0, refresh_interval: 300000 };

    // 首屏兜底：若无真实数据（为空或仅骨架），强制加载
    const { eventList = [], clubList = [] } = this.data;
    const hasEventReal = Array.isArray(eventList) && eventList.some(item => item && item.loading === false);
    const hasClubReal = Array.isArray(clubList) && clubList.some(item => item && item.loading === false);
    const noRealData = !hasEventReal || !hasClubReal;

    const needRefresh = (currentTime - ctrl.last_refresh_time) > ctrl.refresh_interval;

    if (noRealData || needRefresh) {
      this.loadData();
      ctrl.last_refresh_time = currentTime;
      wx.setStorageSync('home_refresh_control', ctrl);
    } else {
      this.applyLocalChanges();
    }
  },

  // 应用本地变更（统一changes）
  applyLocalChanges: function() {
    const app = getApp();
    const changes = app.getChanges();
    console.log('[home] applyLocalChanges', changes);

    Object.keys(changes).forEach(id => {
      const { type, action, data } = changes[id];
      if (action === 'update') {
        this.updateInCache(type, id, data);
      } else if (action === 'delete') {
        this.removeFromCache(type, id);
      } else if (action === 'create') {
        this.addToCache(type, data);
      }
    });

    // 不清空 changes，由 broadcastChanges 统一清空
  },

  // 方案B：仅当列表中存在时才更新
  updateInCache: function(type, id, data) {
    console.log(id);
    console.log(data);


    if (type == 'event') {
      const { eventList = [], hotActivities = [] } = this.data;
      let updated = false;

      if (eventList.some(e => e && e.event_id == id)) {
        const next = eventList.map(e => {
          if (e && e.event_id == id) {
            const updatedEvent = { ...e, ...data };
            // 如果封面更新了，需要更新缩略图
    if (data.cover_url || data.cover) {
              const coverUrl = data.cover_url || data.cover;
              updatedEvent.cover_url = coverUrl;
              updatedEvent.cover_url_thumb = app.convertToThumbnailUrl(coverUrl, 400);
              console.log('[home] 更新活动封面缩略图:', id, updatedEvent.cover_url_thumb);
            }
            return updatedEvent;
          }
          return e;
        });
        this.setData({ eventList: next });
        updated = true;
      }
      if (hotActivities.some(e => e && e.event_id == id)) {
        const nextHot = hotActivities.map(e => {
          if (e && e.event_id == id) {
            const updatedEvent = { ...e, ...data };
            // 如果封面更新了，需要更新缩略图
    if (data.cover_url || data.cover) {
              const coverUrl = data.cover_url || data.cover;
              updatedEvent.cover_url = coverUrl;
              updatedEvent.cover_url_thumb = app.convertToThumbnailUrl(coverUrl, 200);
            }
            return updatedEvent;
          }
          return e;
        });
        this.setData({ hotActivities: nextHot });
        updated = true;
      }
      return updated;
    }

    if (type == 'club') {
      const { clubList = [], hotClubs = [] } = this.data;
      let updated = false;

      if (clubList.some(c => c && (c.club_id == id || c.id == id))) {
        const next = clubList.map(c => {
          if (c && (c.club_id == id || c.id == id)) {
            const updatedClub = { ...c, ...data };
            // 如果封面更新了，需要更新缩略图
    if (data.cover_url) {
              updatedClub.cover_url_thumb = app.convertToThumbnailUrl(data.cover_url, 400);
              console.log('[home] 更新协会封面缩略图:', id, updatedClub.cover_url_thumb);
            }
            return updatedClub;
          }
          return c;
        });
        this.setData({ clubList: next });
        updated = true;
      }
      if (hotClubs.some(c => c && (c.club_id == id || c.id == id))) {
        const nextHot = hotClubs.map(c => {
          if (c && (c.club_id == id || c.id == id)) {
            const updatedClub = { ...c, ...data };
            // 如果封面更新了，需要更新缩略图
    if (data.cover_url) {
              updatedClub.cover_url_thumb = app.convertToThumbnailUrl(data.cover_url, 200);
            }
            return updatedClub;
          }
          return c;
        });
        this.setData({ hotClubs: nextHot });
        updated = true;
      }
      return updated;
    }

    return false;
  },

  // 方案B：仅当存在时才删除
  removeFromCache: function(type, id) {
    if (type == 'event') {
      const { eventList = [], hotActivities = [] } = this.data;
      let updated = false;

      if (eventList.some(e => e && e.event_id == id)) {
        this.setData({ eventList: eventList.filter(e => e && e.event_id != id) });
        updated = true;
      }
      if (hotActivities.some(e => e && e.event_id == id)) {
        this.setData({ hotActivities: hotActivities.filter(e => e && e.event_id != id) });
        updated = true;
      }
      return updated;
    }

    if (type == 'club') {
      const { clubList = [], hotClubs = [] } = this.data;
      let updated = false;

      if (clubList.some(c => c && (c.club_id == id))) {
        this.setData({ clubList: clubList.filter(c => c && (c.club_id != id)) });
        updated = true;
      }
      if (hotClubs.some(c => c && (c.club_id == id))) {
        this.setData({ hotClubs: hotClubs.filter(c => c && (c.club_id != id)) });
        updated = true;
      }
      return updated;
    }

    return false;
  },

  // 方案B：创建仅追加（必要时）
  addToCache: function(type, data) {
    if (type == 'event') {
      const { eventList = [], hotActivities = [] } = this.data;
      // 若已存在则不重复添加
    if (eventList.some(e => e && e.event_id == data.event_id)) return false;
      data.imgLoaded = true;
      data.cur_user_managed = true
      data.cover_url_thumb = app.convertToThumbnailUrl(data.cover_url, 200);
      this.setData({ eventList: [data, ...eventList] });
      // 热门位简单策略：若不足3个则追加
    if (hotActivities.length < 3 && !hotActivities.some(e => e && e.event_id == data.event_id)) {
        this.setData({ hotActivities: [data, ...hotActivities] });
      }
      return true;
    }

    if (type == 'club') {
      const { clubList = [], hotClubs = [] } = this.data;
      const clubId = data.club_id;
      if (clubList.some(c => c && (c.club_id == clubId))) return false;
      data.imgLoaded = true;
      data.cover_url_thumb = app.convertToThumbnailUrl(data.cover_url, 200);
      this.setData({ clubList: [data, ...clubList] });
      if (hotClubs.length < 3 && !hotClubs.some(c => c && (c.club_id == clubId))) {
        this.setData({ hotClubs: [data, ...hotClubs] });
      }
      return true;
    }

    return false;
  },

  /**
   * 切换标签页
   */
  switchTab: function(e) {
    const index = parseInt(e.currentTarget.dataset.index);
    this.setData({
      activeTab: index
    });
  },

  /**
   * 处理swiper切换事件
   */
  handleSwiperChange: function(e) {
    const current = e.detail.current;
    this.setData({
      activeTab: current
    });
  },

  /**
   * 处理swiper过渡事件（拖动检测）
   */
  handleSwiperTransition: function(e) {
    const { dx } = e.detail;
    this.setData({
      swiperTransitioning: true,
      swiperDx: dx
    });
  },

  /**
   * 处理swiper动画结束事件
   */
  handleSwiperAnimationFinish: function(e) {
    this.setData({
      swiperTransitioning: false,
      swiperDx: 0,
      swiperToDrawerMode: false,
      swiperDisableTouch: false
    });
  },

  /**
   * 活动scroll-view触摸开始
   */
  onEventScrollTouchStart: function(e) {
    // 只在活动tab时处理
    if (this.data.activeTab !== 0) return;
    
    // 兼容原生事件和 ripple 自定义事件
    let touch;
    if (e.touches && e.touches[0]) {
      touch = e.touches[0];
    } else if (e.detail && e.detail.touches && e.detail.touches[0]) {
      touch = e.detail.touches[0];
    } else {
      return; // 无法获取触摸信息，直接返回
    }
    
    this.eventScrollStartTime = Date.now();
    
    this.setData({
      eventItemTouchStartX: touch.pageX,
      eventItemTouchStartY: touch.pageY,
      eventItemTouching: true,
      eventItemCatchMove: false
    });
  },

  /**
   * 活动scroll-view触摸移动
   */
  onEventScrollTouchMove: function(e) {
    if (!this.data.eventItemTouching && !this.data.swiperToDrawerMode) return;
    
    // 兼容原生事件和 ripple 自定义事件
    let touch;
    if (e.touches && e.touches[0]) {
      touch = e.touches[0];
    } else if (e.detail && e.detail.touches && e.detail.touches[0]) {
      touch = e.detail.touches[0];
    } else {
      return; // 无法获取触摸信息，直接返回
    }
    
    const deltaX = touch.pageX - this.data.eventItemTouchStartX;
    const deltaY = touch.pageY - this.data.eventItemTouchStartY;
    
    // 转换为rpx
    const systemInfo = wx.getSystemInfoSync();
    const pixelRatio = 750 / systemInfo.windowWidth;
    const deltaXRpx = deltaX * pixelRatio;
    const deltaYRpx = deltaY * pixelRatio;
    
    // 判断滑动方向（只在第一次移动时判断）
    if (!this.data.swiperToDrawerMode && !this.data.eventItemCatchMove) {
      const absX = Math.abs(deltaXRpx);
      const absY = Math.abs(deltaYRpx);
      
      // 如果移动距离太小，还不确定方向
    if (absX < 20 && absY < 20) {
        return;
      }
      
      // 判断是否为右滑（向右且横向大于纵向）
    const isRightSwipe = deltaXRpx > 0 && absX > absY;
      
      if (!isRightSwipe) {
        // 其他方向：不捕获，停止追踪
    this.setData({
          eventItemTouching: false
        });
        return;
      }
      
      // 右滑：立即开始捕获并进入drawer模式
    this.setData({
        eventItemCatchMove: true,
        swiperDisableTouch: true,
        swiperToDrawerMode: true,
        drawerTouching: true,
        drawerStartX: this.data.eventItemTouchStartX,
        drawerCurrentLeft: -800
      });
      
      this.drawerTouchStartX = this.data.eventItemTouchStartX;
      this.drawerTouchStartY = this.data.eventItemTouchStartY;
      this.drawerTouchMoved = true;
    }
    
    // 如果已经进入drawer模式，直接控制drawer
    if (this.data.swiperToDrawerMode) {
      const deltaXFromStart = touch.pageX - this.data.drawerStartX;
      const deltaXFromStartRpx = deltaXFromStart * pixelRatio;
      
      let newLeft = -800 + deltaXFromStartRpx;
      newLeft = Math.max(-800, Math.min(0, newLeft));
      
      this.setData({
        drawerLeft: newLeft
      });

    }
  },

  /**
   * 活动scroll-view触摸结束
   */
  onEventScrollTouchEnd: function(e) {
    if (!this.data.eventItemTouching && !this.data.swiperToDrawerMode) return;
    
    this.setData({
      eventItemTouching: false,
      eventItemCatchMove: false
    });
    
    // 如果进入了drawer模式，执行drawer的结束逻辑
    if (this.data.swiperToDrawerMode) {
      const drawerLeft = this.data.drawerLeft;
      const dragDistance = drawerLeft - (-800);
      
      if (dragDistance > 100) {
        this.openDrawer();
      } else {
        this.closeDrawer();
      }
      
      this.setData({
        swiperToDrawerMode: false,
        swiperDisableTouch: false
      });
    }
  },

  /**
   * 处理协会swiper切换事件
   */
  onClubSwiperChange: function(e) {
    const current = e.detail.current;
    // 可以在这里添加协会swiper切换时的特殊逻辑
    console.log('协会swiper切换到:', current);
  },

  /**
   * Skyline兼容性处理 - 处理用户信息点击态
   */
  handleUserInfoTouchStart: function() {
    this.setData({
      userInfoActive: true
    });
  },

  handleUserInfoTouchEnd: function() {
    this.setData({
      userInfoActive: false
    });
  },

  /**
   * Skyline兼容性处理 - 处理搜索框点击态
   */
  handleSearchTouchStart: function() {
    this.setData({
      searchInputActive: true
    });
  },

  handleSearchTouchEnd: function() {
    this.setData({
      searchInputActive: false
    });
  },

    /**
  * 监听 TabBar 切换点击
  */
  onCustomTabItemTap(item) {
    this.loadData();
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
  },

  /**
   * 抽屉触摸开始
   */
  onDrawerTouchStart: function(e) {
    // 如果正在swiper到drawer的过渡中，不重新初始化
    if (this.data.swiperToDrawerMode) {
      return;
    }

    const touch = e.touches[0];
    this.drawerTouchStartX = touch.pageX;
    this.drawerTouchStartY = touch.pageY;
    this.drawerTouchMoved = false; // 标记是否已经移动
    this.setData({
      drawerTouching: true,
      drawerStartX: touch.pageX,
      drawerCurrentLeft: this.data.drawerLeft
    });
  },

  /**
   * 抽屉触摸移动
   */
  onDrawerTouchMove: function(e) {
    // swiper到drawer模式时，不在这里处理，由onEventSwiperTouchMove处理
    if (this.data.swiperToDrawerMode) return;
    if (!this.data.drawerTouching) return;

    const touch = e.touches[0];
    const deltaX = touch.pageX - this.drawerTouchStartX;
    const deltaY = touch.pageY - this.drawerTouchStartY;
    
    // 判断是横向还是纵向滑动
    if (!this.drawerTouchMoved) {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      
      // 如果纵向滑动大于横向，取消抽屉操作
    if (absY > absX && absY > 10) {
        this.setData({ 
          drawerTouching: false
        });
        return;
      }
      
      // 如果横向滑动足够大，标记为已移动
    if (absX > 10) {
        this.drawerTouchMoved = true;
      }
    }
    
    if (!this.drawerTouchMoved) return;
    
    const deltaXFromStart = touch.pageX - this.data.drawerStartX;
    
    // 转换为rpx
    const systemInfo = wx.getSystemInfoSync();
    const pixelRatio = 750 / systemInfo.windowWidth;
    let newLeft = this.data.drawerCurrentLeft + deltaXFromStart * pixelRatio;
    
    // 限制范围：-800（完全隐藏）到 0（完全显示）
    newLeft = Math.max(-800, Math.min(0, newLeft));
    
    this.setData({
      drawerLeft: newLeft
    });
  },

  /**
   * 抽屉触摸结束
   */
  onDrawerTouchEnd: function(e) {
    // swiper到drawer模式时，不在这里处理，由onEventSwiperTouchEnd处理
    if (this.data.swiperToDrawerMode) return;
    if (!this.data.drawerTouching) return;
    if (!this.drawerTouchMoved) {
      // 如果没有移动，直接取消
    this.setData({ 
        drawerTouching: false
      });
      return;
    }

    const drawerLeft = this.data.drawerLeft;
    const drawerCurrentLeft = this.data.drawerCurrentLeft;
    
    // 计算拖动距离
    const dragDistance = drawerLeft - drawerCurrentLeft;
    const dragDistanceAbs = Math.abs(dragDistance);
    
 
    
    // 判断当前状态
    const isOpened = drawerCurrentLeft >= -400; // 如果起始位置接近打开状态
    const isClosed = drawerCurrentLeft < -400;  // 如果起始位置接近关闭状态
    if (isOpened) {
      // 当前是打开状态，判断是否要关闭
    if (dragDistance < 0 && dragDistanceAbs > 100) {
        // 向左拖超过100rpx → 关闭
    this.closeDrawer();
      } else {
        // 其他情况 → 保持打开
    this.openDrawer();
      }
    } else {
      // 当前是关闭状态，判断是否要打开
    if (dragDistance > 0 && dragDistanceAbs > 100) {
        // 向右拖超过100rpx → 打开
    this.openDrawer();
      } else {
        // 其他情况 → 保持关闭
    this.closeDrawer();
      }
    }
  },

  /**
   * 打开抽屉
   */
  openDrawer: function() {
    this.setData({
      drawerTouching: false
    });
    
    wx.nextTick(() => {
      this.setData({
        drawerLeft: 0,
      });
      
      // 动画结束后加载数据
      setTimeout(() => {
        this.setData({
          drawerAnimationEnded: true
        });
      }, 350);
    });
  },

  /**
   * 关闭抽屉
   */
  closeDrawer: function() {
    this.setData({
      drawerTouching: false
    });
    
    wx.nextTick(() => {
      this.setData({
        drawerLeft: -800,
        drawerAnimationEnded: false
      });
    });
  },

  /**
   * 校验登录状态
   */

  /**
   * 加载所有数据
   */
  async loadData() {

      const userId = wx.getStorageSync('userId');
      if (!userId) {
        throw new Error('未找到用户ID');
      }
      await this.loadEventList();
      await this.loadHotEventList();
      await this.loadClubList();
      await this.loadHotClubList();
      await this.getUnreadNoticeCount();

  },

  /**
   * 加载全部活动列表
   */
  async loadEventList(page = 1) {

    if (this.data.isEventLoading || (this.data.eventTotalPages && page > this.data.eventTotalPages)) return;
    this.setData({ isEventLoading: true });
    // 加载更多时追加骨架屏
    if (page > 1) {
      const skeletons = Array(2).fill({ loading: true });
      this.setData({
        eventList: this.data.eventList.concat(skeletons)
      });
    }
    console.log(page);
    wx.request({
      url: app.globalData.request_url + `/event/list/going?mode=page&page=${page}`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${wx.getStorageSync('token')}`,
        'Content-Type': 'application/json'
      },
      success: (res) => {
        console.log(res.data);
        if (res.data.Flag == 4000) {
          const realData = (res.data.data.records || [])
            .map(activity => {
              activity.start_time = app.formatDateTime(new Date(activity.start_time));
              activity.cover_url_thumb = app.convertToThumbnailUrl(activity.cover_url,400);
              return { ...activity, loading: false, imgLoaded: false };
            });
          if (page == 1) {
            this.setData({
              eventList: []
            }, () => {
              this.setData({
                eventList: realData,
                eventPage: res.data.data.pagination.current_page,
                eventTotalPages: res.data.data.pagination.total_pages || 1
              });
            });
          } else {
            const remain = this.data.eventList.length - 2;
            this.setData({
              eventList: [
                ...this.data.eventList.slice(0, remain),
                ...realData
              ],
              eventPage: res.data.data.pagination.current_page,
              eventTotalPages: res.data.data.pagination.total_pages || 1
            });
          }
        } else {
          if (page === 1) {
            this.setData({ eventList: [] });
          }
        }
      },
      complete: () => {
        this.setData({ isEventLoading: false });
      }
    });
  },

  /**
   * 加载热门活动列表
   */
  async loadHotEventList() {
    // 设置加载状态
    return new Promise((resolve, reject) => {
      // 从后台获取热门活动列表
      wx.request({
        url: app.globalData.request_url + `/event/heat/list`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json'
        },
        success: async(res) => {       
          if (res.data.Flag == 4000) {
  
            const activities = res.data.data || [];
            // 处理活动数据
    const processedActivities = activities.map(activity => {
              // 格式化开始时间
              activity.start_time = app.formatDateTime(new Date(activity.start_time));
            
              activity.cover_url_thumb = app.convertToThumbnailUrl(activity.cover_url, 200);
              // 确保latest_joins存在
    if (!activity.latest_joins) {
                activity.latest_joins = [];
              }
              
              // 如果没有location_data，创建一个空对象
    if (!activity.location_data) {
                activity.location_data = null;
              } else {
                // 为location_data添加预处理的marker数据
                activity.markerData = [{
                  id: 1,
                  latitude: activity.location_data.latitude,
                  longitude: activity.location_data.longitude,
                  width: 20,
                  height: 20
                }];
              }
              
              return activity;
            });      
            
            this.setData({ 
              hotActivities: processedActivities,
            });
          } else {
            console.error('获取热门活动列表失败:', res.data);
            this.setData({ 
              hotActivities: []
            });
          }
          resolve();
        },
        fail: (err) => {
          console.error('热门活动列表请求失败:', err);
          this.setData({ 
            hotActivities: []
          });
          reject(err);
        }
      });
    });
  },

  /**
   * 加载协会列表
   */
  async loadClubList(page = 1) {
    if (this.data.isClubLoading || (page > this.data.clubTotalPages)) return;
    this.setData({ isClubLoading: true });
    // 加载更多时追加骨架屏
    if (page > 1) {
      const skeletons = Array(2).fill({ loading: true });
      this.setData({
        clubList: this.data.clubList.concat(skeletons)
      });
    }
    wx.request({
      url: app.globalData.request_url + `/club/list/active?mode=page&page=${page}`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${wx.getStorageSync('token')}`,
        'Content-Type': 'application/json'
      },
      success: (res) => {
        if (res.data.Flag == 4000) {
          console.log('loadClubList response:', res.data.data);
          const realData = res.data.data.records
            .map(club => {
              console.log(`Club ${club.club_name}: cur_user_managed =`, club.cur_user_managed);
              club.cover_url_thumb = app.convertToThumbnailUrl(club.cover_url,400);
              return { ...club, loading: false, imgLoaded: false };
            });
          if (page === 1) {
            this.setData({
              clubList: []
            }, () => {
              this.setData({
              clubList: realData,
                clubPage: res.data.data.pagination.current_page,
                clubTotalPages: res.data.data.pagination.total_pages
              });
            });
          } else {
            const remain = this.data.clubList.length - 2;
            this.setData({
              clubList: [
                ...this.data.clubList.slice(0, remain),
                ...realData
              ],
              clubPage: res.data.data.pagination.current_page,
              clubTotalPages: res.data.data.pagination.total_pages
            });
          }
        }
      },
      complete: () => {
        this.setData({ isClubLoading: false });
      }
    });
  },

  /**
   * 加载活动参与成员
   */
  async loadEventMembers(eventId) {
    return new Promise((resolve) => {
      const token = wx.getStorageSync('token');
      wx.request({
        url: app.globalData.request_url + `/event/${eventId}/members`,
        method: 'GET',
        header: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        success: (res) => {
          if (res.data.Flag == 4000) {
            const members = res.data.data || [];
            resolve(members);
          }
        }
      });
    });
  },

  /**
   * 加载协会成员
   */
  async loadClubMembers(clubId) {
    return new Promise((resolve) => {
      const token = wx.getStorageSync('token');
      wx.request({
        url: app.globalData.request_url + `/club/${clubId}/members`,
        method: 'GET',
        header: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        success: (res) => {
          if (res.data.Flag == 4000) {
            const members = res.data.data || [];
            resolve(members);
          }
        }
      });
    });
  },

  /**
   * 获取未读通知数量
   */
  getUnreadNoticeCount: function() {
    const token = wx.getStorageSync('token');
    if (!token) return;
    wx.request({
      url: app.globalData.request_url + `/message/user_get/list`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      success: (res) => {
        if (res.data && res.data.Flag == 4000) {
          this.setData({
            unread_messages_count: res.data.data.filter(msg => !msg.readDate).length || 0
          });
        }
      },
      fail: (err) => {
        console.error('获取未读通知数量失败:', err);
      }
    });
  },



  /**
   * 跳转到用户信息页面
   */
  navigateToUserInfo: function() {
    const token = wx.getStorageSync('token');
    if (!token) {
      wx.navigateTo({
        url: '/pages/login/index'
      });
      return;
    }
    
    wx.navigateTo({
      url: `/packageProfile/index?id=${this.data.userInfo.id}`
    });
  },

  /**
   * 通知面板展开回调
   */
  onMessagesPanelExpand: function() {
    this.setData({
      messagesPanelExpanded: true
    });
    // 数据已在 onShow 中加载，这里不需要再次加载
  },

  /**
   * 通知面板收起回调
   */
  onMessagesPanelCollapse: function() {
    this.setData({
      messagesPanelExpanded: false
    });
  },

  /**
   * 主动关闭通知面板
   */
  onMessagesPanelClose: function() {
    const panel = this.selectComponent('#homeMessagesPanel');
    if (panel && typeof panel.collapse === 'function') {
      panel.collapse();
    }
  },

  /**
   * 通知标签切换
   */
  onMessagesTabChange: function(event) {
    this.setData({
      messagesActiveTab: event.detail.index || 0
    });
  },

  /**
   * 加载通知数据
   */
  fetchMessagesForPanel: function() {
    const token = wx.getStorageSync('token');
    if (!token) {
      this.setData({
        messagesLoading: false
      });
      return;
    }

    this.setData({
      messagesLoading: true
    });

    wx.request({
      url: app.globalData.request_url + `/message/user_get/list`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      success: (res) => {
        if (res.data && res.data.Flag == 4000) {
          const messages = res.data.data || [];
          const {
            clubMessages,
            eventMessages,
            systemMessages
          } = this.classifyMessages(messages);
          const totalUnread = this.calculateTotalUnread(
            clubMessages,
            eventMessages,
            systemMessages
          );

          this.setData({
            messagesClubNotices: clubMessages,
            messagesEventNotices: eventMessages,
            messagesSystemNotices: systemMessages,
            messagesEmptyClub: clubMessages.length === 0,
            messagesEmptyEvent: eventMessages.length === 0,
            messagesEmptySystem: systemMessages.length === 0,
            messagesLoading: false,
            unread_messages_count: totalUnread
          });
        } else {
          this.setData({
            messagesClubNotices: [],
            messagesEventNotices: [],
            messagesSystemNotices: [],
            messagesEmptyClub: true,
            messagesEmptyEvent: true,
            messagesEmptySystem: true,
            messagesLoading: false,
            unread_messages_count: 0
          });
        }
      },
      fail: (err) => {
        console.error('加载通知失败:', err);
        this.setData({
          messagesLoading: false
        });
        wx.showToast({
          title: '通知加载失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 将通知按类型分类
   */
  classifyMessages: function(messages) {
    const clubMessages = [];
    const eventMessages = [];
    const systemMessages = [];

    (messages || []).forEach((message) => {
      const processedMessage = {
        ...message,
        created_time: app.formatDateTime(new Date(message.createDate))
      };

      if (this.isClubMessage(message.operation)) {
        clubMessages.push(processedMessage);
      } else if (this.isEventMessage(message.operation)) {
        eventMessages.push(processedMessage);
      } else {
        systemMessages.push(processedMessage);
      }
    });

    return {
      clubMessages,
      eventMessages,
      systemMessages
    };
  },

  /**
   * 点击通知项
   */
  onMessageItemTap: function(e) {
    const messageId = e.currentTarget.dataset.message_id;
    const url = e.currentTarget.dataset.url || '';
    const token = wx.getStorageSync('token');

    if (!messageId) return;

    wx.request({
      url: app.globalData.request_url + `/message/${messageId}/read`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      complete: () => {
        this.fetchMessagesForPanel();
      },
      success: () => {
        if (url) {
          this.onMessagesPanelClose();
          wx.navigateTo({
            url
          });
        }
      },
      fail: (err) => {
        console.error('更新通知状态失败:', err);
      }
    });
  },

  /**
   * 判断是否为协会相关消息
   */
  isClubMessage: function(operation) {
    const clubOperations = [
      'user_applicated',
      'application_processed',
      'club_created',
      'role_changed',
      'presidentship_changed',
      'club_expense_created',
      'join_club',
      'association',
      'added_to_club',
      'removed_from_club',
      'club_deleted'
    ];
    return clubOperations.includes(operation);
  },

  /**
   * 判断是否为活动相关消息
   */
  isEventMessage: function(operation) {
    const eventOperations = [
      'event_begin',
      'event_end',
      'join_event',
      'event_create',
      'event_cancelled',
      'schedule_new_event',
      'schedule_new_event_author',
      'event_pre_starttime_update'
    ];
    return eventOperations.includes(operation);
  },

  /**
   * 计算未读数量
   */
  calculateTotalUnread: function(clubMessages, eventMessages, systemMessages) {
    const unreadClub = (clubMessages || []).filter(msg => !msg.readDate).length;
    const unreadEvent = (eventMessages || []).filter(msg => !msg.readDate).length;
    const unreadSystem = (systemMessages || []).filter(msg => !msg.readDate).length;

    return unreadClub + unreadEvent + unreadSystem;
  },

  /**
   * 跳转到搜索页面
   */
  navigateToSearch: function() {
    // 检查登录状态
    const token = wx.getStorageSync('token');
    if (!token) {
      wx.navigateTo({
        url: '/pages/login/index'
      });
      return;
    }
    
    wx.navigateTo({
      url: '/packageHome/search/index'
    });
  },

  /**
   * 登录检查，未登录则先跳转到登录页
   */
  checkLoginBeforeNavigate: function(url) {
    const token = wx.getStorageSync('token');
    if (!token) {
      wx.navigateTo({
        url: '/pages/login/index'
      });
      return;
    }
    
    wx.showToast({
      title: '页面开发中',
      icon: 'none'
    });
  },


  navigateToEventDetail: function(e) {
    if(e.currentTarget.dataset.user_managed) {
      wx.navigateTo({
        url: `/packageEvent/event-manage/index?eventId=${e.currentTarget.dataset.event_id}`
      });
    } else {
      wx.navigateTo({
        url: `/packageEvent/event-detail/index?eventId=${e.currentTarget.dataset.event_id}`
      });
    }
  },

  // 跳转到活动管理页面（管理者）
  navigateToEventManage: function(e) {
    const eventId = e.currentTarget.dataset.event_id;
    wx.navigateTo({
      url: `/packageEvent/event-manage/index?eventId=${eventId}`
    });
  },

  // ========= 活动详情弹窗相关 =========
  
  // 活动详情面板更新回调（普通用户）
  onEventDetailPanelUpdate: function(e) {
    const { event } = e.detail || {};
    if (!event || !event.event_id) return;
    
    // 直接调用 updateInCache，recordChange 会在 applyLocalChanges 时统一处理
    this.updateInCache('event', event.event_id, event);
  },

  // 从面板跳转到协会
  onNavigateClubFromPanel: function(e) {
    const clubId = e.detail?.clubId;
    if (!clubId) return;
    
    wx.navigateTo({
      url: `/packageClub/club-detail/index?clubId=${clubId}`
    });
  },

  // 从弹窗跳转到协会（保留用于管理弹窗）
  navigateToClubFromPopup: function(e) {
    const clubId = e.currentTarget.dataset.club_id;
    const eventId = e.currentTarget.dataset.event_id;
    const isHot = e.currentTarget.dataset.isHot;
    if (!clubId) return;
    
    // 先关闭弹窗
    const popupId = isHot ? `#hot-event-manage-popup-${eventId}` : `#event-manage-popup-${eventId}`;
    const popup = this.selectComponent(popupId);
    if (popup && popup.collapse) {
      popup.collapse();
    }

    setTimeout(() => {
      wx.navigateTo({
        url: `/packageClub/club-detail/index?clubId=${clubId}`
      });
    }, 300);
  },

  // 从弹窗打开地图（保留用于管理弹窗）
  openLocationFromPopup: function(e) {
    const location = e.currentTarget.dataset.location;
    const locationData = e.currentTarget.dataset.location_data;
    if (!locationData) return;

    wx.openLocation({
      latitude: parseFloat(locationData.latitude),
      longitude: parseFloat(locationData.longitude),
      name: location || '活动地点',
      address: locationData.address || '',
      scale: 16
    });
  },

  /**
   * 跳转到协会详情页面
   */
  navigateToClubDetail: function(e) {
    // 支持多种参数名
    const clubId = e.currentTarget.dataset.club_id;
    const userLeaded = e.currentTarget.dataset.user_leaded;
    if(userLeaded) {
      wx.navigateTo({ 
        url: `/packageClub/club-manage/index?clubId=${clubId}`
      });
    } else {
      wx.navigateTo({
        url: `/packageClub/club-detail/index?clubId=${clubId}`
      });
    }
  },

  /**
   * 加载热门协会列表
   */
  async loadHotClubList() {
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.request_url + `/club/heat/list`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json'
        },
        success: (res) => {       
          if (res.data.Flag == 4000) {
            console.log('loadHotClubList response:', res.data.data);
            const clubs = res.data.data || [];
            
            // 为每个协会准备海报展示数据
    const processedClubsWithPoster = clubs.map((club, index) => {
              console.log(`Hot Club ${club.club_name}: cur_user_managed =`, club.cur_user_managed);
              return this.prepareClubForPoster(club, index);
            });

            this.setData({
              hotClubs: processedClubsWithPoster
            });
          } else {
            console.error('获取热门协会列表失败:', res.data);
            this.setData({ 
              hotClubs: []
            });
          }
          resolve();
        },
        fail: (err) => {
          console.error('热门协会列表请求失败:', err);
          this.setData({ 
            hotClubs: []
          });
          resolve();
        }
      });
    });
  },


  onScrollToLower: function() {
    // 0: 活动，1: 协会
    if (this.data.activeTab == 1) {
      // 协会tab
    this.loadClubList(this.data.clubPage + 1);
    } else if (this.data.activeTab == 0) {
      // 活动tab
    this.loadEventList(this.data.eventPage + 1);
    }
  },

  onScrollViewScroll: function(e) {
    // Handle scroll event if needed
    // This method is called when the scroll-view scrolls
  },

  onScrollTouchStart: function(e) {
    // Handle touch start on scroll view
  },

  onScrollTouchMove: function(e) {
    // Handle touch move on scroll view
  },

  onScrollTouchEnd: function(e) {
    // Handle touch end on scroll view
  },

  onEventImgLoad(e) {
    console.log("onEventImgLoad");
    const idx = e.currentTarget.dataset.index;
    const list = this.data.eventList;
    if (list[idx] && !list[idx].imgLoaded) {
      list[idx].imgLoaded = true;
      this.setData({ eventList: list });
    }
  },
  onClubImgLoad(e) {
    const idx = e.currentTarget.dataset.index;
    const list = this.data.clubList;
    if (list[idx] && !list[idx].imgLoaded) {
      list[idx].imgLoaded = true;
      this.setData({ clubList: list });
    }
  },


  /**
   * 为协会数据准备海报展示数据
   */
  prepareClubForPoster(club, index) {
    // 准备 isotope 背景数据（二维数组，每一组是一个 item 数组）
    const coverGroup = this.prepareClubForIsotope_cover(club, index) || [];
    const memberGroup = this.prepareClubForIsotope_members(club, index) || [];
    const isotopeData = [coverGroup, memberGroup].filter(group => Array.isArray(group) && group.length > 0);

    // 提取社长信息
    const president = club.president_info ? {
      avatar: app.convertToThumbnailUrl(club.president_info.avatar, 120),
      name: club.president_info.user_name || club.president_info.name
    } : null;

    // 提取成员头像（前5个）
    const members = (club.recent_members || [])
      .slice(0, 5)
      .map(member => ({
        avatar: app.convertToThumbnailUrl(member.avatar, 80),
        name: member.user_name
      }));

    // 生成协会标签（基于协会名称和描述提取关键词）

    // 计算统计数据
    const memberCount = club.member_count || 0;
    const eventCount = (club.recent_events || []).length;

    return {
      ...club,
      isotopeData: isotopeData, // isotope背景数据
      posterData: {
        president,
        members,
        totalMembers: memberCount,
        memberCount,
        eventCount
      }
    };
  },


  /**
   * 为协会数据添加 isotope 组件需要的尺寸信息，并将图片URL转换为缩略图URL（背景版）
   */
  prepareClubForIsotope_cover(club, index) {
    // 只保留协会封面和活动封面，放大尺寸作为背景

    // 为协会封面创建数据（放大尺寸）
    const clubCoverData = {
      id: `${club.club_id || `club-${index}`}-cover`,
      image: app.convertToThumbnailUrl(club.cover_url, 200), // 300rpx高度，更大作为主要背景
      type: 'club_cover',
      ini_height: 200, // 调整为更合理的尺寸
      ini_width: 200,
      club_id: club.club_id,
      club_name: club.club_name
    };

    // 为活动封面创建数据（取前几个，放大尺寸）
    const eventImagesData = [];
    (club.recent_events || []).slice(0, 3).forEach((event, eventIndex) => { // 限制活动数量
      (event.event_imgs || []).slice(0, 2).forEach((event_img, imgIndex) => { // 每个活动最多2张图片
    if (eventImagesData.length < 6) { // 总共最多6张活动图片
          eventImagesData.push({
            id: `${club.club_id || `club-${index}`}-event-${eventIndex}-${imgIndex}`,
            image: app.convertToThumbnailUrl(event_img, 150), // 250rpx高度，放大尺寸
            type: 'event_image',
            club_id: club.club_id,
            title: event.title,
            ini_height: 150, // 调整为更合理的尺寸
            ini_width: 150,
            event_title: event.title
          });
        }
      });
    });

    // 只保留协会封面和活动图片
    const allImagesData = [
      clubCoverData,
      ...eventImagesData
    ].filter(Boolean);

    return allImagesData; // 只返回图片数据数组，不包装在club对象中
  },

  prepareClubForIsotope_members(club, index) {
    // 只保留协会成员头像，放大尺寸
    const members = club.recent_members || [];
    const memberImagesData = members.map((member, memberIndex) => ({
      id: `${club.club_id || `club-${index}`}-member-${member.user_id || memberIndex}`,
      image: app.convertToThumbnailUrl(member.avatar, 100),
      type: 'member_image',
      ini_height: 100,
      ini_width: 100
    }));
    return memberImagesData;
  },

  // ========= 活动管理弹窗相关方法 =========

  // 热门活动管理弹窗展开
  onHotEventManagePopupExpand: function(e) {
    // 懒加载已通过 contentReady 事件处理
  },

  // 跳转到详细管理页面
  goToEventManageDetail: function(e) {
    const eventId = e.currentTarget.dataset.event_id;
    const hotIndex = e.currentTarget.dataset.hotIndex;
    const index = e.currentTarget.dataset.index;
    if (!eventId) return;

    // 先关闭弹窗
    let popupId;
    if (hotIndex !== undefined) {
      popupId = `#hot-event-manage-popup-${eventId}`;
    } else if (index !== undefined) {
      popupId = `#event-manage-popup-${eventId}`;
    }
    
    if (popupId) {
      const popup = this.selectComponent(popupId);
      if (popup && popup.collapse) {
        popup.collapse();
      }
    }

    setTimeout(() => {
      wx.navigateTo({
        url: `/packageEvent/event-manage/index?eventId=${eventId}`
      });
    }, 300);
  },

  // 活动列表管理弹窗展开
  onEventManagePopupExpand: function(e) {
    // 懒加载已通过 contentReady 事件处理
  },

  // 统一的弹窗内容就绪事件处理（懒加载）
  onPanelContentReady: function(e) {
    const panelId = e.currentTarget?.dataset?.panelId;
    if (panelId) {
      const panel = this.selectComponent(`#${panelId}`);
      if (panel && typeof panel.loadData === 'function') {
        panel.loadData();
      }
    }
  },

  // ========= 全局弹窗相关方法 =========

  // 打开全局弹窗
  openGlobalPopup: function(e) {
    const dataset = e.currentTarget.dataset;
    const type = dataset.popupType;
    const id = dataset.popupId;
    const bgColor = dataset.bgColor || '#f7f8fa';
    const sheetBgColor = dataset.sheetBgColor || '#f7f8fa';
    
    console.log('openGlobalPopup 被调用:', { type, id, loading: true });
    
    // 从 ripple 组件的 detail 中获取触摸坐标
    let tapX, tapY;
    if (e.detail && e.detail.changedTouches && e.detail.changedTouches[0]) {
      tapX = e.detail.changedTouches[0].clientX;
      tapY = e.detail.changedTouches[0].clientY;
      console.log('从 ripple 组件获取坐标:', tapX, tapY);
    } else if (e.detail && e.detail.touches && e.detail.touches[0]) {
      tapX = e.detail.touches[0].clientX;
      tapY = e.detail.touches[0].clientY;
      console.log('从 ripple 组件 touches 获取坐标:', tapX, tapY);
    } else {
      // 降级方案：使用屏幕中心
      const sys = wx.getSystemInfoSync();
      tapX = sys.windowWidth / 2;
      tapY = sys.windowHeight / 2;
      console.log('使用屏幕中心坐标:', tapX, tapY);
    }
    
    this.setData({
      globalPopup: {
        visible: true,
        loading: true,
        renderPanel: false,
        type,
        id,
        bgColor,
        sheetBgColor,
        tapX,
        tapY
      }
    }, () => {
      console.log('globalPopup 数据已设置:', this.data.globalPopup);
      setTimeout(() => {
        const popup = this.selectComponent('#globalFullscreenPopup');
        if (popup && popup.expand) {
          popup.expand(tapX, tapY);
        } else {
          console.error('找不到 globalFullscreenPopup 组件');
        }
      }, 50);
    });
  },

  // 关闭全局弹窗
  closeGlobalPopup: function() {
    const popup = this.selectComponent('#globalFullscreenPopup');
    if (popup && popup.collapse) {
      popup.collapse();
    }
  },

  // 全局弹窗收起回调 - 延迟隐藏以等待动画完成
  onGlobalPopupCollapse: function() {
    // 不需要手动调用 applyLocalChanges，因为 recordChange 会自动广播
    
    // 延迟设置 visible: false，等待收回动画完成
    // 动画时长约为 animationDuration(300) + slideDur(360) ≈ 700ms
    setTimeout(() => {
      this.setData({
        'globalPopup.visible': false,
        'globalPopup.loading': true,
        'globalPopup.renderPanel': false,  // 重置 renderPanel
        'globalPopup.type': '',
        'globalPopup.id': ''
      });
    }, 800);
  },

  // 全局弹窗内容准备好回调
  onGlobalPopupContentReady: function() {
    console.log('onGlobalPopupContentReady 被调用，开始渲染 panel');
    // 弹窗动画完成，现在可以渲染 panel 了
    this.setData({
      'globalPopup.renderPanel': true
    }, () => {
      // 等待 panel 渲染后，调用 loadData
      setTimeout(() => {
        const { type } = this.data.globalPopup;
        let panelId = '';
        
        if (type === 'event-detail') {
          panelId = '#globalEventDetailPanel';
        } else if (type === 'event-manage') {
          panelId = '#globalEventManagePanel';
        } else if (type === 'club-detail') {
          panelId = '#globalClubDetailPanel';
        } else if (type === 'club-manage') {
          panelId = '#globalClubManagePanel';
        }
        
        if (panelId) {
          const panel = this.selectComponent(panelId);
          if (panel && panel.loadData) {
            panel.loadData();
          }
        }
      }, 100);
    });
  },

  // 全局弹窗内容加载完成回调
  onGlobalPopupLoaded: function() {
    console.log('onGlobalPopupLoaded 被调用，设置 loading = false');
    this.setData({
      'globalPopup.loading': false
    });
  },

  /**
   * 页面分享配置（使用 app.globalData.shareInfo 生成分享链接）
   */
  async onShareAppMessage() {
    console.log('📤 home onShareAppMessage 被调用');
    console.log('当前分享信息:', app.globalData.shareInfo);
    
    const shareInfo = app.globalData.shareInfo;
    
    // 如果有分享信息
    if (shareInfo && shareInfo.type && shareInfo.id) {
      console.log('✅ 使用 app.globalData.shareInfo 生成分享链接');
      
      if (shareInfo.type === 'event') {
        return {
          title: shareInfo.title || '点击查看活动详情',
          path: `/pages/share-redirect/index?eventId=${shareInfo.id}&autoOpen=joined`,
          imageUrl: shareInfo.imageUrl
        };
      } else if (shareInfo.type === 'club') {
        return {
          title: shareInfo.title || '点击查看协会详情',
          path: `/pages/share-redirect/index?clubId=${shareInfo.id}`,
          imageUrl: shareInfo.imageUrl
        };
      }
    }
    
    // 默认分享
    console.log('⚠️ 使用默认分享配置');
    return {
      title: '来看看这个小程序',
      path: '/pages/home/index'
    };
  }
}) 