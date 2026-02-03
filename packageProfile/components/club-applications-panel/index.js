const app = getApp();
import Dialog from '@vant/weapp/dialog/dialog';

/**
 * 入会审批Panel组件
 * 从packageClub/club-applications页面转换而来
 */

Component({
  properties: {
    clubId: {
      type: String,
      value: ''
    }
  },

  data: {
    allApplications: [],
    currentProcessingId: null,
    showApproveDialog: false,
    showRejectDialog: false,
    approveOpinion: '',
    rejectOpinion: '',
    isLoading: false
  },

  lifetimes: {
    attached() {
      // 组件初始化，但不加载数据
  }
  },

  methods: {
    /**
     * 供外部调用的数据加载方法
     */
    loadData() {
      if (this.properties.clubId) {
        this.fetchApplications();
        // 触发loaded事件
    this.triggerEvent('loaded');
      } else {
        this.triggerEvent('loaded');
      }
    },

    // 切换展开/折叠状态
  toggleExpand(e) {
      const index = e.currentTarget.dataset.index;
      const applications = this.data.allApplications;
      
      applications[index].expanded = !applications[index].expanded;
      
      this.setData({
        allApplications: applications
      });
    },

    // 阻止事件冒泡
  stopPropagation(e) {
      // 阻止事件冒泡，避免触发展开/折叠
  },

    // 统一请求方法
  request(options) {
      return new Promise((resolve, reject) => {
        wx.request({
          url: app.globalData.request_url + options.url,
          method: options.method || 'GET',
          header: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + wx.getStorageSync('token')
          },
          data: options.data,
          success(res) {
            resolve(res.data);
          },
          fail(err) {
            reject(err);
          }
        });
      });
    },

    // 获取申请列表数据
    async fetchApplications() {
      this.setData({ isLoading: true });
      const clubId = this.properties.clubId;
      
      try {
        // 获取所有申请
    const allRes = await this.request({
          url: `/club/application/${clubId}/list`,
          method: 'GET'
        });
        
        if (allRes.Flag === '4000') {
          // 格式化日期并添加展开状态
    let formattedData = allRes.data.map(item => {
            return {
              ...item,
              applicatedDate: item.applicatedDate ? this.formatDate(item.applicatedDate) : '',
              processedDate: item.processedDate ? this.formatDate(item.processedDate) : '',
              expanded: false // 默认为折叠状态
  };
          });
          
          // 按申请时间排序（从新到旧）
          formattedData.sort((a, b) => {
            return new Date(b.applicatedDate) - new Date(a.applicatedDate);
          });
          
          // 将已处理的申请排到后面
          formattedData.sort((a, b) => {
            if (a.processedDate && !b.processedDate) return 1;
            if (!a.processedDate && b.processedDate) return -1;
            return 0;
          });
          this.setData({
            allApplications: formattedData
          });
        } else {
          wx.showToast({
            title: allRes.message || '获取申请列表失败',
            icon: 'none'
          });
        }
      } catch (error) {
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none'
        });
        console.error('获取申请列表失败:', error);
      } finally {
        this.setData({ isLoading: false });
      }
    },

    // 显示批准对话框
  showApproveDialog(e) {
      const applicationId = e.currentTarget.dataset.applicationid;
      
      this.setData({
        currentProcessingId: applicationId,
        showApproveDialog: true,
        approveOpinion: ''
      });
    },

    // 显示拒绝对话框
  showRejectDialog(e) {
      const index = e.currentTarget.dataset.applicationid;
      
      this.setData({
        currentProcessingId: index,
        showRejectDialog: true,
        rejectOpinion: ''
      });
    },

    // 关闭对话框
  closeDialog() {
      this.setData({
        showApproveDialog: false,
        showRejectDialog: false,
        currentProcessingId: null,
        approveOpinion: '',
        rejectOpinion: ''
      });
    },

    // 处理批准申请
    async handleApprove() {
      if (!this.data.currentProcessingId) return;
      const applicationId = this.data.currentProcessingId;
      
      await this.processApplication(applicationId, 'approved', this.data.approveOpinion);
    },

    // 处理拒绝申请
    async handleReject() {
      if (!this.data.currentProcessingId) return;
      const applicationId = this.data.currentProcessingId;
      
      await this.processApplication(applicationId, 'rejected', this.data.rejectOpinion);
    },

    // 处理申请（批准/拒绝）
    async processApplication(applicationId, operation, opinion) {
      wx.showLoading({
        title: '处理中...',
      });
      
      try {
        const res = await this.request({
          url: `/club/application/${applicationId}/processed/${operation}`,
          method: 'POST',
          data: {
            opinion: opinion
          }
        });
        if (res.Flag === '4000') {
          wx.showToast({
            title: operation === 'approved' ? '已批准' : '已拒绝',
            icon: 'success'
          });

          // 如果是批准申请，发送通知消息
    if (res.data.approved && res.data) {
            const message_data = {
              booker_id: res.data.appliced_user_id,
              url: `/packageClub/club-joined/index?clubId=${res.data.club_id}`,
              operation: 'application_processed',
              text: '您加入' + res.data.club_name + '协会的申请已被批准，现在您可以参与协会活动了',
              media: app.convertToThumbnailUrl(res.data.club_cover, 300)
            };
            
            await app.message(message_data);
          } else if (res.data) {
            const message_data = {
              booker_id: res.data.appliced_user_id,
              url: `/packageClub/club-detail/index?clubId=${res.data.club_id}`,
              operation: 'application_processed',
              text: '您加入' + res.data.club_name + '协会的申请被拒绝，理由：' + res.data.opinion
            };
            
            await app.message(message_data);
          }
          
          this.fetchApplications();
          
          // 触发更新事件，通知父组件刷新数据
    this.triggerEvent('update');
        } else {
          wx.showToast({
            title: res.message || '操作失败',
            icon: 'none'
          });
        }
      } catch (error) {
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none'
        });
        console.error('处理申请失败:', error);
      } finally {
        wx.hideLoading();
        this.closeDialog();
      }
    },

    // 格式化日期
  formatDate(dateString) {
      if (!dateString) return '';
      
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    }
  }
});
