Component({
  /**
   * 组件的属性列表   */
  properties: {
    // 搜索框占位符
    placeholder: {
      type: String,
      value: '请输入搜索内容..'
    },
    
    // 搜索数
      value: {
      type: String,
      value: '',
      observer: 'onValueChange'
    },
    
    // 是否显示搜索按钮
    showSearchButton: {
      type: Boolean,
      value: true
    },
    
    // 搜索按钮文字
    searchButtonText: {
      type: String,
      value: '搜索'
    },
    
    // 是否启用自动补全
    enableAutocomplete: {
      type: Boolean,
      value: true
    },
    
    // 防抖延迟时间(毫秒)
    debounceTime: {
      type: Number,
      value: 300
    },
    
    // 最小搜索字符数
    minSearchLength: {
      type: Number,
      value: 1
    },
    
    // 最大显示建议数数
      maxSuggestions: {
      type: Number,
      value: 10
    },
    
    // 是否显示历史记录
    showHistory: {
      type: Boolean,
      value: true
    },
    
    // 最大历史记录数数
      maxHistoryCount: {
      type: Number,
      value: 10
    },
    
    // 历史记录存储key
    historyStorageKey: {
      type: String,
      value: 'search_history'
    },
    
    // 是否显示清空按钮
    showClearButton: {
      type: Boolean,
      value: true
    },
    
    // 自定义样式类数
      customClass: {
      type: String,
      value: ''
    },
    
    // 自定义样数
      customStyle: {
      type: String,
      value: ''
    },
    
    // 搜索框形?round | square
    shape: {
      type: String,
      value: 'round'
    },
    
    // 主题数
      themeColor: {
      type: String,
      value: '#ff6b9d'
    }
  },

  /**
   * 组件的初始数据   */
  data: {
    inputValue: '',
    suggestions: [],
    searchHistory: [],
    showSuggestions: false,
    isLoading: false,
    focused: false,
    debounceTimer: null,
    // 添加激活状态数数
      activeStates: {
      clearButton: false,
      searchButton: false,
      clearHistoryBtn: false,
      suggestionItems: {},
      historyItems: {},
      deleteHistoryBtns: {}
    }
  },

  /**
   * 组件的方法列表   */
  methods: {
    /**
     * 按钮触摸开始事件处理     */
    onButtonTouchStart(e) {
      const button = e.currentTarget.dataset.button;
      const index = e.currentTarget.dataset.index;
      const activeStates = { ...this.data.activeStates };
      
      if (button === 'clear') {
        activeStates.clearButton = true;
      } else if (button === 'search') {
        activeStates.searchButton = true;
      } else if (button === 'clearHistory') {
        activeStates.clearHistoryBtn = true;
      } else if (button === 'deleteHistory' && index !== undefined) {
        activeStates.deleteHistoryBtns[index] = true;
      }
      
      this.setData({ activeStates });
    },

    /**
     * 按钮触摸结束事件处理
     */
    onButtonTouchEnd(e) {
      const button = e.currentTarget.dataset.button;
      const index = e.currentTarget.dataset.index;
      const activeStates = { ...this.data.activeStates };
      
      if (button === 'clear') {
        activeStates.clearButton = false;
      } else if (button === 'search') {
        activeStates.searchButton = false;
      } else if (button === 'clearHistory') {
        activeStates.clearHistoryBtn = false;
      } else if (button === 'deleteHistory' && index !== undefined) {
        activeStates.deleteHistoryBtns[index] = false;
      }
      
      this.setData({ activeStates });
    },

    /**
     * 列表项触摸开始事件处理     */
    onItemTouchStart(e) {
      const type = e.currentTarget.dataset.type;
      const index = e.currentTarget.dataset.index;
      const activeStates = { ...this.data.activeStates };
      
      if (type === 'suggestion' && index !== undefined) {
        activeStates.suggestionItems[index] = true;
      } else if (type === 'history' && index !== undefined) {
        activeStates.historyItems[index] = true;
      }
      
      this.setData({ activeStates });
    },

    /**
     * 列表项触摸结束事件处理     */
    onItemTouchEnd(e) {
      const type = e.currentTarget.dataset.type;
      const index = e.currentTarget.dataset.index;
      const activeStates = { ...this.data.activeStates };
      
      if (type === 'suggestion' && index !== undefined) {
        activeStates.suggestionItems[index] = false;
      } else if (type === 'history' && index !== undefined) {
        activeStates.historyItems[index] = false;
      }
      
      this.setData({ activeStates });
    },
    
    /**
     * 输入值变化监?     */
    onValueChange(newVal) {
      this.setData({ inputValue: newVal });
    },

    /**
     * 输入框获得焦?     */
    onInputFocus() {
      this.setData({ focused: true });
      
      // 如果输入框为空且启用历史记录，显示历史记数
      if (!this.data.inputValue && this.data.showHistory) {
        this.loadSearchHistory();
        this.setData({ showSuggestions: true });
      }
    },

    /**
     * 输入框失去焦?     */
    onInputBlur() {
      // 延迟隐藏建议框，避免点击建议项时立即隐藏
      setTimeout(() => {
        this.setData({ 
          focused: false,
          showSuggestions: false 
        });
      }, 200);
    },

    /**
     * 输入内容变化
     */
    onInputChange(e) {
      const value = e.detail.value;
      this.setData({ inputValue: value });
      
      // 触发外部输入事件
    this.triggerEvent('input', { value });
      
      // 如果启用自动补全，进行搜索建数
      if (this.data.enableAutocomplete) {
        this.handleAutocomplete(value);
      }
    },

    /**
     * 处理自动补全
     */
    handleAutocomplete(value) {
      // 清除之前的防抖定时器
    if (this.data.debounceTimer) {
        clearTimeout(this.data.debounceTimer);
      }

      // 如果输入长度小于最小搜索长度，隐藏建议
    if (value.length < this.data.minSearchLength) {
        this.setData({ 
          showSuggestions: false,
          suggestions: []
        });
        return;
      }

      // 设置防抖定时数
      const timer = setTimeout(() => {
        this.fetchSuggestions(value);
      }, this.data.debounceTime);

      this.setData({ debounceTimer: timer });
    },

    /**
     * 获取搜索建议
     */
    fetchSuggestions(keyword) {
      this.setData({ isLoading: true });
      
      // 触发外部获取建议事件
    this.triggerEvent('fetchSuggestions', { 
        keyword,
        callback: this.onSuggestionsReceived.bind(this)
      });
    },

    /**
     * 接收搜索建议回调
     */
    onSuggestionsReceived(suggestions) {
      const limitedSuggestions = suggestions.slice(0, this.data.maxSuggestions);
      
      this.setData({
        suggestions: limitedSuggestions,
        showSuggestions: limitedSuggestions.length > 0,
        isLoading: false
      });
    },

    /**
     * 点击建议?     */
    onSuggestionTap(e) {
      const { item, index } = e.currentTarget.dataset;
      const value = item.text || item.title || item;
      
      this.setData({
        inputValue: value,
        showSuggestions: false
      });
      
      // 添加到搜索历数
      this.addToSearchHistory(value);
      
      // 触发选择事件
    this.triggerEvent('select', { 
        value, 
        item, 
        index 
      });
      
      // 触发搜索事件
    this.triggerSearch(value);
    },

    /**
     * 点击历史记录?     */
    onHistoryTap(e) {
      const { item, index } = e.currentTarget.dataset;
      
      this.setData({
        inputValue: item,
        showSuggestions: false
      });
      
      // 触发选择事件
    this.triggerEvent('historySelect', { 
        value: item, 
        index 
      });
      
      // 触发搜索事件
    this.triggerSearch(item);
    },

    /**
     * 删除历史记录?     */
    onDeleteHistory(e) {
      e.stopPropagation();
      const { index } = e.currentTarget.dataset;
      const history = [...this.data.searchHistory];
      history.splice(index, 1);
      
      this.setData({ searchHistory: history });
      this.saveSearchHistory(history);
      
      this.triggerEvent('historyDelete', { index });
    },

    /**
     * 清空历史记录
     */
    onClearHistory() {
      this.setData({ searchHistory: [] });
      this.saveSearchHistory([]);
      this.triggerEvent('historyClear');
    },

    /**
     * 点击搜索按钮
     */
    onSearchTap() {
      const value = this.data.inputValue.trim();
      if (!value) return;
      
      this.setData({ showSuggestions: false });
      this.addToSearchHistory(value);
      this.triggerSearch(value);
    },

    /**
     * 触发搜索事件
     */
    triggerSearch(value) {
      this.triggerEvent('search', { value });
    },

    /**
     * 清空输入?     */
    onClearInput() {
      this.setData({ 
        inputValue: '',
        showSuggestions: false,
        suggestions: []
      });
      
      this.triggerEvent('clear');
      this.triggerEvent('input', { value: '' });
    },

    /**
     * 加载搜索历史
     */
    loadSearchHistory() {
      try {
        const history = wx.getStorageSync(this.data.historyStorageKey) || [];
        this.setData({ searchHistory: history });
      } catch (error) {        this.setData({ searchHistory: [] });
      }
    },

    /**
     * 保存搜索历史
     */
    saveSearchHistory(history) {
      try {
        wx.setStorageSync(this.data.historyStorageKey, history);
      } catch (error) {      }
    },

    /**
     * 添加到搜索历?     */
    addToSearchHistory(keyword) {
      if (!keyword || !this.data.showHistory) return;
      
      let history = [...this.data.searchHistory];
      
      // 移除重复数
      const existIndex = history.indexOf(keyword);
    if (existIndex > -1) {
        history.splice(existIndex, 1);
      }
      
      // 添加到开数
      history.unshift(keyword);
      
      // 限制数量
    if (history.length > this.data.maxHistoryCount) {
        history = history.slice(0, this.data.maxHistoryCount);
      }
      
      this.setData({ searchHistory: history });
      this.saveSearchHistory(history);
    },

    /**
     * 设置搜索建议（外部调用）
     */
    setSuggestions(suggestions) {
      this.onSuggestionsReceived(suggestions);
    },

    /**
     * 获取当前输入值（外部调用?     */
    getValue() {
      return this.data.inputValue;
    },

    /**
     * 设置输入值（外部调用?     */
    setValue(value) {
      this.setData({ inputValue: value });
      this.triggerEvent('input', { value });
    },

    /**
     * 清空组件状态（外部调用?     */
    clear() {
      this.onClearInput();
    },

    /**
     * 手动触发搜索（外部调用）
     */
    search() {
      this.onSearchTap();
    }
  },

  /**
   * 组件生命周期
   */
  attached() {
    // 加载搜索历史
    if (this.data.showHistory) {
      this.loadSearchHistory();
    }
  },

  detached() {
    // 清理定时数
      if (this.data.debounceTimer) {
      clearTimeout(this.data.debounceTimer);
    }
  }
}); 