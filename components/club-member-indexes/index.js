/**
 * 协会成员索引列表：视觉与交互对齐 t-indexes，但使用单 scroll-view（适配全屏弹层，不可用 t-indexes 自带的页面滚动）
 */
const app = getApp()
const { handleListRowTap } = require('../club-index-focus-panel/list-focus')

Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  properties: {
    groups: { type: Array, value: [] },
    indexSidebar: { type: Array, value: [] },
    defaultAvatar: { type: String, value: '' },
    roleNames: { type: Object, value: {} },
    roleOptions: { type: Object, value: {} },
    roleDisplayMap: { type: Object, value: {} },
    isPresident: { type: Boolean, value: false },
    /** lines2：姓名/月份多行+clamp；hard4：部门仅 4 字且无 line-clamp（避免 …） */
    indexSidebarCharMode: { type: String, value: 'lines2' },
    /** 为 true 时成员详情 expandable 使用 root-portal，避免置于 swiper 内时 fixed 错位 */
    overlayUseRootPortal: { type: Boolean, value: false },
    /** 多列同时挂载时区分 expandable 的 id，避免 swiper 内三份列表 id 冲突 */
    expandableIdSuffix: { type: String, value: '0' },
    /** 在测量得到的列表高度上额外增加（rpx），用于弹层内多露出一些列表区域 */
    listHeightBoostRpx: { type: Number, value: 0 },
    clubId: { type: String, value: '' },
  },

  data: {
    scrollIntoView: '',
    listRenderKey: 0,
    /** 与 index 项 anchorId 对齐，避免多组「6月」等重复文案全亮 */
    sidebarActiveAnchor: '',
    showSidebarTips: false,
    /** scroll-view 必须用 px 高度；初值略大，避免首帧过矮 */
    scrollAreaPx: 520,
    selectedMemberId: '',
    memberActivityLoading: false,
    memberActivityLoadingMore: false,
    memberActivitySummary: null,
    memberActivityItems: [],
    memberActivityPage: 0,
    memberActivityTotalPages: 1,
    memberActivityListEnd: false,
    bulkMode: false,
    selectedUserIds: [],
    selectedUserMap: {},
    detailExporting: false,
  },

  observers: {
    'listHeightBoostRpx': function () {
      wx.nextTick(() => this.applyScrollAreaLayout())
    },
    'groups, indexSidebar': function (groups) {
      this._groupTops = null
      this._indexItemRanges = null
      this._scrollRaf = false
      const itemCount = (groups || []).reduce(
        (n, grp) => n + ((grp && grp.children) ? grp.children.length : 0),
        0
      )
      if (itemCount !== this._lastGroupItemCount) {
        this._lastGroupItemCount = itemCount
        this._forceScrollLayout = true
        this._lastScrollTop = 0
        this.setData({
          scrollIntoView: '',
          listRenderKey: (Number(this.data.listRenderKey) || 0) + 1,
        })
      }
      this.syncSelectedMember(groups)
      if (this._measureDebounceTimer) {
        clearTimeout(this._measureDebounceTimer)
        this._measureDebounceTimer = null
      }
      this._measureDebounceTimer = setTimeout(() => {
        this._measureDebounceTimer = null
        wx.nextTick(() => {
          setTimeout(() => {
            this.applyScrollAreaLayout(() => {
              this.measureGroupOffsets()
              this.cacheSidebarItemRanges()
            }, 0, true)
          }, 120)
        })
      }, 80)
    },
  },

  lifetimes: {
    attached() {
      let guess = 520
      try {
        const wh = wx.getSystemInfoSync().windowHeight || 667
        guess = Math.max(320, Math.floor(wh * 0.72))
      } catch (e) {}
      this.setData({ scrollAreaPx: guess })
      this._attachMeasureTimer = setTimeout(() => {
        this._attachMeasureTimer = null
        this.applyScrollAreaLayout(() => {
          this.measureGroupOffsets()
        })
      }, 100)
    },
    detached() {
      this._sidebarDragging = false
      this._sidebarBarRect = null
      if (this._measureDebounceTimer) {
        clearTimeout(this._measureDebounceTimer)
        this._measureDebounceTimer = null
      }
      if (this._attachMeasureTimer) {
        clearTimeout(this._attachMeasureTimer)
        this._attachMeasureTimer = null
      }
      if (this._clearScrollIntoViewTimer) {
        clearTimeout(this._clearScrollIntoViewTimer)
        this._clearScrollIntoViewTimer = null
      }
      if (this._sidebarScrollFixTimer) {
        clearTimeout(this._sidebarScrollFixTimer)
        this._sidebarScrollFixTimer = null
      }
      if (this._layoutRetryTimer) {
        clearTimeout(this._layoutRetryTimer)
        this._layoutRetryTimer = null
      }
    },
  },

  pageLifetimes: {
    show() {
      wx.nextTick(() => this.applyScrollAreaLayout())
    },
  },

  methods: {
    syncSelectedMember(groups) {
      const selectedId = String(this.data.selectedMemberId || '')
      if (!selectedId) return
      const flat = []
      ;(groups || []).forEach((grp) => {
        ;(grp && grp.children ? grp.children : []).forEach((m) => flat.push(m))
      })
      const stillExists = flat.some((m) => String(m.member_id) === selectedId)
      if (!stillExists) {
        this.setData({ selectedMemberId: '' })
      }
      const selectedUserIds = (this.data.selectedUserIds || []).filter((uid) =>
        flat.some((m) => String(m.user_id) === String(uid))
      )
      if (selectedUserIds.length !== (this.data.selectedUserIds || []).length) {
        const map = {}
        selectedUserIds.forEach((id) => {
          map[String(id)] = true
        })
        this.setData({
          selectedUserIds,
          selectedUserMap: map,
        })
        this.emitBulkSelectionChange()
      }
    },

    applyFocusMemberChange(nextId) {
      const id = String(nextId || '')
      this.setData({ selectedMemberId: id })
      if (!id) {
        this._resetMemberActivityStats()
        return
      }
      const member = this.findMemberByMemberId(id)
      if (!member || !member.user_id) return
      this.fetchMemberActivityStats(String(member.user_id), true)
    },

    onCloseFocusPanel() {
      this.setData({ selectedMemberId: '' })
      this._resetMemberActivityStats()
    },

    async onExportMemberDetail(e) {
      if (this.data.detailExporting) return
      let userId = String(e?.currentTarget?.dataset?.userid || '')
      if (!userId && this.data.selectedMemberId) {
        const member = this.findMemberByMemberId(this.data.selectedMemberId)
        userId = String(member?.user_id || '')
      }
      const clubId = String(this.properties.clubId || '')
      if (!clubId || !userId) {
        wx.showToast({ title: '无法导出，缺少协会或成员信息', icon: 'none' })
        return
      }

      this.setData({ detailExporting: true })
      wx.showLoading({ title: '生成文件中...' })
      try {
        const exportRes = await this._request({
          url: `/statistics/export/club/${clubId}/member_activity/wecom_media?user_ids=${encodeURIComponent(userId)}`,
          method: 'GET',
        })
        if (!exportRes || Number(exportRes.code) !== 200 || !exportRes.data?.media_id) {
          throw new Error(exportRes?.message || '生成文件失败')
        }
        wx.showLoading({ title: '发送到企业微信...' })
        const sendRes = await this._request({
          url: '/statistics/wecom/send_media_to_self',
          method: 'POST',
          data: { media_id: exportRes.data.media_id },
        })
        if (!sendRes || Number(sendRes.code) !== 200) {
          throw new Error(sendRes?.message || '发送失败')
        }
        wx.showToast({ title: '已发送到你本人的企业微信', icon: 'success' })
      } catch (error) {
        wx.showToast({ title: error.message || '导出失败', icon: 'none' })
      } finally {
        wx.hideLoading()
        this.setData({ detailExporting: false })
      }
    },

    _request(options) {
      return new Promise((resolve, reject) => {
        wx.request({
          url: `${app.globalData.request_url}${options.url}`,
          method: options.method || 'GET',
          data: options.data,
          header: {
            Authorization: `Bearer ${wx.getStorageSync('token')}`,
            'Content-Type': 'application/json',
          },
          success: (res) => resolve(res.data),
          fail: reject,
        })
      })
    },

    _resetMemberActivityStats() {
      this._activityStatsUserId = ''
      this._activityStatsPagingLock = false
      this.setData({
        memberActivityLoading: false,
        memberActivityLoadingMore: false,
        memberActivitySummary: null,
        memberActivityItems: [],
        memberActivityPage: 0,
        memberActivityTotalPages: 1,
        memberActivityListEnd: false,
      })
    },

    onFocusPanelScrollToLower() {
      const member = this.findMemberByMemberId(this.data.selectedMemberId)
      if (!member || !member.user_id) return
      this.fetchMemberActivityStats(String(member.user_id), false)
    },

    onMemberRowLongPress(e) {
      const userId = String(e?.currentTarget?.dataset?.userid || '')
      const userName = String(e?.currentTarget?.dataset?.username || '')
      if (!userId) return
      if (!this.data.bulkMode) {
        const map = {}
        map[userId] = true
        this.setData({
          bulkMode: true,
          selectedMemberId: '',
          selectedUserIds: [userId],
          selectedUserMap: map,
        })
        this._resetMemberActivityStats()
        this.emitBulkSelectionChange()
        return
      }
      this.toggleBulkUser(userId, userName)
    },

    onMemberRowTap(e) {
      handleListRowTap(this, e, {
        idKey: 'memberid',
        getSelectedId: () => this.data.selectedMemberId,
        isBulkMode: () => this.data.bulkMode,
        onBulkTap: (ev) => {
          const userId = String(ev?.currentTarget?.dataset?.userid || '')
          const userName = String(ev?.currentTarget?.dataset?.username || '')
          this.toggleBulkUser(userId, userName)
        },
        onFocusChange: (nextId) => this.applyFocusMemberChange(nextId),
      })
    },

    toggleBulkUser(userId) {
      if (!userId) return
      const sid = String(userId)
      const selected = (this.data.selectedUserIds || []).map(String)
      const exists = selected.includes(sid)
      const next = exists ? selected.filter((id) => id !== sid) : [...selected, sid]
      const map = {}
      next.forEach((id) => {
        map[String(id)] = true
      })
      this.setData({
        selectedUserIds: next,
        selectedUserMap: map,
      })
      this.emitBulkSelectionChange()
    },

    clearBulkMode() {
      if (!this.data.bulkMode && !(this.data.selectedUserIds || []).length) return
      this.setData({
        bulkMode: false,
        selectedUserIds: [],
        selectedUserMap: {},
      })
      this.emitBulkSelectionChange()
    },

    collectVisibleMemberUserIds() {
      const groups = this.data.groups || []
      const ids = []
      const seen = new Set()
      groups.forEach((grp) => {
        ;(grp.children || []).forEach((m) => {
          const uid = String(m.user_id || '')
          if (!uid || seen.has(uid)) return
          seen.add(uid)
          ids.push(uid)
        })
      })
      return ids
    },

    selectAllBulk() {
      const allIds = this.collectVisibleMemberUserIds()
      if (!allIds.length) return

      const selected = (this.data.selectedUserIds || []).map(String)
      const allSelected = allIds.every((id) => selected.includes(id))
      const nextIds = allSelected ? [] : allIds
      const map = {}
      nextIds.forEach((id) => {
        map[String(id)] = true
      })
      this.setData({
        bulkMode: true,
        selectedMemberId: '',
        selectedUserIds: nextIds,
        selectedUserMap: map,
      })
      this._resetMemberActivityStats()
      this.emitBulkSelectionChange()
    },

    emitBulkSelectionChange() {
      const selectedIds = (this.data.selectedUserIds || []).map(String)
      const selectedUsers = []
      const allVisibleIds = this.collectVisibleMemberUserIds()
      const groups = this.data.groups || []
      groups.forEach((grp) => {
        ;(grp.children || []).forEach((m) => {
          const uid = String(m.user_id)
          if (selectedIds.includes(uid)) {
            selectedUsers.push({
              user_id: uid,
              user_name: m.user_name || '',
            })
          }
        })
      })
      const totalVisible = allVisibleIds.length
      const allSelected = totalVisible > 0 && selectedUsers.length === totalVisible
      this.triggerEvent('bulkselectchange', {
        source: this.properties.expandableIdSuffix,
        active: !!this.data.bulkMode,
        count: selectedUsers.length,
        selectedUsers,
        totalVisible,
        allSelected,
      })
    },

    findMemberByMemberId(memberId) {
      const sid = String(memberId || '')
      if (!sid) return null
      const groups = this.data.groups || []
      for (const grp of groups) {
        const children = (grp && grp.children) || []
        const hit = children.find((m) => String(m.member_id) === sid)
        if (hit) return hit
      }
      return null
    },

    fetchMemberActivityStats(userId, reset = true) {
      const clubId = String(this.properties.clubId || '')
      const uid = String(userId || '')
      if (!clubId || !uid) return
      if (this._activityStatsPagingLock) return

      const pageSize = 10
      const nextPage = reset ? 1 : (Number(this.data.memberActivityPage) || 0) + 1
      if (!reset) {
        if (this.data.memberActivityListEnd) return
        if ((Number(this.data.memberActivityPage) || 0) >= (Number(this.data.memberActivityTotalPages) || 1)) return
        if (this._activityStatsUserId && this._activityStatsUserId !== uid) return
      }

      this._activityStatsPagingLock = true
      this._activityStatsUserId = uid

      if (reset) {
        this.setData({
          memberActivityLoading: true,
          memberActivityLoadingMore: false,
          memberActivitySummary: null,
          memberActivityItems: [],
          memberActivityPage: 0,
          memberActivityTotalPages: 1,
          memberActivityListEnd: false,
        })
      } else {
        this.setData({ memberActivityLoadingMore: true })
      }

      wx.request({
        url: `${app.globalData.request_url}/club/${clubId}/member/${uid}/activity_stats?page=${nextPage}&page_size=${pageSize}`,
        method: 'GET',
        header: {
          Authorization: `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json',
        },
        success: (res) => {
          const data = res?.data || {}
          if (String(data.Flag) === '4000' && data.data) {
            const batch = Array.isArray(data.data.items) ? data.data.items : []
            const pagination = data.data.pagination || {}
            const currentPage = Number(pagination.current_page) || nextPage
            const totalPages = Math.max(1, Number(pagination.total_pages) || 1)
            const totalRecords = Number(pagination.total_records)
            const merged = reset ? batch : (this.data.memberActivityItems || []).concat(batch)
            const listEnd = currentPage >= totalPages
              || (Number.isFinite(totalRecords) && merged.length >= totalRecords)

            this.setData({
              memberActivityLoading: false,
              memberActivityLoadingMore: false,
              memberActivitySummary: data.data.summary || null,
              memberActivityItems: merged,
              memberActivityPage: currentPage,
              memberActivityTotalPages: totalPages,
              memberActivityListEnd: listEnd,
            })
            return
          }
          wx.showToast({
            title: data.message || '加载活动统计失败',
            icon: 'none',
          })
          this.setData({
            memberActivityLoading: false,
            memberActivityLoadingMore: false,
            memberActivitySummary: reset ? null : this.data.memberActivitySummary,
            memberActivityItems: reset ? [] : this.data.memberActivityItems,
          })
        },
        fail: () => {
          wx.showToast({ title: '网络错误，请重试', icon: 'none' })
          this.setData({
            memberActivityLoading: false,
            memberActivityLoadingMore: false,
          })
        },
        complete: () => {
          this._activityStatsPagingLock = false
        },
      })
    },

    applyScrollAreaLayout(done, retry = 0, force = false) {
      const finish = typeof done === 'function' ? done : () => {}
      const mustForce = force || this._forceScrollLayout
      if (mustForce) this._forceScrollLayout = false

      const q = wx.createSelectorQuery().in(this)
      /** 只量 body：随 flex 父级撑满，不会随列表条数变矮；勿量 .cmb / scroll-host */
      q.select('.cmb__body').boundingClientRect()
      q.exec((res) => {
        const body = res && res[0]
        let h = body && body.height > 24 ? body.height : 0

        if (h < 24 && retry < 8) {
          if (this._layoutRetryTimer) clearTimeout(this._layoutRetryTimer)
          this._layoutRetryTimer = setTimeout(() => {
            this._layoutRetryTimer = null
            this.applyScrollAreaLayout(done, retry + 1, mustForce)
          }, 100 + retry * 80)
          return
        }
        if (h < 24) {
          try {
            const wh = wx.getSystemInfoSync().windowHeight || 667
            h = Math.max(320, Math.floor(wh * 0.72))
          } catch (e) {
            h = 520
          }
        }

        const px = Math.max(200, Math.floor(h))
        const prev = Number(this.data.scrollAreaPx) || 0
        const applyMeasures = () => {
          wx.nextTick(() => finish())
        }
        if (!mustForce && Math.abs(px - prev) <= 2 && prev > 0) {
          applyMeasures()
          return
        }
        this.setData({ scrollAreaPx: px }, applyMeasures)
      })
    },

    measureGroupOffsets() {
      const groups = this.data.groups || []
      if (!groups.length) {
        this._groupTops = []
        this.setData({ sidebarActiveAnchor: '' })
        return
      }
      const q = wx.createSelectorQuery().in(this)
      groups.forEach((g) => {
        const aid = String((g && g.anchorId) || '')
        if (aid) q.select(`#${aid}`).fields({ size: true, rect: true })
      })
      q.exec((res) => {
        if (!res || res.length !== groups.length) return
        let cum = 0
        const tops = []
        let totalH = 0
        res.forEach((node) => {
          tops.push(cum)
          let h = 0
          if (node) {
            if (typeof node.height === 'number' && node.height > 0) h = node.height
            else if (typeof node.bottom === 'number' && typeof node.top === 'number') h = node.bottom - node.top
            else if (node.size && typeof node.size.height === 'number') h = node.size.height
          }
          h = Number(h) || 0
          if (h > 0) {
            cum += h
            totalH += h
          }
        })
        if (totalH <= 0) return
        this._groupTops = tops
        const st = this._lastScrollTop || 0
        if (Date.now() >= (this._suppressSidebarFromScrollUntil || 0)) {
          this.updateStripAndSidebarFromScrollTop(st)
        }
      })
    },

    updateStripAndSidebarFromScrollTop(scrollTop) {
      if (this._sidebarDragging) return
      if (Date.now() < (this._suppressSidebarFromScrollUntil || 0)) return
      const tops = this._groupTops
      const groups = this.data.groups || []
      const sidebar = this.data.indexSidebar || []
      if (!tops || !tops.length || !groups.length) return
      const slack = 6
      let idx = 0
      for (let i = 0; i < tops.length; i++) {
        if (tops[i] <= scrollTop + slack) idx = i
        else break
      }
      const g = groups[idx]
      const anchor = (g && g.anchorId) || (sidebar[idx] && sidebar[idx].anchorId) || ''
      const patch = {}
      if (anchor && anchor !== this.data.sidebarActiveAnchor) {
        patch.sidebarActiveAnchor = anchor
      }
      if (Object.keys(patch).length) this.setData(patch)
    },

    onScroll(e) {
      const st = Number(e?.detail?.scrollTop || 0)
      this._lastScrollTop = st
      if (!this._groupTops) {
        this.measureGroupOffsets()
        return
      }
      if (this._scrollRaf) return
      this._scrollRaf = true
      wx.nextTick(() => {
        this._scrollRaf = false
        this.updateStripAndSidebarFromScrollTop(st)
      })
    },

    goAnchor(anchorId, label) {
      if (!anchorId) return
      this._suppressSidebarFromScrollUntil = Date.now() + 650
      if (this._clearScrollIntoViewTimer) {
        clearTimeout(this._clearScrollIntoViewTimer)
        this._clearScrollIntoViewTimer = null
      }
      const patch = { scrollIntoView: '' }
      if (label != null && String(label).length) {
        patch.sidebarActiveAnchor = anchorId
      }
      this.setData(patch, () => {
        wx.nextTick(() => {
          this.setData({ scrollIntoView: anchorId }, () => {
            wx.nextTick(() => this.measureGroupOffsets())
          })
        })
      })
      if (label != null && String(label).length) {
        this.triggerEvent('select', { index: label, anchorId })
      }
      this._clearScrollIntoViewTimer = setTimeout(() => {
        if (this.data.scrollIntoView === anchorId) {
          this.setData({ scrollIntoView: '' })
        }
        this._clearScrollIntoViewTimer = null
      }, 800)
    },

    onSidebarItemTap(e) {
      const anchor = (e.currentTarget.dataset.anchor || '').toString()
      const label = (e.currentTarget.dataset.label || '').toString()
      this.goAnchor(anchor, label)
    },

    cacheSidebarItemRanges() {
      const sidebar = this.data.indexSidebar || []
      if (!sidebar.length) {
        this._indexItemRanges = null
        return
      }
      const q = wx.createSelectorQuery().in(this)
      q.select('#cmb-sidebar-bar').boundingClientRect()
      q.selectAll('.cmb__sidebar-item').boundingClientRect()
      q.exec((res) => {
        const bar = res && res[0]
        const items = res && res[1]
        if (!bar || !items || !items.length) {
          this._indexItemRanges = null
          return
        }
        this._indexItemRanges = items.map((it) => ({
          top: it.top - bar.top,
          bottom: it.bottom - bar.top,
        }))
      })
    },

    onSidebarTouchStart(e) {
      this._pickIdx = -1
      this._sidebarDragging = true
      const touch = e.touches && e.touches[0]
      if (!touch) return
      this.setData({ showSidebarTips: true })
      const q = wx.createSelectorQuery().in(this)
      q.select('#cmb-sidebar-bar').boundingClientRect()
      q.selectAll('.cmb__sidebar-item').boundingClientRect()
      q.exec((res) => {
        const bar = res && res[0]
        const items = res && res[1]
        if (bar) this._sidebarBarRect = bar
        if (bar && items && items.length) {
          this._indexItemRanges = items.map((it) => ({
            top: it.top - bar.top,
            bottom: it.bottom - bar.top,
          }))
        }
        this.pickSidebarFromClientY(touch.clientY)
      })
    },

    onSidebarTouchMove(e) {
      if (!this._sidebarDragging) return
      const touch = e.touches && e.touches[0]
      if (!touch) return
      this.pickSidebarFromClientY(touch.clientY)
    },

    onSidebarTouchEnd() {
      this._sidebarDragging = false
      this._pickIdx = -1
      this.setData({ showSidebarTips: false })
      if (this._sidebarScrollFixTimer) clearTimeout(this._sidebarScrollFixTimer)
      this._sidebarScrollFixTimer = setTimeout(() => {
        this._sidebarScrollFixTimer = null
        this.measureGroupOffsets()
        this.updateStripAndSidebarFromScrollTop(this._lastScrollTop || 0)
      }, 380)
    },

    pickSidebarFromClientY(clientY) {
      const bar = this._sidebarBarRect
      const sidebar = this.data.indexSidebar || []
      if (!bar || !sidebar.length) return
      const y = clientY - bar.top
      const n = sidebar.length
      const ranges = this._indexItemRanges
      let i = 0
      if (ranges && ranges.length === n) {
        let hit = -1
        for (let j = 0; j < n; j++) {
          if (y >= ranges[j].top && y < ranges[j].bottom) {
            hit = j
            break
          }
        }
        if (hit >= 0) {
          i = hit
        } else {
          let best = 0
          let bestD = Infinity
          for (let j = 0; j < n; j++) {
            const mid = (ranges[j].top + ranges[j].bottom) / 2
            const d = Math.abs(y - mid)
            if (d < bestD) {
              bestD = d
              best = j
            }
          }
          i = best
        }
      } else {
        const ratio = bar.height > 0 ? y / bar.height : 0
        const clamped = Math.max(0, Math.min(1, ratio))
        i = Math.min(n - 1, Math.floor(clamped * n + 1e-9))
        if (i < 0) i = 0
      }
      const item = sidebar[i]
      if (!item || !item.anchorId) return
      if (this._pickIdx === i && this._sidebarDragging) return
      this._pickIdx = i
      const label = item.label || ''
      this.goAnchor(item.anchorId, label)
    },

    onChangeRole(e) {
      this.triggerEvent('changeRole', e?.currentTarget?.dataset || {})
    },

    onRemoveMember(e) {
      this.triggerEvent('removeMember', e?.currentTarget?.dataset || {})
    },
  },
})
