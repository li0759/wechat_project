const app = getApp();

Page({
  data: {
    userID: '',
    clubId: null,
    clubInfo: {},
    submitting: false,
    // 日历选择相关
    calendarShow: false,
    minDate: new Date(2020, 0, 1).getTime(),
    maxDate: new Date().getTime(),
    defaultDate: [
      new Date(new Date().setDate(1)).getTime(),
      new Date().getTime()
    ],
    selectedDate: [
      new Date(new Date().setDate(1)).toISOString().split('T')[0],
      new Date().toISOString().split('T')[0]
    ],
    // 表单数据
    formData: {
      total_fee: '',
      description: '',
      createDate: new Date().toISOString().split('T')[0]
    },
    // 协会选择相关数据
    clubColumns: [],
    defaultClubIndex: 0,
    // 支出列表
    feeList: []
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

  onShow() {
    // 如果已经选择了协会且有日期范围，刷新支出列表
    if(this.data.clubId && this.data.selectedDate.length === 2) {
      this.fetchClubFeeList();
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
            }
          });

          // 选择协会后加载支出列表
          this.fetchClubFeeList();
        }
      });
  },

  // 获取协会支出列表
  fetchClubFeeList() {
    if(!this.data.clubId || !this.data.selectedDate[0] || !this.data.selectedDate[1]) {
      return;
    }

    const startDate = this.data.selectedDate[0];
    const endDate = this.data.selectedDate[1];
    
    const apiPromise = this.request({
      url: `/money/clubfee/${this.data.clubId}/list/${startDate}/${endDate}`,
      method: 'GET',
      loadingText: '加载支出列表...'
    });
    
    this.handleApiCall(apiPromise, null, '获取支出列表失败')
      .then(data => {
        if (!data) return;
        
        this.setData({
          feeList: data.clubfee_list || []
        });
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
      }
    });

    // 选择协会后刷新支出列表
    this.fetchClubFeeList();
  },

  // 表单输入
  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    const value = e.detail;
    
    this.setData({
      [`formData.${field}`]: value
    });
  },

  // 日历相关方法
  showCalendar() {
    this.setData({
      calendarShow: true
    });
  },
  
  onCalendarClose() {
    this.setData({
      calendarShow: false
    });
  },
  
  onCalendarConfirm(event) {
    const [start, end] = event.detail;
    
    // 格式化日期
    const startDate = new Date(start).toISOString().split('T')[0];
    const endDate = new Date(end).toISOString().split('T')[0];
    
    this.setData({
      selectedDate: [startDate, endDate],
      calendarShow: false
    });
    
    // 获取选定日期范围内的支出列表
    this.fetchClubFeeList();
  },

  // 创建群收款
  createGroupPayment() {
    const { formData, clubId } = this.data;
    
    // 验证必填字段
    if (!this.validateForm()) return;

    this.setData({ submitting: true });
    
    // 构建请求数据
    const paymentData = {
      total_fee: parseFloat(formData.total_fee),
      description: formData.description,
      createDate: formData.createDate
    };

    // 发送创建请求
    const apiPromise = this.request({
      url: `/money/paygroup/create/for_club/${clubId}`,
      method: 'PUT',
      data: paymentData,
      loadingText: '创建群收款中...'
    });
    
    this.handleApiCall(apiPromise, '创建群收款成功', '创建群收款失败')
      .then(async (data) => {
        this.setData({ submitting: false });
        
        // 发送通知给所有协会成员
        try {
          const message_data = {
            club_id: clubId,
            url: `/packageMoney/paypersonal/index?clubId=${clubId}`,
            operation: 'club_expense_created',
            content: `${this.data.clubInfo.name}协会产生新的支出：${formData.description}，人均支付：¥${data.per_payment}，请查看个人缴费页面`
          };
          
          await app.message_for_club(message_data);
        } catch (error) {
          console.error('发送协会支出通知失败:', error);
        }
        
        // 弹出成功提示
        wx.showModal({
          title: '创建成功',
          content: `成功创建群收款，人均支付金额: ${data.per_payment} 元`,
          showCancel: false,
          success: () => {
            // 返回上一页
            wx.navigateBack();
          }
        });
      })
      .catch(() => {
        this.setData({ submitting: false });
      });
  },

  // 验证表单
  validateForm() {
    const { formData, clubId } = this.data;
    
    if (!clubId) {
      this.showErrorToast('请选择协会');
      return false;
    }
    
    if (!formData.total_fee) {
      this.showErrorToast('请输入收款金额');
      return false;
    }
    
    if (isNaN(parseFloat(formData.total_fee)) || parseFloat(formData.total_fee) <= 0) {
      this.showErrorToast('收款金额必须大于0');
      return false;
    }
    
    if (!formData.description) {
      this.showErrorToast('请输入收款说明');
      return false;
    }
    
    return true;
  },

  // 取消创建
  cancelCreate() {
    wx.showModal({
      title: '确认取消',
      content: '已填写的内容将不会保存，确定要取消吗？',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack();
        }
      }
    });
  }
}) 