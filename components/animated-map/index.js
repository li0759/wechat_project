Component({
  properties: {
    mapUrl: { type: String, value: '' },            // 原始地图 URL（包含 zoom=数字 或不包含）
    zoomMin: { type: Number, value: 14 },           // 预加载最小 zoom
    zoomMax: { type: Number, value: 16 },           // 预加载最大 zoom
    animMs: { type: Number, value: 800 },           // 缩放动画时长
    pauseMs: { type: Number, value: 5000 },         // 每步动画后的暂停时长
    fadeMs: { type: Number, value: 300 },           // 上层淡出时长
    enlargeTo: { type: Number, value: 2 },          // 放大步目标 scale
    shrinkFrom: { type: Number, value: 2 },         // 缩小步起始 scale
    shrinkTo: { type: Number, value: 1 },           // 缩小步目标 scale
    baseScale: { type: Number, value: 1 },          // 常态 scale
    heightRpx: { type: Number, value: 200 },        // 组件高度（rpx）
    clipRadiusRpx: { type: Number, value: 0 },      // 裁剪圆角（rpx），0 为直角
    widthRpx: { type: Number, value: 0 },           // 宽度（rpx），0 表示 100%
    showEdgeFades: { type: Boolean, value: false }, // 左 / 下 / 左下角边缘渐变（与 club 活动地图一致）
  },

  data: {
    frames: [],
    framesLoaded: 0,
    framesTotal: 0,

    topUrl: '',
    topScale: 1,
    topOpacity: 1,
    topTransitionMs: 0,

    bottomUrl: '',
    bottomScale: 1,
    bottomTransitionMs: 0,

    ready: false,

    rootStyle: '',
  },

  observers: {
    'mapUrl,zoomMin,zoomMax': function () {
      this._setupFrames();
    },
    'heightRpx,clipRadiusRpx,widthRpx': function () {
      this._updateLayoutStyle();
    },
  },

  lifetimes: {
    attached() {
      this._running = false;
      this._timer = null;
      this._stepTimer = null;
      this._updateLayoutStyle();
      this._setupFrames();
    },
    detached() {
      this._stop();
    }
  },

  methods: {
    _updateLayoutStyle() {
      const h = Number(this.properties.heightRpx) || 200;
      const r = Number(this.properties.clipRadiusRpx) || 0;
      const w = Number(this.properties.widthRpx) || 0;
      const widthPart = w > 0 ? `width: ${w}rpx;` : 'width: 100%;';
      const rootStyle = `height: ${h}rpx; ${widthPart} border-radius: ${r}rpx;`;

      this.setData({ rootStyle });
    },

    _stop() {
      this._running = false;
      if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
      if (this._stepTimer) {
        clearTimeout(this._stepTimer);
        this._stepTimer = null;
      }
    },

    _replaceZoom(url, zoom) {
      if (!url) return url;
      if (url.includes('zoom=')) return url.replace(/zoom=\d+/i, `zoom=${zoom}`);
      const sep = url.includes('?') ? '&' : '?';
      return `${url}${sep}zoom=${zoom}`;
    },

    _getFrameUrl(zoom) {
      const frames = this.data.frames || [];
      return (frames.find(f => f.zoom === zoom)?.url) || this.data.topUrl || this.properties.mapUrl || '';
    },

    _setupFrames() {
      this._stop();
      const mapUrl = String(this.properties.mapUrl || '').trim();
      const zoomMin = Number(this.properties.zoomMin);
      const zoomMax = Number(this.properties.zoomMax);

      if (!mapUrl || !Number.isFinite(zoomMin) || !Number.isFinite(zoomMax) || zoomMin > zoomMax) {
        this.setData({
          frames: [],
          framesLoaded: 0,
          framesTotal: 0,
          topUrl: mapUrl || '',
          bottomUrl: mapUrl || '',
          topScale: this.properties.baseScale,
          bottomScale: this.properties.baseScale,
          topOpacity: 1,
          topTransitionMs: 0,
          bottomTransitionMs: 0,
          ready: false,
        });
        return;
      }

      const frames = [];
      for (let z = zoomMin; z <= zoomMax; z++) frames.push({ zoom: z, url: this._replaceZoom(mapUrl, z) });

      const firstUrl = frames[0]?.url || mapUrl;
      this.setData({
        frames,
        framesLoaded: 0,
        framesTotal: frames.length,
        topUrl: firstUrl,
        bottomUrl: firstUrl,
        topScale: this.properties.baseScale,
        bottomScale: this.properties.baseScale,
        topOpacity: 1,
        topTransitionMs: 0,
        bottomTransitionMs: 0,
        ready: false,
      });
    },

    onFrameLoad() {
      const next = (this.data.framesLoaded || 0) + 1;
      this.setData({ framesLoaded: next }, () => {
        if (!this.data.ready && next >= (this.data.framesTotal || 0) && (this.data.framesTotal || 0) > 0) {
          this._start();
        }
      });
    },

    onFrameError() {
      // 某帧失败也继续，避免永远卡着
      const next = (this.data.framesLoaded || 0) + 1;
      this.setData({ framesLoaded: next }, () => {
        if (!this.data.ready && next >= (this.data.framesTotal || 0) && (this.data.framesTotal || 0) > 0) {
          this._start();
        }
      });
    },

    _fadeOutTop(cb) {
      const fadeMs = Number(this.properties.fadeMs) || 300;
      this.setData({ topOpacity: 0 }, () => {
        this._stepTimer = setTimeout(() => cb && cb(), fadeMs);
      });
    },

    _syncTopToBottom(cb) {
      this.setData({
        topUrl: this.data.bottomUrl,
        topScale: this.data.bottomScale,
        topOpacity: 1,
        topTransitionMs: 0,
      }, () => cb && cb());
    },

    _start() {
      this._stop();
      const frames = this.data.frames || [];
      if (frames.length < 3) return;

      const zoomMin = Number(this.properties.zoomMin);
      const zoomMax = Number(this.properties.zoomMax);
      const mid = zoomMax - 1;

      // 固定循环：min->mid, mid->max, max->mid, mid->min
      const steps = [
        { type: 'enlargeThenReveal', from: zoomMin, to: mid },
        { type: 'enlargeThenReveal', from: mid, to: zoomMax },
        { type: 'revealThenShrink', from: zoomMax, to: mid },
        { type: 'revealThenShrink', from: mid, to: zoomMin },
      ];

      const animMs = Number(this.properties.animMs) || 800;
      const pauseMs = Number(this.properties.pauseMs) || 5000;
      const tickMs = 40;
      const enlargeTo = Number(this.properties.enlargeTo) || 2;
      const baseScale = Number(this.properties.baseScale) || 1;
      const shrinkFrom = Number(this.properties.shrinkFrom) || 2;
      const shrinkTo = Number(this.properties.shrinkTo) || 1;

      let idx = 0;
      this._running = true;
      this.setData({ ready: true });

      // 初始 min
      this.setData({
        topUrl: this._getFrameUrl(zoomMin),
        bottomUrl: this._getFrameUrl(zoomMin),
        topScale: baseScale,
        bottomScale: baseScale,
        topOpacity: 1,
        topTransitionMs: 0,
        bottomTransitionMs: 0,
      });

      const next = () => {
        if (!this._running) return;
        const step = steps[idx];

        if (step.type === 'enlargeThenReveal') {
          this.setData({
            bottomUrl: this._getFrameUrl(step.to),
            bottomScale: baseScale,
            bottomTransitionMs: 0,
            topUrl: this._getFrameUrl(step.from),
            topScale: baseScale,
            topOpacity: 1,
            topTransitionMs: 0,
          }, () => {
            this._stepTimer = setTimeout(() => {
              if (!this._running) return;
              this.setData({ topTransitionMs: animMs, topScale: enlargeTo });
              this._stepTimer = setTimeout(() => {
                if (!this._running) return;
                this._fadeOutTop(() => {
                  this._syncTopToBottom(() => {
                    this._stepTimer = setTimeout(() => {
                      idx = (idx + 1) % steps.length;
                      this._stepTimer = setTimeout(next, tickMs);
                    }, pauseMs);
                  });
                });
              }, animMs);
            }, tickMs);
          });
          return;
        }

        // revealThenShrink
        this.setData({
          bottomUrl: this._getFrameUrl(step.to),
          bottomScale: shrinkFrom,
          bottomTransitionMs: 0,
          topOpacity: 1,
        }, () => {
          this._fadeOutTop(() => {
            // 保持 top 透明，让下层缩小动画可见
            this.setData({ topOpacity: 0 }, () => {
              this._stepTimer = setTimeout(() => {
                if (!this._running) return;
                // 两段式触发，确保动画起效
                this.setData({ bottomTransitionMs: animMs }, () => {
                  this._stepTimer = setTimeout(() => {
                    if (!this._running) return;
                    this.setData({ bottomScale: shrinkTo });
                  }, tickMs);
                });

                this._stepTimer = setTimeout(() => {
                  if (!this._running) return;
                  this._syncTopToBottom(() => {
                    this._stepTimer = setTimeout(() => {
                      idx = (idx + 1) % steps.length;
                      this._stepTimer = setTimeout(next, tickMs);
                    }, pauseMs);
                  });
                }, animMs + tickMs);
              }, tickMs);
            });
          });
        });
      };

      next();
    },
  }
});

