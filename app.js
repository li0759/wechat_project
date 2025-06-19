// app.js
App({
  onLaunch() {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 登录
    wx.login({
      success: res => {
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
      }
    })    
  },

   // 加入活动时，调用发布消息API
  async message(message_data) {
    return new Promise((resolve, reject) => {
      const token = wx.getStorageSync('token');
      // 调用发布通知API
      wx.request({
        url: this.globalData.request_url + `/message/create`,
        method: 'POST',
        header: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: {
          booker_id: message_data.booker_id,
          operation:message_data.operation,
          url: message_data.url,
          content: message_data.content
        },
        success: (res) => {
          if (res.data && res.data.Flag == 4000) {
            resolve('success')
          } else {
            reject(res.data.message || '消息生成失败');
          }
        },
        fail: (err) => {
          console.error('消息生成请求失败:', err);
          reject('网络请求失败');
        }
      })
    });
  },

  async message_for_club(message_data) {
    return new Promise((resolve, reject) => {
      const token = wx.getStorageSync('token');
      // 调用发布通知API
      wx.request({
        url: this.globalData.request_url + `/message/create/for_club/${ message_data.club_id}`,
        method: 'POST',
        header: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: {
          operation:message_data.operation,
          url: message_data.url,
          content: message_data.content
        },
        success: (res) => {
          if (res.data && res.data.Flag == 4000) {
            resolve('success')
          } else {
            reject(res.data.message || '消息生成失败');
          }
        },
        fail: (err) => {
          console.error('消息生成请求失败:', err);
          reject('网络请求失败');
        }
      })
    });
  },

  async message_for_event(message_data) {
    return new Promise((resolve, reject) => {
      const token = wx.getStorageSync('token');
      // 调用发布通知API
      wx.request({
        url: this.globalData.request_url + `/message/create/for_event/${message_data.event_id}`,
        method: 'POST',
        header: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: {
          operation:message_data.operation,
          url: message_data.url,
          content: message_data.content
        },
        success: (res) => {
          if (res.data && res.data.Flag == 4000) {
            resolve('success')
          } else {
            reject(res.data.message || '消息生成失败');
          }
        },
        fail: (err) => {
          console.error('消息生成请求失败:', err);
          reject('网络请求失败');
        }
      })
    });
  },

 /**
   * 格式化日期时间（最终版 V2 - 包含过去和未来友好格式，基于日历周）
   * 显示规则：
   * 1. 今天: 今天 HH:mm
   * 2. 昨天: 昨天 HH:mm
   * 3. 前天: 前天 HH:mm
   * 4. 明天: 明天 HH:mm
   * 5. 后天: 后天 HH:mm
   * 6. 本周内其他日期 (不含上述): 周X HH:mm (周一为一周开始)
   * 7. 其他(更早或更远): YYYY-MM-DD HH:mm
   */
  formatDateTime: function(dateInput) {
    // --- 辅助函数 Start (与之前版本相同) ---
    const parseDate = (d) => {
      if (typeof d === 'string') {
        const cleaned = d.split('.')[0].replace(' ', 'T') + '+08:00';
        try {
          return new Date(cleaned);
        } catch (e) {
          return new Date(NaN);
        }
      }
      try {
          const dt = new Date(d);
          return dt;
      } catch (e) {
          return new Date(NaN);
      }
    };

    const getDayStart = (d) => {
      const date = new Date(d.getTime());
      date.setHours(0, 0, 0, 0);
      return date;
    };

    const formatTime = (d) => {
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };

    const formatDate = (d) => {
      return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
    };
    // --- 辅助函数 End ---

    const targetDate = parseDate(dateInput);
    if (isNaN(targetDate.getTime())) {
      return '';
    }

    const now = new Date();
    const DAY_MS = 86400000; // 一天的毫秒数

    // --- 定义关键时间点 (基于本地时间零点) ---
    const todayStartMs = getDayStart(now).getTime();
    const yesterdayStartMs = todayStartMs - DAY_MS;
    const beforeYesterdayStartMs = todayStartMs - 2 * DAY_MS;

    const tomorrowStartMs = todayStartMs + DAY_MS;
    const dayAfterTomorrowStartMs = todayStartMs + 2 * DAY_MS;

    // --- 计算当前日历周的起止时间 (周一为一周开始) ---
    const currentDayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    // 计算距离本周一的天数偏移量 (周日算上周，偏移-6；周一偏移0；周二偏移-1...)
    const offsetToMonday = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
    const thisWeekMonday = new Date(now.getTime());
    thisWeekMonday.setDate(now.getDate() + offsetToMonday);
    const thisWeekStartMs = getDayStart(thisWeekMonday).getTime(); // 本周一 00:00:00 的毫秒数
    const nextWeekStartMs = thisWeekStartMs + 7 * DAY_MS; // 下周一 00:00:00 的毫秒数 (本周结束边界)

    const targetMs = targetDate.getTime();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

    // --- 逻辑判断 (优先级从近到远，最后处理本周) ---

    // 1. 今天
    if (targetMs >= todayStartMs && targetMs < tomorrowStartMs) {
      return `今天 ${formatTime(targetDate)}`;
    }
    // 2. 昨天
    else if (targetMs >= yesterdayStartMs && targetMs < todayStartMs) {
      return `昨天 ${formatTime(targetDate)}`;
    }
    // 3. 前天
    else if (targetMs >= beforeYesterdayStartMs && targetMs < yesterdayStartMs) {
      // 可以选择显示 "前天" 或直接进入周几逻辑
      return `前天 ${formatTime(targetDate)}`;
      // 或者:  // 进入下面的周几判断
    }
    // 4. 明天
    else if (targetMs >= tomorrowStartMs && targetMs < dayAfterTomorrowStartMs) {
      return `明天 ${formatTime(targetDate)}`;
    }
    // 5. 后天
    else if (targetMs >= dayAfterTomorrowStartMs && targetMs < (dayAfterTomorrowStartMs + DAY_MS) /* 后天结束边界 */) {
        return `后天 ${formatTime(targetDate)}`;
    }
    // 6. 判断是否在本周内 (且不属于上面已处理的特殊日期)
    else if (targetMs >= thisWeekStartMs && targetMs < nextWeekStartMs) {
      return `周${weekdays[targetDate.getDay()]} ${formatTime(targetDate)}`;
    }
    // 7. 其他 (本周之外的更早或更远日期)
    else {
      return `${formatDate(targetDate)} ${formatTime(targetDate)}`;
    }
  },

  globalData: {
    request_url:"https://www.vhhg.top/api/v1",
    //request_url:"http://127.0.0.1:5000/api/v1",
    key: '7IWBZ-YLWE7-M2EXW-H2J7E-2XW3Z-NSFBM',
    staticMapUrl: 'https://apis.map.qq.com/ws/staticmap/v2/',
    userInfo: null,
    defaultImages: {
      avatarUrl: '/assets/images/president/default-avatar.png',
      clubLogo: '/assets/images/president/club-logo.png',
      activityDefault: '/assets/images/president/activity-default.png'
    }
  }
})

