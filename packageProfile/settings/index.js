// pages/profile/settings/index.js
const app = getApp()

Page({

  /**
   * 页面的初始数据
   */
  data: {
    notificationSettings: {
      enabled: true,
      sound: true,
      vibrate: true
    },
    cacheSize: '0KB',
    showPasswordModal: false,
    passwordForm: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.loadSettings()
    this.calculateCacheSize()
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

  // 加载设置
  loadSettings() {
    // 从本地存储中获取通知设置
    const notificationSettings = wx.getStorageSync('notificationSettings')
    if (notificationSettings) {
      this.setData({
        notificationSettings
      })
    } else {
      // 默认设置
      const defaultSettings = {
        enabled: true,
        sound: true,
        vibrate: true
      }
      wx.setStorageSync('notificationSettings', defaultSettings)
    }
  },

  // 计算缓存大小
  calculateCacheSize() {
    wx.getStorageInfo({
      success: (res) => {
        let size = res.currentSize // KB
        let sizeText = size + 'KB'
        
        if (size > 1024) {
          size = (size / 1024).toFixed(2)
          sizeText = size + 'MB'
        }
        
        this.setData({
          cacheSize: sizeText
        })
      }
    })
  },

  // 开关设置变化
  onSwitchChange(e) {
    const type = e.currentTarget.dataset.type
    const value = e.detail.value
    
    let { notificationSettings } = this.data
    notificationSettings[type] = value
    
    if (type === 'enabled' && !value) {
      // 如果关闭了通知，则关闭声音和震动
      notificationSettings.sound = false
      notificationSettings.vibrate = false
    }
    
    this.setData({
      notificationSettings
    })
    
    // 保存到本地存储
    wx.setStorageSync('notificationSettings', notificationSettings)
    
    // 可以在这里添加额外的API调用，更新服务器端的设置
  },

  // 清除缓存
  clearCache() {
    wx.showModal({
      title: '确认清除',
      content: '确定要清除缓存数据吗？清除后可能需要重新登录。',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync()
          
          // 保留必要的登录信息
          const token = wx.getStorageSync('token')
          const userId = wx.getStorageSync('userId')
          const userInfo = wx.getStorageSync('userInfo')
          
          if (token) wx.setStorageSync('token', token)
          if (userId) wx.setStorageSync('userId', userId)
          if (userInfo) wx.setStorageSync('userInfo', userInfo)
          
          // 重新加载设置
          this.loadSettings()
          this.calculateCacheSize()
          
          wx.showToast({
            title: '缓存已清除',
            icon: 'success'
          })
        }
      }
    })
  },

  // 显示修改密码弹窗
  showChangePassword() {
    this.setData({
      showPasswordModal: true,
      passwordForm: {
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }
    })
  },

  // 隐藏修改密码弹窗
  hideChangePassword() {
    this.setData({
      showPasswordModal: false
    })
  },

  // 密码表单输入
  inputPassword(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    
    this.setData({
      [`passwordForm.${field}`]: value
    })
  },

  // 修改密码
  changePassword() {
    const { currentPassword, newPassword, confirmPassword } = this.data.passwordForm
    
    // 验证表单
    if (!currentPassword || !newPassword || !confirmPassword) {
      return wx.showToast({
        title: '请填写所有密码字段',
        icon: 'none'
      })
    }
    
    if (newPassword !== confirmPassword) {
      return wx.showToast({
        title: '两次输入的新密码不一致',
        icon: 'none'
      })
    }
    
    if (newPassword.length < 6) {
      return wx.showToast({
        title: '新密码长度不能少于6位',
        icon: 'none'
      })
    }
    
    // 调用修改密码API
    wx.request({
      url: app.globalData.request_url + `/user/change_password`,
      method: 'POST',
      data: {
        old_password: currentPassword,
        new_password: newPassword
      },
      header: {
        'Authorization': `Bearer ${wx.getStorageSync('token')}`,
        'Content-Type': 'application/json'
      },
      success: (res) => {
        if (res.data.Flag == 4000) {
          wx.showToast({
            title: '密码修改成功',
            icon: 'success'
          })
          this.hideChangePassword()
        } else {
          wx.showToast({
            title: res.data.message || '密码修改失败',
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
  },

  // 显示退出登录确认
  showLogoutConfirm() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          this.logout()
        }
      }
    })
  },

  // 退出登录
  logout() {
    // 清除本地存储
    wx.clearStorageSync()
    
    // 跳转到登录页
    wx.reLaunch({
      url: '/pages/login/index'
    })
  }
})