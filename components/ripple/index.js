Component({
  options: {
    multipleSlots: true,
    addGlobalClass: true
  },

  properties: {
    // 涟漪颜色
    rippleColor: {
      type: String,
      value: 'rgba(0, 0, 0, 0.1)'
    },
    // 是否禁用涟漪效果
    disabled: {
      type: Boolean,
      value: false
    },
    // 涟漪扩散速度（毫秒）
    duration: {
      type: Number,
      value: 600
    },
    // 是否居中扩散（而非从点击位置）
    center: {
      type: Boolean,
      value: false
    },
    // 涟漪初始不透明度
    initialOpacity: {
      type: Number,
      value: 0.3
    },
    // 涟漪扩散比例（控制最终大小）
    spreadRatio: {
      type: Number,
      value: 1.0
    }
  },

  data: {
    ripples: [],
    rippleId: 0,
    longPressTimer: null,
    isLongPress: false
  },

  methods: {
    onTap(e) {
      // 拦截原生 tap 事件
      // 如果发生了拖动，阻止事件传播（不让 expandable-container 接收到）
      if (this.touchMoved) {
        // 阻止事件冒泡，expandable-container 不会收到这个 tap 事件
        if (e.stopPropagation) {
          e.stopPropagation();
        }
        return;
      }
      
      // 如果没有拖动，触发自定义 tap 事件，传递触摸坐标
      // 同时传递 x/y（给 expandable-container）和 changedTouches（给 home 页面）
      this.triggerEvent('tap', {
        x: this.tapX,
        y: this.tapY,
        // 兼容 home 页面：构造 changedTouches 数组
        changedTouches: [{
          clientX: this.tapX,
          clientY: this.tapY
        }]
      }, {
        bubbles: true,
        composed: true
      });
      
      // 阻止原生 tap 事件继续冒泡（因为我们已经触发了自定义事件）
      if (e.stopPropagation) {
        e.stopPropagation();
      }
    },

    onTouchStart(e) {
      if (this.data.disabled) {
        return;
      }

      const touch = e.touches[0];
      this.touchStartX = touch.pageX;
      this.touchStartY = touch.pageY;
      this.touchMoved = false;
      
      // 记录触摸坐标（用于 onTap 传递给 expandable-container）
      this.tapX = touch.clientX;
      this.tapY = touch.clientY;

      // 传递 touchstart 事件给父组件（用于 expandable-container_fullscreen）
      this.triggerEvent('touchstart', {
        touches: e.touches,
        changedTouches: e.changedTouches,
        timeStamp: e.timeStamp
      }, { bubbles: true, composed: true });

      const query = this.createSelectorQuery();
      
      query.select('.ripple-container').boundingClientRect((rect) => {
        if (!rect) return;

        let x, y;
        
        if (this.data.center) {
          // 居中扩散
          x = rect.width / 2;
          y = rect.height / 2;
        } else {
          // 从点击位置扩散
          x = touch.clientX - rect.left;
          y = touch.clientY - rect.top;
        }

        // 计算涟漪最大半径（到最远角的距离）
        const maxRadius = Math.sqrt(
          Math.pow(Math.max(x, rect.width - x), 2) + 
          Math.pow(Math.max(y, rect.height - y), 2)
        );

        const rippleId = this.data.rippleId + 1;
        const newRipple = {
          id: rippleId,
          x: x,
          y: y,
          size: maxRadius * 2 * this.data.spreadRatio,
          opacity: this.data.initialOpacity,
          expanding: true,
          fading: false
        };

        this.setData({
          ripples: [...this.data.ripples, newRipple],
          rippleId: rippleId,
          isLongPress: false
        });

        // 设置长按定时器
        this.data.longPressTimer = setTimeout(() => {
          this.setData({
            isLongPress: true
          });
        }, 350);

        // 扩散动画结束后，如果不是长按，开始淡出
        setTimeout(() => {
          if (!this.data.isLongPress) {
            this.fadeOutRipple(rippleId);
          }
        }, this.data.duration);
      }).exec();
    },

    onTouchEnd(e) {
      if (this.data.disabled) {
        return;
      }

      // 清除长按定时器
      if (this.data.longPressTimer) {
        clearTimeout(this.data.longPressTimer);
        this.data.longPressTimer = null;
      }

      // 如果发生了拖动，阻止 touchend 事件冒泡
      // 这样 expandable-container_fullscreen 就不会收到 touchend 事件
      if (this.touchMoved) {
        if (e.stopPropagation) {
          e.stopPropagation();
        }
      }

      // 淡出所有涟漪
      const ripples = this.data.ripples.map(ripple => ({
        ...ripple,
        expanding: false,
        fading: true
      }));

      this.setData({
        ripples: ripples,
        isLongPress: false
      });

      // 300ms 后清除所有涟漪
      setTimeout(() => {
        this.setData({
          ripples: []
        });
      }, 300);

      // 不再手动触发 tap 事件，让原生 tap 事件自然冒泡
      // onTap 方法会根据 touchMoved 决定是否阻止冒泡
    },

    onTouchMove(e) {
      // 传递 touchmove 事件给父组件
      this.triggerEvent('touchmove', {
        touches: e.touches,
        changedTouches: e.changedTouches,
        timeStamp: e.timeStamp
      }, { bubbles: true, composed: true });
      
      // 标记为移动，但不取消涟漪（允许拖动滚动）
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.pageX - this.touchStartX);
      const deltaY = Math.abs(touch.pageY - this.touchStartY);
      
      if (deltaX > 5 || deltaY > 5) {
        this.touchMoved = true;
      }
    },

    onTouchCancel() {
      this.cancelRipple();
    },

    fadeOutRipple(rippleId) {
      const ripples = this.data.ripples.map(ripple => {
        if (ripple.id === rippleId) {
          return {
            ...ripple,
            expanding: false,
            fading: true
          };
        }
        return ripple;
      });

      this.setData({
        ripples: ripples
      });

      // 300ms 后移除该涟漪
      setTimeout(() => {
        this.setData({
          ripples: this.data.ripples.filter(r => r.id !== rippleId)
        });
      }, 300);
    },

    cancelRipple() {
      // 清除长按定时器
      if (this.data.longPressTimer) {
        clearTimeout(this.data.longPressTimer);
        this.data.longPressTimer = null;
      }

      // 立即淡出所有涟漪
      const ripples = this.data.ripples.map(ripple => ({
        ...ripple,
        expanding: false,
        fading: true
      }));

      this.setData({
        ripples: ripples,
        isLongPress: false
      });

      setTimeout(() => {
        this.setData({
          ripples: []
        });
      }, 300);
    }
  }
});
