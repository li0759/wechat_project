// 搜索组件演示页面
Page({
  data: {
    searchResults: [],
    logs: [],
    // 模拟搜索建议数据
    mockSuggestions: [
      {
        id: '1',
        title: '张三',
        description: '计算机科学与技术专业',
        icon: 'manager-o',
        iconColor: '#ff6b9d',
        tag: '用户',
        extra: { type: 'user', userId: '1' }
      },
      {
        id: '2',
        title: '李四',
        description: '软件工程专业',
        icon: 'friends-o',
        iconColor: '#52c41a',
        tag: '用户',
        extra: { type: 'user', userId: '2' }
      },
      {
        id: '3',
        title: '计算机协会',
        description: '专注于计算机技术交流与学习',
        icon: 'cluster-o',
        iconColor: '#1890ff',
        tag: '协会',
        extra: { type: 'club', clubId: '1' }
      },
      {
        id: '4',
        title: '编程大赛',
        description: '年度编程竞赛活动',
        icon: 'trophy-o',
        iconColor: '#fa8c16',
        tag: '活动',
        extra: { type: 'event', eventId: '1' }
      },
      {
        id: '5',
        title: '技术分享会',
        description: '最新技术趋势分享',
        icon: 'chat-o',
        iconColor: '#722ed1',
        tag: '活动',
        extra: { type: 'event', eventId: '2' }
      },
      {
        id: '6',
        title: '王五',
        description: '数据科学与大数据技术专业',
        icon: 'contact',
        iconColor: '#eb2f96',
        tag: '用户',
        extra: { type: 'user', userId: '3' }
      },
      {
        id: '7',
        title: '人工智能协会',
        description: 'AI技术研究与应用',
        icon: 'fire-o',
        iconColor: '#f5222d',
        tag: '协会',
        extra: { type: 'club', clubId: '2' }
      },
      {
        id: '8',
        title: 'AI算法竞赛',
        description: '机器学习算法挑战赛',
        icon: 'medal-o',
        iconColor: '#faad14',
        tag: '活动',
        extra: { type: 'event', eventId: '3' }
      }
    ]
  },

  onLoad() {
    this.addLog('页面加载完成');
  },

  // 执行搜索
  onSearch(e) {
    const keyword = e.detail.value;
    this.addLog(`执行搜索: "${keyword}"`);
    
    // 模拟搜索结果
    const results = this.data.mockSuggestions.filter(item => 
      item.title.includes(keyword) || 
      item.description.includes(keyword)
    );
    
    this.setData({ searchResults: results });
    
    // 模拟搜索延迟
    wx.showLoading({ title: '搜索中...' });
    setTimeout(() => {
      wx.hideLoading();
      wx.showToast({
        title: `找到 ${results.length} 个结果`,
        icon: 'success'
      });
    }, 500);
  },

  // 获取搜索建议
  onFetchSuggestions(e) {
    const { keyword, callback } = e.detail;
    this.addLog(`获取搜索建议: "${keyword}"`);
    
    // 模拟网络延迟
    setTimeout(() => {
      // 过滤匹配的建议
    const suggestions = this.data.mockSuggestions.filter(item => 
        item.title.toLowerCase().includes(keyword.toLowerCase()) ||
        item.description.toLowerCase().includes(keyword.toLowerCase())
      );
      
      // 调用回调函数返回建议
      callback(suggestions);
      this.addLog(`返回 ${suggestions.length} 个建议`);
    }, 200);
  },

  // 选择建议项
  onSelectSuggestion(e) {
    const { value, item } = e.detail;
    this.addLog(`选择建议: "${value}" (${item.tag})`);
    
    // 根据类型执行不同操作
  switch (item.extra?.type) {
      case 'user':
        wx.showModal({
          title: '用户详情',
          content: `查看用户: ${item.title}\n${item.description}`,
          showCancel: false
        });
        break;
      case 'club':
        wx.showModal({
          title: '协会详情',
          content: `查看协会: ${item.title}\n${item.description}`,
          showCancel: false
        });
        break;
      case 'event':
        wx.showModal({
          title: '活动详情',
          content: `查看活动: ${item.title}\n${item.description}`,
          showCancel: false
        });
        break;
      default:
        this.onSearch({ detail: { value } });
    }
  },

  // 添加日志
  addLog(content) {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    
    const logs = [...this.data.logs];
    logs.unshift({ time, content });
    
    // 限制日志数量
    if (logs.length > 20) {
      logs.splice(20);
    }
    
    this.setData({ logs });
  },

  // 清空日志
  clearLogs() {
    this.setData({ logs: [] });
  },

  // 清空搜索结果
  clearResults() {
    this.setData({ searchResults: [] });
  }
}); 