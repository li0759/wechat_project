// pages/profile/club-members/index.js
const app = getApp()

Page({

  /**
   * 页面的初始数据
   */
  data: {
    clubId: null,
    clubInfo: {},
    members: [],
    filteredMembers: [],
    searchKeyword: '',
    loading: true,
    showRolePicker: false,
    selectedUserId: null,
    selectedRole: 'member', // 默认为普通成员
    currentUserId: '', // 当前登录用户ID
    canManageMembers: false // 是否有管理成员的权限
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    if (options.clubId) {
      const userId = wx.getStorageSync('userId')
      this.setData({ 
        clubId: options.clubId,
        currentUserId: userId
      })
      this.fetchClubMembers(options.clubId)
    } else {
      wx.showToast({
        title: '缺少社团ID参数',
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
      this.fetchClubMembers(this.data.clubId);
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
    this.fetchClubMembers(this.data.clubId).then(() => {
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


  // 获取社团成员列表
  async fetchClubMembers(clubId) {
    this.setData({ loading: true })
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.request_url + `/club/${clubId}/members`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json'
        },
        success: (res) => {
          
          if (res.data.Flag == 4000) {
            const members = res.data.data || []
            
            // 处理成员数据
            const processedMembers = members.map(member => {
              return {
                id: member.user_id,
                name: member.name,
                avatarUrl: member.avatar_url,
                role: member.role, // admin, manager, member
                join_date: this.formatDate(member.join_date)
              }
            })
            
            this.setData({
              members: processedMembers,
              filteredMembers: processedMembers,
              loading: false
            })
            resolve()
          } else {
            this.setData({ loading: false })
            wx.showToast({
              title: res.data.message || '获取成员列表失败',
              icon: 'none'
            })
            resolve()
          }
        },
        fail: (err) => {
          console.error('请求失败:', err)
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

  // 格式化日期
  formatDate(dateString) {
    if (!dateString) return '未知'
    
    const date = new Date(dateString)
    const year = date.getFullYear()
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    
    return `${year}-${month}-${day}`
  },

  // 搜索成员
  onSearchInput(e) {
    const keyword = e.detail.value.trim()
    this.setData({ searchKeyword: keyword })
    
    if (keyword) {
      const filtered = this.data.members.filter(member => 
        member.name.toLowerCase().includes(keyword.toLowerCase())
      )
      this.setData({ filteredMembers: filtered })
    } else {
      this.setData({ filteredMembers: this.data.members })
    }
  },

  // 清除搜索
  clearSearch() {
    this.setData({
      searchKeyword: '',
      filteredMembers: this.data.members
    })
  },

  // 执行搜索
  onSearch() {
    // 已在输入时实时过滤
  },


  // 更改角色

  // 确认移除成员
  confirmRemoveMember(e) {
    const userId = e.currentTarget.dataset.userid
    const userName = e.currentTarget.dataset.username
    
    wx.showModal({
      title: '确认移除',
      content: `确定要将${userName}从社团中移除吗？`,
      success: (res) => {
        if (res.confirm) {
          this.removeMember(userId)
        }
      }
    })
  },

  // 移除成员
  removeMember(userId) {
    const clubId = this.data.clubId
    
    wx.request({
      url: app.globalData.request_url + `/club/${clubId}/member/${userId}/remove`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${wx.getStorageSync('token')}`,
        'Content-Type': 'application/json'
      },
      success: (res) => {
        if (res.data.Flag == 4000) {
          wx.showToast({
            title: '成员已移除',
            icon: 'success'
          })
          // 刷新成员列表
          this.fetchClubMembers(this.data.clubId)
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
})