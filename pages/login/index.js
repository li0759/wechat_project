const app = getApp();

Page({
  data: {
    isLoggedIn: false,
    userInfo: null,
    isInDevTools: false,
    devUsers: [],
    default_avatar:app.globalData.static_url+'/assets/default_avatar.webp',
    logo_url:app.globalData.static_url+'/assets/logo.png',
    userInfo_complete: false // 是否可进入主页（头像和手机号都具备）
  },

  onLoad: function (options) {
    this.setData({
      isInDevTools: typeof __wxConfig !== 'undefined' && __wxConfig.platform === 'devtools'
    });
    if (this.data.isInDevTools) {
      this.loadDevUsers();
    }
   // app.checkLoginStatus();
  },

  onShow: function () {
    if(wx.getStorageSync('token')){
      const token = wx.getStorageSync('token');
      wx.request({
        url: app.globalData.request_url + '/auth/verify_token',
        method: 'POST',
        header: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: { token: token },
        success: (res) => {
          if (res.statusCode == 200 && res.data.valid) {
            const userInfo = res.data.user;
            wx.setStorageSync('userInfo', userInfo);
            wx.setStorageSync('token', res.data.new_token);
            this.setData({
              userInfo: userInfo,
            });
            if(res.data.user.avatar && res.data.user.phone){
              this.setData({
                isLoggedIn: true,
                userInfo_complete: true
              });
              setTimeout(() => {
                wx.switchTab({ url: '/pages/home/index' });
              }, 1000);
            }
            else{
              this.setData({
                userInfor_complete: false,
                isLoggedIn: false
              });
            }
          } else {
            // Token 无效，清除本地存储并跳转登录页
            wx.removeStorageSync('token');
            wx.removeStorageSync('userInfo');
            this.setData({
              isLoggedIn: false,
              userInfo_complete: false
            });
          }
        },
        fail: (err) => {
          wx.removeStorageSync('token');
          wx.removeStorageSync('userInfo');
          this.setData({
            isLoggedIn: false,
            userInfo_complete: false
          });
        },
      });
    }


  },


  // 企业微信登录
  handleWecomLogin() {
    wx.showLoading({ title: '正在登录...' });
    
    wx.qy.login({
      success: (res) => {
        if (res.code) {
          this.sendLoginData(res.code);
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '登录失败', icon: 'none' });
      }
    });
  },

  // 发送登录数据到服务端
  sendLoginData(code) {
    wx.request({
      url: app.globalData.request_url + '/auth/qy/code2session',
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: { code: code },
      success: (res) => {
        wx.hideLoading();
        const { token, user } = res.data || {};
        if (token && user) {
          // 保存登录信息
          wx.setStorageSync('token', token);
          wx.setStorageSync('userInfo', user);
          wx.setStorageSync('userId', user.id);
          
          this.setData({
            isLoggedIn: true,
            userInfo: user,
          });
          if(user.avatar && user.phone){
            this.setData({
              userInfo_complete: true
            });
            wx.showToast({
              title: '登录成功',
              icon: 'success',
              duration: 800
            });
            setTimeout(() => {
              //wx.switchTab({ url: '/pages/home/index' });
              console.log('navigateBack');
              wx.navigateBack({fail: (err) => {
                console.log(err);
                wx.switchTab({ url: '/pages/home/index' });
              }});
            }, 1000);
          }
          else{
            this.setData({
              userInfo_complete: false
            });
            console.log('登录成功，请完善信息');
            wx.showToast({
              title: '登录成功，请完善信息',
              icon: 'success',
              duration: 1500
            });
          }
        } else {
          wx.showToast({ title: '登录失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '登录失败', icon: 'none' });
      }
    });
  },

  handleLogout() {
    wx.showModal({
      title: '确认',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('token');
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('userId');
          this.setData({
            isLoggedIn: false,
            userInfo: null,
            hasPhone: false,
            hasAvatar: false,
            userInfo_complete: false
          });
          wx.showToast({
            title: '已退出登录',
            icon: 'success'
          });
        }
      }
    });
  },

  // 加载开发者工具模式用户列表
  loadDevUsers() {
    wx.request({
      url: app.globalData.request_url + '/user/list_weak',
      method: 'GET',
      success: (res) => {
        const list = (res.data && res.data.data) || [];
        this.setData({ devUsers: list });
      }
    });
  },

  // 开发者工具模式：弱登录
  handleWeakLogin(e) {
    const userId = e.currentTarget.dataset.userid;
    if (!userId) return;
    
    wx.showLoading({ title: '正在登录...' });
    wx.request({
      url: app.globalData.request_url + '/auth/loginweak',
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: { userId },
      success: (res) => {
        wx.hideLoading();
        const { token, user } = res.data || {};
        if (token && user) {
          wx.setStorageSync('token', token);
          wx.setStorageSync('userInfo', user);
          wx.setStorageSync('userId', user.id);
          this.setData({
            isLoggedIn: true,
            userInfo: user,
          });
          if(user.avatar && user.phone){
            this.setData({
              userInfo_complete: true
            });
            wx.showToast({
              title: '登录成功',
              icon: 'success',
              duration: 800
            });
            setTimeout(() => {
              //wx.switchTab({ url: '/pages/home/index' });
              console.log('navigateBack');
              wx.navigateBack({fail: (err) => {
                console.log(err);
                wx.switchTab({ url: '/pages/home/index' });
              }});
            }, 1000);
          }
          else{
            this.setData({
              userInfo_complete: false
            });
            console.log('登录成功，请完善信息');
            wx.showToast({
              title: '登录成功，请完善信息',
              icon: 'success',
              duration: 1500
            });
          }
        } else {
          wx.showToast({ title: '登录失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '登录失败', icon: 'none' });
      }
    });
  },

  // 更新用户手机号
  updateUserPhone(encryptedData, iv) {
    wx.showLoading({ title: '正在更新手机号...' });
    wx.request({
      url: app.globalData.request_url + '/auth/update_phone',
      method: 'POST',
      header: { 
        'content-type': 'application/json',
        'Authorization': 'Bearer ' + wx.getStorageSync('token')
      },
      data: { encryptedData: encryptedData, iv: iv },
      success: (res) => {
        wx.hideLoading();
        console.log(res);
        if (res.data && res.data.success) {
          wx.showToast({
            title: '手机号更新成功',
            icon: 'success',
            duration: 1500
          });          
          // 获取最新用户信息以同步mobile并更新状态
    this.fetchLatestUserInfo(() => {
            if(this.data.userInfo.avatar && this.data.userInfo.phone){
              this.setData({
                userInfo_complete: true
              });
              setTimeout(() => {
                //wx.switchTab({ url: '/pages/home/index' });
                wx.navigateBack();
              }, 1000);
            }
            else{
              this.setData({
                userInfo_complete: false
              });
            }
          });
        } else {
          wx.showToast({
            title: '手机号更新失败',
            icon: 'none',
            duration: 2000
          });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({
          title: '手机号更新失败',
          icon: 'none',
          duration: 2000
        });
      }
    });
  },

  // 更新用户头像
  updateUserAvatar(fileID) {
    console.log(fileID);
    wx.showLoading({ title: '正在更新头像...' });
    wx.request({
      url: app.globalData.request_url + '/auth/update_avatar',
      method: 'POST',
      header: { 
        'content-type': 'application/json',
        'Authorization': 'Bearer ' + wx.getStorageSync('token')
      },
      data: { fileID: fileID },
      success: (res) => {
        wx.hideLoading();
        if (res.data && res.data.success) {
          wx.showToast({
            title: '头像更新成功',
            icon: 'success',
            duration: 1500
          });
          
          // 头像更新成功后，获取最新用户信息并更新状态
    this.fetchLatestUserInfo(() => {
            if(this.data.userInfo.avatar && this.data.userInfo.phone){
              this.setData({
                userInfo_complete: true
              });
              setTimeout(() => {
                //wx.switchTab({ url: '/pages/home/index' });
                wx.navigateBack();
              }, 1000);
            }
            else{
              this.setData({
                userInfo_complete: false
              });
            }
          });
        } else {
          wx.showToast({
            title: '头像更新失败',
            icon: 'none',
            duration: 2000
          });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({
          title: '头像更新失败',
          icon: 'none',
          duration: 2000
        });
      }
    });
  },

  // 获取最新用户信息
  fetchLatestUserInfo(callback) {
    const userId = wx.getStorageSync('userId');
    const token = wx.getStorageSync('token');
    
    if (!userId || !token) {
      console.log('缺少用户ID或token');
      if (typeof callback === 'function') callback();
      return;
    }
    
    wx.request({
      url: app.globalData.request_url + `/user/${userId}`,
      method: 'GET',
      header: {
        'Authorization': 'Bearer ' + token
      },
      success: (res) => {
        if (res.data.Flag == '4000') {
          const userInfo = res.data.data;
          // 更新本地存储和页面数据
          wx.setStorageSync('userInfo', userInfo);
          this.setData({
            userInfo: userInfo
          });
          console.log('用户信息更新成功:', userInfo);
        } else {
          console.log('获取用户信息失败:', res.data);
        }
        if (typeof callback === 'function') callback();
      },
      fail: (err) => {
        console.log('获取用户信息请求失败:', err);
        if (typeof callback === 'function') callback();
      }
    });
  },

  // 获取手机号
  handleGetMobile() {
    if (this.data.hasPhone) return; // 已有手机号，不重复获取
    
    wx.showLoading({ title: '正在获取手机号...' });
    
    wx.qy.getMobile({
      success: (res) => {
        wx.hideLoading();
        const encryptedData = res.encryptedData;
        const iv = res.iv;
        console.log(encryptedData, iv);
        if (encryptedData) {
          this.updateUserPhone(encryptedData, iv);
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.log('获取手机号失败:', err);
        
        if (err.errCode === 42013) {
          wx.showModal({
            title: '获取失败',
            content: '登录凭证已过期，请重新登录',
            showCancel: false,
            confirmText: '确定'
          });
        } else {
          wx.showToast({ 
            title: '获取手机号失败', 
            icon: 'none',
            duration: 2000
          });
        }
      }
    });
  },

  // 获取头像
  handleGetAvatar() {
    if (this.data.hasAvatar) return; // 已有头像，不重复获取 
    
    wx.showLoading({ title: '正在获取头像...' });
    
    wx.qy.getAvatar({
      success: (res) => {
        wx.hideLoading();
        const avatar = res.avatar;
        if (avatar) {
          console.log('获取到头像URL:', avatar);
          this.uploadAvatar(avatar);
        } else {
          wx.showToast({ 
            title: '未获取到头像', 
            icon: 'none',
            duration: 2000
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.log('获取头像失败:', err);
        
        if (err.errCode === 42013) {
          wx.showModal({
            title: '获取失败',
            content: '登录凭证已过期，请重新登录',
            showCancel: false,
            confirmText: '确定'
          });
        } else {
          wx.showToast({ 
            title: '获取头像失败', 
            icon: 'none',
            duration: 2000
          });
        }
      }
    });
  },

  // 上传头像到后台
  uploadAvatar(avatarUrl) {
  // 上传头像到后台
    wx.request({
      url: app.globalData.request_url + '/file/create_by_url',
      method: 'POST',
      header: {
        'Authorization': 'Bearer ' + wx.getStorageSync('token')
      },
      data: {
        url: avatarUrl
      },
      success: (res) => {
        if (res.data.Flag == '4000') {
          console.log(res.data.data.file_id);
          this.updateUserAvatar(res.data.data.file_id);
        }
      },
      fail: (err) => {
        console.log(err);
        wx.showToast({
          title: '上传头像失败',
          icon: 'none',
          duration: 2000
        });
      }
    });
  },
  
});