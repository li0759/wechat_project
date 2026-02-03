const app = getApp();

Component({
  properties: {
    clubId: {
      type: String,
      value: ''
    }
  },

  data: {
    isLoading: true,
    club: null,
    clubMembers: [],
    featuredEvent: null,
    eventsList: [],
    eventsLoading: false,
    eventsEmpty: false,
    eventsPage: 1,
    eventsTotalPages: 1
  },

  lifetimes: {
    attached() {
      this._loaded = false;
      this._hasExpanded = false;
    }
  },

  observers: {
    'clubId': function(clubId) {
      const isPlaceholder = !clubId || clubId.startsWith('placeholder');
      if (isPlaceholder) {
        this._lastClubId = null;
        this._loaded = false;
        this.setData({ isLoading: false, club: null });
        return;
      }
      if (clubId !== this._lastClubId) {
        this._lastClubId = clubId;
        this._loaded = false;
        if (this._hasExpanded) {
          this.loadData();
        }
      }
    }
  },

  methods: {
    // 懒加载入数
      loadData() {
      this._hasExpanded = true;
      if (this._loaded) return Promise.resolve();
      if (!this.data.clubId || this.data.clubId.startsWith('placeholder')) {
        return Promise.resolve();
      }
      this._loaded = true;
      return this.loadClubData();
    },

    // 加载协会数据
    async loadClubData() {
      this.setData({ isLoading: true });
      
      try {
        const [clubRes, membersRes, eventsRes] = await Promise.all([
          this.request({ url: `/club/${this.data.clubId}` }),
          this.request({ url: `/club/${this.data.clubId}/members` }),
          this.request({ url: `/event/club_public/${this.data.clubId}/list/all?mode=page&page=1` })
        ]);

        if (clubRes.Flag == '4000' || clubRes.Flag == 4000) {
          const club = clubRes.data || {};
          await this.processClubData(club);
          
          if (membersRes.Flag == '4000' || membersRes.Flag == 4000) {
            const members = (membersRes.data?.members || []).slice(0, 16); // 最多显示6个头数
      this.setData({ clubMembers: members });
          }
          
          if (eventsRes.Flag == '4000' || eventsRes.Flag == 4000) {
            this.processEventsData(eventsRes.data);
          } else {
            this.setData({ eventsEmpty: true });
          }
          
          this.setData({ isLoading: false });
          this.triggerEvent('loaded');
        } else {
          throw new Error(clubRes.message || '加载失败');
        }
      } catch (e) {        this.setData({ isLoading: false, club: null });
        this.triggerEvent('loaded');
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    },

    // 处理协会数据
    async processClubData(club) {
      club.isDelete = club.is_deleted || false;
      
      if (club.president) {
        club.president_id = club.president?.user?.userID || null;
        club.president_username = club.president?.user?.userName || null;
        club.president_avatar = club.president?.user?.avatar?.fileUrl || null;
      }
      
      this.setData({ club });
    },

    // 处理活动数据
  processEventsData(data) {
      const events = data.events || data.records || [];
      
      if (events.length === 0) {
        this.setData({
          featuredEvent: null,
          eventsList: [],
          eventsEmpty: true,
          eventsPage: 1,
          eventsTotalPages: 1
        });
        return;
      }
      
      // 处理地图URL和缩略图
    const processedEvents = events.map(event => {
        let mapImageUrl = '';
        if (event.premap_url) {
          mapImageUrl = event.premap_url;
        } else if (event.location_data && event.location_data.longitude && event.location_data.latitude) {
          const { longitude, latitude } = event.location_data;
          mapImageUrl = `https://maps.geoapify.com/v1/staticmap?style=osm-bright-grey&width=600&height=400&center=lonlat:${longitude},${latitude}&zoom=15&marker=lonlat:${longitude},${latitude};type:awesome;color:%23ff6b9d;size:28&scaleFactor=2`;
  }
        
        // 添加缩略数
      const cover_url_thumb = event.cover_url ? getApp().convertToThumbnailUrl(event.cover_url, 150) : '';
        
        return { ...event, mapImageUrl, cover_url_thumb, loading: false };
      });

      // 找出最近的活动作为特色活动
    let featuredEvent = null;
      if (processedEvents.length > 0) {
        // 优先选择正在进行的活动，其次是即将开始的
    const now = Date.now();
        const ongoing = processedEvents.find(e => e.actual_startTime && !e.actual_endTime);
        const upcoming = processedEvents.find(e => !e.actual_startTime && new Date(e.pre_startTime) > now);
        const recent = processedEvents[0];
        
        featuredEvent = ongoing || upcoming || recent;
        
        if (featuredEvent) {
          // 设置状态和按钮
    this.setEventStatus(featuredEvent);
        }
      }

      this.setData({
        featuredEvent,
        eventsList: processedEvents,
        eventsEmpty: false,
        eventsPage: data.pagination?.current_page || 1,
        eventsTotalPages: data.pagination?.total_pages || 1
      });
    },

    // 设置活动状态和按钮
  setEventStatus(event) {
      const hasStarted = !!event.actual_startTime;
      const hasEnded = !!event.actual_endTime;
      const hasClockedIn = !!event.cur_user_clockin_date;
      
      if (hasEnded) {
        event.statusText = '已结';
        event.statusClass = 'status-ended';
        event.showButton = false;
      } else if (hasStarted) {
        event.statusText = '正在进行';
        event.statusClass = 'status-ongoing';
        if (!hasClockedIn) {
          event.showButton = true;
          event.buttonText = '打卡';
          event.buttonTheme = 'primary';
          event.buttonAction = 'clockin';
        } else {
          event.showButton = false;
        }
      } else {
        event.statusText = '预计开';
        event.statusClass = 'status-upcoming';
        if (event.cur_user_is_joined) {
          event.showButton = false;
        } else {
          event.showButton = true;
          event.buttonText = '参加';
          event.buttonTheme = 'primary';
          event.buttonAction = 'join';
        }
      }
    },

    // 请求封装
  request({ url, method = 'GET', data }) {
      return new Promise((resolve, reject) => {
        wx.request({
          url: app.globalData.request_url + url,
          method,
          data,
          header: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + wx.getStorageSync('token'),
          },
          success: (res) => resolve(res.data),
          fail: reject
        });
      });
    },

    // 滚动到底部加载更数
      onScrollToLower() {
      if (this.data.eventsLoading || this.data.eventsPage >= this.data.eventsTotalPages) return;
      this.loadMoreEvents();
    },

    // 加载更多活动
    async loadMoreEvents() {
      this.setData({ eventsLoading: true });
      
      // 添加骨架数
      const skeletons = Array(2).fill({ loading: true });
      this.setData({
        eventsList: this.data.eventsList.concat(skeletons)
      });
      
      try {
        const res = await this.request({ 
          url: `/event/club_public/${this.data.clubId}/list/all?mode=page&page=${this.data.eventsPage + 1}` 
        });
        
        if (res.Flag == '4000' || res.Flag == 4000) {
          const events = res.data.events || res.data.records || [];
          const processedEvents = events.map(event => {
            let mapImageUrl = '';
            if (event.premap_url) {
              mapImageUrl = event.premap_url;
            } else if (event.location_data && event.location_data.longitude && event.location_data.latitude) {
              const { longitude, latitude } = event.location_data;
              mapImageUrl = `https://maps.geoapify.com/v1/staticmap?style=osm-bright-grey&width=600&height=400&center=lonlat:${longitude},${latitude}&zoom=15&marker=lonlat:${longitude},${latitude};type:awesome;color:%23ff6b9d;size:28&scaleFactor=2`;
  }
            
            const cover_url_thumb = event.cover_url ? getApp().convertToThumbnailUrl(event.cover_url, 150) : '';
            return { ...event, mapImageUrl, cover_url_thumb, loading: false };
          });
          
          // 移除骨架屏，添加真实数据
    const remain = this.data.eventsList.length - 2;
          this.setData({
            eventsList: [...this.data.eventsList.slice(0, remain), ...processedEvents],
            eventsPage: res.data.pagination?.current_page || this.data.eventsPage + 1,
            eventsTotalPages: res.data.pagination?.total_pages || 1
          });
        } else {
          // 加载失败，移除骨架屏
    const remain = this.data.eventsList.length - 2;
          this.setData({
            eventsList: this.data.eventsList.slice(0, remain)
          });
        }
      } catch (e) {        // 加载失败，移除骨架屏
    const remain = this.data.eventsList.length - 2;
        this.setData({
          eventsList: this.data.eventsList.slice(0, remain)
        });
      } finally {
        this.setData({ eventsLoading: false });
      }
    },

    // 查看活动详情
  viewEventDetail(e) {
      const eventId = e.currentTarget.dataset.eventId;
      if (eventId) {
        this.triggerEvent('navigateEvent', { eventId });
      }
    },

    // 活动操作（打开参加载
    async onEventAction(e) {
      e.stopPropagation();
      const eventId = e.currentTarget.dataset.eventId;
      const action = e.currentTarget.dataset.action;
      
      if (action === 'clockin') {
        await this.clockIn(eventId);
      } else if (action === 'join') {
        await this.joinEvent(eventId);
      }
    },

    // 打卡
    async clockIn(eventId) {
      try {
        wx.showLoading({ title: '打卡?..' });
        const res = await this.request({ url: `/event/clockin/${eventId}` });
        wx.hideLoading();
        
        if (res.Flag === '4000') {
          wx.showToast({ title: '打卡成功', icon: 'success' });
          this.loadClubData();
        } else {
          throw new Error(res.message || '打卡失败');
        }
      } catch (error) {
        wx.hideLoading();
        wx.showToast({ title: error.message || '打卡失败', icon: 'none' });
      }
    },

    // 参加活动
    async joinEvent(eventId) {
      try {
        wx.showLoading({ title: '加入?..' });
        const res = await this.request({ url: `/event/${eventId}/join` });
        wx.hideLoading();
        
        if (res.Flag === '4000') {
          wx.showToast({ title: '加入成功', icon: 'success' });
          this.loadClubData();
        } else {
          throw new Error(res.message || '加入失败');
        }
      } catch (error) {
        wx.hideLoading();
        wx.showToast({ title: error.message || '加入失败', icon: 'none' });
      }
    },

    // 查看协会详情
  viewClubDetail() {
      this.triggerEvent('navigateClub', { clubId: this.data.clubId });
    },

    // 退出协数
      quitClub() {
      wx.showModal({
        title: '确认退',
        content: '确定要退出这个协会吗',
        confirmText: '退',
        confirmColor: '#ff4d4f',
        success: async (res) => {
          if (res.confirm) {
            try {
              wx.showLoading({ title: '处理?..' });
              const result = await this.request({
                url: `/club/${this.data.clubId}/quit`,
                method: 'GET'
              });
              wx.hideLoading();
              
              if (result.Flag == '4000' || result.Flag == 4000) {
                wx.showToast({ title: '退出成', icon: 'success' });
                
                // 记录变更
                app.recordChange(this.data.clubId, 'update', { 
                  type: 'club',
                  cur_user_is_member: false 
                }, this);
                
                setTimeout(() => {
                  this.triggerEvent('close');
                }, 1500);
              } else {
                wx.showToast({ title: result.message || '退出失', icon: 'none' });
              }
            } catch (e) {
              wx.hideLoading();
              wx.showToast({ title: '网络错误', icon: 'none' });
            }
          }
        }
      });
    }
  }
});
