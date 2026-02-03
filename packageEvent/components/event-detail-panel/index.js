const app = getApp();

Component({
  properties: {
    eventId: {
      type: String,
      value: ''
    }
  },

  data: {
    loading: true,
    event: null,
    membersList: [],
    clubInfo: null,
    swiperImages: [],
    currentSwiperIndex: 0,
    mapImageUrl: '',
    eventImages: [],
    
    // 导航相关
    activeSection: 'info',
    sectionTabs: [
      { label: '信息', value: 'info' },
      { label: '人员', value: 'members' },
      { label: '详情', value: 'details' },
      { label: '协会', value: 'club' }
    ],
    scrollIntoView: '',
    
    // 图片预览
    showImageViewer: false,
    previewImages: [],
    previewIndex: 0
  },

  observers: {
    'eventId': function(eventId) {
      // 如果 eventId 没有真正变化，不要重新加载
      // 同时检查是否是占位符 ID，占位符不应该触发 API 请求
    const isPlaceholder = !eventId || eventId.startsWith('placeholder');
      if (isPlaceholder) {
        this._lastEventId = null;
        this._loaded = false;
        this.setData({ loading: false, event: null });
        return;
      }
      // 只记录 eventId，不自动加载数据（懒加载）
    if (eventId !== this._lastEventId) {
        this._lastEventId = eventId;
        this._loaded = false;
        // 如果已经展开过，则重新加载
    if (this._hasExpanded) {
          this.loadEventData();
        }
      }
    }
  },

  lifetimes: {
    attached() {
      this._loaded = false;
      this._hasExpanded = false;
    }
  },

  methods: {
    // 懒加载入口：供外部调用，只有弹窗展开时才加载数据
  loadData() {
      this._hasExpanded = true;
      if (this._loaded) return Promise.resolve();
      if (!this.data.eventId || this.data.eventId.startsWith('placeholder')) {
        return Promise.resolve();
      }
      this._loaded = true;
      return this.loadEventData();
    },

    // 通用请求
  request({ url, method = 'GET', data, loadingText }) {
      if (loadingText) wx.showLoading({ title: loadingText });
      return new Promise((resolve, reject) => {
        wx.request({
          url: app.globalData.request_url + url,
          method,
          data,
          header: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + wx.getStorageSync('token'),
          },
          success: (res) => {
            if (loadingText) wx.hideLoading();
            resolve(res.data);
          },
          fail: (err) => {
            if (loadingText) wx.hideLoading();
            reject(err);
          },
        });
      });
    },

    async loadEventData() {
      this.setData({ loading: true });
      try {
        const [eventRes, membersRes] = await Promise.all([
          this.request({ url: `/event/${this.data.eventId}` }),
          this.request({ url: `/event/${this.data.eventId}/members` })
        ]);

        if (eventRes.Flag == '4000' || eventRes.Flag == 4000) {
          const event = eventRes.data || {};
          await this.processEventData(event);
          
          if (membersRes.Flag == '4000' || membersRes.Flag == 4000) {
            this.setData({ membersList: membersRes.data?.members || [] });
          }
          
          this.setData({ loading: false });
          this.triggerEvent('loaded');
        } else {
          throw new Error(eventRes.message || '加载失败');
        }
      } catch (e) {
        console.error(e);
        this.setData({ loading: false, event: null });
        this.triggerEvent('loaded');
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    },

    async processEventData(event) {
      // 处理时间显示
      event.pre_startTime_display = this.formatTime(event.pre_startTime);
      event.pre_endTime_display = this.formatTime(event.pre_endTime);
      event.actual_startTime_display = this.formatTime(event.actual_startTime);
      event.actual_endTime_display = this.formatTime(event.actual_endTime);

      // 处理协会信息
    if (event.club_info) {
        event.club_info.club_cover_thumb = app.convertToThumbnailUrl(event.club_info.club_cover, 150);
        // 优先使用 club_info.cur_user_is_member，这是最新的协会成员状态
        // 如果用户退出协会后，即使之前加入了活动，也应该显示"申请加入协会"
        event.cur_user_in_club = event.club_info.cur_user_is_member;
        // 同步待审批状态
    if (event.club_info.cur_user_has_pending_application !== undefined) {
          event.cur_user_has_pending_application = event.club_info.cur_user_has_pending_application;
        }
        this.setData({ clubInfo: event.club_info });
      }

      // 处理轮播图
    const swiperImages = [];
      if (event.cover_url) {
        swiperImages.push({ 
          url: event.cover_url, 
          thumbUrl: app.convertToThumbnailUrl(event.cover_url, 100),
          type: 'cover' 
        });
      }
      if (event.first_moment_imgs && Array.isArray(event.first_moment_imgs)) {
        event.first_moment_imgs.forEach(img => {
          if (img && img.fileUrl) {
            swiperImages.push({ 
              url: img.fileUrl, 
              thumbUrl: app.convertToThumbnailUrl(img.fileUrl, 100),
              type: 'moment' 
            });
          }
        });
      }

      // 处理活动详情图片
    const eventImages = event.event_imgs || [];

      // 处理地图
    let mapImageUrl = '';
      if (event.premap_url) {
        // 优先使用后端返回的完整地图URL
        mapImageUrl = event.premap_url;
      } else if (event.location_data && event.location_data.latitude && event.location_data.longitude) {
        // 兼容旧数据：如果没有premap_url，使用location_data构建（但不包含API key）
    const { latitude, longitude } = event.location_data;
        mapImageUrl = `https://maps.geoapify.com/v1/staticmap?style=osm-bright-grey&width=600&height=300&center=lonlat:${longitude},${latitude}&zoom=15&marker=lonlat:${longitude},${latitude};type:awesome;color:%23ff6b9d;size:28&scaleFactor=2`;
  }

      this.setData({
        event,
        swiperImages,
        eventImages,
        mapImageUrl
      });
    },

    formatTime(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso).slice(0, 16).replace('T', ' ');
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },

    // 导航切换
  onSectionNavTap(e) {
      const section = e.currentTarget.dataset.section;
      this.setData({ 
        activeSection: section,
        scrollIntoView: `section-${section}`
      });
      
      // 清除 scrollIntoView，避免重复触发
      setTimeout(() => {
        this.setData({ scrollIntoView: '' });
      }, 100);
    },

    // 滚动事件 - 更新导航高亮
  onMainScroll(e) {
      // 节流处理
    if (this._scrollTimer) {
        clearTimeout(this._scrollTimer);
      }
      this._scrollTimer = setTimeout(() => {
        this.updateActiveSection();
      }, 50);
    },

    // 根据滚动位置更新当前激活的区域
  updateActiveSection() {
      const query = this.createSelectorQuery();
      const sections = ['info', 'members', 'details', 'club'];
      
      sections.forEach(section => {
        query.select(`#section-${section}`).boundingClientRect();
      });
      
      query.exec((res) => {
        if (!res || res.length === 0) return;
        
        let activeSection = 'info';
        const threshold = 150; // 导航栏高度阈值
    for (let i = res.length - 1; i >= 0; i--) {
          if (res[i] && res[i].top <= threshold) {
            activeSection = sections[i];
            break;
          }
        }
        
        if (activeSection !== this.data.activeSection) {
          this.setData({ activeSection });
        }
      });
    },

    // 轮播图切换
  onSwiperChange(e) {
      this.setData({ currentSwiperIndex: e.detail.current });
    },

    // 缩略图点击
  onThumbTap(e) {
      this.setData({ currentSwiperIndex: e.currentTarget.dataset.index });
    },

    // 预览封面图片
  previewImage(e) {
      const index = e.currentTarget.dataset.index;
      const images = this.data.swiperImages.map(item => item.url);
      this.setData({
        previewImages: images,
        previewIndex: index,
        showImageViewer: true
      });
    },

    // 预览详情图片
  previewDetailImage(e) {
      const index = e.currentTarget.dataset.index;
      const images = this.data.eventImages.map(item => item.fileUrl);
      this.setData({
        previewImages: images,
        previewIndex: index,
        showImageViewer: true
      });
    },

    closeImageViewer() {
      this.setData({ showImageViewer: false });
    },

    // 打开地图
  openMap() {
      const event = this.data.event;
      if (event && event.location_data) {
        wx.openLocation({
          latitude: parseFloat(event.location_data.latitude),
          longitude: parseFloat(event.location_data.longitude),
          name: event.location || '活动地点',
          address: event.location_data.address || '',
          scale: 16
        });
      }
    },

    // 跳转协会
  navigateToClub() {
      if (this.data.clubInfo && this.data.clubInfo.club_id) {
        this.triggerEvent('navigateClub', { clubId: this.data.clubInfo.club_id });
      }
    },

    // 加入活动
    async joinEvent() {
      try {
        const res = await this.request({
          url: `/event/${this.data.eventId}/join`,
          loadingText: '加入中...'
        });
        if (res.Flag == '4000' || res.Flag == 4000) {
          wx.showToast({ title: '加入成功', icon: 'success' });
          const event = { ...this.data.event };
          event.cur_user_is_joined = true;
          event.join_count = (event.join_count || 0) + 1;
          this.setData({ event });
        } else {
          wx.showToast({ title: res.message || '加入失败', icon: 'none' });
        }
      } catch (e) {
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    },

    // 退出活动
    async quitEvent() {
      const ok = await new Promise(resolve => {
        wx.showModal({
          title: '确认退出',
          content: '确定要退出这个活动吗？',
          confirmText: '退出',
          confirmColor: '#ff4d4f',
          success: resolve
        });
      });
      if (!ok.confirm) return;

      try {
        const res = await this.request({
          url: `/event/${this.data.eventId}/quit`,
          loadingText: '退出中...'
        });
        if (res.Flag == '4000' || res.Flag == 4000) {
          wx.showToast({ title: '已退出', icon: 'success' });
          const event = { ...this.data.event };
          event.cur_user_is_joined = false;
          event.join_count = Math.max(0, (event.join_count || 1) - 1);
          this.setData({ event });
        } else {
          wx.showToast({ title: res.message || '退出失败', icon: 'none' });
        }
      } catch (e) {
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    },

    // 打卡签到
    async clockinEvent() {
      try {
        const res = await this.request({
          url: `/event/${this.data.eventId}/clockin`,
          method: 'GET',
          loadingText: '签到中...'
        });
        if (res.Flag == '4000' || res.Flag == 4000) {
          wx.showToast({ title: '签到成功', icon: 'success' });
          const event = { ...this.data.event };
          event.cur_user_is_clockin = true;
          event.clockin_count = (event.clockin_count || 0) + 1;
          this.setData({ event });
        } else {
          wx.showToast({ title: res.message || '签到失败', icon: 'none' });
        }
      } catch (e) {
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    },

    // 申请加入协会
    async applyToJoinClub() {
      const clubInfo = this.data.clubInfo;
      if (!clubInfo || !clubInfo.club_id) {
        wx.showToast({ title: '协会信息不存在', icon: 'none' });
        return;
      }
      try {
        const res = await this.request({
          url: `/club/${clubInfo.club_id}/applicated`,
          loadingText: '申请中...'
        });
        if (res.Flag == '4000' || res.Flag == 4000) {
          wx.showToast({ title: '申请已提交', icon: 'success' });
          const event = { ...this.data.event };
          event.cur_user_has_pending_application = true;
          this.setData({ event });
        } else {
          wx.showToast({ title: res.message || '申请失败', icon: 'none' });
        }
      } catch (e) {
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    }
  }
});
