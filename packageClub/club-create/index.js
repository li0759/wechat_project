const app = getApp();

Page({
  data: {
    userID: '',
    submitting: false,
    uploadAPI: app.globalData.request_url + `/file/upload_file`,
    formData: {
      club_name: '',
      description: '',
      charter: '',
      leader_id: '',
      images: ''
    },
    dragImgCount: 0,
    selectedLeader: null,
    
    // 弹窗控制
    showClubNamePopup: false,
    showLeaderPopup: false,
    showDescriptionPopup: false,
    showCharterPopup: false,
    showImagePopup: false,
    
    // 临时数据
    tempClubName: '',
    tempDescription: '',
    tempCharter: '',
    tempSelectedLeader: null,
    leaderSearchResults: []
  },

  onLoad: function (options) {
    // 检查登录状态并获取用户信息
    this.checkLoginStatus()
    
    // 设置用户ID和token
    const userId = wx.getStorageSync('userId');
    this.setData({
      userID: userId,
      token: wx.getStorageSync('token')
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

  onShow() {
    // 更新图片计数
    this.updateImageCount();
  },

  // 更新图片计数
  updateImageCount() {
    const dragComponent = this.selectComponent('#drag-img');
    if (dragComponent && dragComponent.data.dragImgList) {
      this.setData({
        dragImgCount: dragComponent.data.dragImgList.length
      });
    }
  },

  // 拖拽组件图片列表更新回调
  onImageListUpdate(event) {
    // 更新图片计数
    this.updateImageCount();
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

  // 显示错误提示
  showErrorToast(message) {
    wx.showToast({
      title: message,
      icon: 'none'
    });
  },

  // 返回上一页
  navigateBack() {
    wx.navigateBack();
  },

  // ========== 编辑弹窗相关方法 ==========

  // 编辑协会名称
  editClubName() {
    this.setData({
      showClubNamePopup: true,
      tempClubName: this.data.formData.club_name
    });
  },

  closeClubNamePopup() {
    this.setData({ showClubNamePopup: false });
  },

  onTempClubNameChange(event) {
    this.setData({ tempClubName: event.detail });
  },

  confirmClubName() {
    this.setData({
      'formData.club_name': this.data.tempClubName,
      showClubNamePopup: false
    });
  },

  // 编辑会长选择
  editLeader() {
    this.setData({
      showLeaderPopup: true,
      tempSelectedLeader: this.data.selectedLeader
    });
  },

  closeLeaderPopup() {
    this.setData({ 
      showLeaderPopup: false,
      leaderSearchResults: [] // 清空搜索结果
    });
  },

  // 获取会长搜索建议（search_suggest组件专用）
  async onFetchLeaderSuggestions(e) {
    const { keyword, callback } = e.detail;
    
    if (!keyword || keyword.length < 1) {
      callback([]);
      return;
    }

    try {
      const res = await this.request({
        url: `/search/user/suggestions?keyword=${encodeURIComponent(keyword)}&limit=8`,
        method: 'GET'
      });

      if (res.code === 200) {
        callback(res.data.suggestions);
      } else {
        callback([]);
      }
    } catch (error) {
      console.error('获取搜索建议失败:', error);
      callback([]);
    }
  },

  // 执行搜索（search_suggest组件专用）
  async onLeaderSearch(e) {
    const keyword = e.detail.value;
    await this.performLeaderSearch(keyword);
  },

  // 选择搜索建议
  onSelectLeaderSuggestion(e) {
    const { value, item } = e.detail;
    
    if (item.extra && item.extra.type === 'user') {
      // 设置临时选择的会长
      this.setData({
        tempSelectedLeader: {
          id: item.extra.userId,
          name: item.title,
          avatar: item.extra.avatar,
          description: item.description
        }
      });
      
      // 清空搜索组件的值
      const searchSuggest = this.selectComponent('#leaderSearchSuggest');
      if (searchSuggest) {
        searchSuggest.clear();
      }
    } else {
      // 执行搜索
      this.performLeaderSearch(value);
    }
  },

  // 选择历史记录
  onLeaderHistorySelect(e) {
    const { value } = e.detail;
    this.performLeaderSearch(value);
  },

  // 执行搜索的通用方法
  async performLeaderSearch(keyword) {
    if (!keyword || !keyword.trim()) {
      this.showErrorToast('请输入搜索关键词');
      return;
    }

    wx.showLoading({ title: '搜索中...' });

    try {
      const res = await this.request({
        url: `/search/user?q=${encodeURIComponent(keyword)}&page=1&per_page=20`,
        method: 'GET'
      });

      if (res.Flag == 4000) {
        // 将搜索结果存储到临时数据中，供选择使用
        this.setData({
          leaderSearchResults: res.data.users
        });
      } else {
        this.showErrorToast('搜索失败');
      }
    } catch (error) {
      this.showErrorToast('搜索失败');
    } finally {
      wx.hideLoading();
    }
  },

  // 清除会长选择
  clearLeaderSelection() {
    this.setData({ tempSelectedLeader: null });
  },

  // 从搜索结果中选择会长
  selectLeaderFromSearch(e) {
    const user = e.currentTarget.dataset.user;
    
    this.setData({
      tempSelectedLeader: {
        id: user.user_id,
        name: user.user_name,
        avatar: user.avatar,
        description: user.phone || '暂无描述'
      },
      leaderSearchResults: [] // 清空搜索结果
    });
    
    // 清空搜索组件的值
    const searchSuggest = this.selectComponent('#leaderSearchSuggest');
    if (searchSuggest) {
      searchSuggest.clear();
    }
  },

  // 确认会长选择
  confirmLeader() {
    if (!this.data.tempSelectedLeader) {
      this.showErrorToast('请先选择会长');
      return;
    }
    
    this.setData({
      selectedLeader: this.data.tempSelectedLeader,
      'formData.leader_id': this.data.tempSelectedLeader.id,
      showLeaderPopup: false
    });
  },

  // 编辑协会简介
  editDescription() {
    this.setData({
      showDescriptionPopup: true,
      tempDescription: this.data.formData.description
    });
  },

  closeDescriptionPopup() {
    this.setData({ showDescriptionPopup: false });
  },

  onTempDescriptionChange(event) {
    this.setData({ tempDescription: event.detail });
  },

  confirmDescription() {
    this.setData({
      'formData.description': this.data.tempDescription,
      showDescriptionPopup: false
    });
  },

  // 编辑协会章程
  editCharter() {
    this.setData({
      showCharterPopup: true,
      tempCharter: this.data.formData.charter
    });
  },

  closeCharterPopup() {
    this.setData({ showCharterPopup: false });
  },

  onTempCharterChange(event) {
    this.setData({ tempCharter: event.detail });
  },

  confirmCharter() {
    this.setData({
      'formData.charter': this.data.tempCharter,
      showCharterPopup: false
    });
  },

  // 编辑图片
  editImages() {
    this.setData({ showImagePopup: true });
  },

  closeImagePopup() {
    this.setData({ showImagePopup: false });
  },

  confirmImages() {
    this.updateImageCount();
    this.setData({ showImagePopup: false });
  },

  // ========== 表单提交相关方法 ==========

  // 表单验证
  validateForm() {
    const { formData } = this.data;
    
    if (!formData.club_name || formData.club_name.trim() === '') {
      this.showErrorToast('请输入协会名称');
      return false;
    }
    
    if (!formData.leader_id) {
      this.showErrorToast('请选择协会会长');
      return false;
    }
    
    if (!formData.description || formData.description.trim() === '') {
      this.showErrorToast('请输入协会简介');
      return false;
    }
    
    // 检查图片
    const dragComponent = this.selectComponent('#drag-img');
    if (!dragComponent || !dragComponent.data.dragImgList || dragComponent.data.dragImgList.length === 0) {
      this.showErrorToast('请至少上传一张协会图片');
      return false;
    }
    
    return true;
  },

  // 提交表单
  async submitForm() {
    if (this.data.submitting) return;
    
    if (!this.validateForm()) return;
    
    this.setData({ submitting: true });
    
    try {
      // 先保存图片变更
      await this.saveImageChanges();
      
      // 创建协会
      await this.createClub();
      
      // 创建成功后返回上一页
      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
    } catch (error) {
      console.error('提交失败:', error);
      this.showErrorToast('提交失败，请重试');
    } finally {
      this.setData({ submitting: false });
    }
  },

  // 创建协会
  async createClub() {
    const { formData } = this.data;
    
    // 获取已上传的图片URL列表
    const dragComponent = this.selectComponent('#drag-img');
    const uploadedImages = dragComponent ? 
      (dragComponent.data.dragImgList || [])
        .sort((a, b) => a.key - b.key)
        .map(img => img.src) : 
      [];
    
    const clubData = {
      club_name: formData.club_name.trim(),
      description: formData.description.trim(),
      charter: formData.charter.trim(),
      leader_id: parseInt(formData.leader_id),
      images: uploadedImages.join(';')
    };
    
    const apiPromise = this.request({
      url: '/club/create',
      method: 'PUT',
      data: clubData,
      loadingText: '创建协会中...'
    });
    
    const data = await this.handleApiCall(apiPromise, '协会创建成功', '创建协会失败');
    
    // 创建成功后发送通知给新会长
    if (data) {
      try {
        const message_data = {
          booker_id: data.leader_id,
          url: `/packageClub/club-manage/index?clubId=${data.club_id}`,
          operation: 'club_created',
          content: `恭喜您被指定为${data.club_name}协会的会长，请尽快完善协会信息并开始管理协会`
        };
        
        await app.message(message_data);
      } catch (error) {
        console.error('发送会长通知失败:', error);
        // 不影响主流程，只记录错误
      }
    }
    
    // 创建成功后跳转到协会详情页
    setTimeout(() => {
        wx.navigateBack();
    }, 1000);
  },

  // 保存图片变更
  async saveImageChanges() {
    const dragComponent = this.selectComponent('#drag-img');
    if (!dragComponent) return;
    
    const imageList = dragComponent.data.dragImgList || [];
    
    for (let i = 0; i < imageList.length; i++) {
      const pic = imageList[i];
      if (pic.src.includes('tmp'))  {
        await this.uploadSingleImage(pic, dragComponent);
      }
    }
    
    this.setData({ imageList });
  },

  // 上传单张图片
  async uploadSingleImage(pic, dragComponent) {
    try {
      const uploadedUrl = await this.uploadImage(pic.src);
      
      // 更新组件中的图片状态
      dragComponent.updateImageUrl(pic.src, uploadedUrl);
      
      pic.src = uploadedUrl;
      pic.uploaded = true;
      
    } catch (error) {
      console.error('图片上传失败:', error);
      throw new Error('图片上传失败');
    }
  },

  // 上传图片到服务器
  async uploadImage(filePath) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: this.data.uploadAPI,
        filePath: filePath,
        name: 'file',
        header: {
          'Authorization': 'Bearer ' + this.data.token
        },
        success: (res) => {
          try {
            const data = JSON.parse(res.data);
            if (data.Flag === 4000) {
              resolve(data.data.url);
            } else {
              reject(new Error(data.message || '上传失败'));
            }
          } catch (error) {
            reject(new Error('解析上传结果失败'));
          }
        },
        fail: (error) => {
          reject(error);
        }
      });
    });
  }
}); 