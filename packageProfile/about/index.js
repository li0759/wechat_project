// pages/profile/about/index.js
Page({

  /**
   * 页面的初始数据
   */
  data: {
    appInfo: {
      name: 'WeTest',
      version: '1.0.0',
      description: 'WeTest是一款专为高校社团设计的管理平台，旨在帮助社团高效组织活动、管理成员和促进交流。通过我们的平台，社团管理员可以轻松发布通知、组织活动，成员可以及时获取社团动态、参与活动报名，让社团管理更加便捷高效。'
    },
    contactInfo: {
      email: 'support@wetest.com',
      phone: '400-123-4567',
      website: 'www.wetest.com'
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    // 可以在这里获取应用信息
    const accountInfo = wx.getAccountInfoSync()
    if (accountInfo && accountInfo.miniProgram) {
      this.setData({
        'appInfo.version': accountInfo.miniProgram.version || '1.0.0'
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

  copyText(e) {
    const text = e.currentTarget.dataset.text
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success'
        })
      }
    })
  }
})