const app = getApp()

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
    membersList: [],
    peoplePresident: null,
    peoplePending: [],
    peopleMembers: [],
    // 待审批用户详情弹窗
    currentPendingApplication: null,
    pendingApprovalOpinion: '',
    // 当前选中的成员（用于共享弹窗）
    currentMember: null,
    // 搜索结果中待审批用户的审批意见
    searchUserApprovalOpinion: '',
    presidentTab: 'allUsers',
    presidentSearchResults: [],
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
    memberIsoHeight: '150rpx',
    memberAvatarIsoHeight: '150rpx', // 添加成员弹窗内的头像墙高度
    recentAddedUserIds: [],
    // 成员 Isotope 排序相关
    memberSortMode: 'roleFirst', // 'roleFirst' | 'joinDate' | 'name'
    sortOptions: [
      { value: 'roleFirst', label: '会长在前' },
      { value: 'joinDate', label: '入会日期' },
      { value: 'name', label: '姓名字母' }
    ],
    memberIsotopeItems: [], // Isotope 使用的 items 数组
    memberSortBy: ['_sortPriority', 'join_date'], // 当前排序字段
    memberSortAscending: [true, true], // 当前排序方向
    memberLabelStyle: {
      fontSize: '22rpx',
      color: '#333',
      textAlign: 'center'
    },
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
    // isotope 布局就绪状态（用于控制骨架屏）
    memberIsotopeReady: false,
    
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

      this.setData({ loading: true, memberIsotopeReady: false })
      this._earlyLoadedTriggered = false; // Reset flag
      try {
        await Promise.all([
          this.loadClubData(),
          this.fetchMemberList(),
          this.fetchPendingApplications(),
          this.fetchClubActivities()
        ])
        // If early loaded was triggered (for deleted club), skip isotope wait
    if (this._earlyLoadedTriggered) {
          return;
        }
        
        // 更新分享信息
    this.updateShareInfo();
      } catch(e) {
        console.error('[club-manage-panel] reloadAll error:', e)
        // 出错时直接隐藏骨架屏并触发 loaded 事件
    this.setData({ loading: false, memberIsotopeReady: true })
        this.triggerEvent('loaded')
      }
      // 注意：正常情况下，loaded 事件由 isotope 的 layoutReady 事件触发
      // 这样可以确保骨架屏在 isotope 占位完成后才隐藏
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
            this.setData({ loading: false, memberIsotopeReady: true })
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
      const res = await this.request({ url: `/club/application/${this.data.clubId}/list`, method: 'GET' })
      if (res.Flag == 4000 && res.data) {
        const pendingApps = (res.data || []).filter((a) => !a.processedDate)
        this.setData({ pendingApplications: pendingApps }, () => this.updatePeoplePanel())
      }
    },

    async fetchClubActivities() {
      const res = await this.request({ url: `/event/club_public/${this.data.clubId}/list/all?mode=page&page=1`, method: 'GET' })
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
          
          // 1. 从人员管理区域的 isotope 中删除
    const mainIso = this.selectComponent('#clubMemberIsotope')
          if (mainIso && mainIso.removeItem) {
            mainIso.removeItem(itemId)
          }
          
          // 2. 从弹窗内头像墙的 isotope 中删除
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

    goApplications() {
      wx.navigateTo({ url: `/packageClub/club-applications/index?clubId=${this.data.clubId}` })
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
        // 获取点击坐标
    let tapX, tapY;
        if (e.changedTouches && e.changedTouches[0]) {
          tapX = e.changedTouches[0].clientX;
          tapY = e.changedTouches[0].clientY;
        } else if (e.touches && e.touches[0]) {
          tapX = e.touches[0].clientX;
          tapY = e.touches[0].clientY;
        } else {
          const sys = wx.getSystemInfoSync();
          tapX = sys.windowWidth / 2;
          tapY = sys.windowHeight / 2;
        }

        
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

      // 获取点击坐标
    let tapX, tapY;
      if (e.changedTouches && e.changedTouches[0]) {
        tapX = e.changedTouches[0].clientX;
        tapY = e.changedTouches[0].clientY;
      } else if (e.touches && e.touches[0]) {
        tapX = e.touches[0].clientX;
        tapY = e.touches[0].clientY;
      } else {
        const sys = wx.getSystemInfoSync();
        tapX = sys.windowWidth / 2;
        tapY = sys.windowHeight / 2;
      }

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
      const pending = this.data.pendingApplications || []
      const president = members.find((m) => String(m.role) === 'president') || null
      const peoplePresident = president ? {
        user_id: president.user_id, user_name: president.user_name, avatar: president.avatar,
        phone: president.phone, department: president.department, position: president.position,
        role: president.role, role_display: president.role_display, member_id: president.member_id
      } : null
      const peoplePending = pending.map((a) => ({
        applicationID: a.applicationID, user_id: a.appliced_user_id,
        user_name: a.appliced_user_name, avatar: a.appliced_user_avartor,
        phone: a.appliced_user_phone || a.phone,
        department: a.appliced_user_department || a.department,
        position: a.appliced_user_position || a.position
      }))
      const peopleMembers = members.filter((m) => String(m.role) !== 'president').map((m) => ({
        user_id: m.user_id, user_name: m.user_name, avatar: m.avatar, phone: m.phone,
        department: m.department, position: m.position, role: m.role, role_display: m.role_display, member_id: m.member_id
      }))
      this.setData({ peoplePresident, peoplePending, peopleMembers }, () => {
        // 更新 Isotope 成员列表
    this.updateMemberIsotope()
      })
    },

    onPresidentPickerExpand() { this.setData({ presidentTab: 'allUsers', presidentSearchResults: [] }) },
    onPresidentTabChange(e) { this.setData({ presidentTab: e.detail.value }) },

    async onFetchPresidentSuggestions(e) {
      const { keyword, callback } = e.detail
      if (!keyword || keyword.length < 1) { callback([]); return }
      try {
        const res = await this.request({ url: `/search/user/suggestions?keyword=${encodeURIComponent(keyword)}&limit=8`, method: 'GET' })
        callback(res.code === 200 ? res.data.suggestions : [])
      } catch (err) { callback([]) }
    },

    async onPresidentSearch(e) { await this.performPresidentSearch(e.detail?.value) },
    onSelectPresidentSuggestion(e) { this.performPresidentSearch(e.detail?.value) },
    onPresidentHistorySelect(e) { this.performPresidentSearch(e.detail?.value) },

    async performPresidentSearch(keyword) {
      const k = String(keyword || '').trim()
      if (!k) { this.setData({ presidentSearchResults: [] }); return }
      try {
        const res = await this.request({ url: `/search/user?q=${encodeURIComponent(k)}&page=1&per_page=20`, method: 'GET' })
        this.setData({ presidentSearchResults: (res.Flag == 4000 && res.data?.users) ? res.data.users : [] })
      } catch (e) { this.setData({ presidentSearchResults: [] }) }
    },

    async onAddressbookPresidentAction(e) { if (e.detail?.user) await this.setPresident(e.detail.user) },
    async selectPresidentFromSearch(e) { if (e.currentTarget.dataset.user) await this.setPresident(e.currentTarget.dataset.user) },


    async setPresident(user) {
      const userId = user.user_id
      if (!userId) return
      try {
        wx.showLoading({ title: '设置会长中...' })
        let member = (this.data.membersList || []).find((m) => String(m.user_id) === String(userId))
        if (!member) {
          const resAdd = await this.request({ url: `/club/${this.data.clubId}/addmember/${userId}`, method: 'GET' })
          if (!(resAdd.Flag == 4000 || resAdd.Flag == '4000')) throw new Error(resAdd.message || '添加为会员失败')
          await this.fetchMemberList()
          member = (this.data.membersList || []).find((m) => String(m.user_id) === String(userId))
        }
        if (!member || !member.member_id) throw new Error('找不到该会员信息')
        const res = await this.request({ url: `/club/${member.member_id}/change_role/president`, method: 'GET' })
        if (!(res.Flag === '4000' || res.Flag === 4000)) throw new Error(res.message || '设置会长失败')
        wx.showToast({ title: '已设置会长', icon: 'success' })
        await Promise.all([this.loadClubData(), this.fetchMemberList()])
        this.selectComponent('#cm-president-picker-plus')?.collapse?.()
        this.selectComponent('#cm-president-picker-star')?.collapse?.()
      } catch (e) {
        console.error(e)
        wx.showToast({ title: e.message || '设置失败', icon: 'none' })
      } finally { wx.hideLoading() }
    },

    onMemberPickerExpand() {
      this.setData({ addMemberTab: 0, searchResults: [] })
      this.updateMemberIsotope()
      this.abEnsureLoaded()
    },

    onAddMemberCollapse() {
      // 收起时不清空数据，保持状态
  },

    // ===== 头像墙相关 =====
    
    /**
     * 计算成员的排序优先级
     * @param {Object} member - 成员对象
     * @param {Boolean} isPending - 是否为待审批成员
     * @returns {Number} 排序优先级
     */
    getMemberSortPriority(member, isPending = false) {
      if (isPending) return 1.5 // 待审批成员（在副会长和理事之间）
    const role = member.role || 'member'
      const priorityMap = {
        president: 0,
        vice_president: 1,
        director: 2,
        member: 3
      }
      return priorityMap[role] !== undefined ? priorityMap[role] : 3
    },

    /**
     * 构建 Isotope items 数组
     * 将 membersList、peoplePending 转换为 Isotope items
     * 注意：添加按钮现在是独立的触发器，不在 Isotope 中
     */
    buildMemberIsotopeItems() {
      const members = Array.isArray(this.data.membersList) ? this.data.membersList : []
      const pending = Array.isArray(this.data.peoplePending) ? this.data.peoplePending : []
      const avatarSize = 85 

      const items = []

      // 添加正式成员
    for (const m of members) {
        const sortPriority = this.getMemberSortPriority(m, false)
        items.push({
          id: `club-member-${String(m.user_id)}`,
          image: m.avatar || '/assets/images/default-avatar.png',
          ini_width: avatarSize,
          ini_height: avatarSize,
          label: m.user_name || '',
          user_id: String(m.user_id),
          user_name: m.user_name,
          role: m.role,
          role_display: m.role_display,
          member_id: m.member_id,
          phone: m.phone,
          department: m.department,
          position: m.position,
          join_date: m.join_date || '',
          is_current_user: m.is_current_user,
          _sortPriority: sortPriority,
          _isAddButton: false,
          _isPending: false,
          _memberData: m // 保存原始数据用于弹窗
  })
      }

      // 添加待审批成员
    for (const p of pending) {
        items.push({
          id: `club-pending-${String(p.applicationID)}`,
          image: p.avatar || '/assets/images/default-avatar.png',
          ini_width: avatarSize,
          ini_height: avatarSize,
          label: p.user_name || '',
          user_id: String(p.user_id),
          user_name: p.user_name,
          applicationID: p.applicationID,
          phone: p.phone,
          department: p.department,
          position: p.position,
          join_date: '9999-12-31', // 使用未来日期，确保在加入时间模式下排在最前面
          _sortPriority: 1.5, // 待审批优先级（在副会长和理事之间）
          _isAddButton: false,
          _isPending: true,
          _pendingData: p // 保存原始数据用于弹窗
  })
      }

      // 注意：添加按钮现在是独立的触发器，不在 Isotope 中
      return items
    },

    /**
     * 更新成员 Isotope 显示（人员管理区域）
     */
    updateMemberIsotope() {
      const items = this.buildMemberIsotopeItems()
      
      // 检查 isotope 组件是否已经加载且有 items
    const iso = this.selectComponent('#clubMemberIsotope')
      const currentItems = iso && iso.data && iso.data.itemsWithPosition || []
      
      // 如果组件已经加载且有 items，且新 items 只是数量变化（可能是动态操作），
      // 就不更新，避免触发 onItemsChange 导致全部重新初始化
    if (currentItems.length > 0 && items.length > 0) {
        const currentIds = new Set(currentItems.map(i => String(i.id || '')))
        const newIds = new Set(items.map(i => String(i.id)))
        
        // 如果只是新增一个或删除一个，就不更新，让动态接口处理
    const diff = Math.abs(items.length - currentItems.length)
        if (diff <= 1) {
          const allCurrentInNew = Array.from(currentIds).every(id => newIds.has(id))
          const allNewInCurrent = Array.from(newIds).every(id => currentIds.has(id))
          
          if (allCurrentInNew || allNewInCurrent) {
            // 同时更新添加成员弹窗内的头像墙
    this.updateMemberAvatarIsotope()
            return
          }
        }
      }

      this.setData({ memberIsotopeItems: items }, () => {
        // 同时更新添加成员弹窗内的头像墙
    this.updateMemberAvatarIsotope()
      })
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

    /**
     * 根据当前排序模式计算插入位置
     * @param {Object} newItem - 新成员 item
     * @returns {Number} 插入位置索引
     */
    calculateInsertIndex(newItem) {
      const { memberSortMode, memberIsotopeItems } = this.data
      
      // 如果没有现有 items，插入到开头
    if (!memberIsotopeItems || memberIsotopeItems.length === 0) {
        return 0
      }
      
      switch (memberSortMode) {
        case 'roleFirst':
          // 按角色优先级 + 加入日期排序
          // 第一优先级：_sortPriority（升序）
          // 第二优先级：join_date（升序）
    const roleIndex = memberIsotopeItems.findIndex(item => {
            // 先比较角色优先级
    if (item._sortPriority !== newItem._sortPriority) {
              return item._sortPriority > newItem._sortPriority
            }
            // 角色相同，比较加入日期
    const itemDate = item.join_date || ''
            const newDate = newItem.join_date || ''
            // 如果新成员没有日期，排在最后
    if (!newDate) return false
            // 如果现有成员没有日期，新成员排在它前面
    if (!itemDate) return true
            // 都有日期，比较大小（升序：早的在前）
            return itemDate > newDate
          })
          return roleIndex === -1 ? memberIsotopeItems.length : roleIndex
          
        case 'joinDate':
          // 按加入日期排序
          // 需要检查当前的排序方向（第二个字段 join_date 的方向）
    const isAscending = this.data.memberSortAscending?.[1] !== false
          
          const dateIndex = memberIsotopeItems.findIndex(item => {
            const itemDate = item.join_date || ''
            const newDate = newItem.join_date || ''
            
            // 如果新成员没有日期，排在最后
    if (!newDate) return false
            // 如果现有成员没有日期，新成员排在它前面
    if (!itemDate) return true
            
            // 根据排序方向比较
    if (isAscending) {
              // 升序：找到第一个比新成员晚的位置
              return itemDate > newDate
            } else {
              // 降序：找到第一个比新成员早的位置
              return itemDate < newDate
            }
          })
          return dateIndex === -1 ? memberIsotopeItems.length : dateIndex
          
        case 'name':
          // 按姓名字母排序
    const nameIndex = memberIsotopeItems.findIndex(item => {
            const itemName = (item.user_name || '').toLowerCase()
            const newName = (newItem.user_name || '').toLowerCase()
            return itemName > newName
          })
          return nameIndex === -1 ? memberIsotopeItems.length : nameIndex
          
        default:
          return 0
      }
    },

    /**
     * 动态添加成员到 isotope（带动画）
     * @param {Object} member - 成员对象
     */
    addMemberToIsotope(member) {
      const avatarSize = 85
      
      // 构建新 item
    const newItem = {
        id: `club-member-${String(member.user_id)}`,
        image: member.avatar || '/assets/images/default-avatar.png',
        ini_width: avatarSize,
        ini_height: avatarSize,
        label: member.user_name || '',
        user_id: String(member.user_id),
        user_name: member.user_name,
        role: member.role || 'member',
        role_display: member.role_display || '会员',
        phone: member.phone,
        department: member.department,
        position: member.position,
        join_date: member.join_date || new Date().toISOString().split('T')[0],
        _sortPriority: this.getMemberSortPriority(member, false),
        _isAddButton: false,
        _isPending: false,
        _memberData: member
      }
      
      // 计算正确的插入位置（根据当前排序模式）
    const insertIndex = this.calculateInsertIndex(newItem)
      
      // 添加到人员管理区域的 isotope
    const mainIso = this.selectComponent('#clubMemberIsotope')
      if (mainIso && mainIso.addItem) {
        mainIso.addItem(newItem, { index: insertIndex })
      }
      
      // 添加到弹窗内头像墙的 isotope（始终插入到开头）
    const avatarIso = this.selectComponent('#memberAvatarIsotope')
      if (avatarIso && avatarIso.addItem) {
        const avatarItem = {
          id: `club-member-${String(member.user_id)}`,
          image: member.avatar || '/assets/images/default-avatar.png',
          ini_width: 50,
          ini_height: 50,
          user_id: String(member.user_id),
          user_name: member.user_name
        }
        avatarIso.addItem(avatarItem, { index: 0 })
        
        // 更新 recentAddedUserIds
    const recent = [String(member.user_id), ...(this.data.recentAddedUserIds || [])]
        this.setData({ recentAddedUserIds: recent })
      }
    },

    /**
     * 成员排序模式切换
     */
    onMemberSortChange(e) {
      const mode = e.currentTarget.dataset.mode || e.detail?.value
      if (!mode || mode === this.data.memberSortMode) return
      
      let sortBy, sortAscending
      
      switch (mode) {
        case 'roleFirst':
          sortBy = ['_sortPriority', 'join_date']
          sortAscending = [true, true]
          break
        case 'joinDate':
          sortBy = ['_isAddButton', 'join_date']
          sortAscending = [true, false] // join_date 降序：新入会的在前面
          break
        case 'name':
          sortBy = ['_isAddButton', 'user_name']
          sortAscending = [true, true]
          break
        default:
          sortBy = ['_sortPriority', 'join_date']
          sortAscending = [true, true]
      }
      
      this.setData({
        memberSortMode: mode,
        memberSortBy: sortBy,
        memberSortAscending: sortAscending
      }, () => {
        // 调用 isotope 的 sort 方法
    const iso = this.selectComponent('#clubMemberIsotope')
        if (iso && iso.sort) {
          iso.sort(sortBy, sortAscending)
        }
      })
    },

    /**
     * 成员 Isotope item 点击事件
     */
    onMemberItemTap(e) {
      const { item, tapX, tapY } = e.detail
      if (!item) return
      
      if (item._isPending) {
        // 点击待审批成员：显示审批弹窗
    this.showPendingApprovalPopup(item, tapX, tapY)
      } else {
        // 点击普通成员：显示成员详情弹窗
    this.showMemberDetailPopup(item, tapX, tapY)
      }
    },

    /**
     * 显示添加成员弹窗
     */
    showAddMemberPopup() {
      const popup = this.selectComponent('#cm-member-picker')
      if (popup && popup.expand) {
        // 获取屏幕中心坐标作为涟漪起点
    const sys = wx.getSystemInfoSync()
        const tapX = sys.windowWidth / 2
        const tapY = sys.windowHeight / 2
        popup.expand(tapX, tapY)
      }
    },

    /**
     * 显示待审批成员弹窗
     */
    showPendingApprovalPopup(item, tapX, tapY) {
      // 设置当前待审批用户数据
    this.setData({
        currentPendingApplication: item._pendingData || item,
        pendingApprovalOpinion: ''
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
        this.setData({ currentPendingApplication: null, pendingApprovalOpinion: '' })
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
      // 先收起弹窗
    const popup = this.selectComponent('#cm-shared-pending-detail')
      if (popup && popup.collapse) {
        popup.collapse()
      }
      // 调用原有的批准逻辑
      await this.approveApplication(e)
    },

    /**
     * 从共享弹窗中拒绝申请
     */
    async rejectApplicationFromSharedPopup(e) {
      const applicationId = e.currentTarget.dataset.applicationid
      // 先收起弹窗
    const popup = this.selectComponent('#cm-shared-pending-detail')
      if (popup && popup.collapse) {
        popup.collapse()
      }
      // 调用原有的拒绝逻辑
      await this.rejectApplication(e)
    },

    onIsoHeightChange(e) {
      const { heightStr } = e.detail
      this.setData({ memberIsoHeight: heightStr })
    },
    
    /**
     * isotope 布局就绪事件处理
     * 当 isotope 完成占位布局后触发，此时可以隐藏骨架屏
     */
    onMemberIsotopeReady(e) {

      this.setData({ loading: false, memberIsotopeReady: true })
      // 触发 loaded 事件，通知外部（home 页面）隐藏骨架屏
    this.triggerEvent('loaded')
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
            
            // 动态添加到 isotope（会自动计算正确位置）
    this.addMemberToIsotope(member)
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

    collapsePopup(e) {
      const id = e.currentTarget.dataset.id
      const comp = this.selectComponent(`#${id}`)
      if (comp && comp.collapse) comp.collapse()
    },

    // ===== 待审批用户相关方法 =====
    
    // 待审批用户弹窗展开
  onPendingApplicationExpand(e) {
      const application = e.currentTarget.dataset.application
      if (application) {
        this.setData({
          currentPendingApplication: application,
          pendingApprovalOpinion: ''
        })
      }
    },

    // 审批意见变更
  onApprovalOpinionChange(e) {
      this.setData({ pendingApprovalOpinion: e.detail?.value ?? e.detail })
    },

    onSearchUserApprovalOpinionChange(e) {
      this.setData({ searchUserApprovalOpinion: e.detail?.value ?? e.detail })
    },

    // 批准申请（带审批意见）
    async approveApplication(e) {
      const applicationId = e.currentTarget.dataset.applicationid
      if (!applicationId) return
      await this.processApplication(applicationId, 'approved', this.data.pendingApprovalOpinion)
    },

    // 拒绝申请（带审批意见）
    async rejectApplication(e) {
      const applicationId = e.currentTarget.dataset.applicationid
      if (!applicationId) return
      await this.processApplication(applicationId, 'rejected', this.data.pendingApprovalOpinion)
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
      
      // 先获取待审批用户信息，用于后续操作
    const pendingApp = (this.data.pendingApplications || []).find(a => String(a.applicationID) === String(applicationId))
      const pendingUserId = pendingApp ? String(pendingApp.appliced_user_id) : null
      
      try {
        const res = await this.request({
          url: `/club/application/${applicationId}/processed/${operation}`,
          method: 'POST',
          data: { opinion: opinion || '' }
        })
        if (res.Flag === '4000' || res.Flag === 4000) {
          wx.showToast({ title: operation === 'approved' ? '已批准' : '已拒绝', icon: 'success' })
          
          // 如果是拒绝，从 isotope 中删除待审批 item
    if (operation === 'rejected') {
            const pendingItemId = `club-pending-${applicationId}`
            
            const mainIso = this.selectComponent('#clubMemberIsotope')
            if (mainIso && mainIso.removeItem) {
              mainIso.removeItem(pendingItemId)
            }
            
            const avatarIso = this.selectComponent('#memberAvatarIsotope')
            if (avatarIso && avatarIso.removeItem) {
              avatarIso.removeItem(pendingItemId)
            }
          }
          
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
          this.setData({ currentPendingApplication: null, pendingApprovalOpinion: '', searchUserApprovalOpinion: '' })
          
          // 重新获取数据
          await Promise.all([this.fetchPendingApplications(), this.fetchMemberList()])
          
          // 重新构建 isotope items（会更新待审批成员的属性）
    this.updatePeoplePanel()
          
          // 如果是批准，触发排序动画（让批准的成员移动到新位置）
    if (operation === 'approved') {
            setTimeout(() => {
              const iso = this.selectComponent('#clubMemberIsotope')
              if (iso && iso.sort) {
                iso.sort(this.data.memberSortBy, this.data.memberSortAscending)
              }
            }, 100)
          }
          
          // 刷新搜索结果和通讯录状态
    this.refreshSearchResultsPendingStatus()
          this.abRefreshExistingStatus()
        } else {
          wx.showToast({ title: res.message || '操作失败', icon: 'none' })
        }
      } catch (error) {
        wx.showToast({ title: '网络错误，请重试', icon: 'none' })
        .error('处理申请失败:', error)
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
