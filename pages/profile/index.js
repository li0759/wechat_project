// pages/profile/index.js
const app = getApp()

Page({

  /**
   * 页面的初始数据   */
  data: {
    userInfo: {},
    loading: true,
    isClubAdmin: false,  // 是否为协会管理员
    isSuperUser: false,  // 是否为超级用数
      managedClubs: [],    // 用户管理的协会列数
      statistics: {
      joinedClubs: 0,     // 已加入协会数
      joinedEvents: 0,    // 参加的活动数
      unreadNotices: 0,   // 未读通知数
      pendingApplications: 0,  // 待处理的我的申请
      pendingClubApplications: 0,  // 待处理的入团申请（管理员数
      unpaidPayments: 0,  // 未缴费的收款数量
      pregoEvents: 0,     // 预计开始的活动数
      goingEvents: 0,     // 正在进行的活动数
      endedEvents: 0,      // 已结束的活动数
      // Task 8.2: 我管理的活动统计
      managedPregoEvents: 0,   // 我管理的预计开始活动数
      managedGoingEvents: 0,   // 我管理的正在进行活动数
      managedEndedEvents: 0,   // 我管理的已结束活动数
      managedCancelledEvents: 0 // 我管理的已取消活动数
  },
    hasEverManaged: false,  // Task 8.2: 是否曾经管理过活数
      currentlyManaging: false, // Task 8.2: 是否当前正在管理活动
    
    // 全局弹窗状态管理（统一管理所?panel数
      globalPopup: {
      visible: false,
      loading: true,
      renderPanel: false,  // 是否渲染 panel 组件
      type: '', // 'club-create' | 'event-create' | 'event-manage' | 'club-manage'
      id: '',
      clubId: '',  // 用于 event-create
      bgColor: 'rgba(223, 118, 176, 0.8)',
      sheetBgColor: 'rgba(223, 118, 176, 0.8)',
      tapX: 0,
      tapY: 0
    },
    
    // 触摸追踪变量
    touchStartX: 0,
    touchStartY: 0,
    touchStartTime: 0,
    
    // Fallback 标志
    useFallbackNavigation: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    // 组件验证将在第一次打开弹窗时进数
      // 检查是否需要自动弹出活动面数
      const { eventId, autoOpen } = options;
    if (eventId && autoOpen === 'joined') {
      this._autoOpenEventPanel = {
        eventId,
        type: 'joined'
      };
    }
  },


  /**
   * 生命周期函数--监听页面显示
   */
  onShow: async function() {    
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      // 设置tabbar索引?（我的）
    this.getTabBar().setActive(2);
    }
    if(await app.checkLoginStatus()){
      this.setData({
        userInfo: wx.getStorageSync('userInfo')
      });
      await this.fetchUserData();
      
      // 处理列表项的最后一个元素样数
      this.processLastItems();
      
      // 检查是否有待处理的全局事件面板请求（来?tabbar 切换数
      if (app.globalData.pendingEventPanel) {
        const { eventId, type } = app.globalData.pendingEventPanel;        app.globalData.pendingEventPanel = null; // 清除标记
        
        // 延迟弹出，确保页面渲染完数
      setTimeout(() => {
    this.autoOpenEventPanel(eventId, type);
  }, 300);
      }
      // 检查是否需要自动弹出活动面板（来自 URL 参数数
      else if (this._autoOpenEventPanel) {
    const { eventId, type } = this._autoOpenEventPanel;        this._autoOpenEventPanel = null; // 清除标记，避免重复弹数
      // 延迟弹出，确保页面渲染完数
      setTimeout(() => {
    this.autoOpenEventPanel(eventId, type);
  }, 300);
      } else {      }
    }
  },
  
  /**
   * 处理列表项的最后一个元素样?   */
  processLastItems() {
    // 获取所有跟踪项
    const query = wx.createSelectorQuery();
    
    // 处理跟踪数据
    query.selectAll('.tracking-item').boundingClientRect(rects => {
    if (rects && rects.length > 0) {
        // 为最后一个元素添加特殊类
    const lastIndex = rects.length - 1;
        const lastItemSelector = `.tracking-item:nth-child(${lastIndex + 1})`;
        
        wx.createSelectorQuery()
          .select(lastItemSelector)
          .fields({ node: true, size: true }, function(res) {
            if (res && res.node) {
              res.node.classList.add('tracking-item-last');
            }
          })
          .exec();
      }
    }).exec();
    
    // 处理统计数据
    query.selectAll('.stat-item').boundingClientRect(rects => {
    if (rects && rects.length > 0) {
        // 为最后一个元素添加特殊类
    const lastIndex = rects.length - 1;
        const lastItemSelector = `.stat-item:nth-child(${lastIndex + 1})`;
        
        wx.createSelectorQuery()
          .select(lastItemSelector)
          .fields({ node: true, size: true }, function(res) {
            if (res && res.node) {
              res.node.classList.add('stat-item-last');
            }
          })
          .exec();
      }
    }).exec();
  },

  onCustomTabItemTap() {
  },

  /**
   * 打开创建弹窗
   */
  openCreatePopup(e) {
    const dataset = e.currentTarget.dataset;
    const type = dataset.type; // 'club-create' | 'event-create'
    const clubId = dataset.club_id || '';    
    // 设置弹窗状态
    this.setData({
      globalPopup: {
        visible: true,
        loading: true,
        renderPanel: false,
        type,
        id: '',
        clubId,
        bgColor: '#f3e3f3ff',
        sheetBgColor: '#f3e3f3ff'
      }
    }, () => {      // 让组件自己处理坐标获取和展开动画
      setTimeout(() => {
        const popup = this.selectComponent('#globalFullscreenPopup');
        if (popup && popup.handleTriggerTap) {
          popup.handleTriggerTap(e);  // 👈 使用组件的方数
      } else {        }
      }, 50);
    });
  },

  /**
   * 打开管理弹窗
   */
  openManagePopup(e) {
    const dataset = e.currentTarget.dataset;
    const type = dataset.popupType; // 'event-manage' | 'club-manage'
    const id = dataset.popupId; // eventId ?clubId
    const bgColor = dataset.bgColor || '#f3e3f3ff';
    const sheetBgColor = dataset.sheetBgColor || '#f3e3f3ff';    
    // 设置弹窗状态
    this.setData({
      globalPopup: {
        visible: true,
        loading: true,
        renderPanel: false,
        type,
        id,
        clubId: '',
        bgColor,
        sheetBgColor
      }
    }, () => {      // 让组件自己处理坐标获取和展开动画
      setTimeout(() => {
        const popup = this.selectComponent('#globalFullscreenPopup');
        if (popup && popup.handleTriggerTap) {
          popup.handleTriggerTap(e);  // 👈 使用组件的方数
      } else {        }
      }, 50);
    });
  },

  /**
   * 自动弹出活动面板（从分享链接进入?   */
  async autoOpenEventPanel(eventId, type) {
    try {
      // 1. 先请求活动详情，判断用户角色
    const res = await new Promise((resolve, reject) => {
        wx.request({
          url: app.globalData.request_url + `/event/${eventId}`,
          method: 'GET',
          header: {
            'Authorization': `Bearer ${wx.getStorageSync('token')}`,
            'Content-Type': 'application/json'
          },
          success: resolve,
          fail: reject
        });
      });
      
      if (res.data.Flag !== '4000') {
        wx.showToast({ title: '活动不存', icon: 'none' });
        return;
      }
      
      const eventData = res.data.data;
      const isAdmin = eventData.cur_user_managed;
      
      // 2. 根据角色决定弹出哪个面板
    const panelType = isAdmin ? 'event-manage' : 'event-joined';      
      // 3. 设置弹窗状态
    this.setData({
        globalPopup: {
          visible: true,
          loading: true,
          renderPanel: false,
          type: panelType,
          id: eventId,
          clubId: '',
          bgColor: '#f3e3f3ff',
          sheetBgColor: '#f3e3f3ff',
          autoAction: {
            enabled: true,
            eventData: eventData
          }
        }
      }, () => {        // 自动打开时使用屏幕中心坐数
      setTimeout(() => {
    const popup = this.selectComponent('#globalFullscreenPopup');
          if (popup && popup.expand) {
            const sys = wx.getSystemInfoSync();
            popup.expand(sys.windowWidth / 2, sys.windowHeight / 2);
          } else {          }
        }, 50);
      });
    } catch (error) {      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /**
   * 管理 Panel 更新回调
   */
  onManagePanelUpdate(e) {
    // 刷新 profile 页面数据
    this.fetchUserData().catch(err => {    });
  },

  /**
   * Events Panel 更新回调
   */
  onEventsPanelUpdate(e) {
    // 刷新 profile 页面数据（特别是统计数字数
      this.fetchUserData().catch(err => {
  });
  },

  /**
   * 协会解散回调
   */
  onClubDissolved() {
    // 关闭弹窗
    this.closeGlobalPopup();
    
    // 刷新数据
    this.fetchUserData().catch(err => {    });
  },

  /**
   * Panel 创建成功（统一处理?   */
  onPanelCreateSuccess(e) {
    const { type } = e.detail || {};
    
    // 关闭弹窗
    this.closeGlobalPopup();
    
    // 显示成功提示
    wx.showToast({
      title: type === 'club' ? '协会创建成功' : '活动创建成功',
      icon: 'success'
    });
    
    // 刷新 profile 页面数据
    this.fetchUserData().catch(err => {    });
  },

  /**
   * Panel 创建失败（统一处理?   */
  onPanelCreateError(e) {
    const { message } = e.detail || {};
    
    // 显示错误提示
    wx.showToast({
      title: message || '创建失败',
      icon: 'none',
      duration: 2000
    });
  },

  /**
   * 获取用户数据
   */
  async fetchUserData() {
    try {
      wx.showLoading({
        title: '加载?..',
      });
      
      // 获取用户ID
    const userId = wx.getStorageSync('userInfo').id;
      if (!userId) {
        throw new Error('未找到用户ID');
      }
      

      await Promise.allSettled([
        this.fetchleadclubInfo(),
        this.fetchUserJoinedClubs(),
        this.fetchUserJoinedEvents(),
        this.fetchPendingApplications(),
        this.fetchUnpaidPayments(),   // 新增：获取未缴费的收款数数
      this.fetchMyEventsCount(),      // 新增：获取我的活动各状态数数
      this.fetchManagedEventsCount()  // Task 8.2: 获取我管理的活动各状态数数
      ]);
    this.setData({
        loading: false
      });
      
      wx.hideLoading();
    } catch (error) {      wx.hideLoading();
      wx.showToast({
        title: error && error.message ? error.message : '获取用户数据失败',
        icon: 'none'
      });
    }
  },


  /**
   * 获取用户管理的协会，同时获取这些协会发起的活动   */
  async fetchleadclubInfo() {
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.request_url + `/club/user_managed/list`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json'
        },
        success: async (res) => {
          if (res.data.Flag == 4000) {          
            if (res.data.data.length > 0) {
              // 过滤掉已删除的协会（只在 Profile 页面过滤，不影响其他地方数
      const adminClubs = res.data.data.filter(club => !club.is_deleted);
    if (adminClubs.length === 0) {
                // 如果没有未删除的协会，设置为数
      this.setData({
                  isClubAdmin: false,
                  managedClubs: []
                });
                resolve();
                return;
              }
              
              // 使用Promise.all等待所有异步操作完成
    const clubsWithDetails = await Promise.all(adminClubs.map(async (club) => {
                // 为每个协会获取未处理申请数量和活动事数
      const pendingApplications = await this.fetchClubPendingApplicationsCount(club.club_id);
                const activities = await this.fetchClubActiveEvents(club.club_id);
                const processedActivities = activities.map((activity) => {
                  // 格式化开始时数
      activity.start_time = app.formatDateTime( new Date(activity.start_time));
                  return activity
                })
                // 返回带有额外数据的协会对数
      return {
                  ...club,
                  pending_applications: pendingApplications,
                  activities: processedActivities,
                  activities_count: processedActivities.length
                };
              }));
              this.setData({
                isClubAdmin: true,
                managedClubs: clubsWithDetails
              });
            }           
            resolve();
          } else {
            reject(new Error(res.data.message || '获取用户信息失败'));
          }
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },




  /**
   * 获取单个协会的未完结活动
   */
  async fetchClubActiveEvents(clubId) {
    return new Promise((resolve) => {
      if (!clubId) {
        resolve(0);
        return;
      }
      
      wx.request({
        url: app.globalData.request_url + `/event/club_public/${clubId}/list/going?mode=page&page=1`, 
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json'
        },
        dataType: 'json',
        success: async (res) => {
          if (res.data.Flag == 4000) {
            const activities = res.data.data.records;
            // 为每个活动获取详细信息（打卡人数和参加人数）
    const activitiesWithDetails = await Promise.all(activities.map(async (activity) => {
              // 获取活动参与人数
    const eventMenbers = await this.fetchEventMenber(activity.event_id);
              // 判断活动是否已开数
      const now = new Date();
              const startTime = new Date(activity.start_time);
              const isStarted = now > startTime;
              
              return {
                ...activity,
                participant_count: eventMenbers.length,
                checkin_count: eventMenbers.filter(menber => menber.clockinDate).length,
                is_started: isStarted,
                event_id: activity.event_id,
              };
            }));
            
            resolve(activitiesWithDetails);
          } else {
            resolve([]);
          }
        },
        fail: () => {
          resolve([]);
        }
      });
    });
  },
  
  /**
   * 获取活动参与人数
   */
  async fetchEventMenber(eventId) {
    return new Promise((resolve) => {
      wx.request({
        url: app.globalData.request_url + `/event/${eventId}/members`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json'
        },
        success: (res) => {
          if (res.data.Flag == 4000) {
            resolve(res.data.data.members);
          } else {
            resolve([]);
          }
        },
        fail: () => {
          resolve([]);
        }
      });
    });
  },
  
  

  /**
   * 获取用户已加入的协会数量
   */
  async fetchUserJoinedClubs() {
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.request_url + `/club/user_joined/list`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json'
        },
        success: (res) => {
          if (res.data.Flag == 4000) {
            const clubCount = res.data.data ? res.data.data.length : 0;
            
            // 确保 clubCount 是有效数数
      if (typeof clubCount === 'number' && !isNaN(clubCount)) {
    this.setData({
                'statistics.joinedClubs': clubCount
              });
            }
            
            resolve(clubCount);
          } else {
            // 失败时设置为 0 而不?reject
    this.setData({
              'statistics.joinedClubs': 0
            });
            resolve(0);
          }
        },
        fail: (err) => {
          // 失败时设置为 0 而不?reject
    this.setData({
            'statistics.joinedClubs': 0
          });
          resolve(0);
        }
      });
    });
  },

  /**
   * 获取用户参加的还未结束的活动数量
   */
  async fetchUserJoinedEvents() {
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.request_url + `/event/user_joined/list/going?mode=count`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json'
        },
        success: (res) => {
          if (res.data.Flag == 4000) {     
            const eventCount = res.data.data.count;
            
            this.setData({
              'statistics.joinedEvents': eventCount
            });
            
            resolve(eventCount);
          } else {
            reject(new Error(res.data.message || '获取活动数量失败'));
          }
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },

  /**
   * 获取我的活动各状态数据   */
  async fetchMyEventsCount() {
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.request_url + `/event/user_joined/list/all?mode=count`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json'
        },
        success: (res) => {
          if (res.data.Flag == 4000) {
            // 分别获取各状态的数量
            Promise.all([
              this.fetchEventCountByType('prego'),
              this.fetchEventCountByType('going'),
              this.fetchEventCountByType('ended')
            ]).then(([pregoCount, goingCount, endedCount]) => {
              this.setData({
                'statistics.pregoEvents': pregoCount,
                'statistics.goingEvents': goingCount,
                'statistics.endedEvents': endedCount
              });
              resolve();
            }).catch(reject);
          } else {
            reject(new Error(res.data.message || '获取活动数量失败'));
          }
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },

  /**
   * 获取特定类型的活动数据   */
  async fetchEventCountByType(type) {
    return new Promise((resolve) => {
      wx.request({
        url: app.globalData.request_url + `/event/user_joined/list/${type}?mode=count`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json'
        },
        success: (res) => {
          if (res.data.Flag == 4000) {
            resolve(res.data.data.count || 0);
          } else {
            resolve(0);
          }
        },
        fail: () => {
          resolve(0);
        }
      });
    });
  },

  /**
   * Task 8.2: 获取我管理的活动各状态数据   */
  async fetchManagedEventsCount() {
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.request_url + `/event/user_manage/list/all?mode=count`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json'
        },
        success: (res) => {
          if (res.data.Flag == 4000) {
            const data = res.data.data;
            const pregoCount = data.prego_count || 0;
            const goingCount = data.going_count || 0;
            const endedCount = data.ended_count || 0;
            const cancelledCount = data.cancelled_count || 0;
            
            // 判断是否曾经管理过活动（任何状态的活动数量 > 0数
      const hasEverManaged = (pregoCount + goingCount + endedCount + cancelledCount) > 0;
            
            // 判断是否当前正在管理活动（预计开始或正在进行的活动数据> 0数
      const currentlyManaging = (pregoCount + goingCount) > 0;
            
            this.setData({
              'statistics.managedPregoEvents': pregoCount,
              'statistics.managedGoingEvents': goingCount,
              'statistics.managedEndedEvents': endedCount,
              'statistics.managedCancelledEvents': cancelledCount,
              hasEverManaged: hasEverManaged,
              currentlyManaging: currentlyManaging
            });
            resolve();
          } else {
            reject(new Error(res.data.message || '获取管理活动数量失败'));
          }
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },

  /**
   * 获取用户发起的待处理的入团申请数据   */
  async fetchPendingApplications() {
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.request_url + '/club/application/user_applicated/list',
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json'
        },
        success: (res) => {
          if (res.data.Flag == 4000) {
            const applications = res.data.data || [];
            const pendingCount = applications.filter(app => !app.processedDate).length;
            this.setData({
              'statistics.pendingApplications': pendingCount
            });
            
            resolve(pendingCount);
          } else {
            reject(new Error(res.data.message || '获取申请数量失败'));
          }
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },

  /**
   * 获取单个协会的待处理申请数量
   */
  async fetchClubPendingApplicationsCount(clubId) {
    return new Promise((resolve) => {
      if (!clubId) {
        resolve(0);
        return;
      }
      wx.request({
        url: app.globalData.request_url + `/club/application/${clubId}/pending/list`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json'
        },

        success: (res) => {
          if (res.data.Flag == 4000) {
            
            const applications = res.data.data || [];
            const pendingCount = applications.filter(app => !app.processedDate).length;
            resolve(pendingCount);
          } else {            resolve(0);
          }
        },
        fail: (err) => {          resolve(0);
        }
      });
    });
  },

  /**
   * 获取用户未缴费的收款数量
   */
  async fetchUnpaidPayments() {
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.request_url + '/money/paypersonal/user_payable/list/unpaid?mode=count',
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json'
        },
        success: (res) => {
          if (res.data.Flag === '4000') {
            // 统计未缴费的数量（pay_date为null的记录）
    const unpaidCount = res.data.data.count;
            
            this.setData({
              'statistics.unpaidPayments': unpaidCount
            });
            
            resolve(unpaidCount);
          } else {            resolve(0);
          }
        },
        fail: (err) => {          resolve(0);
        }
      });
    });
  },

  navigateToTest() {
    wx.navigateTo({
      url: '/packageProfile/test/index'
    });
  },

  // 导航方法
  navigateToEdit() {
    wx.navigateTo({
      url: '/packageProfile/edit/index'
    });
  },

  navigateToUserInfo(e) {
    const userId = this.data.userInfo.id;    
    // 设置弹窗状态
    this.setData({
      globalPopup: {
        visible: true,
        loading: true,
        renderPanel: false,
        type: 'user-info',
        id: userId,
        data: {},
        bgColor: '#f3e3f3ff',
        sheetBgColor: '#f3e3f3ff'
      }
    }, () => {      setTimeout(() => {
        const popup = this.selectComponent('#globalFullscreenPopup');
        if (popup && popup.handleTriggerTap) {
          popup.handleTriggerTap(e);  // 👈 使用组件的方数
      } else {        }
      }, 50);
    });
  },

  navigateToJoinedClubs(e) {    
    // 设置弹窗状态
    this.setData({
      globalPopup: {
        visible: true,
        loading: true,
        renderPanel: false,
        type: 'clubs',
        id: '',
        data: {
          requestUrl: '/club/user_joined/list'
        },
        bgColor: '#f3e3f3ff',
        sheetBgColor: '#f3e3f3ff'
      }
    }, () => {      setTimeout(() => {
        const popup = this.selectComponent('#globalFullscreenPopup');
        if (popup && popup.handleTriggerTap) {
          popup.handleTriggerTap(e);  // 👈 使用组件的方数
      } else {        }
      }, 50);
    });
  },
  

  navigateToJoinedEvents() {
    this.openGlobalPopup({
      type: 'joined-events',
      data: {
        requestUrl: '/event/user_joined/list/all'
      }
    });
  },

  /**
   * 通用方法：打开全局弹窗
   * @param {Object} e - 事件对象（可选，如果没有则使用屏幕中心）
   * @param {Object} config - 弹窗配置
   */
  _openGlobalPopup(e, config) {
    const popupConfig = {
      visible: true,
      loading: true,
      renderPanel: false,
      bgColor: '#f3e3f3ff',
      sheetBgColor: '#f3e3f3ff',
      ...config
    };
    
    this.setData({ globalPopup: popupConfig }, () => {
      setTimeout(() => {
        const popup = this.selectComponent('#globalFullscreenPopup');
        if (popup && popup.handleTriggerTap) {
          // 如果有事件对象，让组件自己获取坐数
      if (e) {
            popup.handleTriggerTap(e);
          } else {
            // 没有事件对象，使用屏幕中数
      const sys = wx.getSystemInfoSync();
            popup.expand(sys.windowWidth / 2, sys.windowHeight / 2);
          }
        } else {        }
      }, 50);
    });
  },

  /**
   * 导航到我的活动（根据类型?   */
  navigateToMyEvents(e) {
    const type = e.currentTarget.dataset.type;
    if (type === 'quit') {
      wx.showToast({ title: '功能开发中', icon: 'none' });
      return;
    }
    
    this._openGlobalPopup(e, {
      type: 'events',
      id: '',
      data: { requestUrl: `/event/user_joined/list/${type}` }
    });
  },

  navigateToMyApplications(e) {
    wx.navigateTo({
      url: '/packageClub/my-applications/index',
      success: () => {      },
      fail: (err) => {      }
    });
  },

  /**
   * Task 8.3: 显示预计开始的管理活动
   */
  showPregoEvents(e) {
    this.showManagedEvents(e, 'prego');
  },

  /**
   * Task 8.3: 显示正在进行的管理活动   */
  showGoingEvents(e) {
    this.showManagedEvents(e, 'going');
  },

  /**
   * Task 8.3: 显示已结束的管理活动
   */
  showEndedEvents(e) {
    this.showManagedEvents(e, 'ended');
  },

  /**
   * Task 8.3: 显示已取消的管理活动
   */
  showCancelledEvents(e) {
    this.showManagedEvents(e, 'cancelled');
  },

  /**
   * Task 8.3: 显示所有管理活动   */
  showAllManagedEvents(e) {
    this.showManagedEvents(e, 'all');
  },

  /**
   * Task 8.3: 通用方法 - 显示管理活动
   */
  showManagedEvents(e, type) {
    this._openGlobalPopup(e, {
      type: 'events',
      id: '',
      data: { requestUrl: `/event/user_manage/list/${type}` }
    });
  },

  navigateToMyApplications(e) {
    this._openGlobalPopup(e, {
      type: 'my-applications',
      id: '',
      data: {}
    });
  },

  navigateToClubmanage(e) {
    const club_id = e.currentTarget.dataset.club_id;
    wx.navigateTo({
      url: `/packageClub/club-manage/index?clubId=${club_id}`
    });
  },

  navigateToClubMembers(e) {
    const club_id = e.currentTarget.dataset.club_id;
    this._openGlobalPopup(e, {
      type: 'club-members',
      id: club_id,
      data: {}
    });
  },

  navigateToCreateEvent(e) {
    if (this.data.useFallbackNavigation) {
      const club_id = e.currentTarget.dataset.club_id;
      wx.navigateTo({
        url: `/packageEvent/event-create/index?clubId=${club_id}`
      });
    } else {
      this.openCreatePopup(e);
    }
  },

  navigateToClubApplications(e) {
    const club_id = e.currentTarget.dataset.club_id;
    this._openGlobalPopup(e, {
      type: 'club-applications',
      id: club_id,
      data: {}
    });
  },

  navigateToClubEvent(e) {
    const clubId = e.currentTarget.dataset.club_id;
    this._openGlobalPopup(e, {
      type: 'events',
      id: '',
      data: { requestUrl: `/event/club_public/${clubId}/list/all` }
    });
  },

  // 添加导航到协会收支时间轴页面的方数
      navigateToClubTimeline(e) {
    const clubId = e.currentTarget.dataset.club_id;
    
    // 构造事件对象，模拟点击事件
    const mockEvent = {
      currentTarget: {
        dataset: {
          popupType: 'club-timeline',
          popupId: clubId,
          bgColor: '#f3e3f3ff',
          sheetBgColor: '#f3e3f3ff'
        }
      },
      changedTouches: e.changedTouches,
      touches: e.touches
    };
    
    this.openGlobalPopup(mockEvent);
  },

  /**
   * 导航到协会收支统计页面   */
  navigateToClubFinancial(e) {
    const clubId = e.currentTarget.dataset.club_id;
    
    // 构造事件对象，模拟点击事件
    const mockEvent = {
      currentTarget: {
        dataset: {
          popupType: 'club-financial',
          popupId: clubId,
          bgColor: '#f3e3f3ff',
          sheetBgColor: '#f3e3f3ff'
        }
      },
      changedTouches: e.changedTouches,
      touches: e.touches
    };
    
    this.openGlobalPopup(mockEvent);
  },

  navigateToSettings() {
    wx.navigateTo({
      url: '/packageProfile/settings/index',
    })
  },

  navigateToAbout() {
    wx.navigateTo({
      url: '/packageProfile/about/index'
    });
  },
  /**
   * 导航到活动跟踪页面   */
  navigateToEventTracking(e) {
    const eventId = e.currentTarget.dataset.event_id;
    wx.navigateTo({
      url: `/packageEvent/event-manage/index?eventId=${eventId}`
    });
  },

  /**
   * 导航到收款页面   */
  navigateToPaypersonal(e) {
    // 构造事件对象，模拟点击事件
    const mockEvent = {
      currentTarget: {
        dataset: {
          popupType: 'paypersonal',
          popupId: '',
          bgColor: '#f3e3f3ff',
          sheetBgColor: '#f3e3f3ff'
        }
      },
      changedTouches: e.changedTouches,
      touches: e.touches
    };
    
    this.openGlobalPopup(mockEvent);
  },



  /**
   * 导航到创建协会页面   */
  navigateToCreateClub(e) {
    if (this.data.useFallbackNavigation) {
      // 使用原有的页面跳转方数
      wx.navigateTo({
        url: '/packageClub/club-create/index'
      });
    } else {
      // 使用新的弹窗方式
    this.openCreatePopup(e);
    }
  },
 /**
   * 超会管理打开所有协会列表   */
  navigateToAllClubs(e) {
    this._openGlobalPopup(e, {
      type: 'clubs',
      id: '',
      data: { requestUrl: '/club/list/all' }
    });
  },

  /**
   * 导航到活动数据展示页面   */
  navigateToShowAllClubsEvents(e) {
    this._openGlobalPopup(e, {
      type: 'all-club-events',
      id: '',
      data: {}
    });
  },

  /**
   * 导航到用户数据展示页面   */
  navigateToShowAllClubsUsers(e) {
    this._openGlobalPopup(e, {
      type: 'all-club-users',
      id: '',
      data: {}
    });
  },

  /**
   * 导航到协会活动数据展示页面   */
  navigateToShowClubEvents(e) {
    const clubId = e.currentTarget.dataset.club_id;
    this._openGlobalPopup(e, {
      type: 'club-events',
      id: '',
      data: { clubId: parseInt(clubId) }
    });
  },

  async handleLogout() {
    try {
      const res = await wx.showModal({
        title: '确认退',
        content: '确定要退出登录吗',
        confirmColor: '#FF0000'
      });

      if (res.confirm) {
        // 清除本地存储的用户信数
      wx.clearStorage();
        
        // 跳转到登录页
        wx.reLaunch({
          url: '/pages/login/index'
        });
      }
    } catch (error) {      wx.showToast({
        title: '退出失', icon: 'none'
      });
    }
  },

  // ========== 统一的弹窗管理函?==========
  
  /**
   * 打开全局弹窗（兼容旧的调用方式）
   */
  openGlobalPopup(e) {
    // 支持直接传递配置对象或事件对象
    if (e.type && e.data !== undefined) {
      // 直接传递的配置对象（无事件对象数
      this._openGlobalPopup(null, e);
  } else {
      // 事件对象 - ?dataset 中获取配数
      const dataset = e.currentTarget.dataset;
      const config = {
        type: dataset.popupType,
        id: dataset.popupId || '',
        bgColor: dataset.bgColor || '#f3e3f3ff',
        sheetBgColor: dataset.sheetBgColor || '#f3e3f3ff',
        data: {}
      };
      
      // 根据type构造data对象
    if (config.type === 'club-timeline' || config.type === 'club-financial') {
        config.data.clubId = config.id;
      } else if (config.type === 'club-events') {
        config.data.clubId = config.id;
      }
      
      this._openGlobalPopup(e, config);
    }
  },

  /**
   * 关闭全局弹窗
   */
  closeGlobalPopup() {
    const popup = this.selectComponent('#globalFullscreenPopup');
    if (popup && typeof popup.collapse === 'function') {
      popup.collapse();
    }
  },

  /**
   * 全局弹窗收起回调
   */
  onGlobalPopupCollapse() {
    // 如果是数据展示panel，先隐藏图表
    const { type } = this.data.globalPopup;
    if (type === 'all-club-events' || type === 'all-club-users' || type === 'club-events' || type === 'club-financial') {
      let panelId = '';
      if (type === 'all-club-events') {
        panelId = '#allClubEventsPanel';
      } else if (type === 'all-club-users') {
        panelId = '#allClubUsersPanel';
      } else if (type === 'club-events') {
        panelId = '#clubEventsPanel';
      } else if (type === 'club-financial') {
        panelId = '#clubFinancialPanel';
      }
      
      if (panelId) {
        const panel = this.selectComponent(panelId);
        if (panel && panel.hideCharts) {
          panel.hideCharts();
        }
      }
    }
    
    setTimeout(() => {
      this.setData({
        'globalPopup.visible': false,
        'globalPopup.loading': true,
        'globalPopup.renderPanel': false,
        'globalPopup.type': '',
        'globalPopup.id': '',
        'globalPopup.clubId': ''
      });
    }, 800);
  },

  /**
   * 全局弹窗内容准备完成
   */
  onGlobalPopupContentReady() {    // 弹窗动画完成，现在可以渲?panel 数
      this.setData({
      'globalPopup.renderPanel': true
    }, () => {
      // 等待 panel 渲染后，调用 loadData
      setTimeout(() => {
        const { type } = this.data.globalPopup;
        let panelId = '';
        
        if (type === 'club-create') {
          panelId = '#clubCreatePanel';
        } else if (type === 'event-create') {
          panelId = '#eventCreatePanel';
        } else if (type === 'event-manage') {
          panelId = '#profileEventManagePanel';
        } else if (type === 'club-manage') {
          panelId = '#profileClubManagePanel';
        } else if (type === 'club-members') {
          panelId = '#clubMembersPanel';
        } else if (type === 'events') {
          panelId = '#eventsPanel';
        } else if (type === 'clubs') {
          panelId = '#clubsPanel';
        } else if (type === 'club-applications') {
          panelId = '#clubApplicationsPanel';
        } else if (type === 'my-applications') {
          panelId = '#myApplicationsPanel';
        } else if (type === 'all-club-events') {
          panelId = '#allClubEventsPanel';
        } else if (type === 'all-club-users') {
          panelId = '#allClubUsersPanel';
        } else if (type === 'club-events') {
          panelId = '#clubEventsPanel';
        } else if (type === 'club-timeline') {
          panelId = '#clubTimelinePanel';
        } else if (type === 'club-financial') {
          panelId = '#clubFinancialPanel';
        } else if (type === 'paypersonal') {
          panelId = '#paypersonalPanel';
        } else if (type === 'user-info') {
          panelId = '#userInfoPanel';
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

  /**
   * 用户信息面板更新回调
   */
  onUserInfoPanelUpdate(e) {
    const { user } = e.detail || {};
    if (!user) return;
    
    // 如果是当前用户，更新页面显示的用户信数
      const currentUserId = this.data.userInfo?.id;
    if (String(user.id) === String(currentUserId)) {
      this.setData({
        userInfo: { ...this.data.userInfo, ...user }
      });
    }
  },

  /**
   * 全局弹窗内容加载完成
   */
  onGlobalPopupLoaded() {    this.setData({
      'globalPopup.loading': false
    });
  },

  /**
   * 页面分享配置（使?app.globalData.shareInfo 生成分享链接口   */
  async onShareAppMessage() {    
    const shareInfo = app.globalData.shareInfo;
    
    // 如果有分享信数
      if (shareInfo && shareInfo.type && shareInfo.id) {      
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
    return {
      title: '来看看这个小程序',
      path: '/pages/home/index'
    };
  }

});