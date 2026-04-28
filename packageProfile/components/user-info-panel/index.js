// packageProfile/components/user-info-panel/index.js
const app = getApp()

// 性别处理工具
const genderUtils = {
  map: { '男': 1, '女': 2, '其他': 0 },
  reverseMap: { 1: '', 2: '', 0: '其他' },
  toNumber: function(str) { return this.map[str] || 1; },
  toString: function(num) { return this.reverseMap[num] || ''; },
  getIndex: function(str) { return ['', '', '其他'].indexOf(str); }
}

Component({
  properties: {
    userId: {
      type: String,
      value: ''
    }
  },

  data: {
    userInfo: null,
    loading: true,
    isCurrentUser: false,
    isEditing: false,
    submitting: false,
    
    // 表单数据
    formData: {
      name: '',
      gender: '',
      phone: '',
      email: '',
      department: '',
      departmentID: null,
      position: ''
    },
    
    // 性别选项
    genderOptions: ['', '', '其他'],
    genderIndex: 0,

    // 部门选择
    departments: [],
    departmentOptions: [],
    departmentIdOptions: [],
    departmentIndex: 0
  },

  lifetimes: {
    attached() {
      // 组件初始数
      }
  },

  observers: {
    'userId': function(newVal) {
      if (newVal && !newVal.startsWith('placeholder')) {
        this._lastUserId = String(newVal)
        this._loaded = false
      }
    }
  },

  methods: {
    /**
     * 懒加载入?
     */
    loadData() {
      this._hasExpanded = true
      if (this._loaded) return Promise.resolve()
      this._loaded = true
      
      const userId = this.properties.userId
      if (!userId || userId.startsWith('placeholder')) {
        this.setData({ loading: false })
        this.triggerEvent('loaded')
        return Promise.resolve()
      }
      
      this._lastUserId = String(userId)
      return this.fetchUserInfo(userId).then(() => {
        this.triggerEvent('loaded')
      }).catch(() => {
        this.triggerEvent('loaded')
      })
    },

    /**
     * 返回按钮
     */
    onNavBack() {
      this.triggerEvent('close')
    },

    /**
     * 获取用户信息
     */
    async fetchUserInfo(userId) {
      this.setData({ loading: true })
      
      return new Promise((resolve, reject) => {
        wx.request({
          url: app.globalData.request_url + `/user/${userId}`,
          method: 'GET',
          header: {
            'Authorization': `Bearer ${wx.getStorageSync('token')}`,
            'Content-Type': 'application/json'
          },
          success: (res) => {
            if (res.data.Flag == 4000) {
              const userInfo = res.data.data
              userInfo.roles_join = userInfo.roles.join(',')
              
              const genderStr = typeof userInfo.gender === 'number' 
                ? genderUtils.toString(userInfo.gender) 
                : userInfo.gender
              
              this.setData({
                userInfo: { ...userInfo, gender: genderStr },
                loading: false,
                formData: {
                  name: userInfo.username || '',
                  gender: genderStr,
                  phone: userInfo.phone || '',
                  email: userInfo.email || '',
                  department: userInfo.department || '',
                  departmentID: userInfo.departmentID ?? null,
                  position: userInfo.position || ''
                },
                genderIndex: genderUtils.getIndex(genderStr)
              })
              resolve()
            } else {
              wx.showToast({
                title: res.data.message || '获取用户信息失败',
                icon: 'none'
              })
              this.setData({ loading: false })
              reject()
            }
          },
          fail: (err) => {console.log(err)}
        })
      })
    }
  }
})