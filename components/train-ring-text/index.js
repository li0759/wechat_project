Component({
  properties: {
    texts: {
      type: Array,
      value: []
    },
    innerDiameter: {
      type: Number,
      value: 116
    },
    outerDiameter: {
      type: Number,
      value: 154
    },
    trackColor: {
      type: String,
      value: '#DF76B0'
    },
    textColor: {
      type: String,
      value: '#111111'
    },
    textFontSize: {
      type: Number,
      value: 18
    },
    charGapDeg: {
      type: Number,
      value: 5
    },
    waitMs: {
      type: Number,
      value: 1200
    },
    cycleMs: {
      type: Number,
      value: 500
    },
    speedDeg: {
      type: Number,
      value: 0
    },
    tunnelStartDeg: {
      type: Number,
      value: 150
    },
    tunnelEndDeg: {
      type: Number,
      value: 210
    }
  },

  data: {
    rootStyle: '',
    tunnelStartStyle: '',
    tunnelEndStyle: '',
    chars: []
  },

  observers: {
    'texts,innerDiameter,outerDiameter,trackColor,textColor,textFontSize,charGapDeg,waitMs,cycleMs,speedDeg,tunnelStartDeg,tunnelEndDeg': function() {
      this._buildGeometry();
      this._resetTrain(true);
    }
  },

  lifetimes: {
    attached() {
      this._tickMs = 40;
      this._timer = null;
      this._running = true;
      this._buildGeometry();
      this._resetTrain(true);
      this._startTicker();
    },
    detached() {
      this._stopTicker();
    }
  },

  pageLifetimes: {
    show() {
      this._running = true;
      this._startTicker();
    },
    hide() {
      this._running = false;
      this._stopTicker();
    }
  },

  methods: {
    _normalizeAngle(deg) {
      let v = deg % 360;
      if (v < 0) v += 360;
      return v;
    },

    _textList() {
      const list = (this.properties.texts || [])
        .map((t) => String(t == null ? '' : t).trim())
        .filter(Boolean);
      return list.length ? list : ['协会成员'];
    },

    _charWeight(ch) {
      const s = String(ch || '');
      if (/[\u3400-\u9fff]/.test(s)) return 1.0; // 中文
      if (/[0-9]/.test(s)) return 0.62; // 数字更窄
      if (/[a-zA-Z]/.test(s)) return 0.72; // 英文偏窄
      if (/[，。！？；：,.!?;:]/.test(s)) return 0.55; // 标点最窄
      return 0.85;
    },

    _charCenters(chars, baseDeg) {
      if (!Array.isArray(chars) || !chars.length) {
        return { centers: [], totalSpan: 0 };
      }
      if (chars.length === 1) {
        return { centers: [baseDeg], totalSpan: 0 };
      }
      const n = chars.length - 1;
      const fit = 52 / Math.max(1, n);
      const base = Math.max(9, Math.min(15, fit));
      const extra = Number(this.properties.charGapDeg) || 0;
      const unit = Math.max(6, base + extra);

      const advances = [];
      for (let i = 0; i < chars.length - 1; i++) {
        const w = (this._charWeight(chars[i]) + this._charWeight(chars[i + 1])) / 2;
        advances.push(unit * w);
      }
      const totalSpan = advances.reduce((s, v) => s + v, 0);
      const centers = [];
      let cur = baseDeg - totalSpan / 2;
      centers.push(cur);
      for (let i = 0; i < advances.length; i++) {
        cur += advances[i];
        centers.push(cur);
      }
      return { centers, totalSpan };
    },

    _inTunnel(angle) {
      const s = this._normalizeAngle(this.properties.tunnelStartDeg);
      const e = this._normalizeAngle(this.properties.tunnelEndDeg);
      const a = this._normalizeAngle(angle);
      if (s <= e) return a >= s && a <= e;
      return a >= s || a <= e;
    },

    _ringCenter() {
      const outer = Number(this.properties.outerDiameter) || 154;
      return outer / 2;
    },

    /** 比标准 ease-in-out 更激进：起步更慢，中段冲刺更快 */
    _boostEaseInOut(t) {
      const x = Math.max(0, Math.min(1, t));
      const p = 8.0;
      if (x < 0.5) {
        return 0.5 * Math.pow(x * 2, p);
      }
      return 1 - 0.5 * Math.pow((1 - x) * 2, p);
    },

    _buildGeometry() {
      const outer = Number(this.properties.outerDiameter) || 154;
      const c = this._ringCenter();
      const tunnelColor = '#f5f5f5';
      const mouthR = outer / 2 - 3;
      const mk = (deg) => {
        const a = (this._normalizeAngle(deg) - 90) * Math.PI / 180;
        const x = c + mouthR * Math.cos(a);
        const y = c + mouthR * Math.sin(a);
        return `left:${x}rpx;top:${y}rpx;transform:translate(-50%,-50%);background:${tunnelColor};`;
      };

      this.setData({
        rootStyle: `width:${outer}rpx;height:${outer}rpx;`,
        tunnelStartStyle: mk(this.properties.tunnelStartDeg),
        tunnelEndStyle: mk(this.properties.tunnelEndDeg)
      });
    },

    _resetTrain(resetIndex) {
      if (resetIndex || typeof this._textIdx !== 'number') this._textIdx = 0;
      this._baseDeg = 0;
      this._runProgress = 0;
      this._phase = 'dwell';
      this._waitLeft = Math.max(200, Number(this.properties.waitMs) || 1200);
      this._switchedInTunnel = false;
      this._renderChars();
    },

    _renderChars() {
      const list = this._textList();
      if (!list.length) {
        this.setData({ chars: [] });
        return;
      }
      const text = list[this._textIdx % list.length];
      const chars = Array.from(text);
      const outer = Number(this.properties.outerDiameter) || 154;
      const inner = Math.min(Number(this.properties.innerDiameter) || 116, outer - 4);
      const radius = (outer + inner) / 4;
      const center = this._ringCenter();
      const { centers } = this._charCenters(chars, this._baseDeg);

      const rendered = chars.map((ch, idx) => {
        const deg = this._normalizeAngle(centers[idx] ?? this._baseDeg);
        const rad = (deg - 90) * Math.PI / 180;
        const x = center + radius * Math.cos(rad);
        const y = center + radius * Math.sin(rad);
        const hidden = this._phase === 'run' && this._inTunnel(deg);
        return {
          id: `${this._textIdx}-${idx}`,
          style: [
            `left:${x}rpx`,
            `top:${y}rpx`,
            `transform:translate(-50%,-50%) rotate(${deg}deg)`,
            `font-size:${this.properties.textFontSize}rpx`,
            'background:transparent',
            `color:${this.properties.textColor}`,
            `opacity:${hidden ? 0 : 1}`
          ].join(';'),
          text: ch
        };
      });
      this.setData({ chars: rendered });
    },

    _startTicker() {
      if (this._timer || !this._running) return;
      this._timer = setInterval(() => this._tick(), this._tickMs);
    },

    _stopTicker() {
      if (!this._timer) return;
      clearInterval(this._timer);
      this._timer = null;
    },

    _tick() {
      if (!this._running) return;
      if (this._phase === 'dwell') {
        this._waitLeft -= this._tickMs;
        if (this._waitLeft <= 0) this._phase = 'run';
        return;
      }

      const customDeg = Number(this.properties.speedDeg);
      const cycleMsFromSpeed = Number.isFinite(customDeg) && customDeg > 0
        ? Math.max(120, (360 / customDeg) * this._tickMs)
        : null;
      const cycleMs = cycleMsFromSpeed || Math.max(200, Number(this.properties.cycleMs) || 500);
      this._runProgress = Math.min(1, this._runProgress + (this._tickMs / cycleMs));
      const eased = this._boostEaseInOut(this._runProgress);
      this._baseDeg = eased * 360;

      const curText = this._textList()[this._textIdx % this._textList().length];
      const chars = Array.from(curText);
      const { totalSpan: span } = this._charCenters(chars, this._baseDeg);
      const centerOffset = span / 2;
      const tunnelEnd = this._normalizeAngle(this.properties.tunnelEndDeg);
      const tunnelStart = this._normalizeAngle(this.properties.tunnelStartDeg);
      const switchAt = Math.min(tunnelEnd, tunnelStart + span + 2 - centerOffset);

      if (!this._switchedInTunnel && this._baseDeg >= switchAt) {
        const texts = this._textList();
        this._textIdx = (this._textIdx + 1) % texts.length;
        this._switchedInTunnel = true;
      }

      if (this._runProgress >= 1) {
        this._baseDeg = 0;
        this._runProgress = 0;
        this._phase = 'dwell';
        this._waitLeft = Math.max(200, Number(this.properties.waitMs) || 1200);
        this._switchedInTunnel = false;
      }
      this._renderChars();
    }
  }
});
