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
    canvasId: '',
    animationProgress: 0
  },

  lifetimes: {
    attached() {
      this.setData({
        canvasId: `bar-chart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      });
      this.initChart();
    }
  },

  methods: {
    initChart() {
      if (!this.data.data || this.data.data.length === 0) return;
      
      const query = this.createSelectorQuery();
      query.select(`#${this.data.canvasId}`)
        .fields({ node: true, size: true })
        .exec((res) => {
          if (res[0]) {
            const canvas = res[0].node;
            const ctx = canvas.getContext('2d');
            const dpr = wx.getSystemInfoSync().pixelRatio;
            
            canvas.width = res[0].width * dpr;
            canvas.height = res[0].height * dpr;
            ctx.scale(dpr, dpr);
            
            this.drawChart(ctx, res[0].width, res[0].height);
          }
        });
    },

    drawChart(ctx, width, height) {
      const padding = 60;
      const chartWidth = width - padding * 2;
      const chartHeight = height - padding * 2;
      
      // 计算最大值
      const maxValue = this.data.maxValue || Math.max(...this.data.data.map(item => item.value));
      
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
    },

    drawAxes(ctx, padding, chartWidth, chartHeight, maxValue) {
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#666';
      
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
      for (let i = 0; i <= ySteps; i++) {
        const y = padding + chartHeight - (i / ySteps) * chartHeight;
        const value = Math.round((i / ySteps) * maxValue);
        
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(value.toString(), padding - 10, y);
        
        // 网格线
        if (i > 0) {
          ctx.beginPath();
          ctx.strokeStyle = '#f0f0f0';
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
        const barHeight = (item.value / maxValue) * chartHeight * progress;
        const x = padding + index * (barWidth + barSpacing) + barSpacing / 2;
        const y = padding + chartHeight - barHeight;
        
        // 绘制柱子
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, this.data.barColor);
        gradient.addColorStop(1, this.adjustColor(this.data.barColor, -20));
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barHeight);
        
        // 绘制阴影
        ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        ctx.fillRect(x, y, barWidth, barHeight);
        ctx.shadowColor = 'transparent';
        
        // X轴标签
        ctx.fillStyle = '#666';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = '11px sans-serif';
        
        // 处理长标签
        const label = item.name.length > 6 ? item.name.substr(0, 6) + '...' : item.name;
        ctx.fillText(label, x + barWidth / 2, padding + chartHeight + 10);
        
        // 显示数值
        if (this.data.showValue && progress === 1) {
          ctx.fillStyle = '#333';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText(item.value.toString(), x + barWidth / 2, y - 5);
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