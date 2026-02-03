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
    events: [],
    totalEvents: 0,
    totalParticipants: 0,
    totalCheckedIn: 0,
    checkinRate: 0,
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

      const response = await this.request(`/statistics/show/club/${this.properties.clubId}/all_event/details`, 'GET')
      
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
          clubInfo: data.club,
          events: recentEvents,
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
    this.setData({ downloading: true })
    wx.showLoading({
      title: '正在生成Excel文件...'
    })
    
    const token = wx.getStorageSync('token')
    const response = await this.request(`/statistics/export/club/${this.properties.clubId}/all_event/details`, 'GET')
    
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
          if (res.statusCode === 200) {
            console.log('下载成功')
            console.log(res)
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