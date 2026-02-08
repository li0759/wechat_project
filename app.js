// app.js
  App({
  onLaunch() {
    // 登录
    wx.login({
      success: res => {
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
  }
    })    
  },
              
  
  globalData: {
    sky_system:{},
    sky_menu:{},
    request_url:"https://www.vhhg.top/api/v1",
    //request_url:"https://ghwtxh.msatmb.com:10443/api/v1",
    static_url:"https://ghwtxh.msatmb.com:10443",
    userInfo: null,
    defaultImages: {
      avatarUrl: '/assets/images/president/default-avatar.png',
      clubLogo: '/assets/images/president/club-logo.png',
      activityDefault: '/assets/images/president/activity-default.png'
    },
    // 分享相关全局变量
    shareInfo: {
      type: '', // 'event' | 'club'
      id: '',
      title: '',
      imageUrl: ''
    }
  },

  // 发布动态
  async createMomentWithParams({
    description,
    imageIds = [],
    refEventId = null,
    refClubId = null,
    throwError = false
  }) {
    const token = wx.getStorageSync('token');
    const url = this.globalData.request_url + `/moment/create`;

    const payload = {
      description: description,
      image_ids: imageIds,
      ref_event_id: refEventId,
      ref_club_id: refClubId
    };

    return new Promise((resolve, reject) => {
      wx.request({
        url,
        method: 'POST',
        header: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: payload,
        success: (res) => {
          if (res.data && res.data.Flag === 2000) {
            resolve(res.data.data);
          } else {
            const msg = (res.data && (res.data.message || res.data.msg)) || '创建动态失败';
            if (throwError) {
              reject(new Error(msg));
            } else {
              resolve(null);
            }
          }
        },
        fail: (err) => {
          if (throwError) {
            reject(err);
          } else {
            resolve(null);
          }
        }
      });
    });
  },

  // 加入活动时，调用发布消息API
  async message(message_data) {
    return new Promise((resolve, reject) => {
      const token = wx.getStorageSync('token');
      // 调用发布通知API
      wx.request({
        url: this.globalData.request_url + `/message/create/for_user/${message_data.booker_id}`,
        method: 'POST',
        header: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: {
          operation:message_data.operation,
          url: message_data.url,
          text: message_data.text,
          media: message_data.media?message_data.media:null
        },
        success: (res) => {
          if (res.data && res.data.Flag == 4000) {
            resolve('success')
          } else {
            reject(res.data.message || '消息生成失败');
          }
        },
        fail: (err) => {          reject('网络请求失败');
        }
      })
    });
  },

  async message_for_club(message_data) {    return new Promise((resolve, reject) => {
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
          text: message_data.text,
          media: message_data.media?message_data.media:null
        },
        success: (res) => {
          if (res.data && res.data.Flag == 4000) {
            resolve('success')
          } else {
            reject(res.data.message || '消息生成失败');
          }
        },
        fail: (err) => {          reject('网络请求失败');
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
          text: message_data.text,
          media: message_data.media?message_data.media:null
        },
        success: (res) => {
          if (res.data && res.data.Flag == 4000) {
            resolve('success')
          } else {
            reject(res.data.message || '消息生成失败');
          }
        },
        fail: (err) => {          reject('网络请求失败');
        }
      })
    });
  },

  // 统一变更记录（event/club通用）
  // context: 调用者的 this（可选），如果提供则自动触发 triggerEvent
  recordChange(id, action, data, context = null) {
    // data.type 需为 'event' | 'club'
    const changes = wx.getStorageSync('changes') || {};
    changes[id] = { type: data.type, action, data, timestamp: Date.now() };
    wx.setStorageSync('changes', changes);
    
    // 如果提供了 context，自动触发 triggerEvent（用于 events-panel/clubs-panel 即时更新）
    if (context && typeof context.triggerEvent === 'function') {
      if (data.type === 'event') {
        // 对于活动，传递完整的 event 对象
        const eventData = context.data?.event || {};
        context.triggerEvent('update', { event: { ...eventData, ...data } });
      } else if (data.type === 'club') {
        // 对于协会，传递完整的 club 对象
        const clubData = context.data?.clubDetail || context.data?.club || {};
        context.triggerEvent('update', { club: { ...clubData, ...data } });
      }
    }
    
    // 广播变更事件，让所有页面同时应用
    this.broadcastChanges();
  },

  // 广播变更事件
  broadcastChanges() {
    const changes = this.getChanges();
    
    console.log('[app] 广播变更:', changes);
    
    // 方案1: 遍历所有页面
    const pages = getCurrentPages();
    pages.forEach(page => {
      // 调用页面的 applyLocalChanges 方法（如果存在）
      if (typeof page.applyLocalChanges === 'function') {
        console.log('[app] 应用变更到页面:', page.route);
        page.applyLocalChanges();
      }
    });
    
    // 方案2: 触发全局事件（让所有监听的组件都能收到）
    // 使用 wx.eventChannel 或自定义事件系统
    if (this.globalData._changeListeners) {
      this.globalData._changeListeners.forEach(listener => {
        if (typeof listener === 'function') {
          listener(changes);
        }
      });
    }
    
    // 所有页面都应用完毕后，清空 changes
    this.clearChanges();
  },

  // 注册变更监听器
  registerChangeListener(listener) {
    if (!this.globalData._changeListeners) {
      this.globalData._changeListeners = [];
    }
    this.globalData._changeListeners.push(listener);
  },

  // 注销变更监听器
  unregisterChangeListener(listener) {
    if (this.globalData._changeListeners) {
      const index = this.globalData._changeListeners.indexOf(listener);
      if (index > -1) {
        this.globalData._changeListeners.splice(index, 1);
      }
    }
  },

  getChanges() {
    return wx.getStorageSync('changes') || {};
  },

  clearChanges() {
    wx.setStorageSync('changes', {});
  },

  // 全局：检查登录状态并验证 token（始终返回 Promise）
  checkLoginStatus() {
    const token = wx.getStorageSync('token');
    return new Promise((resolve) => {
      if (!token) {
        wx.navigateTo({ url: '/pages/login/index' });
        resolve(false);
      }
      else{
        wx.request({
          url: this.globalData.request_url + '/auth/verify_token',
          method: 'POST',
          header: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          data: { token },
          success: (res) => {
            if (res.statusCode == 200 && res.data && res.data.valid ) {
              wx.setStorageSync('token', res.data.new_token);
              if(res.data.user.avatar && res.data.user.phone){
                const userInfo = res.data.user;
                wx.setStorageSync('userInfo', userInfo);
                resolve(true);
              }
              else{
                wx.navigateTo({ url: '/pages/login/index' });
                resolve(false);
              }
            } else {
              wx.removeStorageSync('token');
              wx.removeStorageSync('userInfo');
              wx.navigateTo({ url: '/pages/login/index' });
              resolve(false);
            }
          },
          fail: (err) => {            wx.navigateTo({ url: '/pages/login/index' });
            resolve(false);
          }
        });
      }
    });
  },

  convertToThumbnailUrl: function(imageUrl, height) {
    if (!imageUrl) return '';

    try {
      // 解析URL，提取路径部分
      // 在 "/download/" 和后续路径之间插入 "thumbnail/"
    const thumbnailurl = imageUrl.replace('/download/', '/download/thumbnail/');
      return `${thumbnailurl}?minlength=${height}`;
    } catch (error) {
      // 如果URL解析失败，返回原URL
      return imageUrl;
    }
  },
 /**
   * 格式化日期时间（最终版 V2 - 包含过去和未来友好格式，基于日历周）
   * 显示规则：
   * 1. 今天: 今天 HH:mm
   * 2. 昨天: 昨天 HH:mm
   * 3. 前天: 前天 HH:mm
   * 4. 明天: 明天 HH:mm
   * 5. 后天: 后天 HH:mm
   * 6. 本周内其他日期(不含上述): 周X HH:mm (周一为一周开始)
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
    // --- 定义关键时间点(基于本地时间零点) ---
    const todayStartMs = getDayStart(now).getTime();
    const yesterdayStartMs = todayStartMs - DAY_MS;
    const beforeYesterdayStartMs = todayStartMs - 2 * DAY_MS;

    const tomorrowStartMs = todayStartMs + DAY_MS;
    const dayAfterTomorrowStartMs = todayStartMs + 2 * DAY_MS;

    // --- 计算当前日历周的起止时间 (周一为一周开始) ---
    const currentDayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    // 计算距离本周一的天数偏移量 (周日算上周，偏移-6；周一偏移0；周二偏移1...)
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
      // 或者: 进入下面的周几判断
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

  // 部门通讯录相关逻辑已下沉到各页面：expand 时向后端请求 children/users
  })




