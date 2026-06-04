Component({
  properties: {
    loading: {
      type: Boolean,
      value: false
    },
    size: {
      type: String,
      value: '100rpx'
    },
    thickness: {
      type: String,
      value: '2rpx'
    },
    color: {
      type: String,
      value: '#DF76B0'
    },
    trackColor: {
      type: String,
      value: ''
    },
    spinDuration: {
      type: Number,
      value: 800
    },
    /** 高亮对齐角度（border 高亮在右上约为 90deg） */
    alignAngle: {
      type: Number,
      value: 90
    },
    fadeDuration: {
      type: Number,
      value: 200
    },
    badgeFadeDuration: {
      type: Number,
      value: 200
    },
    showBadge: {
      type: Boolean,
      value: true
    },
    badgeText: {
      type: String,
      value: '√'
    },
    badgeColor: {
      type: String,
      value: '#DF76B0'
    },
    badgeSize: {
      type: String,
      value: '28rpx'
    }
  },

  data: {
    showRing: false,
    ringFading: false,
    badgeVisible: false,
    badgeShown: false,
    ringStyle: '',
    ringTransform: 'transform:rotate(0deg)',
    overlayStyle: '',
    badgeStyle: ''
  },

  observers: {
    loading(val) {
      if (val) {
        this._resetSpinState();
        this.setData({
          showRing: true,
          ringFading: false,
          badgeVisible: false,
          badgeShown: false,
          ringTransform: 'transform:rotate(0deg)'
        });
        this._startSpinLoop();
      } else if (this._wasLoading) {
        this._startCompleteAnimation();
      }
      this._wasLoading = !!val;
    },
    'size, thickness, color, trackColor, spinDuration, fadeDuration, badgeFadeDuration, badgeColor, badgeSize': function () {
      this._updateStyles();
    }
  },

  lifetimes: {
    attached() {
      this._wasLoading = !!this.properties.loading;
      this._resetSpinState();
      if (this.properties.loading) {
        this.setData({ showRing: true });
        this._startSpinLoop();
      }
      this._updateStyles();
    },
    detached() {
      this._clearTimers();
    }
  },

  methods: {
    _resetSpinState() {
      this._clearTimers();
      this._rotation = 0;
      this._completing = false;
      this._passedAlign = false;
      this._leftAlignZone = false;
      this._prevNorm = 0;
    },

    _clearTimers() {
      this._stopSpinLoop();
      if (this._phaseTimer) {
        clearTimeout(this._phaseTimer);
        this._phaseTimer = null;
      }
    },

    _startSpinLoop() {
      if (this._spinTimer) return;
      this._lastTick = Date.now();
      this._spinTimer = setInterval(() => this._tickSpin(), 16);
    },

    _stopSpinLoop() {
      if (this._spinTimer) {
        clearInterval(this._spinTimer);
        this._spinTimer = null;
      }
    },

    _normAngle(angle) {
      return ((angle % 360) + 360) % 360;
    },

    _crossedForward(prev, curr, target) {
      if (prev < curr) {
        return prev < target && curr >= target;
      }
      return prev < target || curr >= target;
    },

    _nearAngle(angle, target, epsilon) {
      const diff = Math.abs(angle - target);
      return diff <= epsilon || diff >= 360 - epsilon;
    },

    _tickSpin() {
      const now = Date.now();
      const delta = now - this._lastTick;
      this._lastTick = now;
      const degPerMs = 360 / this.properties.spinDuration;
      this._rotation += delta * degPerMs;

      const norm = this._normAngle(this._rotation);
      const prevNorm = this._prevNorm;
      const align = this.properties.alignAngle;
      const epsilon = 8;

      if (this._completing) {
        if (!this._passedAlign) {
          if (this._crossedForward(prevNorm, norm, align)) {
            this._passedAlign = true;
          }
        } else if (!this._leftAlignZone) {
          if (!this._nearAngle(norm, align, epsilon)) {
            this._leftAlignZone = true;
          }
        } else if (this._nearAngle(norm, align, epsilon)) {
          const snapped = Math.floor(this._rotation / 360) * 360 + align;
          this._rotation = snapped;
          this._completing = false;
          this._stopSpinLoop();
          this.setData({ ringTransform: `transform:rotate(${align}deg)` });
          this._beginFadeOut();
          this._prevNorm = align;
          return;
        }
      }

      this._prevNorm = norm;
      this.setData({ ringTransform: `transform:rotate(${norm}deg)` });
    },

    _startCompleteAnimation() {
      this.triggerEvent('completestart');
      this._completing = true;
      this._passedAlign = false;
      this._leftAlignZone = false;
      this._prevNorm = this._normAngle(this._rotation);
    },

    _beginFadeOut() {
      wx.nextTick(() => {
        const { showBadge, fadeDuration, badgeFadeDuration } = this.properties;

        if (showBadge) {
          this.setData({ badgeVisible: true });
        }

        wx.nextTick(() => {
          this.setData({
            ringFading: true,
            badgeShown: !!showBadge
          });
          this.triggerEvent('fadestart');

          this._phaseTimer = setTimeout(() => {
            this._phaseTimer = null;
            this.setData({ showRing: false, ringFading: false });
            this.triggerEvent('complete');
            this.triggerEvent('fadeend');
          }, Math.max(fadeDuration, showBadge ? badgeFadeDuration : 0));
        });
      });
    },

    _updateStyles() {
      const {
        size,
        thickness,
        color,
        trackColor,
        fadeDuration,
        badgeFadeDuration,
        badgeColor,
        badgeSize
      } = this.properties;
      const track = trackColor || this._hexToRgba(color, 0.2) || 'rgba(223, 118, 176, 0.2)';
      const badgeShadow = this._hexToRgba(badgeColor, 0.45) || 'rgba(223, 118, 176, 0.45)';

      this.setData({
        ringStyle: [
          `width:${size}`,
          `height:${size}`,
          `border-width:${thickness}`,
          `border-color:${track}`,
          `border-top-color:${color}`,
          `border-right-color:${color}`
        ].join(';'),
        overlayStyle: `transition:opacity ${fadeDuration}ms ease;`,
        badgeStyle: [
          `width:${badgeSize}`,
          `height:${badgeSize}`,
          `background:${badgeColor}`,
          `box-shadow:0 2rpx 8rpx ${badgeShadow}`,
          `transition:opacity ${badgeFadeDuration}ms ease`
        ].join(';')
      });
    },

    _hexToRgba(hex, alpha) {
      if (!hex || typeof hex !== 'string') return '';
      const raw = hex.replace('#', '').trim();
      if (raw.length !== 3 && raw.length !== 6) return '';
      const full = raw.length === 3
        ? raw.split('').map((c) => c + c).join('')
        : raw;
      const num = parseInt(full, 16);
      if (Number.isNaN(num)) return '';
      const r = (num >> 16) & 255;
      const g = (num >> 8) & 255;
      const b = num & 255;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
});
