// components/expandable-container_fullscreen/index.js
// 涟漪扩散版本：点击后从点击位置涟漪扩散遮罩，然后sheet上滑
  Component({
  options: {
    multipleSlots: true,
    styleIsolation: 'apply-shared'
  },

  observers: {
    'fullscreenTopPadding, fullscreenContentTopGap, fullscreenSheetBgColor': function () {
      try { this.initFullscreenNav() } catch (e) {}
    }
  },

  properties: {
    bgColor: { type: String, value: '#6750A4' },
    animationDuration: { type: Number, value: 300 },
    zIndex: { type: Number, value: 1000 },
    fullscreenTopPadding: { type: Number, value: 90 },
    fullscreenContentTopGap: { type: Number, value: 0 },
    fullscreenSheetBgColor: { type: String, value: '#ffffff' },
    swipeLeftUrl: { type: String, value: '' },
    fullSize: { type: Boolean, value: false }
  },

  data: {
    isExpanded: false,
    isExpanding: false,
    // 涟漪遮罩
    rippleVisible: false,
    rippleStyle: '',
    // sheet动画
    fsContentClass: 'fs-hidden',
    fsContentDur: 360,
    fsTopGapPx: 0,
    fsSheetBgColor: '#ffffff',
    // 手势
    fsDragY: 0,
    fsDragTransform: 'none',
    fsDragTransition: '',
    fsGestureDismissing: false,
    effectiveZIndex: 1000,
    fsNav: { statusBarHeight: 0, titleBarHeight: 44, totalHeight: 44 },
    fsGlobalMaskVisible: false
  },

  lifetimes: {
    attached() { this.initFullscreenNav() },
    detached() { this.unregisterGlobalFullscreenCloser() }
  },

  methods: {
    nextEffectiveZIndex() {
      try {
        const app = getApp()
        if (!app.globalData) app.globalData = {}
        // 使用更高的基础 z-index 确保覆盖页面所有元素
    const base = Math.max(Number(this.properties.zIndex || 0), 99999)
        const current = Number(app.globalData.__expandableZIndexBase || 0)
        const next = Math.max(current + 10, base)
        app.globalData.__expandableZIndexBase = next
        return next
      } catch (e) {
        return Math.max(Number(this.properties.zIndex || 0), 99999)
      }
    },

    initFullscreenNav() {
      try {
        const sys = wx.getSystemInfoSync()
        const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null
        const statusBarHeight = Number(sys.statusBarHeight || 0)
        const windowWidth = Number(sys.windowWidth || 375)
        const rpxToPx = windowWidth / 750
        const barExtraPx = Math.max(0, Number(this.properties.fullscreenTopPadding || 0)) * rpxToPx
        const topGapPx = Math.max(0, Number(this.properties.fullscreenContentTopGap || 0)) * rpxToPx
        let titleBarHeight = 44
        if (menu && menu.height) {
          const topGap = Math.max(0, menu.top - statusBarHeight)
          titleBarHeight = Math.max(44, menu.height + topGap * 2)
        }
        titleBarHeight = titleBarHeight + barExtraPx
        const minBackBtnSpace = 50 * rpxToPx
        const totalHeight = barExtraPx > 0 ? statusBarHeight + titleBarHeight : statusBarHeight + minBackBtnSpace
        this.setData({
          fsNav: { statusBarHeight, titleBarHeight, totalHeight },
          fsTopGapPx: topGapPx,
          fsSheetBgColor: this.properties.fullscreenSheetBgColor || '#ffffff'
        })
      } catch (e) {}
    },

    registerGlobalFullscreenCloser() {
      try {
        const app = getApp()
        if (!app.globalData) app.globalData = {}
        const token = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
        this.__fsToken = token
        app.globalData.__fullscreenExpandableToken = token
        app.globalData.__fullscreenHost = this
        if (!Array.isArray(app.globalData.__expandableStack)) app.globalData.__expandableStack = []
        // 将当前组件加入栈中
        app.globalData.__expandableStack.push(this)
        app.globalData.__fullscreenExpandableClose = () => {
          if (this.data?.isExpanded) { this.collapse(); return true }
          return false
        }
      } catch (e) {}
    },

    unregisterGlobalFullscreenCloser() {
      try {
        const app = getApp()
        const gd = app?.globalData
        if (!gd) return
        if (gd.__fullscreenExpandableToken && this.__fsToken && gd.__fullscreenExpandableToken === this.__fsToken) {
          delete gd.__fullscreenExpandableToken
          delete gd.__fullscreenExpandableClose
          if (gd.__fullscreenHost === this) delete gd.__fullscreenHost
        }
        // 从栈中移除当前组件
    if (Array.isArray(gd.__expandableStack)) {
          const idx = gd.__expandableStack.indexOf(this)
          if (idx !== -1) {
            gd.__expandableStack.splice(idx, 1)
          }
        }
        this.setData({ fsGlobalMaskVisible: false })
        this.__fsToken = null
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

    // 触发器触摸开始 - 记录起始位置和时间
  onTriggerTouchStart(e) {
      const t = e?.touches?.[0] || e?.changedTouches?.[0]
      if (t) {
        this.__triggerTouchStartX = t.clientX
        this.__triggerTouchStartY = t.clientY
        this.__triggerTouchStartTime = Date.now()
      }
    },

    // 处理触发器点击（使用 touchend 事件获取准确坐标）
  handleTriggerTap(e) {
      if (this.data.isExpanded || this.data.isExpanding) return
      
      // 判断是否为拖动操作（仅检查移动距离，不检查时间）
      // 长按（时间长但不移动）应该允许弹窗
    const t = e?.changedTouches?.[0] || e?.touches?.[0]
      if (t && this.__triggerTouchStartX !== undefined) {
        const dx = Math.abs(t.clientX - this.__triggerTouchStartX)
        const dy = Math.abs(t.clientY - this.__triggerTouchStartY)
        
        // 如果移动距离超过10px，认为是拖动而非点击/长按
    if (dx > 10 || dy > 10) {
          return
        }
      }
      
      // 获取点击坐标 - touchend 事件使用 changedTouches
    let tapX, tapY
      
      // touchend 事件的坐标在 changedTouches 中
    if (e && e.changedTouches && e.changedTouches[0]) {
        tapX = e.changedTouches[0].clientX
        tapY = e.changedTouches[0].clientY
      } else if (e && e.touches && e.touches[0]) {
        tapX = e.touches[0].clientX
        tapY = e.touches[0].clientY
      } else if (e && e.detail && (e.detail.x !== undefined)) {
        // 降级处理：tap 事件
        tapX = e.detail.x
        tapY = e.detail.y
      } else {
        const sys = wx.getSystemInfoSync()
        tapX = sys.windowWidth / 2
        tapY = sys.windowHeight / 2
      }
      
      this.expand(tapX, tapY)
    },

    handleContentTap(e) {
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
    },

    handleFullscreenBack(e) {
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
      if (this.data.fsGestureDismissing) return
      this.collapse()
      this.triggerEvent('fullscreenBack', {})
    },


    // 展开 - 从点击位置涟漪扩散
  expand(tapX, tapY) {
      if (this.data.isExpanded || this.data.isExpanding) return
      this.initFullscreenNav()
      
      const sys = wx.getSystemInfoSync()
      const windowWidth = sys.windowWidth
      const windowHeight = sys.windowHeight
      const dur = Number(this.properties.animationDuration || 300)
      const convertedBgColor = this.convertColorFormat(this.properties.bgColor)
      const effectiveZIndex = this.nextEffectiveZIndex()
      
      // 计算涟漪需要扩散的最大半径（从点击位置到屏幕最远角的距离）
    const maxDistX = Math.max(tapX, windowWidth - tapX)
      const maxDistY = Math.max(tapY, windowHeight - tapY)
      const maxRadius = Math.sqrt(maxDistX * maxDistX + maxDistY * maxDistY)
      
      // 初始涟漪：30px直径的圆形
    const initialSize = 30
      const rippleStyle = `position:fixed;left:${tapX - initialSize/2}px;top:${tapY - initialSize/2}px;width:${initialSize}px;height:${initialSize}px;border-radius:50%;background-color:${convertedBgColor};z-index:${effectiveZIndex};transform:scale(1);transition:transform ${dur}ms cubic-bezier(0.4,0,0.2,1);`
      
      // 保存参数
    this.__rippleTapX = tapX
      this.__rippleTapY = tapY
      this.__rippleMaxRadius = maxRadius
      this.__rippleInitialSize = initialSize
      
      this.setData({
        isExpanding: true,
        effectiveZIndex: effectiveZIndex,
        rippleStyle: rippleStyle,
        rippleVisible: true
      })

      // 下一帧开始扩散
      setTimeout(() => {
        const scale = (maxRadius * 2) / initialSize
        const expandedStyle = `position:fixed;left:${tapX - initialSize/2}px;top:${tapY - initialSize/2}px;width:${initialSize}px;height:${initialSize}px;border-radius:50%;background-color:${convertedBgColor};z-index:${effectiveZIndex};transform:scale(${scale});transition:transform ${dur}ms cubic-bezier(0.4,0,0.2,1);`
        this.setData({ rippleStyle: expandedStyle })
        
        // 涟漪扩散到70%时，开始sheet上滑
    const slideDur = Math.max(360, Math.floor(dur * 1.2))
        setTimeout(() => {
          this.setData({
            isExpanded: true,
            isExpanding: false,
            fsContentClass: 'fs-enter-active',
            fsContentDur: slideDur
          })
          this.registerGlobalFullscreenCloser()
          
          // 通知内部 panel 组件加载数据（懒加载）
    this.notifyContentPanelLoad()
          
          setTimeout(() => this.setData({ fsContentClass: 'fs-entered' }), slideDur + 30)
        }, Math.floor(dur * 0.7))
      }, 20)

      this.triggerEvent('expand', {})
    },

    // 通知内部 panel 组件加载数据
  notifyContentPanelLoad() {
      // 通过事件通知父组件，让父组件调用 panel 的 loadData
    this.triggerEvent('contentReady', {})
    },

    // 收起
  collapse() {
      if (!this.data.isExpanded) return
      if (this.data.fsGestureDismissing) return

      const dur = Number(this.properties.animationDuration || 300)
      const slideDur = Math.max(360, Math.floor(dur * 1.2))

      this.setData({ fsDragY: 0, fsDragTransform: 'none', fsDragTransition: '', fsGestureDismissing: false })
      setTimeout(() => this.unregisterGlobalFullscreenCloser(), dur + slideDur + 180)

      // 1) sheet下滑
    this.setData({ fsContentClass: 'fs-leave-active', fsContentDur: slideDur })

      // 2) 下滑到70%时，涟漪收缩
      setTimeout(() => {
        this.setData({ fsContentClass: 'fs-hidden' })
        
        const tapX = this.__rippleTapX
        const tapY = this.__rippleTapY
        const initialSize = this.__rippleInitialSize || 30
        const convertedBgColor = this.convertColorFormat(this.properties.bgColor)
        
        const collapseStyle = `position:fixed;left:${tapX - initialSize/2}px;top:${tapY - initialSize/2}px;width:${initialSize}px;height:${initialSize}px;border-radius:50%;background-color:${convertedBgColor};z-index:${this.data.effectiveZIndex};transform:scale(1);transition:transform ${dur}ms cubic-bezier(0.4,0,0.2,1);`
        this.setData({ rippleStyle: collapseStyle })

        // 3) 涟漪收缩完成后清理
        setTimeout(() => this.setData({ isExpanded: false, rippleVisible: false, rippleStyle: '' }), dur + 20)
      }, Math.floor(slideDur * 0.7))

      this.triggerEvent('collapse', {})
    },

    toggle() {
      if (this.data.isExpanded) this.collapse()
      else {
        const sys = wx.getSystemInfoSync()
        this.expand(sys.windowWidth / 2, sys.windowHeight / 2)
      }
    },

    handleGlobalMaskTap() {
      try {
        const app = getApp()
        const stack = app?.globalData?.__expandableStack
        if (Array.isArray(stack) && stack.length) {
          const top = stack[stack.length - 1]
          if (top && typeof top.collapse === 'function') { top.collapse(); return }
        }
      } catch (e) {}
    },

    // 手势处理
  onFsTouchStart(e) {
      if (!this.data.isExpanded || this.data.fsGestureDismissing || this.data.fsContentClass !== 'fs-entered') return
      
      // 检查是否有子弹窗正在展开，如果有则不处理手势
      try {
        const app = getApp()
        const stack = app?.globalData?.__expandableStack
        if (Array.isArray(stack) && stack.length > 0) {
          // 检查栈顶是否是当前组件
    const top = stack[stack.length - 1]
          if (top !== this) {
            // 有其他弹窗在上层，不处理手势
    this.__fsGestureBlocked = true
            return
          }
        }
      } catch (err) {}
      
      this.__fsGestureBlocked = false
      const t = e?.touches?.[0]
      if (!t) return
      try { this.__fsWindowHeight = wx.getSystemInfoSync().windowHeight || 667 } catch (err) { this.__fsWindowHeight = 667 }
      this.__fsTouchStartX = t.clientX
      this.__fsTouchStartY = t.clientY
      this.__fsTouchStartTime = Date.now()
      this.__fsGestureAxis = null
      this.__fsDragging = false
      this.__fsLastDx = 0
      this.__fsLastDy = 0
    },

    onFsTouchMove(e) {
      if (this.__fsGestureBlocked) return
      if (!this.data.isExpanded || this.data.fsGestureDismissing || this.data.fsContentClass !== 'fs-entered') return
      const t = e?.touches?.[0]
      if (!t) return
      const dx = t.clientX - (this.__fsTouchStartX || 0)
      const dy = t.clientY - (this.__fsTouchStartY || 0)
      this.__fsLastDx = dx
      this.__fsLastDy = dy

      if (!this.__fsGestureAxis) {
        const adx = Math.abs(dx), ady = Math.abs(dy)
        if (adx > ady + 6) this.__fsGestureAxis = 'x'
        else if (dy > 6 && ady > adx + 4) this.__fsGestureAxis = 'y'
        else return
      }

      if (this.__fsGestureAxis !== 'y' || dy <= 0) return
      const maxPx = Math.max(0, this.__fsWindowHeight || 667) + 80
      const y = Math.min(maxPx, dy)
      if (!this.__fsDragging) { this.__fsDragging = true; this.setData({ fsDragTransition: '' }) }
      this.setData({ fsDragY: y, fsDragTransform: `translate3d(0,${y}px,0)` })
    },

    onFsTouchEnd() {
      if (this.__fsGestureBlocked) {
        this.__fsGestureBlocked = false
        return
      }
      if (!this.data.isExpanded || this.data.fsGestureDismissing || this.data.fsContentClass !== 'fs-entered') return
      const axis = this.__fsGestureAxis
      const dx = Number(this.__fsLastDx || 0)
      const dy = Number(this.__fsLastDy || 0)
      const dt = Date.now() - Number(this.__fsTouchStartTime || 0)

      if (axis === 'x') {
        const url = (this.properties.swipeLeftUrl || '').trim()
        if (url && dx < -80 && Math.abs(dy) < 60 && dt < 800) this.handleSwipeLeftNavigate(url)
        return
      }

      if (axis === 'y') {
        const sys = wx.getSystemInfoSync()
        const thresholdPx = 300 * sys.windowWidth / 750
        if (this.data.fsDragY >= thresholdPx) this.gestureDismissFullscreen()
        else {
          this.setData({ fsDragTransition: 'transform 220ms cubic-bezier(0.22,1,0.36,1)', fsDragY: 0, fsDragTransform: 'translate3d(0,0,0)' })
          setTimeout(() => { if (this.data.isExpanded) this.setData({ fsDragTransition: '', fsDragTransform: 'none' }) }, 260)
        }
      }
    },

    onFsTouchCancel() { this.onFsTouchEnd() },

    handleSwipeLeftNavigate(url) {
      try { this.collapse() } catch (e) {}
      setTimeout(() => { try { wx.navigateTo({ url }); this.triggerEvent('swipeLeft', { url }) } catch (e) {} }, 260)
    },

    gestureDismissFullscreen() {
      if (!this.data.isExpanded || this.data.fsGestureDismissing) return
      const dur = Number(this.properties.animationDuration || 300)
      const slideDur = 220
      let windowHeight = 667
      try { windowHeight = wx.getSystemInfoSync().windowHeight || 667 } catch (e) {}

      this.setData({ fsGestureDismissing: true, fsDragTransition: `transform ${slideDur}ms linear`, fsDragY: windowHeight + 80, fsDragTransform: `translate3d(0,${windowHeight + 80}px,0)` })

      setTimeout(() => {
        const tapX = this.__rippleTapX, tapY = this.__rippleTapY
        const initialSize = this.__rippleInitialSize || 30
        const convertedBgColor = this.convertColorFormat(this.properties.bgColor)
        const collapseStyle = `position:fixed;left:${tapX - initialSize/2}px;top:${tapY - initialSize/2}px;width:${initialSize}px;height:${initialSize}px;border-radius:50%;background-color:${convertedBgColor};z-index:${this.data.effectiveZIndex};transform:scale(1);transition:transform ${dur}ms cubic-bezier(0.4,0,0.2,1);`
        this.setData({ rippleStyle: collapseStyle })
        setTimeout(() => this.setData({ isExpanded: false, fsGestureDismissing: false, fsDragY: 0, fsDragTransition: '', fsDragTransform: 'none', rippleVisible: false, rippleStyle: '' }), dur + 20)
      }, Math.floor(slideDur * 0.7))

      setTimeout(() => this.unregisterGlobalFullscreenCloser(), dur + slideDur + 180)
      this.triggerEvent('collapse', { by: 'gesture' })
    }
  }
})
