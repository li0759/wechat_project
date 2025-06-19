Component({
  properties: {
    // 初始选中的日期数组，1-31表示每月的日期
    value: {
      type: Array,
      value: []
    },
    // 标题
    title: {
      type: String,
      value: '选择日期'
    },
    // 是否显示弹窗
    show: {
      type: Boolean,
      value: false
    },
    // 是否禁用
    disabled: {
      type: Boolean,
      value: false
    },
    // 自定义样式类
    customClass: {
      type: String,
      value: ''
    }
  },

  data: {
    dateList: [], // 1-31的日期列表
    selectedDates: [], // 内部选中状态
    displayText: '', // 显示文本
    selectedMap: {} // 选中状态映射，用于模板判断
  },

  observers: {
    'value': function(newValue) {
      if (Array.isArray(newValue)) {
        this.setData({
          selectedDates: [...newValue]
        });
        this.updateSelectedMap();
        this.updateDisplayText();
      }
    },
    'selectedDates': function(selectedDates) {
      this.updateSelectedMap();
      this.updateDisplayText();
    }
  },

  lifetimes: {
    attached() {
      // 生成1-31的日期列表
      const dateList = [];
      for (let i = 1; i <= 31; i++) {
        dateList.push(i);
      }
      
      const initialSelectedDates = Array.isArray(this.data.value) ? [...this.data.value] : [];
      
      this.setData({
        dateList,
        selectedDates: initialSelectedDates
      });

      this.updateSelectedMap();
      this.updateDisplayText();
    }
  },

  methods: {
    // 更新选中状态映射
    updateSelectedMap() {
      const selectedMap = {};
      this.data.selectedDates.forEach(date => {
        selectedMap[date] = true;
      });
      this.setData({ selectedMap });
    },

    // 显示弹窗
    onDisplay() {
      if (this.data.disabled) return;
      this.triggerEvent('display');
    },

    // 关闭弹窗
    onClose() {
      this.triggerEvent('close');
    },

    // 点击日期
    onDateTap(e) {
      
      if (this.data.disabled) return;
      
      const date = e.currentTarget.dataset.date;
      const selectedDates = [...this.data.selectedDates];
      const index = selectedDates.indexOf(date);
      
      if (index > -1) {
        // 已选中，取消选择
        selectedDates.splice(index, 1);
      } else {
        // 未选中，添加选择
        selectedDates.push(date);
      }
      
      // 排序选中的日期
      selectedDates.sort((a, b) => a - b);
      this.setData({
        selectedDates
      });
    },

    // 确认选择
    onConfirm() {
      if (this.data.disabled) return;
      
      // 触发确认事件，返回选中的日期数组
      this.triggerEvent('confirm', {
        value: this.data.selectedDates
      });
    },

    // 更新显示文本
    updateDisplayText() {
      const { selectedDates } = this.data;
      let displayText = '';
      
      if (selectedDates.length === 0) {
        displayText = '请选择';
      } else if (selectedDates.length === 31) {
        displayText = '每天';
      } else {
        displayText = selectedDates.map(date => `${date}日`).join('、');
      }
      
      this.setData({ displayText });
    },

    // 获取当前选中值（供外部调用）
    getValue() {
      return this.data.selectedDates;
    },

    // 设置选中值（供外部调用）
    setValue(value) {
      if (Array.isArray(value)) {
        this.setData({
          selectedDates: [...value]
        });
        this.updateSelectedMap();
        this.updateDisplayText();
      }
    }
  }
}); 