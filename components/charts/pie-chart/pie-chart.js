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
    colors: {
      type: Array,
      value: ['#df76b0', '#9c88ff', '#5fb3d4', '#f4b844', '#67c23a', '#ff5722']
    }
  },

  data: {
    animationProgress: 0,
    canvasWidth: 0,
    canvasHeight: 0,
    dpr: 1
  },

  observers: {
    'data, height, colors': function () {
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
      query.select('.pie-canvas').boundingClientRect()
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
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) / 2 - 40;
      
      // 计算总值
      const total = this.data.data.reduce((sum, item) => sum + Number(item.value || 0), 0);
      
      // 开始动画
      this.animateChart(ctx, centerX, centerY, radius, total, width, height);
    },

    animateChart(ctx, centerX, centerY, radius, total, width, height) {
      let currentProgress = 0;
      const animate = () => {
        currentProgress += 0.02;
        if (currentProgress > 1) currentProgress = 1;
        
        this.clearAndDraw(ctx, centerX, centerY, radius, total, width, height, currentProgress);
        
        if (currentProgress < 1) {
          setTimeout(animate, 16); // 约60fps，1000ms/60 ≈ 16ms
  }
      };
      animate();
    },

    clearAndDraw(ctx, centerX, centerY, radius, total, width, height, progress) {
      ctx.clearRect(0, 0, width, height);
      
      let currentAngle = -Math.PI / 2; // 从顶部开始
      this.data.data.forEach((item, index) => {
        const v = Number(item.value || 0)
        const percentage = total > 0 ? (v / total) : 0
        const angle = percentage * 2 * Math.PI * progress;
        
        // 绘制扇形
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + angle);
        ctx.closePath();
        ctx.setFillStyle(this.data.colors[index % this.data.colors.length]);
        ctx.fill();
        
        // 绘制标签
        if (progress === 1 && angle > 0.1) {
          const labelAngle = currentAngle + angle / 2;
          const labelRadius = radius * 0.7;
          const labelX = centerX + Math.cos(labelAngle) * labelRadius;
          const labelY = centerY + Math.sin(labelAngle) * labelRadius;
          
          ctx.setFillStyle('#fff');
          ctx.setFontSize(12);
          ctx.textAlign = 'center';
          ctx.fillText(`${(percentage * 100).toFixed(1)}%`, labelX, labelY);
        }
        
        currentAngle += angle;
      });

      ctx.draw();
    },

    onTap() {
      this.triggerEvent('chartTap', { data: this.data.data });
    }
  }
}); 