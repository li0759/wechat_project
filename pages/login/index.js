const app = getApp();

Page({
  data: {
    userList: [], // 用户列表数据
    isLoggedIn: false, // 登录状态
    userInfo: null // 当前用户信息
  },
  
  onLoad: function() {
    // 页面加载时获取用户列表
    this.getUserList();
    // 检查登录状态
    this.checkLoginStatus();
  },
  
  onShow: function() {
    // 页面显示时检查登录状态
    this.checkLoginStatus();
  },
  
  // 检查登录状态
  checkLoginStatus() {
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');
    
    if (token && userInfo) {
      this.setData({
        isLoggedIn: true,
        userInfo: userInfo
      });
    } else {
      this.setData({
        isLoggedIn: false,
        userInfo: null
      });
    }
  },
  
  // 获取用户列表
  getUserList() {
    wx.request({
      url: app.globalData.request_url + `/user/list_weak`,
      method: 'GET',
      success: (res) => {
        if (res.data && res.data.data) {
          // 处理用户数据，确保角色信息正确显示
          const processedUserList = res.data.data.map(user => {
            return {
              ...user,
              // 确保角色显示信息存在
              roles_join: user.roles.join('、'),
              // 确保社团信息存在
              admin_clubs: user.admin_clubs || [],
              member_clubs: user.member_clubs || [],
              total_club_count: user.total_club_count || 0
            };
          });
          this.setData({
            userList: processedUserList
          });
        } else {
          wx.showToast({
            title: '获取用户列表失败',
            icon: 'none'
          });
        }
      },
      fail: () => {
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none'
        });
      }
    });
  },

  
  // 选择用户登录
  selectUserLogin(e) {
    const wecomUserID = e.currentTarget.dataset.wecomuserid;
    
    if (!wecomUserID) {
      wx.showToast({
        title: '用户wecomUserID信息错误',
        icon: 'none'
      });
      return;
    }
    
    wx.showLoading({
      title: '登录中...'
    });
    
    // 发送弱登录请求
    wx.request({
      url: app.globalData.request_url + `/auth/login_weak`,
      method: 'POST',
      data: {
        wecomUserID: wecomUserID
      },
      header: {
        "Content-Type": "application/json"
      },
      success: (res) => {
        if (res.data && res.data.access_token) {
          // 存储登录信息
          wx.setStorageSync('token', res.data.access_token);
          wx.setStorageSync('userInfo', res.data.user);
          wx.setStorageSync('userId', res.data.user.id);
          
          wx.hideLoading();
          wx.showToast({
            title: '登录成功',
            icon: 'success',
            duration: 1500,
            success: () => {
              setTimeout(() => {
                // 跳转到首页
                wx.switchTab({
                  url: `/pages/home/index`
                });
              }, 1500);
            }
          });
        } else {
          wx.hideLoading();
          wx.showToast({
            title: res.data.message || res.data.msg || '登录失败',
            icon: 'none'
          });
        }
      },
      fail: (error) => {
        wx.hideLoading();
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none'
        });
        console.error('登录失败：', error);
      }
    });
  },
  
  // 微信一键登录
  handleLogin() {
    // 首先获取用户信息授权（必须在用户点击事件中直接调用）
    wx.getUserProfile({
      desc: '用于完善用户资料和身份认证', // 必填，描述获取用户信息的用途
      success: (userres) => {
        console.log('获取到的用户信息:', userres);
        
        // 获取用户信息成功后，再获取登录凭证
        wx.login({
          success: (logres) => {
            var platUserInfoMap = {}
            platUserInfoMap["encryptedData"] = userres.encryptedData;
            platUserInfoMap["iv"] = userres.iv;
            
            // 发送登录请求
            this.sendLoginRequest(logres.code, platUserInfoMap);
          },
          fail: (error) => {
            console.error('微信登录失败:', error);
            wx.showToast({
              title: '微信登录失败，请重试',
              icon: 'none'
            });
          }
        });
      },
      fail: (error) => {
        console.error('获取用户信息失败:', error);
        wx.showModal({
          title: '授权提示',
          content: '需要获取您的微信信息进行身份认证，请重新点击登录按钮',
          showCancel: false,
          success: (res) => {
            if (res.confirm) {
              // 用户点击确定后，可以引导用户重新点击登录按钮
            }
          }
        });
      }
    });
  },
  
  // 发送登录请求的独立方法
  sendLoginRequest(code, platUserInfoMap) {
    wx.request({
      url: app.globalData.request_url + `/auth/wxlogin`,
      method: 'POST',
      data: {
        platCode: code,
        platUserInfoMap: platUserInfoMap,
      },
      header: {
        "Content-Type": "application/json"
      },
      dataType: 'json',
      success: (response) => {
        console.log('登录响应:', response.data);
        
        if (response.data.message == '登录成功') {
          // 存储登录态和完整用户信息
          wx.setStorageSync('token', response.data.token);
          wx.setStorageSync('userInfo', response.data.data);
          wx.setStorageSync('userId', response.data.data.id);
          
          // 更新页面状态
          this.setData({
            isLoggedIn: true,
            userInfo: response.data.data
          });
          
          // 显示登录成功信息
          wx.showToast({
            title: '登录成功',
            icon: 'success',
            duration: 1500
          });

          if (response.data.isNewUser) {
            // 新用户跳转到注册页面
            setTimeout(() => {
              wx.navigateTo({
                url: `/pages/common_user/register/index`
              });
            }, 1500);
          } else {
            // 老用户直接跳转到首页
            setTimeout(() => {
              wx.switchTab({ 
                url: `/pages/home/index`
              });
            }, 1500);
          }
        } else {
          console.log('登录失败:', response.data);
          wx.showToast({
            title: response.data.message || '登录失败，请重试',
            icon: 'none'
          });
        }
      },
      fail: (error) => {
        console.error('登录请求失败:', error);
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none'
        });
      }
    });
  }
});