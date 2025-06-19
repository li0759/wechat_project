const app = getApp();

Page({
  data: {
    userID: '',
    clubId: null,
    clubInfo: {},
    submitting: false,
    formData: {
      feement: '',
      description: '',
      createDate: null  // ISO 格式的日期字符串
    },
    // 日期选择相关
    minDate: new Date(2020, 0, 1).getTime(),
    maxDate: new Date(2030, 11, 31).getTime(),
    currentDate: new Date().getTime(),
    showDatetimePicker: false,
    // 协会选择相关数据
    clubColumns: [],
    defaultClubIndex: 0
  },

  onLoad: function (options) {
    // 检查登录状态并获取用户信息
    if (!this.checkLoginStatus()) return;
    
    // 设置用户ID和token
    const userId = wx.getStorageSync('userId');
    this.setData({
      userID: userId,
      token: wx.getStorageSync('token')
    });
    
    // 获取用户管理的协会列表
    this.fetchUserClubList();
    
    // 如果有clubId参数，则设置为默认选中
    if (options.clubId) {
      this.setData({ clubId: options.clubId });
    }

    // 设置当前日期作为默认日期
    const now = new Date();
    this.setData({
      'formData.createDate': now.toISOString(),
      currentDate: now.getTime()
    });
  },

  // 格式化日期显示
  formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },

  // 显示日期时间选择器
  showDatetimePicker() {
    this.setData({
      showDatetimePicker: true
    });
  },

  // 日期时间选择器确认
  onDateTimeConfirm(event) {
    const date = new Date(event.detail);
    this.setData({
      'formData.createDate': date.toISOString(),
      showDatetimePicker: false
    });
  },

  // 日期时间选择器取消
  onDateTimeCancel() {
    this.setData({
      showDatetimePicker: false
    });
  },

  // 检查登录状态
  checkLoginStatus: function() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({
        userInfo: userInfo
      });
      return true;
    } else {
      wx.navigateTo({
        url: '/pages/login'
      });
      return false;
    }
  },

  // 统一请求方法
  request(options) {
    wx.showLoading({ title: options.loadingText || '加载中...' });
    
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.request_url + options.url,
        method: options.method || 'GET',
        data: options.data,
        header: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.data.token
        },
        success(res) {
          wx.hideLoading();
          resolve(res.data);
        },
        fail(err) {
          wx.hideLoading();
          reject(err);
        }
      });
    });
  },

  // 统一API调用处理
  handleApiCall(apiPromise, successMsg, errorMsg) {
    return apiPromise
      .then(res => {
        if (res.Flag == 4000) {
          if (successMsg) {
            wx.showToast({
              title: successMsg,
              icon: 'success'
            });
          }
          return res.data;
        } else {
          this.showErrorToast(res.message || errorMsg);
          return Promise.reject(new Error(res.message || errorMsg));
        }
      })
      .catch(err => {
        console.error(`API调用失败: ${errorMsg}`, err);
        this.showErrorToast('网络请求失败');
        return Promise.reject(err);
      });
  },

  // 获取用户管理的协会列表
  fetchUserClubList() {
    const apiPromise = this.request({
      url: `/club/user_lead/list`,
      method: 'GET',
      loadingText: '加载协会列表...'
    });
    
    this.handleApiCall(apiPromise, null, '获取协会列表失败')
      .then(data => {
        if (!data) return;
        
        // 转换数据格式用于picker
        const clubList = data.map(club => ({
          id: club.club_id,
          name: club.club_name
        }));
        
        this.setData({ clubColumns: clubList });
        
        // 处理默认选择
        if (clubList.length > 0) {
          const defaultIndex = this.data.clubId 
            ? clubList.findIndex(club => club.id == this.data.clubId) 
            : 0;
          
          const selectedIndex = defaultIndex !== -1 ? defaultIndex : 0;
          const selectedClub = clubList[selectedIndex];
          
          this.setData({
            defaultClubIndex: selectedIndex,
            clubId: selectedClub.id,
            clubInfo: {
              id: selectedClub.id,
              name: selectedClub.name
            },
            'formData.description': selectedClub.name + '支出'  // 默认描述
          });
        }
      });
  },

  // 显示错误提示
  showErrorToast(message) {
    wx.showToast({
      title: message,
      icon: 'none'
    });
  },

  // 选择器选择变化
  onClubPickerChange(event) {
    const { value } = event.detail;
    
    if (!value || !value.id) {
      return this.showErrorToast('请选择有效的协会');
    }
    
    this.setData({
      clubId: value.id,
      clubInfo: {
        id: value.id,
        name: value.name
      },
      'formData.description': value.name + '支出'  // 更新默认描述
    });
  },

  // 表单输入
  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    const value = e.detail;
    
    this.setData({
      [`formData.${field}`]: value
    });
  },

  // 取消创建
  cancelCreate() {
    wx.showModal({
      title: '确认取消',
      content: '确定要取消创建吗？已输入的内容将不会保存',
      confirmColor: '#DF76B0',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack();
        }
      }
    });
  },

  // 提交表单
  submitForm() {
    // 表单验证
    if (!this.validateForm()) return;
    
    this.setData({ submitting: true });
    
    // 提交数据
    this.createClubFee(this.data.formData)
      .then(() => {
        wx.showToast({
          title: '创建成功',
          icon: 'success'
        });
        
        // 延迟返回上一页
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      })
      .catch(err => {
        this.showErrorToast('创建失败，请重试');
        this.setData({ submitting: false });
      });
  },

  // 表单验证
  validateForm() {
    const { feement, description } = this.data.formData;
    
    if (!this.data.clubId) {
      this.showErrorToast('请选择一个协会');
      return false;
    }
    
    if (!feement || feement <= 0) {
      this.showErrorToast('请输入有效的支出金额');
      return false;
    }
    
    if (!description || description.trim() === '') {
      this.showErrorToast('请输入支出描述');
      return false;
    }
    
    return true;
  },

  // 创建协会支出
  createClubFee(feeData) {
    const apiPromise = this.request({
      url: `/money/clubfee/${this.data.clubId}/create`,
      method: 'PUT',
      data: {
        feement: parseFloat(feeData.feement),
        description: feeData.description,
        createDate: feeData.createDate
      },
      loadingText: '正在创建...'
    });
    
    return this.handleApiCall(apiPromise, '支出创建成功', '支出创建失败');
  }
}); 