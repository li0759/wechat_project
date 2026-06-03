const app = getApp();
const { runPanelLoad, emitPanelLoaded } = require('../../../components/panel-loading-transition/run-load');

/**
 * 我的入会申请 Panel 组件
 */

Component({

  properties: {},

  data: {
    pltCommand: '',
    applications: [],
    listLoading: false,
    currentWithdrawId: null,
    withdrawDialogVisible: false,
    defaultClubCoverUrl: '/assets/images/default-club.png',
  },

  lifetimes: {
    attached() {
      try {
        const base = app.globalData && app.globalData.static_url;
        if (base) {
          this.setData({ defaultClubCoverUrl: `${base}/assets/default_club.webp` });
        }
      } catch (e) {}
    },
  },

  methods: {
    stopBubble() {},

    onPanelLoadTransitionDone() {
      emitPanelLoaded(this);
    },

    loadData() {
      return runPanelLoad(this, {
        fetch: () => this.fetchMyApplications({ silent: true }),
      });
    },

    decorateApplicationAxis(rawDate) {
      const d = rawDate ? new Date(rawDate) : null;
      if (!d || Number.isNaN(d.getTime())) return { axis_date: '', axis_time: '' };
      const pad2 = (n) => String(n).padStart(2, '0');
      return {
        axis_date: `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
        axis_time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
      };
    },

    formatApplicationItem(item) {
      const rawAppDate = item.applicatedDate;
      const axis = this.decorateApplicationAxis(rawAppDate);
      const applicatedDate = rawAppDate ? this.formatDate(rawAppDate) : '';
      const processedDate = item.processedDate ? this.formatDate(item.processedDate) : '';
      const processed = Boolean(processedDate);
      const mainClass = processed
        ? item.approved
          ? 'tl-modal-main--milestone-start'
          : 'tl-modal-main--milestone-rejected'
        : 'tl-modal-main--milestone-pending';
      const clubCoverRaw = item.club_cover || item.clubCover || '';
      const club_cover_thumb = clubCoverRaw
        ? app.convertToThumbnailUrl(clubCoverRaw, 300)
        : '';
      return {
        ...item,
        applicatedDate,
        processedDate,
        axis_date: axis.axis_date,
        axis_time: axis.axis_time,
        club_cover_thumb,
        mainClass,
      };
    },

    showWithdrawDialog(e) {
      const applicationId =
        e.currentTarget?.dataset?.applicationId ??
        e.currentTarget?.dataset?.applicationid;
      if (applicationId == null || applicationId === '') {
        wx.showToast({ title: '缺少申请编号', icon: 'none' });
        return;
      }
      this.setData({
        currentWithdrawId: applicationId,
        withdrawDialogVisible: true,
      });
    },

    closeDialog() {
      this.setData({
        withdrawDialogVisible: false,
        currentWithdrawId: null,
      });
    },

    async handleWithdraw() {
      if (!this.data.currentWithdrawId) return;

      const applicationId = this.data.currentWithdrawId;

      wx.showLoading({ title: '处理中…' });

      try {
        const res = await this.request({
          url: `/club/application/${applicationId}/delete`,
          method: 'GET',
        });

        if (res.Flag === '4000' || res.Flag === 4000) {
          wx.showToast({ title: '申请已撤回', icon: 'success' });
          await this.fetchMyApplications();
          this.triggerEvent('update');
        } else {
          wx.showToast({
            title: res.message || '撤回失败',
            icon: 'none',
          });
        }
      } catch (error) {
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none',
        });
      } finally {
        wx.hideLoading();
        this.closeDialog();
      }
    },

    request(options) {
      return new Promise((resolve, reject) => {
        wx.request({
          url: app.globalData.request_url + options.url,
          method: options.method || 'GET',
          header: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + wx.getStorageSync('token'),
          },
          data: options.data,
          success(res) {
            resolve(res.data);
          },
          fail(err) {
            reject(err);
          },
        });
      });
    },

    async fetchMyApplications(options = {}) {
      const silent = !!options.silent;
      if (!silent) {
        this.setData({ listLoading: true });
      }
      try {
        const res = await this.request({
          url: '/club/application/user_applicated/list',
          method: 'GET',
        });

        if (res.Flag === '4000' || res.Flag === 4000) {
          const rawList = Array.isArray(res.data) ? res.data : [];
          const formattedData = rawList.map((item) => this.formatApplicationItem(item));

          formattedData.sort((a, b) => {
            if (a.processedDate && !b.processedDate) return 1;
            if (!a.processedDate && b.processedDate) return -1;
            return new Date(b.applicatedDate) - new Date(a.applicatedDate);
          });

          this.setData({ applications: formattedData });
        } else if (res.Flag === '4004' || res.Flag === 4004) {
          this.setData({ applications: [] });
        } else {
          wx.showToast({
            title: res.message || '获取申请列表失败',
            icon: 'none',
          });
        }
      } catch (error) {
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none',
        });
      } finally {
        if (!silent) {
          this.setData({ listLoading: false });
        }
      }
    },

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
  },
});
