const DEFAULT_REVEAL_MS = 280
const NEED_LOAD_DELAY_MS = 360

Component({
  options: {
    multipleSlots: true,
  },

  properties: {
    /** 骨架淡出时长（ms），建议在 wxml 写死或绑定常量 */
    duration: {
      type: Number,
      value: DEFAULT_REVEAL_MS,
    },
    /**
     * 由父 panel 在 loadData 中切换：'' | 'start' | 'reveal' | 'revealAfterPaint'
     * 也可通过 run-load.js 的 runPanelLoad 自动 setData
     */
    command: {
      type: String,
      value: '',
    },
    /** 挂载后若父级未调 loadData，延迟触发 needload（与原先 behavior fallback 一致） */
    autoNeedLoad: {
      type: Boolean,
      value: true,
    },
  },

  data: {
    showSkeleton: true,
    skeletonFading: false,
    contentVisible: true,
  },

  observers: {
    command(cmd) {
      if (!cmd) return
      if (cmd === 'start') {
        this._applyStart()
        return
      }
      if (cmd === 'reveal') {
        this._applyReveal(false)
        return
      }
      if (cmd === 'revealAfterPaint') {
        this._applyReveal(true)
      }
    },
  },

  lifetimes: {
    attached() {
      if (this.properties.autoNeedLoad) {
        this._scheduleNeedLoad()
      }
    },
    detached() {
      if (this._needLoadTimer) {
        clearTimeout(this._needLoadTimer)
        this._needLoadTimer = null
      }
      if (this._revealTimer) {
        clearTimeout(this._revealTimer)
        this._revealTimer = null
      }
    },
  },

  methods: {
    _scheduleNeedLoad() {
      if (this._needLoadTimer) clearTimeout(this._needLoadTimer)
      this._needLoadTimer = setTimeout(() => {
        this._needLoadTimer = null
        if (this._loadStarted) return
        this.triggerEvent('needload')
      }, NEED_LOAD_DELAY_MS)
    },

    _markLoadStarted() {
      this._loadStarted = true
      if (this._needLoadTimer) {
        clearTimeout(this._needLoadTimer)
        this._needLoadTimer = null
      }
    },

    _applyStart() {
      this._markLoadStarted()
      this.setData({
        showSkeleton: true,
        skeletonFading: false,
        contentVisible: true,
      })
    },

    _applyReveal(afterPaint) {
      const revealMs = Number(this.properties.duration)
      const ms = Number.isFinite(revealMs) && revealMs >= 0 ? revealMs : DEFAULT_REVEAL_MS
      const run = () => {
        this.setData(
          {
            skeletonFading: true,
            contentVisible: true,
          },
          () => {
            if (this._revealTimer) clearTimeout(this._revealTimer)
            this._revealTimer = setTimeout(() => {
              this._revealTimer = null
              this.setData(
                {
                  showSkeleton: false,
                  skeletonFading: false,
                },
                () => {
                  this.triggerEvent('loaded')
                }
              )
            }, ms)
          }
        )
      }
      if (afterPaint) {
        wx.nextTick(() => {
          wx.nextTick(run)
        })
        return
      }
      run()
    },
  },
})
