const app = getApp();

Component({
  properties: {
    clubId: {
      type: String,
      value: ''
    },
  },

  data: {
    isLoading: true,
    club: null,
    selfMemberCard: null,
    presidentCard: null,
    viceCard: null,
    directorCard: null,
    memberAvatarOnlyList: [],
    /** 与 pages/home 热门协会 isotope 一致 */
    masonryHorizontalConfig: {
      rowHeight: 10
    },
    featuredEvent: null,
    eventsCurrentPage: [],
    eventsPageLoading: false,
    eventsEmpty: false,
    eventsPage: 1,
    eventsTotalPages: 1,
    // 嵌套弹窗状态 - event-detail-panel
    nestedEventDetail: {
      visible: false,
      loading: true,
      renderPanel: false,
      eventId: '',
      tapX: 0,
      tapY: 0
    },
    
    // 嵌套弹窗状态 - event-joined-panel
    nestedEventJoined: {
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
      this._loaded = false;
      this._hasExpanded = false;
    }
  },

  observers: {
    'clubId': function(clubId) {
      const isPlaceholder = !clubId || clubId.startsWith('placeholder');
      if (isPlaceholder) {
        this._lastClubId = null;
        this._loaded = false;
        this.setData({
          isLoading: false,
          club: null,
          selfMemberCard: null,
          presidentCard: null,
          viceCard: null,
          directorCard: null,
          memberAvatarOnlyList: [],
          featuredEvent: null,
          eventsCurrentPage: [],
        });
        return;
      }
      if (clubId !== this._lastClubId) {
        this._lastClubId = clubId;
        this._loaded = false;
        if (this._hasExpanded) {
          this.loadData();
        }
      }
    }
  },

  methods: {
    _apiOk(r) {
      return r && (r.Flag == '4000' || r.Flag == 4000);
    },

    _shortTime(iso) {
      if (!iso) return '';
      const s = String(iso).replace('T', ' ');
      return s.length > 16 ? s.slice(0, 16) : s;
    },

    _formatActivityTimeLine(ev) {
      if (!ev) return '';
      return this._shortTime(ev.actual_startTime || ev.pre_startTime);
    },

    _decorateLastParticipated(ev) {
      if (!ev) return null;
      const u = ev.cover_url;
      return {
        ...ev,
        cover_thumb: u ? getApp().convertToThumbnailUrl(u, 160) : '',
        time_line: this._formatActivityTimeLine(ev),
      };
    },

    processMembersSection(membersRaw, club) {
      const members = Array.isArray(membersRaw) ? membersRaw : [];
      const self = members.find((m) => m.is_current_user) || null;
      const selfId = self != null && self.user_id != null ? String(self.user_id) : null;

      const pickFirst = (role) => members.find((m) => m.role === role) || null;

      const cardFrom = (m, roleLabel) => {
        if (!m) return null;
        return {
          user_id: m.user_id,
          user_name: m.user_name || '',
          avatar: m.avatar,
          join_date_label: this._shortTime(m.join_date) || '—',
          role_label: roleLabel,
          participation_count: m.participation_count != null ? m.participation_count : 0,
          authored_event_count: m.authored_event_count != null ? m.authored_event_count : 0,
          last_participated_event: null,
        };
      };

      let selfMemberCard = null;
      if (self) {
        selfMemberCard = cardFrom(self, '我');
        selfMemberCard.participation_count = self.participation_count != null ? self.participation_count : 0;
        selfMemberCard.last_participated_event = self.last_participated_event
          ? this._decorateLastParticipated(self.last_participated_event)
          : null;
      }

      const presidentM = pickFirst('president');
      let presidentCard = null;
      if (presidentM && (!selfId || String(presidentM.user_id) !== selfId)) {
        presidentCard = cardFrom(presidentM, '会长');
      }

      const viceM = pickFirst('vice_president');
      let viceCard = null;
      if (viceM && (!selfId || String(viceM.user_id) !== selfId)) {
        viceCard = cardFrom(viceM, '副会长');
      }

      const directorM = pickFirst('director');
      let directorCard = null;
      if (directorM && (!selfId || String(directorM.user_id) !== selfId)) {
        directorCard = cardFrom(directorM, '理事');
      }

      const memberAvatarOnlyList = members
        .filter((m) => m.role === 'member' && (!selfId || String(m.user_id) !== selfId))
        .map((m) => ({
          user_id: m.user_id,
          avatar: m.avatar,
        }));

      this.setData({
        selfMemberCard,
        presidentCard,
        viceCard,
        directorCard,
        memberAvatarOnlyList,
      });
    },

    /** club_public 单条活动：地图预览、地点文案、封面缩略（列表字段 cover / cover_url 兼容） */
    normClubPublicEvent(event) {
      const ld = event.location_data || {};
      const n = String(ld.name || '').trim();
      const a = String(ld.address || '').trim();
      let location = String(event.location || '').trim();
      if (!location) location = n && a ? `${n} · ${a}` : n || a;
      let mapImageUrl = event.premap_url || '';
      if (!mapImageUrl && ld.longitude && ld.latitude) {
        const { longitude, latitude } = ld;
        mapImageUrl = `https://maps.geoapify.com/v1/staticmap?style=osm-bright-grey&width=600&height=400&center=lonlat:${longitude},${latitude}&zoom=15&marker=lonlat:${longitude},${latitude};type:awesome;color:%23ff6b9d;size:28&scaleFactor=2`;
      }
      const coverRaw = event.cover_url || event.cover;
      const firstImgRaw =
        event.event_imgs?.length > 0
          ? typeof event.event_imgs[0] === 'string'
            ? event.event_imgs[0]
            : event.event_imgs[0]?.fileUrl || event.event_imgs[0]?.url || event.event_imgs[0]?.file_url || ''
          : '';
      const thumbIfDownload = (url) => {
        if (!url) return '';
        const s = String(url);
        if (s.includes('/download/')) return getApp().convertToThumbnailUrl(s, 400);
        return s;
      };
      let cover_url_thumb = '';
      if (coverRaw) cover_url_thumb = thumbIfDownload(coverRaw) || coverRaw;
      else if (firstImgRaw) cover_url_thumb = thumbIfDownload(firstImgRaw) || firstImgRaw;
      /** 活动网格用原生 image 的 src：缩略优先，否则原图，避免 t-image + 非 /download/ 缩略失败不显示 */
      const gridCoverSrc = (cover_url_thumb || coverRaw || firstImgRaw || '').trim();
      const merged = {
        ...event,
        cover_url: coverRaw,
        location: location || event.location,
        mapImageUrl,
        cover_url_thumb,
        gridCoverSrc,
        loading: false,
      };
      const ended = !!(merged.actual_endTime || merged.is_ended);
      const joined = this._userActivelyJoinedEvent(merged);
      const startIso = merged.actual_startTime || merged.pre_startTime;
      const endIso = merged.actual_endTime || merged.pre_endTime;
      return {
        ...merged,
        join_badge_ok: joined,
        is_ended_display: ended,
        display_start: this._shortTime(startIso) || '—',
        display_end: this._shortTime(endIso) || (ended ? '已结束' : '—'),
      };
    },

    pickFeaturedFromList(list, isoEventId) {
      if (!list?.length) return null;
      if (isoEventId) {
        const hit = list.find((e) => String(e.event_id) === isoEventId);
        if (hit) return hit;
      }
      const now = Date.now();
      return (
        list.find((e) => e.actual_startTime && !e.actual_endTime) ||
        list.find((e) => !e.actual_startTime && e.pre_startTime && new Date(e.pre_startTime) > now) ||
        list[0]
      );
    },

    async fetchIsotopeFallback(eid) {
      try {
        const [memRes, moments] = await Promise.all([
          this.request({ url: `/event/${eid}/members` }),
          this.fetchEventMomentsForIsotope(eid)
        ]);
        return {
          participants: this._apiOk(memRes) ? memRes.data?.members || [] : [],
          moments
        };
      } catch {
        return { participants: [], moments: [] };
      }
    },

    // 懒加载入数
      loadData() {
      this._hasExpanded = true;
      if (this._loaded) return Promise.resolve();
      if (!this.data.clubId || this.data.clubId.startsWith('placeholder')) {
        return Promise.resolve();
      }
      this._loaded = true;
      return this.loadClubData();
    },

    // 加载协会数据
    async loadClubData() {
      this.setData({ isLoading: true });
      this._eventsPageCache = {};

      try {
        const [clubRes, membersRes, eventsRes] = await Promise.all([
          this.request({ url: `/club/${this.data.clubId}` }),
          this.request({ url: `/club/${this.data.clubId}/members` }),
          this.request({
            url: `/event/club_public/${this.data.clubId}/list/all?mode=page&page=1&include_featured_isotope=1`
          })
        ]);

        if (this._apiOk(clubRes)) {
          const club = clubRes.data || {};
          const membersRaw = this._apiOk(membersRes) ? membersRes.data?.members || [] : [];
          await this.processClubData(club);
          this.processMembersSection(membersRaw, club);

          if (this._apiOk(eventsRes)) {
            await this.processEventsData(eventsRes.data);
          } else {
            this.setData({
              eventsEmpty: true,
              featuredEvent: null,
              eventsCurrentPage: [],
              eventsPage: 1,
              eventsTotalPages: 1,
            });
          }
          
          this.setData({ isLoading: false });
          this.triggerEvent('loaded');
        } else {
          throw new Error(clubRes.message || '加载失败');
        }
      } catch (e) {
        this.setData({
          isLoading: false,
          club: null,
          selfMemberCard: null,
          presidentCard: null,
          viceCard: null,
          directorCard: null,
          memberAvatarOnlyList: [],
          eventsCurrentPage: [],
        });
        this.triggerEvent('loaded');
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    },

    // 处理协会数据
    async processClubData(club) {
      club.isDelete = club.is_deleted || false;
      
      if (club.president) {
        club.president_id = club.president?.user?.userID || null;
        club.president_username = club.president?.user?.userName || null;
        club.president_avatar = club.president?.user?.avatar?.fileUrl || null;
      }
      
      this.setData({ club });
    },

    /** 第 1 页：特色海报 + isotope（club_public + featured_isotope） */
    async applyFeaturedForPage1(list, data) {
      const iso = data.featured_isotope;
      const isoId =
        iso != null && (iso.event_id ?? iso.eventID) != null
          ? String(iso.event_id ?? iso.eventID)
          : '';
      let featured = this.pickFeaturedFromList(list, isoId);
      if (featured) {
        this.setEventStatus(featured);
        const eid = featured.event_id;
        const useIso = iso && isoId && String(eid) === isoId;
        const { participants, moments } = useIso
          ? { participants: iso.members || [], moments: iso.moments || [] }
          : await this.fetchIsotopeFallback(eid);
        featured.isotopeData = this.buildFeaturedEventIsotopeData(featured, moments, participants);
      }
      return featured || null;
    },

    /** club_public：列表归一化；首页缓存到 _eventsPageCache[1] */
    async processEventsData(data) {
      const raw = data.events || data.records || [];
      if (!raw.length) {
        this.setData({
          featuredEvent: null,
          eventsCurrentPage: [],
          eventsEmpty: true,
          eventsPage: 1,
          eventsTotalPages: 1,
        });
        return;
      }

      const list = raw.map((e) => this.normClubPublicEvent(e));
      const pageNum = data.pagination?.current_page || 1;
      this._eventsPageCache = this._eventsPageCache || {};
      this._eventsPageCache[pageNum] = list;

      const featured = pageNum === 1 ? await this.applyFeaturedForPage1(list, data) : this.data.featuredEvent;

      this.setData({
        featuredEvent: pageNum === 1 ? featured : this.data.featuredEvent,
        eventsCurrentPage: list,
        eventsEmpty: false,
        eventsPage: pageNum,
        eventsTotalPages: data.pagination?.total_pages || 1,
      });
    },

    async loadEventsPage(page) {
      const total = this.data.eventsTotalPages || 1;
      if (page < 1 || page > total) return;
      this._eventsPageCache = this._eventsPageCache || {};
      if (this._eventsPageCache[page]) {
        this.setData({
          eventsCurrentPage: this._eventsPageCache[page],
          eventsPage: page,
        });
        return;
      }

      this.setData({ eventsPageLoading: true });
      try {
        const iso = page === 1 ? '&include_featured_isotope=1' : '';
        const res = await this.request({
          url: `/event/club_public/${this.data.clubId}/list/all?mode=page&page=${page}${iso}`,
        });
        if (!this._apiOk(res)) return;
        const rows = res.data.events || res.data.records || [];
        const list = rows.map((e) => this.normClubPublicEvent(e));
        this._eventsPageCache[page] = list;
        let featured = this.data.featuredEvent;
        if (page === 1) {
          featured = await this.applyFeaturedForPage1(list, res.data);
        }
        this.setData({
          featuredEvent: page === 1 ? featured : this.data.featuredEvent,
          eventsCurrentPage: list,
          eventsPage: res.data.pagination?.current_page || page,
          eventsTotalPages: res.data.pagination?.total_pages || total,
        });
      } finally {
        this.setData({ eventsPageLoading: false });
      }
    },

    onEventsPagePrev() {
      const p = this.data.eventsPage;
      if (p <= 1 || this.data.eventsPageLoading) return;
      this.loadEventsPage(p - 1);
    },

    onEventsPageNext() {
      const p = this.data.eventsPage;
      if (p >= this.data.eventsTotalPages || this.data.eventsPageLoading) return;
      this.loadEventsPage(p + 1);
    },

    _fileUrlFromMomentFile(f) {
      if (!f) return '';
      return f.fileUrl || f.file_url || '';
    },

    /** isotope 兜底：/moment/event/:id 分页（与 event-joined-panel 一致） */
    async fetchEventMomentsForIsotope(eventId, maxPages = 3) {
      const out = [];
      for (let p = 1, total = 1; p <= maxPages && p <= total; p++) {
        try {
          const r = await this.request({
            url: `/moment/event/${eventId}?mode=page&page=${p}`
          });
          if (!this._apiOk(r)) break;
          const d = r.data || {};
          out.push(...(d.moments || []));
          total = d.pagination?.total_pages || 1;
        } catch {
          break;
        }
      }
      return out;
    },

    /** isotope 二维数组 [图片组, 成员组]：列表图 + moment 图 + 成员头像 */
    buildFeaturedEventIsotopeData(event, eventMoments, eventParticipants) {
      const eid = event.event_id || 'featured';
      const toThumb = (url, size) => {
        if (!url) return '';
        return getApp().convertToThumbnailUrl(url, size);
      };
      const seen = new Set();
      const pushUrl = (arr, url, meta) => {
        if (!url || seen.has(url)) return;
        seen.add(url);
        arr.push(meta);
      };

      const coverGroup = [];
      const coverThumb = event.cover_url_thumb;
      const coverRaw = event.cover_url;
      const imgs = event.event_imgs || [];
      const firstImgUrl = imgs.length
        ? typeof imgs[0] === 'string'
          ? imgs[0]
          : imgs[0].fileUrl || imgs[0].url || imgs[0].file_url || ''
        : '';
      const coverCanonical = coverRaw || firstImgUrl || '';

      if (coverThumb || coverRaw) {
        const u = coverThumb || toThumb(coverRaw, 200);
        pushUrl(coverGroup, coverRaw || u, {
          id: `${eid}-cover`,
          image: u,
          type: 'cover',
          ini_width: 200,
          ini_height: 200
        });
      } else if (firstImgUrl) {
        const u = toThumb(firstImgUrl, 200);
        pushUrl(coverGroup, firstImgUrl, {
          id: `${eid}-cover`,
          image: u,
          type: 'cover',
          ini_width: 200,
          ini_height: 200
        });
      }

      imgs.slice(0, 8).forEach((raw, i) => {
        const url = typeof raw === 'string' ? raw : raw && (raw.fileUrl || raw.url || raw.file_url);
        if (!url) return;
        if (coverCanonical && url === coverCanonical) return;
        pushUrl(coverGroup, url, {
          id: `${eid}-list-${i}`,
          image: toThumb(url, 150),
          type: 'event_img',
          ini_width: 150,
          ini_height: 150
        });
      });

      if (Array.isArray(eventMoments) && eventMoments.length) {
        let tile = 0;
        eventMoments.forEach((mom, mi) => {
          const files = mom.image_files || [];
          files.forEach((f, fi) => {
            if (coverGroup.length >= 14) return;
            const url = this._fileUrlFromMomentFile(f);
            if (!url) return;
            pushUrl(coverGroup, url, {
              id: `${eid}-mom-${mi}-${fi}-${tile++}`,
              image: toThumb(url, 150),
              type: 'moment',
              ini_width: 150,
              ini_height: 150
            });
          });
        });
      }

      const myId = wx.getStorageSync('userInfo') && wx.getStorageSync('userInfo').id;
      const stillIn = this._userActivelyJoinedEvent(event);
      const participantsForIso = (eventParticipants || []).filter((m) => {
        const uid = m && (m.user_id ?? m.userID);
        if (!stillIn && myId != null && uid != null && String(uid) === String(myId)) {
          return false;
        }
        return !!m;
      });
      const memberGroup = participantsForIso.slice(0, 12).map((m, i) => {
        const uid = m.user_id || m.userID;
        const av = m.avatar;
        if (!av) return null;
        return {
          id: `${eid}-mem-${uid != null ? uid : i}`,
          image: toThumb(av, 100),
          type: 'member',
          ini_width: 100,
          ini_height: 100
        };
      }).filter(Boolean);

      const groups = [coverGroup, memberGroup].filter((g) => Array.isArray(g) && g.length > 0);
      return groups.length ? groups : [];
    },

    /** 当前用户是否仍在该活动中（未退活动、参与记录未软删）；与 club_public 字段一致 */
    _userActivelyJoinedEvent(ev) {
      if (!ev) return false;
      if (ev.join_is_delete) return false;
      return !!(
        ev.cur_user_is_joined ||
        ev.cur_user_join_date ||
        ev.joined_date
      );
    },

    // 设置活动状态和按钮
    setEventStatus(event) {
      const hasStarted = !!event.actual_startTime;
      const hasEnded = !!event.actual_endTime;

      if (hasEnded) {
        event.statusText = '已结';
        event.statusClass = 'status-ended';
        event.showButton = false;
      } else if (hasStarted) {
        event.statusText = '正在进行';
        event.statusClass = 'status-ongoing';
        event.showButton = false;
      } else {
        event.statusText = '预计开';
        event.statusClass = 'status-upcoming';
        if (this._userActivelyJoinedEvent(event)) {
          event.showButton = false;
        } else {
          event.showButton = true;
          event.buttonText = '参加';
          event.buttonTheme = 'primary';
          event.buttonAction = 'join';
        }
      }
    },

    // 请求封装
  request({ url, method = 'GET', data }) {
      return new Promise((resolve, reject) => {
        wx.request({
          url: app.globalData.request_url + url,
          method,
          data,
          header: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + wx.getStorageSync('token'),
          },
          success: (res) => resolve(res.data),
          fail: reject
        });
      });
    },

    // 点击活动 - 打开嵌套弹窗
    onEventTap(e) {
      const eventId = e.currentTarget.dataset.eventId;
      
      // 获取点击坐标
      let tapX, tapY;
      const touch = e.changedTouches && e.changedTouches[0];
      if (touch) {
        tapX = touch.clientX;
        tapY = touch.clientY;
      } else {
        const sys = wx.getSystemInfoSync();
        tapX = sys.windowWidth / 2;
        tapY = sys.windowHeight / 2;
      }
      
      const fe = this.data.featuredEvent;
      const fromList = (this.data.eventsCurrentPage || []).find((x) => String(x.event_id) === String(eventId));
      const ev =
        fe && String(fe.event_id) === String(eventId) ? fe : fromList;

      if (this._userActivelyJoinedEvent(ev)) {
        this.openNestedEventJoined(eventId, tapX, tapY);
      } else {
        this.openNestedEventDetail(eventId, tapX, tapY);
      }
    },

    // 活动操作（仅参加；打卡请进入 event-joined-panel）
    async onEventAction(e) {
      // 安全检查：确保 stopPropagation 方法存在
      if (e && typeof e.stopPropagation === 'function') {
        e.stopPropagation();
      }
      const eventId = e.currentTarget.dataset.eventId;
      const action = e.currentTarget.dataset.action;

      if (action === 'join') {
        await this.joinEvent(eventId);
      }
    },

    // 参加活动
    async joinEvent(eventId) {
      try {
        wx.showLoading({ title: '加入?..' });
        const res = await this.request({ url: `/event/${eventId}/join` });
        wx.hideLoading();
        
        if (this._apiOk(res)) {
          wx.showToast({ title: '加入成功', icon: 'success' });
          this.loadClubData();
        } else {
          throw new Error(res.message || '加入失败');
        }
      } catch (error) {
        wx.hideLoading();
        wx.showToast({ title: error.message || '加入失败', icon: 'none' });
      }
    },

    // 查看协会详情
  viewClubDetail() {
      this.triggerEvent('navigateClub', { clubId: this.data.clubId });
    },

    // 退出协数
      quitClub() {
      wx.showModal({
        title: '确认退',
        content: '确定要退出这个协会吗',
        confirmText: '退',
        confirmColor: '#ff4d4f',
        success: async (res) => {
          if (res.confirm) {
            try {
              wx.showLoading({ title: '处理?..' });
              const result = await this.request({
                url: `/club/${this.data.clubId}/quit`,
                method: 'GET'
              });
              wx.hideLoading();
              
              if (this._apiOk(result)) {
                wx.showToast({ title: '退出成', icon: 'success' });
                
                // 记录变更
                app.recordChange(this.data.clubId, 'update', { 
                  type: 'club',
                  cur_user_is_member: false 
                }, this);
                
                setTimeout(() => {
                  this.triggerEvent('close');
                }, 1500);
              } else {
                wx.showToast({ title: result.message || '退出失', icon: 'none' });
              }
            } catch (e) {
              wx.hideLoading();
              wx.showToast({ title: '网络错误', icon: 'none' });
            }
          }
        }
      });
    },

    // ========= 嵌套弹窗方法 =========
    
    /**
     * 打开活动详情弹窗
     */
    openNestedEventDetail(eventId, tapX, tapY) {
      this.setData({
        nestedEventDetail: {
          visible: true,
          loading: true,
          renderPanel: false,
          eventId,
          tapX,
          tapY
        }
      }, () => {
        setTimeout(() => {
          const popup = this.selectComponent('#nestedEventDetailPopup');
          if (popup && popup.expand) {
            popup.expand(tapX, tapY);
          }
        }, 50);
      });
    },

    /**
     * 活动详情弹窗内容准备好
     */
    onNestedEventDetailContentReady() {
      console.log('活动详情弹窗contentReady，开始渲染panel');
      this.setData({
        'nestedEventDetail.renderPanel': true
      }, () => {
        setTimeout(() => {
          const panel = this.selectComponent('#nestedEventDetailPanel');
          if (panel && panel.loadData) {
            panel.loadData();
          }
        }, 100);
      });
    },

    /**
     * 活动详情弹窗加载完成
     */
    onNestedEventDetailLoaded() {
      this.setData({
        'nestedEventDetail.loading': false
      });
    },

    /** 加入活动等：刷新本协会活动列表并通知外层（clubs-panel / profile） */
    async onNestedEventDetailUpdate() {
      try {
        await this.loadClubData();
      } catch (e) {}
      this.triggerEvent('update');
    },

    /** 退出活动等：同上 */
    async onNestedEventJoinedUpdate() {
      try {
        await this.loadClubData();
      } catch (e) {}
      this.triggerEvent('update');
    },

    /**
     * 关闭活动详情弹窗
     */
    closeNestedEventDetail() {
      const popup = this.selectComponent('#nestedEventDetailPopup');
      if (popup && popup.collapse) {
        popup.collapse();
      }
    },

    /**
     * 活动详情弹窗收起回调
     */
    onNestedEventDetailCollapse() {
      setTimeout(() => {
        this.setData({
          'nestedEventDetail.visible': false,
          'nestedEventDetail.loading': true,
          'nestedEventDetail.renderPanel': false,
          'nestedEventDetail.eventId': ''
        });
      }, 800);
    },

    /**
     * 打开活动参加弹窗
     */
    openNestedEventJoined(eventId, tapX, tapY) {
      this.setData({
        nestedEventJoined: {
          visible: true,
          loading: true,
          renderPanel: false,
          eventId,
          tapX,
          tapY
        }
      }, () => {
        setTimeout(() => {
          const popup = this.selectComponent('#nestedEventJoinedPopup');
          if (popup && popup.expand) {
            popup.expand(tapX, tapY);
          }
        }, 50);
      });
    },

    /**
     * 活动参加弹窗内容准备好
     */
    onNestedEventJoinedContentReady() {
      console.log('活动参加弹窗contentReady，开始渲染panel');
      this.setData({
        'nestedEventJoined.renderPanel': true
      }, () => {
        setTimeout(() => {
          const panel = this.selectComponent('#nestedEventJoinedPanel');
          if (panel && panel.loadData) {
            panel.loadData();
          }
        }, 100);
      });
    },

    /**
     * 活动参加弹窗加载完成
     */
    onNestedEventJoinedLoaded() {
      this.setData({
        'nestedEventJoined.loading': false
      });
    },

    /**
     * 关闭活动参加弹窗
     */
    closeNestedEventJoined() {
      const popup = this.selectComponent('#nestedEventJoinedPopup');
      if (popup && popup.collapse) {
        popup.collapse();
      }
    },

    /**
     * 活动参加弹窗收起回调
     */
    onNestedEventJoinedCollapse() {
      // 刷新数据
      this.loadClubData();
      
      setTimeout(() => {
        this.setData({
          'nestedEventJoined.visible': false,
          'nestedEventJoined.loading': true,
          'nestedEventJoined.renderPanel': false,
          'nestedEventJoined.eventId': ''
        });
      }, 800);
    }
  }
});
