Component({
  data: {
    active: 0,
    /** 全屏弹层时隐藏；勿用 wx.showTabBar：custom 模式下真机易叠出系统默认双栏 */
    tabBarHidden: false,
    list: [
      { text: '首页', icon: 'home', url: "/pages/home/index", isTab: true },
      { text: '参加活动', icon: 'calendar', url: "/packageEvent/index?url=/event/user_can_join/list/going", isTab: false },
      { text: '我的', icon: 'user', url: "/pages/profile/index", isTab: true },
    ]
  },
  methods: {
    setTabBarHidden(hidden) {
      this.setData({ tabBarHidden: !!hidden });
    },
    onTabChange(e) {
      const index = e.detail.value;
      const item = this.data.list[index];
      this.setData({ active: index });
      if (item.isTab) {
        wx.switchTab({ url: item.url });
      } else {
        wx.navigateTo({ url: item.url });
      }
    },
    setActive(index) {
      this.setData({ active: index });
    }
  }
});

