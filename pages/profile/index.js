// pages/profile/index.js
const app = getApp()

Page({

  /**
   * 页面的初始数据
   */
  data: {
    userInfo: {},
    loading: true,
    isClubAdmin: false,  // 是否为社团管理员
    isSuperUser: false,  // 是否为超级用户
    managedClubs: [],    // 用户管理的社团列表
    statistics: {
      joinedClubs: 0,     // 已加入社团数
      joinedEvents: 0,    // 参加的活动数
      unreadNotices: 0,   // 未读通知数
      pendingApplications: 0,  // 待处理的我的申请
      pendingClubApplications: 0,  // 待处理的入团申请（管理员）
      unpaidPayments: 0   // 未缴费的收款数量
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad() {
    
  },


  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.fetchUserData();
      // 设置tabbar索引为0（首页）
      this.getTabBar().setData({
        active: 2
      });
    }
    this.checkLoginStatus();
  },

  onCustomTabItemTap(){
  },
  /**
   * 检查登录状态
   */
  checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo');  
    if (userInfo) {
      // 模拟已登录用户
      userInfo.roles_join = userInfo.roles.join('、')
      // 检查是否为超级用户

      this.setData({
        userInfo: userInfo,
        isSuperUser: userInfo.roles_join.includes('超级用户')
      });
    }
    this.fetchUserData();
  },

  /**
   * 获取用户数据
   */
  async fetchUserData() {
    try {
      wx.showLoading({
        title: '加载中...',
      });
      
      // 获取用户ID
      const userId = wx.getStorageSync('userId');
      if (!userId) {
        throw new Error('未找到用户ID');
      }
      

      await Promise.allSettled([
        this.fetchleadclubInfo(),
        this.fetchUserJoinedClubs(),
        this.fetchUserJoinedEvents(),
        this.fetchPendingApplications(),
        this.fetchUnpaidPayments()   // 新增：获取未缴费的收款数量
      ]);

      
      this.setData({
        loading: false
      });
      
      wx.hideLoading();
    } catch (error) {
      console.log('获取用户数据失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: error,
        icon: 'none'
      });
    }
  },


  /**
   * 获取用户管理的社团，同时获取这些社团发起的活动
   */
  async fetchleadclubInfo() {
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.request_url + `/club/user_lead/list`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json'
        },
        success: async (res) => {
          if (res.data.Flag == 4000) {          
            if (res.data.data.length > 0) {
              const adminClubs = res.data.data
              // 使用Promise.all等待所有异步操作完成
              const clubsWithDetails = await Promise.all(adminClubs.map(async (club) => {
                // 为每个社团获取未处理申请数量和活动事件
                const pendingApplications = await this.fetchClubPendingApplicationsCount(club.club_id);
                const activities = await this.fetchClubActiveEvents(club.club_id);
                const processedActivities = activities.map((activity) => {
                  // 格式化开始时间
                  activity.start_time = app.formatDateTime( new Date(activity.start_time));
                  return activity
                })
                // 返回带有额外数据的社团对象
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
   * 获取单个社团的未完结活动
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
              // 判断活动是否已开始
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
            resolve(res.data.data);
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
   * 获取用户已加入的社团数量
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
            
            this.setData({
              'statistics.joinedClubs': clubCount
            });
            
            resolve(clubCount);
          } else {
            reject(new Error(res.data.message || '获取社团数量失败'));
          }
        },
        fail: (err) => {
          reject(err);
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
   * 获取用户发起的待处理的入团申请数量
   */
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
   * 获取单个社团的待处理申请数量
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
          } else {
            console.error(`获取社团ID ${clubId} 待处理申请数量失败:`, res.data.message);
            resolve(0);
          }
        },
        fail: (err) => {
          console.error(`获取社团ID ${clubId} 待处理申请数量失败:`, err);
          resolve(0);
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
          } else {
            console.error('获取未缴费收款数量失败:', res.data.message);
            resolve(0);
          }
        },
        fail: (err) => {
          console.error('获取未缴费收款数量失败:', err);
          resolve(0);
        }
      });
    });
  },

  // 导航方法
  navigateToEdit() {
    wx.navigateTo({
      url: '/packageProfile/edit/index'
    });
  },

  navigateToUserInfo() {
    const userId = this.data.userInfo.id;
    wx.navigateTo({
      url: `/packageProfile/user-info/index?id=${userId}`
    });
  },

  navigateToJoinedClubs() {
    wx.navigateTo({
      url: `/packageClub/index?url=/club/user_joined/list`
    });
  },

  navigateToJoinedEvents() {
    wx.navigateTo({
      url: `/packageEvent/index?url=/event/user_joined/list/all`
    });
  },

  navigateToApplications() {
    wx.navigateTo({
      url: `/packageProfile/my-applications/index`
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
    
    wx.navigateTo({
      url: `/packageProfile/club-members/index?clubId=${club_id}`
    });
  },

  navigateToCreateEvent(e) {
    const club_id = e.currentTarget.dataset.club_id;
    
    wx.navigateTo({
      url: `/packageEvent/event-create/index?clubId=${club_id}`
    });
  },

  navigateToClubApplications(e) {
    const club_id = e.currentTarget.dataset.club_id;
    wx.navigateTo({
      url: `/packageClub/club-applications/index?clubId=${club_id}`
    });
  },

  navigateToClubEvent(e) {
    const clubId = e.currentTarget.dataset.club_id;
    wx.navigateTo({
      url: `/packageEvent/index?url=/event/club_public/${clubId}/list/all`,
    });
  },

  // 添加导航到协会收支时间轴页面的方法
  navigateToClubTimeline(e) {
    const clubId = e.currentTarget.dataset.club_id;
    wx.navigateTo({
      url: `/packageMoney/club-timeline/index?clubId=${clubId}`,
    });
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
   * 导航到活动跟踪页面
   */
  navigateToEventTracking(e) {
    const eventId = e.currentTarget.dataset.event_id;
    wx.navigateTo({
      url: `/packageEvent/event-manage/index?eventId=${eventId}`
    });
  },

  /**
   * 导航到收款页面
   */
  navigateToPaypersonal() {
    wx.navigateTo({
      url: '/packageMoney/paypersonal/index'
    });
  },

  /**
   * 导航到活动数据展示页面
   */
  navigateToEventDataDisplay() {
    wx.navigateTo({
      url: '/packageProfile/show_data/index?type=event'
    });
  },

  /**
   * 导航到用户数据展示页面
   */
  navigateToUserDataDisplay() {
    wx.navigateTo({
      url: '/packageProfile/show_data/index?type=user'
    });
  },

  /**
   * 导航到创建协会页面
   */
  navigateToCreateClub() {
    wx.navigateTo({
      url: '/packageClub/club-create/index'
    });
  },

  async handleLogout() {
    try {
      const res = await wx.showModal({
        title: '确认退出',
        content: '确定要退出登录吗？',
        confirmColor: '#FF0000'
      });

      if (res.confirm) {
        // 清除本地存储的用户信息
        wx.clearStorage();
        
        // 跳转到登录页
        wx.reLaunch({
          url: '/pages/login/index'
        });
      }
    } catch (error) {
      console.error('退出登录失败:', error);
      wx.showToast({
        title: '退出失败',
        icon: 'none'
      });
    }
  },



})