// pages/profile/club-applications/index.js
const app = getApp()

Page({

  /**
   * 页面的初始数据
   */
  data: {
    clubId: null,
    clubInfo: {},
    applications: [],
    pendingApplications: [],
    processedApplications: [],
    pendingCount: 0,
    activeTab: 'pending',
    loading: true,
    showRejectDialog: false,
    rejectReason: '',
    currentApplicationId: null,
    currentApplicantName: ''
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    if (options.clubId) {
      
      this.setData({ 
        clubId: options.clubId 
      })
      this.fetchClubInfo(options.clubId)
      this.fetchApplications(options.clubId)
    } else {
      wx.showToast({
        title: '缺少协会ID参数',
        icon: 'none'
      })
    }
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 检查登录状态
    if (wx.getStorageSync('token')) {
      this.fetchClubInfo(this.data.clubId);
      this.fetchApplications(this.data.clubId);
    }
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    this.fetchApplications(this.data.clubId).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  },

  // 获取协会信息
  fetchClubInfo(clubId) {
    wx.request({
      url: app.globalData.request_url + `/club/${clubId}`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${wx.getStorageSync('token')}`,
        'Content-Type': 'application/json'
      },
      success: (res) => {
        if (res.data.Flag == 4000) {
          this.setData({
            clubInfo: res.data.data
          })
        } else {
          wx.showToast({
            title: res.data.message || '获取协会信息失败',
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        wx.showToast({
          title: '网络请求失败',
          icon: 'none'
        })
      }
    })
  },

  // 获取申请列表
  async fetchApplications(clubId) {
    this.setData({ loading: true })
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.request_url + `/club/application/for_club/pending`,
        method: 'POST',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json'
        },
        data: {
          clubID: clubId
        },
        success: (res) => {
          if (res.data.Flag == 4000) {
            const applications = res.data.data || []
            // 分类处理申请
    const pending = applications.filter(app => app.status === 'pending')
            const processed = applications.filter(app => app.status !== 'pending')
            
            this.setData({
              applications,
              pendingApplications: pending,
              processedApplications: processed,
              pendingCount: pending.length,
              loading: false
            })
            resolve()
          } else {
            this.setData({ loading: false })
            wx.showToast({
              title: res.data.message || '获取申请列表失败',
              icon: 'none'
            })
            resolve()
          }
        },
        fail: (err) => {
          this.setData({ loading: false })
          wx.showToast({
            title: '网络请求失败',
            icon: 'none'
          })
          resolve()
        }
      })
    })
  },

  // 切换标签页
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({
      activeTab: tab
    })
  },

  // 查看用户详情
  viewUserDetail(e) {
    const userId = e.currentTarget.dataset.userid
    wx.navigateTo({
      url: `/pages/profile/user-info/index?id=${userId}`
    })
  },

  // 显示拒绝原因输入框
  showRejectDialog(e) {
    const applicationId = e.currentTarget.dataset.id
    const applicantName = e.currentTarget.dataset.name
    
    this.setData({
      showRejectDialog: true,
      currentApplicationId: applicationId,
      currentApplicantName: applicantName,
      rejectReason: ''
    })
  },

  // 隐藏拒绝原因输入框
  hideRejectDialog() {
    this.setData({
      showRejectDialog: false
    })
  },

  // 拒绝原因输入
  onRejectReasonInput(e) {
    this.setData({
      rejectReason: e.detail.value
    })
  },

  // 拒绝申请
  rejectApplication() {
    const applicationId = this.data.currentApplicationId
    
    wx.request({
      url: app.globalData.request_url + `/club/application/${applicationId}/reject`,
      method: 'POST',
      data: {
        reason: this.data.rejectReason
      },
      header: {
        'Authorization': `Bearer ${wx.getStorageSync('token')}`,
        'Content-Type': 'application/json'
      },
      success: (res) => {
        if (res.data.Flag == 4000) {
          wx.showToast({
            title: '已拒绝申请',
            icon: 'success'
          })
          // 刷新数据
    this.fetchApplications(this.data.clubId)
        } else {
          wx.showToast({
            title: res.data.message || '操作失败',
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        wx.showToast({
          title: '网络请求失败',
          icon: 'none'
        })
      },
      complete: () => {
        this.setData({
          showRejectDialog: false
        })
      }
    })
  },

  // 通过申请
  approveApplication(e) {
    const applicationId = e.currentTarget.dataset.id
    const applicantName = e.currentTarget.dataset.name
    
    wx.showModal({
      title: '确认通过',
      content: `确定通过 ${applicantName} 的入团申请吗？`,
      success: (res) => {
        if (res.confirm) {
          wx.request({
            url: app.globalData.request_url + `/club/application/${applicationId}/approve`,
            method: 'POST',
            header: {
              'Authorization': `Bearer ${wx.getStorageSync('token')}`,
              'Content-Type': 'application/json'
            },
            success: (res) => {
              if (res.data.Flag == 4000) {
                wx.showToast({
                  title: '已通过申请',
                  icon: 'success'
                })
                // 刷新数据
    this.fetchApplications(this.data.clubId)
              } else {
                wx.showToast({
                  title: res.data.message || '操作失败',
                  icon: 'none'
                })
              }
            },
            fail: (err) => {
              console.error('请求失败:', err)
              wx.showToast({
                title: '网络请求失败',
                icon: 'none'
              })
            }
          })
        }
      }
    })
  }
})