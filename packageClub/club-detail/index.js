const app = getApp();

Page({
  data: {
    clubId: null,
    clubDetail: {},
    clubMembers: [],
    adminCount: 0,
    isClubMember: false,
    isClubLeader: false,
    hasApplied: false
  },

  onLoad: function (options) {
    const token = wx.getStorageSync('token');
    const userId = wx.getStorageSync('userId');
    this.setData({
      clubId: options.clubId,
      userID: userId,
      token: token
    });
    
    this.loadClubDetail();
    this.checkUserApplicationStatus();
  },

  // 返回上一页
  navigateBack() {
    wx.navigateBack();
  },

  // 分享协会
  shareClub() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },

  // 查看活动详情 - 新增
  viewEventDetail(e) {
    const eventId = e.currentTarget.dataset.eventId;
    if (eventId) {
      wx.navigateTo({
        url: `/packageEvent/event-detail/index?eventId=${eventId}`
      });
    }
  },

  // 申请加入协会
  async applyToJoin() {
    wx.showLoading({ title: '处理中...' });
    try {
      const result = await this.request({
        url: `/club/${this.data.clubId}/applicated`,
        method: 'GET'
      });
      if (result.Flag === '4000') {
        wx.showToast({ title: '发起申请成功', icon: 'success' });
        const message_data = {
          booker_id: result.data.leader_id,
          url: `/packageClub/club-applications/index?clubId=${result.data.club_id}`,
          operation: 'user_applicated',
          content: '用户'+ result.data.user_name + '向您管理的'+ result.data.club_name + '协会发起了入会申请，请尽快审核'
        }                   

        await app.message(message_data);
        this.setData({ hasApplied: true });
      } else if (result.Flag === '4001') {
        wx.showToast({ title: '您已是协会会员', icon: 'none' });
        this.setData({ isClubMember: true });
        this.loadClubDetail();
      } else if (result.Flag === '4002') {
        wx.showToast({ title: '您已有待审核申请', icon: 'none' });
        this.setData({ hasApplied: true });
      } else {
        throw new Error(result.message || '申请失败');
      }
    } catch (error) {
      wx.showToast({ title: error.message || '申请失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
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

  // 加载协会详情 - 更新以使用新的API数据结构
  async loadClubDetail() {
    wx.showLoading({ title: '加载中...' });
    try {
      const res = await this.request({
        url: `/club/${this.data.clubId}`,
        method: 'GET'
      });
      
      if (res.Flag === '4000') {
        // 处理活动时间格式
        const clubData = res.data;
        if (clubData.recent_events) {
          clubData.recent_events = clubData.recent_events.map(event => ({
            ...event,
            start_time: this.formatDateTime(event.start_time),
            process_images: event.process_images ? event.process_images.split(';') : []
          }));
        }

        // 计算管理员数量（从recent_members中无法获取，使用额外接口）
        this.loadClubMembers();
        clubData.logo = clubData.images.split(';')[0]
        this.setData({
          clubDetail: clubData,
          isClubMember: clubData.cur_user_is_member,
          isClubLeader: clubData.cur_user_is_leader
        });
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
      }
    } catch (error) {
      wx.showToast({ title: '网络错误', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  // 加载协会成员 - 主要用于计算管理员数量
  async loadClubMembers() {
    try {
      const res = await this.request({
        url: `/club/${this.data.clubId}/members`,
        method: 'GET'
      });
      
      if (res.Flag === '4000') {
        const members = res.data || [];
        
        // 计算管理员数量
        const adminCount = members.filter(item => item.role === 'admin').length;
        
        this.setData({
          clubMembers: members,
          adminCount: adminCount
        });
      }
    } catch (error) {
      console.error('加载协会成员失败', error);
    }
  },

  // 格式化日期时间
  formatDateTime(dateTimeString) {
    if (!dateTimeString) return '时间待定';
    
    try {
      const date = new Date(dateTimeString);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      return `${month}月${day}日 ${hours}:${minutes}`;
    } catch (error) {
      return '时间待定';
    }
  },

  // 检查用户申请状态
  async checkUserApplicationStatus() {
    try {
      const res = await this.request({
        url: `/club/application/user_applicated/list`,
        method: 'GET'
      });
      
      if (res.Flag === '4000') {
        const applications = res.data || [];
        // 检查是否有针对当前协会的待处理申请
        const pendingApplication = applications.find(app => 
          app.club_name === this.data.clubDetail.name && 
          app.processedDate === null
        );
        
        this.setData({
          hasApplied: !!pendingApplication
        });
      }
    } catch (error) {
      console.error('检查申请状态失败', error);
    }
  },

  // 查看所有成员
  viewAllMembers() {
    wx.navigateTo({
      url: `/packageClub/club-members/index?clubId=${this.data.clubId}&clubName=${this.data.clubDetail.name}`
    });
  },

  // 页面分享配置
  onShareAppMessage() {
    const { clubDetail } = this.data;
    return {
      title: clubDetail.name || '查看协会详情',
      path: `/packageClub/club-detail/index?clubId=${this.data.clubId}`,
      imageUrl: clubDetail.logo || '/assets/icons/club.png'
    };
  }
}); 