Component({
  properties: {
    title: {
      type: String,
      value: ''
    },
    value: {
      type: Number,
      value: 0
    },
    unit: {
      type: String,
      value: ''
    },
    icon: {
      type: String,
      value: 'star-o'
    },
    color: {
      type: String,
      value: '#df76b0'
    },
    trend: {
      type: Number,
      value: 0 // 正数表示上升，负数表示下降，0表示无趋势
    },
    showAnimation: {
      type: Boolean,
      value: true
    }
  },

  data: {
    displayValue: 0,
    isAnimating: false
  },

  lifetimes: {
    attached() {
      if (this.data.showAnimation) {
        this.animateValue();
      } else {
        this.setData({
          displayValue: this.data.value
        });
      }
    }
  },

  observers: {
    'value': function(newValue) {
      if (this.data.showAnimation) {
        this.animateValue(newValue);
      } else {
        this.setData({
          displayValue: newValue
        });
      }
    }
  },

  methods: {
    animateValue(targetValue = this.data.value) {
      if (this.data.isAnimating) return;
      
      this.setData({ isAnimating: true });
      
      const startValue = this.data.displayValue;
      const difference = targetValue - startValue;
      const duration = 1000; // 1秒动画
      const steps = 60; // 60帧
      const stepValue = difference / steps;
      const stepTime = duration / steps;
      
      let currentStep = 0;
      
      const animate = () => {
        currentStep++;
        const currentValue = startValue + (stepValue * currentStep);
        
        this.setData({
          displayValue: Math.round(currentValue)
        });
        
        if (currentStep < steps) {
          setTimeout(animate, stepTime);
        } else {
          this.setData({
            displayValue: targetValue,
            isAnimating: false
          });
        }
      };
      
      animate();
    },

    onTap() {
      this.triggerEvent('cardTap', {
        title: this.data.title,
        value: this.data.value,
        unit: this.data.unit
      });
    }
  }
}); 