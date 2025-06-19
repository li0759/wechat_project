const app = getApp();

Page({
  data: {
    clubList: [],
    userInfo: null,
    url: '/club/list', // 默认显示所有协会列表
  },

  onLoad: function (options) {
    this.checkLoginStatus()
    const token = wx.getStorageSync('token');
    const userId = wx.getStorageSync('userId');
    this.setData({
      userID: userId,
      token: token
    });
    
    this.setData({
      url: options.url
    });

  },

  checkLoginStatus: function() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({
        userInfo: userInfo
      });
    } else {
      wx.navigateTo({
        url: '/pages/login'
      });
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().init();
    }
    this.loadClubList();
  },

  // 导航到协会详情页
  navigateToClubDetail(clubId) {
    wx.navigateTo({
      url: `/packageClub/club-detail/index?clubId=${clubId}`
    });
  },

  // 点击协会卡片
  onClubTap(e) {
    const clubId = e.currentTarget.dataset.clubId;
    this.navigateToClubDetail(clubId);
  },

  // 统一请求方法
  request(options) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.request_url + options.url,
        method: options.method || 'GET',
        header: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.data.token
        },
        success(res) {
          resolve(res.data);
        },
        fail(err) {
          reject(err);
        }
      });
    });
  },

  // 加载协会列表数据
  async loadClubList() {
    wx.showLoading({
      title: '加载中...',
    });
    try {
      const res = await this.request({
        url: this.data.url,
        method: 'GET'
      });        
      if (res.Flag === '4000') {
        const clubs = res.data || [];
        const processedClubs = clubs.map(club => {
          // 确保布尔值正确处理
          club.cur_user_is_member = !!club.cur_user_is_member;
          club.cur_user_leaded = !!club.cur_user_leaded;
          club.logo = club.images.split(';')[0];
          return club;
        });
        
        this.setData({
          clubList: processedClubs
        });
      } else {
        wx.showToast({
          title: res.message || '加载失败',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.showToast({
        title: '网络错误',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadClubList().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 管理协会
  handleManageClub: function(e) {
    const clubId = e.currentTarget.dataset.clubId;
    wx.navigateTo({
      url: `/packageClub/club-manage/index?clubId=${clubId}`
    });
  }
}); 