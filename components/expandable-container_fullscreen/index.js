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
    animationDuration: { type: Number, value: 200 },
    zIndex: { type: Number, value: 1000 },
    fullscreenTopPadding: { type: Number, value: 90 },
    fullscreenContentTopGap: { type: Number, value: 0 },
    fullscreenSheetBgColor: { type: String, value: '#ffffff' },
    swipeLeftUrl: { type: String, value: '' },
    fullSize: { type: Boolean, value: false },
    /** 同时允许的全屏 expandable 栈深（含当前页已展开并成功入栈的数量）；≥ 此次数时再点展开改为 navigateTo shell 页 */
    maxStackDepth: { type: Number, value: 4 },
    /** 超限时跳转的宿主页面路径（可换成分包页） */
    shellPagePath: { type: String, value: '/packageFullscreen/fullscreen-shell/index' },
    /** depth 超限时带给承接页的业务场景：eventDetail / clubDetail（与 fullscreen-shell 内 wx:if 一致） */
    shellScene: { type: String, value: '' },
    /** 超限时一并传递的 id（与下面哪个 panel 对应由 shellScene 决定） */
    shellEventId: { type: String, value: '' },
    shellClubId: { type: String, value: '' },
    /** 是否显示左上角全屏返回（嵌套全屏时可由宿主关掉，避免与内层返回叠在一起） */
    showFullscreenBack: { type: Boolean, value: true },
    /** 展开完成后将宿主 panel 置为空白；收起结束后骨架屏并重载（需宿主实现 suspendContentToBlank / resumeContentWithSkeletonReload） */
    clearParent: { type: Boolean, value: false }
  },

  data: {
    isExpanded: false,
    isExpanding: false,
    // 涟漪遮罩
    rippleVisible: false,
    rippleStyle: '',
    /** 宿主页根级 page-container beforeleave 期间防重入（组件内已无 page-container） */
    pcLeaving: false,
    // sheet动画
    fsContentClass: 'fs-hidden',
    fsContentDur: 260,
    fsTopGapPx: 0,
    fsSheetBgColor: '#ffffff',
    // 手势
    fsDragY: 0,
    fsDragTransform: 'none',
    fsDragTransition: '',
    fsGestureDismissing: false,
    effectiveZIndex: 1000,
    fsNav: { statusBarHeight: 0, titleBarHeight: 44, totalHeight: 44 },
    /** 收起时立即卸掉 sheet 内 slot，下滑阶段仅留白底 */
    fsContentVisible: false
  },

  lifetimes: {
    created() {
      this.__expandableStackRole = 'fullscreen'
    },
    attached() { this.initFullscreenNav() },
    detached() {
      this.__expandRunId = (this.__expandRunId || 0) + 1
      if (this.__expandTo1) {
        clearTimeout(this.__expandTo1)
        this.__expandTo1 = null
      }
      if (this.__expandTo2) {
        clearTimeout(this.__expandTo2)
        this.__expandTo2 = null
      }
      if (this.__expandTo3) {
        clearTimeout(this.__expandTo3)
        this.__expandTo3 = null
      }
      this.unregisterGlobalFullscreenCloser()
      this._restoreClearParentHostIfNeeded()
    }
  },

  methods: {
    /** 向上查找实现了 suspendContentToBlank 的宿主 panel */
    _findClearParentHost() {
      let node = this.selectOwnerComponent()
      while (node) {
        if (
          typeof node.suspendContentToBlank === 'function' &&
          typeof node.resumeContentWithSkeletonReload === 'function'
        ) {
          return node
        }
        node = typeof node.selectOwnerComponent === 'function' ? node.selectOwnerComponent() : null
      }
      return null
    },

    _applyClearParentOnExpandSettled() {
      if (!this.properties.clearParent) return
      const host = this._findClearParentHost()
      if (!host) return
      try {
        host.suspendContentToBlank()
      } catch (e) {}
      this.__didClearParent = true
      this.__clearParentHost = host
      this.__parentRestoreDone = false
    },

    _resetClearParentHostFallback(host) {
      if (!host || typeof host.setData !== 'function') return
      try {
        host.setData({ contentSuspended: false, contentSuspendMode: '' })
      } catch (e) {}
    },

    _restoreClearParentHostIfNeeded() {
      if (this.__parentRestoreDone) return
      if (!this.__didClearParent) return

      const host = this.__clearParentHost || this._findClearParentHost()
      this.__didClearParent = false
      this.__clearParentHost = null
      this.__parentRestoreDone = true

      if (!host) return

      if (typeof host.resumeContentWithSkeletonReload !== 'function') {
        this._resetClearParentHostFallback(host)
        return
      }

      try {
        const ret = host.resumeContentWithSkeletonReload()
        if (ret && typeof ret.then === 'function') {
          ret.catch(() => this._resetClearParentHostFallback(host))
        }
      } catch (e) {
        this._resetClearParentHostFallback(host)
      }
    },

    // ---------- 可展开栈 / 系统返回与遮罩 ----------
    getGlobalData() {
      try {
        const app = getApp()
        if (!app.globalData) app.globalData = {}
        return app.globalData
      } catch (e) {
        return null
      }
    },

    ensureStack(gd) {
      if (!gd) return []
      if (!Array.isArray(gd.__expandableStack)) gd.__expandableStack = []
      return gd.__expandableStack
    },

    /** 始终解析栈中最后一个仍展开的全屏实例，避免与 clip 混栈时闭包指错 */
    installGlobalCloseHandler(gd) {
      if (!gd) return
      gd.__fullscreenExpandableClose = () => {
        try {
          const st = gd.__expandableStack
          if (!Array.isArray(st)) return false
          for (let i = st.length - 1; i >= 0; i--) {
            const host = st[i]
            const hd = host && host.data
            const role = host && host.__expandableStackRole
            if (
              host &&
              typeof host.collapse === 'function' &&
              hd &&
              (hd.isExpanded || hd.isExpanding) &&
              (role === 'clip' || role === 'fullscreen' || role === undefined)
            ) {
              host.collapse()
              return true
            }
          }
        } catch (e) {}
        return false
      }
    },

    lastFullscreenInStack(stack) {
      if (!Array.isArray(stack)) return null
      for (let i = stack.length - 1; i >= 0; i--) {
        const inst = stack[i]
        if (inst && inst.__expandableStackRole !== 'clip') return inst
      }
      return null
    },

    /** 与 app.syncExpandablePcShowToTop 写入的 __fullscreenBackTarget 一致（clip / fullscreen 栈顶） */
    isCurrentFullscreenBackTarget() {
      try {
        const gd = this.getGlobalData()
        return !!(gd && gd.__fullscreenBackTarget === this)
      } catch (e) {}
      return false
    },

    // 与 app.syncExpandablePcShowToTop 共用栈；系统返回由宿主页根级 page-container 转发
    syncPcShowToTop() {
      try {
        const app = getApp()
        if (app && typeof app.syncExpandablePcShowToTop === 'function') app.syncExpandablePcShowToTop()
      } catch (e) {}
    },

    // 把当前实例推入栈顶（去重）
    pushToStackTop() {
      try {
        const gd = this.getGlobalData()
        const stack = this.ensureStack(gd)
        const existedIdx = stack.indexOf(this)
        if (existedIdx !== -1) stack.splice(existedIdx, 1)
        stack.push(this)
        gd.__fullscreenHost = this
        this.installGlobalCloseHandler(gd)
        this.syncPcShowToTop()
      } catch (e) {}
    },

    // 从栈里移除当前实例，并把“顶层 close”切给新的栈顶
    removeFromStack() {
      try {
        const gd = this.getGlobalData()
        const stack = this.ensureStack(gd)
        const idx = stack.indexOf(this)
        if (idx !== -1) stack.splice(idx, 1)

        const lastFs = this.lastFullscreenInStack(stack)
        if (lastFs) {
          gd.__fullscreenHost = lastFs
          this.installGlobalCloseHandler(gd)
        } else {
          if (gd.__fullscreenHost === this) delete gd.__fullscreenHost
          delete gd.__fullscreenExpandableClose
        }
        this.syncPcShowToTop()
      } catch (e) {}
    },

    /** 由宿主页根级 page-container 的 beforeleave 转发（真机嵌套内 page-container 不拦系统返回） */
    receiveRootPageContainerBeforeLeave() {
      if (this.data.pcLeaving) return
      if (!this.isCurrentFullscreenBackTarget()) return
      this.setData({ pcLeaving: true })

      this.__pcDrivenClose = true
      try {
        this.collapse()
      } catch (e) {}
    },

    receiveRootPageContainerAfterLeave() {
      this.setData({ pcLeaving: false })
    },

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
        const gd = this.getGlobalData()
        const token = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
        this.__fsToken = token
        if (gd) gd.__fullscreenExpandableToken = token
        this.pushToStackTop()
      } catch (e) {}
    },

    unregisterGlobalFullscreenCloser() {
      try {
        const gd = this.getGlobalData()
        if (!gd) return
        if (gd.__fullscreenExpandableToken && this.__fsToken && gd.__fullscreenExpandableToken === this.__fsToken) {
          delete gd.__fullscreenExpandableToken
        }
        // 从栈中移除当前组件，并更新新的栈顶
        this.removeFromStack()
        this.setData({ pcLeaving: false })
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

    /**
     * 收起阶段粉色涟漪：必须高于 fs-portal（effectiveZIndex+1）与 sheet（+2），否则整段画在 sheet 下方不可见。
     * 先 transition:none + scale(max)，再 nextTick 过渡到 scale(1)，与展开时「小圆→大圆」对称。
     */
    playCollapseRippleShrink(durMs) {
      const dur = Math.max(1, Number(durMs || 200))
      let wxW = 375
      let wxH = 667
      try {
        const sys = wx.getSystemInfoSync()
        wxW = Number(sys.windowWidth || 375)
        wxH = Number(sys.windowHeight || 667)
      } catch (e) {}
      const tapX = typeof this.__rippleTapX === 'number' && !isNaN(this.__rippleTapX) ? this.__rippleTapX : wxW / 2
      const tapY = typeof this.__rippleTapY === 'number' && !isNaN(this.__rippleTapY) ? this.__rippleTapY : wxH / 2
      const initialSize = this.__rippleInitialSize || 30
      const convertedBgColor = this.convertColorFormat(this.properties.bgColor)
      const ez = Number(this.data.effectiveZIndex || 0)
      const zRip = ez + 40
      const maxR = Number(this.__rippleMaxRadius || 0)
      let maxScale
      if (maxR > 0 && initialSize > 0) {
        maxScale = (maxR * 2) / initialSize
      } else {
        const maxDistX = Math.max(tapX, wxW - tapX)
        const maxDistY = Math.max(tapY, wxH - tapY)
        const maxRadius = Math.sqrt(maxDistX * maxDistX + maxDistY * maxDistY)
        maxScale = (maxRadius * 2) / initialSize
      }
      const base = `position:fixed;left:${tapX - initialSize / 2}px;top:${tapY - initialSize / 2}px;width:${initialSize}px;height:${initialSize}px;border-radius:50%;background-color:${convertedBgColor};z-index:${zRip};`
      const styleStart = `${base}transform:scale(${maxScale});transition:none;`
      const styleEnd = `${base}transform:scale(1);transition:transform ${dur}ms cubic-bezier(0.4,0,0.2,1);`

      this.setData({ rippleVisible: true, rippleStyle: styleStart })
      const tick = () => {
        try {
          this.setData({ rippleStyle: styleEnd })
        } catch (e) {}
      }
      if (typeof wx !== 'undefined' && typeof wx.nextTick === 'function') {
        wx.nextTick(tick)
      } else {
        setTimeout(tick, 16)
      }
      return dur
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
      const dur = Number(this.properties.animationDuration || 200)
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

      this.__expandRunId = (this.__expandRunId || 0) + 1
      const runId = this.__expandRunId

      if (this.__expandTo1) {
        clearTimeout(this.__expandTo1)
        this.__expandTo1 = null
      }
      if (this.__expandTo2) {
        clearTimeout(this.__expandTo2)
        this.__expandTo2 = null
      }
      if (this.__expandTo3) {
        clearTimeout(this.__expandTo3)
        this.__expandTo3 = null
      }

      this.setData({
        isExpanding: true,
        effectiveZIndex: effectiveZIndex,
        rippleStyle: rippleStyle,
        rippleVisible: true
      }, () => {
        try {
          this.pushToStackTop()
        } catch (e) {}
      })

      // 下一帧开始扩散
      this.__expandTo1 = setTimeout(() => {
        if (runId !== this.__expandRunId) return
        const scale = (maxRadius * 2) / initialSize
        const expandedStyle = `position:fixed;left:${tapX - initialSize/2}px;top:${tapY - initialSize/2}px;width:${initialSize}px;height:${initialSize}px;border-radius:50%;background-color:${convertedBgColor};z-index:${effectiveZIndex};transform:scale(${scale});transition:transform ${dur}ms cubic-bezier(0.4,0,0.2,1);`
        this.setData({ rippleStyle: expandedStyle })

        // 涟漪扩散到70%时，开始sheet上滑
        const slideDur = Math.max(260, Math.floor(dur * 1.2) - 100)
        this.__expandTo2 = setTimeout(() => {
          if (runId !== this.__expandRunId) return
          this.setData({
            isExpanded: true,
            isExpanding: false,
            fsContentClass: 'fs-enter-active',
            fsContentDur: slideDur,
            fsContentVisible: true
          }, () => {
            // 须在 isExpanded 落库后再入栈仲裁，否则 sync 仍把父层当栈顶
            this.registerGlobalFullscreenCloser()
            this.notifyContentPanelLoad()
          })

          this.__expandTo3 = setTimeout(() => {
            if (runId !== this.__expandRunId) return
            this.setData({ fsContentClass: 'fs-entered' })
            this._applyClearParentOnExpandSettled()
            this.triggerEvent('expandsettled', {})
          }, slideDur + 30)
        }, Math.floor(dur * 0.7))
      }, 20)

      this.triggerEvent('expand', {})
    },

    // 通知内部 panel 组件加载数据
  notifyContentPanelLoad() {
      // 通过事件通知父组件，让父组件调用 panel 的 loadData
    this.triggerEvent('contentReady', {})
    },

    /** 涟漪阶段即入栈时，系统返回需取消展开并释放栈，避免无 isExpanded 时 collapse 空操作 */
    cancelExpandInProgress() {
      this.__expandRunId = (this.__expandRunId || 0) + 1
      if (this.__expandTo1) {
        clearTimeout(this.__expandTo1)
        this.__expandTo1 = null
      }
      if (this.__expandTo2) {
        clearTimeout(this.__expandTo2)
        this.__expandTo2 = null
      }
      if (this.__expandTo3) {
        clearTimeout(this.__expandTo3)
        this.__expandTo3 = null
      }
      try {
        this.removeFromStack()
      } catch (e) {}
      this._restoreClearParentHostIfNeeded()
      this.setData({
        isExpanding: false,
        isExpanded: false,
        rippleVisible: false,
        rippleStyle: '',
        fsContentClass: 'fs-hidden',
        fsContentVisible: false,
        pcLeaving: false
      })
    },

    // 收起
  collapse() {
      if (this.data.isExpanding && !this.data.isExpanded) {
        this.cancelExpandInProgress()
        this.triggerEvent('collapse', {})
        this.triggerEvent('collapsed', { cancelled: true })
        return
      }
      if (!this.data.isExpanded) return
      if (this.data.fsGestureDismissing) return

      // 收起开始即恢复父级（避免动画结束/手势收起漏调导致父级一直空白）
      this._restoreClearParentHostIfNeeded()

      this.__expandRunId = (this.__expandRunId || 0) + 1
      if (this.__expandTo1) {
        clearTimeout(this.__expandTo1)
        this.__expandTo1 = null
      }
      if (this.__expandTo2) {
        clearTimeout(this.__expandTo2)
        this.__expandTo2 = null
      }
      if (this.__expandTo3) {
        clearTimeout(this.__expandTo3)
        this.__expandTo3 = null
      }

      const dur = Number(this.properties.animationDuration || 200)
      const slideDur = Math.max(200, Math.floor(dur * 1.2) - 160)
      const deferStackRelease = Boolean(this.__pcDrivenClose)

      this.setData({ fsDragY: 0, fsDragTransform: 'none', fsDragTransition: '', fsGestureDismissing: false })
      // 普通收起立即释放栈；系统返回收起则延后到收起后段，避免视觉闪烁
      if (!deferStackRelease) this.unregisterGlobalFullscreenCloser()

      // 1) 立即清空 sheet 内容；sheet 匀速下滑，下滑阶段仅留白底
      this.setData({
        fsContentVisible: false,
        fsContentClass: 'fs-leave-linear',
        fsContentDur: slideDur
      })

      // 2) 下滑到70%：涟漪收缩 + collapsed（tabBar 等）；涟漪结束后再 dismissed（卸载弹层）
      setTimeout(() => {
        if (deferStackRelease) {
          this.unregisterGlobalFullscreenCloser()
          this.__pcDrivenClose = false
        }
        // 先卸掉全屏白底 portal，再播收缩涟漪：与展开对称（展开时涟漪下仍是父级 panel，不能拖到涟漪结束才露底）
        this.setData({ fsContentClass: 'fs-hidden', isExpanded: false })

        const animDur = this.playCollapseRippleShrink(dur)
        this.triggerEvent('collapsed', {})
        setTimeout(() => {
          this.setData({ rippleVisible: false, rippleStyle: '' })
          this._restoreClearParentHostIfNeeded()
          this.triggerEvent('dismissed', {})
        }, animDur + 20)
      }, Math.floor(slideDur * 0.7))

      this.triggerEvent('collapse', {})
    },

    toggle() {
      if (this.data.isExpanded || this.data.isExpanding) this.collapse()
      else {
        const sys = wx.getSystemInfoSync()
        this.expand(sys.windowWidth / 2, sys.windowHeight / 2)
      }
    },

    handleGlobalMaskTap() {
      try {
        const app = getApp()
        const stack = app?.globalData?.__expandableStack
        if (!Array.isArray(stack) || !stack.length) return
        for (let i = stack.length - 1; i >= 0; i--) {
          const top = stack[i]
          const d = top && top.data
          const role = top && top.__expandableStackRole
          if (
            top &&
            typeof top.collapse === 'function' &&
            d &&
            (d.isExpanded || d.isExpanding) &&
            (role === 'clip' || role === 'fullscreen' || role === undefined)
          ) {
            top.collapse()
            return
          }
        }
      } catch (e) {}
    },

    // 手势处理
  onFsTouchStart(e) {
      if (!this.data.isExpanded || this.data.fsGestureDismissing || this.data.fsContentClass !== 'fs-entered') return
      
      // 检查是否有子弹窗正在展开，如果有则不处理手势
      try {
        const t = getApp()?.globalData?.__fullscreenBackTarget
        if (t && t !== this) {
          this.__fsGestureBlocked = true
          return
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
      this._restoreClearParentHostIfNeeded()
      const dur = Number(this.properties.animationDuration || 200)
      const slideDur = 120
      let windowHeight = 667
      try { windowHeight = wx.getSystemInfoSync().windowHeight || 667 } catch (e) {}

      // 立即从栈里移除，把“系统返回拦截权”交给下一层（如有）
      this.unregisterGlobalFullscreenCloser()
      this.setData({
        fsGestureDismissing: true,
        fsContentVisible: false,
        fsDragTransition: `transform ${slideDur}ms linear`,
        fsDragY: windowHeight + 80,
        fsDragTransform: `translate3d(0,${windowHeight + 80}px,0)`
      })

      setTimeout(() => {
        this.setData({ isExpanded: false })
        const animDur = this.playCollapseRippleShrink(dur)
        this.triggerEvent('collapsed', {})
        setTimeout(() => {
          this.setData({ fsGestureDismissing: false, fsDragY: 0, fsDragTransition: '', fsDragTransform: 'none', rippleVisible: false, rippleStyle: '' })
          this.triggerEvent('dismissed', {})
        }, animDur + 20)
      }, Math.floor(slideDur * 0.7))

      this.triggerEvent('collapse', { by: 'gesture' })
    }
  }
})
