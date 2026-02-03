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
    bgColor: { type: String, value: '#6750A4' },
    animationDuration: { type: Number, value: 200 },
    zIndex: { type: Number, value: 1000 }
  },

  data: {
    isExpanded: false,
    isExpanding: false,
    effectiveZIndex: 1000,
    // 弹窗最终位置和尺寸
    popupStyle: '',
    // 显示层（clip圆形）样式
    clipStyle: '',
    clipVisible: false,
    // 涟漪遮罩层状态
    rippleMaskClass: '',
    // 点击坐标
    tapX: 0,
    tapY: 0
  },

  lifetimes: {
    attached() {},
    detached() { this.popFromHostStack() }
  },

  methods: {
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
        if (app.globalData.__fullscreenHost) {
          app.globalData.__fullscreenHost.setData({ fsGlobalMaskVisible: true })
        }
      } catch (e) {}
    },

    popFromHostStack() {
      try {
        const app = getApp()
        const stack = app?.globalData?.__expandableStack
        if (Array.isArray(stack)) {
          const idx = stack.lastIndexOf(this)
          if (idx >= 0) stack.splice(idx, 1)
          if (stack.length === 0 && app.globalData.__fullscreenHost) {
            app.globalData.__fullscreenHost.setData({ fsGlobalMaskVisible: false })
          }
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
      
      this.expand(tapX, tapY)
    },

    handleOverlayTap() {
      this.collapse()
    },

    handleContentTap(e) {
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
    },


    expand(tapX, tapY) {
      if (this.data.isExpanded || this.data.isExpanding) return
      
      const sys = wx.getSystemInfoSync()
      const windowWidth = sys.windowWidth
      const windowHeight = sys.windowHeight
      const rpxToPx = windowWidth / 750
      const dur = Number(this.properties.animationDuration || 300)
      const convertedBgColor = this.convertColorFormat(this.properties.bgColor)
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
      
      // 弹窗样式（固定位置，但通过clip-path控制可见区域）
    const popupStyle = `position:fixed;left:${popupLeft}px;top:${popupTop}px;width:${popupWidth}px;height:${popupHeight}px;background-color:${convertedBgColor};border-radius:24rpx;z-index:${effectiveZIndex + 1};`
      
      // 初始clip样式：小圆形
    const clipStyle = `clip-path:circle(${initialRadius}px at ${relX}px ${relY}px);transition:clip-path ${dur}ms cubic-bezier(0.4,0,0.2,1);`
      
      this.setData({
        isExpanding: true,
        isExpanded: true,
        effectiveZIndex,
        tapX, tapY,
        popupStyle,
        clipStyle,
        clipVisible: true,
        rippleMaskClass: ''
      })
      
      this.pushToHostStack()

      // 下一帧开始clip扩展动画
      setTimeout(() => {
        const expandedClipStyle = `clip-path:circle(${maxRadius}px at ${relX}px ${relY}px);transition:clip-path ${dur}ms cubic-bezier(0.4,0,0.2,1);`
        this.setData({ clipStyle: expandedClipStyle })
        
        // clip扩展到50%时，开始涟漪挖空动画
        setTimeout(() => {
          this.setData({ rippleMaskClass: 'ripple-reveal' })
          
          // 涟漪动画完成后
          setTimeout(() => {
            this.setData({ 
              isExpanding: false,
              rippleMaskClass: 'ripple-complete'
            })
          }, dur)
        }, Math.floor(dur * 0.5))
      }, 20)

      this.triggerEvent('expand', {})
    },

    collapse() {
      if (!this.data.isExpanded) return
      
      const dur = Number(this.properties.animationDuration || 300)
      const relX = this.__relX
      const relY = this.__relY
      const initialRadius = this.__initialRadius || 15
      
      // 1) 先涟漪收缩
    this.setData({ rippleMaskClass: 'ripple-collapse' })
      
      // 2) 涟漪收缩到30%时，clip收缩
      setTimeout(() => {
        const collapseClipStyle = `clip-path:circle(${initialRadius}px at ${relX}px ${relY}px);transition:clip-path ${dur}ms cubic-bezier(0.4,0,0.2,1);`
        this.setData({ clipStyle: collapseClipStyle })
        
        // 3) clip收缩完成后清理
        setTimeout(() => {
          this.setData({
            isExpanded: false,
            isExpanding: false,
            clipVisible: false,
            rippleMaskClass: '',
            popupStyle: '',
            clipStyle: ''
          })
          this.popFromHostStack()
        }, dur + 20)
      }, Math.floor(dur * 0.3))

      this.triggerEvent('collapse', {})
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
