const app = getApp();

Component({
  properties: {
    clubId: {
      type: String,
      value: ''
    }
  },

  data: {
    loading: true,
    club: null,
    clubMembers: [],
    swiperImages: [],
    swiperImagesThumbs: [],
    currentSwiperIndex: 0,
    
    // 导航相关
    activeSection: 'info',
    sectionTabs: [
      { label: '信息', value: 'info' },
      { label: '人员', value: 'members' },
      { label: '活动', value: 'activities' }
    ],
    scrollIntoView: '',
    
    // 图片预览
    showImageViewer: false,
    previewImages: [],
    previewIndex: 0
  },

  observers: {
    'clubId': function(clubId) {
      const isPlaceholder = !clubId || clubId.startsWith('placeholder');
      if (isPlaceholder) {
        this._lastClubId = null;
        this._loaded = false;
        this.setData({ loading: false, club: null });
        return;
      }
      // 只记?clubId，不自动加载数据（懒加载数
      if (clubId !== this._lastClubId) {
        this._lastClubId = clubId;
        this._loaded = false;
        // 如果已经展开过，则重新加数
      if (this._hasExpanded) {
          this.loadClubData();
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
      if (!this.data.clubId || this.data.clubId.startsWith('placeholder')) {
        return Promise.resolve();
      }
      this._loaded = true;
      return this.loadClubData();
    },

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

    async loadClubData() {
      this.setData({ loading: true });
      try {
        const [clubRes, membersRes] = await Promise.all([
          this.request({ url: `/club/${this.data.clubId}` }),
          this.request({ url: `/club/${this.data.clubId}/members` })
        ]);

        if (clubRes.Flag == '4000' || clubRes.Flag == 4000) {
          const club = clubRes.data || {};
          await this.processClubData(club);
          
          if (membersRes.Flag == '4000' || membersRes.Flag == 4000) {
            this.setData({ clubMembers: membersRes.data?.members || [] });
          }
          
          this.setData({ loading: false });
          this.triggerEvent('loaded');
        } else {
          throw new Error(clubRes.message || '加载失败');
        }
      } catch (e) {        this.setData({ loading: false, club: null });
        this.triggerEvent('loaded');
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    },

    async processClubData(club) {
      // 映射删除状态字?- 后端返回is_deleted，组件期望isDelete
      club.isDelete = club.is_deleted || false;
      
      // 处理会长信息
    if (club.president) {
        club.president_id = club.president?.user?.userID || null;
        club.president_username = club.president?.user?.userName || null;
        club.president_avatar = club.president?.user?.avatar?.fileUrl || null;
      }
      club.content = club.message || club.content || club.description || '';

      // 处理轮播数
      const swiperImages = [];
      const swiperImagesThumbs = [];
      if (club.cover_url) {
        swiperImages.push({ url: club.cover_url, type: 'cover' });
        swiperImagesThumbs.push({ url: app.convertToThumbnailUrl(club.cover_url, 100), type: 'cover' });
      }
      
      // 添加最近活动的动态图数
      if (club.recent_events && club.recent_events.length > 0 && 
          club.recent_events[0].recent_moments && 
          club.recent_events[0].recent_moments[0]?.image_files?.length > 0) {
        const firstMoment = club.recent_events[0].recent_moments[0];
        const maxImages = Math.min(firstMoment.image_files.length, 5);
        for (let i = 0; i < maxImages; i++) {
          const imageFile = firstMoment.image_files[i];
          if (imageFile && imageFile.file_url) {
            swiperImages.push({ url: imageFile.file_url, type: 'moment' });
            swiperImagesThumbs.push({ url: app.convertToThumbnailUrl(imageFile.file_url, 100), type: 'moment' });
          }
        }
      }

      // 处理最近活动的地图数据
    if (club.recent_events && Array.isArray(club.recent_events)) {
        club.recent_events = club.recent_events.map(event => {
          let mapImageUrl = '';
          if (event.premap_url) {
            // 优先使用后端返回的完整地图URL
            mapImageUrl = event.premap_url;
          } else if (event.location_data && event.location_data.longitude && event.location_data.latitude) {
            // 兼容旧数据：如果没有premap_url，使用location_data构建（但不包含API key数
      const { longitude, latitude } = event.location_data;
            mapImageUrl = `https://maps.geoapify.com/v1/staticmap?style=osm-bright-grey&width=600&height=400&center=lonlat:${longitude},${latitude}&zoom=15&marker=lonlat:${longitude},${latitude};type:awesome;color:%23ff6b9d;size:28&scaleFactor=2`;
  }
          return { ...event, mapImageUrl };
        });
      }

      this.setData({
        club,
        swiperImages,
        swiperImagesThumbs
      });
    },

    // 导航切换
  onSectionNavTap(e) {
      const section = e.currentTarget.dataset.section;
      this.setData({ 
        activeSection: section,
        scrollIntoView: `section-${section}`
      });
      setTimeout(() => {
        this.setData({ scrollIntoView: '' });
      }, 100);
    },

    onMainScroll(e) {
      if (this._scrollTimer) {
        clearTimeout(this._scrollTimer);
      }
      this._scrollTimer = setTimeout(() => {
        this.updateActiveSection();
      }, 50);
    },

    updateActiveSection() {
      const query = this.createSelectorQuery();
      const sections = ['info', 'members', 'activities'];
      
      sections.forEach(section => {
        query.select(`#section-${section}`).boundingClientRect();
      });
      
      query.exec((res) => {
        if (!res || res.length === 0) return;
        
        let activeSection = 'info';
        const threshold = 150;
        
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

    // 轮播数
      onSwiperChange(e) {
      this.setData({ currentSwiperIndex: e.detail.current });
    },

    onThumbTap(e) {
      this.setData({ currentSwiperIndex: e.currentTarget.dataset.index });
    },

    previewImage(e) {
      const index = e.currentTarget.dataset.index;
      const images = this.data.swiperImages.map(item => item.url);
      this.setData({
        previewImages: images,
        previewIndex: index,
        showImageViewer: true
      });
    },

    closeImageViewer() {
      this.setData({ showImageViewer: false });
    },

    // 查看活动详情
  viewEventDetail(e) {
      const eventId = e.currentTarget.dataset.eventId;
      if (eventId) {
        this.triggerEvent('navigateEvent', { eventId });
      }
    },

    // 申请加入协会
    async applyToJoin() {
      try {
        const res = await this.request({
          url: `/club/${this.data.clubId}/applicated`,
          loadingText: '申请数..'
        });
        if (res.Flag == '4000' || res.Flag == 4000) {
          wx.showToast({ title: '申请成功', icon: 'success' });
          const club = { ...this.data.club };
          club.cur_user_has_pending_application = true;
          this.setData({ club });
          
          // 发送消息通知
    if (res.data) {
            const message_data = {
              booker_id: res.data.president_id,
              url: `/packageClub/club-applications/index?clubId=${res.data.club_id}`,
              operation: 'user_applicated',
              text: '用户' + res.data.user_name + '向您管理' + res.data.club_name + '的协会发起了入会申请请尽快审'
            };
            await app.message(message_data);
          }
        } else {
          wx.showToast({ title: res.message || '申请失败', icon: 'none' });
        }
      } catch (e) {
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    },

    // 删除协会（超级用户）
  deleteClub() {
      wx.showModal({
        title: '确认删除',
        content: '确定要删除这个协会吗？此操作不可恢复?',
        confirmText: '删除',
        confirmColor: '#ff4d4f',
        success: async (res) => {
          if (res.confirm) {
            try {
              const result = await this.request({
                url: `/club/${this.data.clubId}/delete`,
                method: 'GET',
                loadingText: '删除?..'
              });
              if (result.Flag == '4000' || result.Flag == 4000) {
                wx.showToast({ title: '删除成功', icon: 'success' });
                
                // 记录删除变更到本地缓存（自动触发 triggerEvent数
      app.recordChange(this.data.clubId, 'delete', { type: 'club' }, this);
                
                // 关闭面板
                setTimeout(() => {
                  this.triggerEvent('close');
                }, 1500);
              } else {
                wx.showToast({ title: result.message || '删除失败', icon: 'none' });
              }
            } catch (e) {
              wx.showToast({ title: '网络错误', icon: 'none' });
            }
          }
        }
      });
    }
  }
});
