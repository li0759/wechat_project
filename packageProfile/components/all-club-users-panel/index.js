const app = getApp()

/**
 * 所有协会用户数据Panel组件
 * 从packageShow/show-all-club-users页面转换而来
 */

Component({
  properties: {},

  data: {
    loading: true,
    downloading: false,
    clubs: [],
    totalClubs: 0,
    totalMembers: 0,
    clubMemberChart: [],
    genderChart: [],
    unitChart: [],
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

      const response = await this.request('/statistics/show/all_club/users', 'GET')
      
      if (response.code === 200) {
        const data = response.data
        
        // 基础统计数据
    const clubs = data.clubs || []
        const totalClubs = data.total_clubs || 0
        const totalMembers = data.total_members || 0
        
        // 处理图表数据
    const chartData = this.processChartData(clubs)
        
        this.setData({
          clubs,
          totalClubs,
          totalMembers,
          clubMemberChart: chartData.clubMemberChart,
          genderChart: chartData.genderChart,
          unitChart: chartData.unitChart,
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

   // 下载Excel
   async downloadExcel() {
    this.setData({ downloading: true })
    wx.showLoading({
      title: '正在生成Excel文件...'
    })
    
    const token = wx.getStorageSync('token')
    const response = await this.request('/statistics/export/all_club/users', 'GET')
    
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


  // 查看协会详情
  viewClubDetail(e) {
    const clubId = e.currentTarget.dataset.clubId
    // 可以跳转到协会详情页或显示更多信息
    wx.showToast({
      title: '查看协会详情功能开发中',
      icon: 'none'
    })
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