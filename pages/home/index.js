const app = getApp();
const { submitClockIn } = require('../../utils/event-clockin');
const panelLazy = require('../../utils/panel-lazy-load');
const { getDefaultAvatarUrl } = require('../../utils/default-avatar');

const PANEL_REVEAL_MS = 280;

Page({
  data: {
    // 用户信息
    userInfo: {},
    // 活动列表
    default_avatar: getDefaultAvatarUrl(),
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
    hotEventCurrent: 0,
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

    // 通知角标（与 GET /badge 同源）：count 为未读条数；seen 为已打开过通知面板
    notice_badge_count: 0,
    notice_badge_seen: false,
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
    /** 通知列表被 clear-parent 子级盖住时的挂起态 */
    messagesContentSuspended: false,
    messagesContentSuspendMode: '',

    // 通知中心全屏弹窗（头像点击打开）
    messagesFs: {
      visible: false,
      tapX: 0,
      tapY: 0
    },

    // 全局弹窗状态（用于 swiper 内的卡片点击）
    globalPopup: {
      visible: false,
      loading: true,
      renderPanel: false,
      skeletonFading: false,
      panelContentVisible: false,
      type: '',
      id: '',
      data: {},
      tapX: 0,
      tapY: 0
    },
    /** 全屏详情栈：同层 expandable 内切换 type/id，返回时 pop */
    globalPopupStack: [],
    /** 栈深 > 1 时返回只 pop 栈，不收起 sheet */
    globalPopupDeferBack: false,
    /** 栈切换时内容区过渡类：push-in | pop-in */
    globalPopupStackAnim: '',
    /** 栈 push/pop 过渡层：push 时盖在父 panel 上，pop 时盖住正在收起的子 panel */
    globalPopupOverlay: null,

    /** 任一侧全屏弹窗打开：冻结抽屉 transition、忽略抽屉/右滑进抽屉的 touch，减轻与全屏层偶发合成闪一下 */
    homeFullscreenLayerActive: false,

    /** 与 app.notifyFullscreenBackIntercept 同步：根级唯一 page-container 是否挂载（拦截系统返回） */
    fsBackInterceptShow: false,

    /** 全局全屏 expandable 左上角返回：添加成员嵌套全屏打开时由 club-manage-panel 置为 false */
    hostExpandableBackShow: true,

    clockinSignature: {
      visible: false,
      eventId: '',
      submitting: false,
    },
  },

  onFsBackInterceptBeforeLeave() {
    try {
      if (getApp().globalData && getApp().globalData.__fsBackPcPulse) return
      const t = getApp().globalData.__fullscreenBackTarget
      if (t && typeof t.receiveRootPageContainerBeforeLeave === 'function') {
        t.receiveRootPageContainerBeforeLeave()
      }
    } catch (e) {}
  },

  onFsBackInterceptAfterLeave() {
    try {
      if (getApp().globalData && getApp().globalData.__fsBackPcPulse) return
      const t = getApp().globalData.__fullscreenBackTarget
      if (t && typeof t.receiveRootPageContainerAfterLeave === 'function') {
        t.receiveRootPageContainerAfterLeave()
      }
    } catch (e) {}
  },

  /** custom tabBar 下勿调 wx.showTabBar，真机会叠出 app.json 里仅两 tab 的系统栏 */
  _setCustomTabBarHidden(hidden) {
    try {
      if (typeof this.getTabBar === 'function') {
        const tb = this.getTabBar();
        if (tb && typeof tb.setTabBarHidden === 'function') {
          tb.setTabBarHidden(!!hidden);
        }
      }
    } catch (e) {}
  },

  syncHomeFullscreenLayerState() {
    try {
      const gp = this.data.globalPopup || {}
      const mf = this.data.messagesFs || {}
      const active = Boolean(gp.visible) || Boolean(mf.visible)
      const prev = this.data.homeFullscreenLayerActive
      if (prev === active) return
      this.setData({ homeFullscreenLayerActive: active })
      // 全屏弹层：只隐藏自定义 tabBar（getTabBar），不用 wx.hideTabBar/showTabBar
      this._setCustomTabBarHidden(active)
    } catch (e) {}
  },

  // 点击头像打开通知中心（全屏弹窗）
  openMessagesFullscreen(e) {
    const token = wx.getStorageSync('token');
    if (!token) {
      wx.navigateTo({ url: '/pages/login/index' });
      return;
    }
    // 触摸坐标
    const t = (e?.changedTouches && e.changedTouches[0]) || (e?.touches && e.touches[0]);
    const sys = wx.getSystemInfoSync();
    const tapX = t ? t.clientX : sys.windowWidth / 2;
    const tapY = t ? t.clientY : sys.windowHeight / 2;

    this.setData({
      'messagesFs.visible': true,
      'messagesFs.tapX': tapX,
      'messagesFs.tapY': tapY
    }, () => {
      this.syncHomeFullscreenLayerState()
      // 展开弹窗
      setTimeout(() => {
        const popup = this.selectComponent('#homeMessagesFullscreenPopup');
        if (popup && popup.expand) popup.expand(tapX, tapY);
      }, 50);
    });
  },

  closeMessagesFullscreen() {
    const popup = this.selectComponent('#homeMessagesFullscreenPopup');
    if (popup && popup.collapse) popup.collapse();
  },

  onMessagesFsCollapse() {
    // 等待收起动画结束后再隐藏
    setTimeout(() => {
      this.setData({ 'messagesFs.visible': false }, () => {
        this.syncHomeFullscreenLayerState()
      })
    }, 800);
  },

  onMessagesFsContentReady() {
    // 确保进入弹窗时通知数据是最新的；展开后再标记已看列表
    this.fetchMessagesForPanel(() => this.markNoticeBadgeSeen());
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
    try {
      this._setCustomTabBarHidden(false)
    } catch (e) {}
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
      panelLazy.preloadAllPanelSubpackages();
      // 智能检查：超过5分钟才整体刷新，否则只做局部变更
    this.smartCheckAndUpdate();
      // 加载通知数据
    this.fetchMessagesForPanel();
    }
    this.syncHomeFullscreenLayerState()
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

      // recordChange 的 data 含 type:'event'；空字符串 cover_url 会冲掉原封面，这里先剥掉再合并
      const eventPatchFromChange = (incoming) => {
        const patch = { ...incoming };
        delete patch.type;
        if (!patch.cover_url && !patch.cover) {
          delete patch.cover_url;
          delete patch.cover;
        }
        return patch;
      };

      if (eventList.some(e => e && e.event_id == id)) {
        const next = eventList.map(e => {
          if (e && e.event_id == id) {
            const patch = eventPatchFromChange(data);
            const updatedEvent = { ...e, ...patch };
            if (patch.cover_url || patch.cover) {
              const coverUrl = patch.cover_url || patch.cover;
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
            const patch = eventPatchFromChange(data);
            const updatedEvent = { ...e, ...patch };
            if (patch.cover_url || patch.cover) {
              const coverUrl = patch.cover_url || patch.cover;
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
        const nextHot = hotClubs.map((c, hotIndex) => {
          if (c && (c.club_id == id || c.id == id)) {
            const patch = { ...data };
            delete patch.type;
            const merged = { ...c, ...patch };
            if (patch.cover_url) {
              merged.cover_url_thumb = app.convertToThumbnailUrl(patch.cover_url, 400);
            }
            if (patch.cover_url || patch.post_files) {
              return this.prepareClubForPoster(merged, hotIndex);
            }
            return merged;
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
      if (data.type) delete data.type;
      if (data.location_data && data.location_data.latitude && data.location_data.longitude && !data.markerData) {
        data.markerData = [{
          id: 1,
          latitude: data.location_data.latitude,
          longitude: data.location_data.longitude,
          width: 20,
          height: 20,
        }];
      }
      data.imgLoaded = true;
      data.cur_user_managed = true
      data.cover_url_thumb = data.cover_url ? app.convertToThumbnailUrl(data.cover_url, 200) : '';
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
    
    const touch = e.touches[0];
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
    if (this.data.homeFullscreenLayerActive) return;

    const touch = e.touches[0];
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

    if (this.data.homeFullscreenLayerActive) {
      this.setData({
        eventItemTouching: false,
        eventItemCatchMove: false,
        swiperToDrawerMode: false,
        swiperDisableTouch: false,
        drawerTouching: false
      })
      return
    }

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
    console.log('协会swiper切换到:', current);
  },

  onEventSwiperChange(e) {
    const current = e.detail && e.detail.current;
    if (typeof current === 'number') {
      this.setData({ hotEventCurrent: current });
    }
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
    if (this.data.homeFullscreenLayerActive) return;

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
    if (this.data.homeFullscreenLayerActive) return;

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
    if (this.data.homeFullscreenLayerActive) return;
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
          // 首页“最新活动”不展示已结束活动
          const realData = (res.data.data.records || [])
            .filter((activity) => !activity.is_ended)
            .map(activity => {
              // 开始时间展示：优先使用后端返回 start_time（going 列表应当有），兜底用 pre_startTime/actual_startTime
              const rawStart = activity.start_time || activity.actual_startTime || activity.pre_startTime || activity.pre_start_time || activity.actual_start_time
              activity.start_time = rawStart ? app.formatDateTime(new Date(rawStart)) : ''
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
            const processedActivities = activities
              // 首页热门活动：不展示已结束活动
              .filter((activity) => !activity.is_ended)
              .map(activity => {
              // 格式化开始时间（同上兜底）
              const rawStart = activity.start_time || activity.actual_startTime || activity.pre_startTime || activity.pre_start_time || activity.actual_start_time
              activity.start_time = rawStart ? app.formatDateTime(new Date(rawStart)) : ''
            
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

  _badgeFlagOk: function(res) {
    const f = res && res.data && res.data.Flag;
    return f === 4000 || f === '4000' || String(f) === '4000';
  },

  _applyNoticeBadgeFromPayload: function(data) {
    const badges = (data && data.badges) || {};
    const n = badges.notice || {};
    const count = Number(n.count) || 0;
    const seen = !!n.seen;
    this.setData({ notice_badge_count: count, notice_badge_seen: seen });
  },

  /** GET /badge，同步头像角标 */
  fetchNoticeBadge: function(done) {
    const token = wx.getStorageSync('token');
    if (!token) {
      this.setData({ notice_badge_count: 0, notice_badge_seen: false });
      if (typeof done === 'function') done();
      return;
    }
    wx.request({
      url: app.globalData.request_url + `/badge`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      complete: () => {
        if (typeof done === 'function') done();
      },
      success: (res) => {
        if (this._badgeFlagOk(res) && res.data.data) {
          this._applyNoticeBadgeFromPayload(res.data.data);
        }
      },
      fail: (err) => {
        console.error('获取角标失败:', err);
      }
    });
  },

  /** 打开过通知列表后：数字角标改为红点 */
  markNoticeBadgeSeen: function() {
    const token = wx.getStorageSync('token');
    if (!token) return;
    wx.request({
      url: app.globalData.request_url + `/badge/seen`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: { keys: ['notice'] },
      success: (res) => {
        if (this._badgeFlagOk(res) && res.data.data) {
          this._applyNoticeBadgeFromPayload(res.data.data);
        }
      }
    });
  },

  /**
   * 获取未读通知角标（供 loadData 等调用，与旧名兼容）
   */
  getUnreadNoticeCount: function() {
    this.fetchNoticeBadge();
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
    
    wx.switchTab({
      url: '/pages/profile/index'
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
    const raw = event?.detail?.value
    const idx = (raw === 0 || raw === 1 || raw === 2) ? raw : Number(raw)
    this.setData({ messagesActiveTab: isFinite(idx) ? idx : 0 });
  },

  /** 供 expandable clear-parent：子级全屏展开时清空通知列表 */
  suspendContentToBlank() {
    this.setData({
      messagesContentSuspended: true,
      messagesContentSuspendMode: 'blank'
    });
  },

  /** 供 expandable clear-parent：子级收起后骨架屏并重载通知列表 */
  resumeContentWithSkeletonReload() {
    this.setData({
      messagesContentSuspended: true,
      messagesContentSuspendMode: 'skeleton'
    });
    return new Promise((resolve) => {
      this.fetchMessagesForPanel(() => {
        this.setData({
          messagesContentSuspended: false,
          messagesContentSuspendMode: ''
        });
        resolve();
      }, { silent: true });
    });
  },

  /**
   * 加载通知数据
   */
  /**
   * @param {Function} [done]
   * @param {{ silent?: boolean }} [options] silent=true 时不切全屏骨架，避免标记已读后整页通知列表卸载重挂
   */
  fetchMessagesForPanel: function(done, options) {
    const silent = !!(options && options.silent);
    const token = wx.getStorageSync('token');
    if (!token) {
      this.setData({
        messagesLoading: false
      });
      if (typeof done === 'function') done();
      return;
    }

    if (!silent) {
      this.setData({
        messagesLoading: true
      });
    }

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

          this.setData({
            messagesClubNotices: clubMessages,
            messagesEventNotices: eventMessages,
            messagesSystemNotices: systemMessages,
            messagesEmptyClub: clubMessages.length === 0,
            messagesEmptyEvent: eventMessages.length === 0,
            messagesEmptySystem: systemMessages.length === 0,
            messagesLoading: false
          }, () => {
            this.fetchNoticeBadge(done);
          });
        } else {
          this.setData({
            messagesClubNotices: [],
            messagesEventNotices: [],
            messagesSystemNotices: [],
            messagesEmptyClub: true,
            messagesEmptyEvent: true,
            messagesEmptySystem: true,
            messagesLoading: false
          }, () => {
            this.fetchNoticeBadge(done);
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
        if (typeof done === 'function') done();
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
      const normalizedUrl = (message.url || message.URL || message.Url || message.link_url || '').trim();
      const processedMessage = {
        ...message,
        created_time: app.formatDateTime(new Date(message.createDate)),
        url: normalizedUrl
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

  /** 解析通知 URL 查询串 */
  _parseNoticeUrlParams(qs) {
    const params = {};
    (qs || '').split('&').filter(Boolean).forEach((kv) => {
      const eq = kv.indexOf('=');
      const k = eq >= 0 ? kv.slice(0, eq) : kv;
      const v = eq >= 0 ? kv.slice(eq + 1) : '';
      if (k) {
        try {
          params[decodeURIComponent(k)] = decodeURIComponent(v || '');
        } catch (e) {
          params[k] = v || '';
        }
      }
    });
    return params;
  },

  /**
   * 将通知 URL / operation 映射为 globalPopup 配置；无法映射返回 null
   */
  _resolveNoticeUrlToPopup(url, operation) {
    const raw = (url || '').trim();
    if (!raw && !operation) return null;

    const qIdx = raw.indexOf('?');
    const basePath = (qIdx >= 0 ? raw.slice(0, qIdx) : raw).replace(/\/+$/, '') || '';
    const params = this._parseNoticeUrlParams(qIdx >= 0 ? raw.slice(qIdx + 1) : '');
    const clubId = params.clubId || params.club_id || '';
    const eventId = params.eventId || params.event_id || '';
    const userId = params.id || params.userId || params.user_id || '';

    const matchPath = (...paths) => paths.includes(basePath);

    if (matchPath('/packageClub/club-manage/index') && clubId) {
      return { type: 'club-manage', id: String(clubId), data: {} };
    }
    if (matchPath('/packageClub/club-detail/index') && clubId) {
      return { type: 'club-detail', id: String(clubId), data: {} };
    }
    if (matchPath('/packageClub/club-joined/index') && clubId) {
      return { type: 'club-joined', id: String(clubId), data: {} };
    }
    if (matchPath('/packageEvent/event-manage/index') && eventId) {
      return { type: 'event-manage', id: String(eventId), data: {} };
    }
    if (matchPath('/packageEvent/event-detail/index') && eventId) {
      return { type: 'event-detail', id: String(eventId), data: {} };
    }
    if (matchPath('/packageEvent/event-joined/index') && eventId) {
      return { type: 'event-joined', id: String(eventId), data: {} };
    }
    if (
      matchPath('/packageClub/club-applications/index', '/packageProfile/club-applications/index') &&
      clubId
    ) {
      return { type: 'club-applications', id: String(clubId), data: {} };
    }
    if (matchPath('/packageClub/my-applications/index', '/packageProfile/my-applications/index')) {
      return { type: 'my-applications', id: '', data: {} };
    }
    if (matchPath('/packageMoney/paypersonal/index', '/pages/money/paypersonal/index')) {
      return { type: 'paypersonal', id: '', data: {} };
    }
    if (basePath.indexOf('user-info') !== -1 && userId) {
      return { type: 'user-info', id: String(userId), data: {} };
    }

    if (operation === 'user_applicated' && clubId) {
      return { type: 'club-applications', id: String(clubId), data: {} };
    }

    return null;
  },

  _extractTapPointFromEvent(e) {
    const t = (e?.changedTouches && e.changedTouches[0]) ||
      (e?.touches && e.touches[0]) ||
      (e?.detail?.changedTouches && e.detail.changedTouches[0]) ||
      (e?.detail?.touches && e.detail.touches[0]);
    const sys = wx.getSystemInfoSync();
    return {
      tapX: t ? t.clientX : sys.windowWidth / 2,
      tapY: t ? t.clientY : sys.windowHeight / 2
    };
  },

  /**
   * 点击通知项：优先叠 globalPopup（通知层 clear-parent 变空白），否则 navigateTo
   */
  onMessageItemTap: function(e) {
    const messageId = e.currentTarget.dataset.message_id;
    const url = (e.currentTarget.dataset.url || '').trim();
    const operation = e.currentTarget.dataset.operation || '';
    const token = wx.getStorageSync('token');

    if (!messageId) return;

    const { tapX, tapY } = this._extractTapPointFromEvent(e);

    wx.request({
      url: app.globalData.request_url + `/message/${messageId}/read`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      complete: () => {
        this.fetchMessagesForPanel(undefined, { silent: true });
      },
      success: () => {
        const target = this._resolveNoticeUrlToPopup(url, operation);
        if (target && target.type) {
          this.openGlobalPopupByType(target.type, target.id, tapX, tapY, { data: target.data });
          return;
        }
        if (!url) return;

        wx.navigateTo({
          url,
          fail: (err) => {
            wx.showToast({ title: '跳转失败', icon: 'none' });
            console.error('通知跳转失败:', url, err);
          }
        });
      },
      fail: (err) => {
        console.error('更新通知状态失败:', err);
      }
    });
  },

  /** 通知内打开的 panel 有变更时刷新列表 */
  onGlobalPopupPanelUpdate: function() {
    this.fetchMessagesForPanel(undefined, { silent: true });
    this.fetchNoticeBadge();
  },

  // 通知 / 列表点击：在首页直接打开对应全屏弹窗（不收回通知弹窗）
  openGlobalPopupByType(type, id, tapX, tapY, extra) {
    const sys = wx.getSystemInfoSync();
    const safeX = (typeof tapX === 'number' && !Number.isNaN(tapX)) ? tapX : sys.windowWidth / 2;
    const safeY = (typeof tapY === 'number' && !Number.isNaN(tapY)) ? tapY : sys.windowHeight / 2;
    panelLazy.preloadForPanelType(type).then(() => {
      this._openGlobalPopupRoot(type, id, safeX, safeY, extra);
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

  /** 已参加活动面板内退出等：同步首页热门/列表缓存（recordChange 已广播时可再兜底） */
  onEventJoinedPanelUpdate: function(e) {
    const { event } = e.detail || {};
    if (event && event.event_id) {
      this.updateInCache('event', event.event_id, event);
    }
    this.applyLocalChanges();
  },

  /** 协会详情内嵌活动变更等 */
  onClubDetailPanelUpdate: function() {
    this.applyLocalChanges();
  },

  /** 协会管理面板变更（封面/海报/简介等，由 recordChange 写入 changes） */
  onClubManagePanelUpdate: function(e) {
    const { club } = e.detail || {};
    const clubId = club?.club_id || club?.id;
    if (club && clubId) {
      this.updateInCache('club', clubId, club);
    }
    this.applyLocalChanges();
  },

  /** 活动管理面板变更 */
  onEventManagePanelUpdate: function(e) {
    const { event } = e.detail || {};
    if (event?.event_id) {
      this.updateInCache('event', event.event_id, event);
    }
    this.applyLocalChanges();
  },

  /** 已加入协会面板内变更（与协会列表缓存对齐） */
  onClubJoinedPanelUpdate: function() {
    this.applyLocalChanges();
  },

  // 活动详情内点协会：压入 globalPopup 栈
  onNavigateClubFromPanel: function(e) {
    const clubId = e.detail?.clubId;
    if (!clubId) return;
    const type = e.detail?.popupType || 'club-detail';
    this._pushGlobalPopupStack(type, String(clubId), e.detail?.tapX, e.detail?.tapY);
  },

  // 协会详情内点活动：压入 globalPopup 栈
  onNavigateEventFromPanel: function(e) {
    const eventId = e.detail?.eventId;
    if (!eventId) return;
    const type = e.detail?.popupType || 'event-detail';
    this._pushGlobalPopupStack(type, String(eventId), e.detail?.tapX, e.detail?.tapY);
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
    const isotopeData = this.prepareClubForIsotope_coverAndPosts(club, index);

    const president = club.president_info ? {
      avatar: app.convertToThumbnailUrl(club.president_info.avatar, 120),
      name: club.president_info.user_name || club.president_info.name
    } : null;

    const members = (club.recent_members || [])
      .slice(0, 5)
      .map(member => ({
        avatar: app.convertToThumbnailUrl(member.avatar, 80),
        name: member.user_name
      }));

    const memberCount = club.member_count || 0;
    const eventCount = club.recent_event_count != null
      ? club.recent_event_count
      : (club.recent_events || []).length;

    return {
      ...club,
      isotopeData,
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
   * 热门协会 isotope：封面一组 → 全部海报拼贴一组(150) → 每张海报单独一组(400)
   */
  prepareClubForIsotope_coverAndPosts(club, index) {
    return app.buildClubPosterIsotopeData(club, {
      clubKey: club.club_id || `club-${index}`
    });
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
      panelLazy.invokePanelLoadData(this, `#${panelId}`);
    }
  },

  _onGlobalPopupPanelLoadTimeout(panelSelector) {
    console.warn('[home] panel load timeout:', panelSelector);
    if (this.data.globalPopup && this.data.globalPopup.loading) {
      this.setData({ 'globalPopup.loading': false });
    }
    if (this.data.globalPopupOverlay && this.data.globalPopupOverlay.loading) {
      this.setData({ 'globalPopupOverlay.loading': false });
    }
    wx.showToast({ title: '加载较慢，请重试', icon: 'none' });
  },

  // ========= 全局弹窗相关方法 =========

  _panelIdForGlobalPopupType(type) {
    const map = {
      'event-detail': '#globalEventDetailPanel',
      'event-joined': '#globalEventJoinedPanel',
      'event-manage': '#globalEventManagePanel',
      'club-detail': '#globalClubDetailPanel',
      'club-joined': '#globalClubJoinedPanel',
      'club-manage': '#globalClubManagePanel',
      'club-applications': '#globalClubApplicationsPanel',
      'my-applications': '#globalMyApplicationsPanel',
      'paypersonal': '#globalPaypersonalPanel',
      'user-info': '#globalUserInfoPanel'
    };
    return map[type] || '';
  },

  _overlayPanelIdForType(type) {
    const map = {
      'event-detail': '#overlayEventDetailPanel',
      'event-joined': '#overlayEventJoinedPanel',
      'event-manage': '#overlayEventManagePanel',
      'club-detail': '#overlayClubDetailPanel',
      'club-joined': '#overlayClubJoinedPanel',
      'club-manage': '#overlayClubManagePanel'
    };
    return map[type] || '';
  },

  _renderGlobalPopupOverlayPanel() {
    const ov = this.data.globalPopupOverlay;
    if (!ov) return;
    panelLazy.preloadForPanelType(ov.type).then(() => {
      this.setData({ 'globalPopupOverlay.renderPanel': true }, () => {
        const panelId = this._overlayPanelIdForType(ov.type);
        if (!panelId) return;
        panelLazy.invokePanelLoadData(this, panelId, {
          onTimeout: () => this._onGlobalPopupPanelLoadTimeout(panelId)
        });
      });
    });
  },

  onGlobalPopupStackPushMid() {
    const ov = this.data.globalPopupOverlay;
    if (!ov) return;
    this.setData({ 'globalPopupOverlay.enterActive': true }, () => {
      this._renderGlobalPopupOverlayPanel();
    });
  },

  onGlobalPopupStackPushComplete() {
    const ov = this.data.globalPopupOverlay;
    if (!ov) return;
    const stack = this.data.globalPopupStack || [];
    const pending = stack[stack.length - 1];
    if (!pending) return;
    this.setData({
      globalPopupOverlay: null,
      'globalPopup.type': pending.type,
      'globalPopup.id': pending.id,
      'globalPopup.loading': ov.loading !== false,
      'globalPopup.renderPanel': !!ov.renderPanel
    }, () => {
      if (this.data.globalPopup.renderPanel && !this.data.globalPopup.loading) return;
      if (this.data.globalPopup.renderPanel) {
        const panelId = this._panelIdForGlobalPopupType(pending.type);
        if (panelId) {
          panelLazy.invokePanelLoadData(this, panelId, {
            onTimeout: () => this._onGlobalPopupPanelLoadTimeout(panelId)
          });
        }
      } else {
        this._renderGlobalPopupPanel();
      }
    });
  },

  onGlobalPopupOverlayLoaded() {
    if (!this.data.globalPopupOverlay) return;
    this.setData({ 'globalPopupOverlay.loading': false });
  },

  _renderGlobalPopupPanel() {
    const type = this.data.globalPopup.type;
    panelLazy.preloadForPanelType(type).then(() => {
      this.setData({
        'globalPopup.renderPanel': true,
        'globalPopup.panelContentVisible': true,
        'globalPopup.loading': false,
        'globalPopup.skeletonFading': false,
      }, () => {
        const panelId = this._panelIdForGlobalPopupType(type);
        if (!panelId) return;
        panelLazy.invokePanelLoadData(this, panelId, {
          onTimeout: () => this._onGlobalPopupPanelLoadTimeout(panelId)
        });
      });
    });
  },

  _clearGlobalPopupStackAnimLater() {
    if (this.__gpStackAnimTimer) clearTimeout(this.__gpStackAnimTimer);
    this.__gpStackAnimTimer = setTimeout(() => {
      this.setData({ globalPopupStackAnim: '' });
    }, 380);
  },

  _getGlobalPopupBackRipplePoint() {
    const popup = this.selectComponent('#globalFullscreenPopup');
    const sys = wx.getSystemInfoSync();
    let tapY = Number(sys.statusBarHeight || 0) + 44;
    try {
      const nav = popup && popup.data && popup.data.fsNav;
      if (nav && nav.totalHeight) tapY = Math.max(tapY, Number(nav.totalHeight) - 16);
    } catch (e) {}
    return { tapX: 28, tapY };
  },

  _playGlobalPopupStackPushRipple(tapX, tapY) {
    const popup = this.selectComponent('#globalFullscreenPopup');
    if (popup && typeof popup.playStackPushRipple === 'function') {
      return popup.playStackPushRipple(tapX, tapY);
    }
    this.onGlobalPopupStackPushMid();
    setTimeout(() => this.onGlobalPopupStackPushComplete(), 400);
    return Promise.resolve();
  },

  _playGlobalPopupStackPopRipple(tapX, tapY) {
    const popup = this.selectComponent('#globalFullscreenPopup');
    if (popup && typeof popup.playStackPopRipple === 'function') {
      return popup.playStackPopRipple(tapX, tapY);
    }
    return Promise.resolve();
  },

  /** 首次打开全屏（带涟漪展开） */
  _openGlobalPopupRoot(type, id, tapX, tapY, extra) {
    const bgColor = 'rgba(223, 118, 176, 0.8)';
    const sheetBgColor = '#f7f8fa';
    const popupData = (extra && extra.data) ? extra.data : {};
    const safeId = String(id || '');
    this.setData({
      globalPopupStack: [{ type, id: safeId, tapX, tapY, data: popupData }],
      globalPopupDeferBack: false,
      globalPopup: {
        visible: true,
        loading: true,
        renderPanel: false,
        skeletonFading: false,
        panelContentVisible: false,
        type,
        id: safeId,
        data: popupData,
        bgColor,
        sheetBgColor,
        tapX,
        tapY
      }
    }, () => {
      this.syncHomeFullscreenLayerState();
      setTimeout(() => {
        const popup = this.selectComponent('#globalFullscreenPopup');
        if (popup && popup.expand) popup.expand(tapX, tapY);
      }, 50);
    });
  },

  /** 栈 push：父级保持 type 并显示骨架，子级走 overlay 叠层 */
  _pushGlobalPopupStack(type, id, tapX, tapY) {
    const sys = wx.getSystemInfoSync();
    const safeX = (typeof tapX === 'number' && !isNaN(tapX)) ? tapX : sys.windowWidth / 2;
    const safeY = (typeof tapY === 'number' && !isNaN(tapY)) ? tapY : sys.windowHeight / 2;
    const entry = {
      type,
      id: String(id),
      tapX: safeX,
      tapY: safeY
    };
    const stack = [...(this.data.globalPopupStack || []), entry];

    if (stack.length <= 1) {
      this.setData({
        globalPopupStack: stack,
        globalPopupDeferBack: false,
        globalPopupOverlay: null,
        'globalPopup.type': type,
        'globalPopup.id': String(id),
        'globalPopup.loading': true,
        'globalPopup.renderPanel': false
      }, () => {
        this._renderGlobalPopupPanel();
      });
      return;
    }

    this.setData({
      globalPopupStack: stack,
      globalPopupDeferBack: true,
      'globalPopup.renderPanel': false,
      'globalPopup.loading': true,
      globalPopupOverlay: {
        type,
        id: String(id),
        loading: true,
        renderPanel: false,
        enterActive: false,
        leaveActive: false
      }
    }, () => {
      this._playGlobalPopupStackPushRipple(safeX, safeY);
    });
  },

  /** 栈 pop：收起 overlay 涟漪后恢复父级 */
  _popGlobalPopupStack() {
    const stack = this.data.globalPopupStack || [];
    if (stack.length <= 1) {
      this.closeGlobalPopup();
      return;
    }
    const newStack = stack.slice(0, -1);
    const prev = newStack[newStack.length - 1];
    const backPt = this._getGlobalPopupBackRipplePoint();
    const leavingType = this.data.globalPopup.type;
    const leavingId = this.data.globalPopup.id;

    this.setData({
      globalPopupOverlay: {
        type: leavingType,
        id: leavingId,
        loading: false,
        renderPanel: true,
        enterActive: false,
        leaveActive: true
      },
      globalPopupStack: newStack,
      globalPopupDeferBack: newStack.length > 1,
      globalPopupStackAnim: '',
      'globalPopup.type': prev.type,
      'globalPopup.id': prev.id,
      'globalPopup.loading': true,
      'globalPopup.renderPanel': false
    }, () => {
      this._renderGlobalPopupPanel();
      this._playGlobalPopupStackPopRipple(backPt.tapX, backPt.tapY);
      setTimeout(() => {
        this.setData({ globalPopupOverlay: null });
      }, 380);
    });
  },

  onGlobalPopupCovered() {
    this.setData({
      'globalPopup.renderPanel': false,
      'globalPopup.loading': true
    });
  },

  onGlobalPopupUncovered() {
    if (!this.data.globalPopup.renderPanel) {
      this._renderGlobalPopupPanel();
    }
  },

  onGlobalPopupFullscreenBack() {
    const stack = this.data.globalPopupStack || [];
    if (stack.length > 1) {
      this._popGlobalPopupStack();
      return;
    }
    this._collapseGlobalPopupToRootTap();
  },

  /** 最终收起：涟漪收拢到首次打开全屏时的点击位置 */
  _collapseGlobalPopupToRootTap() {
    const gp = this.data.globalPopup || {};
    const popup = this.selectComponent('#globalFullscreenPopup');
    if (popup && typeof popup.setCollapseRippleOrigin === 'function') {
      const tx = gp.tapX;
      const ty = gp.tapY;
      if (typeof tx === 'number' && typeof ty === 'number') {
        popup.setCollapseRippleOrigin(tx, ty);
      }
    }
    if (popup && popup.collapse) popup.collapse();
  },

  // 打开全局弹窗
  openGlobalPopup: function(e) {
    const dataset = e.currentTarget.dataset;
    const type = dataset.popupType;
    const id = dataset.popupId;
    
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
    
    panelLazy.preloadForPanelType(type).then(() => {
      this._openGlobalPopupRoot(type, id, tapX, tapY);
    });
  },

  // 关闭全局弹窗
  closeGlobalPopup: function() {
    const stack = this.data.globalPopupStack || [];
    if (stack.length > 1) {
      this._popGlobalPopupStack();
      return;
    }
    this._collapseGlobalPopupToRootTap();
  },

  /** club-manage 内「添加成员」嵌套全屏打开/关闭时，隐藏或恢复本页全局全屏的左上角返回 */
  onClubManageHostFullscreenBack(e) {
    const show = !!(e.detail && e.detail.show)
    this.setData({ hostExpandableBackShow: show })
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
        'globalPopup.id': '',
        'globalPopup.data': {},
        globalPopupStack: [],
        globalPopupDeferBack: false,
        globalPopupStackAnim: '',
        globalPopupOverlay: null,
        hostExpandableBackShow: true
      }, () => {
        this.syncHomeFullscreenLayerState()
      })
    }, 800);
  },

  // 全局弹窗内容准备好回调
  onGlobalPopupContentReady: function() {
    this._renderGlobalPopupPanel();
  },

  // 全局弹窗内容加载完成回调
  onGlobalPopupLoaded: function() {
    this.setData({
      'globalPopup.panelContentVisible': true,
      'globalPopup.skeletonFading': true,
    });
    setTimeout(() => {
      this.setData({
        'globalPopup.loading': false,
        'globalPopup.skeletonFading': false,
      });
    }, PANEL_REVEAL_MS);
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
  },

  onHostClockinSignature(e) {
    const eventId = e.detail && e.detail.eventId;
    if (!eventId) return;
    this.setData({
      clockinSignature: {
        visible: true,
        eventId: String(eventId),
        submitting: false,
      },
    }, () => {
      setTimeout(() => {
        const pad = this.selectComponent('#hostClockinSignaturePad');
        if (pad && pad.prepare) pad.prepare();
      }, 320);
    });
  },

  preventClockinTouchMove() {},

  closeHostClockinSignature() {
    this.setData({
      'clockinSignature.visible': false,
      'clockinSignature.eventId': '',
    });
    const pad = this.selectComponent('#hostClockinSignaturePad');
    if (pad && pad.reset) pad.reset();
  },

  async onHostSignatureConfirm(e) {
    const fileId = e.detail && e.detail.fileId;
    const eventId = this.data.clockinSignature.eventId;
    if (!fileId || !eventId || this.data.clockinSignature.submitting) return;

    this.setData({ 'clockinSignature.submitting': true });
    try {
      wx.showLoading({ title: '打卡中...' });
      await submitClockIn(eventId, fileId);
      wx.hideLoading();
      this.closeHostClockinSignature();
      wx.showToast({ title: '打卡成功', icon: 'success' });
      const panel = this.selectComponent('#globalEventJoinedPanel');
      if (panel && panel.loadEventData) panel.loadEventData();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '打卡失败', icon: 'none' });
    } finally {
      this.setData({ 'clockinSignature.submitting': false });
    }
  },
}) 