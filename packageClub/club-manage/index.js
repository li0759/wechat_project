const app = getApp();

Page({
  data: {
    userID: '',
    clubId: '',
    clubDetail: null,
    pendingApplications: [],
    membersList: [],
    searchResults: [],
    uploadAPI: app.globalData.request_url + '/file/upload_file',
    
    // 弹窗状态
    showDescriptionPopup: false,
    showCharterPopup: false,
    showImageDialog: false,
    showMembersPopup: false,
    showAddMemberPopup: false,
    
    // 临时数据
    tempDescription: '',
    tempCharter: '',
    tempImages: [],
    searchKeyword: '',
    
    // UI状态
    isLoading: false,
    isEmpty: false,
    saving: false,
    currentImageIndex: 0
  },

  onLoad: function (options) {
    this.checkLoginStatus();
    const token = wx.getStorageSync('token');
    const userId = wx.getStorageSync('userId');
    
    this.setData({
      userID: userId,
      token: token,
      clubId: options.clubId
    });
    
    if (options.clubId) {
      this.loadClubData(options.clubId);
    }
  },

  // 检查登录状态
  checkLoginStatus: function() {
    const userInfo = wx.getStorageSync('userinfo');
    if (userInfo) {
      this.setData({
        userInfo: userInfo
      });
    } else {
      wx.navigateTo({
        url: '/pages/login'
      });
    }
  },

  onShow() {
  },

  // 页面隐藏时清理
  onHide() {
    this.setData({
      showDescriptionPopup: false,
      showCharterPopup: false,
      showImageDialog: false,
      showMembersPopup: false,
      showAddMemberPopup: false
    });
  },

  // 统一请求方法
  request(options) {
    console.log(options)
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
          resolve(res.data);
        },
        fail(err) {
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
        this.showErrorToast(err);
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

  // 加载协会数据
  async loadClubData(clubId) {
    this.setData({ isLoading: true });
    
    try {
      // 并行加载协会详情和待处理申请数量
      const [clubRes, applicationsRes] = await Promise.all([
        this.request({
          url: `/club/${clubId}`,
          method: 'GET'
        }),
        this.request({
          url: `/club/application/${clubId}/pending/list`,
          method: 'GET'
        }).catch(() => ({ data: [] })) // 如果没有权限，返回空数组
      ]);

      if (clubRes.Flag == 4000) {
        const clubDetail = clubRes.data;
        // 处理图片数据 - 修复：使用image字段而不是logo字段，并正确解析分号分隔的URL
        if (clubDetail.images) {
          // 如果image字段存在，按分号分割
          clubDetail.process_images = clubDetail.images.split(';')
        }
        this.setData({
          clubDetail: {
            ...clubDetail,
            leader_name: clubDetail.leader_username
          },
          pendingApplications: applicationsRes.Flag == 4000 ? applicationsRes.data : [],
          isLoading: false,
          isEmpty: false
        });
      } else {
        this.setData({
          isLoading: false,
          isEmpty: true
        });
        this.showErrorToast('加载协会信息失败');
      }
    } catch (error) {
      console.error('加载协会数据失败:', error);
      this.setData({
        isLoading: false,
        isEmpty: true
      });
      this.showErrorToast('加载失败');
    }
  },

  // 轮播图切换
  onSwiperChange(e) {
    this.setData({
      currentImageIndex: e.detail.current
    });
  },

  // 预览图片
  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    const images = this.data.clubDetail.process_images || [];
    
    wx.previewImage({
      current: url,
      urls: images
    });
  },


  // 编辑协会简介
  editDescription() {
    this.setData({
      tempDescription: this.data.clubDetail.description || '',
      showDescriptionPopup: true
    });
  },

  closeDescriptionPopup() {
    this.setData({
      showDescriptionPopup: false,
      tempDescription: ''
    });
  },

  onTempDescriptionChange(event) {
    this.setData({
      tempDescription: event.detail
    });
  },

  async confirmDescription() {
    if (!this.data.tempDescription.trim()) {
      this.showErrorToast('请输入协会简介');
      return;
    }

    this.setData({ saving: true });

    try {
      await this.handleApiCall(
        this.request({
          url: `/club/${this.data.clubId}/description/upload`,
          method: 'POST',
          data: {
            description: this.data.tempDescription
          }
        }),
        '简介更新成功',
        '简介更新失败'
      );

      // 更新本地数据
      this.setData({
        'clubDetail.description': this.data.tempDescription,
        showDescriptionPopup: false,
        tempDescription: '',
        saving: false
      });
    } catch (error) {
      this.setData({ saving: false });
    }
  },

  // 编辑协会章程
  editCharter() {
    this.setData({
      tempCharter: this.data.clubDetail.charter || '',
      showCharterPopup: true
    });
  },

  closeCharterPopup() {
    this.setData({
      showCharterPopup: false,
      tempCharter: ''
    });
  },

  onTempCharterChange(event) {
    this.setData({
      tempCharter: event.detail
    });
  },

  async confirmCharter() {
    if (!this.data.tempCharter.trim()) {
      this.showErrorToast('请输入协会章程');
      return;
    }

    this.setData({ saving: true });

    try {
      // 计算章程哈希值（简化版）
      const charterHash = this.calculateSimpleHash(this.data.tempCharter);
      
      await this.handleApiCall(
        this.request({
          url: `/club/${this.data.clubId}/charter/upload`,
          method: 'POST',
          data: {
            charter: this.data.tempCharter,
            charter_hash: charterHash
          }
        }),
        '章程更新成功',
        '章程更新失败'
      );

      // 更新本地数据
      this.setData({
        'clubDetail.charter': this.data.tempCharter,
        showCharterPopup: false,
        tempCharter: '',
        saving: false
      });
    } catch (error) {
      this.setData({ saving: false });
    }
  },

  // 简单哈希计算（实际项目中应使用更安全的哈希算法）
  calculateSimpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash).toString(16);
  },
  // 显示图片管理弹窗
  showImageDialog() {
    this.setData({
      showImageDialog: true
    });
  },

  // 关闭图片管理弹窗
  closeImageDialog() {
    this.setData({
      showImageDialog: false
    });
  },

  // 阻止弹窗关闭（用于拖拽组件事件）
  preventClose(e) {
    // 阻止事件冒泡，防止弹窗关闭
    return false;
  },

  // 保存图片修改
  async saveImageChanges(e) {
    const uploadTasks = [];
    // 获取拖拽图片组件
    const dragComponent = this.selectComponent(`#drag-img-${this.data.clubId}`);
    if (!dragComponent || dragComponent.data.dragImgList.length === 0) {
      wx.showToast({ 
        title: '必须有一张图片作为封面', 
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    // 上传新图片
    for (const pic of dragComponent.data.dragImgList) {
      if (pic.src.includes('tmp')) {           
        // 设置图片为加载状态
        dragComponent.setImageLoading(pic.src);
        
        // 添加上传任务到数组
        uploadTasks.push(
          (async () => {
            try {
              const result = await this.uploadImage(pic.src);
              dragComponent.updateImageUrl(pic.src, result.url);
              dragComponent.updateImageLabel(pic.src);
            } catch (error) {
              dragComponent.delImageLoading(pic.src);
              console.error('上传图片失败:', error);
              throw error;
            }
          })()
        );
      }
    }
    
    try {
      // 等待所有任务完成
      await Promise.all(uploadTasks);
      
      // 按顺序收集图片URL
      const sortedImages = [...dragComponent.data.dragImgList]
        .sort((a, b) => a.key - b.key)
        .map(img => img.src);
      const processImagesStr = sortedImages.join(';');
      // 保存到服务器
      wx.showLoading({ title: '保存中...' });
      await this.updateProcessImages(this.data.clubId, processImagesStr);
      wx.hideLoading();
      
      wx.showToast({ title: '保存成功', icon: 'success' });
      
      // 关闭图片弹窗
      this.closeImageDialog();
      
      // 刷新活动数据
      this.loadClubData(this.data.clubId);
    } catch (error) {
      console.error('保存过程中出错:', error);
      wx.hideLoading();
      wx.showToast({
        title: error.message || '保存失败，请重试', 
        icon: 'none',
        duration: 3000
      });
    }
  },

  // 上传单个图片
  async uploadImage(filePath) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: this.data.uploadAPI,
        filePath: filePath,
        name: 'file',
        header: {
          'Authorization': 'Bearer ' + this.data.token
        },
        dataType: 'json',
        success: (res) => {
          try {
            const data = JSON.parse(res.data);
            if (data.Flag === 4000) {
              resolve(data.data);
            } else {
              reject(new Error(data.Message || '上传失败'));
            }
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },

  // 更新活动过程图片
  async updateProcessImages(clubId, processImagesStr) {
    return this.request({
      url: `/club/${clubId}/update_process_images`,
      method: 'POST',
      data: {
        process_images: processImagesStr
      }
    });
  },

  // 管理会员
  async manageMembers() {
    wx.showLoading({ title: '加载中...' });
    
    try {
      const res = await this.request({
        url: `/club/${this.data.clubId}/members/management`,
        method: 'GET'
      });

      if (res.Flag == 4000) {
        this.setData({
          membersList: res.data.members,
          showMembersPopup: true
        });
      } else {
        this.showErrorToast('加载会员列表失败');
      }
    } catch (error) {
      this.showErrorToast('加载失败');
    } finally {
      wx.hideLoading();
    }
  },

  closeMembersPopup() {
    this.setData({
      showMembersPopup: false,
      membersList: []
    });
  },

  // 提拔会员
  async promoteMember(e) {
    const { memberid, userName } = e.currentTarget.dataset;
    
    const result = await wx.showModal({
      title: '确认提拔',
      content: `确定要将 ${userName} 提拔为会长吗？\n\n注意：您将自动卸任会长职务，成为普通会员。`,
      confirmText: '确认提拔',
      cancelText: '取消'
    });

    if (!result.confirm) return;

    try {
      wx.showLoading({ title: '处理中...' });
      
      const res = await this.request({
        url: `/club/${this.data.clubId}/members/${memberid}/promote`,
        method: 'POST'
      });

      if (res.Flag === '4000') {
        wx.showToast({
          title: '提拔成功',
          icon: 'success'
        });
   
        // 发送通知给新会长
        try {
          const message_data = {
            booker_id: memberid,
            url: `/packageClub/club-manage/index?clubId=${this.data.clubId}`,
            operation: 'promoted_to_admin',
            content: `恭喜您被提拔为${res.data.club_name}协会的会长，请尽快熟悉协会管理功能`
          };
          
          await app.message(message_data);
        } catch (error) {
          console.error('发送新会长通知失败:', error);
        }
        
        // 发送通知给所有协会成员（包括原会长）
        try {
          const message_data = {
            club_id: this.data.clubId,
            url: `/packageClub/club-detail/index?clubId=${this.data.clubId}`,
            operation: 'leadership_changed',
            content: `${res.data.new_admin.user_name}已成为${res.data.club_name}协会的新会长`
          };
          
          await app.message_for_club(message_data);
        } catch (error) {
          console.error('发送协会成员通知失败:', error);
        }
        // 延迟1000ms后跳转
        setTimeout(() => {
          wx.reLaunch({
            url: '/pages/home/index'
          });
        }, 1000);

      } else {
        wx.showToast({
          title: res.message || '提拔失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('提拔成员失败:', error);
      wx.showToast({
        title: '网络错误',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 移除会员
  async removeMember(e) {
    const { id } = e.currentTarget.dataset;
    
    wx.showModal({
      title: '确认移除',
      content: '确定要移除该会员吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await this.handleApiCall(
              this.request({
                url: `/club/${this.data.clubId}/deletemember/${memberid}`,
                method: 'DELETE'
              }),
              '移除成功',
              '移除失败'
            );

            // 重新加载会员列表
            this.manageMembers();
          } catch (error) {
            // 错误已在handleApiCall中处理
          }
        }
      }
    });
  },

  // 添加会员
  addMember() {
    this.setData({
      showAddMemberPopup: true,
      searchKeyword: '',
      searchResults: []
    });
  },

  closeAddMemberPopup() {
    this.setData({
      showAddMemberPopup: false,
      searchKeyword: '',
      searchResults: []
    });
  },

  // ========== Search Suggest 组件事件处理 ==========
  
  // 获取用户搜索建议（search_suggest组件专用）
  async onFetchMemberSuggestions(e) {
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
  async onMemberSearch(e) {
    const keyword = e.detail.value;
    await this.performMemberSearch(keyword);
  },

  // 选择搜索建议
  onSelectMemberSuggestion(e) {
    const { value, item } = e.detail;
    
    if (item.extra && item.extra.type === 'user') {
      // 直接添加用户到协会
      this.directAddUserToClub(item.extra.userId, item);
    } else {
      // 执行搜索
      this.performMemberSearch(value);
    }
  },

  // 选择历史记录
  onMemberHistorySelect(e) {
    const { value } = e.detail;
    this.performMemberSearch(value);
  },

  // 执行搜索的通用方法
  async performMemberSearch(keyword) {
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
        this.setData({
          searchResults: res.data.users
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

  // 直接添加用户到协会（来自建议选择）
  async directAddUserToClub(userId, userInfo) {
    try {
      await this.handleApiCall(
        this.request({
          url: `/club/${this.data.clubId}/addmember/${userId}`,
          method: 'POST'
        }),
        `成功添加用户：${userInfo.title}`,
        '添加失败'
      );

      // 刷新协会数据
      this.loadClubData(this.data.clubId);
      
      // 清空搜索组件的值
      const searchSuggest = this.selectComponent('#memberSearchSuggest');
      if (searchSuggest) {
        searchSuggest.clear();
      }
      
      // 成功添加用户后关闭弹窗
      this.closeAddMemberPopup();
    } catch (error) {
      // 错误已在handleApiCall中处理
    }
  },

  // ========== 保留原有搜索功能作为备用 ==========
  
  onSearchKeywordChange(event) {
    this.setData({
      searchKeyword: event.detail
    });
  },

  // 搜索用户（保留原有功能）
  async searchUsers() {
    if (!this.data.searchKeyword.trim()) {
      this.showErrorToast('请输入搜索关键词');
      return;
    }
    await this.performMemberSearch(this.data.searchKeyword);
  },

  // 添加用户到协会（从搜索结果列表）
  async addUserToClub(e) {
    const userId = e.currentTarget.dataset.id;
    const userInfo = this.data.searchResults.find(user => user.user_id === userId);
    
    if (!userInfo) {
      this.showErrorToast('用户信息不存在');
      return;
    }

    await this.directAddUserToClub(userId, userInfo);
  },

  // 返回上一页
  onClickLeft() {
    wx.navigateBack();
  }
}); 