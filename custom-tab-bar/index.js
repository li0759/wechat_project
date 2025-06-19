const app = getApp();

Component({
  properties: {
    active: {
      type: Number,
      observer: function(newVal) {
        // 当外部设置 active 属性时自动更新
        this.setData({ active: newVal });
      }
    }
  },
  
  data: {
    active: 0,
    list: [
      { text: '首页', icon: 'home-o', url: "/pages/home/index" },
      { text: '', icon: 'plus', url: "", isSpecial: true },
      { text: '我的', icon: 'user-o', url: "/pages/profile/index" },
    ],
    userId: '',
    leadingClub: null,
    specialActivity: null,
    hasSpecialActivity: false,
    specialActivityImage: '',
  }, 
  
  lifetimes: {
    attached() {
      this.init();
    }
  },
  
  methods: {
    // 初始化组件
    init() {
      const userId = wx.getStorageSync('userId');
      if (userId) {
        this.setData({ userId }, () => {
          this.checkUserClubAndActivity();
        });
      }
    },

    // Tab切换事件处理
    onChange(event) {
      const { index } = event.currentTarget.dataset;
      const item = this.data.list[index];
      
      this.setData({ active: index });
      
      if (item.isSpecial) {
        this.handleSpecialTabClick();
        return;
      }

      wx.switchTab({
        url: item.url,
        success: () => {
          this.checkUserClubAndActivity();
          const page = getCurrentPages().pop();
          page?.onCustomTabItemTap?.({});
        }
      });
    },
    
    // 特殊Tab点击处理
    handleSpecialTabClick() {
      const { hasSpecialActivity, specialActivity, leadingClub } = this.data;
      const basePath = leadingClub ? 
        (hasSpecialActivity ? `/packageEvent/event-manage/index` : `/packageEvent/event-create/index`) :
        (hasSpecialActivity ? `/packageEvent/event-detail/index` : `/packageEvent/index?url=/event/user_can_join/list/going?mode=page&page=1`);
      
      wx.navigateTo({
        url: hasSpecialActivity ? `${basePath}?eventId=${specialActivity.event_id}` : basePath
      });
    },
    
    // 检查用户协会和活动状态
    async checkUserClubAndActivity() {
      try {
        const clubRes = await this.getUserLeadingClub();
        const clubs = clubRes?.data?.data || [];
        //const clubs = []
        const activityRes = await (clubs.length > 0 ? 
          this.getActivities('user_manage') : 
          this.getActivities('user_joined'));
        
        // 安全地访问 records 属性
        const records = activityRes?.data?.data?.records || [];
        this.updateSpecialTab(records[0] || null);
        
        if (clubs.length > 0) {
          this.setData({ leadingClub: clubs[0] });
        }
      } catch (error) {
        console.error('数据加载失败:', error);
        this.updateSpecialTab(null);
      }
    },
    
    // 统一活动获取方法
    getActivities(type) {
      const endpoints = {
        user_manage: app.globalData.request_url + `/event/user_manage/list/going?mode=page&page=1`,
        user_joined: app.globalData.request_url + `/event/user_joined/list/going?mode=page&page=1`
      };
      return this.request(endpoints[type]);
    },

    // 获取用户管理的协会
    getUserLeadingClub() {
      return this.request(app.globalData.request_url + `/club/user_lead/list`);
    },
    
    // 更新特殊Tab状态
    updateSpecialTab(activity) {
      
      const newList = [...this.data.list];
      newList[1].text = activity?.title || '';
      
      this.setData({
        list: newList,
        hasSpecialActivity: !!activity,
        specialActivity: activity,
        specialActivityImage: activity?.process_images?.split(';')[0] || ''
      });
    },

    // 通用网络请求
    request(url) {
      return new Promise((resolve, reject) => {
        wx.request({
          url,
          header: { 
            'Authorization': `Bearer ${wx.getStorageSync('token')}` 
          },
          success: (res) => res.statusCode === 200 ? 
            resolve(res) : 
            reject(new Error(`请求失败: ${res.statusCode}`)),
          fail: reject
        });
      });
    }
  }
})

