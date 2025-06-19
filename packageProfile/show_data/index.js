// packageProfile/show_data/index.js
const app = getApp();

Page({

  /**
   * 页面的初始数据
   */
  data: {
    dataType: 'user', // 'user' 或 'event'
    pageTitle: '数据统计',
    loading: true,
    refreshing: false,
    error: null,
    
    // 统计摘要数据
    summaryData: {
      total_users: 0,
      total_clubs: 0,
      total_events: 0,
      total_members: 0,
      new_users_30_days: 0,
      new_clubs_30_days: 0,
      new_events_30_days: 0
    },
    
    // 用户统计数据
    userStats: {
      clubs: [],
      total_clubs: 0,
      total_members: 0
    },
    
    // 活动统计数据
    eventStats: {
      events: [],
      total_events: 0,
      total_participants: 0,
      total_checked_in: 0
    },
    
    // 图表数据
    pieChartData: [],
    barChartData: [],
    
    // 统计卡片数据
    statCards: []
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    const { type = 'user' } = options;
    const pageTitle = type === 'event' ? '活动数据统计' : '用户数据统计';
    
    this.setData({
      dataType: type,
      pageTitle
    });
    
    wx.setNavigationBarTitle({
      title: pageTitle
    });
    
    this.loadAllData();
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 页面显示时刷新数据
    if (this.data.dataType) {
      this.loadAllData();
    }
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    this.setData({ refreshing: true });
    this.loadAllData().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  },

  /**
   * 加载所有数据
   */
  async loadAllData() {
    this.setData({ loading: true, error: null });
    
    try {
      // 并行加载统计摘要和具体数据
      const [summaryResult, dataResult] = await Promise.all([
        this.loadSummaryData(),
        this.loadStatisticsData()
      ]);
      
      if (summaryResult && dataResult) {
        this.processChartData();
        this.processStatCards();
      }
    } catch (error) {
      console.error('加载数据失败:', error);
      this.setData({
        error: '加载数据失败，请稍后重试'
      });
    } finally {
      this.setData({ loading: false, refreshing: false });
    }
  },

  /**
   * 加载统计摘要数据
   */
  loadSummaryData() {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${app.globalData.request_url}/statistics/summary`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`
        },
        success: (res) => {
          if (res.statusCode === 200 && res.data.code === 200) {
            this.setData({
              summaryData: res.data.data
            });
            resolve(res.data.data);
          } else {
            reject(new Error(res.data.message || '获取摘要数据失败'));
          }
        },
        fail: (error) => {
          reject(error);
        }
      });
    });
  },

  /**
   * 加载统计数据
   */
  loadStatisticsData() {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${app.globalData.request_url}/statistics/show/${this.data.dataType}`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`
        },
        success: (res) => {
          if (res.statusCode === 200 && res.data.code === 200) {
            if (this.data.dataType === 'user') {
              this.setData({
                userStats: res.data.data
              });
            } else {
              this.setData({
                eventStats: res.data.data
              });
            }
            resolve(res.data.data);
          } else {
            reject(new Error(res.data.message || '获取统计数据失败'));
          }
        },
        fail: (error) => {
          reject(error);
        }
      });
    });
  },

  /**
   * 处理图表数据
   */
  processChartData() {
    if (this.data.dataType === 'user') {
      this.processUserChartData();
    } else {
      this.processEventChartData();
    }
  },

  /**
   * 处理用户图表数据
   */
  processUserChartData() {
    const { clubs } = this.data.userStats;
    
    // 饼图数据 - 协会会员分布
    const pieData = clubs.slice(0, 8).map(club => ({
      name: club.club_name,
      value: club.total_count
    }));
    
    // 柱状图数据 - 协会管理员vs普通会员
    const barData = clubs.slice(0, 6).map(club => ({
      name: club.club_name.length > 4 ? club.club_name.substr(0, 4) + '...' : club.club_name,
      value: club.admin_count
    }));
    
    this.setData({
      pieChartData: pieData,
      barChartData: barData
    });
  },

  /**
   * 处理活动图表数据
   */
  processEventChartData() {
    const { events } = this.data.eventStats;
    
    // 饼图数据 - 各协会活动数量分布
    const clubEventCount = {};
    events.forEach(event => {
      clubEventCount[event.club_name] = (clubEventCount[event.club_name] || 0) + 1;
    });
    
    const pieData = Object.entries(clubEventCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }));
    
    // 柱状图数据 - 活动参与度（签到人数）
    const barData = events
      .sort((a, b) => b.checked_in_count - a.checked_in_count)
      .slice(0, 6)
      .map(event => ({
        name: event.title.length > 6 ? event.title.substr(0, 6) + '...' : event.title,
        value: event.checked_in_count
      }));
    
    this.setData({
      pieChartData: pieData,
      barChartData: barData
    });
  },

  /**
   * 处理统计卡片数据
   */
  processStatCards() {
    let statCards = [];
    
    if (this.data.dataType === 'user') {
      const { userStats, summaryData } = this.data;
      statCards = [
        {
          title: '总协会数',
          value: userStats.total_clubs,
          unit: '个',
          icon: 'cluster-o',
          color: '#07c160',
          trend: summaryData.new_clubs_30_days > 0 ? 
            Math.round((summaryData.new_clubs_30_days / userStats.total_clubs) * 100) : 0
        },
        {
          title: '总会员数',
          value: userStats.total_members,
          unit: '人',
          icon: 'friends-o',
          color: '#1989fa',
          trend: summaryData.new_users_30_days > 0 ? 
            Math.round((summaryData.new_users_30_days / userStats.total_members) * 100) : 0
        },
        {
          title: '平均会员数',
          value: userStats.total_clubs > 0 ? Math.round(userStats.total_members / userStats.total_clubs) : 0,
          unit: '人/协会',
          icon: 'chart-trending-o',
          color: '#ff976a',
          trend: 0
        },
        {
          title: '新增会员',
          value: summaryData.new_users_30_days,
          unit: '人',
          icon: 'user-o',
          color: '#ee0a24',
          trend: 0
        }
      ];
    } else {
      const { eventStats, summaryData } = this.data;
      const avgParticipants = eventStats.total_events > 0 ? 
        Math.round(eventStats.total_participants / eventStats.total_events) : 0;
      const checkinRate = eventStats.total_participants > 0 ? 
        Math.round((eventStats.total_checked_in / eventStats.total_participants) * 100) : 0;
      
      statCards = [
        {
          title: '总活动数',
          value: eventStats.total_events,
          unit: '场',
          icon: 'calendar-o',
          color: '#07c160',
          trend: summaryData.new_events_30_days > 0 ? 
            Math.round((summaryData.new_events_30_days / eventStats.total_events) * 100) : 0
        },
        {
          title: '总参与人数',
          value: eventStats.total_participants,
          unit: '人次',
          icon: 'friends-o',
          color: '#1989fa',
          trend: 0
        },
        {
          title: '平均参与度',
          value: avgParticipants,
          unit: '人/场',
          icon: 'chart-trending-o',
          color: '#ff976a',
          trend: 0
        },
        {
          title: '签到率',
          value: checkinRate,
          unit: '%',
          icon: 'success',
          color: '#ee0a24',
          trend: checkinRate > 80 ? 5 : checkinRate < 60 ? -3 : 0
        }
      ];
    }
    
    this.setData({ statCards });
  },

  /**
   * 导出数据
   */
  onExportData() {
    wx.showLoading({
      title: '正在生成文件...'
    });

    wx.request({
      url: `${app.globalData.request_url}/statistics/export/${this.data.dataType}`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${wx.getStorageSync('token')}`,
        'Content-Type': 'application/json'
      },
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200 && res.data.code === 200) {
          wx.navigateTo({
            url: '/pages/webview/index?url=' + encodeURIComponent(res.data.data.download_url)
          });
          // 后端返回下载URL，直接下载文件
          this.downloadExcelFile(res.data.data);
        } else {
          console.error('导出失败:', res.data);
          wx.showModal({
            title: '导出失败',
            content: res.data.message || '生成文件失败，请稍后重试',
            showCancel: false,
            confirmText: '确定'
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('导出请求失败:', err);
        wx.showModal({
          title: '网络错误',
          content: '网络请求失败，请检查网络连接后重试',
          showCancel: false,
          confirmText: '确定'
        });
      }
    });
  },

  /**
   * 下载Excel文件
   */
  downloadExcelFile(fileData) {
    const { download_url, filename, file_size } = fileData;
    
    wx.showLoading({
      title: '正在下载文件...'
    });

    // 使用wx.downloadFile下载文件
    const downloadTask = wx.downloadFile({
      url: download_url,
      header: {
        'Authorization': `Bearer ${wx.getStorageSync('token')}`
      },
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode === 200) {
          // 下载成功，保存文件
          console.log('文件下载成功，临时路径:', res.tempFilePath);
          wx.navigateTo({
            url: '/pages/webview/index?url=' + encodeURIComponent(download_url)
          });
        wx.openDocument({
          filePath: res.tempFilePath,
          showMenu: true, // 显示右上角菜单，允许用户选择其他应用打开
        });
        } else {
          console.error('下载失败，状态码:', res.statusCode);
          wx.showModal({
            title: '下载失败',
            content: `下载失败，服务器返回状态码: ${res.statusCode}`,
            showCancel: false,
            confirmText: '确定'
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('下载失败:', err);
        wx.showModal({
          title: '下载失败',
          content: '文件下载失败，请检查网络连接或稍后重试',
          showCancel: false,
          confirmText: '确定'
        });
      }
    });

    // 监听下载进度
    downloadTask.onProgressUpdate((res) => {
      const progress = Math.round(res.progress);
      wx.showLoading({
        title: `下载中 ${progress}%`
      });
    });
  },


  /**
   * 切换数据类型
   */
  onSwitchDataType() {
    const newType = this.data.dataType === 'user' ? 'event' : 'user';
    const pageTitle = newType === 'event' ? '活动数据统计' : '用户数据统计';
    
    this.setData({
      dataType: newType,
      pageTitle
    });
    
    wx.setNavigationBarTitle({
      title: pageTitle
    });
    
    this.loadAllData();
  },

  /**
   * 图表点击事件
   */
  onPieChartTap(e) {
    wx.showToast({
      title: '饼图被点击',
      icon: 'none'
    });
  },

  onBarChartTap(e) {
    wx.showToast({
      title: '柱状图被点击',
      icon: 'none'
    });
  },

  /**
   * 统计卡片点击事件
   */
  onStatCardTap(e) {
    const { detail } = e;
    
    wx.showModal({
      title: detail.title,
      content: `当前值：${detail.value}${detail.unit}`,
      showCancel: false
    });
  }
})