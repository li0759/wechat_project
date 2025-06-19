Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 目标数值
    value: {
      type: Number,
      value: 0,
      observer: 'onValueChange'
    },
    
    // 起始数值
    from: {
      type: Number,
      value: 0
    },
    
    // 动画持续时间 (毫秒)
    duration: {
      type: Number,
      value: 1000
    },
    
    // 延迟开始时间 (毫秒)
    delay: {
      type: Number,
      value: 0
    },
    
    // 小数位数
    decimals: {
      type: Number,
      value: 0
    },
    
    // 自动播放
    autoplay: {
      type: Boolean,
      value: true
    },
    
    // 前缀文字
    prefix: {
      type: String,
      value: ''
    },
    
    // 后缀文字
    suffix: {
      type: String,
      value: ''
    },
    
    // 尺寸 small | medium | large
    size: {
      type: String,
      value: 'medium'
    },
    
    // 颜色主题 primary | success | warning | danger | custom
    color: {
      type: String,
      value: 'primary'
    },
    
    // 字体权重 normal | medium | bold
    fontWeight: {
      type: String,
      value: 'normal'
    },
    
    // 自定义样式类名
    customClass: {
      type: String,
      value: ''
    },
    
    // 自定义样式
    customStyle: {
      type: String,
      value: ''
    },
    
    // 是否启用动画增强效果
    animated: {
      type: Boolean,
      value: false
    },
    
    // 是否响应式字体
    responsive: {
      type: Boolean,
      value: false
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    digitList: [],
    decimalDigits: [],
    integerPart: 0,
    decimalPart: 0,
    isAnimating: false
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 数值变化监听器
     */
    onValueChange(newVal, oldVal) {
      if (newVal !== oldVal) {
        if (this.data.autoplay) {
          this.startAnimation();
        }
      }
    },

    /**
     * 开始动画
     */
    startAnimation() {
      if (this.data.isAnimating) return;
      
      const { value, from, delay } = this.data;
      
      this.setData({ isAnimating: true });
      
      const delayTime = delay || 0;
      
      setTimeout(() => {
        this.animateFromTo(from, value);
      }, delayTime);
    },

    /**
     * 从起始值动画到目标值
     */
    animateFromTo(fromValue, toValue) {
      // 解析数字
      const { integerPart, decimalPart, decimalDigits } = this.parseNumber(toValue);
      const digitList = this.getDigitList(integerPart);
      
      // 设置初始状态（显示from值）
      const fromData = this.parseNumber(fromValue);
      const fromDigitList = this.getDigitList(fromData.integerPart);
      
      this.setData({
        digitList: fromDigitList,
        decimalDigits: fromData.decimalDigits,
        integerPart: fromData.integerPart,
        decimalPart: fromData.decimalPart
      });

      // 延迟一帧开始动画到目标值
      setTimeout(() => {
        this.setData({
          digitList,
          decimalDigits,
          integerPart,
          decimalPart
        });
        
        // 动画完成后重置状态
        setTimeout(() => {
          this.setData({ isAnimating: false });
          this.triggerEvent('finished', { value: toValue });
        }, this.data.duration + 500);
        
      }, 50);
    },

    /**
     * 解析数字，分离整数和小数部分
     */
    parseNumber(num) {
      const { decimals } = this.data;
      const fixedNum = Number(num).toFixed(decimals);
      const [integerStr, decimalStr = ''] = fixedNum.split('.');
      
      const integerPart = parseInt(integerStr, 10);
      const decimalPart = decimalStr ? parseInt(decimalStr, 10) : 0;
      const decimalDigits = decimalStr ? decimalStr.split('').map(Number) : [];
      
      return {
        integerPart,
        decimalPart,
        decimalDigits
      };
    },

    /**
     * 获取数字的每一位数组
     */
    getDigitList(num) {
      const str = Math.abs(num).toString();
      return str.split('').map(Number);
    },

    /**
     * 手动开始动画
     */
    start() {
      this.startAnimation();
    },

    /**
     * 重置动画
     */
    reset() {
      const { from } = this.data;
      const { integerPart, decimalPart, decimalDigits } = this.parseNumber(from);
      const digitList = this.getDigitList(integerPart);
      
      this.setData({
        digitList,
        decimalDigits,
        integerPart,
        decimalPart,
        isAnimating: false
      });
    },

    /**
     * 设置新的目标值并开始动画
     */
    setValue(value) {
      this.setData({ value });
      this.startAnimation();
    }
  },

  /**
   * 组件生命周期函数，在组件实例进入页面节点树时执行
   */
  attached() {
    const { value, from } = this.data;
    
    // 初始化显示
    const { integerPart, decimalPart, decimalDigits } = this.parseNumber(from);
    const digitList = this.getDigitList(integerPart);
    
    this.setData({
      digitList,
      decimalDigits,
      integerPart,
      decimalPart
    });

    // 自动播放动画
    if (this.data.autoplay && value !== from) {
      this.startAnimation();
    }
  },

  /**
   * 组件生命周期函数，在组件实例被从页面节点树移除时执行
   */
  detached() {
    // 清理定时器等资源
  },

  /**
   * 组件所在页面的生命周期函数，在页面显示时执行
   */
  pageLifetimes: {
    show() {
      // 页面显示时可以重新开始动画
    },
    
    hide() {
      // 页面隐藏时停止动画
    }
  },

  /**
   * 组件数据字段监听器
   */
  observers: {
    'size, color, fontWeight, animated, responsive': function(size, color, fontWeight, animated, responsive) {
      // 动态构建样式类名
      let classNames = ['count-num-container'];
      
      if (size) classNames.push(`size-${size}`);
      if (color) classNames.push(`color-${color}`);
      if (fontWeight) classNames.push(`weight-${fontWeight}`);
      if (animated) classNames.push('animated');
      if (responsive) classNames.push('responsive');
      
      this.setData({
        customClass: `${this.data.customClass} ${classNames.join(' ')}`
      });
    }
  }
}); 