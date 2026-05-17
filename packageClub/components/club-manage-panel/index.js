const app = getApp()

/**
 * 从原生 tap 或 ripple 的 triggerEvent('tap', { x, y, changedTouches }) 解析点击坐标。
 * 仅用 bindtap 接 ripple 时 e.changedTouches 往往为空，坐标在 e.detail。
 */
function resolveTapClientXY(e) {
  const d = e.detail || {}
  const fromDetail = d.changedTouches && d.changedTouches[0]
  if (fromDetail) {
    return { tapX: fromDetail.clientX, tapY: fromDetail.clientY }
  }
  if (typeof d.x === 'number' && typeof d.y === 'number') {
    return { tapX: d.x, tapY: d.y }
  }
  if (e.changedTouches && e.changedTouches[0]) {
    const t = e.changedTouches[0]
    return { tapX: t.clientX, tapY: t.clientY }
  }
  if (e.touches && e.touches[0]) {
    const t = e.touches[0]
    return { tapX: t.clientX, tapY: t.clientY }
  }
  const sys = wx.getSystemInfoSync()
  return { tapX: sys.windowWidth / 2, tapY: sys.windowHeight / 2 }
}

Component({
  properties: {
    clubId: {
      type: String,
      value: ''
    }
  },

  data: {
    loading: true,
    clubDetail: null,
    defaultCover: '/assets/images/president/activity-default.png',
    defaultAvatarUrl: '',
    pendingApplications: [],
    /** 入会审批九宫格：最近待处理申请，最多 9 格 */
    pendingGridCells: [],
    membersList: [],
    /** 人员管理九宫格：会长→副会长→理事→最近入会，最多 8 人 */
    peopleShowcase: [],
    peopleGridCells: [],
    // 待审批用户详情弹窗
    currentPendingApplication: null,
    pendingPopupApproveOpinion: '',
    pendingPopupRejectReason: '',
    // 当前选中的成员（用于共享弹窗）
    currentMember: null,
    // 搜索结果中待审批用户的审批意见
    searchUserApprovalOpinion: '',
    isPresident: false,
    clubActivities: [],
    featuredActivity: null,
    editInfo: { description: '', charter: '' },
    addMemberTab: 0,
    searchResults: [],
    existingUserIds: [],
    currentUserId: '',
    abDeptTree: [],
    abDeptExpand: {},
    abNavStack: [],
    abNavTitle: '',
    abViewType: 'root',
    abCurrentDeptId: '',
    abCurrentDepartments: [],
    abCurrentUsers: [],
    abLoading: false,
    abThemeColor: '#ff6b9d',
    memberAvatarItems: [],
    memberAvatarIsoHeight: '150rpx', // 添加成员弹窗内的头像墙高度
    recentAddedUserIds: [],
    // 成员管理弹窗内部滚动位置（用于“到顶继续下拉才收回”）
    cmMemberPickerInnerScrollTop: 0,
    memberImageStyle: { borderRadius: '50%' },
    roleDisplayMap: {
      all: '全部',
      member: '会员',
      director: '理事',
      vice_president: '副会长',
      president: '会长'
    },
    uploadAPI: '',
    isUploading: false,

    // 嵌套的event-create弹窗状态
    nestedEventCreate: {
      loading: true,
      renderPanel: false,
      tapX: 0,
      tapY: 0
    },
    
    // 嵌套的event-manage弹窗状态
    nestedEventManage: {
      visible: false,
      loading: true,
      renderPanel: false,
      eventId: '',
      tapX: 0,
      tapY: 0
    }
  },

  lifetimes: {
    attached() {

      const userId = wx.getStorageSync('userId')
      this.setData({
        uploadAPI: app.globalData.request_url + '/file/upload_file',
        defaultAvatarUrl: app.globalData.static_url + '/assets/default_avatar.webp',
        currentUserId: userId
      })
      this._loaded = false
      this._hasExpanded = false
    }
  },

  observers: {
    'clubId': function(clubId) {

      if (!clubId || clubId.startsWith('placeholder')) {
        this._lastClubId = null
        this._loaded = false
        this.setData({ loading: false, clubDetail: null })
        return
      }
      // 只记录 clubId，不自动加载数据（懒加载）
    if (clubId !== this._lastClubId) {
        this._lastClubId = clubId
        this._loaded = false
        // 如果已经展开过，则重新加载
    if (this._hasExpanded) {
          this.reloadAll()
        }
      }
    }
  },

  methods: {
    onCmMemberPickerInnerScroll(e) {
      const top = Number(e?.detail?.scrollTop || 0)
      if (top !== this.data.cmMemberPickerInnerScrollTop) {
        this.setData({ cmMemberPickerInnerScrollTop: top })
      }
    },
    request({ url, method = 'GET', data }) {
      return new Promise((resolve, reject) => {
        wx.request({
          url: app.globalData.request_url + url,
          method,
          data,
          header: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + wx.getStorageSync('token')
          },
          success: (res) => resolve(res.data),
          fail: reject
        })
      })
    },

    // 懒加载入口：供外部调用，只有弹窗展开时才加载数据
  loadData() {

      this._hasExpanded = true
      if (this._loaded) return Promise.resolve()
      if (!this.data.clubId || this.data.clubId.startsWith('placeholder')) {
        return Promise.resolve()
      }
      
      // 先设置基本的分享信息（clubId），详细信息在 reloadAll 完成后更新
    const app = getApp();
      app.globalData.shareInfo = {
        type: 'club',
        id: this.data.clubId,
        title: '点击查看协会详情',
        imageUrl: ''
      };

      
      this._loaded = true
      return this.reloadAll()
    },

    async reloadAll() {

      this.setData({ loading: true })
      this._earlyLoadedTriggered = false; // Reset flag
      try {
        await Promise.all([
          this.loadClubData(),
          this.fetchMemberList(),
          this.fetchPendingApplications(),
          this.fetchClubActivities()
        ])
        if (this._earlyLoadedTriggered) {
          return;
        }

        this.updateShareInfo()
        this.setData({ loading: false })
        this.triggerEvent('loaded')
      } catch(e) {
        console.error('[club-manage-panel] reloadAll error:', e)
        this.setData({ loading: false })
        this.triggerEvent('loaded')
      }
    },

    // 更新分享信息到 app.globalData
  updateShareInfo() {
      const { clubDetail, membersList } = this.data;
      if (!clubDetail) return;
      
      const app = getApp();
      

      
      // 获取成员姓名（最多显示前10个）
    const memberNames = (membersList || [])
        .slice(0, 10)
        .map(m => m.user_name)
        .join('、');
      
  
      const title = `${clubDetail.name}\n${clubDetail.description}\n\n当前人员：${memberNames}${(membersList || []).length > 10 ? '等' : ''}`;
      
      app.globalData.shareInfo = {
        type: 'club',
        id: this.data.clubId,
        title: title,
        imageUrl: clubDetail.cover_url || ''
      };
      

    },

    async loadClubData() {
  
      const res = await this.request({ url: `/club/${this.data.clubId}`, method: 'GET' })

      if (res.Flag == 4000 || res.Flag == '4000') {
        const clubDetail = res.data
        // 映射删除状态字段 - 后端返回is_deleted，组件期望isDelete
        clubDetail.isDelete = clubDetail.is_deleted || false;
        this.setData({
          clubDetail: { ...clubDetail, president_name: clubDetail.president_username },
          isPresident: !!clubDetail.cur_user_is_president,
          // 同时设置club字段供遮罩层使用
          club: clubDetail
        }, () => {
          this.updatePeoplePanel()
          // 如果协会已删除，立即隐藏骨架屏并触发loaded事件
          // 因为遮罩层会阻止用户交互，不需要等待isotope布局完成
    if (clubDetail.isDelete) {
            this.setData({ loading: false })
            this.triggerEvent('loaded')
            this._earlyLoadedTriggered = true; // Set flag to prevent duplicate events
  }
        })
      } else {
        this.setData({ clubDetail: null, club: null })
      }
    },

    async fetchMemberList() {

      const res = await this.request({ url: `/club/${this.data.clubId}/members`, method: 'GET' })
      if (res.Flag == 4000 && res.data && res.data.members) {
        const members = res.data.members || []

        this.setData({ membersList: members, existingUserIds: members.map((m) => String(m.user_id)) }, () => {
  
          this.updatePeoplePanel()
        })
      }
    },

    async fetchPendingApplications() {
      try {
        const res = await this.request({ url: `/club/application/${this.data.clubId}/pending/list`, method: 'GET' })
        if (res.Flag == 4000 && res.data) {
          const pendingApps = Array.isArray(res.data) ? res.data : []
          this.setData({ pendingApplications: pendingApps }, () => {
            this.rebuildPendingApplicationsGrid()
            this.refreshSearchResultsPendingStatus()
          })
        } else {
          this.setData({ pendingApplications: [] }, () => this.rebuildPendingApplicationsGrid())
        }
      } catch (e) {
        console.error('fetchPendingApplications', e)
        this.setData({ pendingApplications: [] }, () => this.rebuildPendingApplicationsGrid())
      }
    },

    rebuildPendingApplicationsGrid() {
      const raw = (this.data.pendingApplications || []).filter((a) => !a.processedDate)
      raw.sort((a, b) => {
        const ta = new Date(a.applicatedDate || 0).getTime()
        const tb = new Date(b.applicatedDate || 0).getTime()
        return tb - ta
      })
      const top = raw.slice(0, 9)
      const defAv = this.data.defaultAvatarUrl || '/assets/images/default-avatar.png'
      const cells = []
      for (let i = 0; i < 9; i++) {
        const a = top[i]
        if (a) {
          cells.push({
            slot: i,
            type: 'pending',
            applicationID: a.applicationID,
            displayName: a.appliced_user_name || '未知',
            displayAvatar: a.appliced_user_avartor || defAv
          })
        } else {
          cells.push({ slot: i, type: 'empty' })
        }
      }
      this.setData({ pendingGridCells: cells })
    },

    normalizePendingApplicationForDetail(src) {
      if (!src) return null
      const defAv = this.data.defaultAvatarUrl || '/assets/images/default-avatar.png'
      if (src.appliced_user_name != null || src.appliced_user_id != null) {
        return {
          applicationID: src.applicationID,
          user_id: src.appliced_user_id,
          user_name: src.appliced_user_name || '未知',
          avatar: src.appliced_user_avartor || defAv,
          phone: src.appliced_user_phone || '',
          department: src.appliced_user_department || '',
          position: src.appliced_user_position || ''
        }
      }
      return {
        applicationID: src.applicationID,
        user_id: src.user_id,
        user_name: src.user_name,
        avatar: src.avatar || defAv,
        phone: src.phone || '',
        department: src.department || '',
        position: src.position || ''
      }
    },

    async fetchClubActivities() {
      // list/going：未结束且未取消（预计开始 + 进行中），不含已结束/已取消
      const res = await this.request({ url: `/event/club_public/${this.data.clubId}/list/going?mode=page&page=1`, method: 'GET' })
      if (res.Flag == 4000 && res.data && res.data.records) {
        const activities = res.data.records
        this.setData({ clubActivities: activities, featuredActivity: activities.length > 0 ? activities[0] : null })
      }
    },

    onBasicExpand() {
      this.setData({ 'editInfo.description': this.data.clubDetail?.description || '' })
    },

    onCharterExpand() {
      this.setData({ 'editInfo.charter': this.data.clubDetail?.charter || '' })
    },

    onEditDescriptionChange(e) {
      this.setData({ 'editInfo.description': e.detail?.value ?? e.detail })
    },

    onEditCharterChange(e) {
      this.setData({ 'editInfo.charter': e.detail?.value ?? e.detail })
    },


    async saveDescription() {
      const description = String(this.data.editInfo.description || '').trim()
      if (!description) { wx.showToast({ title: '请输入协会简介', icon: 'none' }); return }
      const res = await this.request({ url: `/club/${this.data.clubId}/description/upload`, method: 'POST', data: { description } })
      if (res.Flag == 4000) {
        wx.showToast({ title: '已保存', icon: 'success' })
        this.setData({ 'clubDetail.description': description })
        this.selectComponent('#row-basic')?.collapse?.()
        
        // 记录变更到本地缓存（自动触发 triggerEvent）
        app.recordChange(this.data.clubId, 'update', {
          type: 'club',
          club_id: this.data.clubId,
          description: description
        }, this);
      } else {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' })
      }
    },

    async saveCharter() {
      const charter = String(this.data.editInfo.charter || '').trim()
      if (!charter) { wx.showToast({ title: '请输入协会章程', icon: 'none' }); return }
      const hash = this.calculateSimpleHash(charter)
      const res = await this.request({ url: `/club/${this.data.clubId}/charter/upload`, method: 'POST', data: { charter, charter_hash: hash } })
      if (res.Flag == 4000) {
        wx.showToast({ title: '已保存', icon: 'success' })
        this.setData({ 'clubDetail.charter': charter })
        this.selectComponent('#row-charter')?.collapse?.()
      } else {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' })
      }
    },

    calculateSimpleHash(str) {
      let hash = 0
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i)
        hash = hash & hash
      }
      return Math.abs(hash).toString(16)
    },

    async uploadImage(filePath, fileType = 'club_img') {
      return new Promise((resolve, reject) => {
        wx.uploadFile({
          url: this.data.uploadAPI, filePath, name: 'file', formData: { fileType },
          header: { Authorization: 'Bearer ' + wx.getStorageSync('token') },
          success: (res) => {
            try {
              const data = JSON.parse(res.data)
              if (data.Flag === 4000) resolve(data.data)
              else reject(new Error(data.Message || '上传失败'))
            } catch (e) { reject(new Error('解析响应失败')) }
          },
          fail: reject
        })
      })
    },

    async updateClubCover(fileId) {
      return this.request({ url: `/club/${this.data.clubId}/update_cover`, method: 'POST', data: { file_id: fileId } })
    },

    onCoverClick() {
      wx.chooseImage({
        count: 1, sizeType: ['original', 'compressed'], sourceType: ['album', 'camera'],
        success: async (res) => {
          const filePath = res.tempFilePaths?.[0]
          if (filePath) await this.uploadCoverImage(filePath)
        }
      })
    },

    async uploadCoverImage(filePath) {
      this.setData({ isUploading: true })
      try {
        const result = await this.uploadImage(filePath, 'club_img')
        const updateResult = await this.updateClubCover(result.file_id)
        const newCoverUrl = updateResult?.data?.new_cover_url
        if (newCoverUrl) this.setData({ 'clubDetail.cover_url': newCoverUrl })
        wx.showToast({ title: '封面更新成功', icon: 'success' })
        
        // 记录变更到本地缓存（自动触发 triggerEvent）
        app.recordChange(this.data.clubId, 'update', {
          type: 'club',
          club_id: this.data.clubId,
          cover_url: newCoverUrl
        }, this);
      } catch (e) {
        console.error(e)
        wx.showToast({ title: e.message || '上传失败', icon: 'none' })
      } finally {
        this.setData({ isUploading: false })
      }
    },

    async removeMember(e) {
      const userId = e.currentTarget.dataset.userid
      if (!userId) return
      const member = (this.data.membersList || []).find((m) => String(m.user_id) === String(userId))
      const name = member?.user_name || ''
      const ok = await wx.showModal({ title: '确认移除', content: `确定要移除会员"${name}"吗？`, confirmText: '移除', confirmColor: '#ee0a24' })
      if (!ok.confirm) return
      try {
        wx.showLoading({ title: '处理中...' })
        const res = await this.request({ url: `/club/${this.data.clubId}/deletemember/${userId}`, method: 'GET' })
        if (res.Flag === '4000') {
          wx.showToast({ title: '移除成功', icon: 'success' })
          
          const itemId = `club-member-${String(userId)}`

          const avatarIso = this.selectComponent('#memberAvatarIsotope')
          if (avatarIso && avatarIso.removeItem) {
            avatarIso.removeItem(itemId)
          }

          // 从 recentAddedUserIds 中移除
    const recent = (this.data.recentAddedUserIds || []).filter(id => String(id) !== String(userId))
          this.setData({ recentAddedUserIds: recent })
          
          await this.fetchMemberList()
          // 刷新通讯录状态
    this.abRefreshExistingStatus()
        } else {
          wx.showToast({ title: res.message || '移除失败', icon: 'none' })
        }
      } finally { wx.hideLoading() }
    },

    /**
     * 删除协会
     */
    async deleteClub() {
      const clubName = this.data.clubDetail?.club_name || '';
      const ok = await wx.showModal({
        title: '删除协会',
        content: `确认删除协会"${clubName}"？删除后将无法恢复，所有未结束的活动将被取消。`,
        confirmText: '确认删除',
        confirmColor: '#ff4d4f',
        cancelText: '取消'
      });
      
      if (!ok.confirm) return;
      
      try {
        wx.showLoading({ title: '删除中...' });
        const res = await this.request({
          url: `/club/${this.data.clubId}/delete`,
          method: 'GET'
        });
        
        if (res.Flag === '4000' || res.Flag === 4000) {
          wx.hideLoading();
          wx.showToast({
            title: '协会已删除',
            icon: 'success',
            duration: 2000
          });
          
          // 记录删除变更（自动触发 triggerEvent）
          app.recordChange(this.data.clubId, 'delete', {
            type: 'club'
          }, this);
          
          // 延迟关闭面板
          setTimeout(() => {
            this.triggerEvent('close');
          }, 2000);
        } else {
          wx.hideLoading();
          wx.showToast({
            title: res.message || '删除失败',
            icon: 'none'
          });
        }
      } catch (error) {
        wx.hideLoading();
        console.error('删除协会失败:', error);
        wx.showToast({
          title: '删除失败',
          icon: 'none'
        });
      }
    },

    onActivityItemTap(e) {
      const eventId = e.currentTarget.dataset.id
      if (eventId) {
        const { tapX, tapY } = resolveTapClientXY(e)

        
        // 设置嵌套弹窗状态
    this.setData({
          nestedEventManage: {
            visible: true,
            loading: true,
            renderPanel: false,
            eventId: eventId,
            tapX,
            tapY
          }
        }, () => {

          setTimeout(() => {
            const popup = this.selectComponent('#nestedEventManagePopup');
            if (popup && popup.expand) {
              popup.expand(tapX, tapY);
            } else {
              console.error('找不到 nestedEventManagePopup 组件');
            }
          }, 50);
        });
      }
    },

    onCreateActivityTap(e) {
      const { tapX, tapY } = resolveTapClientXY(e)

      // 重置状态并展开弹窗
    this.setData({
        nestedEventCreate: {
          loading: true,
          renderPanel: false,
          tapX,
          tapY
        }
      }, () => {

        // 展开弹窗
    const popup = this.selectComponent('#nestedEventCreatePopup');

        if (popup && popup.expand) {
          popup.expand(tapX, tapY);
        }
      });
    },

    // 嵌套弹窗内容准备完成（动画完成后触发）
  onNestedEventCreateContentReady() {

      // 弹窗动画完成，现在可以渲染 panel 了
      // event-create-panel会在attached时自动调用initializeComponent，不需要手动调用loadData
    this.setData({
        'nestedEventCreate.renderPanel': true
      }, () => {

      });
    },

    // event-create-panel加载完成
  onNestedEventCreateLoaded() {

      this.setData({
        'nestedEventCreate.loading': false
      });
    },

    // 关闭嵌套的event-create弹窗
  closeNestedEventCreate() {
      const popup = this.selectComponent('#nestedEventCreatePopup');
      if (popup && popup.collapse) {
        popup.collapse();
      }
    },

    // 嵌套弹窗收起回调
  onNestedEventCreateCollapse() {
      // 收起时不做任何操作，等待collapsed事件
  },

    // 嵌套弹窗收起完成后的回调（由expandable-container触发）
  onNestedEventCreateCollapsed() {
      // 延迟清理状态，确保动画完成
      setTimeout(() => {
        this.setData({
          'nestedEventCreate.loading': true,
          'nestedEventCreate.renderPanel': false
        });
      }, 300);
    },

    // event-create成功后的回调
  onNestedEventCreateSuccess(e) {

      // 关闭嵌套弹窗
    this.closeNestedEventCreate();
      // 刷新活动列表
    this.fetchClubActivities();
      // 显示成功提示
      wx.showToast({
        title: '活动创建成功',
        icon: 'success'
      });
    },

    // event-create错误回调
  onNestedEventCreateError(e) {
      console.error('活动创建失败:', e.detail);
    },

    // ========= 嵌套 Event Manage 弹窗相关 =========
    
    // 嵌套弹窗内容准备完成（动画完成后触发）
  onNestedEventManageContentReady() {

      // 弹窗动画完成，现在可以渲染 panel 了
    this.setData({
        'nestedEventManage.renderPanel': true
      }, () => {
        // 等待 panel 渲染后，调用 loadData
        setTimeout(() => {
          const panel = this.selectComponent('#nestedEventManagePanel');
          if (panel && panel.loadData) {
            panel.loadData();
          }
        }, 100);
      });
    },

    // event-manage-panel加载完成
  onNestedEventManageLoaded() {

      this.setData({
        'nestedEventManage.loading': false
      });
    },

    // 关闭嵌套的event-manage弹窗
  closeNestedEventManage() {
      const popup = this.selectComponent('#nestedEventManagePopup');
      if (popup && popup.collapse) {
        popup.collapse();
      }
    },

    // 嵌套弹窗收起回调
  onNestedEventManageCollapse() {
      // 收起时不做任何操作，等待collapsed事件
  },

    // 嵌套弹窗收起完成后的回调（由expandable-container触发）
  onNestedEventManageCollapsed() {
      // 延迟清理状态，确保动画完成
      setTimeout(() => {
        this.setData({
          'nestedEventManage.visible': false,
          'nestedEventManage.loading': true,
          'nestedEventManage.renderPanel': false,
          'nestedEventManage.eventId': ''
        });
      }, 300);
    },

    // event-manage更新后的回调
  onNestedEventManageUpdate(e) {

      // 刷新活动列表
    this.fetchClubActivities();
    },


    updatePeoplePanel() {
      const members = this.data.membersList || []
      const peopleShowcase = this.buildPeopleShowcase(members)
      const peopleGridCells = this.rebuildPeopleGridCells(peopleShowcase)
      this.setData({ peopleShowcase, peopleGridCells }, () => this.updateMemberAvatarIsotope())
    },

    _memberJoinTimeMs(m) {
      const raw = m.join_date || m.joinDate || ''
      if (!raw) return 0
      const t = Date.parse(raw)
      return Number.isFinite(t) ? t : 0
    },

    normalizeShowcaseMember(m) {
      const cur = this.data.currentUserId
      const isCurrent = !!m.is_current_user || String(m.user_id) === String(cur)
      return {
        user_id: m.user_id,
        user_name: m.user_name,
        avatar: m.avatar,
        phone: m.phone,
        department: m.department,
        position: m.position,
        role: m.role,
        role_display: m.role_display,
        member_id: m.member_id,
        join_date: m.join_date,
        is_current_user: isCurrent
      }
    },

    buildPeopleShowcase(members) {
      const list = Array.isArray(members) ? members : []
      const president = list.filter((x) => x.role === 'president')
      const vice = list.filter((x) => x.role === 'vice_president')
      const dir = list.filter((x) => x.role === 'director')
      const plain = list
        .filter((x) => !['president', 'vice_president', 'director'].includes(x.role))
        .sort((a, b) => this._memberJoinTimeMs(b) - this._memberJoinTimeMs(a))
      const ordered = [...president, ...vice, ...dir, ...plain]
      const out = []
      const seen = new Set()
      for (const m of ordered) {
        const id = String(m.user_id)
        if (seen.has(id)) continue
        seen.add(id)
        out.push(this.normalizeShowcaseMember(m))
        if (out.length >= 8) break
      }
      return out
    },

    rebuildPeopleGridCells(showcase) {
      const s = Array.isArray(showcase) ? showcase : []
      const cells = []
      for (let i = 0; i < 8; i++) {
        const m = s[i]
        cells.push({ slot: i, type: m ? 'member' : 'empty', member: m || null })
      }
      cells.push({ slot: 8, type: 'add' })
      return cells
    },

    onPeopleGridCellTap(e) {
      const type = e.currentTarget.dataset.type
      if (type === 'add') {
        const { tapX, tapY } = resolveTapClientXY(e)
        this.showAddMemberPopup(tapX, tapY)
        return
      }
      if (type !== 'member') return
      const slot = Number(e.currentTarget.dataset.slot)
      const cell = (this.data.peopleGridCells || []).find((c) => c.slot === slot)
      const m = cell && cell.member
      if (!m) return
      const { tapX, tapY } = resolveTapClientXY(e)
      this.showMemberDetailPopup({ _memberData: m }, tapX, tapY)
    },

    onPendingGridCellTap(e) {
      const type = e.currentTarget.dataset.type
      if (type !== 'pending') return
      const slot = Number(e.currentTarget.dataset.slot)
      const cell = (this.data.pendingGridCells || []).find((c) => c.slot === slot)
      if (!cell || !cell.applicationID) return
      const raw = (this.data.pendingApplications || []).find(
        (a) => String(a.applicationID) === String(cell.applicationID)
      )
      if (!raw) {
        wx.showToast({ title: '申请已更新', icon: 'none' })
        this.fetchPendingApplications()
        return
      }
      const detail = this.normalizePendingApplicationForDetail(raw)
      const { tapX, tapY } = resolveTapClientXY(e)
      this.setData(
        {
          currentPendingApplication: detail,
          pendingPopupApproveOpinion: '',
          pendingPopupRejectReason: ''
        },
        () => {
          setTimeout(() => {
            const popup = this.selectComponent('#cm-shared-pending-detail')
            if (popup && popup.expand) popup.expand(tapX, tapY)
          }, 50)
        }
      )
    },

    onMemberPickerExpand() {
      this.triggerEvent('host-fullscreen-back', { show: false })
      this.setData({ addMemberTab: 0, searchResults: [] })
      this.updateMemberAvatarIsotope()
      this.abEnsureLoaded()
    },

    onAddMemberCollapse() {
      this.triggerEvent('host-fullscreen-back', { show: true })
      // 收起时不清空数据，保持状态
    },

    /**
     * 更新添加成员弹窗内的头像墙
     */
    updateMemberAvatarIsotope() {
      const members = Array.isArray(this.data.membersList) ? this.data.membersList : []
      const avatar = 50 // 弹窗内头像尺寸

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

      // 检查 isotope 组件是否已经加载且有 items
    const iso = this.selectComponent('#memberAvatarIsotope')
      const currentItems = iso && iso.data && iso.data.itemsWithPosition || []
      
      // 如果组件已经加载且有 items，且新 items 只是数量变化（可能是动态操作），
      // 就不更新 memberAvatarItems，避免触发 onItemsChange 导致全部重新初始化
    if (currentItems.length > 0 && items.length > 0) {
        const currentIds = new Set(currentItems.map(i => String(i.id || '')))
        const newIds = new Set(items.map(i => String(i.id)))
        
        // 如果只是新增一个或删除一个，就不更新，让动态接口处理
    const diff = Math.abs(items.length - currentItems.length)
        if (diff <= 1) {
          const allCurrentInNew = Array.from(currentIds).every(id => newIds.has(id))
          const allNewInCurrent = Array.from(newIds).every(id => currentIds.has(id))
          
          if (allCurrentInNew || allNewInCurrent) {
            return
          }
        }
      }

      this.setData({ memberAvatarItems: items })
    },

    /** 添加成员弹窗内头像墙：新成员插到最前 */
    pushMemberAvatarWall(member) {
      const avatarIso = this.selectComponent('#memberAvatarIsotope')
      if (avatarIso && avatarIso.addItem) {
        avatarIso.addItem({
          id: `club-member-${String(member.user_id)}`,
          image: member.avatar || '/assets/images/default-avatar.png',
          ini_width: 50,
          ini_height: 50,
          user_id: String(member.user_id),
          user_name: member.user_name
        }, { index: 0 })
        const recent = [String(member.user_id), ...(this.data.recentAddedUserIds || [])]
        this.setData({ recentAddedUserIds: recent })
      }
    },

    /**
     * 显示添加成员弹窗（与 events-panel 打开 event-manage 一致：从点击处 ripple 展开）
     * @param {number} [tapX] 屏幕坐标 clientX
     * @param {number} [tapY] 屏幕坐标 clientY
     */
    showAddMemberPopup(tapX, tapY) {
      let x = tapX
      let y = tapY
      if (typeof x !== 'number' || typeof y !== 'number') {
        const sys = wx.getSystemInfoSync()
        x = sys.windowWidth / 2
        y = sys.windowHeight / 2
      }
      setTimeout(() => {
        const popup = this.selectComponent('#cm-member-picker')
        if (popup && popup.expand) {
          popup.expand(x, y)
        }
      }, 50)
    },

    /**
     * 显示待审批成员弹窗
     */
    showPendingApprovalPopup(item, tapX, tapY) {
      const raw = item._pendingData || item
      const detail = this.normalizePendingApplicationForDetail(raw)
      this.setData({
        currentPendingApplication: detail,
        pendingPopupApproveOpinion: '',
        pendingPopupRejectReason: ''
      }, () => {
        // 使用共享弹窗
        setTimeout(() => {
          const popup = this.selectComponent('#cm-shared-pending-detail')
          if (popup && popup.expand) {
            popup.expand(tapX, tapY)
          }
        }, 50)
      })
    },

    /**
     * 显示成员详情弹窗
     */
    showMemberDetailPopup(item, tapX, tapY) {
      // 从 item 中提取成员数据
    const memberData = item._memberData || {
        user_id: item.user_id,
        user_name: item.user_name,
        avatar: item.image,
        phone: item.phone,
        department: item.department,
        position: item.position,
        role: item.role,
        role_display: item.role_display,
        member_id: item.member_id,
        is_current_user: item.is_current_user
      }

      
      // 设置当前成员数据
    this.setData({
        currentMember: memberData
      }, () => {
        // 使用共享弹窗
        setTimeout(() => {
          const popup = this.selectComponent('#cm-shared-member-detail')
          if (popup && popup.expand) {
            popup.expand(tapX, tapY)
          }
        }, 50)
      })
    },

    /**
     * 共享成员弹窗收起时清空数据
     * 延迟清空以等待收回动画完成
     */
    onSharedMemberPopupCollapse() {
      // 延迟清空数据，等待收回动画完成（动画时长约 200ms + 涟漪动画 + 缓冲）
      setTimeout(() => {
        this.setData({ currentMember: null })
      }, 600)
    },

    /**
     * 共享待审批弹窗收起时清空数据
     * 延迟清空以等待收回动画完成
     */
    onSharedPendingPopupCollapse() {
      // 延迟清空数据，等待收回动画完成（动画时长约 200ms + 涟漪动画 + 缓冲）
      setTimeout(() => {
        this.setData({
          currentPendingApplication: null,
          pendingPopupApproveOpinion: '',
          pendingPopupRejectReason: ''
        })
      }, 600)
    },

    /**
     * 从共享弹窗中移除成员
     */
    async removeMemberFromSharedPopup(e) {
      const userId = e.currentTarget.dataset.userid
      // 先收起弹窗
    const popup = this.selectComponent('#cm-shared-member-detail')
      if (popup && popup.collapse) {
        popup.collapse()
      }
      // 调用原有的移除逻辑
      await this.removeMember(e)
    },

    /**
     * 从共享弹窗中批准申请
     */
    async approveApplicationFromSharedPopup(e) {
      const applicationId = e.currentTarget.dataset.applicationid
      if (!applicationId) return
      const opinion = String(this.data.pendingPopupApproveOpinion || '').trim()
      await this.processApplication(applicationId, 'approved', opinion)
    },

    /**
     * 从共享弹窗中拒绝申请
     */
    async rejectApplicationFromSharedPopup(e) {
      const applicationId = e.currentTarget.dataset.applicationid
      if (!applicationId) return
      const reason = String(this.data.pendingPopupRejectReason || '').trim()
      if (!reason) {
        wx.showToast({ title: '请填写拒绝理由', icon: 'none' })
        return
      }
      await this.processApplication(applicationId, 'rejected', reason)
    },

    onPendingPopupApproveOpinionChange(e) {
      this.setData({ pendingPopupApproveOpinion: e.detail?.value ?? e.detail ?? '' })
    },

    onPendingPopupRejectReasonChange(e) {
      this.setData({ pendingPopupRejectReason: e.detail?.value ?? e.detail ?? '' })
    },

    onMemberAvatarIsoHeightChange(e) {
      const { heightStr } = e.detail
      this.setData({ memberAvatarIsoHeight: heightStr })
    },
    
    onAddMemberTabChange(e) {
      const nextRaw = e && e.detail ? e.detail.value : undefined
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

    async onFetchMemberSuggestions(e) {
      const { keyword, callback } = e.detail
      if (!keyword || keyword.length < 1) { callback([]); return }
      try {
        const res = await this.request({ url: `/search/user/suggestions?keyword=${encodeURIComponent(keyword)}&limit=8`, method: 'GET' })
        callback(res.code === 200 ? res.data.suggestions : [])
      } catch (e) { callback([]) }
    },

    async onMemberSearch(e) { await this.performMemberSearch(e.detail?.value) },
    onSelectMemberSuggestion(e) { this.performMemberSearch(e.detail?.value) },
    onMemberHistorySelect(e) { this.performMemberSearch(e.detail?.value) },


    async performMemberSearch(keyword) {
      const k = String(keyword || '').trim()
      if (!k) { this.setData({ searchResults: [] }); return }
      try {
        const res = await this.request({ url: `/search/user?q=${encodeURIComponent(k)}&page=1&per_page=20`, method: 'GET' })
        if (res.Flag == 4000 && res.data?.users) {
          const results = res.data.users.map((u) => {
            const existingMember = (this.data.membersList || []).find((m) => String(m.user_id) === String(u.user_id))
            const pendingApp = this.getPendingApplication(u.user_id)
            const isPending = !!pendingApp
            const isCurrent = String(u.user_id) === String(this.data.currentUserId)
            return {
              ...u,
              isExistingMember: !!existingMember || isCurrent,
              is_current_user: isCurrent,
              member_id: existingMember?.member_id || null,
              role: existingMember ? existingMember.role : null,
              role_display: existingMember ? existingMember.role_display : null,
              isPending,
              applicationID: pendingApp ? pendingApp.applicationID : null
            }
          })
          this.setData({ searchResults: results })
        } else { this.setData({ searchResults: [] }) }
      } catch (e) { this.setData({ searchResults: [] }) }
    },

    async addUserToClub(e) {
      const userId = e.currentTarget.dataset.id
      if (!userId) return
      try {
        wx.showLoading({ title: '添加中...' })
        const userInfo =
          this.data.searchResults.find((u) => String(u.user_id) === String(userId)) ||
          this.findUserInExpandUsers(userId) ||
          this.findUserInAbUsers(userId)
        const res = await this.request({ url: `/club/${this.data.clubId}/addmember/${userId}`, method: 'GET' })
        if (res.Flag == 4000 || res.Flag == '4000') {
          wx.showToast({ title: '已添加', icon: 'success' })
          
          // 立即更新 existingUserIds，确保 UI 状态正确
    const sid = String(userId)
          const newExistingUserIds = [...(this.data.existingUserIds || []), sid]
          this.setData({ existingUserIds: newExistingUserIds })
          
          // 立即更新搜索结果和通讯录状态（不等待 fetchMemberList）
    this.markUserExisting(userId)
          
          // 使用动态添加（带计算位置）
    if (userInfo) {
            // 构建成员对象
    const member = {
              user_id: userId,
              user_name: userInfo.user_name,
              avatar: userInfo.avatar,
              phone: userInfo.phone,
              department: userInfo.department,
              position: userInfo.position,
              role: 'member',
              role_display: '会员',
              join_date: new Date().toISOString().split('T')[0]
            }
            
            // 动态更新添加成员弹窗内头像墙
            this.pushMemberAvatarWall(member)
          }
          
          // 异步更新成员列表（不阻塞动画和 UI 状态更新）
    this.fetchMemberList()
        } else { wx.showToast({ title: res.message || '添加失败', icon: 'none' }) }
      } catch (err) { wx.showToast({ title: err?.message || '添加失败', icon: 'none' }) }
      finally { wx.hideLoading() }
    },

    // 在通讯录用户列表中查找用户
  findUserInAbUsers(userId) {
      const sid = String(userId)
      const users = this.data.abCurrentUsers || []
      return users.find((u) => String(u.user_id) === sid)
    },

    findUserInExpandUsers(userId) {
      const sid = String(userId)
      const deptExpand = this.data.deptExpand || {}
      for (const s of Object.values(deptExpand)) {
        const u = (s?.users || []).find((x) => String(x.user_id) === sid)
        if (u) return u
      }
      return null
    },

    markUserExisting(userId) {
      const sid = String(userId)
      const updates = {}
      
      // 更新搜索结果
    if (Array.isArray(this.data.searchResults) && this.data.searchResults.length) {
        updates.searchResults = this.data.searchResults.map((u) => 
          (String(u.user_id) === sid ? { ...u, isExistingMember: true } : u)
        )
      }
      
      // 更新 abDeptExpand 中的用户状态
    const abDeptExpand = this.data.abDeptExpand || {}
      for (const [deptId, s] of Object.entries(abDeptExpand)) {
        if (!s || !Array.isArray(s.users) || !s.users.length) continue
        if (s.users.some((u) => String(u.user_id) === sid && !u.isExistingMember)) {
          updates[`abDeptExpand.${deptId}.users`] = s.users.map((u) => 
            (String(u.user_id) === sid ? { ...u, isExistingMember: true } : u)
          )
        }
      }
      
      // 更新 abCurrentUsers（当前显示的用户列表）
    if (Array.isArray(this.data.abCurrentUsers) && this.data.abCurrentUsers.length) {
        const hasUser = this.data.abCurrentUsers.some((u) => String(u.user_id) === sid)
        if (hasUser) {
          updates.abCurrentUsers = this.data.abCurrentUsers.map((u) => 
            (String(u.user_id) === sid ? { ...u, isExistingMember: true } : u)
          )
        }
      }
      
      // 批量更新
    if (Object.keys(updates).length > 0) {
        this.setData(updates)
      }
    },

    async onAddressbookUserAction(e) {
      const { action, user } = e.detail || {}
      if (!user) return
      if (action === 'add') await this.addUserToClub({ currentTarget: { dataset: { id: user.user_id } } })
      else if (action === 'remove') await this.removeMember({ currentTarget: { dataset: { userid: user.user_id } } })
    },

    // ===== 通讯录导航（对齐 club-members） =====
    async abEnsureLoaded() {
      if (Number(this.data.addMemberTab) !== 1) return
      if ((this.data.abDeptTree || []).length) return
      await this.abFetchAllDepartments()
    },

    async abFetchAllDepartments() {
      try {
        this.setData({ abLoading: true })
        const res = await this.request({ url: `/user/departments`, method: 'GET' })
        if (res.Flag == 4000 && res.data && Array.isArray(res.data.departments)) {
          console.log(res)
          const departments = (res.data.departments || []).map((d) => ({
            ...d,
            department_id: String(d.department_id),
            joined_count: 0
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

    abIsExisting(userId) {
      const arr = this.data.existingUserIds || []
      return arr.some((x) => String(x) === String(userId))
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
            const departments = (res.data.departments || []).map((d) => ({
              ...d,
              department_id: String(d.department_id),
              joined_count: 0
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
              const pendingApp = this.getPendingApplication(uid)
              const isPending = !!pendingApp
              return {
                ...u,
                user_id: uid,
                is_current_user: isCurrent,
                isExistingMember: this.abIsExisting(uid) || isCurrent,
                isPending,
                applicationID: pendingApp ? pendingApp.applicationID : null
              }
            })
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

    abRefreshExistingStatus() {
      const expand = this.data.abDeptExpand || {}
      const updates = {}
      let changed = false
      let currentDeptNextUsers = null
      const currentDeptId = String(this.data.abCurrentDeptId || '')
      
      for (const [deptId, s] of Object.entries(expand)) {
        if (!s || s.type !== 'users' || !Array.isArray(s.users)) continue
        const nextUsers = s.users.map((u) => {
          const uid = String(u.user_id)
          const isCurrent = String(uid) === String(this.data.currentUserId)
          const existingMember = (this.data.membersList || []).find((m) => String(m.user_id) === uid)
          const nextExisting = !!existingMember || isCurrent
          const pendingApp = this.getPendingApplication(uid)
          const nextIsPending = !!pendingApp
          const nextApplicationID = pendingApp ? pendingApp.applicationID : null
          if (u.isExistingMember !== nextExisting || u.is_current_user !== isCurrent || u.isPending !== nextIsPending) changed = true
          return {
            ...u,
            isExistingMember: nextExisting,
            is_current_user: isCurrent,
            isPending: nextIsPending,
            applicationID: nextApplicationID,
            member_id: existingMember ? existingMember.member_id : null,
            role: existingMember ? existingMember.role : null,
            role_display: existingMember ? existingMember.role_display : null
          }
        })
        updates[`abDeptExpand.${deptId}.users`] = nextUsers
        
        if (String(deptId) === currentDeptId) {
          currentDeptNextUsers = nextUsers
        }
      }
      
      if (this.data.abViewType === 'users' && currentDeptNextUsers) {
        updates.abCurrentUsers = currentDeptNextUsers
      }
      
      if (changed || currentDeptNextUsers) {
        this.setData(updates)
      }
    },

    catchTouchMove() {
      return
    },

    // ===== 待审批用户相关方法 =====
    onSearchUserApprovalOpinionChange(e) {
      this.setData({ searchUserApprovalOpinion: e.detail?.value ?? e.detail })
    },

    // 快速拒绝（在添加成员弹窗中，审批意见为空）
    async quickRejectApplication(e) {
      const applicationId = e.currentTarget.dataset.applicationid
      if (!applicationId) return
      await this.processApplication(applicationId, 'rejected', '')
    },

    // 快速批准（在添加成员弹窗中）
    async quickApproveApplication(e) {
      const applicationId = e.currentTarget.dataset.applicationid
      if (!applicationId) return
      await this.processApplication(applicationId, 'approved', '')
    },

    // 搜索结果中批准申请（带审批意见）
    async approveSearchUserApplication(e) {
      const applicationId = e.currentTarget.dataset.applicationid
      if (!applicationId) return
      await this.processApplication(applicationId, 'approved', this.data.searchUserApprovalOpinion)
      this.setData({ searchUserApprovalOpinion: '' })
    },

    // 搜索结果中拒绝申请（带审批意见）
    async rejectSearchUserApplication(e) {
      const applicationId = e.currentTarget.dataset.applicationid
      if (!applicationId) return
      await this.processApplication(applicationId, 'rejected', this.data.searchUserApprovalOpinion)
      this.setData({ searchUserApprovalOpinion: '' })
    },

    // 处理申请
    async processApplication(applicationId, operation, opinion) {
      wx.showLoading({ title: '处理中...' })

      try {
        const res = await this.request({
          url: `/club/application/${applicationId}/processed/${operation}`,
          method: 'POST',
          data: { opinion: opinion || '' }
        })
        if (res.Flag === '4000' || res.Flag === 4000) {
          wx.showToast({ title: operation === 'approved' ? '已批准' : '已拒绝', icon: 'success' })

          // 发送通知消息
    if (res.data) {
            const message_data = {
              booker_id: res.data.appliced_user_id,
              url: operation === 'approved' 
                ? `/packageClub/club-joined/index?clubId=${res.data.club_id}`
                : `/packageClub/club-detail/index?clubId=${res.data.club_id}`,
              operation: 'application_processed',
              text: operation === 'approved'
                ? `您加入${res.data.club_name}协会的申请已被批准，现在您可以参与协会活动了`
                : `您加入${res.data.club_name}协会的申请被拒绝${opinion ? '，理由：' + opinion : ''}`,
              media: res.data.club_cover ? app.convertToThumbnailUrl(res.data.club_cover, 300) : undefined
            }
            try {
              await app.message(message_data)
            } catch (e) {
              // ignore message error
  }
          }

          // 关闭弹窗
    const currentPendingApp = this.data.currentPendingApplication
          if (currentPendingApp) {
            this.selectComponent(`#cm-shared-pending-detail`)?.collapse?.()
          }
          this.setData({
            currentPendingApplication: null,
            pendingPopupApproveOpinion: '',
            pendingPopupRejectReason: '',
            searchUserApprovalOpinion: ''
          })
          
          // 重新获取数据
          await Promise.all([this.fetchPendingApplications(), this.fetchMemberList()])

          this.updatePeoplePanel()

          // 刷新搜索结果和通讯录状态
    this.refreshSearchResultsPendingStatus()
          this.abRefreshExistingStatus()
        } else {
          wx.showToast({ title: res.message || '操作失败', icon: 'none' })
        }
      } catch (error) {
        wx.showToast({ title: '网络错误，请重试', icon: 'none' })
        console.error('处理申请失败:', error)
      } finally {
        wx.hideLoading()
      }
    },

    // 检查用户是否为待审批状态
  isPendingUser(userId) {
      const sid = String(userId)
      return (this.data.pendingApplications || []).some(a => String(a.appliced_user_id) === sid)
    },

    // 获取用户的待审批申请
  getPendingApplication(userId) {
      const sid = String(userId)
      return (this.data.pendingApplications || []).find(a => String(a.appliced_user_id) === sid)
    },

    // 刷新搜索结果中的待审批状态
  refreshSearchResultsPendingStatus() {
      if (!Array.isArray(this.data.searchResults) || !this.data.searchResults.length) return
      const updatedResults = this.data.searchResults.map((u) => {
        const existingMember = (this.data.membersList || []).find((m) => String(m.user_id) === String(u.user_id))
        const pendingApp = this.getPendingApplication(u.user_id)
        const isCurrent = String(u.user_id) === String(this.data.currentUserId)
        return {
          ...u,
          isExistingMember: !!existingMember || isCurrent,
          is_current_user: isCurrent,
          member_id: existingMember ? existingMember.member_id : null,
          role: existingMember ? existingMember.role : null,
          role_display: existingMember ? existingMember.role_display : null,
          isPending: !!pendingApp,
          applicationID: pendingApp ? pendingApp.applicationID : null
        }
      })
      this.setData({ searchResults: updatedResults })
    },

    // 角色变更
    async changeRole(e) {
      const { memberid, newrole, username } = e.currentTarget.dataset
      if (!memberid || !newrole) return
      const roleDisplayName = this.data.roleDisplayMap?.[newrole] || newrole
      const result = await wx.showModal({
        title: '确认角色变更',
        content: `确定要将 ${username} 的角色改为 ${roleDisplayName} 吗？`,
        confirmText: '确认变更',
        cancelText: '取消'
      })
      if (!result.confirm) return

      try {
        wx.showLoading({ title: '处理中...' })
        const res = await this.request({ url: `/club/${memberid}/change_role/${newrole}`, method: 'GET' })
        if (res.Flag === '4000' || res.Flag === 4000) {
          wx.showToast({ title: '角色变更成功', icon: 'success' })
          
          // 刷新成员列表（从服务器获取最新数据），并强制更新Isotope
          await this.fetchMemberList(true)
          
          // 更新当前弹窗中的成员数据
    if (this.data.currentMember && this.data.currentMember.member_id === memberid) {
            this.setData({
              'currentMember.role': newrole,
              'currentMember.role_display': roleDisplayName
            })
          }
          
          // 刷新搜索结果和通讯录状态
    this.refreshSearchResultsPendingStatus()
          this.abRefreshExistingStatus()
        } else {
          wx.showToast({ title: res.message || '角色变更失败', icon: 'none' })
        }
      } finally {
        wx.hideLoading()
      }
    },

  }
})
