const app = getApp()

Page({
  data: {
    applications: [],
    loading: true,
    errorMessage: '',
  },

  onLoad(options) {
    if (options.id) {
      this.setData({
        userId: options.id
      });
      this.fetchApplications(options.id);
    } else {
      const userId = wx.getStorageSync('userId');
      if (userId) {
        this.setData({
          userId: userId
        });
        this.fetchApplications(userId);
      } else {
        wx.showToast({
          title: '获取用户ID失败',
          icon: 'none'
        });
      }
    }
  },

  onPullDownRefresh() {
    this.fetchApplications()
  },

  onShow() {
    if (wx.getStorageSync('token')) {
      this.fetchApplications(this.data.userId);
    }
  },

  async fetchApplications(userId) {
    this.setData({ loading: true });

    
    wx.request({
      url: app.globalData.request_url + `/club/user_applicanted/${userId}/list`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${wx.getStorageSync('token')}`,
        'Content-Type': 'application/json'
      },
      success: (res) => {
        if (res.data && res.data.Flag == 4000) {
          const applications = res.data.data || []
          // 处理申请数据
          const processedApplications = applications.map(app => {
            return {
              id: app.application_id,
              clubId: app.club_id,
              clubName: app.club_name,
              status: app.status, // pending, approved, rejected
              applyTime: app.apply_time,
              processTime: app.process_time || '',
              rejectReason: app.reject_reason || ''
            }
          })

          this.setData({
            loading: false,
            applications: processedApplications
          })
        } else {
          this.setData({
            loading: false,
            errorMessage: res.data.message || '获取申请列表失败'
          })
          wx.showToast({
            title: res.data.message || '获取申请列表失败',
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        console.error('请求失败:', err)
        this.setData({
          loading: false,
          errorMessage: '网络请求失败'
        })
        wx.showToast({
          title: '网络请求失败',
          icon: 'none'
        })
      },
    })
  },

  // 获取状态文本
  getStatusText: function(status) {
    const statusMap = {
      'pending': '审核中',
      'approved': '已通过',
      'rejected': '已拒绝'
    }
    return statusMap[status] || '未知状态'
  },

  // 获取状态样式类
  getStatusClass: function(status) {
    const classMap = {
      'pending': 'status-pending',
      'approved': 'status-approved',
      'rejected': 'status-rejected'
    }
    return classMap[status] || ''
  },

  // 跳转到社团详情页
  goToClubDetail: function(e) {
    const clubId = e.currentTarget.dataset.clubid
    wx.navigateTo({
      url: `/pages/club/detail/index?id=${clubId}`
    })
  },

  // 返回主页
  goToHome: function() {
    wx.switchTab({
      url: `/pages/home/index`
    })
  }
}) 