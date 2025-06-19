const app = getApp()
Page({
  data: {
    userInfo: null,
    loading: true,
    formData: {
      name: '',
      gender: '',
      phone: '',
      email: ''
    }
  },

  onLoad() {
    this.fetchUserInfo();
  },

  /**
   * 获取用户信息
   */
  fetchUserInfo() {
    const userId = wx.getStorageSync('userId');
    if (!userId) {
      wx.showToast({
        title: '获取用户ID失败',
        icon: 'none'
      });
      return;
    }

    this.setData({ loading: true });
    
    wx.request({
      url: app.globalData.request_url + `/v1/user/${userId}`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${wx.getStorageSync('token')}`,
        'Content-Type': 'application/json'
      },
      success: (res) => {
        if (res.data.Flag == 4000) {
          const userInfo = res.data.data;
          this.setData({
            userInfo: userInfo,
            loading: false,
            formData: {
              name: userInfo.name || '',
              gender: userInfo.gender || '',
              phone: userInfo.phone || '',
              email: userInfo.email || ''
            }
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
   * 表单输入变化
   */
  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    const { value } = e.detail;
    
    this.setData({
      [`formData.${field}`]: value
    });
  },

  /**
   * 性别选择变化
   */
  onGenderChange(e) {
    this.setData({
      'formData.gender': e.detail
    });
  },

  /**
   * 提交表单
   */
  submitForm() {
    const { formData } = this.data;
    
    // 表单验证
    if (!formData.name.trim()) {
      wx.showToast({
        title: '姓名不能为空',
        icon: 'none'
      });
      return;
    }
    
    // 邮箱格式验证
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      wx.showToast({
        title: '邮箱格式不正确',
        icon: 'none'
      });
      return;
    }
    
    // 手机号格式验证
    if (formData.phone && !/^1[3-9]\d{9}$/.test(formData.phone)) {
      wx.showToast({
        title: '手机号格式不正确',
        icon: 'none'
      });
      return;
    }
    
    const userId = wx.getStorageSync('userId');
    if (!userId) {
      wx.showToast({
        title: '获取用户ID失败',
        icon: 'none'
      });
      return;
    }
    
    wx.showLoading({
      title: '保存中...',
    });
    
    wx.request({
      url: app.globalData.request_url + `/user/${userId}/update`,
      method: 'PUT',
      header: {
        'Authorization': `Bearer ${wx.getStorageSync('token')}`,
        'Content-Type': 'application/json'
      },
      data: formData,
      success: (res) => {
        wx.hideLoading();
        
        if (res.data.Flag == 4000) {
          wx.showToast({
            title: '保存成功',
            icon: 'success'
          });
          
          // 更新本地存储的用户信息
          const userInfo = wx.getStorageSync('userinfo');
          if (userInfo) {
            userInfo.name = formData.name;
            userInfo.gender = formData.gender;
            userInfo.phone = formData.phone;
            userInfo.email = formData.email;
            wx.setStorageSync('userinfo', userInfo);
          }
          
          // 返回上一页
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        } else {
          wx.showToast({
            title: res.data.message || '保存失败',
            icon: 'none'
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('请求失败:', err);
        wx.showToast({
          title: '网络请求失败',
          icon: 'none'
        });
      }
    });
  }
}); 