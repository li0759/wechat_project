const app = getApp();

/**
 * 通用协会列表Panel组件
 * 从packageClub/index页面转换而来
 * 支持不同?requestUrl?
 * - /club/user_joined/list (我的协会)
 * - /club/list/all (所有协?
 */

Component({
  properties: {
    requestUrl: {
      type: String,
      value: '/club/user_joined/list'
    }
  },

  data: {
    clubList: [],
    isClubLoading: false,
    clubPage: 1,
    clubTotalPages: 1,
    clubEmpty: false,
    
    // 嵌套弹窗状态
    nestedClubManage: {
      visible: false,
      loading: true,
      renderPanel: false,
      clubId: '',
      tapX: 0,
      tapY: 0
    },
    
    nestedClubDetail: {
      visible: false,
      loading: true,
      renderPanel: false,
      clubId: '',
      tapX: 0,
      tapY: 0
    },
    
    nestedClubJoined: {
      visible: false,
      loading: true,
      renderPanel: false,
      clubId: '',
      tapX: 0,
      tapY: 0
    }
  },

  lifetimes: {
    attached() {
      // 组件初始化，但不加载数据
    this.setData({
        requestUrl: this.properties.requestUrl
      });
    }
  },

  methods: {
    /**
     * 供外部调用的数据加载方法
     */
    loadData() {
      this.loadClubList(1);
      // 触发loaded事件
    this.triggerEvent('loaded');
    },

    /**
     * 加载协会列表
     */
    async loadClubList(page = 1) {
      if (this.data.isClubLoading || (this.data.clubTotalPages && page > this.data.clubTotalPages)) return;
      
      this.setData({ isClubLoading: true });
      
      if (page > 1) {
        const skeletons = Array(2).fill({ loading: true });
        this.setData({
          clubList: this.data.clubList.concat(skeletons)
        });
      } else if (page === 1 && this.data.clubList.length === 0) {
        this.setData({
          clubList: Array(4).fill({ loading: true })
        });
      }

      try {
        const requestUrl = `${this.data.requestUrl}?mode=page&page=${page}`;
        
        const response = await this.request({
          url: requestUrl,
          method: 'GET'
        });
        
        if (response.Flag == '4000') {
          const clubs = response.data.records || [];
          
          const realData = clubs.map(club => ({
            ...club,
            loading: false,
            cover_url_thumb: club.cover_url ? app.convertToThumbnailUrl(club.cover_url, 150) : (club.club_imgs && club.club_imgs[0] ? app.convertToThumbnailUrl(club.club_imgs[0], 150) : ''),
            president_info: {
              president_username: club.president_username,
              president_avatar: club.president_avatar
            },
            // 确保用户关系字段被正确映射
            cur_user_is_member: club.cur_user_is_member || false,
            cur_user_managed: club.cur_user_managed || false,
            // 映射删除状态字段 - 后端返回is_deleted，组件期望isDelete
            isDelete: club.is_deleted || false
          }));          
          const isEmpty = page === 1 && realData.length === 0;
          
          if (page == 1) {
            this.setData({
              clubList: [],
            }, () => {
              this.setData({
                clubList: realData,
                clubPage: response.data.pagination.current_page || page,
                clubTotalPages: response.data.pagination.total_pages || 1,
                clubEmpty: isEmpty,
                isClubLoading: false
              });
            });
          } else {
            const remain = this.data.clubList.length - 2;
            this.setData({
              clubList: [
                ...this.data.clubList.slice(0, remain),
                ...realData
              ],
              clubPage: response.data.pagination.current_page || page,
              clubTotalPages: response.data.pagination.total_pages || 1,
              isClubLoading: false
            });
          }
        } else {
          if (page === 1) {
            this.setData({ isClubLoading: false });
          } else {
            const remain = this.data.clubList.length - 2;
            this.setData({
              clubList: this.data.clubList.slice(0, remain),
              isClubLoading: false
            });
          }
          throw new Error(response.message || '获取协会列表失败');
        }
      } catch (error) {        if (page === 1) {
          wx.showToast({
            title: '加载协会列表失败',
            icon: 'none'
          });
          this.setData({ isClubLoading: false });
        } else {
          const remain = this.data.clubList.length - 2;
          this.setData({
            clubList: this.data.clubList.slice(0, remain),
            isClubLoading: false
          });
        }
      }
    },

    onScrollToLower() {
      this.loadClubList(this.data.clubPage + 1);
    },

    onClubTap(e) {
      const clubId = e.currentTarget.dataset.clubId;
      const club = this.data.clubList.find(c => c.club_id === clubId);
      
      if (!club) {        return;
      }
      
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
      // 根据用户与协会的关系决定弹出的panel类型
    if (club.cur_user_managed) {        // 用户管理该协?-> 弹出协会管理panel
    this.setData({
          nestedClubManage: {
            visible: true,
            loading: true,
            renderPanel: false,
            clubId: clubId,
            tapX,
            tapY
          }
        }, () => {
          setTimeout(() => {
            const popup = this.selectComponent('#nestedClubManagePopup');
            if (popup && popup.expand) {
              popup.expand(tapX, tapY);
            } else {            }
          }, 50);
        });
      } else if (club.cur_user_is_member) {        // 用户是成员但不是管理员-> 弹出已加入协会panel
    this.setData({
          nestedClubJoined: {
            visible: true,
            loading: true,
            renderPanel: false,
            clubId: clubId,
            tapX,
            tapY
          }
        }, () => {
          setTimeout(() => {
            const popup = this.selectComponent('#nestedClubJoinedPopup');
            if (popup && popup.expand) {
              popup.expand(tapX, tapY);
            } else {            }
          }, 50);
        });
      } else {        // 用户不是成员 -> 弹出协会详情panel
    this.setData({
          nestedClubDetail: {
            visible: true,
            loading: true,
            renderPanel: false,
            clubId: clubId,
            tapX,
            tapY
          }
        }, () => {
          setTimeout(() => {
            const popup = this.selectComponent('#nestedClubDetailPopup');
            if (popup && popup.expand) {
              popup.expand(tapX, tapY);
            } else {            }
          }, 50);
        });
      }
    },

    previewClubImage(e) {
      const { clubId, index } = e.currentTarget.dataset;
      const club = this.data.clubList.find(c => c.club_id === clubId);
      
      if (club && club.club_imgs) {
        const images = club.club_imgs.map(img => img);
        wx.previewImage({
          current: images[index],
          urls: images
        });
      }
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
    },

    // ========= 嵌套 Club Manage 弹窗相关 =========
  onNestedClubManageContentReady() {      this.setData({
        'nestedClubManage.renderPanel': true
      }, () => {
        setTimeout(() => {
          const panel = this.selectComponent('#nestedClubManagePanel');
          if (panel && panel.loadData) {
            panel.loadData();
          }
        }, 100);
      });
    },

    onNestedClubManageLoaded() {      this.setData({
        'nestedClubManage.loading': false
      });
    },

    closeNestedClubManage() {
      const popup = this.selectComponent('#nestedClubManagePopup');
      if (popup && popup.collapse) {
        popup.collapse();
      }
    },

    onNestedClubManageCollapse() {
      // 收起时不做任何操作，等待collapsed事件
  },

    onNestedClubManageCollapsed() {
      setTimeout(() => {
        this.setData({
          'nestedClubManage.visible': false,
          'nestedClubManage.loading': true,
          'nestedClubManage.renderPanel': false,
          'nestedClubManage.clubId': ''
        });
      }, 300);
    },

    onNestedClubManageUpdate(e) {      // 刷新协会列表
    this.loadClubList(1);
    },

    // ========= 嵌套 Club Detail 弹窗相关 =========
  onNestedClubDetailContentReady() {      this.setData({
        'nestedClubDetail.renderPanel': true
      }, () => {
        setTimeout(() => {
          const panel = this.selectComponent('#nestedClubDetailPanel');
          if (panel && panel.loadData) {
            panel.loadData();
          }
        }, 100);
      });
    },

    onNestedClubDetailLoaded() {      this.setData({
        'nestedClubDetail.loading': false
      });
    },

    closeNestedClubDetail() {
      const popup = this.selectComponent('#nestedClubDetailPopup');
      if (popup && popup.collapse) {
        popup.collapse();
      }
    },

    onNestedClubDetailCollapse() {
      // 收起时不做任何操作，等待collapsed事件
  },

    onNestedClubDetailCollapsed() {
      setTimeout(() => {
        this.setData({
          'nestedClubDetail.visible': false,
          'nestedClubDetail.loading': true,
          'nestedClubDetail.renderPanel': false,
          'nestedClubDetail.clubId': ''
        });
      }, 300);
    },

    onNestedClubDetailUpdate(e) {      // 刷新协会列表
    this.loadClubList(1);
    },

    // ========= 嵌套 Club Joined 弹窗相关 =========
  onNestedClubJoinedContentReady() {      this.setData({
        'nestedClubJoined.renderPanel': true
      }, () => {
        setTimeout(() => {
          const panel = this.selectComponent('#nestedClubJoinedPanel');
          if (panel && panel.loadData) {
            panel.loadData();
          }
        }, 100);
      });
    },

    onNestedClubJoinedLoaded() {      this.setData({
        'nestedClubJoined.loading': false
      });
    },

    closeNestedClubJoined() {
      const popup = this.selectComponent('#nestedClubJoinedPopup');
      if (popup && popup.collapse) {
        popup.collapse();
      }
    },

    onNestedClubJoinedCollapse() {
      // 收起时不做任何操作，等待collapsed事件
  },

    onNestedClubJoinedCollapsed() {
      setTimeout(() => {
        this.setData({
          'nestedClubJoined.visible': false,
          'nestedClubJoined.loading': true,
          'nestedClubJoined.renderPanel': false,
          'nestedClubJoined.clubId': ''
        });
      }, 300);
    },

    onNestedClubJoinedUpdate(e) {      // 刷新协会列表
    this.loadClubList(1);
    },

    onNavigateEventFromJoined(e) {
      const { eventId } = e.detail;
      // 向上传递事件，让父组件处理
    this.triggerEvent('navigateEvent', { eventId });
    },

    onNavigateClubFromJoined(e) {
      const { clubId } = e.detail;
      // 向上传递事件，让父组件处理
    this.triggerEvent('navigateClub', { clubId });
    }
  }
});
