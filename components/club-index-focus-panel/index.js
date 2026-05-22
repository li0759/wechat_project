/**
 * 索引列表左滑详情窗（对齐 expandable-container_fullscreen：拖过临界点继续收回，否则回弹）
 */
Component({
  options: {
    multipleSlots: true,
    styleIsolation: 'apply-shared',
  },

  properties: {
    /** 是否展开 */
    visible: { type: Boolean, value: false },
    /** 多选等场景下隐藏面板 */
    hidden: { type: Boolean, value: false },
    /** 面板左侧留白（rpx），露出列表行头像区 */
    leftInsetRpx: { type: Number, value: 116 },
    /** 右滑超过该距离（rpx）松手后继续收回 */
    dismissThresholdRpx: { type: Number, value: 150 },
    lowerThreshold: { type: Number, value: 80 },
  },

  data: {
    dragX: 0,
    dragTransform: '',
    dragTransition: '',
    gestureDismissing: false,
  },

  observers: {
    visible(open) {
      if (open) this.resetDragState()
    },
  },

  methods: {
    resetDragState() {
      this.__gestureAxis = null
      this.__dragging = false
      this.setData({
        dragX: 0,
        dragTransform: '',
        dragTransition: '',
        gestureDismissing: false,
      })
    },

    /** 供外部关闭按钮或逻辑调用 */
    collapse() {
      if (!this.properties.visible || this.data.gestureDismissing) return
      this.resetDragState()
      this.triggerEvent('close', { by: 'api' })
    },

    onPanelScrollToLower() {
      this.triggerEvent('scrolltolower', {})
    },

    onPanelTouchStart(e) {
      if (!this.properties.visible || this.data.gestureDismissing) return
      const t = e?.touches?.[0]
      if (!t) return
      try {
        const sys = wx.getSystemInfoSync()
        this.__panelWidth = Number(sys.windowWidth || 375)
      } catch (err) {
        this.__panelWidth = 375
      }
      this.__touchStartX = t.clientX
      this.__touchStartY = t.clientY
      this.__gestureAxis = null
      this.__dragging = false
      this.__lastDx = 0
      this.__lastDy = 0
    },

    onPanelTouchMove(e) {
      if (!this.properties.visible || this.data.gestureDismissing) return
      const t = e?.touches?.[0]
      if (!t) return
      const dx = t.clientX - (this.__touchStartX || 0)
      const dy = t.clientY - (this.__touchStartY || 0)
      this.__lastDx = dx
      this.__lastDy = dy

      if (!this.__gestureAxis) {
        const adx = Math.abs(dx)
        const ady = Math.abs(dy)
        if (adx > ady + 6) this.__gestureAxis = 'x'
        else if (ady > adx + 4) this.__gestureAxis = 'y'
        else return
      }

      if (this.__gestureAxis !== 'x' || dx <= 0) return
      const maxPx = Math.max(0, this.__panelWidth || 375) + 80
      const x = Math.min(maxPx, dx)
      if (!this.__dragging) {
        this.__dragging = true
        this.setData({ dragTransition: '' })
      }
      this.setData({
        dragX: x,
        dragTransform: `translate3d(${x}px,0,0)`,
      })
    },

    onPanelTouchEnd() {
      if (!this.properties.visible || this.data.gestureDismissing) return
      const axis = this.__gestureAxis
      if (axis === 'y') {
        this.__gestureAxis = null
        this.__dragging = false
        return
      }

      if (axis === 'x') {
        let thresholdPx = 120
        try {
          const sys = wx.getSystemInfoSync()
          thresholdPx = Number(this.properties.dismissThresholdRpx || 150)
            * Number(sys.windowWidth || 375) / 750
        } catch (err) {}
        if (Number(this.data.dragX || 0) >= thresholdPx) {
          this.gestureDismiss()
        } else if (this.__dragging) {
          this.setData({
            dragTransition: 'transform 220ms cubic-bezier(0.22,1,0.36,1)',
            dragX: 0,
            dragTransform: 'translate3d(0,0,0)',
          })
          setTimeout(() => {
            if (this.properties.visible) this.resetDragState()
          }, 260)
        }
      }

      this.__gestureAxis = null
      this.__dragging = false
    },

    onPanelTouchCancel() {
      this.onPanelTouchEnd()
    },

    gestureDismiss() {
      if (!this.properties.visible || this.data.gestureDismissing) return
      const slideDur = 220
      let panelWidth = 375
      try {
        panelWidth = Number(wx.getSystemInfoSync().windowWidth || 375)
      } catch (e) {}
      const offX = panelWidth + 80
      this.setData({
        gestureDismissing: true,
        dragTransition: `transform ${slideDur}ms linear`,
        dragX: offX,
        dragTransform: `translate3d(${offX}px,0,0)`,
      })
      setTimeout(() => {
        this.resetDragState()
        this.triggerEvent('close', { by: 'gesture' })
        this.triggerEvent('collapsed', { by: 'gesture' })
      }, Math.floor(slideDur * 0.7))
    },
  },
})
