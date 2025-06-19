// 引入API请求工具
const app = getApp();

Page({
  data: {
    // 用户信息
    userInfo: {},
    // 活动列表
    activities: [
      { event_id: 'placeholder-1', title: '加载中...', cover_url: '', join_count: 0},
      { event_id: 'placeholder-2', title: '加载中...', cover_url: '', join_count: 0},
      { event_id: 'placeholder-3', title: '加载中...', cover_url: '', join_count: 0},
      { event_id: 'placeholder-4', title: '加载中...', cover_url: '', join_count: 0}
    ],
    // 社团列表
    clubList: [
      { club_id: 'placeholder-1', club_name: '加载中...', logoUrl: '',  member_num: 0},
      { club_id: 'placeholder-2', club_name: '加载中...', logoUrl: '',  member_num: 0},
      { club_id: 'placeholder-3', club_name: '加载中...', logoUrl: '',  member_num: 0},
      { club_id: 'placeholder-4', club_name: '加载中...', logoUrl: '',  member_num: 0}
    ],
    // 热门活动列表
    hotActivities: [
      { event_id: 'placeholder-1', title: '加载中...', cover_url: '', join_count: 0},
      { event_id: 'placeholder-2', title: '加载中...', cover_url: '', join_count: 0},
      { event_id: 'placeholder-3', title: '加载中...', cover_url: '', join_count: 0}
    ],
    // 热门社团列表
    hotClubs: [
      { club_id: 'placeholder-1', club_name: '加载中...', logo: ''},
      { club_id: 'placeholder-2', club_name: '加载中...', logo: ''},
      { club_id: 'placeholder-3', club_name: '加载中...', logo: ''}
    ],

    // 未读通知数量
    unread_messages_count: 0,
    // 地图密钥
    mapKey: app.globalData.key, 
    // 地图URL
    mapUrl: app.globalData.staticMapUrl,
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    this.checkLoginStatus();
    this.mapCtx = wx.createMapContext('hotEventMap')
    this.mapCtx.setCenterOffset({
      offset: [0.25, 0.25] // 第一个参数控制水平偏移（左25%），第二个控制垂直偏移（上25%）
    })
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      // 设置tabbar索引为0（首页）
      this.getTabBar().setData({
        active: 0
      });
    }
    this.loadData();
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
   * 校验登录状态
   */
  checkLoginStatus: function() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      // 模拟已登录用户
      userInfo.roles_join = userInfo.roles.join('、')
      this.setData({
        userInfo: userInfo
      });
    }
    else{
      wx.navigateTo({
        url: '/pages/login'
      });
    }
  },

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
  async loadEventList() {
    // 设置加载状态
    return new Promise((resolve, reject) => {
      // 从后台获取活动列表
      wx.request({
        url: app.globalData.request_url + `/event/list/going?mode=page&page=1`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json'
        },
        success: async(res) => {       
          if (res.data.Flag == 4000) {
            const activities = res.data.data.records || [];
            // 处理活动数据，格式化时间
            const processedActivities = activities.map(activity => {
              // 格式化开始时间
              activity.start_time = app.formatDateTime( new Date(activity.start_time));

              activity.cover_url = activity.process_images.split(';')[0];

              return activity;
            })             
            this.setData({ 
              activities: processedActivities,
            });
          } else {
            console.error('获取活动列表失败:', res.data);
            this.setData({ 
              activities: []
            });
          }
          resolve();
        },
        fail: (err) => {
          console.error('活动列表请求失败:', err);
          this.setData({ 
            activities: []
          });
        }
      });
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
              
              // 处理封面图片
              if(activity.process_images) {
                activity.cover_url = activity.process_images.split(';')[0];
              }
              
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
   * 加载社团列表
   */
  async loadClubList() {
    // 设置加载状态
    return new Promise((resolve, reject) => {
      // 从后台获取社团列表
      wx.request({
        url: app.globalData.request_url + `/club/list`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json'
        },
        dataType: 'json',
        success: async(res) => {       
          if (res.data.Flag == 4000) {
            const clubs = res.data.data || [];
            const clubsWithDetails = clubs.map(club => {  
              // 返回带有额外数据的社团对象
              return {
                ...club,
                logoUrl: club.images.split(';')[0],
              };   
            })   
            this.setData({ 
              clubList: clubsWithDetails,
            });
          } else {
            console.error('获取社团列表失败:', res.data);
            this.setData({ 
              clubList: []
            });
          }
          resolve();
        },
        fail: (err) => {
          console.error('社团列表请求失败:', err);
          this.setData({ 
            clubList: []
          });
        }
      });
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
   * 加载社团成员
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
   * 跳转到通知中心页面
   */
  navigateToMessages: function() {
    // 检查登录状态
    const token = wx.getStorageSync('token');
    if (!token) {
      wx.navigateTo({
        url: '/pages/login/index'
      });
      return;
    }
    
    wx.navigateTo({
      url: '/packageHome/messages/index'
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

    if(e.currentTarget.dataset.user_managed)
    {
      wx.navigateTo({
        url: `/packageEvent/event-manage/index?eventId=${e.currentTarget.dataset.event_id}`
      });
    }
    else
    {
      wx.navigateTo({
        url: `/packageEvent/event-detail/index?eventId=${e.currentTarget.dataset.event_id}`
      });
    }
  },

  /**
   * 跳转到社团详情页面
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
   * 加载热门社团列表
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
            const clubs = res.data.data || [];
            
            // 处理社团数据
            const processedClubs = clubs.map(club => {
              // 处理logo
              club.logo = club.images.split(';')[0]
              
              // 确保recent_members存在
              if (!club.recent_members) {
                club.recent_members = [];
              }
              
              // 确保recent_events存在并格式化时间
              if (!club.recent_events) {
                club.recent_events = [];
              } else {
                club.recent_events = club.recent_events.map(event => {
                  // 格式化活动时间
                  if (event.start_time) {
                    event.start_time = app.formatDateTime(new Date(event.start_time));
                  }
                  return event;
                });
              }
              
              // 确保leader_info存在并处理头像
              if (!club.leader_info) {
                club.leader_info = {
                  name: '暂无',
                  avatar: '/assets/images/default-avatar.png'
                };
              } else {
                if (!club.leader_info.avatar) {
                  club.leader_info.avatar = '/assets/images/default-avatar.png';
                }
              }
              
              return club;
            });
            
            this.setData({ 
              hotClubs: processedClubs,
            });
          } else {
            console.error('获取热门社团列表失败:', res.data);
            this.setData({ 
              hotClubs: []
            });
          }
          resolve();
        },
        fail: (err) => {
          console.error('热门社团列表请求失败:', err);
          this.setData({ 
            hotClubs: []
          });
          resolve();
        }
      });
    });
  },
}) 