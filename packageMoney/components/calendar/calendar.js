Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 是否显示日历
    show: {
      type: Boolean,
      value: false
    },
    // 事件数据
    events: {
      type: Array,
      value: []
    },
    // 最小可选日期
    minDate: {
      type: null,
      value: new Date(new Date().getFullYear() - 1, 0, 1).getTime()
    },
    // 最大可选日期
    maxDate: {
      type: null,
      value: new Date(new Date().getFullYear() + 1, 11, 31).getTime()
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    // 日历视图数据
    weeks: ['日', '一', '二', '三', '四', '五', '六'],
    days: [],
    emptyGrids: [],
    lastEmptyGrids: [],
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
    currentDay: new Date().getDate(),
    selectedYear: new Date().getFullYear(),
    selectedMonth: new Date().getMonth() + 1,
    selectedDay: new Date().getDate(),
    
    // 事件弹窗数据
    eventPopupShow: false,
    currentEvents: [],
    selectedDate: null,
    
    // 年月选择器
    yearMonthPickerShow: false,
    yearRange: [],
    pickerValue: [0, 0]
  },

  /**
   * 组件数据字段监听器
   */
  observers: {
    'show': function(show) {
      if (show) {
        this.initYearRange();
        this.calculateDays(this.data.selectedYear, this.data.selectedMonth);
      }
    },
    'events': function(events) {
      if (this.data.selectedYear && this.data.selectedMonth) {
        this.calculateDays(this.data.selectedYear, this.data.selectedMonth);
      }
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 初始化年份范围
     */
    initYearRange() {
      const minYear = new Date(this.data.minDate).getFullYear();
      const maxYear = new Date(this.data.maxDate).getFullYear();
      const yearRange = [];
      
      for (let i = minYear; i <= maxYear; i++) {
        yearRange.push(i);
      }
      
      const currentYearIndex = yearRange.indexOf(this.data.selectedYear);
      const currentMonthIndex = this.data.selectedMonth - 1;
      
      this.setData({
        yearRange: yearRange,
        pickerValue: [currentYearIndex, currentMonthIndex]
      });
    },

    /**
     * 计算当月的日期
     */
    calculateDays(year, month) {
      const days = [];
      const thisMonthDays = this.getThisMonthDays(year, month);
      
      // 计算当月每一天的数据
    for (let i = 1; i <= thisMonthDays; i++) {
        const dateStr = `${year}/${month}/${i}`;
        const date = new Date(dateStr);
        const timestamp = date.getTime();
        
        // 找出该日期的所有事件
    const dayEvents = this.getEventsForDay(timestamp);
        const hasEvents = dayEvents.length > 0;
        
        days.push({
          day: i,
          date: timestamp,
          events: dayEvents,
          hasEvents: hasEvents,
          eventCount: dayEvents.length,
          isToday: this.isToday(year, month, i)
        });
      }
      
      // 计算本月第一天是星期几，以确定前面空白格的数量
    const firstDayOfWeek = this.getFirstDayOfWeek(year, month);
      const emptyGrids = Array.from({ length: firstDayOfWeek }, (_, i) => i);
      
      // 计算本月最后一天是星期几，以确定后面空白格的数量
    const lastDayOfWeek = this.getLastDayOfWeek(year, month);
      const lastEmptyGrids = Array.from({ length: 6 - lastDayOfWeek }, (_, i) => i);
      
      this.setData({
        days: days,
        emptyGrids: emptyGrids,
        lastEmptyGrids: lastEmptyGrids
      });
    },

    /**
     * 获取指定月份的天数
     */
    getThisMonthDays(year, month) {
      return new Date(year, month, 0).getDate();
    },

    /**
     * 获取指定月份第一天是星期几
     */
    getFirstDayOfWeek(year, month) {
      return new Date(Date.UTC(year, month - 1, 1)).getDay();
    },

    /**
     * 获取指定月份最后一天是星期几
     */
    getLastDayOfWeek(year, month) {
      const thisMonthDays = this.getThisMonthDays(year, month);
      return new Date(Date.UTC(year, month - 1, thisMonthDays)).getDay();
    },

    /**
     * 判断是否是今天
     */
    isToday(year, month, day) {
      const today = new Date();
      return year === today.getFullYear() && month === today.getMonth() + 1 && day === today.getDate();
    },

    /**
     * 获取指定日期的所有事件
     */
    getEventsForDay(timestamp) {
      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = date.getMonth();
      const day = date.getDate();
      
      // 今天0点的时间戳
    const startOfDay = new Date(year, month, day, 0, 0, 0).getTime();
      // 今天23:59:59的时间戳
    const endOfDay = new Date(year, month, day, 23, 59, 59).getTime();
      
      // 找出所有在这一天的事件
      return this.data.events.filter(event => {
        const eventTime = new Date(event.active_time).getTime();
        return eventTime >= startOfDay && eventTime <= endOfDay;
      });
    },

    /**
     * 切换到上个月
     */
    onPrevMonth() {
      let newMonth = this.data.selectedMonth - 1;
      let newYear = this.data.selectedYear;
      
      if (newMonth < 1) {
        newMonth = 12;
        newYear -= 1;
      }
      
      this.setData({
        selectedYear: newYear,
        selectedMonth: newMonth
      });
      
      this.calculateDays(newYear, newMonth);
      
      // 触发月份变更事件
    this.triggerMonthChangeEvent(newYear, newMonth);
    },
    
    /**
     * 切换到下个月
     */
    onNextMonth() {
      let newMonth = this.data.selectedMonth + 1;
      let newYear = this.data.selectedYear;
      
      if (newMonth > 12) {
        newMonth = 1;
        newYear += 1;
      }
      
      this.setData({
        selectedYear: newYear,
        selectedMonth: newMonth
      });
      
      this.calculateDays(newYear, newMonth);
      
      // 触发月份变更事件
    this.triggerMonthChangeEvent(newYear, newMonth);
    },
    
    /**
     * 点击日期
     */
    onDayClick(e) {
      const index = e.currentTarget.dataset.index;
      const day = this.data.days[index];
      
      this.setData({
        selectedDay: day.day
      });
      
      // 触发自定义事件，传递选中的日期和事件数据
    this.triggerEvent('select', { 
        date: day.date,
        events: day.events
      });
      
      // 如果该日期有事件，显示事件弹窗
    if (day.hasEvents) {
        this.showEventPopup(day.events, day.date);
      }
    },
    
    /**
     * 点击事件项
     */
    onEventItemClick(e) {
      const index = e.currentTarget.dataset.index;
      const event = this.data.currentEvents[index];
      // 如果事件有URL，跳转到该URL
    if (event.url) {
        wx.navigateTo({
          url: event.url
        });
        this.hideEventPopup();
      }

    },
    
    /**
     * 显示年月选择器
     */
    showYearMonthPicker() {
      // 设置年月选择器的初始值
    const yearIndex = this.data.yearRange.findIndex(y => y === this.data.selectedYear);
      const monthIndex = this.data.selectedMonth - 1;
      
      this.setData({
        yearMonthPickerShow: true,
        pickerValue: [yearIndex >= 0 ? yearIndex : 0, monthIndex]
      });
    },
    
    /**
     * 年月选择器变化
     */
    onYearMonthPickerChange(e) {
      this.setData({
        pickerValue: e.detail.value
      });
    },
    
    /**
     * 年月选择器关闭
     */
    onYearMonthPickerClose() {
      this.setData({
        yearMonthPickerShow: false
      });
    },
    
    /**
     * 年月选择器确认
     */
    onYearMonthPickerConfirm() {
      const yearIndex = this.data.pickerValue[0];
      const monthIndex = this.data.pickerValue[1];
      
      const newYear = this.data.yearRange[yearIndex];
      const newMonth = monthIndex + 1;
      
      this.setData({
        selectedYear: newYear,
        selectedMonth: newMonth,
        yearMonthPickerShow: false
      });
      
      this.calculateDays(newYear, newMonth);
      
      // 触发月份变更事件
    this.triggerMonthChangeEvent(newYear, newMonth);
    },
    
    /**
     * 触发月份变更事件
     */
    triggerMonthChangeEvent(year, month) {
      this.triggerEvent('monthChange', { 
        year: year,
        month: month
      });
    },
    
    /**
     * 显示事件弹窗
     */
    showEventPopup(events, date) {
      // 格式化事件的时间
    const formattedEvents = events.map(event => {
        const eventDate = new Date(event.active_time);
        const hours = eventDate.getHours().toString().padStart(2, '0');
        const minutes = eventDate.getMinutes().toString().padStart(2, '0');
        
        return {
          ...event,
          formatted_time: `${hours}:${minutes}`
        };
      });
      
      this.setData({
        currentEvents: formattedEvents,
        selectedDate: date,
        eventPopupShow: true
      });
    },
    
    /**
     * 关闭事件弹窗
     */
    onEventPopupClose() {
      this.hideEventPopup();
    },
    
    /**
     * 隐藏事件弹窗
     */
    hideEventPopup() {
      this.setData({
        eventPopupShow: false,
        currentEvents: []
      });
    },

    /**
     * 格式化日期时间
     */
    formatDateTime(timestamp) {
      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = this.padZero(date.getMonth() + 1);
      const day = this.padZero(date.getDate());
      const hour = this.padZero(date.getHours());
      const minute = this.padZero(date.getMinutes());
      
      return `${year}-${month}-${day} ${hour}:${minute}`;
    },

    /**
     * 数字补零
     */
    padZero(num) {
      return num < 10 ? '0' + num : num;
    }
  },

  /**
   * 组件的生命周期函数
   */
  lifetimes: {
    attached() {
      // 初始化日历数据
    this.calculateDays(this.data.selectedYear, this.data.selectedMonth);
      this.initYearRange();
      

    }
  }
}); 