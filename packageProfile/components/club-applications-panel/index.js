const app = getApp();
const { getDefaultAvatarUrl } = require('../../../utils/default-avatar');
const { runPanelLoad, emitPanelLoaded } = require('../../../components/panel-loading-transition/run-load');

/**
 * 入会审批Panel组件
 * 从packageClub/club-applications页面转换而来
 */

Component({
  properties: {
    clubId: {
      type: String,
      value: '',
    },
    /** 每页条数，默认 10，最大 50（与后端 get_event_timeline 上限一致） */
    listPageSize: {
      type: Number,
      value: 10,
    },
  },

  data: {
    pltCommand: '',
    allApplications: [],
    applicationsCurrentPage: 0,
    applicationsTotalPages: 1,
    applicationsTotalRecords: 0,
    applicationsListLoading: false,
    applicationsListLoadingMore: false,
    applicationsListEnd: false,
    currentProcessingId: null,
    showApproveDialog: false,
    showRejectDialog: false,
    approveOpinion: '',
    rejectOpinion: '',
    isLoading: false,
    defaultAvatarUrl: getDefaultAvatarUrl(),
  },

  lifetimes: {
    attached() {
      try {
        const base = app.globalData && app.globalData.static_url
        if (base) {
          this.setData({ defaultAvatarUrl: `${base}/assets/default_avatar.webp` })
        }
      } catch (e) {}
    },
  },

  methods: {
    onApproveOpinionChange(e) {
      const v = e?.detail?.value ?? e?.detail?.value ?? e?.detail ?? ''
      this.setData({ approveOpinion: v })
    },

    onRejectOpinionChange(e) {
      const v = e?.detail?.value ?? e?.detail?.value ?? e?.detail ?? ''
      this.setData({ rejectOpinion: v })
    },

    /**
     * 供外部调用的数据加载方法
     */
    onPanelLoadTransitionDone() {
      emitPanelLoaded(this);
    },

    loadData() {
      return runPanelLoad(this, {
        shouldFetch: () => !!this.properties.clubId,
        fetch: () => this.fetchApplications(true, { silent: true }),
      });
    },

    onApplicationsScrollToLower() {
      if (this.data.applicationsListLoading || this.data.applicationsListLoadingMore) return
      if (this.data.applicationsListEnd) return
      if (this.data.applicationsCurrentPage >= this.data.applicationsTotalPages) return
      this.fetchApplications(false);
    },

    /** 仅阻止冒泡到行内其它区域 */
    stopBubble() {},

    decorateApplicationAxis(rawDate) {
      const d = rawDate ? new Date(rawDate) : null
      if (!d || Number.isNaN(d.getTime())) return { axis_date: '', axis_time: '' }
      const pad2 = (n) => String(n).padStart(2, '0')
      return {
        axis_date: `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
        axis_time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
      }
    },

    buildUserProfileLine(item) {
      const parts = []
      if (item.appliced_user_department) parts.push(item.appliced_user_department)
      if (item.appliced_user_position) parts.push(item.appliced_user_position)
      const gender = item.appliced_user_gender || this.formatGenderLabel(item.appliced_user_gender_code)
      if (gender) parts.push(gender)
      return parts.join(' · ')
    },

    formatGenderLabel(gender) {
      if (gender === 1 || gender === '1') return '男'
      if (gender === 2 || gender === '2') return '女'
      if (gender === 0 || gender === '0') return '其他'
      return ''
    },

    formatApplicationItem(item) {
      const rawAppDate = item.applicatedDate
      const axis = this.decorateApplicationAxis(rawAppDate)
      const applicatedDate = rawAppDate ? this.formatDate(rawAppDate) : ''
      const processedDate = item.processedDate ? this.formatDate(item.processedDate) : ''
      const processed = Boolean(processedDate)
      const mainClass = processed
        ? item.approved
          ? 'tl-modal-main--milestone-start'
          : 'tl-modal-main--milestone-rejected'
        : 'tl-modal-main--milestone-pending'
      const userProfileLine = this.buildUserProfileLine(item)
      return {
        ...item,
        applicatedDate,
        processedDate,
        axis_date: axis.axis_date,
        axis_time: axis.axis_time,
        userProfileLine,
        mainClass,
      }
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

    /**
     * @param {boolean} reset true 从第一页重拉；false 下一页追加
     */
    async fetchApplications(reset = false, options = {}) {
      const silent = !!options.silent
      const clubId = this.properties.clubId
      if (!clubId) return

      if (this._applicationsPagingLock) return
      const pageSize = Math.min(50, Math.max(1, Math.floor(Number(this.properties.listPageSize) || 10)))
      const nextPage = reset ? 1 : this.data.applicationsCurrentPage + 1
      if (!reset) {
        if (this.data.applicationsCurrentPage >= this.data.applicationsTotalPages) return
        if (this.data.applicationsListEnd) return
      }

      this._applicationsPagingLock = true
      if (reset) {
        this.setData({
          ...(silent ? {} : { isLoading: true, applicationsListLoading: true }),
          applicationsCurrentPage: 0,
          applicationsTotalPages: 1,
          applicationsTotalRecords: 0,
          allApplications: [],
          applicationsListEnd: false,
        })
      } else {
        this.setData({ applicationsListLoadingMore: true })
      }

      try {
        const allRes = await this.request({
          url: `/club/application/${clubId}/list?page=${nextPage}&page_size=${pageSize}`,
          method: 'GET',
        })

        if (allRes.Flag == '4000') {
          const payload = allRes.data || {}
          const rawList = Array.isArray(payload.items)
            ? payload.items
            : Array.isArray(payload)
              ? payload
              : []
          const pagination = payload.pagination || {}
          const totalRecordsRaw = Number(pagination.total_records)
          const safeTotal = Number.isFinite(totalRecordsRaw) ? totalRecordsRaw : rawList.length
          const totalPagesRaw = Number(pagination.total_pages)
          const totalPages = Number.isFinite(totalPagesRaw)
            ? Math.max(1, totalPagesRaw)
            : Math.max(1, Math.ceil((safeTotal || 0) / pageSize) || 1)
          const currentPageRaw = Number(pagination.current_page)
          const currentPage = Number.isFinite(currentPageRaw)
            ? Math.max(1, currentPageRaw)
            : nextPage

          const formattedBatch = rawList.map((item) => this.formatApplicationItem(item))
          const merged = reset ? formattedBatch : (this.data.allApplications || []).concat(formattedBatch)
          const listEnd = currentPage >= totalPages || merged.length >= safeTotal

          this.setData({
            allApplications: merged,
            applicationsCurrentPage: currentPage,
            applicationsTotalPages: totalPages,
            applicationsTotalRecords: safeTotal,
            applicationsListEnd: listEnd,
          })
        } else {
          wx.showToast({
            title: allRes.message || '获取申请列表失败',
            icon: 'none',
          })
        }
      } catch (error) {
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none',
        })
        console.error('获取申请列表失败:', error)
      } finally {
        this._applicationsPagingLock = false
        if (!silent) {
          this.setData({
            isLoading: false,
            applicationsListLoading: false,
            applicationsListLoadingMore: false,
          })
        } else {
          this.setData({
            applicationsListLoadingMore: false,
          })
        }
      }
    },

    // 显示批准对话框（data-application-id → dataset.applicationId）
    showApproveDialog(e) {
      const applicationId =
        e.currentTarget?.dataset?.applicationId ??
        e.currentTarget?.dataset?.applicationid;
      if (applicationId == null || applicationId === '') {
        wx.showToast({ title: '缺少申请ID', icon: 'none' });
        return;
      }
      this.setData({
        currentProcessingId: applicationId,
        showApproveDialog: true,
        approveOpinion: '',
      });
    },

    // 显示拒绝对话框
    showRejectDialog(e) {
      const applicationId =
        e.currentTarget?.dataset?.applicationId ??
        e.currentTarget?.dataset?.applicationid;
      if (applicationId == null || applicationId === '') {
        wx.showToast({ title: '缺少申请ID', icon: 'none' });
        return;
      }
      this.setData({
        currentProcessingId: applicationId,
        showRejectDialog: true,
        rejectOpinion: '',
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
      const reason = String(this.data.rejectOpinion || '').trim();
      if (!reason) {
        wx.showToast({ title: '请输入拒绝理由', icon: 'none' });
        // t-dialog 点确定会自动关闭，校验失败时重新打开
        setTimeout(() => {
          this.setData({ showRejectDialog: true, currentProcessingId: applicationId });
        }, 0);
        return;
      }
      await this.processApplication(applicationId, 'rejected', reason);
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
        if (res.Flag == '4000') {
          wx.showToast({
            title: operation === 'approved' ? '已批准' : '已拒绝',
            icon: 'success'
          });

          // 站内信失败不影响审批结果
          try {
            if (res.data && res.data.approved) {
              const message_data = {
                booker_id: res.data.appliced_user_id,
                url: `/packageClub/club-joined/index?clubId=${res.data.club_id}`,
                operation: 'application_processed',
                text: '您加入' + res.data.club_name + '协会的申请已被批准，现在您可以参与协会活动了',
                media: res.data.club_cover
                  ? app.convertToThumbnailUrl(res.data.club_cover, 300)
                  : undefined,
              };
              await app.message(message_data);
            } else if (res.data) {
              const message_data = {
                booker_id: res.data.appliced_user_id,
                url: `/packageClub/club-detail/index?clubId=${res.data.club_id}`,
                operation: 'application_processed',
                text: '您加入' + res.data.club_name + '协会的申请被拒绝，理由：' + (res.data.opinion || ''),
              };
              await app.message(message_data);
            }
          } catch (msgErr) {
            console.warn('application message notify failed', msgErr);
          }

          await this.fetchApplications(true);

          // 触发更新事件，通知父组件刷新角标等
          this.triggerEvent('update');
        } else {
          wx.showToast({
            title: res.message || res.Message || '操作失败',
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
