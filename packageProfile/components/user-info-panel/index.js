const app = getApp()
const { getDefaultAvatarUrl, resolveAvatarUrl } = require('../../../utils/default-avatar')

const genderUtils = {
  map: { 男: 1, 女: 2, 其他: 0 },
  reverseMap: { 1: '男', 2: '女', 0: '其他' },
  toString(num) {
    return this.reverseMap[num] || ''
  },
}

Component({
  properties: {
    userId: {
      type: String,
      value: '',
    },
  },

  data: {
    userInfo: null,
    loading: true,
    isCurrentUser: false,
    hasAvatar: false,
    hasPhone: false,
    default_avatar: getDefaultAvatarUrl(),
    authorizing: false,
  },

  lifetimes: {
    attached() {
      this._loaded = false
      this._hasExpanded = false
      this._refreshDefaultAvatar()
    },
  },

  observers: {
    userId(newVal) {
      if (newVal && !String(newVal).startsWith('placeholder')) {
        this._lastUserId = String(newVal)
        this._loaded = false
      }
    },
  },

  methods: {
    _refreshDefaultAvatar() {
      this.setData({ default_avatar: getDefaultAvatarUrl() })
    },

    _getStoredUserId() {
      const stored = wx.getStorageSync('userId') || wx.getStorageSync('userInfo')?.id
      return stored != null && stored !== '' ? String(stored) : ''
    },

    _signalPanelLoaded() {
      return new Promise((resolve) => {
        this.setData({ loading: false }, () => {
          this.triggerEvent('loaded')
          resolve()
        })
      })
    },

    loadData() {
      this._refreshDefaultAvatar()
      this._hasExpanded = true
      if (this._loaded) return Promise.resolve()
      this._loaded = true

      const userId = this.properties.userId
      if (!userId || String(userId).startsWith('placeholder')) {
        return this._signalPanelLoaded()
      }

      this._lastUserId = String(userId)
      this.setData({ loading: true })
      return this.fetchUserInfo(userId)
        .then(() => this._signalPanelLoaded(), () => this._signalPanelLoaded())
    },

    _applyUserInfo(raw) {
      const userInfo = { ...raw }
      userInfo.roles_join = (userInfo.roles || []).join(',')
      const genderStr =
        typeof userInfo.gender === 'number'
          ? genderUtils.toString(userInfo.gender)
          : userInfo.gender || ''

      const avatarRaw = (userInfo.avatar == null ? '' : String(userInfo.avatar)).trim()
      const phoneRaw = (userInfo.phone == null ? '' : String(userInfo.phone)).trim()
      const viewUser = {
        ...userInfo,
        gender: genderStr,
        avatar: resolveAvatarUrl(avatarRaw),
      }

      const currentId = this._getStoredUserId()
      const panelUserId = String(userInfo.id || this.properties.userId || '')

      return new Promise((resolve) => {
        this.setData(
          {
            userInfo: viewUser,
            default_avatar: getDefaultAvatarUrl(),
            isCurrentUser: !!currentId && currentId === panelUserId,
            hasAvatar: !!avatarRaw,
            hasPhone: !!phoneRaw,
          },
          () => resolve(viewUser)
        )
      })
    },

    fetchUserInfo(userId) {
      return new Promise((resolve, reject) => {
        wx.request({
          url: `${app.globalData.request_url}/user/${userId}`,
          method: 'GET',
          header: {
            Authorization: `Bearer ${wx.getStorageSync('token')}`,
            'Content-Type': 'application/json',
          },
          success: (res) => {
            if (res.data.Flag == 4000) {
              this._applyUserInfo(res.data.data).then(resolve).catch(reject)
            } else {
              wx.showToast({
                title: res.data.message || '获取用户信息失败',
                icon: 'none',
              })
              reject(new Error(res.data.message || 'fetch failed'))
            }
          },
          fail: () => {
            wx.showToast({ title: '网络错误，请重试', icon: 'none' })
            reject(new Error('network'))
          },
        })
      })
    },

    _refreshAfterAuth() {
      const userId = this._lastUserId || this.properties.userId
      if (!userId) return Promise.resolve()
      return this.fetchUserInfo(userId).then((viewUser) => {
        const storedId = this._getStoredUserId()
        if (storedId && String(storedId) === String(userId)) {
          wx.setStorageSync('userInfo', {
            ...(wx.getStorageSync('userInfo') || {}),
            ...viewUser,
            avatar: viewUser.avatar,
            phone: viewUser.phone,
          })
        }
        this.triggerEvent('update')
      })
    },

    handleGetAvatar() {
      if (!this.data.isCurrentUser || this.data.authorizing || this.data.hasAvatar) return

      this.setData({ authorizing: true })
      wx.showLoading({ title: '正在获取头像...' })

      wx.qy.getAvatar({
        success: (res) => {
          wx.hideLoading()
          const avatar = res.avatar
          if (avatar) {
            this._uploadAvatar(avatar)
          } else {
            this.setData({ authorizing: false })
            wx.showToast({ title: '未获取到头像', icon: 'none' })
          }
        },
        fail: (err) => {
          wx.hideLoading()
          this.setData({ authorizing: false })
          if (err.errCode === 42013) {
            wx.showModal({
              title: '获取失败',
              content: '登录凭证已过期，请重新登录',
              showCancel: false,
            })
          } else {
            wx.showToast({ title: '获取头像失败', icon: 'none' })
          }
        },
      })
    },

    _uploadAvatar(avatarUrl) {
      wx.request({
        url: `${app.globalData.request_url}/file/create_by_url`,
        method: 'POST',
        header: {
          Authorization: `Bearer ${wx.getStorageSync('token')}`,
        },
        data: { url: avatarUrl },
        success: (res) => {
          if (res.data.Flag == 4000) {
            this._updateUserAvatar(res.data.data.file_id)
          } else {
            this.setData({ authorizing: false })
            wx.showToast({ title: '上传头像失败', icon: 'none' })
          }
        },
        fail: () => {
          this.setData({ authorizing: false })
          wx.showToast({ title: '上传头像失败', icon: 'none' })
        },
      })
    },

    _updateUserAvatar(fileID) {
      wx.showLoading({ title: '正在更新头像...' })
      wx.request({
        url: `${app.globalData.request_url}/auth/update_avatar`,
        method: 'POST',
        header: {
          'content-type': 'application/json',
          Authorization: `Bearer ${wx.getStorageSync('token')}`,
        },
        data: { fileID },
        success: (res) => {
          wx.hideLoading()
          this.setData({ authorizing: false })
          if (res.data && res.data.success) {
            wx.showToast({ title: '头像更新成功', icon: 'success' })
            this._refreshAfterAuth()
          } else {
            wx.showToast({ title: '头像更新失败', icon: 'none' })
          }
        },
        fail: () => {
          wx.hideLoading()
          this.setData({ authorizing: false })
          wx.showToast({ title: '头像更新失败', icon: 'none' })
        },
      })
    },

    handleGetPhone() {
      if (!this.data.isCurrentUser || this.data.authorizing || this.data.hasPhone) return

      this.setData({ authorizing: true })
      wx.showLoading({ title: '正在获取手机号...' })

      wx.qy.getMobile({
        success: (res) => {
          wx.hideLoading()
          if (res.encryptedData) {
            this._updateUserPhone(res.encryptedData, res.iv)
          } else {
            this.setData({ authorizing: false })
            wx.showToast({ title: '未获取到手机号', icon: 'none' })
          }
        },
        fail: (err) => {
          wx.hideLoading()
          this.setData({ authorizing: false })
          if (err.errCode === 42013) {
            wx.showModal({
              title: '获取失败',
              content: '登录凭证已过期，请重新登录',
              showCancel: false,
            })
          } else {
            wx.showToast({ title: '获取手机号失败', icon: 'none' })
          }
        },
      })
    },

    _updateUserPhone(encryptedData, iv) {
      wx.showLoading({ title: '正在更新手机号...' })
      wx.request({
        url: `${app.globalData.request_url}/auth/update_phone`,
        method: 'POST',
        header: {
          'content-type': 'application/json',
          Authorization: `Bearer ${wx.getStorageSync('token')}`,
        },
        data: { encryptedData, iv },
        success: (res) => {
          wx.hideLoading()
          this.setData({ authorizing: false })
          if (res.data && res.data.success) {
            wx.showToast({ title: '手机号更新成功', icon: 'success' })
            this._refreshAfterAuth()
          } else {
            wx.showToast({ title: '手机号更新失败', icon: 'none' })
          }
        },
        fail: () => {
          wx.hideLoading()
          this.setData({ authorizing: false })
          wx.showToast({ title: '手机号更新失败', icon: 'none' })
        },
      })
    },
  },
})
