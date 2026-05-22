// pages/profile/club-members/index.js
const app = getApp()
import Toast from 'tdesign-miniprogram/toast/index'

const AB_ENTER_LEAVE_MS = 180

Component({
  options: {
    // 让本组件 wxss 下发到子组件（club-member-indexes），否则会出现「列表/详情弹窗像没样式」的情况
    styleIsolation: 'shared'
  },
  properties: {
    clubId: {
      type: String,
      value: ''
    }
  },

  data: {
    members: [],
    filteredMembers: [],
    memberListTab: '0',
    /** 与 t-tabs 同步；wx:if 用数字比较，避免 change 返回 number 时三个列表都不挂载 */
    memberListTabIndex: 0,
    nameMemberGroups: [],
    nameIndexSidebar: [],
    deptMemberGroups: [],
    deptIndexSidebar: [],
    monthMemberGroups: [],
    monthIndexSidebar: [],
    searchKeyword: '',
    loading: true,
    default_avatar: app.globalData.static_url+'/assets/default_avatar.webp',
    // 角色相关
    roleNames: {
      'president': '会长',
      'vice_president': '副会长',
      'director': '理事',
      'member': '普通会员'
    },
    roleTheme: {
      'president': 'danger',
      'vice_president': 'warning',
      'director': 'primary',
      'member': 'default'
    },
    
    
    currentUserId: '',
    
    // 权限相关
    isPresident: false,
    
    // 角色选项 (参考club-manage)
    roleOptions: {
      'member': {
        display: '会员',
        availableRoles: ['director', 'vice_president', 'president']
      },
      'director': {
        display: '理事',
        availableRoles: ['member', 'vice_president', 'president']
      },
      'vice_president': {
        display: '副会长',
        availableRoles: ['member', 'director', 'president']
      },
      'president': {
        display: '会长',
        availableRoles: ['member', 'director', 'vice_president']
      }
    },
    
    // 添加会员时的角色选项（数组格式，用于picker）
    addMemberRoleOptions: [
      { key: 'member', display: '会员' },
      { key: 'director', display: '理事' },
      { key: 'vice_president', display: '副会长' },
      { key: 'president', display: '会长' }
    ],
    
    roleDisplayMap: {
      'all': '全部',
      'member': '会员',
      'director': '理事',
      'vice_president': '副会长',
      'president': '会长'
    },
    
    // 添加会员弹窗相关
    // t-tabs 用 0/1 控制，避免 value 类型不一致导致切换不生效
    addMemberTab: 0, // 0=search, 1=allUsers
    // 页面内通讯录（替代 addressbook-tree 组件）
    abDeptTree: [],
    // 新通讯录渲染：参考 club-manage，用 deptExpand map 递归渲染
    abDeptExpand: {}, // { [deptId]: { loading, loaded, type, departments, users } }
    // 通讯录导航视图（目录式进入/返回，避免 template 递归在 portal 内异常）
    abNavStack: [], // [{ department_id, department_name, user_count_total }]
    abNavTitle: '',
    abViewType: 'root', // root | children | users
    abCurrentDeptId: '',
    abCurrentDepartments: [],
    abCurrentUsers: [],
    abLoading: false,
    abIndentStep: 14,
    abThemeColor: '#667eea',
    abDebug: false,
    existingUserIds: [],
    searchResults: [],
    // ===== 当前协会成员头像墙（isotope） =====
    recentAddedUserIds: [], // 通讯录/搜索新增的用户ID，最新在前
    memberAvatarItems: [],
    // 头像图片样式（圆形）
    memberImageStyle: {
      borderRadius: '50%'
    },
    // isotope 容器高度（会根据 items 数量自动调整）
    memberIsoHeight: '150rpx'
    ,
    // 全屏弹窗内部滚动位置（用于“滚到顶部继续下拉才收回”手势判断）
    addMemberInnerScrollTop: 0,
    // 添加成员弹窗：用 scroll-view 下拉刷新触发“到顶继续下拉收回”
    amRefresherTriggered: false
    ,
    bulkSelectionBySource: {},
    bulkMode: false,
    bulkSelectedUsers: [],
    bulkSelectedCount: 0,
    bulkTotalVisible: 0,
    bulkAllSelected: false,
    bulkSending: false
  },

  lifetimes: {
    attached() {
      const userId = wx.getStorageSync('userId')
      this.setData({ currentUserId: userId })
      this._loaded = false
      this._hasExpanded = false
    }
  },

  observers: {
    'clubId': function(clubId) {
      if (!clubId || clubId.startsWith('placeholder')) {
        this._lastClubId = null
        this._loaded = false
        this.setData({
          loading: false,
          members: [],
          filteredMembers: [],
          nameMemberGroups: [],
          nameIndexSidebar: [],
          deptMemberGroups: [],
          deptIndexSidebar: [],
          monthMemberGroups: [],
          monthIndexSidebar: [],
        })
        return
      }
      if (this._hasExpanded && String(clubId) !== String(this._lastClubId)) {
        this._lastClubId = String(clubId)
        this._loaded = false
        this.loadData()
      }
    }
  },

  methods: {
    onAddMemberInnerScroll(e) {
      const top = Number(e?.detail?.scrollTop || 0)
      if (top !== this.data.addMemberInnerScrollTop) {
        this.setData({ addMemberInnerScrollTop: top })
      }
    },
  onAddMemberRefresherRefresh() {
      // refresher 只会在 scroll 到顶后下拉触发，符合“到顶继续下拉收回”
      // 立即关闭触发态，避免出现加载转圈
      this.setData({ amRefresherTriggered: false })
      try {
        this.selectComponent('#add-member-sheet')?.collapse?.()
      } catch (e) {}
    },
    // 懒加载入口：供外部调用，只有弹窗展开时才加载数据
  loadData() {
      this._hasExpanded = true
      if (this._loaded) return Promise.resolve()
      this._loaded = true
      
      const clubId = this.properties.clubId
      if (!clubId || clubId.startsWith('placeholder')) {
        this.setData({ loading: false })
        this.triggerEvent('loaded')
        return Promise.resolve()
      }
      
      this._lastClubId = String(clubId)
      return this.fetchClubMembers(clubId).then(() => {
        this.triggerEvent('loaded')
      }).catch(() => {
        this.triggerEvent('loaded')
      })
    },

    // 返回按钮 - 触发 close 事件
  onNavBack() {
      this.triggerEvent('close')
    },

    // 获取协会成员列表
    // opts.silent：后台刷新（不置 loading，避免盖住「添加会员」全屏层、不出现骨架屏闪烁）
    async fetchClubMembers(clubId, opts = {}) {
      if (!clubId) clubId = this.properties.clubId
      const silent = !!(opts && opts.silent)
      if (!silent) {
        this.setData({ loading: true })
      }
    return new Promise((resolve, reject) => {
      const prevExisting = (this.data.existingUserIds || []).map((x) => String(x))
      wx.request({
        url: app.globalData.request_url + `/club/${clubId}/members`,
        method: 'GET',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}`,
          'Content-Type': 'application/json'
        },
        success: (res) => {
          
          if (res.data.Flag == '4000') {
            const membersData = res.data.data.members || []
            
            // 处理成员数据
    const processedMembers = membersData.map(member => {
              const isDeleted = !!(member.is_deleted || member.isDelete)
              return {
                member_id: member.member_id,
                user_id: member.user_id,
                wecom_user_id: member.wecom_user_id,
                user_name: member.user_name,
                phone: member.phone,
                department: member.department,
                position: member.position,
                role: member.role,
                is_deleted: isDeleted,
                role_display: isDeleted ? '已退出协会' : (member.role_display || this.data.roleNames[member.role] || '普通会员'),
                avatar: member.avatar,
                join_date: this.formatDate(member.join_date),
                join_date_raw: member.join_date,
                is_current_user: member.is_current_user,
                participation_count: member.participation_count || 0
              }
            })
            
            // 检查当前用户权限
    const currentMember = processedMembers.find(m => m.is_current_user)
            const isPresident = currentMember && currentMember.role === 'president'
            
            this.setData({
              members: processedMembers,
              filteredMembers: processedMembers,
              existingUserIds: processedMembers
                .filter((m) => !m.is_deleted)
                .map((m) => String(m.user_id)),
              isPresident: isPresident,
              loading: false
            }, () => {
              // 记录“本次新增”的成员，确保头像墙新加的在最前面
    const nextExisting = processedMembers.map((m) => String(m.user_id))
              if (prevExisting.length > 0) {
                const added = nextExisting.filter((id) => !prevExisting.includes(id))
                if (added.length) {
                  const merged = [...added, ...(this.data.recentAddedUserIds || [])]
                  // 去重 + 保持顺序
    const seen = new Set()
                  const uniq = merged.filter((id) => {
                    const sid = String(id)
                    if (seen.has(sid)) return false
                    seen.add(sid)
                    return true
                  })
                  this.setData({ recentAddedUserIds: uniq }, () => this.updateMemberIsotope())
                  return
                }
              }
              // 初次加载或无新增：仅刷新头像墙
    this.updateMemberIsotope()
            })
            
            this.filterMembers()
            // 现有成员变化会影响通讯录“已添加”态
    if ((this.data.abDeptTree || []).length) this.abRefreshExistingStatus()
            resolve()
          } else {
            this.setData({ loading: false })
            Toast({
              context: this,
              selector: '#t-toast',
              message: res.data.message || '获取成员列表失败',
              theme: 'error',
              direction: 'column',
            })
            resolve()
          }
        },
        fail: (err) => {
          this.setData({ loading: false })
          Toast({
            context: this,
            selector: '#t-toast',
            message: '网络请求失败',
            theme: 'error',
            direction: 'column',
          })
          resolve()
        }
      })
    })
  },

  updateMemberIsotope() {
    const members = Array.isArray(this.data.members) ? this.data.members : []
    const avatar = 50  // 头像尺寸改为 50rpx

    // 清理 recentAdded：只保留仍在 members 内的
    const memberIdSet = new Set(members.map((m) => String(m.user_id)))
    const recent = (this.data.recentAddedUserIds || []).map(String).filter((id) => memberIdSet.has(id))
    if (recent.length !== (this.data.recentAddedUserIds || []).length) {
      this.setData({ recentAddedUserIds: recent })
    }

    const byId = new Map(members.map((m) => [String(m.user_id), m]))
    const ordered = []
    for (const id of recent) {
      const m = byId.get(String(id))
      if (m) ordered.push(m)
    }
    // 其余成员保持原顺序
    for (const m of members) {
      const id = String(m.user_id)
      if (recent.includes(id)) continue
      ordered.push(m)
    }

    const items = ordered.map((m) => ({
      id: `club-member-${String(m.user_id)}`,
      image: m.avatar || '/assets/images/default-avatar.png',
      ini_width: avatar,
      ini_height: avatar,
      user_id: String(m.user_id),
      user_name: m.user_name
    }))
    
    // 添加调试日志
    if (items.length > 0) {
    }
    
    // 检查 isotope 组件是否已经加载且有 items
    const iso = this.selectComponent('#clubMemberIsotope')
    const currentItems = iso && iso.data && iso.data.itemsWithPosition || []
    
    // 如果组件已经加载且有 items，且新 items 只是数量变化（可能是动态操作），
    // 就不更新 memberAvatarItems，避免触发 onItemsChange 导致全部重新初始化
    if (currentItems.length > 0 && items.length > 0) {
      const currentIds = new Set(currentItems.map(i => String(i.id || i.user_id ? `club-member-${i.user_id}` : '')));
      const newIds = new Set(items.map(i => String(i.id)));
      
      // 如果只是新增一个或删除一个，就不更新，让动态接口处理
    const diff = Math.abs(items.length - currentItems.length);
      if (diff <= 1) {
        const allCurrentInNew = Array.from(currentIds).every(id => newIds.has(id));
        const allNewInCurrent = Array.from(newIds).every(id => currentIds.has(id));
        
        if (allCurrentInNew || allNewInCurrent) {
          // 只同步数据到组件内部，不更新 memberAvatarItems
          // 动态接口已经处理了，这里只更新数据源，不触发重新初始化
          return;
        }
      }
    }
    
    this.setData({
      memberAvatarItems: items,
    })
  },

  // 添加会员弹窗打开：每次打开都触发一次 isotope 飞入动画
  async onAddMemberSheetExpand() {
    // 打开时先复位内部滚动位置记录，避免误判“已在顶部”
    this.setData({ addMemberInnerScrollTop: 0 })
    // 兜底：确保头像墙数据已准备好（即使成员刚加载完）
    // 更新 items 会触发 onItemsChange -> initializeItems，自动执行飞入动画
    setTimeout(() => {
      this.updateMemberIsotope()
    }, 500)

    // 保持原逻辑：需要时加载通讯录
    await this.abEnsureLoaded()
  },

  // 格式化日期
  formatDate(dateString) {
    if (!dateString) return '未知'
    
    const date = new Date(dateString)
    const year = date.getFullYear()
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    
    return `${year}-${month}-${day}`
  },

  onMemberListSearchChange(e) {
    const raw = e.detail && e.detail.value != null ? String(e.detail.value) : ''
    const keyword = raw.trim()
    this.setData({ searchKeyword: keyword }, () => this.filterMembers())
  },

  onMemberListSearchClear() {
    this.setData({ searchKeyword: '' }, () => this.filterMembers())
  },

  onMemberListSwiperChange(e) {
    const idx = Math.min(2, Math.max(0, Math.floor(Number(e.detail && e.detail.current != null ? e.detail.current : 0))))
    if (idx === this.data.memberListTabIndex) return
    this.setData({ memberListTabIndex: idx, memberListTab: String(idx) }, () => {
      this.syncBulkStateFromActiveTab()
    })
  },

  onMemberListDotTap(e) {
    const idx = Math.min(2, Math.max(0, Math.floor(Number(e.currentTarget.dataset.index))))
    if (idx === this.data.memberListTabIndex) return
    this.setData({ memberListTabIndex: idx, memberListTab: String(idx) }, () => {
      this.syncBulkStateFromActiveTab()
    })
  },

  getActiveTabSource() {
    const idx = Number(this.data.memberListTabIndex || 0)
    if (idx === 1) return 'dept'
    if (idx === 2) return 'month'
    return 'name'
  },

  getActiveMemberIndexesId() {
    const source = this.getActiveTabSource()
    if (source === 'dept') return '#member-indexes-dept'
    if (source === 'month') return '#member-indexes-month'
    return '#member-indexes-name'
  },

  syncBulkStateFromActiveTab() {
    const source = this.getActiveTabSource()
    const bySource = this.data.bulkSelectionBySource || {}
    const cur = bySource[source] || { active: false, selectedUsers: [] }
    const selectedUsers = Array.isArray(cur.selectedUsers) ? cur.selectedUsers : []
    this.setData({
      bulkMode: !!cur.active,
      bulkSelectedUsers: selectedUsers,
      bulkSelectedCount: selectedUsers.length,
      bulkTotalVisible: Number(cur.totalVisible || 0),
      bulkAllSelected: !!cur.allSelected,
    })
  },

  onBulkSelectChange(e) {
    const detail = e.detail || {}
    const source = String(detail.source || '')
    if (!source) return
    const selectedUsers = Array.isArray(detail.selectedUsers) ? detail.selectedUsers : []
    const nextBySource = {
      ...(this.data.bulkSelectionBySource || {}),
      [source]: {
        active: !!detail.active,
        selectedUsers,
        totalVisible: Number(detail.totalVisible || 0),
        allSelected: !!detail.allSelected,
      },
    }
    this.setData({ bulkSelectionBySource: nextBySource }, () => this.syncBulkStateFromActiveTab())
  },

  onSelectAllBulk() {
    if (this.data.bulkSending) return
    const comp = this.selectComponent(this.getActiveMemberIndexesId())
    if (comp && comp.selectAllBulk) {
      comp.selectAllBulk()
    }
  },

  clearAllBulkModes() {
    const ids = ['#member-indexes-name', '#member-indexes-dept', '#member-indexes-month']
    ids.forEach((id) => {
      const comp = this.selectComponent(id)
      if (comp && comp.clearBulkMode) {
        comp.clearBulkMode()
      }
    })
    this.setData({
      bulkSelectionBySource: {},
      bulkMode: false,
      bulkSelectedUsers: [],
      bulkSelectedCount: 0,
      bulkTotalVisible: 0,
      bulkAllSelected: false,
      bulkSending: false,
    })
  },

  onExitBulkMode() {
    if (this.data.bulkSending) return
    this.clearAllBulkModes()
  },

  async onSendBulkMemberActivity() {
    const users = Array.isArray(this.data.bulkSelectedUsers) ? this.data.bulkSelectedUsers : []
    if (!users.length) return
    const clubId = String(this.properties.clubId || '')
    if (!clubId) return
    const userIds = users.map((u) => String(u.user_id)).filter(Boolean)
    if (!userIds.length) return

    this.setData({ bulkSending: true })
    wx.showLoading({ title: '生成文件中...' })
    try {
      const exportRes = await this.request({
        url: `/statistics/export/club/${clubId}/member_activity/wecom_media?user_ids=${encodeURIComponent(userIds.join(','))}`,
        method: 'GET'
      })
      if (!exportRes || Number(exportRes.code) !== 200 || !exportRes.data || !exportRes.data.media_id) {
        throw new Error(exportRes?.message || '生成文件失败')
      }
      wx.showLoading({ title: '发送到企业微信...' })
      const sendRes = await this.request({
        url: '/statistics/wecom/send_media_to_self',
        method: 'POST',
        data: { media_id: exportRes.data.media_id }
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
      this.clearAllBulkModes()
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

  filterMembers() {
    const members = this.data.members || []
    const searchKeyword = this.data.searchKeyword || ''
    let filtered = members
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase()
      filtered = members.filter((member) => {
        const name = (member.user_name || '').toLowerCase()
        return (
          name.includes(keyword) ||
          (member.department && member.department.toLowerCase().includes(keyword)) ||
          (member.position && member.position.toLowerCase().includes(keyword)) ||
          (member.phone && member.phone.includes(keyword))
        )
      })
    }
    this.setData({ filteredMembers: filtered })
    this.rebuildMemberListViews(filtered)
  },

  rebuildMemberListViews(members) {
    const list = Array.isArray(members) ? members : []
    const name = this.buildMemberNameView(list)
    const dept = this.buildMemberDeptView(list)
    const month = this.buildMemberMonthView(list)
    this.setData({
      nameMemberGroups: name.groups,
      nameIndexSidebar: name.sidebar,
      deptMemberGroups: dept.groups,
      deptIndexSidebar: dept.sidebar,
      monthMemberGroups: month.groups,
      monthIndexSidebar: month.sidebar,
    })
  },

  getNameInitialKey(member) {
    const name = (member.user_name || '').trim()
    const wid = String(member.wecom_user_id || '')
    const pickLetter = (s) => {
      if (!s) return ''
      const ch = s[0]
      return /[a-zA-Z]/.test(ch) ? ch.toUpperCase() : ''
    }
    const k = pickLetter(name) || pickLetter(wid)
    if (!k) return '#'
    return k
  },

  buildMemberNameView(members) {
    const list = [...members]
    list.sort((a, b) => (a.user_name || '').localeCompare(b.user_name || '', 'zh-Hans-CN'))
    const map = {}
    list.forEach((m) => {
      const k = this.getNameInitialKey(m)
      if (!map[k]) map[k] = []
      map[k].push(m)
    })
    const sortKeys = (a, b) => {
      if (a === '#') return 1
      if (b === '#') return -1
      return a.localeCompare(b)
    }
    const keys = Object.keys(map).sort(sortKeys)
    const groups = []
    const sidebar = []
    keys.forEach((key, idx) => {
      const anchorId = `milg${idx}`
      const sectionTitle = key === '#' ? '其他' : key
      sidebar.push({ label: key === '#' ? '#' : key, anchorId })
      groups.push({ anchorId, sectionTitle, children: map[key] })
    })
    return { groups, sidebar }
  },

  buildMemberDeptView(members) {
    const map = {}
    ;[...members].forEach((m) => {
      const dept = (m.department && String(m.department).trim()) || '未填写部门'
      if (!map[dept]) map[dept] = []
      map[dept].push(m)
    })
    const deptNames = Object.keys(map).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    const groups = []
    const sidebar = []
    deptNames.forEach((deptName, idx) => {
      const children = map[deptName]
        .slice()
        .sort((a, b) => (a.user_name || '').localeCompare(b.user_name || '', 'zh-Hans-CN'))
      const anchorId = `mild${idx}`
      const s = String(deptName == null ? '' : deptName)
      let label = ''
      for (const ch of s) {
        if (label.length >= 4) break
        label += ch
      }
      sidebar.push({ label, anchorId })
      groups.push({ anchorId, sectionTitle: deptName, children })
    })
    return { groups, sidebar }
  },

  extractJoinMonthMeta(member) {
    const raw = member.join_date_raw != null ? member.join_date_raw : member.join_date
    if (!raw || raw === '未知') {
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
    return {
      key,
      title: `${y}年${m}月`,
      barLabel: `${m}月`,
    }
  },

  buildMemberMonthView(members) {
    const map = {}
    ;[...members].forEach((m) => {
      const meta = this.extractJoinMonthMeta(m)
      if (!map[meta.key]) {
        map[meta.key] = { title: meta.title, barLabel: meta.barLabel, users: [] }
      }
      map[meta.key].users.push(m)
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
      const children = bucket.users
        .slice()
        .sort((a, b) => (a.user_name || '').localeCompare(b.user_name || '', 'zh-Hans-CN'))
      const anchorId = `milm${idx}`
      sidebar.push({ label: bucket.title, anchorId })
      groups.push({ anchorId, sectionTitle: bucket.title, children })
    })
    return { groups, sidebar }
  },

  /** 兼容页面 bindtap（dataset）与子组件 triggerEvent（detail） */
  getHandlerDataset(e) {
    const detail = e && e.detail
    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      const hasKeys = detail.memberid != null
        || detail.userid != null
        || detail.userId != null
        || detail.user_id != null
        || detail.newrole != null
        || detail.username != null
      if (hasKeys) return detail
    }
    return (e && e.currentTarget && e.currentTarget.dataset) || {}
  },

  // 角色变更 (参考club-manage)
  async changeRole(e) {
    const ds = this.getHandlerDataset(e)
    const memberid = ds.memberid ?? ds.memberId
    const newrole = ds.newrole ?? ds.newRole
    const username = ds.username ?? ds.userName ?? ds.user_name

    if (!memberid || !newrole) {
      this.showErrorToast('参数错误')
      return
    }

    const roleDisplayName = this.data.roleDisplayMap[newrole] || newrole
    
    let confirmContent = `确定要将 ${username} 的角色改为 ${roleDisplayName} 吗？`
    if (newrole === 'president') {
      confirmContent = `确定要将 ${username} 提拔为会长吗？\n\n注意：您将自动卸任会长职务。`
    }
    
    const result = await wx.showModal({
      title: '确认角色变更',
      content: confirmContent,
      confirmText: '确认变更',
      cancelText: '取消'
    })

    if (!result.confirm) return

    try {
      wx.showLoading({ title: '处理中...' })
      const res = await this.request({
        url: `/club/${memberid}/change_role/${newrole}`,
        method: 'GET'
      })

      if (res.Flag === '4000') {
        Toast({
          context: this,
          selector: '#t-toast',
          message: '角色变更成功',
          theme: 'success',
        })
        
        if (newrole === 'president') {
          setTimeout(() => {
            wx.reLaunch({
              url: '/pages/home/index'
            })
          }, 1000)
        } else {
          await this.fetchClubMembers(this.properties.clubId, { silent: true })
          this.closeMemberDetailPopup()
        }
      } else {
        Toast({
          context: this,
          selector: '#t-toast',
          message: res.message || '角色变更失败',
          theme: 'error',
        })
      }
    } catch (error) {
      Toast({
        context: this,
        selector: '#t-toast',
        message: '网络错误',
        theme: 'error',
      })
    } finally {
      wx.hideLoading()
    }
  },

  // 移除会员 (参考club-manage)
  async removeMember(e) {
    const ds = this.getHandlerDataset(e)
    const userid = ds.userid ?? ds.userId ?? ds.user_id
    const username = ds.username ?? ds.userName ?? ds.user_name

    if (userid == null || userid === '') {
      Toast({
        context: this,
        selector: '#t-toast',
        message: '缺少用户ID',
        theme: 'error',
      })
      return
    }

    const found = this.data.members.find((m) => String(m.user_id) === String(userid))
    const displayName = (found && found.user_name) || username || '该会员'

    wx.showModal({
      title: '确认移除',
      content: `确定要移除会员「${displayName}」吗？`,
      confirmColor: '#ee0a24',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' })
          
          try {
            const res = await this.request({
              url: `/club/${this.properties.clubId}/deletemember/${userid}`,
              method: 'GET'
            })

            if (res.Flag === '4000') {
              Toast({
                context: this,
                selector: '#t-toast',
                message: '移除成功',
                theme: 'success',
              })
              
              // 先执行删除动画
    const iso = this.selectComponent('#clubMemberIsotope')
              if (iso && iso.removeItem) {
                iso.removeItem(`club-member-${String(userid)}`)
                // 从 recentAddedUserIds 中移除
    const recent = (this.data.recentAddedUserIds || []).filter(id => String(id) !== String(userid))
                this.setData({ recentAddedUserIds: recent })
              }
              
              // 更新成员列表和搜索结果状态（updateMemberIsotope 会检测到只是删除一个，不会触发重新初始化）
              await this.fetchClubMembers(this.properties.clubId, { silent: true })
              this.updateSearchResultsStatus()
              
              // 如果组件未加载，兜底更新整个数组
    if (!iso || !iso.removeItem) {
                this.updateMemberIsotope()
              }
              
            } else {
              Toast({
                context: this,
                selector: '#t-toast',
                message: res.message || '移除失败',
                theme: 'error',
              })
            }
          } catch (error) {
            Toast({
              context: this,
              selector: '#t-toast',
              message: '网络错误',
              theme: 'error',
            })
          } finally {
            wx.hideLoading()
          }
        }
      }
    })
  },


  // 添加会员弹窗tab切换
  onAddMemberTabChange(e) {
    const nextRaw = e && e.detail ? e.detail.value : undefined
    // 统一成数字：0=search, 1=allUsers（兼容 value 可能传字符串）
    let nextTab = nextRaw
    if (nextRaw === 'search') nextTab = 0
    if (nextRaw === 'allUsers') nextTab = 1
    if (nextRaw === '0') nextTab = 0
    if (nextRaw === '1') nextTab = 1

    const nextNum = Number(nextTab)
    this.setData({ addMemberTab: Number.isFinite(nextNum) ? nextNum : 0 }, () => {
      if (this.data.addMemberTab === 1) this.abEnsureLoaded()
    })
  },

  // ===== 通讯录（全部用户）：递归 t-collapse + 懒加载（参考 club-manage） =====

  async abEnsureLoaded() {
    // 仅在“全部用户”tab时加载，避免无意义请求
    if (Number(this.data.addMemberTab) !== 1) return
    if ((this.data.abDeptTree || []).length) return
    await this.abFetchAllDepartments()
  },

  async abFetchAllDepartments() {
    try {
      this.setData({ abLoading: true })
      const res = await this.request({ url: `/user/departments`, method: 'GET' })
      if (res.Flag == 4000 && res.data && Array.isArray(res.data.departments)) {
        const departments = (res.data.departments || []).map((d) => ({
          ...d,
          department_id: String(d.department_id),
          joined_count: 0  // 根部门暂时设为0，展开后会更新
  }))
        this.setData({
          abDeptTree: departments,
          abDeptExpand: {},
          abNavStack: [],
          abNavTitle: '',
          abViewType: 'root',
          abCurrentDeptId: '',
          abCurrentDepartments: [],
          abCurrentUsers: []
        })
      } else {
        this.setData({ abDeptTree: [], abDeptExpand: {}, abViewType: 'root', abNavStack: [], abNavTitle: '' })
      }
    } catch (e) {
      this.setData({ abDeptTree: [], abDeptExpand: {}, abViewType: 'root', abNavStack: [], abNavTitle: '' })
    } finally {
      this.setData({ abLoading: false })
    }
  },

  isActiveClubMember(userId) {
    const m = (this.data.members || []).find((mem) => String(mem.user_id) === String(userId))
    return !!(m && !m.is_deleted)
  },

  abIsExisting(userId) {
    return this.isActiveClubMember(userId)
  },

  abUpdateNavTitle() {
    const stack = this.data.abNavStack || []
    const title = stack.map((d) => d.department_name).filter(Boolean).join(' / ')
    this.setData({ abNavTitle: title })
  },

  async abEnterDept(e) {
    const dept = e?.currentTarget?.dataset?.dept
    if (!dept) return
    const deptId = String(dept.department_id || '')
    if (!deptId) return

    // push stack
    const nextStack = [...(this.data.abNavStack || []), { ...dept, department_id: deptId }]
    this.setData({ abNavStack: nextStack, abCurrentDeptId: deptId }, () => this.abUpdateNavTitle())

    await this.abEnsureDeptExpanded(deptId)
    this.abBuildViewForDept(deptId)
  },

  abNavBack() {
    const stack = [...(this.data.abNavStack || [])]
    if (!stack.length) return
    stack.pop()
    const top = stack[stack.length - 1]
    const deptId = top ? String(top.department_id) : ''
    this.setData(
      {
        abNavStack: stack,
        abCurrentDeptId: deptId,
      },
      () => {
        this.abUpdateNavTitle()
        if (!deptId) {
          this.setData({ abViewType: 'root', abCurrentDepartments: [], abCurrentUsers: [] })
        } else {
          this.abBuildViewForDept(deptId)
        }
      }
    )
  },

  abBuildViewForDept(deptId) {
    const s = (this.data.abDeptExpand || {})[String(deptId)]
    if (!s || !s.loaded) {
      this.setData({ abViewType: 'children', abCurrentDepartments: [], abCurrentUsers: [] })
      return
    }
    if (s.type === 'children') {
      this.setData({ abViewType: 'children', abCurrentDepartments: s.departments || [], abCurrentUsers: [] })
      return
    }
    if (s.type === 'users') {
      this.setData({ abViewType: 'users', abCurrentDepartments: [], abCurrentUsers: s.users || [] })
      return
    }
    this.setData({ abViewType: 'children', abCurrentDepartments: [], abCurrentUsers: [] })
  },

  async abEnsureDeptExpanded(deptId) {
    const key = String(deptId)
    const existing = (this.data.abDeptExpand || {})[key]
    if (existing && existing.loaded) return
    await this.abExpandDepartment(key)
  },

  async abExpandDepartment(deptId) {
    const key = String(deptId)
    const existing = (this.data.abDeptExpand || {})[key]
    if (existing && existing.loaded) return

    this.setData({
      abLoading: true,
      [`abDeptExpand.${key}`]: { loading: true, loaded: false, type: null, departments: [], users: [] }
    })

    try {
      const res = await this.request({ url: `/user/departments/${key}/expand`, method: 'GET' })
      if (res.Flag == 4000 && res.data) {
        if (res.data.type === 'children') {
          // 计算每个子部门已加入协会的人数（需要递归统计，这里先设为0，后续可优化）
    const departments = (res.data.departments || []).map((d) => ({
            ...d,
            department_id: String(d.department_id),
            joined_count: 0  // 暂时设为0，后续可通过后端接口获取
  }))
          this.setData({
            [`abDeptExpand.${key}`]: {
              loading: false,
              loaded: true,
              type: 'children',
              departments,
              users: []
            }
          })
        } else if (res.data.type === 'users') {
          const users = (res.data.users || []).map((u) => {
            const uid = String(u.user_id)
            const isCurrent = String(uid) === String(this.data.currentUserId)
            const existingMember = (this.data.members || []).find((m) => String(m.user_id) === uid)
            return {
              ...u,
              user_id: uid,
              is_current_user: isCurrent,
              is_deleted: !!(existingMember && existingMember.is_deleted),
              isExistingMember: this.abIsExisting(uid) || isCurrent
            }
          })
          // 计算已加入协会的人数
    const joinedCount = users.filter(u => u.isExistingMember).length
          this.setData({
            [`abDeptExpand.${key}`]: {
              loading: false,
              loaded: true,
              type: 'users',
              departments: [],
              users,
              joinedCount
            }
          })
          
          // 更新导航栈中当前部门的 joined_count
    this.updateNavStackJoinedCount(key, joinedCount)
        } else {
          this.setData({
            [`abDeptExpand.${key}`]: { loading: false, loaded: true, type: 'children', departments: [], users: [] }
          })
        }
      } else {
        this.setData({ [`abDeptExpand.${key}.loading`]: false })
      }
    } catch (e) {
      this.setData({ [`abDeptExpand.${key}.loading`]: false })
    } finally {
      this.setData({ abLoading: false })
    }
  },

  abOnUserAction(e) {
    const user = e.currentTarget.dataset.user
    if (!user) return
    const action = String(e.currentTarget.dataset.action || 'add')
    this.onAddressbookUserAction({ detail: { action, user } })
  },

  // 搜索建议 (参考club-manage)
  async onFetchMemberSuggestions(e) {
    const { keyword, callback } = e.detail
    
    if (!keyword || keyword.length < 1) {
      callback([])
      return
    }

    try {
      const res = await this.request({
        url: `/search/user/suggestions?keyword=${encodeURIComponent(keyword)}&limit=8`,
        method: 'GET'
      })

      if (res.code === 200) {
        callback(res.data.suggestions)
      } else {
        callback([])
      }
    } catch (error) {
      callback([])
    }
  },

  // 执行搜索 (参考club-manage)
  async onMemberSearch(e) {
    const keyword = e.detail.value
    await this.performMemberSearch(keyword)
  },

  // 选择搜索建议
  onSelectMemberSuggestion(e) {
    const { value } = e.detail
    this.performMemberSearch(value)
  },

  // 选择历史记录
  onMemberHistorySelect(e) {
    const { value } = e.detail
    this.performMemberSearch(value)
  },

  // 执行搜索的通用方法 (参考club-manage)
  async performMemberSearch(keyword) {
    if (!keyword || !keyword.trim()) {
      Toast({
        context: this,
        selector: '#t-toast',
        message: '请输入搜索关键词',
        theme: 'warning',
      })
      return
    }

    wx.showLoading({ title: '搜索中...' })

    try {
      const res = await this.request({
        url: `/search/user?q=${encodeURIComponent(keyword)}&page=1&per_page=20`,
        method: 'GET'
      })

      if (res.Flag == 4000) {
        const searchResults = res.data.users.map(user => {
          const existingMember = this.data.members.find(member => member.user_id === user.user_id)
          const isCurrentUser = user.user_id === this.data.currentUserId
          const isDeleted = !!(existingMember && existingMember.is_deleted)
          const isActive = this.isActiveClubMember(user.user_id) || isCurrentUser
          return {
            ...user,
            member_id: existingMember ? existingMember.member_id : null,
            role: existingMember ? existingMember.role : (user.role || 'member'),
            role_display: existingMember
              ? existingMember.role_display
              : (user.role_display || user.role_name || user.role || '成员'),
            is_deleted: isDeleted,
            isExistingMember: isActive,
            is_current_user: isCurrentUser
          }
        })
        this.setData({
          searchResults: searchResults
        })
      } else {
        Toast({
          context: this,
          selector: '#t-toast',
          message: '搜索失败',
          theme: 'error',
        })
      }
    } catch (error) {
      Toast({
        context: this,
        selector: '#t-toast',
        message: '搜索失败',
        theme: 'error',
      })
    } finally {
      wx.hideLoading()
    }
  },

  // 搜索用户头像 Expandable Container 展开事件
  onSearchUserExpandableExpand(e) {
    const userId = e.currentTarget.id.replace('search-user-expandable-', '')

    // 获取用户信息
    const targetUser = this.data.searchResults.find(user => user.user_id == userId)

    if (targetUser) {
      const existingMember = this.data.members.find(member => member.user_id === targetUser.user_id)
      const isCurrentUser = targetUser.user_id === this.data.currentUserId

      // 更新搜索结果中的用户信息状态
      const updatedSearchResults = this.data.searchResults.map(user =>
        user.user_id == userId
          ? {
              ...user,
              is_deleted: !!(existingMember && existingMember.is_deleted),
              isExistingMember: this.isActiveClubMember(userId) || isCurrentUser,
            }
          : user
      )

      this.setData({
        searchResults: updatedSearchResults
      })
    }
  },

  // 搜索用户头像 Expandable Container 收起事件
  onSearchUserExpandableCollapse(e) {
    const userId = e.currentTarget.id.replace('search-user-expandable-', '')
  },

  // 用户头像 Expandable Container 展开事件
  onUserExpandableExpand(e) {
    const userId = e.currentTarget.id.replace('user-expandable-', '')
    console.log(`👤 用户头像展开容器打开: ${userId}`)

    // 目前“全部用户”改为页面内通讯录渲染（abVisibleItems），展开头像无需额外同步数据
  },

  // 用户头像 Expandable Container 收起事件
  onUserExpandableCollapse(e) {
    const userId = e.currentTarget.id.replace('user-expandable-', '')
  },

  // 添加用户到协会 (参考club-manage)
  async addUserToClub(e) {
    const userId = e.currentTarget.dataset.id
    
    let userInfo = this.data.searchResults.find(user => user.user_id === userId)
    
    if (!userInfo) userInfo = this.findUserInAddressbook(userId)
    
    if (!userInfo) {
      Toast({
        context: this,
        selector: '#t-toast',
        message: '用户信息不存在',
        theme: 'error',
      })
      return
    }

    await this.directAddUserToClub(userId, userInfo)
  },

  // 直接添加用户到协会 (参考club-manage)
  async directAddUserToClub(userId, userInfo) {
    wx.showLoading({ title: '添加中...' })
    
    try {
      const res = await this.request({
        url: `/club/${this.properties.clubId}/addmember/${userId}`,
        method: 'GET'
      })

      if (res.Flag === '4000') {
        Toast({
          context: this,
          selector: '#t-toast',
          message: `成功添加用户：${userInfo.user_name}`,
          theme: 'success',
        })
        
        // 先更新成员列表，获取最新数据（静默刷新，避免 loading 骨架盖住添加弹窗）
        await this.fetchClubMembers(this.properties.clubId, { silent: true })
        this.updateSearchResultsStatus()
        
        // 动态添加到 isotope，而不是更新整个数组
    const iso = this.selectComponent('#clubMemberIsotope')
        if (iso && iso.addItem) {
          const avatar = 50
          const newItem = {
            id: `club-member-${String(userInfo.user_id)}`,
            image: userInfo.avatar || '/assets/images/default-avatar.png',
            ini_width: avatar,
            ini_height: avatar,
            user_id: String(userInfo.user_id),
            user_name: userInfo.user_name
          }
          // 添加到最前面（新添加的成员）
          iso.addItem(newItem, { index: 0 })
          // 更新 recentAddedUserIds，确保下次打开弹窗时顺序正确
    const recent = [String(userInfo.user_id), ...(this.data.recentAddedUserIds || [])]
          this.setData({ recentAddedUserIds: recent })
        }
        
        // 如果组件未加载，兜底更新整个数组
    if (!iso || !iso.addItem) {
          this.updateMemberIsotope()
        }

        const searchSuggest = this.selectComponent('#memberSearchSuggest')
        if (searchSuggest) {
          searchSuggest.clear()
        }
      } else {
        throw new Error(res.message || '添加失败')
      }
    } catch (error) {
      Toast({
        context: this,
        selector: '#t-toast',
        message: error.message || '添加失败',
        theme: 'error',
      })
    } finally {
      wx.hideLoading()
    }
  },

  // 通讯录组件回调
  async onAddressbookUserAction(e) {
    const { action, user } = e.detail || {}
    if (!user) return
    if (action === 'add') {
      await this.directAddUserToClub(user.user_id, user)
    } else if (action === 'remove') {
      // 复用已有的移除确认弹窗逻辑
      await this.removeMember({
        currentTarget: {
          dataset: {
            userid: user.user_id,
            username: user.user_name
          }
        }
      })
    }
  },


  // 更新搜索结果状态 (参考club-manage)
  updateSearchResultsStatus() {
    if (this.data.searchResults && this.data.searchResults.length > 0) {
      const updatedSearchResults = this.data.searchResults.map(searchUser => {
        const existingMember = this.data.members.find(member => member.user_id === searchUser.user_id)
        const isCurrentUser = searchUser.user_id === this.data.currentUserId

        return {
          ...searchUser,
          member_id: existingMember ? existingMember.member_id : searchUser.member_id,
          role: existingMember ? existingMember.role : (searchUser.role || 'member'),
          role_display: existingMember
            ? existingMember.role_display
            : (searchUser.role_display || searchUser.role_name || searchUser.role || '成员'),
          is_deleted: !!(existingMember && existingMember.is_deleted),
          isExistingMember: this.isActiveClubMember(searchUser.user_id) || isCurrentUser,
          is_current_user: isCurrentUser
        }
      })

      this.setData({
        searchResults: updatedSearchResults
      })
    }
    // 通讯录依赖 existingUserIds，成员变化后需要刷新“已添加”态
    if ((this.data.abDeptTree || []).length) this.abRefreshExistingStatus()
  },

  findUserInAddressbook(userId) {
    const sid = String(userId)
    const expand = this.data.abDeptExpand || {}
    for (const s of Object.values(expand)) {
      if (s && s.type === 'users' && Array.isArray(s.users)) {
        const it = s.users.find((u) => u && String(u.user_id) === sid)
        if (it) return it
      }
    }
    return null
  },

  abRefreshExistingStatus() {
    const expand = this.data.abDeptExpand || {}
    const updates = {}
    let changed = false
    let currentDeptNextUsers = null // 保存当前部门的更新后用户列表
    const currentDeptId = String(this.data.abCurrentDeptId || '')
    
    for (const [deptId, s] of Object.entries(expand)) {
      if (!s || s.type !== 'users' || !Array.isArray(s.users)) continue
      const nextUsers = s.users.map((u) => {
        const uid = String(u.user_id)
        const isCurrent = String(uid) === String(this.data.currentUserId)
        const existingMember = (this.data.members || []).find((m) => String(m.user_id) === uid)
        const nextExisting = this.abIsExisting(uid) || isCurrent
        const nextDeleted = !!(existingMember && existingMember.is_deleted)
        if (
          u.isExistingMember !== nextExisting
          || u.is_current_user !== isCurrent
          || !!u.is_deleted !== nextDeleted
        ) changed = true
        return {
          ...u,
          isExistingMember: nextExisting,
          is_current_user: isCurrent,
          is_deleted: nextDeleted,
        }
      })
      updates[`abDeptExpand.${deptId}.users`] = nextUsers
      
      // 如果是当前显示的部门，保存更新后的用户列表
    if (String(deptId) === currentDeptId) {
        currentDeptNextUsers = nextUsers
      }
    }
    
    // 同时更新 abCurrentUsers，避免 setData 异步导致读取旧数据
    if (this.data.abViewType === 'users' && currentDeptNextUsers) {
      updates.abCurrentUsers = currentDeptNextUsers
    }
    
    if (changed || currentDeptNextUsers) {
      this.setData(updates)
    }
  },

  // 更新导航栈中当前部门的 joined_count（已加入协会的人数）
  updateNavStackJoinedCount(deptId, joinedCount) {
    const stack = this.data.abNavStack || []
    const idx = stack.findIndex(d => String(d.department_id) === String(deptId))
    if (idx >= 0) {
      const newStack = [...stack]
      newStack[idx] = { ...newStack[idx], joined_count: joinedCount }
      this.setData({ abNavStack: newStack })
    }
    
    // 同时更新 abCurrentDepartments 中对应部门的 joined_count
    const currentDepts = this.data.abCurrentDepartments || []
    const deptIdx = currentDepts.findIndex(d => String(d.department_id) === String(deptId))
    if (deptIdx >= 0) {
      const newDepts = [...currentDepts]
      newDepts[deptIdx] = { ...newDepts[deptIdx], joined_count: joinedCount }
      this.setData({ abCurrentDepartments: newDepts })
    }
    
    // 更新根部门列表中的 joined_count
    const rootDepts = this.data.abDeptTree || []
    const rootIdx = rootDepts.findIndex(d => String(d.department_id) === String(deptId))
    if (rootIdx >= 0) {
      const newRootDepts = [...rootDepts]
      newRootDepts[rootIdx] = { ...newRootDepts[rootIdx], joined_count: joinedCount }
      this.setData({ abDeptTree: newRootDepts })
    }
  },

  // 统一请求方法
  request(options) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.request_url + options.url,
        method: options.method || 'GET',
        data: options.data,
        header: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + wx.getStorageSync('token')
        },
        success(res) {
          resolve(res.data)
        },
        fail(err) {
          reject(err)
        }
      })
    })
  },

  // 显示错误提示
  showErrorToast(message) {
    Toast({
      context: this,
      selector: '#t-toast',
      message: message,
      theme: 'error',
    })
  },

  // 添加会员悬浮按钮事件处理
  onAddMemberExpand(e) {
    // 可以在这里添加展开时的逻辑
  },

  onAddMemberCollapse(e) {
    // 不再清空头像墙数据，保持数据以便下次打开时直接显示
    // 如果需要重新触发飞入动画，可以在 onAddMemberSheetExpand 中处理
  },

  // isotope 高度变化事件处理
  onIsoHeightChange(e) {
    const { heightStr } = e.detail
    this.setData({
      memberIsoHeight: heightStr
    })
  },

  onCloseAddMemberSheet() {
    try {
      this.selectComponent('#add-member-sheet')?.collapse?.()
    } catch (e) {
      // ignore
  }
  },

  // 添加会员提交（现在通过用户列表选择，此方法保留用于兼容）
  onAddMemberSubmit() {
    console.log('➕ 添加会员功能已集成到用户列表中')
    wx.showToast({
      title: '请从用户列表中选择要添加的会员',
      icon: 'none',
      duration: 2000
    })
  },

  // 触摸移动事件处理 - 防止滚动事件冒泡
  onTouchMove(e) {
    // 阻止触摸事件冒泡，防止滚动时触发父级组件的滚动
    return false
  },

  // 阻止触摸事件冒泡
  catchTouchMove() {
    // 阻止事件冒泡，确保只有scroll-view内部可以滚动
    return
  },

  // 搜索框区域：拦截触摸，避免被 fullscreen 手势链路接管导致输入框瞬时失焦
  stopSheetGesture() {
    return
  }
  
  } // end of methods
  })
