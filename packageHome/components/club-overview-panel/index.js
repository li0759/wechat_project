const app = getApp();

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer: 'onVisibleChange'
    },
    animationEnded: {
      type: Boolean,
      value: false,
      observer: 'onAnimationEndedChange'
    }
  },

  data: {
    clubList: [],
    page: 1,
    totalPages: 1,
    loading: false,
    hasMore: true,
    initialized: false, // 是否已初始化
    labelStyle: {
      fontSize: '20rpx',
      color: '#666',
      lineHeight: '1.2'
    },
    
    // 嵌套的club-detail弹窗状态
    nestedClubDetail: {
      visible: false,
      loading: true,
      renderPanel: false,
      clubId: '',
      tapX: 0,
      tapY: 0
    },
    
    // 嵌套的club-manage弹窗状态
    nestedClubManage: {
      visible: false,
      loading: true,
      renderPanel: false,
      clubId: '',
      tapX: 0,
      tapY: 0
    },
    
    // 嵌套的event-detail弹窗状态
    nestedEventDetail: {
      visible: false,
      loading: true,
      renderPanel: false,
      eventId: '',
      tapX: 0,
      tapY: 0
    },
    
    // 嵌套的event-manage弹窗状态
    nestedEventManage: {
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
      console.log('club-overview-panel attached');
      console.log('initialized:', this.data.initialized);
      
      // 注册变更监听器
      const app = getApp();
      this._changeListener = (changes) => {
        console.log('[club-overview-panel] 收到变更广播:', changes);
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
    if (this.data.nestedClubDetail && this.data.nestedClubDetail.loading) {
            this.setData({ 'nestedClubDetail.loading': false });
          }
          if (this.data.nestedClubManage && this.data.nestedClubManage.loading) {
            this.setData({ 'nestedClubManage.loading': false });
          }
          if (this.data.nestedEventDetail && this.data.nestedEventDetail.loading) {
            this.setData({ 'nestedEventDetail.loading': false });
          }
          if (this.data.nestedEventManage && this.data.nestedEventManage.loading) {
            this.setData({ 'nestedEventManage.loading': false });
          }
        });
      }
    },
    
    detached() {
      // 注销变更监听器
      const app = getApp();
      if (this._changeListener) {
        app.unregisterChangeListener(this._changeListener);
        this._changeListener = null;
      }
    },
    
    ready() {
      console.log('club-overview-panel ready');
    }
  },

  methods: {
    /**
     * 监听visible属性变化
     */
    onVisibleChange(newVal, oldVal) {
      console.log('club-overview-panel visible changed:', oldVal, '->', newVal);
    },

    /**
     * 监听动画结束
     */
    onAnimationEndedChange(newVal, oldVal) {
      console.log('club-overview-panel animationEnded changed:', oldVal, '->', newVal);
      console.log('initialized:', this.data.initialized);
      if (newVal && !this.data.initialized) {
        // 动画结束后才加载数据
        console.log('开始加载协会列表');
        this.setData({ initialized: true });
        this.loadClubList();
      }
    },
    /**
     * 加载协会列表
     */
    loadClubList(page = 1) {
      console.log('loadClubList called - page:', page, 'loading:', this.data.loading);
      if (this.data.loading) {
        console.log('已在加载中，跳过');
        return;
      }
      
      console.log('开始加载协会列表 - page:', page);
      this.setData({ loading: true });

      wx.request({
        url: app.globalData.request_url + `/club/list/active?mode=page&page=${page}`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json'
        },
        success: (res) => {
          console.log('loadClubList API response:', res.data);
          if (res.data.Flag == 4000) {
            console.log('协会数据:', res.data.data);
            const newClubs = res.data.data.records.map(club => {
              console.log(`Club ${club.club_name}: cur_user_managed =`, club.cur_user_managed);
              return {
                club_id: club.club_id,
                club_name: club.club_name,
                description: club.description,
                cover_url: app.convertToThumbnailUrl(club.cover_url, 200),
                cur_user_managed: club.cur_user_managed || false, // 保存管理状态
                eventItems: [],
                eventsLoading: true
              };
            });

            const clubList = page === 1 ? newClubs : [...this.data.clubList, ...newClubs];
            
            console.log('更新后的clubList长度:', clubList.length);
            console.log('当前页:', res.data.data.pagination.current_page, '总页数:', res.data.data.pagination.total_pages);
            
            this.setData({
              clubList,
              page: res.data.data.pagination.current_page,
              totalPages: res.data.data.pagination.total_pages,
              hasMore: res.data.data.pagination.current_page < res.data.data.pagination.total_pages
            });

            console.log('hasMore:', this.data.hasMore);

            // 为每个协会加载活动
            newClubs.forEach(club => {
              this.loadClubEvents(club.club_id);
            });
          }
        },
        fail: (err) => {
          console.error('加载协会列表失败:', err);
          wx.showToast({
            title: '加载失败',
            icon: 'none'
          });
        },
        complete: () => {
          this.setData({ loading: false });
        }
      });
    },

    /**
     * 加载协会的活动列表
     */
    loadClubEvents(clubId) {
      wx.request({
        url: app.globalData.request_url + `/event/club_public/${clubId}/list/going?mode=page&page=1`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json'
        },
        success: (res) => {
          console.log(`Club ${clubId} events API response:`, res.data);
          if (res.data.Flag == 4000) {
            const events = res.data.data.records || [];
            console.log(`Club ${clubId} has ${events.length} events`);
            
            // 打印第一个活动的完整数据结构
    if (events.length > 0) {
              console.log(`Club ${clubId} 第一个活动完整数据:`, events[0]);
            }
            
            // 转换为isotope格式，添加参加人数信息
    const eventItems = events.map(event => {
              const joinCount = event.join_count || 0;
              const coverUrl = event.cover;
              const thumbnailUrl = coverUrl ? app.convertToThumbnailUrl(coverUrl, 100) : '';
              console.log(`Event ${event.event_id}: cover=${event.cover}, cover_url=${event.cover_url}, coverUrl=${coverUrl}, thumbnail=${thumbnailUrl}`);
              return {
                id: event.event_id,
                image: thumbnailUrl, // isotope使用image字段
                type: 'event_cover',
                ini_width: 100,
                ini_height: 120,
                label: `${event.title}\n${joinCount}人参加`
              };
            });

            console.log(`Club ${clubId} final eventItems:`, eventItems);
            
            // 打印每个 item 的 image 字段
            eventItems.forEach((item, index) => {
              console.log(`  Item ${index}: id=${item.id}, image=${item.image}, label=${item.label}`);
            });

            // 更新对应协会的活动数据
    const clubList = this.data.clubList.map(club => {
              if (club.club_id === clubId) {
                return {
                  ...club,
                  eventItems,
                  eventsLoading: false
                };
              }
              return club;
            });

            this.setData({ clubList });
          }
        },
        fail: (err) => {
          console.error(`加载协会${clubId}的活动失败:`, err);
          
          // 标记加载失败
    const clubList = this.data.clubList.map(club => {
            if (club.club_id === clubId) {
              return {
                ...club,
                eventsLoading: false,
                eventItems: []
              };
            }
            return club;
          });
          this.setData({ clubList });
        }
      });
    },

    /**
     * 滚动到底部，加载更多
     */
    onScrollToLower() {
      console.log('onScrollToLower triggered - hasMore:', this.data.hasMore, 'loading:', this.data.loading, 'page:', this.data.page);
      if (this.data.hasMore && !this.data.loading) {
        console.log('开始加载第', this.data.page + 1, '页');
        this.loadClubList(this.data.page + 1);
      }
    },

    /**
     * 触摸开始 - 记录起始位置和时间（协会封面）
     */
    onClubTouchStart(e) {
      const touch = e.changedTouches && e.changedTouches[0];
      if (touch) {
        this._clubTouchStartX = touch.clientX;
        this._clubTouchStartY = touch.clientY;
        this._clubTouchStartTime = Date.now();
      }
    },

    /**
     * 点击协会封面 - 打开嵌套弹窗
     */
    onClubTap(e) {
      // 判断是否为拖动操作
    const touch = e.changedTouches && e.changedTouches[0];
      if (touch && this._clubTouchStartX !== undefined) {
        const dx = Math.abs(touch.clientX - this._clubTouchStartX);
        const dy = Math.abs(touch.clientY - this._clubTouchStartY);
        const dt = Date.now() - (this._clubTouchStartTime || 0);
        
        // 如果移动距离超过10px或时间超过300ms，认为是拖动而非点击
    if (dx > 10 || dy > 10 || dt > 300) {
          return;
        }
      }

      const dataset = e.currentTarget.dataset;
      const clubId = dataset.clubId;
      const isManaged = dataset.isManaged;
      
      console.log('onClubTap - dataset:', dataset);
      console.log('onClubTap - clubId:', clubId, 'isManaged:', isManaged, 'type:', typeof isManaged);
      
      // 获取点击坐标
    let tapX, tapY;
      if (touch) {
        tapX = touch.clientX;
        tapY = touch.clientY;
      } else {
        const sys = wx.getSystemInfoSync();
        tapX = sys.windowWidth / 2;
        tapY = sys.windowHeight / 2;
      }
      
      console.log('onClubTap:', { clubId, isManaged, tapX, tapY });
      
      // 根据是否管理该协会，打开不同的弹窗
    if (isManaged) {
        console.log('打开协会管理弹窗');
        this.openNestedClubManage(clubId, tapX, tapY);
      } else {
        console.log('打开协会详情弹窗');
        this.openNestedClubDetail(clubId, tapX, tapY);
      }
    },

    /**
     * 点击活动封面 - 打开嵌套弹窗
     */
    onEventTap(e) {
      const { id: eventId, tapX, tapY } = e.detail;
      const clubList = this.data.clubList;
      
      console.log('onEventTap - eventId:', eventId);
      console.log('onEventTap - clubList:', clubList);
      
      // 查找该活动所属的协会，判断用户是否管理该协会
    let isManaged = false;
      for (let club of clubList) {
        const event = club.eventItems.find(item => item.id === eventId);
        if (event) {
          // 如果用户管理该协会，则认为也管理该活动
          isManaged = club.cur_user_managed || false;
          console.log('找到活动所属协会:', club.club_name, 'cur_user_managed:', club.cur_user_managed, 'isManaged:', isManaged);
          break;
        }
      }
      
      console.log('onEventTap:', { eventId, isManaged, tapX, tapY });
      
      // 根据是否管理该活动，打开不同的弹窗
    if (isManaged) {
        console.log('打开活动管理弹窗');
        this.openNestedEventManage(eventId, tapX, tapY);
      } else {
        console.log('打开活动详情弹窗');
        this.openNestedEventDetail(eventId, tapX, tapY);
      }
    },

    // ========= 嵌套弹窗方法 =========
    
    /**
     * 打开协会详情弹窗
     */
    openNestedClubDetail(clubId, tapX, tapY) {
      this.setData({
        nestedClubDetail: {
          visible: true,
          loading: true,
          renderPanel: false,
          clubId,
          tapX,
          tapY
        }
      }, () => {
        setTimeout(() => {
          const popup = this.selectComponent('#nestedClubDetailPopup');
          if (popup && popup.expand) {
            popup.expand(tapX, tapY);
          }
        }, 50);
      });
    },

    /**
     * 协会详情弹窗内容准备好
     */
    onNestedClubDetailContentReady() {
      console.log('协会详情弹窗contentReady，开始渲染panel');
      this.setData({
        'nestedClubDetail.renderPanel': true
      }, () => {
        console.log('renderPanel设置完成，当前状态:', this.data.nestedClubDetail);
        // 等待 panel 渲染后，调用 loadData
        setTimeout(() => {
          const panel = this.selectComponent('#nestedClubDetailPanel');
          console.log('获取到的panel:', panel);
          if (panel && panel.loadData) {
            console.log('调用panel.loadData()');
            panel.loadData();
          } else {
            console.error('未找到panel或panel没有loadData方法');
          }
        }, 100);
      });
    },

    /**
     * 协会详情弹窗加载完成
     */
    onNestedClubDetailLoaded() {
      this.setData({
        'nestedClubDetail.loading': false
      });
    },

    /**
     * 关闭协会详情弹窗
     */
    closeNestedClubDetail() {
      const popup = this.selectComponent('#nestedClubDetailPopup');
      if (popup && popup.collapse) {
        popup.collapse();
      }
    },

    /**
     * 协会详情弹窗收起回调
     */
    onNestedClubDetailCollapse() {
      setTimeout(() => {
        this.setData({
          'nestedClubDetail.visible': false,
          'nestedClubDetail.loading': true,
          'nestedClubDetail.renderPanel': false,
          'nestedClubDetail.clubId': ''
        });
      }, 800);
    },

    /**
     * 打开协会管理弹窗
     */
    openNestedClubManage(clubId, tapX, tapY) {
      this.setData({
        nestedClubManage: {
          visible: true,
          loading: true,
          renderPanel: false,
          clubId,
          tapX,
          tapY
        }
      }, () => {
        setTimeout(() => {
          const popup = this.selectComponent('#nestedClubManagePopup');
          if (popup && popup.expand) {
            popup.expand(tapX, tapY);
          }
        }, 50);
      });
    },

    /**
     * 协会管理弹窗内容准备好
     */
    onNestedClubManageContentReady() {
      console.log('协会管理弹窗contentReady，开始渲染panel');
      this.setData({
        'nestedClubManage.renderPanel': true
      }, () => {
        console.log('renderPanel设置完成，当前状态:', this.data.nestedClubManage);
        // 等待 panel 渲染后，调用 loadData
        setTimeout(() => {
          const panel = this.selectComponent('#nestedClubManagePanel');
          console.log('获取到的panel:', panel);
          if (panel && panel.loadData) {
            console.log('调用panel.loadData()');
            panel.loadData();
          } else {
            console.error('未找到panel或panel没有loadData方法');
          }
        }, 100);
      });
    },

    /**
     * 协会管理弹窗加载完成
     */
    onNestedClubManageLoaded() {
      this.setData({
        'nestedClubManage.loading': false
      });
    },

    /**
     * 关闭协会管理弹窗
     */
    closeNestedClubManage() {
      const popup = this.selectComponent('#nestedClubManagePopup');
      if (popup && popup.collapse) {
        popup.collapse();
      }
    },

    /**
     * 协会管理弹窗收起回调
     */
    onNestedClubManageCollapse() {
      // 不需要手动调用 applyLocalChanges，因为 recordChange 会自动广播
      
      setTimeout(() => {
        this.setData({
          'nestedClubManage.visible': false,
          'nestedClubManage.loading': true,
          'nestedClubManage.renderPanel': false,
          'nestedClubManage.clubId': ''
        });
      }, 800);
    },

    /**
     * 打开活动详情弹窗
     */
    openNestedEventDetail(eventId, tapX, tapY) {
      this.setData({
        nestedEventDetail: {
          visible: true,
          loading: true,
          renderPanel: false,
          eventId,
          tapX,
          tapY
        }
      }, () => {
        setTimeout(() => {
          const popup = this.selectComponent('#nestedEventDetailPopup');
          if (popup && popup.expand) {
            popup.expand(tapX, tapY);
          }
        }, 50);
      });
    },

    /**
     * 活动详情弹窗内容准备好
     */
    onNestedEventDetailContentReady() {
      console.log('活动详情弹窗contentReady，开始渲染panel');
      this.setData({
        'nestedEventDetail.renderPanel': true
      }, () => {
        console.log('renderPanel设置完成，当前状态:', this.data.nestedEventDetail);
        // 等待 panel 渲染后，调用 loadData
        setTimeout(() => {
          const panel = this.selectComponent('#nestedEventDetailPanel');
          console.log('获取到的panel:', panel);
          if (panel && panel.loadData) {
            console.log('调用panel.loadData()');
            panel.loadData();
          } else {
            console.error('未找到panel或panel没有loadData方法');
          }
        }, 100);
      });
    },

    /**
     * 活动详情弹窗加载完成
     */
    onNestedEventDetailLoaded() {
      this.setData({
        'nestedEventDetail.loading': false
      });
    },

    /**
     * 关闭活动详情弹窗
     */
    closeNestedEventDetail() {
      const popup = this.selectComponent('#nestedEventDetailPopup');
      if (popup && popup.collapse) {
        popup.collapse();
      }
    },

    /**
     * 活动详情弹窗收起回调
     */
    onNestedEventDetailCollapse() {
      setTimeout(() => {
        this.setData({
          'nestedEventDetail.visible': false,
          'nestedEventDetail.loading': true,
          'nestedEventDetail.renderPanel': false,
          'nestedEventDetail.eventId': ''
        });
      }, 800);
    },

    /**
     * 打开活动管理弹窗
     */
    openNestedEventManage(eventId, tapX, tapY) {
      this.setData({
        nestedEventManage: {
          visible: true,
          loading: true,
          renderPanel: false,
          eventId,
          tapX,
          tapY
        }
      }, () => {
        setTimeout(() => {
          const popup = this.selectComponent('#nestedEventManagePopup');
          if (popup && popup.expand) {
            popup.expand(tapX, tapY);
          }
        }, 50);
      });
    },

    /**
     * 活动管理弹窗内容准备好
     */
    onNestedEventManageContentReady() {
      console.log('活动管理弹窗contentReady，开始渲染panel');
      this.setData({
        'nestedEventManage.renderPanel': true
      }, () => {
        console.log('renderPanel设置完成，当前状态:', this.data.nestedEventManage);
        // 等待 panel 渲染后，调用 loadData
        setTimeout(() => {
          const panel = this.selectComponent('#nestedEventManagePanel');
          console.log('获取到的panel:', panel);
          if (panel && panel.loadData) {
            console.log('调用panel.loadData()');
            panel.loadData();
          } else {
            console.error('未找到panel或panel没有loadData方法');
          }
        }, 100);
      });
    },

    /**
     * 活动管理弹窗加载完成
     */
    onNestedEventManageLoaded() {
      this.setData({
        'nestedEventManage.loading': false
      });
    },

    /**
     * 关闭活动管理弹窗
     */
    closeNestedEventManage() {
      const popup = this.selectComponent('#nestedEventManagePopup');
      if (popup && popup.collapse) {
        popup.collapse();
      }
    },

    /**
     * 活动管理弹窗收起回调
     */
    onNestedEventManageCollapse() {
      // 不需要手动调用 applyLocalChanges，因为 recordChange 会自动广播
      
      setTimeout(() => {
        this.setData({
          'nestedEventManage.visible': false,
          'nestedEventManage.loading': true,
          'nestedEventManage.renderPanel': false,
          'nestedEventManage.eventId': ''
        });
      }, 800);
    },

    // ========= 智能更新机制（参考 home 页面）=========
    
    /**
     * 应用本地变更
     */
    applyLocalChanges() {
      const app = getApp();
      const changes = app.getChanges();
      console.log('[club-overview-panel] applyLocalChanges', changes);

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

      // 不清空 changes，让 home 页面也能应用这些变更
      // app.clearChanges() 应该由 home 页面调用
    },

    /**
     * 更新缓存中的项
     */
    updateInCache(type, id, data) {
      console.log('[club-overview-panel] updateInCache', type, id, data);

      if (type === 'club') {
        const { clubList = [] } = this.data;
        let updated = false;

        if (clubList.some(c => c && c.club_id == id)) {
          const next = clubList.map(c => {
            if (c && c.club_id == id) {
              // 更新协会信息，包括封面
    const updatedClub = { ...c, ...data };
              // 如果封面更新了，需要转换为缩略图
    if (data.cover_url) {
                updatedClub.cover_url = app.convertToThumbnailUrl(data.cover_url, 200);
              }
              return updatedClub;
            }
            return c;
          });
          this.setData({ clubList: next });
          updated = true;
        }
        return updated;
      }

      // 活动更新：需要找到对应的协会，然后更新其 eventItems
    if (type === 'event') {
        const { clubList = [] } = this.data;
        let updated = false;

        const next = clubList.map(club => {
          if (club.eventItems && club.eventItems.some(e => e.id == id)) {
            // 找到包含该活动的协会
    const updatedEventItems = club.eventItems.map(e => {
              if (e.id == id) {
                // 更新活动信息
    const joinCount = data.join_count !== undefined ? data.join_count : (e.join_count || 0);
                const title = data.title || e.title || '';
                const updatedEvent = {
                  ...e,
                  label: `${title}\n${joinCount}人参加`
                };
                
                // 如果封面更新了，需要转换为缩略图并更新 image 字段
    if (data.cover_url || data.cover) {
                  const coverUrl = data.cover_url || data.cover;
                  updatedEvent.image = app.convertToThumbnailUrl(coverUrl, 100);
                  console.log('[club-overview-panel] 更新活动封面:', id, updatedEvent.image);
                }
                
                return updatedEvent;
              }
              return e;
            });
            updated = true;
            return { ...club, eventItems: updatedEventItems };
          }
          return club;
        });

        if (updated) {
          this.setData({ clubList: next });
          console.log('[club-overview-panel] 活动更新完成');
        }
        return updated;
      }

      return false;
    },

    /**
     * 从缓存中删除项
     */
    removeFromCache(type, id) {
      console.log('[club-overview-panel] removeFromCache', type, id);

      if (type === 'club') {
        const { clubList = [] } = this.data;
        let updated = false;

        if (clubList.some(c => c && c.club_id == id)) {
          this.setData({ clubList: clubList.filter(c => c && c.club_id != id) });
          updated = true;
        }
        return updated;
      }

      // 活动删除：需要找到对应的协会，然后从其 eventItems 中删除
    if (type === 'event') {
        const { clubList = [] } = this.data;
        let updated = false;

        const next = clubList.map(club => {
          if (club.eventItems && club.eventItems.some(e => e.id == id)) {
            updated = true;
            return {
              ...club,
              eventItems: club.eventItems.filter(e => e.id != id)
            };
          }
          return club;
        });

        if (updated) {
          this.setData({ clubList: next });
        }
        return updated;
      }

      return false;
    },

    /**
     * 添加新项到缓存
     */
    addToCache(type, data) {
      console.log('[club-overview-panel] addToCache', type, data);

      if (type === 'club') {
        const { clubList = [] } = this.data;
        const clubId = data.club_id;
        
        // 若已存在则不重复添加
    if (clubList.some(c => c && c.club_id == clubId)) return false;
        
        // 添加新协会到列表开头
    const newClub = {
          club_id: clubId,
          club_name: data.club_name || data.name,
          description: data.description,
          cover_url: app.convertToThumbnailUrl(data.cover_url, 200),
          cur_user_managed: data.cur_user_managed || true, // 新创建的协会通常是管理的
          eventItems: [],
          eventsLoading: false
        };
        
        this.setData({ clubList: [newClub, ...clubList] });
        return true;
      }

      // 活动创建：需要找到对应的协会，然后添加到其 eventItems
    if (type === 'event') {
        const { clubList = [] } = this.data;
        const clubId = data.club_id;
        let updated = false;

        const next = clubList.map(club => {
          if (club.club_id == clubId) {
            // 检查是否已存在
    if (club.eventItems && club.eventItems.some(e => e.id == data.event_id)) {
              return club;
            }
            
            // 添加新活动
    const joinCount = data.join_count || 0;
            const coverUrl = data.cover_url || data.cover;
            const thumbnailUrl = coverUrl ? app.convertToThumbnailUrl(coverUrl, 100) : '';
            
            const newEvent = {
              id: data.event_id,
              image: thumbnailUrl,
              type: 'event_cover',
              ini_width: 100,
              ini_height: 120,
              label: `${data.title}\n${joinCount}人参加`
            };
            
            updated = true;
            return {
              ...club,
              eventItems: [newEvent, ...(club.eventItems || [])]
            };
          }
          return club;
        });

        if (updated) {
          this.setData({ clubList: next });
        }
        return updated;
      }

      return false;
    }
  }
});
