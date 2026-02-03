const app = getApp()

/**
 * 所有协会活动数据Panel组件
 * 从packageShow/show-all-club-events页面转换而来
 */

Component({
  properties: {},

  data: {
    loading: true,
    downloading: false,
    events: [],
    totalEvents: 0,
    totalParticipants: 0,
    totalCheckedIn: 0,
    checkinRate: 0,
    clubEventChart: [],
    monthlyChart: [],
    budgetChart: [],
    checkinChart: [],
    hideCharts: false  // 用于在动画时隐藏图表
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
      this.fetchData();
      // 触发loaded事件
    this.triggerEvent('loaded');
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

      const response = await this.request('/statistics/show/all_club/all_event/details', 'GET')
      
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
        
        // 只显示最近20个活动
    const recentEvents = events.slice(0, 20)
        
        this.setData({
          events: recentEvents,
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
      } else {
        throw new Error(response.message || '获取数据失败')
      }
    } catch (error) {
      wx.showToast({
        title: error.message || '加载数据失败',
        icon: 'none'
      })
      this.setData({ loading: false })
    }
  },

  // 处理图表数据
  processChartData(events) {
    // 按协会统计活动数量
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

    events.forEach(event => {
      // 协会活动统计
    const clubName = event.club.club_name || '未知协会'
      clubStats[clubName] = (clubStats[clubName] || 0) + 1
      
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
      
      // 协会签到率统计
    if (!clubCheckinStats[clubName]) {
        clubCheckinStats[clubName] = { total: 0, checkedIn: 0 }
      }
      clubCheckinStats[clubName].total += event.total_participants
      clubCheckinStats[clubName].checkedIn += event.checked_in_count
    })

    // 协会活动数量柱状图（前10名）
    const clubEventChart = Object.entries(clubStats)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([name, value]) => ({
        name: name.length > 6 ? name.substring(0, 6) + '...' : name,
        value
      }))

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

    // 协会签到率对比（前8名，至少有参与者的协会）
    const checkinChart = Object.entries(clubCheckinStats)
      .filter(([, stats]) => stats.total > 0)
      .map(([name, stats]) => ({
        name: name.length > 6 ? name.substring(0, 6) + '...' : name,
        value: Math.round(stats.checkedIn / stats.total * 100)
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

  // 下载Excel
  async downloadExcel() {
    this.setData({ downloading: true })
    wx.showLoading({
      title: '正在生成Excel文件...'
    })
    
    const token = wx.getStorageSync('token')
    const response = await this.request('/statistics/export/all_club/all_event/details', 'GET')
    
    if (response.code === 200) {
      const downloadUrl = response.data.download_url
      const filename = response.data.filename
      
      wx.hideLoading()
      wx.showToast({
        title: '开始下载',
        icon: 'none'
      })
      
      // 下载文件 - 为Excel文件添加Authorization头
    const downloadTask = wx.downloadFile({
        url: downloadUrl,
        header: {
          'Authorization': `Bearer ${token}`
        },
        success: (res) => {
          if (res.statusCode == 200) {
            // 保存到相册或打开文件
            wx.openDocument({
              filePath: res.tempFilePath,
              fileType: 'xlsx',
              showMenu: true
            })
          } else {
            wx.showToast({
              title: `文件下载失败 (${res.statusCode})`,
              icon: 'none'
            })
          }
        },
        fail: (err) => {
          console.error('下载失败:', err)
          wx.showToast({
            title: '文件下载失败',
            icon: 'none'
          })
        }
      })
      downloadTask.onProgressUpdate((res) => {
        wx.showLoading({
          title: `下载中: ${res.progress}%`,
          mask: true
        })
        if (res.progress === 100) {
          
          this.setData({ downloading: false })
          wx.showToast({
            title: '下载完成，正在打开',
            icon: 'success'
          })           
          wx.hideLoading()
        }
      })

    } else {
      throw new Error(response.message || '生成Excel失败')
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