Component({
  properties: {
    data: {
      type: Array,
      value: []
    },
    title: {
      type: String,
      value: ''
    },
    height: {
      type: Number,
      value: 300
    },
    barColor: {
      type: String,
      value: '#df76b0'
    },
    showValue: {
      type: Boolean,
      value: true
    },
    maxValue: {
      type: Number,
      value: 0 // 0表示自动计算
  }
  },

  data: {
    animationProgress: 0,
    canvasWidth: 0,
    canvasHeight: 0,
    dpr: 1
  },

  observers: {
    'data, height, barColor, showValue, maxValue': function () {
      this.scheduleInit()
    }
  },

  lifetimes: {
    ready() {
      this.scheduleInit()
    }
  },

  methods: {
    scheduleInit() {
      if (this.__initTimer) clearTimeout(this.__initTimer)
      this.__initTimer = setTimeout(() => {
        try { wx.nextTick(() => this.initChart()) } catch (e) { this.initChart() }
      }, 30)
    },

    initChart() {
      if (!this.data.data || this.data.data.length === 0) return;

      const query = this.createSelectorQuery()
      query.select('.bar-canvas').boundingClientRect()
        .exec((res) => {
          const rect = res && res[0]
          if (!rect) return
          if (!rect.width || !rect.height) return
          const dpr = Number(wx.getSystemInfoSync().pixelRatio || 1)
          const w = Math.max(1, Math.floor(Number(rect.width || 0) * dpr))
          const h = Math.max(1, Math.floor(Number(rect.height || 0) * dpr))
          this.setData({ canvasWidth: w, canvasHeight: h, dpr }, () => {
            this.draw()
          })
        })
    },

    draw() {
      if (!this.data.data || this.data.data.length === 0) return
      const ctx = wx.createCanvasContext('canvas', this)
      const dpr = Number(this.data.dpr || 1)
      const width = Math.max(1, Number(this.data.canvasWidth || 0) / dpr)
      const height = Math.max(1, Number(this.data.canvasHeight || 0) / dpr)
      ctx.save()
      ctx.scale(dpr, dpr)
      this.drawChart(ctx, width, height)
      ctx.restore()
    },

    drawChart(ctx, width, height) {
      const padding = 60;
      const chartWidth = width - padding * 2;
      const chartHeight = height - padding * 2;
      
      // 计算最大值，添加数值验证
    let maxValue = this.data.maxValue;
      if (!maxValue || maxValue <= 0) {
        const values = this.data.data.map(item => {
          const val = parseFloat(item.value);
          return isFinite(val) ? val : 0;
        });
        maxValue = Math.max(...values);
        // 如果所有值都无效，设置默认最大值
    if (!isFinite(maxValue) || maxValue <= 0) {
          maxValue = 100;
        }
      }
      
      // 开始动画
      this.animateChart(ctx, width, height, chartWidth, chartHeight, padding, maxValue);
    },

    animateChart(ctx, width, height, chartWidth, chartHeight, padding, maxValue) {
      let currentProgress = 0;
      const animate = () => {
        currentProgress += 0.03;
        if (currentProgress > 1) currentProgress = 1;
        
        this.clearAndDraw(ctx, width, height, chartWidth, chartHeight, padding, maxValue, currentProgress);
        
        if (currentProgress < 1) {
          setTimeout(animate, 16); // 约60fps，1000ms/60 ≈ 16ms
  }
      };
      animate();
    },

    clearAndDraw(ctx, width, height, chartWidth, chartHeight, padding, maxValue, progress) {
      ctx.clearRect(0, 0, width, height);
      
      // 绘制坐标轴
      this.drawAxes(ctx, padding, chartWidth, chartHeight, maxValue);
      
      // 绘制柱状图
      this.drawBars(ctx, padding, chartWidth, chartHeight, maxValue, progress);

      // 旧版 canvas 需要显式 draw
      ctx.draw();
    },

    drawAxes(ctx, padding, chartWidth, chartHeight, maxValue) {
      ctx.setStrokeStyle('#e0e0e0');
      ctx.setLineWidth(1);
      ctx.setFontSize(12);
      ctx.setFillStyle('#666');
      
      // Y轴
      ctx.beginPath();
      ctx.moveTo(padding, padding);
      ctx.lineTo(padding, padding + chartHeight);
      ctx.stroke();
      
      // X轴
      ctx.beginPath();
      ctx.moveTo(padding, padding + chartHeight);
      ctx.lineTo(padding + chartWidth, padding + chartHeight);
      ctx.stroke();
      
      // Y轴刻度
    const ySteps = 5;
      const safeMaxValue = isFinite(maxValue) && maxValue > 0 ? maxValue : 100;
      
      for (let i = 0; i <= ySteps; i++) {
        const y = padding + chartHeight - (i / ySteps) * chartHeight;
        const value = Math.round((i / ySteps) * safeMaxValue);
        
        // 确保值是有限的
    if (!isFinite(value) || !isFinite(y)) continue;
        
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(value.toString(), padding - 10, y);
        
        // 网格线
    if (i > 0) {
          ctx.beginPath();
          ctx.setStrokeStyle('#f0f0f0');
          ctx.moveTo(padding, y);
          ctx.lineTo(padding + chartWidth, y);
          ctx.stroke();
        }
      }
    },

    drawBars(ctx, padding, chartWidth, chartHeight, maxValue, progress) {
      const barWidth = chartWidth / this.data.data.length * 0.8;
      const barSpacing = chartWidth / this.data.data.length * 0.2;
      
      this.data.data.forEach((item, index) => {
        // 数值验证和处理
    const itemValue = parseFloat(item.value);
        const safeValue = isFinite(itemValue) && itemValue >= 0 ? itemValue : 0;
        const safeMaxValue = isFinite(maxValue) && maxValue > 0 ? maxValue : 100;
        const safeProgress = isFinite(progress) && progress >= 0 && progress <= 1 ? progress : 1;
        
        const barHeight = (safeValue / safeMaxValue) * chartHeight * safeProgress;
        const x = padding + index * (barWidth + barSpacing) + barSpacing / 2;
        const y = padding + chartHeight - barHeight;
        
        // 确保坐标值是有限的
    if (!isFinite(barHeight) || !isFinite(x) || !isFinite(y) || barHeight <= 0) {
          return; // 跳过无效的柱子
  }
        
        // 绘制柱子
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, this.data.barColor);
        gradient.addColorStop(1, this.adjustColor(this.data.barColor, -20));
        
        ctx.setFillStyle(gradient);
        ctx.fillRect(x, y, barWidth, barHeight);
        // 旧版 canvas 的 shadow 兼容性不稳定，这里不使用阴影避免渲染问题
        
        // X轴标签
        ctx.setFillStyle('#666');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.setFontSize(11);
        
        // 处理长标签
    const labelText = item.name || `项目${index + 1}`;
        const label = labelText.length > 6 ? labelText.substr(0, 6) + '...' : labelText;
        ctx.fillText(label, x + barWidth / 2, padding + chartHeight + 10);
        
        // 显示数值
    if (this.data.showValue && safeProgress === 1) {
          ctx.setFillStyle('#333');
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.setFontSize(12);
          ctx.fillText(safeValue.toString(), x + barWidth / 2, y - 5);
        }
      });
    },

    adjustColor(color, amount) {
      // 简单的颜色调整函数
    const clamp = (val, min = 0, max = 255) => Math.max(min, Math.min(max, val));
      
      const hex = color.replace('#', '');
      const r = clamp(parseInt(hex.substr(0, 2), 16) + amount);
      const g = clamp(parseInt(hex.substr(2, 2), 16) + amount);
      const b = clamp(parseInt(hex.substr(4, 2), 16) + amount);
      
      return `rgb(${r}, ${g}, ${b})`;
    },

    onTap() {
      this.triggerEvent('chartTap', { data: this.data.data });
    }
  }
}); 