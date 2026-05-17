/**
 * 协会活动索引列表（按月分组），交互对齐 club-member-indexes
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
    defaultCover: { type: String, value: '' },
    expandableIdSuffix: { type: String, value: 'month' },
    listHeightBoostRpx: { type: Number, value: 0 },
    clubId: { type: String, value: '' },
  },

  data: {
    scrollIntoView: '',
    listRenderKey: 0,
    sidebarActiveAnchor: '',
    showSidebarTips: false,
    scrollAreaPx: 520,
    selectedEventId: '',
    eventParticipationLoading: false,
    eventParticipationLoadingMore: false,
    eventParticipationItems: [],
    eventParticipationSummary: null,
    eventParticipationPage: 0,
    eventParticipationTotalPages: 1,
    eventParticipationListEnd: false,
    bulkMode: false,
    selectedEventIds: [],
    selectedEventMap: {},
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
      this.syncSelectedEvent(groups)
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
    syncSelectedEvent(groups) {
      const selectedId = String(this.data.selectedEventId || '')
      if (!selectedId) return
      const flat = []
      ;(groups || []).forEach((grp) => {
        ;(grp.children || []).forEach((ev) => flat.push(ev))
      })
      if (!flat.some((ev) => String(ev.event_id) === selectedId)) {
        this.setData({ selectedEventId: '' })
      }
      const selectedEventIds = (this.data.selectedEventIds || []).filter((id) =>
        flat.some((ev) => String(ev.event_id) === String(id))
      )
      if (selectedEventIds.length !== (this.data.selectedEventIds || []).length) {
        const map = {}
        selectedEventIds.forEach((id) => {
          map[String(id)] = true
        })
        this.setData({ selectedEventIds, selectedEventMap: map })
        this.emitBulkSelectionChange()
      }
    },

    applyFocusEventChange(nextId) {
      const id = String(nextId || '')
      this.setData({ selectedEventId: id })
      if (!id) {
        this._resetEventParticipation()
        return
      }
      this.fetchEventParticipation(id, true)
    },

    onCloseFocusPanel() {
      this.setData({ selectedEventId: '' })
      this._resetEventParticipation()
    },

    async onExportEventDetail(e) {
      if (this.data.detailExporting) return
      const eventId = String(e?.currentTarget?.dataset?.eventid || this.data.selectedEventId || '')
      const clubId = String(this.properties.clubId || '')
      if (!clubId || !eventId) return

      this.setData({ detailExporting: true })
      wx.showLoading({ title: '生成文件中...' })
      try {
        const exportRes = await this._request({
          url: `/statistics/export/club/${clubId}/event_participation/wecom_media?event_ids=${encodeURIComponent(eventId)}`,
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

    _resetEventParticipation() {
      this._participationEventId = ''
      this._participationPagingLock = false
      this.setData({
        eventParticipationLoading: false,
        eventParticipationLoadingMore: false,
        eventParticipationItems: [],
        eventParticipationSummary: null,
        eventParticipationPage: 0,
        eventParticipationTotalPages: 1,
        eventParticipationListEnd: false,
      })
    },

    onFocusPanelScrollToLower() {
      const eventId = String(this.data.selectedEventId || '')
      if (!eventId) return
      this.fetchEventParticipation(eventId, false)
    },

    fetchEventParticipation(eventId, reset = true) {
      const eid = String(eventId || '')
      if (!eid) return
      if (this._participationPagingLock) return

      const pageSize = 10
      const nextPage = reset ? 1 : (Number(this.data.eventParticipationPage) || 0) + 1
      if (!reset) {
        if (this.data.eventParticipationListEnd) return
        if ((Number(this.data.eventParticipationPage) || 0) >= (Number(this.data.eventParticipationTotalPages) || 1)) return
        if (this._participationEventId && this._participationEventId !== eid) return
      }

      this._participationPagingLock = true
      this._participationEventId = eid

      if (reset) {
        this.setData({
          eventParticipationLoading: true,
          eventParticipationLoadingMore: false,
          eventParticipationItems: [],
          eventParticipationSummary: null,
          eventParticipationPage: 0,
          eventParticipationTotalPages: 1,
          eventParticipationListEnd: false,
        })
      } else {
        this.setData({ eventParticipationLoadingMore: true })
      }

      wx.request({
        url: `${app.globalData.request_url}/event/${eid}/participation?page=${nextPage}&page_size=${pageSize}`,
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
            const merged = reset ? batch : (this.data.eventParticipationItems || []).concat(batch)
            const listEnd = currentPage >= totalPages
              || (Number.isFinite(totalRecords) && merged.length >= totalRecords)

            this.setData({
              eventParticipationLoading: false,
              eventParticipationLoadingMore: false,
              eventParticipationItems: merged,
              eventParticipationSummary: data.data.summary || null,
              eventParticipationPage: currentPage,
              eventParticipationTotalPages: totalPages,
              eventParticipationListEnd: listEnd,
            })
            return
          }
          wx.showToast({
            title: data.message || '加载参与明细失败',
            icon: 'none',
          })
          this.setData({
            eventParticipationLoading: false,
            eventParticipationLoadingMore: false,
            eventParticipationItems: reset ? [] : this.data.eventParticipationItems,
            eventParticipationSummary: reset ? null : this.data.eventParticipationSummary,
          })
        },
        fail: () => {
          wx.showToast({ title: '网络错误，请重试', icon: 'none' })
          this.setData({
            eventParticipationLoading: false,
            eventParticipationLoadingMore: false,
          })
        },
        complete: () => {
          this._participationPagingLock = false
        },
      })
    },

    onEventRowLongPress(e) {
      const eventId = String(e?.currentTarget?.dataset?.eventid || '')
      if (!eventId) return
      if (!this.data.bulkMode) {
        const map = {}
        map[eventId] = true
        this.setData({
          bulkMode: true,
          selectedEventId: '',
          selectedEventIds: [eventId],
          selectedEventMap: map,
        })
        this._resetEventParticipation()
        this.emitBulkSelectionChange()
        return
      }
      this.toggleBulkEvent(eventId)
    },

    onEventRowTap(e) {
      handleListRowTap(this, e, {
        idKey: 'eventid',
        getSelectedId: () => this.data.selectedEventId,
        isBulkMode: () => this.data.bulkMode,
        onBulkTap: (ev) => this.toggleBulkEvent(String(ev?.currentTarget?.dataset?.eventid || '')),
        onFocusChange: (nextId) => this.applyFocusEventChange(nextId),
      })
    },

    toggleBulkEvent(eventId) {
      if (!eventId) return
      const sid = String(eventId)
      const selected = (this.data.selectedEventIds || []).map(String)
      const next = selected.includes(sid) ? selected.filter((id) => id !== sid) : [...selected, sid]
      const map = {}
      next.forEach((id) => {
        map[String(id)] = true
      })
      this.setData({ selectedEventIds: next, selectedEventMap: map })
      this.emitBulkSelectionChange()
    },

    clearBulkMode() {
      if (!this.data.bulkMode && !(this.data.selectedEventIds || []).length) return
      this.setData({
        bulkMode: false,
        selectedEventIds: [],
        selectedEventMap: {},
      })
      this.emitBulkSelectionChange()
    },

    collectVisibleEventIds() {
      const groups = this.data.groups || []
      const ids = []
      const seen = new Set()
      groups.forEach((grp) => {
        ;(grp.children || []).forEach((ev) => {
          const eid = String(ev.event_id || '')
          if (!eid || seen.has(eid)) return
          seen.add(eid)
          ids.push(eid)
        })
      })
      return ids
    },

    selectAllBulk() {
      const allIds = this.collectVisibleEventIds()
      if (!allIds.length) return
      const selected = (this.data.selectedEventIds || []).map(String)
      const allSelected = allIds.every((id) => selected.includes(id))
      const nextIds = allSelected ? [] : allIds
      const map = {}
      nextIds.forEach((id) => {
        map[String(id)] = true
      })
      this.setData({
        bulkMode: true,
        selectedEventId: '',
        selectedEventIds: nextIds,
        selectedEventMap: map,
      })
      this._resetEventParticipation()
      this.emitBulkSelectionChange()
    },

    emitBulkSelectionChange() {
      const selectedIds = (this.data.selectedEventIds || []).map(String)
      const selectedEvents = []
      const allVisibleIds = this.collectVisibleEventIds()
      ;(this.data.groups || []).forEach((grp) => {
        ;(grp.children || []).forEach((ev) => {
          const eid = String(ev.event_id)
          if (selectedIds.includes(eid)) {
            selectedEvents.push({ event_id: eid, title: ev.title || '' })
          }
        })
      })
      const totalVisible = allVisibleIds.length
      const allSelected = totalVisible > 0 && selectedEvents.length === totalVisible
      this.triggerEvent('bulkselectchange', {
        active: !!this.data.bulkMode,
        count: selectedEvents.length,
        selectedEvents,
        totalVisible,
        allSelected,
      })
    },

    findEventById(eventId) {
      const sid = String(eventId || '')
      if (!sid) return null
      for (const grp of this.data.groups || []) {
        const hit = (grp.children || []).find((ev) => String(ev.event_id) === sid)
        if (hit) return hit
      }
      return null
    },

    patchEventInGroups(eventId, patch) {
      this.triggerEvent('eventupdated', { eventId: String(eventId), patch })
    },

    requestEventApi(options) {
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

    formatIsoDisplay(iso) {
      if (!iso) return ''
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return String(iso)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      return `${y}-${m}-${day} ${hh}:${mm}`
    },

    async onBeginEvent(e) {
      const eventId = String(e?.currentTarget?.dataset?.eventid || this.data.selectedEventId || '')
      if (!eventId) return
      const ok = await wx.showModal({
        title: '开始活动',
        content: '确认现在开始？将生成实际开始时间',
        confirmText: '开始',
        cancelText: '取消',
      })
      if (!ok.confirm) return
      try {
        wx.showLoading({ title: '开始中...' })
        const res = await this.requestEventApi({ url: `/event/${eventId}/begin`, method: 'GET' })
        if (String(res.Flag) !== '4000') throw new Error(res.message || '开始失败')
        const actual = res.data?.actual_startTime || new Date().toISOString()
        this.patchEventInGroups(eventId, {
          actual_start_time: actual,
          actual_start_time_display: this.formatIsoDisplay(actual),
        })
        try {
          await this.requestEventApi({ url: `/event/clockin/${eventId}`, method: 'GET' })
        } catch (_) {}
        wx.showToast({ title: '已开始', icon: 'success' })
      } catch (err) {
        wx.showToast({ title: err.message || '开始失败', icon: 'none' })
      } finally {
        wx.hideLoading()
      }
    },

    async onEndEvent(e) {
      const eventId = String(e?.currentTarget?.dataset?.eventid || this.data.selectedEventId || '')
      if (!eventId) return
      const ok = await wx.showModal({
        title: '结束活动',
        content: '确认现在结束？将生成实际结束时间',
        confirmText: '结束',
        cancelText: '取消',
      })
      if (!ok.confirm) return
      try {
        wx.showLoading({ title: '结束中...' })
        const res = await this.requestEventApi({ url: `/event/${eventId}/end`, method: 'GET' })
        if (String(res.Flag) !== '4000') throw new Error(res.message || '结束失败')
        const actual = res.data?.actual_endTime || new Date().toISOString()
        this.patchEventInGroups(eventId, {
          actual_end_time: actual,
          actual_end_time_display: this.formatIsoDisplay(actual),
        })
        wx.showToast({ title: '已结束', icon: 'success' })
      } catch (err) {
        wx.showToast({ title: err.message || '结束失败', icon: 'none' })
      } finally {
        wx.hideLoading()
      }
    },

    async onCancelEvent(e) {
      const eventId = String(e?.currentTarget?.dataset?.eventid || this.data.selectedEventId || '')
      if (!eventId) return
      const ok = await wx.showModal({
        title: '取消活动',
        content: '确认取消此活动？取消后活动将无法恢复',
        confirmText: '确认取消',
        confirmColor: '#ff4d4f',
        cancelText: '取消',
      })
      if (!ok.confirm) return
      try {
        wx.showLoading({ title: '取消中...' })
        const res = await this.requestEventApi({ url: `/event/${eventId}/cancel`, method: 'POST' })
        if (String(res.Flag) !== '4000') throw new Error(res.message || '取消失败')
        this.patchEventInGroups(eventId, { is_cancelled: true })
        this.setData({ selectedEventId: '' })
        wx.showToast({ title: '活动已取消', icon: 'success' })
      } catch (err) {
        wx.showToast({ title: err.message || '取消失败', icon: 'none' })
      } finally {
        wx.hideLoading()
      }
    },

    async onClockIn(e) {
      const eventId = String(e?.currentTarget?.dataset?.eventid || this.data.selectedEventId || '')
      if (!eventId) return
      try {
        wx.showLoading({ title: '打卡中...' })
        const res = await this.requestEventApi({ url: `/event/clockin/${eventId}`, method: 'GET' })
        if (String(res.Flag) !== '4000') throw new Error(res.message || '打卡失败')
        wx.showToast({ title: '打卡成功', icon: 'success' })
      } catch (err) {
        wx.showToast({ title: err.message || '打卡失败', icon: 'none' })
      } finally {
        wx.hideLoading()
      }
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

  },
})
