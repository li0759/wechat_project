const app = getApp();

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatTimeDisplay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16).replace('T', ' ');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function toPickerValue(iso) {
  return formatTimeDisplay(iso);
}

function pickerValueToIso(v) {
  if (!v) return null;
  const s = String(v).trim().replace('T', ' ');
    if (s.length < 16) return null;
  return `${s.slice(0, 10)}T${s.slice(11, 16)}:00`;
}

Component({
  properties: {
    eventId: {
      type: String,
      value: ''
    }
  },

  data: {
    uploadAPI: '',
    defaultCover: '/assets/images/president/activity-default.png',
    defaultAvatarUrl: '',
    loading: true,
    suppressReloadOnce: false,
    event: null,
    members: [],
    clubMembers: [],
    selectedMemberIds: [],
    locationMarkers: [],
    locationMapSmallUrl: '',
    locationMapLargeUrl: '',
    membersClockinCount: 0,

    timeEdit: { preStart: '', preEnd: '' },
    timeEditRaw: { preStartParts: null, preEndParts: null, preStartPick: null, preEndPick: null },
    minStartTime: '', // 预计开始时间的最小值（当前时间数
      minEndTime: '', // 预计结束时间的最小值（等于预计开始时间）
    showPreStartPicker: false,
    showPreEndPicker: false,
    
    // 成员 Isotope 相关
    memberIsotopeItems: [],      // Isotope 使用的成员数数
      memberIsoHeight: '300rpx',   // Isotope 容器高度
    currentMember: null,         // 当前选中的成员（用于共享弹窗数
      // 快速操作按钮配置映数
      quickActionConfig: {
      'joined': {
        icon: 'remove',      // 减号图标
        className: 'minus',  // 红色样式
        color: '#fff',
        size: 18
      },
      'not_joined': {
        icon: 'add',         // 加号图标
        className: 'plus',   // 绿色样式
        color: '#fff',
        size: 18
      }
    },
    
    // 样式配置
    memberImageStyle: {
      borderRadius: '50%',
      border: '2rpx solid #fff',
      boxShadow: '0 2rpx 8rpx rgba(0,0,0,0.1)'
    },
    memberLabelStyle: {
      fontSize: '22rpx',
      color: '#333',
      textAlign: 'center'
    },
    
    // 成员排序相关
    memberSortMode: 'roleFirst', // 'roleFirst' | 'joinDate' | 'name'
    memberSortBy: ['_sortPriority', 'join_date'],  // 排序字段
    memberSortAscending: [true, true],             // 排序方向
    sortOptions: [
      { value: 'roleFirst', label: '会长在前' },
      { value: 'joinDate', label: '参加时间' },
      { value: 'name', label: '姓名字母' }
    ],
    
    scheduleId: null,
    scheduleStartTime: '',
    scheduleEnabled: false,
    scheduleForm: {
      schedule_type: 'weekly',
      weekdays: [0],
      month_days: [1],
      activity_time: '09:00',
      advance_hours_slider: 1
    },
    timeOfDayValue: '09:00',
    tempWeekdays: [],
    tempMonthdays: [],
    tempWeekdaysMap: {},
    tempMonthdaysMap: {},
    advanceHourLabels: ['不提', '提前1小时', '提前2小时', '提前3小时', '提前6小时', '提前12小时', '提前1', '提前2小时'],
    tempScheduleDisplay: '',

    costEdit: { budget: '', realCost: '' },
    editInfo: { title: '', content: '' },
    coverUploadFiles: [],
    editLocation: { location: '', location_data: null },
    addMemberTab: 'search',
    deptTree: [],
    deptExpand: {},
    searchResults: [],
    isLoading: false,

    momentsPage: 1,
    momentsTotalPages: 1,
    momentsRaw: [],
    publishers: [],
    momentsCount: 0,
    latestMoment: { firstImage: '', text: '', user_name: '' },

    feedFilter: { publisherId: '', publisherName: '' },
    feed: [],
    momentOpsVisible: false,
    currentActionMomentId: null,
    addMomentForm: { description: '', uploadFiles: [], isUploading: false },
    
    // 分享相关
    generatingShareLink: false
  },

  lifetimes: {
    attached() {
      this.setData({ 
        uploadAPI: app.globalData.request_url + '/file/upload_file',
        defaultAvatarUrl: app.globalData.static_url + '/assets/default_avatar.webp'
      });
      this._loaded = false;
      this._hasExpanded = false;
    }
  },

  observers: {
    'eventId': function(eventId) {
      // 如果 eventId 没有真正变化，不要重新加数
      // 同时检查是否是占位置ID，占位符不应该触摸API 请求
    const isPlaceholder = !eventId || eventId.startsWith('placeholder');
      if (isPlaceholder) {
        this._lastEventId = null;
        this._loaded = false;
        this.setData({ loading: false, event: null });
        return;
      }
      // 只记?eventId，不自动加载数据（懒加载数
      if (eventId !== this._lastEventId) {
        this._lastEventId = eventId;
        this._loaded = false;
        // 如果已经展开过，则重新加数
      if (this._hasExpanded) {
          this.reloadAll();
        }
      }
    }
  },

  methods: {
    // 懒加载入口：供外部调用，只有弹窗展开时才加载数据
  loadData() {
      this._hasExpanded = true;
      if (this._loaded) return Promise.resolve();
      if (!this.data.eventId || this.data.eventId.startsWith('placeholder')) {
        return Promise.resolve();
      }
      
      // 先设置基本的分享信息（eventId），详细信息?reloadAll 完成后更数
      app.globalData.shareInfo = {
        type: 'event',
        id: this.data.eventId,
        title: '点击查看活动详情',
        imageUrl: ''
      };      
      this._loaded = true;
      return this.reloadAll();
    },

    // 通用请求
  request({ url, method = 'GET', data, loadingText }) {
      if (loadingText) wx.showLoading({ title: loadingText });
      return new Promise((resolve, reject) => {
        wx.request({
          url: app.globalData.request_url + url,
          method,
          data,
          header: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + wx.getStorageSync('token'),
          },
          success: (res) => {
            if (loadingText) wx.hideLoading();
            resolve(res.data);
          },
          fail: (err) => {
            if (loadingText) wx.hideLoading();
            reject(err);
          },
        });
      });
    },

    async reloadAll() {
      this.setData({ loading: true });
      this._earlyLoadedTriggered = false; // Reset flag
      try {
        const event = await this.loadEventDetail(this.data.eventId);
        // If early loaded was triggered (for cancelled/deleted), skip the rest
    if (this._earlyLoadedTriggered) {
          return;
        }
        await Promise.all([
          this.loadEventMembers(this.data.eventId),
          this.loadClubMembers(event.club_info.club_id),
        ]);
        await this.loadMoments(1);
        this.prepareIsotopeMembers();
        this.setData({ loading: false });
        
        // 设置分享信息
    this.updateShareInfo();
        
        this.triggerEvent('loaded');
      } catch (e) {        this.setData({ loading: false, event: null });
        this.triggerEvent('loaded');
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    },

    // 更新分享信息?app.globalData
  updateShareInfo() {
      const { event, members } = this.data;
      if (!event) return;      
      // 获取参加人员姓名（最多显示前10个）
    const memberNames = (members || [])
        .slice(0, 10)
        .map(m => m.user_name)
        .join('');      
      const title = `${event.title}\n${event.content}\n\n${memberNames}${(members || []).length > 10 ? '?' : ''}`;
      
      app.globalData.shareInfo = {
        type: 'event',
        id: this.data.eventId,
        title: title,
        imageUrl: event.cover_url || ''
      };    
    },

    async loadEventDetail(eventId) {
      const res = await this.request({ url: `/event/${eventId}`, method: 'GET' });
      if (res.Flag == 4000) {
        const event = res.data || {};
        event.pre_startTime_display = formatTimeDisplay(event.pre_startTime);
        event.pre_endTime_display = formatTimeDisplay(event.pre_endTime);
        event.actual_startTime_display = formatTimeDisplay(event.actual_startTime);
        event.actual_endTime_display = formatTimeDisplay(event.actual_endTime);

        const locationMarkers = [];
        let locationMapUrl = '';
        if (event.location_data && event.location_data.latitude && event.location_data.longitude) {
          locationMarkers.push({
            id: 1,
            latitude: event.location_data.latitude,
            longitude: event.location_data.longitude,
            iconPath: '/assets/images/location-marker.png',
            width: 30,
            height: 30,
          });
          // 使用后端返回?premap_url，如果没有则不显示（不在前端拼接数
      locationMapUrl = event.premap_url || '';
        }

        const scheduleId = event?.schedule_info?.schedule_id ? Number(event.schedule_info.schedule_id) : null;
        this.setData({
          event,
          locationMarkers,
          locationMapUrl,
          timeEdit: {
            preStart: toPickerValue(event.pre_startTime),
            preEnd: toPickerValue(event.pre_endTime),
          },
          editInfo: { title: event.title || '', content: event.content || '' },
          editLocation: { location: event.location || '', location_data: event.location_data || null, premap_url: event.premap_url || '' },
          costEdit: {
            budget: event.budget === null || event.budget === undefined ? '' : String(event.budget),
            realCost: event.real_cost === null || event.real_cost === undefined ? '' : String(event.real_cost),
          },
          scheduleId,
          scheduleEnabled: !!scheduleId,
          scheduleStartTime: event.pre_startTime ? String(event.pre_startTime) : '',
        }, () => {
          // 如果活动已取消或协会已删除，立即隐藏骨架屏并触发loaded事件
          // 因为遮罩层会阻止用户交互，不需要等待所有数据加载完数
      if (event.is_cancelled || event.club_deleted) {
            this.setData({ loading: false });
            this.triggerEvent('loaded');
            this._earlyLoadedTriggered = true; // Set flag to prevent duplicate events
  }
        });
        if (scheduleId) {
          try { await this.loadScheduleDetail(scheduleId, event.pre_startTime ? String(event.pre_startTime) : ''); } catch (e) {}
        } else {
          this.updateScheduleDisplay();
        }
        return event;
      }
      throw new Error(res.message || '获取活动失败');
    },

    async loadEventMembers(eventId) {      const res = await this.request({ url: `/event/${eventId}/members`, method: 'GET' });      if (res.Flag == 4000) {
        const members = res.data.members || [];
        const membersClockinCount = members.filter((m) => !!m.clockin_date).length;        this.setData({ members, membersClockinCount, selectedMemberIds: [] });
        this.prepareIsotopeMembers();
        return;
      }
      throw new Error(res.message || '获取成员失败');
    },

    async loadClubMembers(clubId) {
      try {
        const res = await this.request({ url: `/club/${clubId}/members`, method: 'GET' });
        if (res.Flag == 4000 && res.data && res.data.members) {
          const members = (res.data.members || []).map((m) => ({
            user_id: m.user_id,
            user_name: m.user_name,
            phone: m.phone,
            department: m.department,
            position: m.position,
            avatar: m.avatar,
            role: m.role,
            role_display: m.role_display,
          }));
          this.setData({ clubMembers: members });
          this.prepareIsotopeMembers();
          return;
        }
        // 如果协会不存在或已被删除，返回空数组而不是抛出错数
      if (res.Flag == 4001 || res.message?.includes('不存') || res.message?.includes('已被删除')) {          this.setData({ clubMembers: [] });
          this.prepareIsotopeMembers();
          return;
        }
        throw new Error(res.message || '获取协会成员失败');
      } catch (error) {
        // 捕获网络错误或其他异常，不影响整体加载流数
      this.setData({ clubMembers: [] });
        this.prepareIsotopeMembers();
      }
    },

    prepareIsotopeMembers() {
      const { clubMembers, members, quickActionConfig } = this.data;
      const eventMemberMap = new Map((members || []).map((m) => [String(m.user_id), m]));
      const roleNames = { 'president': '会长', 'vice_president': '副会', 'director': '理事', 'member': '会员' };
      const rolePriority = { 'president': 0, 'vice_president': 1, 'director': 2, 'member': 3 };      const isotopeItems = (clubMembers || []).map((member, index) => {
        const eventMember = eventMemberMap.get(String(member.user_id));
        const isJoined = !!eventMember;
        const isClockin = !!(eventMember && eventMember.clockin_date);
        const status = isClockin ? 'clockin' : (isJoined ? 'joined' : 'not');
        const joinDate = eventMember ? (eventMember.join_date || '') : '';
        
        // 根据状态选择按钮配置
    const buttonStatus = isJoined ? 'joined' : 'not_joined';
        const quickActionBtn = quickActionConfig[buttonStatus];
        
        if (eventMember) {        }
        
        // 生成唯一 ID：使?user_id，如果为空则使用索引
    const uniqueId = member.user_id ? `member-${member.user_id}` : `member-idx-${index}`;
        
        return {
          id: uniqueId,
          image: member.avatar || '/assets/images/default-avatar.png',
          ini_width: 100,
          ini_height: 100,
          label: member.user_name,
          user_id: member.user_id,
          user_name: member.user_name,
          phone: member.phone,
          department: member.department,
          position: member.position,
          avatar: member.avatar,
          role: member.role,
          role_display: roleNames[member.role] || member.role_display || '会员',
          is_joined: isJoined,
          is_clockin: isClockin,
          status,
          join_date: joinDate,
          quickActionBtn: quickActionBtn,  // 添加快速操作按钮配数
      _sortPriority: rolePriority[member.role] !== undefined ? rolePriority[member.role] : 3,
        };
      });      
      // 检查是否有重复?ID
    const idSet = new Set();
      const duplicates = [];
      isotopeItems.forEach(item => {
        if (idSet.has(item.id)) {
          duplicates.push(item.id);
        }
        idSet.add(item.id);
      });
      if (duplicates.length > 0) {      }
      
      // 直接更新数据，不清空数组，避免触发重新初始化
    this.setData({ memberIsotopeItems: isotopeItems }, () => {        // 不在这里自动触发排序，由调用方决定何时触数
      });
    },

    /**
     * 成员排序模式切换
     */
    onMemberSortChange(e) {
      const mode = e.currentTarget.dataset.mode || e.detail?.value;
      if (!mode || mode === this.data.memberSortMode) return;
      
      let sortBy, sortAscending;
      switch (mode) {
        case 'roleFirst':
          sortBy = ['_sortPriority', 'join_date'];
          sortAscending = [true, true];
          break;
        case 'joinDate':
          // 降序排序：最新参加的在前（join_date 大的在前数
      // 未参加的成员 join_date 为空字符串，会排在最数
      sortBy = ['join_date'];
          sortAscending = [false];
          break;
        case 'name':
          sortBy = ['user_name'];
          sortAscending = [true];
          break;
      }
      
      this.setData({ 
        memberSortMode: mode, 
        memberSortBy: sortBy, 
        memberSortAscending: sortAscending 
      }, () => {
        const iso = this.selectComponent('#eventMemberIsotope');
        if (iso && iso.sort) {
          iso.sort(sortBy, sortAscending);
        }
      });
    },

    // 时间相关
  openPreStartPicker() { this.setData({ showPreStartPicker: true }); },
    closePreStartPicker() { this.setData({ showPreStartPicker: false }); },
    openPreEndPicker() { this.setData({ showPreEndPicker: true }); },
    closePreEndPicker() { this.setData({ showPreEndPicker: false }); },

    onPreStartBoxExpand() {
      if (!this.data.event) return;
      
      // 设置当前时间为最小数
      const now = new Date();
      const minStartTime = formatTimeDisplay(now.toISOString());
      
      this.setData({
        'timeEdit.preStart': toPickerValue(this.data.event.pre_startTime),
        'timeEditRaw.preStartPick': null,
        'timeEditRaw.preStartParts': null,
        minStartTime: minStartTime
      });
    },

    onPreEndBoxExpand() {
      if (!this.data.event) return;
      
      // 获取预计开始时间和结束时间
    const preStartTime = this.data.event.pre_startTime;
      const preEndTime = this.data.event.pre_endTime;
      
      // 如果结束时间早于开始时间，或者结束时间不存在，使用开始时间作为初始数
      let initialEndTime = preEndTime;
      if (preStartTime && preEndTime) {
        const startDate = new Date(preStartTime);
        const endDate = new Date(preEndTime);
        if (endDate < startDate) {
          initialEndTime = preStartTime;
        }
      } else if (!preEndTime && preStartTime) {
        initialEndTime = preStartTime;
      }
      
      this.setData({
        'timeEdit.preEnd': toPickerValue(initialEndTime),
        'timeEditRaw.preEndPick': null,
        'timeEditRaw.preEndParts': null,
      });
    },

    normalizePickerValue(v) {
      if (typeof v === 'number') return formatTimeDisplay(v);
      if (Array.isArray(v)) {
        const parts = v.map((x) => String(x));
        if (parts.length >= 5) {
          const [Y, M, D, H, m] = parts;
          const pad = (n) => String(n).padStart(2, '0');
          return `${Y}-${pad(M)}-${pad(D)} ${pad(H)}:${pad(m)}`;
        }
        return parts.join('-');
      }
      return String(v || '').replace('T', ' ').slice(0, 16);
    },

    onPreStartChange(e) {
      const val = this.normalizePickerValue(e.detail.value);
      this.setData({ 'timeEdit.preStart': val, 'timeEditRaw.preStartParts': e.detail.value });
    },
    onPreStartConfirm(e) {
      const val = this.normalizePickerValue(e.detail.value);
      this.setData({ 'timeEdit.preStart': val, 'timeEditRaw.preStartParts': e.detail.value });
    },
    onPreStartPick(e) {
      const val = this.normalizePickerValue(e.detail.value);
      this.setData({ 'timeEdit.preStart': val, 'timeEditRaw.preStartPick': e.detail.value });
    },
    onPreEndChange(e) {
      const val = this.normalizePickerValue(e.detail.value);
      this.setData({ 'timeEdit.preEnd': val, 'timeEditRaw.preEndParts': e.detail.value });
    },
    onPreEndConfirm(e) {
      const val = this.normalizePickerValue(e.detail.value);
      this.setData({ 'timeEdit.preEnd': val, 'timeEditRaw.preEndParts': e.detail.value });
    },
    onPreEndPick(e) {
      const val = this.normalizePickerValue(e.detail.value);
      this.setData({ 'timeEdit.preEnd': val, 'timeEditRaw.preEndPick': e.detail.value });
    },

    async confirmPreStart() {
      const chosen = this.normalizePickerValue(
        this.data.timeEditRaw.preStartPick || this.data.timeEditRaw.preStartParts || this.data.timeEdit.preStart
      );
      const iso = pickerValueToIso(chosen);
      if (!iso) return wx.showToast({ title: '时间格式不正', icon: 'none' });
      
      // 验证开始时间不能早于当前时数
      const now = new Date();
      const startDate = new Date(iso);
      if (startDate < now) {
        return wx.showToast({ title: '开始时间不能早于当前时', icon: 'none' });
      }
      
      try {
        const res = await this.request({
          url: `/event/${this.data.eventId}/update_pre_startTime`,
          method: 'POST',
          data: { pre_startTime: iso },
          loadingText: '保存在..',
        });
        if (String(res.Flag) !== '4000') throw new Error(res.message || '更新失败');
        const returnedIso = res.data?.pre_startTime || iso;
        const event = { ...(this.data.event || {}) };
        event.pre_startTime = returnedIso;
        event.pre_startTime_display = formatTimeDisplay(returnedIso);
        this.setData({ event, 'timeEdit.preStart': toPickerValue(returnedIso), showPreStartPicker: false });
        
        // 记录变更到本地缓存（自动触发 triggerEvent数
      app.recordChange(this.data.eventId, 'update', {
          type: 'event',
          event_id: this.data.eventId,
          pre_startTime: returnedIso
        }, this);
        
        wx.showToast({ title: '已保', icon: 'success' });
        const box = this.selectComponent('#pre-start-box');
        if (box && box.collapse) box.collapse();
        this.setData({ 'timeEditRaw.preStartParts': null });
      } catch (e) {        wx.showToast({ title: e.message || '更新失败', icon: 'none' });
      }
    },

    async confirmPreEnd() {
      const chosen = this.normalizePickerValue(
        this.data.timeEditRaw.preEndPick || this.data.timeEditRaw.preEndParts || this.data.timeEdit.preEnd
      );
      const iso = pickerValueToIso(chosen);
      if (!iso) return wx.showToast({ title: '时间格式不正', icon: 'none' });
      try {
        const res = await this.request({
          url: `/event/${this.data.eventId}/update_pre_endTime`,
          method: 'POST',
          data: { pre_endTime: iso },
          loadingText: '保存在..',
        });
        if (String(res.Flag) !== '4000') throw new Error(res.message || '更新失败');
        const returnedIso = res.data?.pre_endTime || iso;
        const event = { ...(this.data.event || {}) };
        event.pre_endTime = returnedIso;
        event.pre_endTime_display = formatTimeDisplay(returnedIso);
        this.setData({ event, 'timeEdit.preEnd': toPickerValue(returnedIso), showPreEndPicker: false });
        wx.showToast({ title: '已保', icon: 'success' });
        const box = this.selectComponent('#pre-end-box');
        if (box && box.collapse) box.collapse();
        this.setData({ 'timeEditRaw.preEndParts': null });
      } catch (e) {        wx.showToast({ title: e.message || '更新失败', icon: 'none' });
      }
    },

    async beginEvent() {
      const ok = await wx.showModal({
        title: '开始活动',
        content: '确认现在开始？将生成实际开始时间',
        confirmText: '开',
        cancelText: '取消',
      });
      if (!ok.confirm) return;
      try {
        const res = await this.request({
          url: `/event/${this.data.eventId}/begin`,
          method: 'GET',
          loadingText: '开始中...',
        });
        if (res.Flag == 4000) {
          wx.showToast({ title: '已开', icon: 'success' });
          // 本地更新，不刷新整个面板
    const event = { ...(this.data.event || {}) };
          const actualStartTime = res.data?.actual_startTime || new Date().toISOString();
          event.actual_startTime = actualStartTime;
          event.actual_startTime_display = formatTimeDisplay(actualStartTime);
          this.setData({ event });
          return;
        }
        throw new Error(res.message || '开始失');
      } catch (e) {        wx.showToast({ title: e.message || '开始失', icon: 'none' });
      }
    },

    async endEvent() {
      const ok = await wx.showModal({
        title: '结束活动',
        content: '确认现在结束？将生成实际结束时间',
        confirmText: '结束',
        cancelText: '取消',
      });
      if (!ok.confirm) return;
      try {
        const res = await this.request({
          url: `/event/${this.data.eventId}/end`,
          method: 'GET',
          loadingText: '结束?..',
        });
        if (res.Flag == 4000) {
          wx.showToast({ title: '已结', icon: 'success' });
          // 本地更新，不刷新整个面板
    const event = { ...(this.data.event || {}) };
          const actualEndTime = res.data?.actual_endTime || new Date().toISOString();
          event.actual_endtime = actualEndTime;
          event.actual_endTime_display = formatTimeDisplay(actualEndTime);
          this.setData({ event });
          return;
        }
        throw new Error(res.message || '结束失败');
      } catch (e) {        wx.showToast({ title: e.message || '结束失败', icon: 'none' });
      }
    },

    async cancelEvent() {
      const ok = await wx.showModal({
        title: '取消活动',
        content: '确认取消此活动？取消后活动将无法恢复',
        confirmText: '确认取消',
        confirmColor: '#ff4d4f',
        cancelText: '不取',
      });
      if (!ok.confirm) return;
      try {
        const res = await this.request({
          url: `/event/${this.data.eventId}/cancel`,
          method: 'POST',
          loadingText: '取消息..',
        });
        if (res.Flag == 4000) {
          wx.showToast({ title: '活动已取', icon: 'success' });
          // 本地更新活动状数
      const event = { ...(this.data.event || {}) };
          event.is_cancelled = true;
          this.setData({ event });
          
          // 记录删除变更（自动触摸triggerEvent数
      app.recordChange(this.data.eventId, 'delete', {
            type: 'event'
          }, this);
          return;
        }
        throw new Error(res.message || '取消失败');
      } catch (e) {        wx.showToast({ title: e.message || '取消失败', icon: 'none' });
      }
    },

    // 准备分享消息（在面板加载完成时调用）
    // 封面
    async onChangeCover() {
      try {
        const choose = await new Promise((resolve, reject) => {
          wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], success: resolve, fail: reject });
        });
        const filePath = choose.tempFiles?.[0]?.tempFilePath;
        if (!filePath) return;
        wx.showLoading({ title: '上传封面...' });
        const upload = await this.uploadFile(filePath);
        const fileId = upload.file_id;
        if (!fileId) throw new Error('上传失败');
        const res = await this.request({
          url: `/event/${this.data.eventId}/update_cover`,
          method: 'POST',
          data: { file_id: fileId },
        });
        wx.hideLoading();
        if (res.Flag == 4000) {
          wx.showToast({ title: '封面已更', icon: 'success' });
          // 本地更新封面，使用临时文件路径先显示，后续会被真实URL替换
    const event = { ...(this.data.event || {}) };
          event.cover_url = filePath; // 先用本地路径显示
    if (res.data && res.data.cover_url) {
            event.cover_url = res.data.cover_url; // 如果返回了真实URL则使数
      }
          this.setData({ event });
          
          // 记录变更到本地缓存（自动触发 triggerEvent数
      app.recordChange(this.data.eventId, 'update', {
            type: 'event',
            event_id: this.data.eventId,
            cover_url: event.cover_url
          }, this);
          return;
        }
        throw new Error(res.message || '更新封面失败');
      } catch (e) {
        wx.hideLoading();        wx.showToast({ title: e.message || '封面更新失败', icon: 'none' });
      }
    },

    uploadFile(filePath, extraFormData = {}) {
      return new Promise((resolve, reject) => {
        wx.uploadFile({
          url: this.data.uploadAPI,
          filePath,
          name: 'file',
          formData: extraFormData,
          header: { Authorization: 'Bearer ' + wx.getStorageSync('token') },
          dataType: 'json',
          success: (res) => {
            try {
              const data = JSON.parse(res.data);
              if (data.Flag === 4000) resolve(data.data);
              else reject(new Error(data.Message || data.message || '上传失败'));
            } catch (err) { reject(new Error('解析响应失败')); }
          },
          fail: reject,
        });
      });
    },

    // 简数
      onEditTitleChange(e) { this.setData({ 'editInfo.title': e.detail.value || '' }); },
    onEditContentChange(e) { this.setData({ 'editInfo.content': e.detail.value || '' }); },

    async saveTitle() {
      const title = (this.data.editInfo.title || '').trim();
      if (!title) return wx.showToast({ title: '标题不能为空', icon: 'none' });
      try {
        const res = await this.request({
          url: `/event/${this.data.eventId}/update_content`,
          method: 'POST',
          data: { title, content: this.data.event.content || '' },
          loadingText: '保存在..',
        });
        if (res.Flag == 4000) {
          wx.showToast({ title: '已保', icon: 'success' });
          // 本地更新，不刷新整个面板
    const event = { ...(this.data.event || {}) };
          event.title = title;
          this.setData({ event });
          const box = this.selectComponent('#row-title');
          if (box && box.collapse) box.collapse();
          
          // 记录变更到本地缓存（自动触发 triggerEvent数
      app.recordChange(this.data.eventId, 'update', {
            type: 'event',
            event_id: this.data.eventId,
            title: title
          }, this);
          return;
        }
        throw new Error(res.message || '保存失败');
      } catch (e) {        wx.showToast({ title: e.message || '保存失败', icon: 'none' });
      }
    },

    async saveContent() {
      const content = (this.data.editInfo.content || '').trim();
      try {
        const res = await this.request({
          url: `/event/${this.data.eventId}/update_content`,
          method: 'POST',
          data: { title: this.data.event.title || '', content },
          loadingText: '保存在..',
        });
        if (res.Flag == 4000) {
          wx.showToast({ title: '已保', icon: 'success' });
          // 本地更新，不刷新整个面板
    const event = { ...(this.data.event || {}) };
          event.content = content;
          this.setData({ event });
          const box = this.selectComponent('#row-content');
          if (box && box.collapse) box.collapse();
          
          // 记录变更到本地缓存（自动触发 triggerEvent数
      app.recordChange(this.data.eventId, 'update', {
            type: 'event',
            event_id: this.data.eventId,
            content: content
          }, this);
          return;
        }
        throw new Error(res.message || '保存失败');
      } catch (e) {        wx.showToast({ title: e.message || '保存失败', icon: 'none' });
      }
    },

    // 地点
    async chooseLocation() {
      try {
        this.setData({ suppressReloadOnce: true });
        const res = await new Promise((resolve, reject) => {
          wx.chooseLocation({ success: resolve, fail: reject });
        });
        const locationData = {
          name: res.name,
          address: res.address,
          latitude: res.latitude,
          longitude: res.longitude,
        };
        const locationText = res.name || res.address || this.data.editLocation.location;
        this.setData({
          'editLocation.location': locationText,
          'editLocation.location_data': locationData,
        });
        await this.saveLocation();
      } catch (e) { }
    },

    async saveLocation() {
      const location = (this.data.editLocation.location || '').trim();
      const location_data = this.data.editLocation.location_data || null;
      if (!location) return wx.showToast({ title: '地点不能为空', icon: 'none' });
      try {
        const res = await this.request({
          url: `/event/${this.data.eventId}/update_location`,
          method: 'POST',
          data: { location, location_data },
          loadingText: '保存在..',
        });
        if (res.Flag == 4000) {
          wx.showToast({ title: '已保', icon: 'success' });
          // 本地更新，不刷新整个面板
    const event = { ...(this.data.event || {}) };
          event.location = location;
          event.location_data = location_data;
          // 更新地图标记
    const locationMarkers = [];
          if (location_data && location_data.latitude && location_data.longitude) {
            locationMarkers.push({
              id: 1,
              latitude: location_data.latitude,
              longitude: location_data.longitude,
              iconPath: '/assets/images/location-marker.png',
              width: 30,
              height: 30,
            });
          }
          this.setData({ event, locationMarkers });
          
          // 记录变更到本地缓存（自动触发 triggerEvent数
      app.recordChange(this.data.eventId, 'update', {
            type: 'event',
            event_id: this.data.eventId,
            location: location
          }, this);
          return;
        }
        throw new Error(res.message || '保存失败');
      } catch (e) {        wx.showToast({ title: e.message || '保存失败', icon: 'none' });
      }
    },

    // 日程管理
  onScheduleExpand() {
      this.syncTempMapsFromForm();
      this.setData({ timeOfDayValue: this.data.scheduleForm.activity_time || '09:00' });
    },

    async loadScheduleDetail(scheduleId, fallbackStartTime = '') {
      const res = await this.request({ url: `/schedule/${scheduleId}`, method: 'GET' });
      if (res.Flag != 4000) throw new Error(res.message || '获取日程失败');
      const s = res.data || {};
      const cfg = s.time_config || {};
      const hour = typeof cfg.hour === 'number' ? cfg.hour : 9;
      const minute = typeof cfg.minute === 'number' ? cfg.minute : 0;
      const timeOfDay = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const weekdays = Array.isArray(cfg.weekdays) ? cfg.weekdays : [0];
      const days = Array.isArray(cfg.days) ? cfg.days : [1];
      const advanceHours = Number(s.advance_hours ?? 1);
      const sliderMap = [0, 1, 2, 3, 6, 12, 24, 48];
      const idx = Math.max(0, sliderMap.indexOf(advanceHours));
      this.setData({
        scheduleEnabled: true,
        scheduleForm: {
          schedule_type: s.schedule_type || 'weekly',
          weekdays,
          month_days: days,
          activity_time: timeOfDay,
          advance_hours_slider: idx
        },
        timeOfDayValue: timeOfDay,
        scheduleStartTime: fallbackStartTime || (s.start_time ? String(s.start_time) : '')
      });
      this.syncTempMapsFromForm();
      this.updateScheduleDisplay();
    },

    onScheduleEnabledChangeWrapper(e) {
      this.setData({ scheduleEnabled: e.detail.value });
      this.updateScheduleDisplay();
    },

    onScheduleTypeChangeWrapper(e) {
      const type = e.currentTarget.dataset.type;
      this.setData({ 'scheduleForm.schedule_type': type });
      this.updateScheduleDisplay();
    },

    syncTempMapsFromForm() {
      const weekdays = this.data.scheduleForm.weekdays || [];
      const monthdays = this.data.scheduleForm.month_days || [];
      const wMap = {};
      weekdays.forEach((d) => { wMap[d] = true; });
      const mMap = {};
      monthdays.forEach((d) => { mMap[d] = true; });
      this.setData({ tempWeekdays: weekdays, tempMonthdays: monthdays, tempWeekdaysMap: wMap, tempMonthdaysMap: mMap });
    },

    onWeekdaySelectorExpand() { this.syncTempMapsFromForm(); },
    onWeekdaySelectorCollapse() {
      const selected = Object.keys(this.data.tempWeekdaysMap || {})
        .filter((k) => this.data.tempWeekdaysMap[k])
        .map((k) => Number(k))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
      this.setData({ 'scheduleForm.weekdays': selected.length ? selected : [0] }, () => this.updateScheduleDisplay());
    },

    toggleWeekday(e) {
      const day = Number(e.currentTarget.dataset.day);
      if (!Number.isFinite(day)) return;
      const map = { ...(this.data.tempWeekdaysMap || {}) };
      map[day] = !map[day];
      this.setData({ tempWeekdaysMap: map });
    },

    onMonthdaySelectorExpand() { this.syncTempMapsFromForm(); },
    onMonthdaySelectorCollapse() {
      const selected = Object.keys(this.data.tempMonthdaysMap || {})
        .filter((k) => this.data.tempMonthdaysMap[k])
        .map((k) => Number(k))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
      this.setData({ 'scheduleForm.month_days': selected.length ? selected : [1] }, () => this.updateScheduleDisplay());
    },

    toggleMonthday(e) {
      const day = Number(e.currentTarget.dataset.day);
      if (!Number.isFinite(day)) return;
      const map = { ...(this.data.tempMonthdaysMap || {}) };
      map[day] = !map[day];
      this.setData({ tempMonthdaysMap: map });
    },

    onTimeSelectorExpand() {
      const currentTime = this.data.scheduleForm.activity_time || '09:00';
      this.setData({ timeOfDayValue: currentTime });
    },
    onTimeSelectorCollapse() {
      const time = this.data.timeOfDayValue || this.data.scheduleForm.activity_time || '09:00';
      this.setData({ 'scheduleForm.activity_time': time }, () => this.updateScheduleDisplay());
    },

    onTimeInput(event) {
      let time = event.detail || '09:00';
      if (typeof time !== 'string') {
        if (time && typeof time === 'object') {
          const hour = String(time.hour || 9).padStart(2, '0');
          const minute = String(time.minute || 0).padStart(2, '0');
          time = `${hour}:${minute}`;
        } else { time = String(time); }
      }
      this.setData({ timeOfDayValue: time });
    },

    onAdvanceHoursChange(event) {
      const value = event.detail !== undefined ? event.detail : 1;
      this.setData({ 'scheduleForm.advance_hours_slider': value }, () => this.updateScheduleDisplay());
    },

    collapsePopup(e) {
      const id = e.currentTarget.dataset.id;
      const comp = this.selectComponent(`#${id}`);
      if (comp && comp.collapse) comp.collapse();
    },

    updateScheduleDisplay() {
      if (!this.data.scheduleEnabled) {
        this.setData({ tempScheduleDisplay: '' });
        return;
      }
      const { scheduleForm } = this.data;
      let displayText = '';
      if (scheduleForm.schedule_type === 'weekly' && scheduleForm.weekdays?.length) {
        const weekdaysText = this.getWeekdaysDisplay(scheduleForm.weekdays);
        displayText = `每周${weekdaysText} ${scheduleForm.activity_time || ''}`;
      } else if (scheduleForm.schedule_type === 'monthly' && scheduleForm.month_days?.length) {
        const monthdaysText = this.getMonthdaysDisplay(scheduleForm.month_days);
        displayText = `每月${monthdaysText} ${scheduleForm.activity_time || ''}`;
      }
      if (displayText && scheduleForm.advance_hours_slider >= 0) {
        const advanceText = this.data.advanceHourLabels[scheduleForm.advance_hours_slider];
        if (advanceText && advanceText !== '不提') displayText += `?{advanceText}提醒`;
      }
      this.setData({ tempScheduleDisplay: displayText });
    },

    getWeekdaysDisplay(weekdays) {
      if (!weekdays || !weekdays.length) return '';
      const dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      return weekdays.map((d) => dayLabels[d] || '').filter(Boolean).join('');
    },

    getMonthdaysDisplay(monthdays) {
      if (!monthdays || !monthdays.length) return '';
      return monthdays.map((d) => `${d}日`).join('');
    },

    getAdvanceHours(sliderValue) {
      const hours = [0, 1, 2, 3, 6, 12, 24, 48];
      if (typeof sliderValue !== 'number' || sliderValue < 0 || sliderValue >= hours.length) return 1;
      return hours[sliderValue];
    },

    async saveScheduleAndClose() {
      const eventId = this.data.eventId;
      const scheduleId = this.data.scheduleId;
      try {
        if (!this.data.scheduleEnabled) {
          if (scheduleId) {
            const res = await this.request({ url: `/schedule/${scheduleId}/end`, method: 'GET', loadingText: '结束?..' });
            if (res.Flag != 4000) throw new Error(res.message || '结束失败');
          }
          // 本地更新，不刷新整个面板
    const event = { ...(this.data.event || {}) };
          event.schedule_info = null;
          this.setData({ event, scheduleId: null, scheduleEnabled: false });
          wx.showToast({ title: '已更', icon: 'success' });
          this.selectComponent('#card-schedule')?.collapse?.();
          return;
        }

        const sf = this.data.scheduleForm || {};
        const payload = {
          start_time: this.data.scheduleStartTime || (this.data.event?.pre_startTime ? String(this.data.event.pre_startTime) : new Date().toISOString()),
          end_time: null,
          schedule_type: sf.schedule_type,
          time_of_day: sf.activity_time,
          advance_hours: this.getAdvanceHours(sf.advance_hours_slider),
        };
        if (sf.schedule_type === 'weekly') payload.weekdays = sf.weekdays || [0];
        if (sf.schedule_type === 'monthly') payload.month_days = sf.month_days || [1];

        let newScheduleId = scheduleId;
        if (scheduleId) {
          const res = await this.request({ url: `/schedule/${scheduleId}/update`, method: 'POST', data: payload, loadingText: '保存在..' });
          if (res.Flag != 4000) throw new Error(res.message || '保存失败');
        } else {
          const res = await this.request({ url: `/schedule/create/${eventId}`, method: 'PUT', data: payload, loadingText: '创建?..' });
          if (res.Flag != 4000) throw new Error(res.message || '创建失败');
          newScheduleId = res.data?.schedule_id || null;
        }

        // 本地更新，不刷新整个面板
    const event = { ...(this.data.event || {}) };
        event.schedule_info = { schedule_id: newScheduleId, ...payload };
        this.setData({ event, scheduleId: newScheduleId, scheduleEnabled: true });
        this.updateScheduleDisplay();
        wx.showToast({ title: '已保', icon: 'success' });
        this.selectComponent('#card-schedule')?.collapse?.();
      } catch (e) {        wx.showToast({ title: e.message || '保存失败', icon: 'none' });
      }
    },

    // 成员管理
    
    /**
     * 成员点击事件
     * 显示成员详情弹窗
     */
    onMemberItemTap(e) {
      const { item, tapX, tapY } = e.detail;
      if (!item) return;
      this.showMemberDetailPopup(item, tapX, tapY);
    },

    /**
     * 显示成员详情弹窗
     */
    showMemberDetailPopup(item, tapX, tapY) {
      // 构建弹窗数据，包含活动相关状数
      const memberData = {
        user_id: item.user_id,
        user_name: item.user_name,
        phone: item.phone,
        department: item.department,
        position: item.position,
        avatar: item.avatar,
        role: item.role,
        role_display: item.role_display,
        is_joined: item.is_joined,      // 是否参加活动
        is_clockin: item.is_clockin     // 是否已打数
      };
      
      this.setData({ currentMember: memberData }, () => {
        setTimeout(() => {
          const popup = this.selectComponent('#em-shared-member-detail');
          if (popup && popup.expand) {
            popup.expand(tapX, tapY);
          }
        }, 50);
      });
    },

    /**
     * 弹窗收起时清空数据
     */
    onSharedMemberPopupCollapse() {
      setTimeout(() => {
        this.setData({ currentMember: null });
      }, 600);
    },

    /**
     * 处理快速操作按钮点击
     * 接收 isotope 触发?quickaction 事件
     */
    onMemberQuickAction(e) {
      const { item } = e.detail;
      if (!item) return;
      
      // 调用统一的成员状态切换方数
      this.toggleMemberJoinStatus(item.user_id, item.user_name, item.is_joined, false);
    },

    /**
     * 统一的成员状态切换方式
     * @param {string} userId - 用户 ID
     * @param {string} userName - 用户名称
     * @param {boolean} isJoined - 当前是否已参数
     * @param {boolean} fromPopup - 是否来自弹窗操作
     */
    async toggleMemberJoinStatus(userId, userName, isJoined, fromPopup = false) {
      try {        wx.showLoading({ title: isJoined ? '退出中...' : '加入?..' });
        
        if (isJoined) {
          // 退出活数
      const res = await this.request({ 
            url: `/event/${this.data.eventId}/remove/${userId}`, 
            method: 'GET' 
          });          
          if (String(res.Flag) !== '4000') {
            throw new Error(res.message || '退出失');
          }
        } else {
          // 加入活动
    const res = await this.request({ 
            url: `/event/${this.data.eventId}/addmember/${userId}`, 
            method: 'GET' 
          });          
          if (String(res.Flag) !== '4000' || !res.message?.includes('成功')) {
            throw new Error(res.message || '加入失败');
          }
        }
        
        // 重新加载成员数据（获取最新的 join_date数
      await this.loadEventMembers(this.data.eventId);        
        wx.hideLoading();
        wx.showToast({
          title: isJoined ? '已退出活动' : '已加入活动',
          icon: 'success'
        });
        
        // 如果来自弹窗，先收起弹窗，等待动画完成后再触发排数
      if (fromPopup) {
          const popup = this.selectComponent('#em-shared-member-detail');
          if (popup && popup.collapse) {
            popup.collapse();
          }
          
          // 等待弹窗收起动画完成功00ms）后再触发排数
      setTimeout(() => {
            this.triggerSortIfNeeded();
          }, 600);
        } else {
          // 快捷按钮操作，等待一小段时间确保 setData 完成后再触发排序
          setTimeout(() => {
            this.triggerSortIfNeeded();
          }, 100);
        }
        
      } catch (e) {
        wx.hideLoading();        wx.showToast({
          title: e.message || '操作失败',
          icon: 'none'
        });
      }
    },

    /**
     * 根据当前排序模式触发排序动画
     */
    triggerSortIfNeeded() {
      const { memberSortMode, memberSortBy, memberSortAscending, memberIsotopeItems } = this.data;      
      // 只在"参加时间"排序模式下触发排序动数
      // 其他模式（会长在前、姓名字母）不需要重新排序，因为角色和姓名没有变数
      if (memberSortMode === 'joinDate') {
        const iso = this.selectComponent('#eventMemberIsotope');        if (iso && iso.sort) {          iso.sort(memberSortBy, memberSortAscending);
        } else {        }
      } else {      }
    },

    /**
     * Isotope 高度变化事件
     */
    onIsoHeightChange(e) {
      const { heightStr } = e.detail;
      this.setData({ memberIsoHeight: heightStr });
    },

    /**
     * Isotope 布局就绪事件
     */
    onMemberIsotopeReady(e) {    },

    async addMemberFromCard(e) {
      const userId = e.currentTarget.dataset.userId;
      const member = this.data.currentMember;
      if (!member) return;
      
      // 调用统一的成员状态切换方法，标记来自弹窗
    this.toggleMemberJoinStatus(userId, member.user_name, false, true);
    },

    async removeMemberFromCard(e) {
      const userId = e.currentTarget.dataset.userId;
      const userName = e.currentTarget.dataset.userName;
      
      const ok = await wx.showModal({
        title: '确认退',
        content: `确定?"${userName}" 退出活动吗？`,
        confirmText: '退',
        confirmColor: '#ff4d4f',
        cancelText: '取消',
      });
      
      if (!ok.confirm) return;
      
      // 调用统一的成员状态切换方法，标记来自弹窗
    this.toggleMemberJoinStatus(userId, userName, true, true);
    },

    // 动态相?
    async loadMoments(page = 1) {
      try {
        const token = wx.getStorageSync('token');
        const resp = await new Promise((resolve, reject) => {
          wx.request({
            url: app.globalData.request_url + `/moment/event/${this.data.eventId}?mode=page&page=${page}`,
            method: 'GET',
            header: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            success: resolve,
            fail: reject,
          });
        });
        if (resp.data && resp.data.Flag == 4000) {
          const list = resp.data.data.moments || [];
          const merged = page === 1 ? list : [...this.data.momentsRaw, ...list];
          this.setData({
            momentsRaw: merged,
            momentsPage: resp.data.data.pagination?.current_page || page,
            momentsTotalPages: resp.data.data.pagination?.total_pages || 1,
          });
          this.updateMomentsSummary();
          this.buildPublishers();
          this.rebuildFeed();
        } else {
          throw new Error(resp.data?.message || '获取动态失');
        }
      } catch (e) {        if (page === 1) this.setData({ momentsRaw: [] });
        this.updateMomentsSummary();
        this.buildPublishers();
        this.rebuildFeed();
      }
    },

    updateMomentsSummary() {
      const list = this.data.momentsRaw || [];
      const momentsCount = list.length;
      if (!momentsCount) {
        this.setData({ momentsCount: 0, latestMoment: { firstImage: '', text: '', user_name: '' } });
        return;
      }
      const sorted = [...list].sort((a, b) => {
        const ta = new Date(a.createDate || a.create_time || a.create_time_iso || 0).getTime() || 0;
        const tb = new Date(b.createDate || b.create_time || b.create_time_iso || 0).getTime() || 0;
        return tb - ta;
      });
      const latest = sorted[0] || {};
      const c = latest.creator || {};
      const firstImage = latest.image_files?.[0]?.fileUrl || '';
      this.setData({
        momentsCount,
        latestMoment: { firstImage, text: latest.description || '', user_name: c.user_name || c.userName || c.name || '' },
      });
    },

    buildPublishers() {
      const map = new Map();
      for (const m of this.data.momentsRaw || []) {
        const c = m.creator || {};
        const user_id = c.user_id || c.userID || c.id;
        const user_name = c.user_name || c.userName || c.name || '未知用户';
        const avatar = c.avatar || '';
        if (!user_id) continue;
        const k = String(user_id);
        const cur = map.get(k) || { user_id, user_name, avatar, count: 0 };
        cur.count += 1;
        map.set(k, cur);
      }
      const publishers = Array.from(map.values()).sort((a, b) => b.count - a.count);
      this.setData({ publishers });
    },

    rebuildFeed() {
      const momentItems = (this.data.momentsRaw || []).map((m) => {
        const c = m.creator || {};
        const creator = {
          user_id: c.user_id || c.userID || c.id,
          user_name: c.user_name || c.userName || c.name || '未知用户',
          avatar: c.avatar || '',
        };
        const time = m.createDate || m.create_time || m.create_time_iso || '';
        return {
          id: `moment-${m.momentID}`,
          momentID: m.momentID,
          creator,
          time,
          time_display: formatTimeDisplay(time),
          text: m.description || '',
          image_files: m.image_files || [],
        };
      });

      // 按时间倒序排序
      momentItems.sort((a, b) => {
        const ta = new Date(a.time).getTime() || 0;
        const tb = new Date(b.time).getTime() || 0;
        return tb - ta;
      });

      const { publisherId } = this.data.feedFilter;
      let filtered = momentItems;
      if (publisherId) filtered = filtered.filter((x) => String(x.creator.user_id) === String(publisherId));
      this.setData({ feed: filtered });
    },

    selectPublisher(e) {
      const userId = e.currentTarget.dataset.userId;
      const userName = e.currentTarget.dataset.userName;
      if (this.data.feedFilter.publisherId && String(this.data.feedFilter.publisherId) === String(userId)) {
        this.clearPublisherFilter();
        return;
      }
      this.setData({ 'feedFilter.publisherId': userId ? String(userId) : '', 'feedFilter.publisherName': userName || '' });
      this.rebuildFeed();
      const comp = this.selectComponent('#publisher-filter');
      if (comp && comp.collapse) comp.collapse();
    },

    clearPublisherFilter() {
      this.setData({ 'feedFilter.publisherId': '', 'feedFilter.publisherName': '' });
      this.rebuildFeed();
      const comp = this.selectComponent('#publisher-filter');
      if (comp && comp.collapse) comp.collapse();
    },

    onFeedScrollToLower() {
      // 加载更多动数
      const nextPage = (this.data.momentsPage || 1) + 1;
      if (nextPage <= (this.data.momentsTotalPages || 1)) {        this.loadMoments(nextPage);
      } else {      }
    },

    // 发布动数
      openAddMoment() {
      this.setData({ addMomentForm: { description: '', uploadFiles: [], isUploading: false } });
    },

    onMomentDescChange(e) { this.setData({ 'addMomentForm.description': e.detail.value || '' }); },
    onMomentImageAdd(e) { this.setData({ 'addMomentForm.uploadFiles': e.detail.files || [] }); },
    onMomentImageRemove(e) {
      const idx = e.detail.index;
      const files = [...(this.data.addMomentForm.uploadFiles || [])];
      files.splice(idx, 1);
      this.setData({ 'addMomentForm.uploadFiles': files });
    },

    async submitMoment() {
      if (!this.data.event) return;
      const desc = (this.data.addMomentForm.description || '').trim() || `我发布了活动数{this.data.event.title}」的动态`;
      const files = this.data.addMomentForm.uploadFiles || [];
      try {
        this.setData({ 'addMomentForm.isUploading': true });
        const imageIds = [];
        for (const f of files) {
          const r = await this.uploadFile(f.url, { file_type: 'moment_img' });
          if (r.file_id) imageIds.push(r.file_id);
        }
        await app.createMomentWithParams({
          description: desc,
          imageIds,
          refEventId: this.data.event.event_id,
          refClubId: this.data.event.club_info.club_id,
          throwError: true,
        });
        wx.showToast({ title: '已发', icon: 'success' });
        this.setData({ 'addMomentForm.isUploading': false });
        // 收起添加动态弹数
      const addMomentBox = this.selectComponent('#add-moment');
        if (addMomentBox && addMomentBox.collapse) addMomentBox.collapse();
        await this.loadMoments(1);
      } catch (e) {        wx.showToast({ title: e.message || '发布失败', icon: 'none' });
        this.setData({ 'addMomentForm.isUploading': false });
      }
    },

    // 动态操数
      toggleMomentOps(e) {
      const id = e.currentTarget.dataset.id;
      const isVisible = this.data.momentOpsVisible && this.data.currentActionMomentId == id;
      this.setData({ momentOpsVisible: !isVisible, currentActionMomentId: isVisible ? null : id });
    },

    closeMomentOps() { this.setData({ momentOpsVisible: false, currentActionMomentId: null }); },
    noop() {},

    async deleteMoment(e) {
      const momentId = e.currentTarget.dataset.id;
      this.closeMomentOps();
      const ok = await new Promise((resolve) => {
        wx.showModal({
          title: '确认删除',
          content: '确定要删除这条动态吗？删除后无法恢复',
          confirmText: '删除',
          confirmColor: '#ff4757',
          success: resolve,
          fail: () => resolve({ confirm: false }),
        });
      });
      if (!ok.confirm) return;
      try {
        wx.showLoading({ title: '删除?..' });
        const token = wx.getStorageSync('token');
        const resp = await new Promise((resolve, reject) => {
          wx.request({
            url: `${app.globalData.request_url}/moment/${momentId}`,
            method: 'DELETE',
            header: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            success: resolve,
            fail: reject,
          });
        });
        wx.hideLoading();
        if (resp.data?.Flag === 2000 || resp.data?.Flag === '2000') {
          wx.showToast({ title: '删除成功', icon: 'success' });
          await this.loadMoments(1);
        } else {
          throw new Error(resp.data?.message || '删除失败');
        }
      } catch (e) {
        wx.hideLoading();        wx.showToast({ title: e.message || '删除失败', icon: 'none' });
      }
    },

    goUserMoments(e) {
      const userId = e.currentTarget.dataset.userId;
      const userName = e.currentTarget.dataset.userName || '';
      if (!userId) return;
      wx.navigateTo({ url: `/packageProfile/user-moments/index?userId=${encodeURIComponent(userId)}&userName=${encodeURIComponent(userName)}` });
    }
  }
});
