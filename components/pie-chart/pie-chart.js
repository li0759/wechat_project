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
    canvasId: '',
    animationProgress: 0
  },

  lifetimes: {
    attached() {
      this.setData({
        canvasId: `pie-chart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
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
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) / 2 - 40;
      
      // 计算总值
      const total = this.data.data.reduce((sum, item) => sum + item.value, 0);
      
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
        const percentage = item.value / total;
        const angle = percentage * 2 * Math.PI * progress;
        
        // 绘制扇形
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + angle);
        ctx.closePath();
        ctx.fillStyle = this.data.colors[index % this.data.colors.length];
        ctx.fill();
        
        // 绘制标签
        if (progress === 1 && angle > 0.1) {
          const labelAngle = currentAngle + angle / 2;
          const labelRadius = radius * 0.7;
          const labelX = centerX + Math.cos(labelAngle) * labelRadius;
          const labelY = centerY + Math.sin(labelAngle) * labelRadius;
          
          ctx.fillStyle = '#fff';
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${(percentage * 100).toFixed(1)}%`, labelX, labelY);
        }
        
        currentAngle += angle;
      });
    },

    onTap() {
      this.triggerEvent('chartTap', { data: this.data.data });
    }
  }
}); 