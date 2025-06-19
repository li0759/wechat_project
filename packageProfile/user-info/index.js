// pages/profile/user-info/index.js
const app = getApp()

Page({
  data: {
    userId: null,
    userInfo: null,
    loading: true,
    isCurrentUser: false,  // 是否当前登录用户
    isEditing: false,      // 是否处于编辑状态
    submitting: false,     // 是否正在提交
    
    // 表单数据
    formData: {
      name: '',
      gender: '',
      phone: '',
      email: ''
    },
    
    // 性别选项
    genderOptions: ['男', '女', '其他'],
    genderIndex: 0
  },

  onLoad(options) {
    const currentUserId = wx.getStorageSync('userId');
    
    if (options.id) {
      this.setData({
        userId: options.id,
        isCurrentUser: currentUserId === options.id
      });
      this.fetchUserInfo(options.id);
    } else {
      if (currentUserId) {
        this.setData({
          userId: currentUserId,
          isCurrentUser: true
        });
        this.fetchUserInfo(currentUserId);
      } else {
        wx.showToast({
          title: '获取用户ID失败',
          icon: 'none'
        });
      }
    }
  },

  onShow() {
    // 检查登录状态
    if (wx.getStorageSync('token')) {
      this.fetchUserInfo(this.data.userId);
    }
  },

  onPullDownRefresh() {
    this.fetchUserInfo(this.data.userId).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 获取用户信息
   */
  async fetchUserInfo(userId) {
    this.setData({ loading: true });
    
    wx.request({
      url: app.globalData.request_url + `/user/${userId}`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${wx.getStorageSync('token')}`,
        'Content-Type': 'application/json'
      },
      success: (res) => {
        if (res.data.Flag == 4000) {
          const userInfo = res.data.data;
          
          // 设置性别索引
          let genderIndex = 0;
          if (userInfo.gender === '女') {
            genderIndex = 1;
          } else if (userInfo.gender === '其他') {
            genderIndex = 2;
          }
          
          this.setData({
            userInfo: userInfo,
            loading: false,
            formData: {
              name: userInfo.name || '',
              gender: userInfo.gender || '男',
              phone: userInfo.phone || '',
              email: userInfo.email || ''
            },
            genderIndex: genderIndex
          });
        } else {
          wx.showToast({
            title: res.data.message || '获取用户信息失败',
            icon: 'none'
          });
          this.setData({ loading: false });
        }
      },
      fail: (err) => {
        console.error('请求失败:', err);
        wx.showToast({
          title: '网络请求失败',
          icon: 'none'
        });
        this.setData({ loading: false });
      }
    });
  },

  /**
   * 开始编辑
   */
  startEdit() {
    this.setData({
      isEditing: true
    });
  },
  
  /**
   * 单项编辑
   */
  onEditItem(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({
      isEditing: true
    });
  },
  
  /**
   * 取消编辑
   */
  cancelEdit() {
    // 重置表单数据
    this.setData({
      isEditing: false,
      formData: {
        name: this.data.userInfo.name || '',
        gender: this.data.userInfo.gender || '男',
        phone: this.data.userInfo.phone || '',
        email: this.data.userInfo.email || ''
      }
    });
  },
  
  /**
   * 处理输入变化
   */
  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    const { value } = e.detail;
    
    this.setData({
      [`formData.${field}`]: value
    });
  },
  
  /**
   * 处理性别选择变化
   */
  onGenderChange(e) {
    const index = e.detail.value;
    this.setData({
      genderIndex: index,
      'formData.gender': this.data.genderOptions[index]
    });
  },
  
  /**
   * 保存用户信息
   */
  saveUserInfo() {
    // 表单验证
    const { name, phone, email } = this.data.formData;
    
    if (!name.trim()) {
      wx.showToast({
        title: '姓名不能为空',
        icon: 'none'
      });
      return;
    }
    
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({
        title: '手机号格式不正确',
        icon: 'none'
      });
      return;
    }
    
    if (email && !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
      wx.showToast({
        title: '邮箱格式不正确',
        icon: 'none'
      });
      return;
    }
    
    // 提交表单
    this.setData({ submitting: true });
    
    wx.request({
      url: app.globalData.request_url + `/user/${this.data.userId}/update`,
      method: 'PUT',
      header: {
        'Authorization': `Bearer ${wx.getStorageSync('token')}`,
        'Content-Type': 'application/json'
      },
      data: {
        name: this.data.formData.name,
        gender: this.data.formData.gender,
        phone: this.data.formData.phone,
        email: this.data.formData.email
      },
      success: (res) => {
        if (res.data.Flag == 4000) {
          wx.showToast({
            title: '保存成功',
            icon: 'success'
          });
          
          // 更新本地数据
          const updatedUserInfo = {
            ...this.data.userInfo,
            name: this.data.formData.name,
            gender: this.data.formData.gender,
            phone: this.data.formData.phone,
            email: this.data.formData.email
          };
          
          this.setData({
            userInfo: updatedUserInfo,
            isEditing: false,
            submitting: false
          });
          
          // 如果是当前用户，更新存储的用户信息
          if (this.data.isCurrentUser) {
            const userInfo = wx.getStorageSync('userinfo');
            if (userInfo) {
              wx.setStorageSync('userinfo', {
                ...userInfo,
                name: this.data.formData.name,
                gender: this.data.formData.gender,
                phone: this.data.formData.phone,
                email: this.data.formData.email
              });
            }
          }
        } else {
          wx.showToast({
            title: res.data.message || '保存失败',
            icon: 'none'
          });
          this.setData({ submitting: false });
        }
      },
      fail: (err) => {
        console.error('请求失败:', err);
        wx.showToast({
          title: '网络请求失败',
          icon: 'none'
        });
        this.setData({ submitting: false });
      }
    });
  },

  /**
   * 导航到编辑页面（旧方法，保留兼容性）
   */
  navigateToEdit() {
    this.startEdit();
  }
}); 