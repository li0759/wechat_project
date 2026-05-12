const app = getApp()

/**
 * 单个协会活动统计Panel组件
 * 从packageShow/show-club-events页面转换而来
 */

Component({
  properties: {
    clubId: {
      type: Number,
      value: null
    }
  },

  data: {
    loading: true,
    downloading: false,
    clubInfo: null,
    totalEvents: 0,
    totalParticipants: 0,
    totalCheckedIn: 0,
    checkinRate: 0,
    monthlyChart: [],
    budgetChart: [],
    checkinChart: [],
    hideCharts: false,
    startDate: '',
    endDate: ''
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
        this.fetchData();
        // 触发loaded事件
    this.triggerEvent('loaded');
      } else {
        this.triggerEvent('loaded');
      }
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
      const { startDate, endDate } = this.data
      if (!startDate || !endDate) {
        return
      }

      if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
        wx.showToast({
          title: '结束日期不能早于开始日期',
          icon: 'none'
        })
        return
      }

      this.fetchData()
    },

  // 加载数据
  async fetchData() {
    try {
      this.setData({ loading: true })
      
      const token = wx.getStorageSync('token')
      if (!token) {
        wx.showToast({
          title: '请先登录',
          icon: 'none'
        })
        wx.navigateTo({ url: '/pages/login/index' })
        return
      }

      const requestData = {}
      const { startDate, endDate } = this.data
      if (startDate && endDate) {
        requestData.start_date = startDate
        requestData.end_date = endDate
      }

      const response = await this.request(`/statistics/show/club/${this.properties.clubId}/all_event/details`, 'GET', requestData)
      
      if (response.code === 200) {
        const data = response.data
        
        // 基础统计数据
        const events = data.events || []
        const totalEvents = data.total_events || 0
        const totalParticipants = data.total_participants || 0
        const totalCheckedIn = data.total_checked_in || 0
        const checkinRate = totalParticipants > 0 ? Math.round(totalCheckedIn / totalParticipants * 100) : 0
        
        // 处理图表数据
        const chartData = this.processChartData(events)
        
        this.setData({
          clubInfo: data.club,
          totalEvents,
          totalParticipants,
          totalCheckedIn,
          checkinRate,
          monthlyChart: chartData.monthlyChart,
          budgetChart: chartData.budgetChart,
          checkinChart: chartData.checkinChart,
          loading: false
        })
      } else {
        throw new Error(response.message || '获取数据失败')
      }
    } catch (error) {
      console.error('加载数据失败:', error)
      wx.showToast({
        title: error.message || '加载数据失败',
        icon: 'none'
      })
      this.setData({ loading: false })
    }
  },

  // 处理图表数据
  processChartData(events) {
    const monthStats = {}
    const budgetRanges = {
      '0-100': 0,
      '100-500': 0,
      '500-1000': 0,
      '1000-5000': 0,
      '5000+': 0
    }
    const checkinData = []

    events.forEach(event => {
      // 月度活动统计
    if (event.create_time) {
        const month = event.create_time.substring(0, 7) // YYYY-MM格式
        monthStats[month] = (monthStats[month] || 0) + 1
      }
      
      // 预算分布统计
    const budget = event.budget || 0
      if (budget === 0) {
        budgetRanges['0-100']++
      } else if (budget <= 100) {
        budgetRanges['0-100']++
      } else if (budget <= 500) {
        budgetRanges['100-500']++
      } else if (budget <= 1000) {
        budgetRanges['500-1000']++
      } else if (budget <= 5000) {
        budgetRanges['1000-5000']++
      } else {
        budgetRanges['5000+']++
      }
      
      // 活动签到情况（最近10个活动）
    if (checkinData.length < 10) {
        const rate = event.total_participants > 0 ? 
          Math.round(event.checked_in_count / event.total_participants * 100) : 0
        checkinData.push({
          name: event.title.length > 8 ? event.title.substring(0, 8) + '...' : event.title,
          value: rate
        })
      }
    })

    // 月度活动趋势图（最近6个月）
    const monthlyChart = Object.entries(monthStats)
      .sort(([a], [b]) => new Date(a) - new Date(b))
      .slice(-6)
      .map(([month, value]) => ({
        name: month.substring(5), // 只显示月份
        value
      }))

    // 预算分布饼图
    const budgetChart = Object.entries(budgetRanges)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({
        name: `¥${name}`,
        value
      }))

    return {
      monthlyChart,
      budgetChart,
      checkinChart: checkinData
    }
  },

  // 下载Excel
  async downloadExcel() {
    const { startDate, endDate } = this.data
    if (!startDate || !endDate) {
      wx.showToast({
        title: '请先选择开始和结束日期',
        icon: 'none'
      })
      return
    }

    this.setData({ downloading: true })
    wx.showLoading({
      title: '正在生成文件...'
    })
    
    try {
      const response = await this.request(`/statistics/export/club/${this.properties.clubId}/all_event/details/wecom_media`, 'GET', {
        start_date: startDate,
        end_date: endDate
      })

      if (response.code !== 200 || !response.data || !response.data.media_id) {
        throw new Error(response.message || '生成文件失败')
      }

      wx.showLoading({
        title: '正在发送到你本人企业微信...'
      })
      await this.sendWecomFileToSelf(response.data.media_id)
      wx.showToast({
        title: '已发送到你本人企业微信',
        icon: 'success'
      })
    } catch (error) {
      wx.showToast({
        title: error.message || '发送失败',
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