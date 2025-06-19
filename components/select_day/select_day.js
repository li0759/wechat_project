Component({
  properties: {
    // 初始选中的星期数组，0-6表示周一到周日
    value: {
      type: Array,
      value: []
    },
    // 标题
    title: {
      type: String,
      value: '选择星期'
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
    dayLabels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    selectedDays: [], // 内部选中状态
    displayText: '', // 显示文本
    selectedMap: {} // 选中状态映射，用于模板判断
  },

  observers: {
    'value': function(newValue) {
      if (Array.isArray(newValue)) {
        this.setData({
          selectedDays: [...newValue]
        });
        this.updateSelectedMap();
        this.updateDisplayText();
      }
    },
    'selectedDays': function(selectedDays) {
      this.updateSelectedMap();
      this.updateDisplayText();
    }
  },

  lifetimes: {
    attached() {
      // 组件初始化时设置默认值
      const initialSelectedDays = Array.isArray(this.data.value) ? [...this.data.value] : [];
      this.setData({
        selectedDays: initialSelectedDays
      });
      this.updateSelectedMap();
      this.updateDisplayText();
    }
  },

  methods: {
    // 更新选中状态映射
    updateSelectedMap() {
      const selectedMap = {};
      this.data.selectedDays.forEach(day => {
        selectedMap[day] = true;
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

    // 点击星期
    onDayTap(e) {
      if (this.data.disabled) return;
      
      const day = e.currentTarget.dataset.day;
      const selectedDays = [...this.data.selectedDays];

      const index = selectedDays.indexOf(day);
      
      if (index > -1) {
        // 已选中，取消选择
        selectedDays.splice(index, 1);
      } else {
        // 未选中，添加选择
        selectedDays.push(day);
      }
      
      // 排序选中的星期
      selectedDays.sort((a, b) => a - b);
      
      this.setData({
        selectedDays
      });
    },

    // 确认选择
    onConfirm() {
      if (this.data.disabled) return;
      
      // 触发确认事件，返回选中的星期数组
      this.triggerEvent('confirm', {
        value: this.data.selectedDays
      });
    },

    // 更新显示文本
    updateDisplayText() {
      const { selectedDays, dayLabels } = this.data;
      let displayText = '';
      
      if (selectedDays.length === 0) {
        displayText = '请选择';
      } else if (selectedDays.length === 7) {
        displayText = '每天';
      } else {
        displayText = selectedDays.map(day => dayLabels[day]).join('、');
      }
      
      this.setData({ displayText });
    },

    // 获取当前选中值（供外部调用）
    getValue() {
      return this.data.selectedDays;
    },

    // 设置选中值（供外部调用）
    setValue(value) {
      if (Array.isArray(value)) {
        this.setData({
          selectedDays: [...value]
        });
        this.updateSelectedMap();
        this.updateDisplayText();
      }
    }
  }
}); 