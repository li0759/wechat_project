// components/expandable-container/index.js
// 新版：点击后显示遮罩+弹窗，通过"显示层"圆形扩展+涟漪挖空动画展示弹窗内容
  Component({
  options: {
    multipleSlots: true,
    styleIsolation: 'apply-shared'
  },

  properties: {
    expandedWidth: { type: Number, value: 700 },
    expandedHeight: { type: Number, value: 800 },
    bgColor: { type: String, value: 'rgba(223, 118, 176, 0.8)' },
    // 展开/收起的主要节奏（clip 扩展 + 涟漪遮罩）
    animationDuration: { type: Number, value: 200 },
    zIndex: { type: Number, value: 1000 }
  },

  data: {
    isExpanded: false,
    isExpanding: false,
    effectiveZIndex: 1000,
    // 弹窗 fixed 外框（不含 clip-path，避免与涟漪层同节点改 style 触发整段动画重启）
    popupFrameStyle: '',
    // 仅 clip-path + transition，挂在内层
    popupClipStyle: '',
    clipVisible: false,
    // 涟漪遮罩层状态
    rippleMaskClass: '',
    // 涟漪遮罩层颜色（优先来自 trigger rippleColor）
    maskColor: 'rgba(223, 118, 176, 0.8)',
    // 涟漪遮罩层动画时长（ms）
    rippleDur: 200,
    // 点击坐标
    tapX: 0,
    tapY: 0
  },

  lifetimes: {
    created() {
      this.__expandableStackRole = 'clip'
    },
    attached() {},
    detached() {
      if (this.__expandClipTimer) {
        clearTimeout(this.__expandClipTimer)
        this.__expandClipTimer = null
      }
      this.__clipPcCollapsing = false
      this.__expandAnimSeq = (this.__expandAnimSeq || 0) + 1
      this.__expandBusy = false
      this.popFromHostStack()
      try {
        const app = getApp()
        if (app && typeof app.syncExpandablePcShowToTop === 'function') app.syncExpandablePcShowToTop()
      } catch (e) {}
    }
  },

  methods: {
    /** 推迟到下一渲染周期再通知父组件，避免 bind:expand 里同步 setData 与弹窗自身 setData 同帧交错导致整面板重绘（像双涟漪/内容闪一下） */
    emitExpandEventDeferred() {
      const emit = () => {
        try {
          const d = this.data
          if (!d.isExpanded && !d.isExpanding) return
          this.triggerEvent('expand', {})
        } catch (e) {}
      }
      if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
        wx.nextTick(emit)
      } else {
        setTimeout(emit, 0)
      }
    },

    emitCollapseEventDeferred() {
      const emit = () => {
        try {
          this.triggerEvent('collapse', {})
        } catch (e) {}
      }
      if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
        wx.nextTick(emit)
      } else {
        setTimeout(emit, 0)
      }
    },

    nextEffectiveZIndex() {
      try {
        const app = getApp()
        if (!app.globalData) app.globalData = {}
        const base = Math.max(Number(this.properties.zIndex || 0), 20000)
        const current = Number(app.globalData.__expandableZIndexBase || 0)
        const next = Math.max(current + 10, base)
        app.globalData.__expandableZIndexBase = next
        return next
      } catch (e) {
        return Math.max(Number(this.properties.zIndex || 0), 20000)
      }
    },

    pushToHostStack() {
      try {
        const app = getApp()
        if (!app.globalData) app.globalData = {}
        if (!Array.isArray(app.globalData.__expandableStack)) app.globalData.__expandableStack = []
        app.globalData.__expandableStack.push(this)
      } catch (e) {}
    },

    popFromHostStack() {
      try {
        const app = getApp()
        const stack = app?.globalData?.__expandableStack
        if (Array.isArray(stack)) {
          const idx = stack.lastIndexOf(this)
          if (idx >= 0) stack.splice(idx, 1)
        }
      } catch (e) {}
    },

    convertColorFormat(color) {
      if (!color) return '#6750A4'
      if (color.startsWith('#')) return color
      if (color.startsWith('rgb(')) {
        const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
        if (m) return `#${parseInt(m[1]).toString(16).padStart(2,'0')}${parseInt(m[2]).toString(16).padStart(2,'0')}${parseInt(m[3]).toString(16).padStart(2,'0')}`
      }
      if (color.startsWith('rgba(')) {
        const m = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/)
        if (m) return `#${parseInt(m[1]).toString(16).padStart(2,'0')}${parseInt(m[2]).toString(16).padStart(2,'0')}${parseInt(m[3]).toString(16).padStart(2,'0')}`
      }
      return color
    },

    handleTriggerTap(e) {
      if (this.data.isExpanded || this.data.isExpanding) return
      
      let tapX, tapY
      if (e && e.touches && e.touches[0]) {
        tapX = e.touches[0].clientX
        tapY = e.touches[0].clientY
      } else if (e && e.detail) {
        tapX = e.detail.x
        tapY = e.detail.y
      } else {
        const sys = wx.getSystemInfoSync()
        tapX = sys.windowWidth / 2
        tapY = sys.windowHeight / 2
      }

      // 优先同步 trigger 的涟漪颜色（ripple 组件 tap 事件会冒泡携带 rippleColor）
      const triggerRippleColor = e?.detail?.rippleColor
      
      this.expand(tapX, tapY, triggerRippleColor)
    },

    handleOverlayTap() {
      this.collapse()
    },

    handleContentTap(e) {
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
    },

    syncExpandablePcShowToTop() {
      try {
        const app = getApp()
        if (app && typeof app.syncExpandablePcShowToTop === 'function') app.syncExpandablePcShowToTop()
      } catch (e) {}
    },

    /** 宿主页根级 page-container beforeleave → 与 expandable-container_fullscreen 一致 */
    receiveRootPageContainerBeforeLeave() {
      try {
        const gd = getApp().globalData
        if (!gd || gd.__fullscreenBackTarget !== this) return
        if (this.data.isExpanded) this.collapse()
      } catch (e) {}
    },

    receiveRootPageContainerAfterLeave() {},

    expand(tapX, tapY, triggerRippleColor) {
      // 同一事件环内可能被触发两次（如组件 tap 合成 + 冒泡），setData 尚未落地时 isExpanded 仍为 false，
      // 会排两套定时器 → ripple-reveal 被 set 两次，CSS 动画从头再播一遍（肉眼即「ripple-mask 播两次」）
      if (this.__expandBusy) return
      if (this.data.isExpanded || this.data.isExpanding) return
      this.__expandBusy = true

      if (this.__expandClipTimer) {
        clearTimeout(this.__expandClipTimer)
        this.__expandClipTimer = null
      }

      this.__expandAnimSeq = (this.__expandAnimSeq || 0) + 1
      const animSeq = this.__expandAnimSeq

      const sys = wx.getSystemInfoSync()
      const windowWidth = sys.windowWidth
      const windowHeight = sys.windowHeight
      const rpxToPx = windowWidth / 750
      const dur = Number(this.properties.animationDuration || 300)
      const preferTriggerColor = Boolean(this.properties.syncTriggerRippleColor)
      const rawMaskColor = (preferTriggerColor && triggerRippleColor) ? triggerRippleColor : this.properties.bgColor
      const convertedBgColor = this.convertColorFormat(rawMaskColor)
      const effectiveZIndex = this.nextEffectiveZIndex()
      
      // 计算弹窗最终位置和尺寸
    const popupWidth = this.properties.expandedWidth * rpxToPx
      const popupHeight = this.properties.expandedHeight * rpxToPx
      
      // 弹窗尽量居中，但要包含点击位置
    let popupLeft = (windowWidth - popupWidth) / 2
      let popupTop = (windowHeight - popupHeight) / 2
      
      // 确保点击位置在弹窗范围内
    if (tapX < popupLeft) popupLeft = Math.max(16, tapX - 30)
      if (tapX > popupLeft + popupWidth) popupLeft = Math.min(windowWidth - popupWidth - 16, tapX - popupWidth + 30)
      if (tapY < popupTop) popupTop = Math.max(16, tapY - 30)
      if (tapY > popupTop + popupHeight) popupTop = Math.min(windowHeight - popupHeight - 16, tapY - popupHeight + 30)
      
      // 边界检查
      popupLeft = Math.max(16, Math.min(popupLeft, windowWidth - popupWidth - 16))
      popupTop = Math.max(16, Math.min(popupTop, windowHeight - popupHeight - 16))
      
      // 计算点击位置相对于弹窗的位置（用于clip-path圆心）
    const relX = tapX - popupLeft
      const relY = tapY - popupTop
      
      // 计算从点击位置到弹窗四角的最大距离（圆形需要扩展到的半径）
    const distToCorners = [
        Math.sqrt(relX * relX + relY * relY),
        Math.sqrt((popupWidth - relX) ** 2 + relY ** 2),
        Math.sqrt(relX ** 2 + (popupHeight - relY) ** 2),
        Math.sqrt((popupWidth - relX) ** 2 + (popupHeight - relY) ** 2)
      ]
      const maxRadius = Math.max(...distToCorners)
      
      // 初始显示层：30rpx直径的圆形
    const initialRadius = 15 * rpxToPx
      
      // 保存参数
    this.__tapX = tapX
      this.__tapY = tapY
      this.__relX = relX
      this.__relY = relY
      this.__maxRadius = maxRadius
      this.__initialRadius = initialRadius
      this.__popupLeft = popupLeft
      this.__popupTop = popupTop
      this.__popupWidth = popupWidth
      this.__popupHeight = popupHeight
      this.__popupBgColor = convertedBgColor

      // 外层不要铺 background-color：不受内层 clip-path 裁剪，小圆阶段仍会显示整块色矩形，展开动画像「直接出面板」
      const popupFrameStyle = `position:fixed;left:${popupLeft}px;top:${popupTop}px;width:${popupWidth}px;height:${popupHeight}px;border-radius:24rpx;z-index:${effectiveZIndex + 1};`
      // 首帧 transition:none，nextTick 再过渡到 maxRadius；底色与 clip 同在内层，肉眼才能看到圆扩大
      const popupClipStyleInit = `background-color:${convertedBgColor};border-radius:24rpx;clip-path:circle(${initialRadius}px at ${relX}px ${relY}px);transition:none;`
      const popupClipStyleExpanded = `background-color:${convertedBgColor};border-radius:24rpx;clip-path:circle(${maxRadius}px at ${relX}px ${relY}px);transition:clip-path ${dur}ms cubic-bezier(0.4,0,0.2,1);`

      this.setData({
        isExpanding: true,
        isExpanded: true,
        effectiveZIndex,
        tapX, tapY,
        popupFrameStyle,
        popupClipStyle: popupClipStyleInit,
        clipVisible: true,
        rippleMaskClass: '',
        maskColor: convertedBgColor,
        rippleDur: dur
      })

      // 偶发「卡」：nextTick 与首帧小圆同周期时 WebView 可能直接合成到终态；宿主页 sync 的 setData 也会抢帧。
      // 先留一帧 + 固定短延迟再过渡到 maxRadius；入栈/sync 再延后到过渡已提交之后，避免与 clip-path 首插值叠在同一时刻。
      const runClipExpand = () => {
        if (this.__expandAnimSeq !== animSeq) return
        this.setData({ popupClipStyle: popupClipStyleExpanded })
        const stackSync = () => {
          try {
            this.pushToHostStack()
            this.syncExpandablePcShowToTop()
          } catch (e) {}
        }
        if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
          wx.nextTick(stackSync)
        } else {
          setTimeout(stackSync, 0)
        }
        setTimeout(() => {
          if (this.__expandAnimSeq !== animSeq) return
          this.setData({ rippleMaskClass: 'ripple-reveal' })
          setTimeout(() => {
            if (this.__expandAnimSeq !== animSeq) return
            this.setData({
              isExpanding: false,
              rippleMaskClass: 'ripple-complete'
            })
            this.__expandBusy = false
          }, dur)
        }, Math.floor(dur * 0.1))
      }

      const paintDelayMs = 36
      const schedule = () => {
        this.__expandClipTimer = setTimeout(() => {
          this.__expandClipTimer = null
          runClipExpand()
        }, paintDelayMs)
      }
      if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
        wx.nextTick(schedule)
      } else {
        this.__expandClipTimer = setTimeout(() => {
          this.__expandClipTimer = null
          runClipExpand()
        }, paintDelayMs + 8)
      }

      this.emitExpandEventDeferred()
    },

    collapse() {
      if (!this.data.isExpanded) return
      if (this.__clipPcCollapsing) return
      this.__clipPcCollapsing = true

      // 作废尚未执行的 expand 定时链，避免收起过程中旧回调再给 ripple-reveal
      this.__expandAnimSeq = (this.__expandAnimSeq || 0) + 1
      this.__expandBusy = false
      if (this.__expandClipTimer) {
        clearTimeout(this.__expandClipTimer)
        this.__expandClipTimer = null
      }

      const dur = Number(this.properties.animationDuration || 300)
      const relX = this.__relX
      const relY = this.__relY
      const initialRadius = this.__initialRadius || 15
      const maxR = typeof this.__maxRadius === 'number' && this.__maxRadius > 0 ? this.__maxRadius : initialRadius + 1
      const collapseSeq = this.__expandAnimSeq

      // 收起时遮罩在上层会先盖住 clip 收缩观感；先关掉遮罩动画，再两阶段 clip（大圆无过渡 → nextTick 小圆有过渡）
      this.setData({ rippleMaskClass: '' })

      const bg = this.__popupBgColor || this.data.maskColor || '#f2f3f5'
      const maxClip = `background-color:${bg};border-radius:24rpx;clip-path:circle(${maxR}px at ${relX}px ${relY}px);transition:none;`
      const minClip = `background-color:${bg};border-radius:24rpx;clip-path:circle(${initialRadius}px at ${relX}px ${relY}px);transition:clip-path ${dur}ms cubic-bezier(0.4,0,0.2,1);`
      this.setData({ popupClipStyle: maxClip })

      const runClipCollapse = () => {
        if (this.__expandAnimSeq !== collapseSeq) return
        this.setData({ popupClipStyle: minClip })
        setTimeout(() => {
          if (this.__expandAnimSeq !== collapseSeq) return
          this.setData({
            isExpanded: false,
            isExpanding: false,
            clipVisible: false,
            rippleMaskClass: '',
            popupFrameStyle: '',
            popupClipStyle: ''
          })
          this.popFromHostStack()
          this.syncExpandablePcShowToTop()
          this.__clipPcCollapsing = false
        }, dur + 30)
      }

      if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
        wx.nextTick(runClipCollapse)
      } else {
        setTimeout(runClipCollapse, 16)
      }

      this.emitCollapseEventDeferred()
    },

    toggle() {
      if (this.data.isExpanded) this.collapse()
      else {
        const sys = wx.getSystemInfoSync()
        this.expand(sys.windowWidth / 2, sys.windowHeight / 2)
      }
    }
  }
})
