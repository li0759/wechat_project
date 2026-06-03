const app = getApp()
const { runPanelLoad, emitPanelLoaded } = require('../../../components/panel-loading-transition/run-load');
const panelLazy = require('../../../utils/panel-lazy-load')
import Toast from 'tdesign-miniprogram/toast/index'

Component({

  options: {
    styleIsolation: 'shared',
  },

  properties: {
    clubId: {
      type: String,
      value: '',
    },
  },

  data: {
    pltCommand: '',
    events: [],
    filteredEvents: [],
    monthEventGroups: [],
    monthIndexSidebar: [],
    searchKeyword: '',
    isLoading: false,
    default_cover: `${app.globalData.static_url}/assets/images/president/activity-default.png`,
    bulkMode: false,
    bulkSelectedEvents: [],
    bulkSelectedCount: 0,
    bulkTotalVisible: 0,
    bulkAllSelected: false,
    bulkSending: false,
    nestedEventCreate: {
      loading: true,
      renderPanel: false,
    },
  },

  lifetimes: {
    attached() {
      this._loaded = false
      this._hasExpanded = false
    },
  },

  observers: {
    clubId(clubId) {
      if (!clubId || String(clubId).startsWith('placeholder')) {
        this._lastClubId = null
        this._loaded = false
        this.setData({
          isLoading: false,
          events: [],
          filteredEvents: [],
          monthEventGroups: [],
          monthIndexSidebar: [],
        })
        return
      }
      if (this._hasExpanded && String(clubId) !== String(this._lastClubId)) {
        this._lastClubId = String(clubId)
        this._loaded = false
        this.loadData()
      }
    },
  },

  methods: {
    onPanelLoadTransitionDone() {
      emitPanelLoaded(this)
    },

    loadData() {
      this._hasExpanded = true
      const clubId = this.properties.clubId
      if (this._fetching) return this._fetching
      this._fetching = runPanelLoad(this, {
        shouldFetch: () => clubId && !String(clubId).startsWith('placeholder'),
        fetch: () => this.fetchClubEvents(clubId, { silent: true }),
      }).finally(() => {
        this._fetching = null
      })
      return this._fetching
    },

    hideCharts() {},
    showCharts() {},

    async fetchClubEvents(clubId, options = {}) {
      const silent = !!options.silent
      if (!silent) {
        this.setData({ isLoading: true })
      }
      return new Promise((resolve) => {
        const finish = (patch) => {
          this.setData(patch, () => resolve())
        }
        this.request({
          url: `/event/club/${clubId}/manage_events`,
          method: 'GET',
        }).then((res) => {
          if (!res || String(res.Flag) !== '4000') {
            throw new Error(res?.message || '获取活动失败')
          }
          const rawEvents = Array.isArray(res.data?.events) ? res.data.events : []
          const events = rawEvents.map((ev) => this.normalizeEvent(ev))
          const { filtered, groups, sidebar } = this.computeEventListView(events)
          finish({
            events,
            filteredEvents: filtered,
            monthEventGroups: groups,
            monthIndexSidebar: sidebar,
          })
        }).catch((error) => {
          finish({
            events: [],
            filteredEvents: [],
            monthEventGroups: [],
            monthIndexSidebar: [],
          })
          Toast({
            context: this,
            selector: '#t-toast',
            message: error.message || '加载失败',
            theme: 'error',
          })
        })
      })
    },

    normalizeEvent(raw) {
      const fmt = (s) => (s ? String(s).slice(0, 16) : '')
      return {
        ...raw,
        event_id: raw.event_id,
        title: raw.title || '',
        cover_url: raw.cover_url || '',
        is_cancelled: !!raw.is_cancelled,
        club_deleted: !!raw.club_deleted,
        pre_start_time_display: fmt(raw.pre_start_time),
        actual_start_time_display: fmt(raw.actual_start_time),
        actual_end_time_display: fmt(raw.actual_end_time),
      }
    },

    onEventListSearchChange(e) {
      const searchKeyword = (e?.detail?.value || '').trim()
      this.setData({ searchKeyword }, () => this.filterEvents())
    },

    onEventListSearchClear() {
      this.setData({ searchKeyword: '' }, () => this.filterEvents())
    },

    filterEventsByKeyword(events, keyword) {
      const list = Array.isArray(events) ? events : []
      const kw = (keyword || '').toLowerCase()
      if (!kw) return list
      return list.filter((ev) => {
        const title = (ev.title || '').toLowerCase()
        const loc = (ev.location_name || '').toLowerCase()
        const org = (ev.organizer?.user_name || '').toLowerCase()
        return title.includes(kw) || loc.includes(kw) || org.includes(kw)
      })
    },

    computeEventListView(events) {
      const filtered = this.filterEventsByKeyword(events, this.data.searchKeyword)
      const { groups, sidebar } = this.buildMonthView(filtered)
      return { filtered, groups, sidebar }
    },

    filterEvents() {
      const { filtered, groups, sidebar } = this.computeEventListView(this.data.events || [])
      this.setData({
        filteredEvents: filtered,
        monthEventGroups: groups,
        monthIndexSidebar: sidebar,
      })
    },

    extractEventMonthMeta(event) {
      const raw = event.pre_start_time || event.create_time
      if (!raw) {
        return { key: 'unknown', title: '未知年月', barLabel: '?' }
      }
      let d = new Date(raw)
      if (Number.isNaN(d.getTime()) && typeof raw === 'string') {
        d = new Date(raw.replace(/-/g, '/'))
      }
      if (Number.isNaN(d.getTime())) {
        return { key: 'unknown', title: '未知年月', barLabel: '?' }
      }
      const y = d.getFullYear()
      const m = d.getMonth() + 1
      const key = `${y}-${String(m).padStart(2, '0')}`
      return { key, title: `${y}年${m}月`, barLabel: `${m}月` }
    },

    buildMonthView(events) {
      const list = Array.isArray(events) ? events : []
      const map = {}
      list.forEach((ev) => {
        const meta = this.extractEventMonthMeta(ev)
        if (!map[meta.key]) {
          map[meta.key] = { title: meta.title, barLabel: meta.barLabel, items: [] }
        }
        map[meta.key].items.push(ev)
      })
      const keys = Object.keys(map).sort((a, b) => {
        if (a === 'unknown') return 1
        if (b === 'unknown') return -1
        return b.localeCompare(a)
      })
      const groups = []
      const sidebar = []
      keys.forEach((key, idx) => {
        const bucket = map[key]
        const children = bucket.items
          .slice()
          .sort((a, b) => {
            const ta = a.pre_start_time || a.create_time || ''
            const tb = b.pre_start_time || b.create_time || ''
            return tb.localeCompare(ta)
          })
        const anchorId = `cem${idx}`
        sidebar.push({ label: bucket.barLabel, anchorId })
        groups.push({ anchorId, sectionTitle: bucket.title, children })
      })
      return { groups, sidebar }
    },

    onBulkSelectChange(e) {
      const detail = e.detail || {}
      const selectedEvents = Array.isArray(detail.selectedEvents) ? detail.selectedEvents : []
      this.setData({
        bulkMode: !!detail.active,
        bulkSelectedEvents: selectedEvents,
        bulkSelectedCount: selectedEvents.length,
        bulkTotalVisible: Number(detail.totalVisible || 0),
        bulkAllSelected: !!detail.allSelected,
      })
    },

    onSelectAllBulk() {
      if (this.data.bulkSending) return
      const comp = this.selectComponent('#event-indexes-month')
      if (comp && comp.selectAllBulk) comp.selectAllBulk()
    },

    clearBulkMode() {
      const comp = this.selectComponent('#event-indexes-month')
      if (comp && comp.clearBulkMode) comp.clearBulkMode()
      this.setData({
        bulkMode: false,
        bulkSelectedEvents: [],
        bulkSelectedCount: 0,
        bulkTotalVisible: 0,
        bulkAllSelected: false,
        bulkSending: false,
      })
    },

    onExitBulkMode() {
      if (this.data.bulkSending) return
      this.clearBulkMode()
    },

    async onSendBulkEvents() {
      const selected = Array.isArray(this.data.bulkSelectedEvents) ? this.data.bulkSelectedEvents : []
      if (!selected.length) return
      const clubId = String(this.properties.clubId || '')
      if (!clubId) return
      const eventIds = selected.map((ev) => String(ev.event_id)).filter(Boolean)
      if (!eventIds.length) return

      this.setData({ bulkSending: true })
      wx.showLoading({ title: '生成文件中...' })
      try {
        const exportRes = await this.request({
          url: `/statistics/export/club/${clubId}/event_participation/wecom_media?event_ids=${encodeURIComponent(eventIds.join(','))}`,
          method: 'GET',
        })
        if (!exportRes || Number(exportRes.code) !== 200 || !exportRes.data?.media_id) {
          throw new Error(exportRes?.message || '生成文件失败')
        }
        wx.showLoading({ title: '发送到企业微信...' })
        const sendRes = await this.request({
          url: '/statistics/wecom/send_media_to_self',
          method: 'POST',
          data: { media_id: exportRes.data.media_id },
        })
        if (!sendRes || Number(sendRes.code) !== 200) {
          throw new Error(sendRes?.message || '发送失败')
        }
        Toast({
          context: this,
          selector: '#t-toast',
          message: '已发送到你本人的企业微信',
          theme: 'success',
        })
        this.clearBulkMode()
      } catch (error) {
        Toast({
          context: this,
          selector: '#t-toast',
          message: error.message || '发送失败',
          theme: 'error',
        })
      } finally {
        wx.hideLoading()
        this.setData({ bulkSending: false })
      }
    },

    onEventUpdated(e) {
      const detail = e.detail || {}
      const eventId = String(detail.eventId || '')
      const patch = detail.patch || {}
      if (!eventId) return
      const events = (this.data.events || []).map((ev) => (
        String(ev.event_id) === eventId ? { ...ev, ...patch } : ev
      ))
      this.setData({ events }, () => this.filterEvents())
    },

    onNestedEventCreateContentReady() {
      this.setData({ 'nestedEventCreate.renderPanel': true }, () => {
        panelLazy.invokePanelLoadData(this, '#nestedEventCreatePanel')
      })
    },

    onNestedEventCreateLoaded() {
      this.setData({ 'nestedEventCreate.loading': false })
    },

    closeNestedEventCreate() {
      const popup = this.selectComponent('#nestedEventCreatePopup')
      if (popup && popup.collapse) popup.collapse()
    },

    onNestedEventCreateCollapse() {},

    onNestedEventCreateCollapsed() {
      setTimeout(() => {
        this.setData({
          'nestedEventCreate.loading': true,
          'nestedEventCreate.renderPanel': false,
        })
      }, 300)
    },

    onNestedEventCreateSuccess() {
      // 先收起弹窗动画；勿在此处 loading:true，否则 fab-container 被 wx:if 卸载，动画会瞬间消失
      this.closeNestedEventCreate()
      const clubId = this.properties.clubId
      if (clubId && !String(clubId).startsWith('placeholder')) {
        this.fetchClubEvents(clubId, { silent: true })
      }
      wx.showToast({ title: '活动创建成功', icon: 'success' })
    },

    onNestedEventCreateError(e) {
      console.error('活动创建失败:', e.detail)
    },

    request(options) {
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
  },
})
