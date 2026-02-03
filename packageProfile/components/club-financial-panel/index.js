const app = getApp()

/**
 * 协会收支统计Panel组件
 * 从packageShow/show-club-financial页面转换而来
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
    financial: null,
    totalIncome: 0,
    totalExpenses: 0,
    netBalance: 0,
    clubFeeExpenses: 0,
    eventCostExpenses: 0,
    paygroupIncome: 0,
    incomeDetails: null,
    expenseDetails: null,
    monthlyStatistics: [],
    monthlyChart: [],
    incomeChart: [],
    expenseChart: [],
    monthlyIncomeChart: [],
    monthlyExpenseChart: [],
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

      const response = await this.request(`/statistics/show/club/${this.properties.clubId}/financial/statistics`, 'GET')
      
      if (response.code === 200) {
        const data = response.data
        
        // 基础统计数据
    const summary = data.summary || {}
        const incomeDetails = data.income_details || {}
        const expenseDetails = data.expense_details || {}
        const monthlyStatistics = data.monthly_statistics || []
        
        // 处理图表数据
    const chartData = this.processChartData(monthlyStatistics, incomeDetails, expenseDetails)
        
        // 数值验证辅助函数
    const validateNumber = (value) => {
          const num = parseFloat(value) || 0
          return isFinite(num) && !isNaN(num) ? num : 0
        }
        
        this.setData({
          clubInfo: data.club,
          financial: data,
          totalIncome: validateNumber(summary.total_income),
          totalExpenses: validateNumber(summary.total_expenses),
          netBalance: validateNumber(summary.net_balance),
          clubFeeExpenses: validateNumber(summary.club_fee_expenses),
          eventCostExpenses: validateNumber(summary.event_cost_expenses),
          paygroupIncome: validateNumber(summary.paygroup_income),
          incomeDetails,
          expenseDetails,
          monthlyStatistics,
          monthlyChart: chartData.monthlyChart,
          monthlyIncomeChart: chartData.monthlyIncomeChart,
          monthlyExpenseChart: chartData.monthlyExpenseChart,
          incomeChart: chartData.incomeChart,
          expenseChart: chartData.expenseChart,
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
  processChartData(monthlyStatistics, incomeDetails, expenseDetails) {
    // 数值验证辅助函数
    const validateNumber = (value) => {
      const num = parseFloat(value) || 0
      return isFinite(num) && !isNaN(num) ? Math.max(0, num) : 0
    }

    // 月度收支趋势图（最近6个月）
    // 创建三个不同的数据集：收入、支出、净收支
    const recentMonths = monthlyStatistics.slice(-6)
    
    // 为条形图创建净收支数据（只显示一个主要指标）
    const monthlyChart = recentMonths.map(item => ({
      name: item.month ? item.month.substring(5) : '', // 只显示月份
      value: validateNumber(Math.abs(item.net_balance)) // 使用绝对值避免负数问题
  }))

    // 如果需要显示收入和支出的对比，也可以创建收入数据
    const monthlyIncomeChart = recentMonths.map(item => ({
      name: item.month ? item.month.substring(5) : '',
      value: validateNumber(item.income)
    }))

    // 支出数据
    const monthlyExpenseChart = recentMonths.map(item => ({
      name: item.month ? item.month.substring(5) : '',
      value: validateNumber(item.expenses)
    }))

    // 收入构成饼图
    const incomeChart = []
    if (incomeDetails.paygroups && incomeDetails.paygroups.length > 0) {
      incomeDetails.paygroups.forEach(item => {
        const amount = validateNumber(item.paid_amount)
        if (amount > 0) {
          incomeChart.push({
            name: item.description || '缴费项目',
            value: amount
          })
        }
      })
    }

    // 支出构成饼图
    const expenseChart = []
    // 计算协会费用总额
    let clubFeeTotal = 0
    if (expenseDetails.club_fees && expenseDetails.club_fees.length > 0) {
      clubFeeTotal = expenseDetails.club_fees.reduce((sum, fee) => {
        const amount = validateNumber(fee.amount)
        return sum + amount
      }, 0)
    }
    
    // 计算活动费用总额
    let eventCostTotal = 0
    if (expenseDetails.event_costs && expenseDetails.event_costs.length > 0) {
      eventCostTotal = expenseDetails.event_costs.reduce((sum, cost) => {
        const amount = validateNumber(cost.amount)
        return sum + amount
      }, 0)
    }
    
    if (clubFeeTotal > 0) {
      expenseChart.push({
        name: '协会费用',
        value: clubFeeTotal
      })
    }
    if (eventCostTotal > 0) {
      expenseChart.push({
        name: '活动费用',
        value: eventCostTotal
      })
    }

    return {
      monthlyChart, // 主要的月度图表（净收支）
      monthlyIncomeChart, // 月度收入图表
      monthlyExpenseChart, // 月度支出图表
      incomeChart,
      expenseChart
    }
  },

  // 下载Excel
  async downloadExcel() {
    try {
      this.setData({ downloading: true })
      wx.showLoading({
        title: '正在生成Excel文件...'
      })
      
      const token = wx.getStorageSync('token')
      const response = await this.request(`/statistics/export/club/${this.properties.clubId}/financial/statistics`, 'GET')
      
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
              // 保存到相册或打开文件
              wx.openDocument({
                filePath: res.tempFilePath,
                fileType: 'xlsx',
                showMenu: true,
                success: () => {
                  wx.showToast({
                    title: '文件已打开',
                    icon: 'success'
                  })
                },
                fail: (err) => {
                  wx.showToast({
                    title: '文件打开失败',
                    icon: 'none'
                  })
                }
              })
            } else {
              wx.showToast({
                title: `文件下载失败 (${res.statusCode})`,
                icon: 'none'
              })
            }
          },
          fail: (err) => {
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
            wx.hideLoading()
          }
        })

      } else {
        throw new Error(response.message || '生成Excel失败')
      }
    } catch (error) {
      wx.hideLoading()
      wx.showToast({
        title: error.message || '下载失败',
        icon: 'none'
      })
      this.setData({ downloading: false })
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