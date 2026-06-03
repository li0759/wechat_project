const app = getApp()
const { runPanelLoad, emitPanelLoaded } = require('../../../components/panel-loading-transition/run-load');

/**
 * 所有协会用户数据Panel组件
 * 从packageShow/show-all-club-users页面转换而来
 */

Component({

  properties: {},

  data: {
    pltCommand: '',
    loading: false,
    downloading: false,
    clubs: [],
    totalClubs: 0,
    totalMembers: 0,
    totalDynamics: 0,
    clubMemberChart: [],
    genderChart: [],
    unitChart: [],
    hideCharts: false,  // 用于在动画时隐藏图表
    splitByClub: true,
    startDate: '',
    endDate: '',
    activityStartDate: '',
    activityEndDate: ''
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
    onPanelLoadTransitionDone() {
      emitPanelLoaded(this)
    },

    loadData() {
      const { startDate, endDate, activityStartDate, activityEndDate } = this.data
      const ready = !!(startDate && endDate && activityStartDate && activityEndDate)
      return runPanelLoad(this, {
        shouldFetch: () => ready,
        fetch: () => this.fetchData({ silent: true }),
      })
    },

    /**
     * 隐藏图表（在动画时调用）
     */
    hideCharts() {
      this.setData({ hideCharts: true });
    },

    /**
     * 显示图表（动画结束后调用）
     */
    showCharts() {
      this.setData({ hideCharts: false });
    },

    onStartDateChange(e) {
      const startDate = e.detail.value
      this.setData({ startDate }, () => {
        this.tryReloadByDateRange()
      })
    },

    onEndDateChange(e) {
      const endDate = e.detail.value
      this.setData({ endDate }, () => {
        this.tryReloadByDateRange()
      })
    },

    tryReloadByDateRange() {
      const { startDate, endDate, activityStartDate, activityEndDate } = this.data
      if (!startDate || !endDate || !activityStartDate || !activityEndDate) {
        return
      }
      if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
        wx.showToast({
          title: '结束日期不能早于开始日期',
          icon: 'none'
        })
        return
      }
      if (new Date(activityStartDate).getTime() > new Date(activityEndDate).getTime()) {
        wx.showToast({
          title: '活动结束日期不能早于开始日期',
          icon: 'none'
        })
        return
      }
      this.fetchData()
    },

  // 加载数据
  async fetchData(options = {}) {
    const silent = !!options.silent
    try {
      if (!silent) {
        this.setData({ loading: true })
      }
      
      const token = wx.getStorageSync('token')
      if (!token) {
        wx.showToast({
          title: '请先登录',
          icon: 'none'
        })
        wx.navigateTo({ url: '/pages/login/index' })
        return
      }

      const response = await this.request('/statistics/show/all_club/users', 'GET', {
        start_date: this.data.startDate,
        end_date: this.data.endDate,
        activity_start_date: this.data.activityStartDate,
        activity_end_date: this.data.activityEndDate
      })
      
      if (response.code === 200) {
        const data = response.data
        
        // 基础统计数据
    const clubs = data.clubs || []
        const totalClubs = data.total_clubs || 0
        const totalMembers = data.total_members || 0
        const totalDynamics = data.total_dynamic_count || 0
        
        // 处理图表数据
    const chartData = this.processChartData(clubs)
        
        this.setData({
          clubs,
          totalClubs,
          totalMembers,
          totalDynamics,
          clubMemberChart: chartData.clubMemberChart,
          genderChart: chartData.genderChart,
          unitChart: chartData.unitChart,
          ...(silent ? {} : { loading: false }),
        })
      } else {
        throw new Error(response.message || '获取数据失败')
      }
    } catch (error) {
      wx.showToast({
        title: error.message || '加载数据失败',
        icon: 'none'
      })
      if (!silent) {
        this.setData({ loading: false })
      }
    }
  },

  // 处理图表数据
  processChartData(clubs) {
    // 协会会员数量柱状图数据
    const clubMemberChart = clubs.map(club => ({
      name: club.club_name.length > 6 ? club.club_name.substring(0, 6) + '...' : club.club_name,
      value: club.member_count
    })).sort((a, b) => b.value - a.value).slice(0, 10) // 取前10个

    // 性别分布统计
    const genderStats = {}
    const unitStats = {}
    
    clubs.forEach(club => {
      club.members.forEach(member => {
        // 性别统计
    const gender = member.gender || '未知'
        genderStats[gender] = (genderStats[gender] || 0) + 1
        
        // 单位统计
    const unit = member.unit_name || '未填写'
        unitStats[unit] = (unitStats[unit] || 0) + 1
      })
    })

    // 性别分布饼图数据
    const genderChart = Object.entries(genderStats).map(([name, value]) => ({
      name: name === '未知' ? '未填写' : name,
      value
    }))

    // 单位分布饼图数据（取前8名）
    const unitChart = Object.entries(unitStats)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 8)
      .map(([name, value]) => ({
        name: name.length > 8 ? name.substring(0, 8) + '...' : name,
        value
      }))

    return {
      clubMemberChart,
      genderChart,
      unitChart
    }
  },

  onSplitByClubChange(e) {
    const values = (e.detail && e.detail.value) || []
    this.setData({
      splitByClub: values.includes('split')
    })
  },

  onActivityStartDateChange(e) {
    this.setData({
      activityStartDate: e.detail.value
    }, () => {
      this.tryReloadByDateRange()
    })
  },

  onActivityEndDateChange(e) {
    this.setData({
      activityEndDate: e.detail.value
    }, () => {
      this.tryReloadByDateRange()
    })
  },

   // 导出并通过后端发送给当前用户本人企业微信
   async downloadExcel() {
    try {
      const { startDate, endDate, activityStartDate, activityEndDate } = this.data
      if (!startDate || !endDate || !activityStartDate || !activityEndDate) {
        wx.showToast({
          title: '请先选择4个时间',
          icon: 'none'
        })
        return
      }
      if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
        wx.showToast({
          title: '结束日期不能早于开始日期',
          icon: 'none'
        })
        return
      }
      if (new Date(activityStartDate).getTime() > new Date(activityEndDate).getTime()) {
        wx.showToast({
          title: '活动结束日期不能早于开始日期',
          icon: 'none'
        })
        return
      }

      this.setData({ downloading: true })
      wx.showLoading({
        title: '正在生成文件...'
      })
      
      const response = await this.request('/statistics/export/all_club/users/wecom_media', 'GET', {
        split_by_club: this.data.splitByClub ? 1 : 0,
        start_date: startDate,
        end_date: endDate,
        activity_start_date: activityStartDate,
        activity_end_date: activityEndDate
      })
      
      if (response.code !== 200) {
        throw new Error(response.message || '生成会话文件失败')
      }

      wx.hideLoading()
      const mediaId = response.data && response.data.media_id
      if (!mediaId) {
        throw new Error('服务端未返回 media_id')
      }
      wx.showLoading({
        title: '正在发送文件...'
      })
      await this.sendWecomFileToSelf(mediaId)
      wx.showToast({
        title: '已发送到你本人企业微信',
        icon: 'success'
      })
    } catch (error) {
      wx.showToast({
        title: error.message || '下载失败',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
      this.setData({ downloading: false })
    }
  },

  async sendWecomFileToSelf(mediaId) {
    const resp = await this.request('/statistics/wecom/send_media_to_self', 'POST', {
      media_id: mediaId
    })
    if (resp.code !== 200) {
      throw new Error(resp.message || '发送到本人失败')
    }
  },

    // 网络请求封装
  request(url, method = 'GET', data = {}) {
      return new Promise((resolve, reject) => {
        const token = wx.getStorageSync('token')
        
        wx.request({
          url: app.globalData.request_url + url,
          method,
          data,
          header: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
          },
          success: (res) => {
            if (res.statusCode === 200) {
              resolve(res.data)
            } else {
              reject(new Error(`请求失败: ${res.statusCode}`))
            }
          },
          fail: (err) => {
            console.error('请求失败:', err)
            reject(new Error('网络请求失败'))
          }
        })
      })
    }
  }
}) 