const app = getApp();

Component({
  properties: {
    clubId: {
      type: String,
      value: ''
    },
    /** 为 true 时点击活动卡片由宿主页 globalPopup 栈打开，不再在组件内嵌套全屏 */
    delegateNestedToHost: {
      type: Boolean,
      value: false
    }
  },

  data: {
    loading: true,
    contentSuspended: false,
    contentSuspendMode: '',
    club: null,
    clubMembers: [],
    /** 与 club-joined-panel：GET club_public 列表 + 逐条 GET /event/:id 合并后的活动卡片 */
    detailEventsList: [],
    detailEventsEmpty: true,
    detailEventsPage: 1,
    detailEventsTotalPages: 1,
    swiperImages: [],
    swiperImagesThumbs: [],
    currentSwiperIndex: 0,
    
    // 导航相关
    activeSection: 'info',
    sectionTabs: [
      { label: '信息', value: 'info' },
      { label: '人员', value: 'members' },
      { label: '活动', value: 'activities' }
    ],
    scrollIntoView: '',

    /** 与 club-joined-panel 特色活动 isotope 一致 */
    masonryHorizontalConfig: { rowHeight: 10 },
    
    // 图片预览
    showImageViewer: false,
    previewImages: [],
    previewIndex: 0,

    // 嵌套活动详情弹窗（点击活动卡片弹出）
    nestedEventDetail: {
      visible: false,
      loading: true,
      renderPanel: false,
      eventId: '',
      tapX: 0,
      tapY: 0
    }
  },

  observers: {
    'clubId': function(clubId) {
      const isPlaceholder = !clubId || clubId.startsWith('placeholder');
      if (isPlaceholder) {
        this._lastClubId = null;
        this._loaded = false;
        this.setData({ loading: false, club: null, detailEventsList: [], detailEventsEmpty: true });
        return;
      }
      // 只记?clubId，不自动加载数据（懒加载数
      if (clubId !== this._lastClubId) {
        this._lastClubId = clubId;
        this._loaded = false;
        // 如果已经展开过，则重新加数
      if (this._hasExpanded) {
          this.loadClubData();
        }
      }
    }
  },

  lifetimes: {
    attached() {
      this._loaded = false;
      this._hasExpanded = false;
    }
  },

  methods: {
    _apiOk(r) {
      return r && (r.Flag == '4000' || r.Flag == 4000);
    },

    /** 与 club-joined-panel normClubPublicEvent 一致 */
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
      let cover_url_thumb = '';
      if (coverRaw) cover_url_thumb = app.convertToThumbnailUrl(coverRaw, 150);
      else if (event.event_imgs?.length) {
        const first = event.event_imgs[0];
        const u = typeof first === 'string' ? first : first?.fileUrl || first?.url || '';
        if (u) cover_url_thumb = app.convertToThumbnailUrl(u, 150);
      }
      return {
        ...event,
        cover_url: coverRaw,
        location: location || event.location,
        mapImageUrl,
        cover_url_thumb,
        loading: false
      };
    },

    // 懒加载入口：供外部调用，只有弹窗展开时才加载数据
  loadData() {
      this._hasExpanded = true;
      if (this._loaded) return Promise.resolve();
      if (!this.data.clubId || this.data.clubId.startsWith('placeholder')) {
        return Promise.resolve();
      }
      this._loaded = true;
      return this.loadClubData();
    },

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

    async loadClubData() {
      this.setData({
        loading: true,
        detailEventsList: [],
        detailEventsEmpty: true
      });
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
          await this.processClubData(club);
          
          const membersRaw = this._apiOk(membersRes) ? membersRes.data?.members || [] : [];
          this.setData({ clubMembers: membersRaw });

          if (this._apiOk(eventsRes)) {
            await this.processDetailEventsData(club, eventsRes.data);
          } else {
            await this.processDetailEventsData(club, { records: [], pagination: {} });
          }
          
          this.setData({ loading: false });
          this.triggerEvent('loaded');
        } else {
          throw new Error(clubRes.message || '加载失败');
        }
      } catch (e) {
        this.setData({
          loading: false,
          club: null,
          detailEventsList: [],
          detailEventsEmpty: true
        });
        this.triggerEvent('loaded');
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    },

    async processClubData(club) {
      club.isDelete = club.is_deleted || false;
      console.log(club);
    if (club.president) {
        club.president_id = club.president?.user?.userID || null;
        club.president_username = club.president?.user?.userName || null;
        club.president_avatar = club.president?.user?.avatar?.fileUrl || null;
      }
      club.content = club.message || club.content || club.description || '';

      const swiperImages = [];
      const swiperImagesThumbs = [];
      if (club.cover_url) {
        swiperImages.push({ url: club.cover_url, type: 'cover' });
        swiperImagesThumbs.push({ url: app.convertToThumbnailUrl(club.cover_url, 100), type: 'cover' });
      }
      
      this.setData({ club, swiperImages, swiperImagesThumbs });
    },

    _fileUrlFromMomentFile(f) {
      if (!f) return '';
      return f.fileUrl || f.file_url || '';
    },

    /** 与 club-joined-panel fetchEventMomentsForIsotope 一致 */
    async fetchEventMomentsForIsotope(eventId, maxPages = 3) {
      const out = [];
      for (let p = 1, total = 1; p <= maxPages && p <= total; p++) {
        try {
          const r = await this.request({ url: `/moment/event/${eventId}?mode=page&page=${p}` });
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

    /** 与 club-joined-panel buildFeaturedEventIsotopeData 一致 */
    buildPanelEventIsotopeData(event, eventMoments, eventParticipants) {
      const eid = event.event_id || 'detail';
      const toThumb = (url, size) => (url ? app.convertToThumbnailUrl(url, size) : '');
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
          (mom.image_files || []).forEach((f, fi) => {
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

      const memberGroup = (eventParticipants || []).slice(0, 12).map((m, i) => {
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

    /** GET /event/:id 合并到 club_public 行（含 event_imgs、时间、打卡等） */
    mergeEventDetailRow(row, d) {
      const out = { ...row };
      if (!d || typeof d !== 'object') return this.normClubPublicEvent(out);
      if (d.title) out.title = d.title;
      if (d.content != null) out.content = d.content;
      out.pre_startTime = d.pre_startTime ?? out.pre_startTime;
      out.pre_endTime = d.pre_endTime ?? out.pre_endTime;
      out.actual_startTime = d.actual_startTime ?? out.actual_startTime;
      out.actual_endTime = d.actual_endTime ?? out.actual_endTime;
      out.join_count = d.join_count != null ? d.join_count : out.join_count;
      out.cur_user_is_joined = d.cur_user_is_joined;
      out.cur_user_clockin_date = d.cur_user_clockin_date;
      out.is_ended = d.is_ended;
      if (d.cover_url) out.cover_url = d.cover_url;
      if (d.premap_url) out.premap_url = d.premap_url;
      if (d.location_data) out.location_data = d.location_data;
      if (d.location != null) out.location = d.location;
      const urls = [];
      const seen = new Set();
      const pushU = (u) => {
        if (!u || typeof u !== 'string' || seen.has(u)) return;
        seen.add(u);
        urls.push(u);
      };
      (row.event_imgs || []).forEach((x) =>
        pushU(typeof x === 'string' ? x : x?.fileUrl || x?.file_url || x?.url)
      );
      (d.event_imgs || []).forEach((x) => pushU(x?.fileUrl || x?.file_url));
      (d.first_moment_imgs || []).forEach((x) => pushU(x?.fileUrl || x?.file_url));
      out.event_imgs = urls;
      return this.normClubPublicEvent(out);
    },

    /** 与 club-joined-panel setEventStatus 一致；详情卡片不展示操作按钮 */
    setPanelEventStatus(event) {
      const hasStarted = !!event.actual_startTime;
      const hasEnded = !!event.actual_endTime || event.is_ended;
      if (hasEnded) {
        event.statusText = '已结';
        event.statusClass = 'status-ended';
      } else if (hasStarted) {
        event.statusText = '正在进行';
        event.statusClass = 'status-ongoing';
      } else {
        event.statusText = '预计开';
        event.statusClass = 'status-upcoming';
      }
      event.showButton = false;
    },

    /**
     * 单条：GET /event/:id 详情 + 成员/动态 isotope（与 club-joined 一致优先 featured_isotope）
     */
    async enrichOneEvent(row, featuredIso) {
      const eid = row.event_id;
      const isoHit =
        featuredIso &&
        String(featuredIso.event_id ?? featuredIso.eventID) === String(eid)
          ? featuredIso
          : null;

      const detailP = this.request({ url: `/event/${eid}` });
      const membersP = isoHit
        ? Promise.resolve({ Flag: 4000, data: { members: isoHit.members || [] } })
        : this.request({ url: `/event/${eid}/members` });

      const [detRes, memRes] = await Promise.all([detailP, membersP]);
      const d = this._apiOk(detRes) ? detRes.data || {} : {};
      const participants = this._apiOk(memRes) ? memRes.data?.members || [] : [];

      let moments = [];
      if (isoHit && Array.isArray(isoHit.moments)) {
        moments = isoHit.moments;
      } else {
        moments = await this.fetchEventMomentsForIsotope(eid);
      }

      const merged = this.mergeEventDetailRow(row, d);
      merged.isotopeData = this.buildPanelEventIsotopeData(merged, moments, participants);
      this.setPanelEventStatus(merged);
      return merged;
    },

    buildSwiperFromClubAndEvents(club, events) {
      const swiperImages = [];
      const swiperImagesThumbs = [];
      if (club && club.cover_url) {
        swiperImages.push({ url: club.cover_url, type: 'cover' });
        swiperImagesThumbs.push({ url: app.convertToThumbnailUrl(club.cover_url, 100), type: 'cover' });
      }
      const first = events && events[0];
      const imgs = first && first.event_imgs;
      if (imgs && imgs.length) {
        const max = Math.min(imgs.length, 5);
        for (let i = 0; i < max; i++) {
          const u = typeof imgs[i] === 'string' ? imgs[i] : imgs[i]?.fileUrl || imgs[i]?.file_url;
          if (!u) continue;
          swiperImages.push({ url: u, type: 'moment' });
          swiperImagesThumbs.push({ url: app.convertToThumbnailUrl(u, 100), type: 'moment' });
        }
      }
      return { swiperImages, swiperImagesThumbs };
    },

    /** club_public 首屏 + 每条 GET /event/:id（与 club-joined-panel 数据流对齐） */
    async processDetailEventsData(club, data) {
      const raw = data.events || data.records || [];
      if (!raw.length) {
        const sw = this.buildSwiperFromClubAndEvents(club, []);
        this.setData({
          detailEventsList: [],
          detailEventsEmpty: true,
          detailEventsPage: 1,
          detailEventsTotalPages: 1,
          swiperImages: sw.swiperImages,
          swiperImagesThumbs: sw.swiperImagesThumbs
        });
        return;
      }

      const list = raw.map((e) => this.normClubPublicEvent(e));
      const iso = data.featured_isotope || null;
      const enriched = await Promise.all(list.map((row) => this.enrichOneEvent(row, iso)));
      const sw = this.buildSwiperFromClubAndEvents(club, enriched);
      this.setData({
        detailEventsList: enriched,
        detailEventsEmpty: false,
        detailEventsPage: data.pagination?.current_page || 1,
        detailEventsTotalPages: data.pagination?.total_pages || 1,
        swiperImages: sw.swiperImages,
        swiperImagesThumbs: sw.swiperImagesThumbs
      });
    },

    // 导航切换
  onSectionNavTap(e) {
      const section = e.currentTarget.dataset.section;
      this.setData({ 
        activeSection: section,
        scrollIntoView: `section-${section}`
      });
      setTimeout(() => {
        this.setData({ scrollIntoView: '' });
      }, 100);
    },

    onMainScroll(e) {
      if (this._scrollTimer) {
        clearTimeout(this._scrollTimer);
      }
      this._scrollTimer = setTimeout(() => {
        this.updateActiveSection();
      }, 50);
    },

    updateActiveSection() {
      const query = this.createSelectorQuery();
      const sections = ['info', 'members', 'activities'];
      
      sections.forEach(section => {
        query.select(`#section-${section}`).boundingClientRect();
      });
      
      query.exec((res) => {
        if (!res || res.length === 0) return;
        
        let activeSection = 'info';
        const threshold = 150;
        
        for (let i = res.length - 1; i >= 0; i--) {
          if (res[i] && res[i].top <= threshold) {
            activeSection = sections[i];
            break;
          }
        }
        
        if (activeSection !== this.data.activeSection) {
          this.setData({ activeSection });
        }
      });
    },

    // 轮播数
      onSwiperChange(e) {
      this.setData({ currentSwiperIndex: e.detail.current });
    },

    onThumbTap(e) {
      this.setData({ currentSwiperIndex: e.currentTarget.dataset.index });
    },

    previewImage(e) {
      const index = e.currentTarget.dataset.index;
      const images = this.data.swiperImages.map(item => item.url);
      this.setData({
        previewImages: images,
        previewIndex: index,
        showImageViewer: true
      });
    },

    closeImageViewer() {
      this.setData({ showImageViewer: false });
    },

    suspendContentToBlank() {
      this.setData({ contentSuspended: true, contentSuspendMode: 'blank' });
    },

    async resumeContentWithSkeletonReload() {
      this.setData({ contentSuspended: true, contentSuspendMode: 'skeleton' });
      try {
        if (this.data.clubId && typeof this.loadClubData === 'function') {
          await this.loadClubData();
        }
      } catch (e) {
        console.error('[club-detail-panel] resumeContentWithSkeletonReload failed:', e);
      } finally {
        this.setData({ contentSuspended: false, contentSuspendMode: '' });
      }
    },

    // 点击活动卡片：弹出活动详情（全屏弹窗）
    onClubActivityTap(e) {
      const eventId = e.currentTarget?.dataset?.eventId;
      if (!eventId) return;

      let tapX, tapY;
      const ct = e?.detail?.changedTouches?.[0] || e?.changedTouches?.[0];
      const t = e?.detail?.touches?.[0] || e?.touches?.[0];
      if (ct) {
        tapX = ct.clientX;
        tapY = ct.clientY;
      } else if (t) {
        tapX = t.clientX;
        tapY = t.clientY;
      } else {
        const sys = wx.getSystemInfoSync();
        tapX = sys.windowWidth / 2;
        tapY = sys.windowHeight / 2;
      }

      if (this.properties.delegateNestedToHost) {
        const popupType = e.currentTarget?.dataset?.popupType || 'event-detail';
        this.triggerEvent('navigateEvent', { eventId, popupType, tapX, tapY });
        return;
      }

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

    onNestedEventDetailContentReady() {
      this.setData({
        'nestedEventDetail.renderPanel': true
      }, () => {
        // 等待 panel 渲染后，触发其懒加载请求
        setTimeout(() => {
          const panel = this.selectComponent('#nestedEventDetailPanel');
          if (panel && panel.loadData) {
            panel.loadData();
          }
        }, 100);
      });
    },

    onNestedEventDetailLoaded() {
      this.setData({
        'nestedEventDetail.loading': false
      });
    },

    /** 加入活动后刷新协会详情中的活动列表 */
    async onNestedEventDetailUpdate() {
      try {
        await this.loadClubData();
      } catch (e) {}
      this.triggerEvent('update');
    },

    closeNestedEventDetail() {
      const popup = this.selectComponent('#nestedEventDetailPopup');
      if (popup && popup.collapse) popup.collapse();
    },

    onNestedEventDetailCollapse() {
      // 收起时不做任何操作，等待collapsed事件
    },

    onNestedEventDetailCollapsed() {
      setTimeout(() => {
        this.setData({
          nestedEventDetail: {
            visible: false,
            loading: true,
            renderPanel: false,
            eventId: '',
            tapX: 0,
            tapY: 0
          }
        });
      }, 300);
    },

    /** 退出协会：后端 GET /club/:id/quit（与 club-joined-panel 一致） */
    quitClub() {
      wx.showModal({
        title: '确认退出',
        content: '确定要退出该协会吗？退出后需重新申请才能加入。',
        confirmText: '退出',
        confirmColor: '#ff4d4f',
        success: async (res) => {
          if (!res.confirm) return;
          try {
            wx.showLoading({ title: '处理中...' });
            const result = await this.request({
              url: `/club/${this.data.clubId}/quit`,
              method: 'GET',
            });
            wx.hideLoading();
            if (result.Flag == '4000' || result.Flag == 4000) {
              wx.showToast({ title: '已退出协会', icon: 'success' });
              const club = { ...this.data.club };
              club.cur_user_is_member = false;
              this.setData({ club });
              app.recordChange(
                this.data.clubId,
                'update',
                { type: 'club', cur_user_is_member: false },
                this
              );
              this.triggerEvent('update', { clubId: this.data.clubId, quit: true });
              await this.loadClubData();
            } else {
              wx.showToast({ title: result.message || '退出失败', icon: 'none' });
            }
          } catch (e) {
            wx.hideLoading();
            wx.showToast({ title: '网络错误', icon: 'none' });
          }
        },
      });
    },

    // 申请加入协会
    async applyToJoin() {
      try {
        const res = await this.request({
          url: `/club/${this.data.clubId}/applicated`,
          loadingText: '申请数..'
        });
        if (res.Flag == '4000' || res.Flag == 4000) {
          wx.showToast({ title: '申请成功', icon: 'success' });
          const club = { ...this.data.club };
          club.cur_user_has_pending_application = true;
          this.setData({ club });
          
          // 发送消息通知
    if (res.data) {
            const message_data = {
              booker_id: res.data.president_id,
              url: `/packageClub/club-applications/index?clubId=${res.data.club_id}`,
              operation: 'user_applicated',
              text: '用户' + res.data.user_name + '向您管理' + res.data.club_name + '的协会发起了入会申请请尽快审'
            };
            await app.message(message_data);
          }
        } else {
          wx.showToast({ title: res.message || '申请失败', icon: 'none' });
        }
      } catch (e) {
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    },

    // 删除协会（超级用户）
  deleteClub() {
      wx.showModal({
        title: '确认删除',
        content: '确定要删除这个协会吗？此操作不可恢复?',
        confirmText: '删除',
        confirmColor: '#ff4d4f',
        success: async (res) => {
          if (res.confirm) {
            try {
              const result = await this.request({
                url: `/club/${this.data.clubId}/delete`,
                method: 'GET',
                loadingText: '删除?..'
              });
              if (result.Flag == '4000' || result.Flag == 4000) {
                wx.showToast({ title: '删除成功', icon: 'success' });
                
                // 记录删除变更到本地缓存（自动触发 triggerEvent数
      app.recordChange(this.data.clubId, 'delete', { type: 'club' }, this);
                
                // 关闭面板
                setTimeout(() => {
                  this.triggerEvent('close');
                }, 1500);
              } else {
                wx.showToast({ title: result.message || '删除失败', icon: 'none' });
              }
            } catch (e) {
              wx.showToast({ title: '网络错误', icon: 'none' });
            }
          }
        }
      });
    }
  }
});
