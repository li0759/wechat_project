const app = getApp()

Component({
  properties: {},

  data: {
    loading: true,
    downloading: false,
    totalEvents: 0,
    totalParticipants: 0,
    totalCheckedIn: 0,
    checkinRate: 0,
    clubEventChart: [],
    monthlyChart: [],
    budgetChart: [],
    checkinChart: [],
    hideCharts: false,
    startDate: '',
    endDate: '',
    splitByClub: true
  },

  methods: {
    loadData() {
      this.fetchData()
      this.triggerEvent('loaded')
    },

    hideCharts() {
      this.setData({ hideCharts: true })
    },

    showCharts() {
      this.setData({ hideCharts: false })
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

    onSplitByClubChange(e) {
      const values = (e.detail && e.detail.value) || []
      this.setData({
        splitByClub: values.includes('split')
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

        const response = await this.request('/statistics/show/all_club/all_event/details', 'GET', requestData)
        if (response.code !== 200) {
          throw new Error(response.message || '获取数据失败')
        }

        const data = response.data || {}
        const events = data.events || []
        const totalEvents = data.total_events || 0
        const totalParticipants = data.total_participants || 0
        const totalCheckedIn = data.total_checked_in || 0
        const checkinRate = totalParticipants > 0 ? Math.round(totalCheckedIn / totalParticipants * 100) : 0
        const chartData = this.processChartData(events)

        this.setData({
          totalEvents,
          totalParticipants,
          totalCheckedIn,
          checkinRate,
          clubEventChart: chartData.clubEventChart,
          monthlyChart: chartData.monthlyChart,
          budgetChart: chartData.budgetChart,
          checkinChart: chartData.checkinChart,
          loading: false
        })
      } catch (error) {
        wx.showToast({
          title: error.message || '加载数据失败',
          icon: 'none'
        })
        this.setData({ loading: false })
      }
    },

    processChartData(events) {
      const clubStats = {}
      const monthStats = {}
      const budgetRanges = {
        '0-100': 0,
        '100-500': 0,
        '500-1000': 0,
        '1000-5000': 0,
        '5000+': 0
      }
      const clubCheckinStats = {}

      events.forEach((event) => {
        const clubName = event.club && event.club.club_name ? event.club.club_name : '未知协会'
        clubStats[clubName] = (clubStats[clubName] || 0) + 1

        if (event.create_time) {
          const month = event.create_time.substring(0, 7)
          monthStats[month] = (monthStats[month] || 0) + 1
        }

        const budget = Number(event.budget || 0)
        if (budget <= 100) {
          budgetRanges['0-100'] += 1
        } else if (budget <= 500) {
          budgetRanges['100-500'] += 1
        } else if (budget <= 1000) {
          budgetRanges['500-1000'] += 1
        } else if (budget <= 5000) {
          budgetRanges['1000-5000'] += 1
        } else {
          budgetRanges['5000+'] += 1
        }

        if (!clubCheckinStats[clubName]) {
          clubCheckinStats[clubName] = { total: 0, checkedIn: 0 }
        }
        clubCheckinStats[clubName].total += Number(event.total_participants || 0)
        clubCheckinStats[clubName].checkedIn += Number(event.checked_in_count || 0)
      })

      const clubEventChart = Object.entries(clubStats)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name, value]) => ({
          name: name.length > 6 ? `${name.substring(0, 6)}...` : name,
          value
        }))

      const monthlyChart = Object.entries(monthStats)
        .sort(([a], [b]) => new Date(a) - new Date(b))
        .slice(-6)
        .map(([month, value]) => ({
          name: month.substring(5),
          value
        }))

      const budgetChart = Object.entries(budgetRanges)
        .filter(([, value]) => value > 0)
        .map(([name, value]) => ({
          name: `¥${name}`,
          value
        }))

      const checkinChart = Object.entries(clubCheckinStats)
        .filter(([, stats]) => stats.total > 0)
        .map(([name, stats]) => ({
          name: name.length > 6 ? `${name.substring(0, 6)}...` : name,
          value: Math.round((stats.checkedIn / stats.total) * 100)
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)

      return {
        clubEventChart,
        monthlyChart,
        budgetChart,
        checkinChart
      }
    },

    async downloadCharts() {
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
        const response = await this.request('/statistics/export/all_club/all_event/details/wecom_media', 'GET', {
          start_date: startDate,
          end_date: endDate,
          split_by_club: this.data.splitByClub ? 1 : 0
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

    request(url, method = 'GET', data = {}) {
      return new Promise((resolve, reject) => {
        const token = wx.getStorageSync('token')
        wx.request({
          url: app.globalData.request_url + url,
          method,
          data,
          header: {
            'Content-Type': 'application/json',
            Authorization: token ? `Bearer ${token}` : ''
          },
          success: (res) => {
            if (res.statusCode === 200) {
              resolve(res.data)
            } else {
              reject(new Error(`请求失败: ${res.statusCode}`))
            }
          },
          fail: () => {
            reject(new Error('网络请求失败'))
          }
        })
      })
    }
  }
})