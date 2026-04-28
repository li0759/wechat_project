Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    events: {
      type: Array,
      value: []
    },
    minDate: {
      type: null,
      value: new Date(new Date().getFullYear() - 1, 0, 1).getTime()
    },
    maxDate: {
      type: null,
      value: new Date(new Date().getFullYear() + 1, 11, 31).getTime()
    }
  },

  data: {
    weeks: ['日', '一', '二', '三', '四', '五', '六'],
    days: [],
    emptyGrids: [],
    lastEmptyGrids: [],
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
    currentDay: new Date().getDate(),
    selectedYear: new Date().getFullYear(),
    selectedMonth: new Date().getMonth() + 1,
    selectedDay: new Date().getDate(),
    currentEvents: [],
    selectedDate: null,
    yearMonthMode: 'month',
    timeEditYearMonth: '',
    ymPickerStart: '2020-01',
    ymPickerEnd: '2030-12'
  },

  observers: {
    show(show) {
      if (show) {
        this.refreshYmBounds();
        this.syncTimeEditYearMonth();
        this.calculateDays(this.data.selectedYear, this.data.selectedMonth);
      }
    },
    events() {
      if (this.data.selectedYear && this.data.selectedMonth) {
        this.calculateDays(this.data.selectedYear, this.data.selectedMonth);
      }
    }
  },

  methods: {
    pad2(n) {
      return String(n).padStart(2, '0');
    },

    refreshYmBounds() {
      const minTs = Number(this.properties.minDate);
      const maxTs = Number(this.properties.maxDate);
      const minD = new Date(Number.isFinite(minTs) ? minTs : Date.now());
      const maxD = new Date(Number.isFinite(maxTs) ? maxTs : Date.now());
      const minY = minD.getFullYear();
      const maxY = maxD.getFullYear();
      this.setData({
        ymPickerStart: `${minY}-01`,
        ymPickerEnd: `${maxY}-12`
      });
    },

    syncTimeEditYearMonth() {
      const y = this.data.selectedYear;
      const m = this.pad2(this.data.selectedMonth);
      this.setData({ timeEditYearMonth: `${y}-${m}` });
    },

    onYearMonthEcExpand() {
      this.refreshYmBounds();
      this.syncTimeEditYearMonth();
    },

    normalizeYmValue(raw) {
      if (raw == null || raw === '') return '';
      if (typeof raw === 'string') return raw.slice(0, 7);
      if (Array.isArray(raw) && raw.length >= 2) {
        const y = raw[0];
        const mo = this.pad2(raw[1]);
        return `${y}-${mo}`;
      }
      return String(raw).slice(0, 7);
    },

    onYmPick(e) {
      const v = this.normalizeYmValue(e?.detail?.value);
      if (v) this.setData({ timeEditYearMonth: v });
    },

    onYmChange(e) {
      const v = this.normalizeYmValue(e?.detail?.value);
      if (v) this.setData({ timeEditYearMonth: v });
    },

    onYmConfirm(e) {
      const v = this.normalizeYmValue(e?.detail?.value);
      if (v) this.setData({ timeEditYearMonth: v });
    },

    parseYearMonth(str) {
      const s = String(str || '').trim();
      const m = s.match(/^(\d{4})-(\d{1,2})/);
      if (!m) return null;
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10);
      if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return null;
      return { year: y, month: mo };
    },

    confirmCalYearMonth() {
      const parsed = this.parseYearMonth(this.data.timeEditYearMonth);
      if (!parsed) {
        wx.showToast({ title: '请选择有效年月', icon: 'none' });
        return;
      }
      const { year: newYear, month: newMonth } = parsed;
      this.setData({
        selectedYear: newYear,
        selectedMonth: newMonth
      });
      this.calculateDays(newYear, newMonth);
      this.triggerMonthChangeEvent(newYear, newMonth);
      this.selectComponent('#calYearMonthEc')?.collapse?.();
    },

    calculateDays(year, month) {
      const days = [];
      const thisMonthDays = this.getThisMonthDays(year, month);
      for (let i = 1; i <= thisMonthDays; i++) {
        const dateStr = `${year}/${month}/${i}`;
        const date = new Date(dateStr);
        const timestamp = date.getTime();
        const dayEvents = this.getEventsForDay(timestamp);
        const hasEvents = dayEvents.length > 0;
        days.push({
          day: i,
          date: timestamp,
          events: dayEvents,
          hasEvents,
          eventCount: dayEvents.length,
          isToday: this.isToday(year, month, i)
        });
      }
      const firstDayOfWeek = this.getFirstDayOfWeek(year, month);
      const emptyGrids = Array.from({ length: firstDayOfWeek }, (_, i) => i);
      const lastDayOfWeek = this.getLastDayOfWeek(year, month);
      const lastEmptyGrids = Array.from({ length: 6 - lastDayOfWeek }, (_, i) => i);
      this.setData({
        days,
        emptyGrids,
        lastEmptyGrids
      });
    },

    getThisMonthDays(year, month) {
      return new Date(year, month, 0).getDate();
    },

    getFirstDayOfWeek(year, month) {
      return new Date(Date.UTC(year, month - 1, 1)).getDay();
    },

    getLastDayOfWeek(year, month) {
      const thisMonthDays = this.getThisMonthDays(year, month);
      return new Date(Date.UTC(year, month - 1, thisMonthDays)).getDay();
    },

    isToday(year, month, day) {
      const today = new Date();
      return year === today.getFullYear() && month === today.getMonth() + 1 && day === today.getDate();
    },

    getEventsForDay(timestamp) {
      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = date.getMonth();
      const day = date.getDate();
      const startOfDay = new Date(year, month, day, 0, 0, 0).getTime();
      const endOfDay = new Date(year, month, day, 23, 59, 59).getTime();
      return this.data.events.filter((event) => {
        const eventTime = new Date(event.active_time).getTime();
        return eventTime >= startOfDay && eventTime <= endOfDay;
      });
    },

    onPrevMonth() {
      let newMonth = this.data.selectedMonth - 1;
      let newYear = this.data.selectedYear;
      if (newMonth < 1) {
        newMonth = 12;
        newYear -= 1;
      }
      this.setData({ selectedYear: newYear, selectedMonth: newMonth });
      this.calculateDays(newYear, newMonth);
      this.syncTimeEditYearMonth();
      this.triggerMonthChangeEvent(newYear, newMonth);
    },

    onNextMonth() {
      let newMonth = this.data.selectedMonth + 1;
      let newYear = this.data.selectedYear;
      if (newMonth > 12) {
        newMonth = 1;
        newYear += 1;
      }
      this.setData({ selectedYear: newYear, selectedMonth: newMonth });
      this.calculateDays(newYear, newMonth);
      this.syncTimeEditYearMonth();
      this.triggerMonthChangeEvent(newYear, newMonth);
    },

    onDayTouchEnd(e) {
      const index = e.currentTarget.dataset.index;
      const day = this.data.days[index];
      if (!day) return;
      let tapX;
      let tapY;
      if (e.changedTouches && e.changedTouches[0]) {
        tapX = e.changedTouches[0].clientX;
        tapY = e.changedTouches[0].clientY;
      } else {
        const sys = wx.getSystemInfoSync();
        tapX = sys.windowWidth / 2;
        tapY = sys.windowHeight / 2;
      }
      this.setData({ selectedDay: day.day });
      this.triggerEvent('select', {
        date: day.date,
        events: day.events
      });
      const formattedEvents = (day.events || []).map((event) => {
        const eventDate = new Date(event.active_time);
        const hours = String(eventDate.getHours()).padStart(2, '0');
        const minutes = String(eventDate.getMinutes()).padStart(2, '0');
        return { ...event, formatted_time: `${hours}:${minutes}` };
      });
      this.setData(
        {
          currentEvents: formattedEvents,
          selectedDate: day.date
        },
        () => {
          setTimeout(() => {
            const ec = this.selectComponent('#calEventListEc');
            if (ec && ec.expand) ec.expand(tapX, tapY);
          }, 50);
        }
      );
    },

    onEventItemClick(e) {
      const idx = e.currentTarget.dataset.index;
      const event = this.data.currentEvents[idx];
      if (!event) return;
      if (event.url) {
        wx.navigateTo({ url: event.url });
        this.closeEventListEc();
      }
    },

    closeEventListEc() {
      this.selectComponent('#calEventListEc')?.collapse?.();
    },

    onEventListCollapse() {
      this.setData({ currentEvents: [] });
    },

    triggerMonthChangeEvent(year, month) {
      this.triggerEvent('monthChange', { year, month });
    },

    formatDateTime(timestamp) {
      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = this.padZero(date.getMonth() + 1);
      const day = this.padZero(date.getDate());
      const hour = this.padZero(date.getHours());
      const minute = this.padZero(date.getMinutes());
      return `${year}-${month}-${day} ${hour}:${minute}`;
    },

    padZero(num) {
      return num < 10 ? `0${num}` : String(num);
    }
  },

  lifetimes: {
    attached() {
      this.refreshYmBounds();
      this.syncTimeEditYearMonth();
      this.calculateDays(this.data.selectedYear, this.data.selectedMonth);
    }
  }
});
