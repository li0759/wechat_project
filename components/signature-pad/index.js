const { uploadSignature } = require('../../utils/event-clockin');

/** 固定 canvas-id，勿用动态绑定（会导致 createCanvasContext 与节点不一致） */
const CANVAS_ID = 'handwritingSignature';

Component({
  properties: {
    active: {
      type: Boolean,
      value: false,
      observer(visible) {
        if (visible) {
          this._scheduleInit(0);
        }
      },
    },
  },

  data: {
    hasStroke: false,
    submitting: false,
    canvasW: 300,
    canvasH: 180,
  },

  methods: {
    _scheduleInit(retry) {
      const count = retry || 0;
      setTimeout(() => {
        this._initCanvas((ok) => {
          if (!ok && count < 12) {
            this._scheduleInit(count + 1);
          }
        });
      }, count === 0 ? 200 : 160);
    },

    _createCtx() {
      return wx.createCanvasContext(CANVAS_ID, this);
    },

    _initCanvas(done) {
      const query = wx.createSelectorQuery().in(this);
      query.select('.signature-pad__canvas').boundingClientRect();
      query.exec((res) => {
        const rect = res && res[0];
        if (!rect || rect.width < 10 || rect.height < 10) {
          if (typeof done === 'function') done(false);
          return;
        }

        this._canvasW = rect.width;
        this._canvasH = rect.height;
        this._hasStroke = false;
        this._drawing = false;
        this._lastX = null;
        this._lastY = null;

        this.setData({
          canvasW: Math.floor(rect.width),
          canvasH: Math.floor(rect.height),
          hasStroke: false,
        });

        const ctx = this._createCtx();
        ctx.setFillStyle('#ffffff');
        ctx.fillRect(0, 0, rect.width, rect.height);
        ctx.draw(false, () => {
          this._canvasReady = true;
          if (typeof done === 'function') done(true);
        });
      });
    },

    _touchXY(e) {
      const t = (e.changedTouches && e.changedTouches[0])
        || (e.touches && e.touches[0]);
      if (!t) return null;
      if (typeof t.x === 'number' && typeof t.y === 'number') {
        return { x: t.x, y: t.y };
      }
      if (this._rect) {
        return {
          x: t.clientX - this._rect.left,
          y: t.clientY - this._rect.top,
        };
      }
      return null;
    },

    _refreshRect() {
      wx.createSelectorQuery()
        .in(this)
        .select('.signature-pad__canvas')
        .boundingClientRect((rect) => {
          if (rect && rect.width) this._rect = rect;
        })
        .exec();
    },

    onTouchStart(e) {
      if (!this._canvasReady) {
        this._scheduleInit(0);
        return;
      }
      this._refreshRect();
      const p = this._touchXY(e);
      if (!p) return;

      this._drawing = true;
      this._lastX = p.x;
      this._lastY = p.y;

      const ctx = this._createCtx();
      ctx.setStrokeStyle('#111111');
      ctx.setLineWidth(4);
      ctx.setLineCap('round');
      ctx.setLineJoin('round');
      ctx.moveTo(p.x, p.y);
      ctx.draw(true);
    },

    onTouchMove(e) {
      if (!this._drawing || !this._canvasReady) return;
      const p = this._touchXY(e);
      if (!p || this._lastX == null || this._lastY == null) return;

      const ctx = this._createCtx();
      ctx.setStrokeStyle('#111111');
      ctx.setLineWidth(4);
      ctx.setLineCap('round');
      ctx.setLineJoin('round');
      ctx.moveTo(this._lastX, this._lastY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.draw(true);

      this._lastX = p.x;
      this._lastY = p.y;
      if (!this._hasStroke) {
        this._hasStroke = true;
        this.setData({ hasStroke: true });
      }
    },

    onTouchEnd() {
      this._drawing = false;
    },

    onClear() {
      if (!this._canvasW) {
        this._scheduleInit(0);
        return;
      }
      this._hasStroke = false;
      this._drawing = false;
      this._lastX = null;
      this._lastY = null;
      const ctx = this._createCtx();
      ctx.setFillStyle('#ffffff');
      ctx.fillRect(0, 0, this._canvasW, this._canvasH);
      ctx.draw();
      this.setData({ hasStroke: false });
    },

    onConfirm() {
      if (this.data.submitting) return;
      if (!this._hasStroke && !this.data.hasStroke) {
        wx.showToast({ title: '请先签名', icon: 'none' });
        return;
      }
      if (!this._canvasReady) {
        wx.showToast({ title: '画布未就绪', icon: 'none' });
        this._scheduleInit(0);
        return;
      }
      this.setData({ submitting: true });
      wx.canvasToTempFilePath(
        {
          canvasId: CANVAS_ID,
          fileType: 'png',
          quality: 1,
          success: async (res) => {
            try {
              const fileId = await uploadSignature(res.tempFilePath);
              this.triggerEvent('confirm', { fileId, tempFilePath: res.tempFilePath });
            } catch (err) {
              wx.showToast({ title: err.message || '上传失败', icon: 'none' });
            } finally {
              this.setData({ submitting: false });
            }
          },
          fail: () => {
            this.setData({ submitting: false });
            wx.showToast({ title: '生成签名图失败', icon: 'none' });
          },
        },
        this,
      );
    },

    reset() {
      this._canvasReady = false;
      this._hasStroke = false;
      this._drawing = false;
      this._lastX = null;
      this._lastY = null;
      this.setData({ hasStroke: false });
      this._scheduleInit(0);
    },

    prepare() {
      this._canvasReady = false;
      this._scheduleInit(0);
    },
  },
});
