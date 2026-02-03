const app = getApp();

Page({
  data: {
    // 搜索相关
    searchKey: '',
    searchQuery: '',
    showResults: false,
    loading: false,
    refreshing: false,
    
    // Tab控制
    activeTab: 'all',
    
    // 搜索结果
    userResults: [],
    eventResults: [],
    clubResults: [],
    
    // 统计信息
    totalResults: 0,
    userCount: 0,
    eventCount: 0,
    clubCount: 0,
    
    // 分页信息
    currentPage: 1,
    hasMore: true,
    
    // 搜索历史和热门搜�数
      searchHistory: [],
    hotSearches: ['篮球', '足球', '编程', '音乐', '摄影', '志愿服务']
  },

  onLoad(options) {
    // 加载搜索历史
    this.loadSearchHistory();
    
    // 如果有传入的搜索关键词，直接搜索
    if (options.keyword) {
      this.setData({
        searchKey: options.keyword
      });
      this.performSearch(options.keyword);
    }
  },

  onShow() {
    // 页面显示时重新加载搜索历�数
      this.loadSearchHistory();
  },

  /**
   * 加载搜索历史
   */
  loadSearchHistory() {
    try {
      const history = wx.getStorageSync('searchHistory') || [];
      this.setData({
        searchHistory: history.slice(0, 10) // 最多显�?0条历史记�数
      });
    } catch (error) {    }
  },

  /**
   * 保存搜索历史
   */
  saveSearchHistory(keyword) {
    if (!keyword || keyword.trim() === '') return;
    
    try {
      let history = wx.getStorageSync('searchHistory') || [];
      
      // 移除已存在的相同关键�数
      history = history.filter(item => item !== keyword);
      
      // 添加到开�数
      history.unshift(keyword);
      
      // 最多保�?0条记�数
      if (history.length > 20) {
        history = history.slice(0, 20);
      }
      
      wx.setStorageSync('searchHistory', history);
      this.setData({
        searchHistory: history.slice(0, 10)
      });
    } catch (error) {    }
  },

  /**
   * 清空搜索历史
   */
  clearHistory() {
    wx.showModal({
      title: '提示',
      content: '确定要清空搜索历史吗？',
      success: (res) => {
        if (res.confirm) {
          try {
            wx.removeStorageSync('searchHistory');
            this.setData({
              searchHistory: []
            });
            wx.showToast({
              title: '已清',
              icon: 'success'
            });
          } catch (error) {            wx.showToast({
              title: '清空失败',
              icon: 'error'
            });
          }
        }
      }
    });
  },

  /**
   * 从历史记录搜�?
   */
  searchFromHistory(e) {
    const keyword = e.currentTarget.dataset.keyword;
    this.setData({
      searchKey: keyword
    });
    this.performSearch(keyword);
  },

  /**
   * 搜索事件处理
   */
  onSearch(e) {
    const keyword = e.detail.value;
    this.performSearch(keyword);
  },

  /**
   * 获取搜索建议事件
   */
  onFetchSuggestions(e) {
    const keyword = e.detail.keyword;
    
    // 如果关键词太短，不发送请�数
      if (!keyword || keyword.length < 1) {
      return;
    }

    // 使用后台的搜索建议接�
    wx.request({
      url: `${app.globalData.request_url}/search/composite/suggestions`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${wx.getStorageSync('token')}`,
        'Content-Type': 'application/json'
      },
      data: {
        keyword: keyword,
        limit: 8
      },
      success: (res) => {
        if (res.data.code === 200) {
          const suggestions = res.data.data.suggestions || [];
          
          // 将建议数据传递给search_suggest组件
    const searchSuggest = this.selectComponent('#searchSuggest');
          if (searchSuggest) {
            searchSuggest.setSuggestions(suggestions);
          }
        }
      },
      fail: (error) => {      }
    });
  },

  /**
   * 建议项点击事�?
   */
  onSuggestionTap(e) {
    const suggestion = e.detail.item;
    
    // 根据建议类型执行不同的操�数
      if (suggestion.extra && suggestion.extra.type) {
      switch (suggestion.extra.type) {
        case 'user':
          this.navigateToUserProfile({ currentTarget: { dataset: { userId: suggestion.extra.userId } } });
          break;
        case 'event':
          this.navigateToEventDetail({ currentTarget: { dataset: { eventId: suggestion.extra.eventId } } });
          break;
        case 'club':
          this.navigateToClubDetail({ currentTarget: { dataset: { clubId: suggestion.extra.clubId } } });
          break;
        default:
          // 如果没有特定类型，执行普通搜�数
      this.performSearch(suggestion.title);
          break;
      }
    } else {
      // 执行普通搜�数
      this.performSearch(suggestion.title);
    }
  },

  /**
   * 清空搜索事件
   */
  onClear() {
    this.setData({
      searchKey: '',
      searchQuery: '',
      showResults: false,
      userResults: [],
      eventResults: [],
      clubResults: [],
      totalResults: 0,
      userCount: 0,
      eventCount: 0,
      clubCount: 0
    });
  },

  /**
   * 执行搜索
   */
  performSearch(keyword) {
    if (!keyword || keyword.trim() === '') {
      this.onClear();
      return;
    }

    this.setData({
      loading: true,
      searchQuery: keyword.trim(),
      showResults: true,
      currentPage: 1,
      hasMore: true
    });

    // 保存搜索历史
    this.saveSearchHistory(keyword.trim());

    // 执行搜索请求
    this.doSearch();
  },

  /**
   * 执行搜索请求
   */
  doSearch() {
    const { searchQuery, currentPage, activeTab } = this.data;
    
    // 构建搜索类型参数
    let types = 'user,event,club';
    if (activeTab !== 'all') {
      types = activeTab;
    }

    wx.request({
      url: `${app.globalData.request_url}/search/composite`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${wx.getStorageSync('token')}`,
        'Content-Type': 'application/json'
      },
      data: {
        q: searchQuery,
        types: types,
        page: currentPage,
        per_page: 20
      },
      success: (res) => {
        this.setData({ loading: false, refreshing: false });
        
        if (res.data.Flag === '4000') {
          const results = res.data.data.results;
          const searchInfo = res.data.data.search_info;
          
          // 处理搜索结果
    if (currentPage === 1) {
            // 首次搜索，重置结�数
      this.setData({
              userResults: results.users || [],
              eventResults: results.events || [],
              clubResults: results.clubs || [],
              userCount: searchInfo.user_count || 0,
              eventCount: searchInfo.event_count || 0,
              clubCount: searchInfo.club_count || 0,
              totalResults: searchInfo.total_results || 0
            });
          } else {
            // 加载更多，追加结�数
      this.setData({
              userResults: [...this.data.userResults, ...(results.users || [])],
              eventResults: [...this.data.eventResults, ...(results.events || [])],
              clubResults: [...this.data.clubResults, ...(results.clubs || [])]
            });
          }
          
          // 检查是否还有更多数�数
      const totalLoaded = this.data.userResults.length + this.data.eventResults.length + this.data.clubResults.length;
          this.setData({
            hasMore: totalLoaded < searchInfo.total_results
          });
          
        } else {          wx.showToast({
            title: res.data.message || '搜索失败',
            icon: 'error'
          });
        }
      },
      fail: (error) => {
        this.setData({ loading: false, refreshing: false });        wx.showToast({
          title: '网络请求失败',
          icon: 'error'
        });
      }
    });
  },

  /**
   * Tab切换事件
   */
  onTabChange(e) {
    const activeTab = e.detail.name;
    this.setData({
      activeTab: activeTab,
      currentPage: 1,
      hasMore: true
    });
    
    // 如果有搜索关键词，重新搜�数
      if (this.data.searchQuery) {
      this.setData({ loading: true });
      this.doSearch();
    }
  },

  /**
   * 下拉刷新
   */
  onRefresh() {
    if (!this.data.searchQuery) {
      this.setData({ refreshing: false });
      return;
    }
    
    this.setData({
      refreshing: true,
      currentPage: 1,
      hasMore: true
    });
    
    this.doSearch();
  },

  /**
   * 加载更多
   */
  loadMore() {
    if (this.data.loading || !this.data.hasMore || !this.data.searchQuery) {
      return;
    }
    
    this.setData({
      currentPage: this.data.currentPage + 1,
      loading: true
    });
    
    this.doSearch();
  },

  /**
   * 跳转到用户详情页
   */
  navigateToUserProfile(e) {
    const userId = e.currentTarget.dataset.userId;
    if (!userId) return;
    
    wx.navigateTo({
      url: `/packageProfile/user-info/index?id=${userId}`
    });
  },

  /**
   * 跳转到活动详情页
   */
  navigateToEventDetail(e) {
    const eventId = e.currentTarget.dataset.eventId;
    if (!eventId) return;
    
    wx.navigateTo({
      url: `/packageEvent/event-detail/index?eventId=${eventId}`
    });
  },

  /**
   * 跳转到协会详情页
   */
  navigateToClubDetail(e) {
    const clubId = e.currentTarget.dataset.clubId;
    if (!clubId) return;
    
    wx.navigateTo({
      url: `/packageClub/club-detail/index?clubId=${clubId}`
    });
  }
}); 