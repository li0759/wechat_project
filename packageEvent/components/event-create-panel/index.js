const app = getApp();

// 调用后端接口生成地图URL（避免在前端暴露API key）
async function buildGeoapifyStaticMapUrl({ longitude, latitude, width = 600, height = 400, zoom = 14 }) {
  if (!longitude || !latitude) return '';
  
  return new Promise((resolve, reject) => {
    wx.request({
      url: app.globalData.request_url + '/event/generate_map_url',
      method: 'POST',
      header: {
        'Authorization': `Bearer ${wx.getStorageSync('token')}`,
        'Content-Type': 'application/json'
      },
      data: { longitude, latitude, width, height, zoom },
      success: (res) => {
        if (res.data && res.data.Flag === '4000') {
          resolve(res.data.data.map_url);
        } else {
          resolve('');
        }
      },
      fail: () => {
        resolve('');
      }
    });
  });
}

Component({
  properties: {
    clubId: {
      type: Number,
      value: null
    }
  },
  
  data: {
    uploadAPI: app.globalData.request_url + `/file/upload_file`,
    defaultAvatarUrl: '',
    formData: {
      title: '',
      clubName: '',
      clubId: '',
      preStartTimeDisplay: '',
      preEndTimeDisplay: '',
      duration: 1,
      location: '',
      locationName: '',
      locationAddress: '',
      latitude: '',
      longitude: '',
      content: '',
      budget: ''
    },
    createdEvent: {
      eventID: ''
    },
    currentDate: new Date().getTime(),
    minDate: new Date(new Date().setMonth(new Date().getMonth() - 3)).getTime(), // 3个月前
    maxDate: new Date(new Date().setMonth(new Date().getMonth() + 3)).getTime(), // 3个月后
    gridConfig: {column: 1, width: 500, height: 350},
    momentGridConfig: {column: 3, width: 200, height: 200}, // 首条动态图片网格配置
    locationMarkers: [],
    locationMapSmallUrl: '',
    // 封面上传相关数据
    uploadFiles: [],
    coverFile: null, // 保存确认后的封面文件
    // 首条动态相关数据
    firstMomentForm: {
      description: '',
      descriptionLength: 0,
      uploadFiles: [],
      imageIds: []
    },
    firstMomentConfirmed: false,

    // 创建页：预邀请成员（创建成功后批量 addmember）
    inviteMembers: [],
    inviteUserIds: [],
    // 协会成员（用于人员管理弹窗，样式对齐 event-manage）
    clubMembers: [],
    isotopeMembers: [],
    // 对齐 event-manage：用于 panel 显示统计
    members: [],
    membersClockinCount: 0,

    // 时间编辑（对齐 event-manage 的 t-date-time-picker 内嵌用法）
    timeEdit: {
      preStart: '',
      preEnd: ''
    },
    // 模板选择相关数据
    selectedTemplate: null,
    selectedTemplateId: '',
    selectedTemplateTitle: '',
    selectedTemplateCover: '',
    confirmedTemplateId: '', // 已确认选择的模板ID
    confirmedTemplateTitle: '', // 已确认选择的模板标题
    confirmedTemplateCover: '',
    historyEvents: [],
    templatePage: 1,
    templateTotalPages: 1,
    templateLoading: false,
    clubList: [],
    // 保留必要的弹窗状态（用于日期时间选择器等）
    
    // 选择器弹窗相关数据
    showSelectorPopup: false,
    popupMode: 'tree', // 'tree' 或 'list'
    popupTitle: '选择协会和模板',
    selectedClubId: '',
    selectedTemplateId: '',
    selectedTemplateName: '',
    selectedTreeValue: [], // 树形选择器的值
    historyEvents: [],
    
    // Tree Select 相关数据
    treeSelectOptions: [],
    treeSelectKeys: {
      value: 'value',
      label: 'label',
      children: 'children'
    },
    swiperSelectedTemplateTitle: '', // Swiper 中选中的模板标题
    swiperSelectedTemplateCover: '', // Swiper 中选中的模板封面
    // 日程相关数据
    scheduleEnabled: false, // 新增：是否启用日程
    scheduleForm: {
      enabled: false, // 新增：日程是否启用
      schedule_type: 'weekly',
      weekdays: [0], // 默认周一
      month_days: [1], // 默认1号
      activity_time: '09:00',
      advance_hours_slider: 1
    },
    timeOfDayValue: '09:00', // 确保是字符串格式
    // 临时选择状态（用于弹窗中显示，关闭时才保存到 scheduleForm）
    tempWeekdays: [], // 临时星期选择
    tempMonthdays: [], // 临时日期选择
    // 用于快速判断选中状态的 Map
    tempWeekdaysMap: {}, // {0: true, 1: false, ...}
    tempMonthdaysMap: {}, // {1: true, 2: false, ...}
    advanceHourLabels: [
      '不提醒', 
      '提前1小时', 
      '提前2小时', 
      '提前3小时', 
      '提前6小时', 
      '提前12小时', 
      '提前1天', 
      '提前2天'
    ],
    durationLabels: ['1小时', '1.5小时', '2小时', '3小时', '4小时', '6小时', '8小时', '全天'],
    creating: false,
    submitting: false,
    // 协会选择相关状态
    selectedClubId: '',
    // 新增：临时存储用于显示的日程内容
    tempScheduleDisplay: '',
    // 成功弹窗相关
    showSuccessPopup: false,
    createdEventData: null,
    generatingShareLink: false
  },

  lifetimes: {
    attached() {
      // 组件实例被放入页面节点树时执行
    this.initializeComponent();
    },
    
    ready() {
      // 组件在视图层布局完成后执行
      // 注意：loaded 事件在 initializeComponent 完成后触发，不在这里触发
  },
    
    detached() {
      // 组件实例被从页面节点树移除时执行
  }
  },
  
  methods: {
    onNavBack() {
      // 触发关闭事件，由父组件处理
    this.triggerEvent('close');
    },

    collapsePopup(e) {
      const id = e?.currentTarget?.dataset?.id
      if (!id) return
      this.selectComponent(`#${id}`)?.collapse?.()
    },
    async initializeComponent() {
      // 设置默认头像 URL
    this.setData({
        defaultAvatarUrl: app.globalData.static_url + '/assets/default_avatar.webp'
      });
      
      // 检查登录状态并获取用户信息
    if(await app.checkLoginStatus()){        
        // 获取用户管理的协会列表（静默加载，不显示 loading）
        await this.fetchUserClubList();

        // 设置默认时间为今天当前时间
    const now = new Date();
        const preStart = this.formatDateTime(now)
        const preEnd = this.formatDateTime(new Date(now.getTime() + 60 * 60 * 1000))
        this.setData({
          'formData.preStartTimeDisplay': preStart,
          'formData.preEndTimeDisplay': preEnd,
          'timeEdit.preStart': preStart,
          'timeEdit.preEnd': preEnd
        });

        // 自动打开选择器弹窗
    this.autoOpenSelectorPopup();
      }
      // 初始化完成后触发 loaded 事件，通知父组件隐藏骨架屏
    this.triggerEvent('loaded');
    },

  // 统一请求方法（支持 silent 模式，不显示 loading）
  request(options) {
    const silent = options.silent === true;
    if (!silent) {
      wx.showLoading({ title: options.loadingText || '加载中...' });
    }
    
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
          if (!silent) wx.hideLoading();
          resolve(res.data);
        },
        fail(err) {
          if (!silent) wx.hideLoading();
          reject(err);
        }
      });
    });
  },

  // 统一API调用处理
  handleApiCall(apiPromise, successMsg, errorMsg) {
    return apiPromise
      .then(res => {
        if (res.Flag == 4000) {
          if (successMsg) {
            wx.showToast({
              title: successMsg,
              icon: 'success'
            });
          }
          return res.data;
        } else {
          this.showErrorToast(res.message || errorMsg);
          return Promise.reject(new Error(res.message || errorMsg));
        }
      })
      .catch(err => {
        this.showErrorToast('网络请求失败');
        return Promise.reject(err);
      });
  },

  // 获取用户管理的协会列表
  fetchUserClubList() {
    return new Promise((resolve) => {
      const apiPromise = this.request({
        url: `/club/user_managed/list`,
        method: 'GET',
        silent: true  // 静默加载，让骨架屏显示加载状态
  });
      
      this.handleApiCall(apiPromise, null, '获取协会列表失败')
        .then(data => {
          if (!data) {
            resolve();
            return;
          }
          // 转换数据格式并过滤已删除的协会
    const clubList = data
            .filter(club => !club.is_deleted)  // 过滤已删除的协会
            .map(club => ({
              id: club.club_id,
              name: club.club_name,
              is_deleted: club.is_deleted
            }));
          
          this.setData({ clubList });
          
          // 处理默认选择
    if (clubList.length > 0) {
            const defaultIndex = this.properties.clubId 
              ? clubList.findIndex(club => club.id == this.properties.clubId) 
              : 0;
            
            const selectedIndex = defaultIndex !== -1 ? defaultIndex : 0;
            const selectedClub = clubList[selectedIndex];
            
            this.setData({
              'formData.clubId': selectedClub.id,
              'formData.clubName': selectedClub.name,
              selectedClubId: selectedClub.id
            });
          }
          resolve();
        })
        .catch(() => {
          resolve();
        });
    });
  },

  // 显示错误提示
  showErrorToast(message) {
    wx.showToast({
      title: message,
      icon: 'none'
    });
  },

  // ========== 新增/修改的方法适配新 UI ==========

  // 手动打开选择器弹窗（点击模板面板时）
  async openSelectorPopup() {
    const clubList = this.data.clubList || [];
    const specifiedClubId = this.properties.clubId;
    
    if (specifiedClubId) {
      // 情况3：指定了clubId - 显示该协会的活动列表
    const specifiedClub = clubList.find(club => club.id == specifiedClubId);
      if (specifiedClub) {
        this.setData({
          popupMode: 'list',
          popupTitle: `选择${specifiedClub.name}的活动模板`,
          selectedClubId: specifiedClub.id,
          showSelectorPopup: true
        });
        await this.loadHistoryEvents(specifiedClub.id);
      }
    } else if (clubList.length === 1) {
      // 情况2：只有一个协会 - 显示活动列表
    const singleClub = clubList[0];
      this.setData({
        popupMode: 'list',
        popupTitle: `选择${singleClub.name}的活动模板`,
        selectedClubId: singleClub.id,
        showSelectorPopup: true
      });
      await this.loadHistoryEvents(singleClub.id);
    } else if (clubList.length > 1) {
      // 情况1：多个协会 - 显示树形选择器
      await this.buildTreeSelectOptions(clubList);
      this.setData({
        popupMode: 'tree',
        popupTitle: '选择协会和活动模板',
        showSelectorPopup: true
      });
    } else {
      wx.showToast({ title: '暂无可管理的协会', icon: 'none' });
    }
  },

  // 自动打开选择器弹窗（初始化时）
  async autoOpenSelectorPopup() {
    const clubList = this.data.clubList || [];
    const specifiedClubId = this.properties.clubId;
    
    if (specifiedClubId) {
      // 情况3：指定了clubId - 显示该协会的活动列表
    const specifiedClub = clubList.find(club => club.id == specifiedClubId);
      if (specifiedClub) {
        this.setData({
          popupMode: 'list',
          popupTitle: `选择${specifiedClub.name}的活动模板`,
          selectedClubId: specifiedClub.id,
          showSelectorPopup: true
        });
        await this.loadHistoryEvents(specifiedClub.id);
      }
    } else if (clubList.length === 1) {
      // 情况2：只有一个协会 - 显示活动列表
    const singleClub = clubList[0];
      this.setData({
        popupMode: 'list',
        popupTitle: `选择${singleClub.name}的活动模板`,
        selectedClubId: singleClub.id,
        showSelectorPopup: true
      });
      await this.loadHistoryEvents(singleClub.id);
    } else if (clubList.length > 1) {
      // 情况1：多个协会 - 显示树形选择器
      await this.buildTreeSelectOptions(clubList);
      this.setData({
        popupMode: 'tree',
        popupTitle: '选择协会和活动模板',
        showSelectorPopup: true
      });
    } else {
      wx.showToast({ title: '暂无可管理的协会', icon: 'none' });
    }
  },

  // 构建树形选择器数据
  async buildTreeSelectOptions(clubList) {
    const treeOptions = [];
    
    for (const club of clubList) {
      // 为每个协会加载历史活动
    const events = await this.loadHistoryEventsForTree(club.id);
      const clubNode = {
        label: club.name,
        value: `club_${club.id}`,
        children: events.map(event => ({
          label: event.title,
          value: `event_${event.event_id}`,
          clubId: club.id,
          eventData: event
        }))
      };
      
      treeOptions.push(clubNode);
    }
    
    this.setData({
      treeSelectOptions: treeOptions
    });
  },

  // 为树形选择器加载历史活动
  async loadHistoryEventsForTree(clubId) {
    try {
      const response = await this.request({
        url: `/event/club_public/${clubId}/list/all?page=1&per_page=20`,
        method: 'GET',
        silent: true
      });
      
      if (response.Flag == 4000) {
        const events = response.data.records || [];
        const processedEvents = events.map(event => ({
          ...event,
          cover_thumb: event.cover ? app.convertToThumbnailUrl(event.cover, 120) : '',
          startTime: event.startTime || app.formatDateTime(event.pre_startTime || event.actual_startTime)
        }));
        
        return processedEvents;
      }
      return [];
    } catch (error) {
      return [];
    }
  },

  // 关闭选择器弹窗
  closeSelectorPopup() {
    this.setData({
      showSelectorPopup: false
    });
  },

  // 主面板协会选择
  selectClubAndClose(e) {
    const clubId = e.currentTarget.dataset.clubId;
    const selectedClub = this.data.clubList.find(club => club.id === clubId);
    
    if (selectedClub) {
      this.setData({
        'formData.clubId': selectedClub.id,
        'formData.clubName': selectedClub.name,
        selectedClubId: selectedClub.id
      });
    }
    
    // 关闭弹窗
    this.collapsePopup({ currentTarget: { dataset: { id: 'ec-club' } } });
  },

  // Tree Select 变化处理（弹窗中的协会选择）
  onTreeSelectChange(e) {
    const selectedValue = e.detail.value;
    
    if (selectedValue && selectedValue.length > 0) {
      const lastValue = selectedValue[selectedValue.length - 1];
      
      if (lastValue.startsWith('event_')) {
        // 选择了活动
    const eventId = lastValue.replace('event_', '');
        
        // 从树形数据中找到对应的活动和协会信息
    for (const clubNode of this.data.treeSelectOptions) {
          const eventNode = clubNode.children.find(child => child.value === lastValue);
          if (eventNode) {
            this.setData({
              selectedClubId: eventNode.clubId,
              selectedTemplateId: eventId,
              selectedTemplateName: eventNode.eventData.title,
              selectedTreeValue: selectedValue
            });
            break;
          }
        }
      } else if (lastValue.startsWith('club_')) {
        // 选择了协会但没选活动
    const clubId = lastValue.replace('club_', '');
        this.setData({
          selectedClubId: clubId,
          selectedTemplateId: '',
          selectedTemplateName: '',
          selectedTreeValue: selectedValue
        });
      }
    }
  },

  // 加载历史活动
  async loadHistoryEvents(clubId) {
    try {
      const response = await this.request({
        url: `/event/club_public/${clubId}/list/all?page=1&per_page=20`,
        method: 'GET',
        silent: true
      });
      
      if (response.Flag == 4000) {
        const events = response.data.records || [];
        const processedEvents = events.map(event => ({
          ...event,
          cover_thumb: event.cover ? app.convertToThumbnailUrl(event.cover, 120) : '',
          startTime: event.startTime || app.formatDateTime(event.pre_startTime || event.actual_startTime)
        }));
        
        this.setData({
          historyEvents: processedEvents
        });
      }
    } catch (error) {
      this.setData({
        historyEvents: []
      });
    }
  },

  // 选择模板（弹窗中的模板选择）
  selectTemplate(e) {
    const event = e.currentTarget.dataset.event;
    this.setData({
      selectedTemplateId: event.event_id,
      selectedTemplateName: event.title || ''
    });
  },

  // 确认选择（弹窗中的确认按钮）
  confirmSelection() {
    const { selectedClubId, selectedTemplateId, popupMode } = this.data;
    
    if (!selectedClubId) {
      wx.showToast({ title: '请先选择协会', icon: 'none' });
      return;
    }
    
    // 同步协会信息到主面板
    const selectedClub = this.data.clubList.find(c => c.id == selectedClubId);
    if (selectedClub) {
      this.setData({
        'formData.clubId': selectedClub.id,
        'formData.clubName': selectedClub.name
      });
    }
    
    // 如果选择了模板，应用模板数据并同步到主面板
    if (selectedTemplateId) {
      let selectedTemplate = null;
      
      if (popupMode === 'tree') {
        // 从树形数据中找到模板
    for (const clubNode of this.data.treeSelectOptions) {
          const eventNode = clubNode.children.find(child => 
            child.value === `event_${selectedTemplateId}`
          );
          if (eventNode) {
            selectedTemplate = eventNode.eventData;
            break;
          }
        }
      } else {
        // 从活动列表中找到模板
        selectedTemplate = this.data.historyEvents.find(e => e.event_id == selectedTemplateId);
      }
      
      if (selectedTemplate) {
        // 应用模板数据到表单
    const updateData = {
          'formData.title': selectedTemplate.title || '',
          'formData.content': selectedTemplate.content || '',
          'formData.location': selectedTemplate.location || '',
          selectedTemplateName: selectedTemplate.title,
          swiperSelectedTemplateCover: selectedTemplate.cover_thumb || selectedTemplate.cover || ''
        };
        
        // 应用地点相关字段并生成地图预览
    if (selectedTemplate.location_data) {
          try {
            const locationData = typeof selectedTemplate.location_data === 'string' 
              ? JSON.parse(selectedTemplate.location_data) 
              : selectedTemplate.location_data;
            
            // 确保数据类型正确
    const locationName = String(locationData.name || '');
            const locationAddress = String(locationData.address || '');
            const latitude = locationData.latitude ? String(locationData.latitude) : '';
            const longitude = locationData.longitude ? String(locationData.longitude) : '';
            
            updateData['formData.locationName'] = locationName;
            updateData['formData.locationAddress'] = locationAddress;
            updateData['formData.latitude'] = latitude;
            updateData['formData.longitude'] = longitude;
            
            // 如果有经纬度，生成地图预览
    if (latitude && longitude) {
              buildGeoapifyStaticMapUrl({
                longitude: parseFloat(longitude),
                latitude: parseFloat(latitude),
                width: 600,
                height: 400,
                zoom: 14
              }).then(mapUrl => {
                if (mapUrl) {
                  this.setData({ locationMapSmallUrl: mapUrl });
                }
              }).catch(err => {
                });
            }
          } catch (e) {
            }
        }
        
        // 统一设置所有数据
    this.setData(updateData);
        
        // 应用封面（先显示远程 URL，提交时再下载）
    if (selectedTemplate.cover) {
          this.setData({
            coverFile: {
              url: selectedTemplate.cover,
              name: 'cover.jpg',
              type: 'image',
              isRemote: true  // 标记为远程图片
  },
            uploadFiles: [{
              url: selectedTemplate.cover,
              name: 'cover.jpg',
              type: 'image'
            }]
          });
        }
        
        wx.showToast({ title: '已应用活动模板', icon: 'success' });
      }
    } else {
      this.setData({
        selectedTemplateName: '未选择',
        swiperSelectedTemplateCover: ''
      });
    }
    
    // 关闭弹窗
    this.closeSelectorPopup();
  },

  // 跳过模板（弹窗中的跳过按钮）
  skipTemplate() {
    const { selectedClubId } = this.data;
    
    if (!selectedClubId) {
      wx.showToast({ title: '请先选择协会', icon: 'none' });
      return;
    }
    
    // 同步协会信息到主面板
    const selectedClub = this.data.clubList.find(c => c.id === selectedClubId);
    if (selectedClub) {
      this.setData({
        'formData.clubId': selectedClub.id,
        'formData.clubName': selectedClub.name,
        selectedTemplateName: '未选择',
        swiperSelectedTemplateCover: ''
      });
    }
    
    // 关闭弹窗
    this.closeSelectorPopup();
  },

  // 手动触发上传封面
  manualTriggerUpload() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFiles = res.tempFiles;
        // 构造符合 t-upload 格式的文件对象
    const files = tempFiles.map(file => ({
          url: file.tempFilePath,
          name: 'cover.jpg',
          type: 'image'
        }));
        
        // 复用原有的处理逻辑
    this.onUploadAdd({ detail: { files } });
      }
    });
  },

  // 移除封面
  removeCover() {
    this.setData({
      coverFile: null,
      uploadFiles: []
    });
  },

  // 日程启用包装器 (适配 van-switch)
  onScheduleEnabledChangeWrapper(event) {
    const enabled = event.detail; // van-switch 返回 boolean
    this.onScheduleEnabledChange({ detail: enabled ? 'enabled' : 'none' });
  },

  // 日程类型包装器 (适配 t-tag 点击)
  onScheduleTypeChangeWrapper(event) {
    const type = event.currentTarget.dataset.type;
    this.onScheduleTypeChange({ detail: type });
  },

  // ========== 表单校验（单页滚动模式） ==========
  validateFormAll() {
      if (!this.data.formData.clubId) {
        this.showErrorToast('请选择活动协会');
        return false;
      }
      if (!this.data.formData.title?.trim()) {
        this.showErrorToast('请输入活动名称');
        return false;
      }
      if (!this.data.formData.preStartTimeDisplay) {
        this.showErrorToast('请选择开始时间');
        return false;
      }
      if (!this.data.formData.content?.trim()) {
        this.showErrorToast('请输入活动描述');
        return false;
      }
      if (!this.data.coverFile) {
        this.showErrorToast('请上传封面');
        return false;
      }
      if (!this.data.formData.location) {
        this.showErrorToast('请选择地点');
        return false;
      }
    
    // Task 12.1: 时间逻辑验证
    if (this.data.formData.preStartTime && this.data.formData.preEndTime) {
      const startTime = new Date(this.data.formData.preStartTime);
      const endTime = new Date(this.data.formData.preEndTime);
      const now = new Date();
      
      // 验证开始时间必须在当前时间之后
    if (startTime <= now) {
        this.showErrorToast('开始时间必须晚于当前时间');
        return false;
      }
      
      // 验证结束时间必须在开始时间之后
    if (endTime <= startTime) {
        this.showErrorToast('结束时间必须晚于开始时间');
        return false;
      }
    }
    
    if (this.data.scheduleEnabled) {
      // 尽量确保显示内容已刷新
    if (!this.data.tempScheduleDisplay) this.updateScheduleDisplay();
      if (!String(this.data.tempScheduleDisplay || '').trim()) {
        this.showErrorToast('请完成日程配置');
        return false;
      }
    }
    return true;
  },

  // ========== 表单输入处理方法 ==========
  
  // 活动名称输入
  onTitleChange(event) {
    this.setData({
      'formData.title': event.detail.value
    });
  },

  // 活动预算输入
  onBudgetChange(event) {
    this.setData({
      'formData.budget': event.detail.value
    });
  },

  // 活动地点输入
  onLocationChange(event) {
    this.setData({
      'formData.location': event.detail.value
    });
  },

  // 活动描述输入
  onContentChange(event) {
    this.setData({
      'formData.content': event.detail.value
    });
  },

  // ========== 编辑弹窗相关方法 ==========
  
  // 替代原有的 openClubSelector，现在由 expandable-container 处理展开
  // 仅需处理选择后的关闭
  selectClubAndClose(event) {
    this.selectClub(event);
    this.confirmClub(); // 原 confirmClub 更新数据并关闭 showClubPopup，这里我们需要手动关闭 container
    // 关闭 expandable-container
    const container = this.selectComponent('#club-selector');
    if (container) {
      container.collapse();
    }
  },

  closeClubPopup() {
    // 兼容旧代码
    // no-op
  },

  onClubChange(event) {
    // 添加对undefined值的检查
    const value = event.detail !== undefined ? event.detail : '';
    this.setData({ selectedClubId: value });
  },

  selectClub(event) {
    const clubId = event.currentTarget.dataset.clubId;
    // 添加对undefined值的检查
    const value = clubId !== undefined ? clubId : '';
    this.setData({ selectedClubId: value });
  },

  confirmClub() {
    const selectedClub = this.data.clubList.find(club => club.id === this.data.selectedClubId);
    if (selectedClub) {
      this.setData({
        'formData.clubId': selectedClub.id,
        'formData.clubName': selectedClub.name,
      }, () => {
        this.loadEligibleClubMemberIds(selectedClub.id)
      });
    }
  },

  async loadEligibleClubMemberIds(clubId) {
    if (!clubId) {
      this.setData({ clubMembers: [], isotopeMembers: [] })
      return
    }
    try {
      const res = await this.request({ url: `/club/${clubId}/members`, method: 'GET' })
      if (res.Flag == 4000 && res.data && Array.isArray(res.data.members)) {
        const members = res.data.members.map((m) => ({
          user_id: m.user_id,
          user_name: m.user_name,
          phone: m.phone,
          department: m.department_path || m.department || '',
          position: m.position,
          avatar: m.avatar,
          role: m.role || 'member',
          role_display: m.role_display,
        }))
        this.setData({ clubMembers: members }, () => {
          this.prepareIsotopeMembers()
        })
      } else {
        this.setData({ clubMembers: [], isotopeMembers: [] })
      }
    } catch (e) {
      this.setData({ clubMembers: [], isotopeMembers: [] })
    }
  },

  // ========= 时间（内嵌 t-date-time-picker） =========
  normalizePickerValue(raw) {
    if (!raw) return ''
    if (typeof raw === 'string') return raw
    if (Array.isArray(raw)) {
      const pad2 = (n) => String(n).padStart(2, '0')
      const y = raw[0]
      const m = pad2(raw[1])
      const d = pad2(raw[2])
      const hh = pad2(raw[3])
      const mm = pad2(raw[4])
      return `${y}-${m}-${d} ${hh}:${mm}`
    }
    return String(raw)
  },

  onPreStartPick(e) {
    const val = this.normalizePickerValue(e?.detail?.value)
    this.setData({ 'timeEdit.preStart': val })
  },
  onPreStartChange(e) {
    const val = this.normalizePickerValue(e?.detail?.value)
    this.setData({ 'timeEdit.preStart': val })
  },
  onPreStartConfirm(e) {
    const val = this.normalizePickerValue(e?.detail?.value)
    this.setData({ 'timeEdit.preStart': val })
  },
  onPreEndPick(e) {
    const val = this.normalizePickerValue(e?.detail?.value)
    this.setData({ 'timeEdit.preEnd': val })
  },
  onPreEndChange(e) {
    const val = this.normalizePickerValue(e?.detail?.value)
    this.setData({ 'timeEdit.preEnd': val })
  },
  onPreEndConfirm(e) {
    const val = this.normalizePickerValue(e?.detail?.value)
    this.setData({ 'timeEdit.preEnd': val })
  },

  confirmPreStart() {
    const v = (this.data.timeEdit && this.data.timeEdit.preStart) || ''
    if (!v) return
    this.setData({ 'formData.preStartTimeDisplay': v }, () => {
      // 默认仍按时长刷新结束时间（如果用户未手动改过结束时间，可继续使用）
    this.calculateEndTime()
      this.selectComponent('#ec-pre-start')?.collapse?.()
    })
  },

  confirmPreEnd() {
    const v = (this.data.timeEdit && this.data.timeEdit.preEnd) || ''
    if (!v) return
    this.setData({ 'formData.preEndTimeDisplay': v }, () => {
      this.selectComponent('#ec-pre-end')?.collapse?.()
    })
  },

  // ========= 预邀请成员（UI 对齐 event-manage：成员网格 + 头像右上角 +/-） =========
  onMemberPanelExpand() {
    // 进入弹窗时刷新：确保 join 状态与当前 inviteUserIds 一致
    if (!this.data.formData.clubId) {
      wx.showToast({ title: '请先选择协会', icon: 'none' })
      // 立即收回，避免空弹窗
      setTimeout(() => this.selectComponent('#ec-member-picker')?.collapse?.(), 30)
      return
    }
    // 可能刚选完协会，成员还没拉到；这里兜底
    if (!this.data.clubMembers || this.data.clubMembers.length === 0) {
      this.loadEligibleClubMemberIds(this.data.formData.clubId)
      return
    }
    this.prepareIsotopeMembers()
  },

  // 对齐 event-manage：准备 isotopeMembers（三态：joined/not；create 没有 clockin）
  prepareIsotopeMembers() {
    const { clubMembers, inviteUserIds, inviteMembers } = this.data
    const joinedSet = new Set((inviteUserIds || []).map((x) => String(x)))
    const roleNames = {
      president: '会长',
      vice_president: '副会长',
      director: '理事',
      member: '会员',
    }
    const isotopeItems = (clubMembers || []).map((m) => {
      const isJoined = joinedSet.has(String(m.user_id))
      const status = isJoined ? 'joined' : 'not'
      return {
        id: `member-${m.user_id}`,
        image: m.avatar || app.globalData.static_url+'/assets/default_avatar.webp',
        ini_width: 120,
        ini_height: 160,
        user_id: m.user_id,
        user_name: m.user_name,
        phone: m.phone,
        department: m.department,
        position: m.position,
        role: m.role,
        role_display: roleNames[m.role] || m.role_display || '会员',
        is_joined: isJoined,
        is_clockin: false,
        status,
      }
    })
    this.setData({
      isotopeMembers: isotopeItems,
      members: inviteMembers || [],
      membersClockinCount: 0,
    })
  },

  // 头像右上角 +/-：快速加入/取消加入（不弹确认）
  toggleMemberJoinFast(e) {
    const userId = e.currentTarget?.dataset?.userId
    const isJoined = e.currentTarget?.dataset?.isJoined === true || e.currentTarget?.dataset?.isJoined === 'true'
    if (!userId) return
    if (isJoined) {
      this.removeInviteById(userId)
      return
    }
    this.addInviteById(userId)
  },

  addInviteById(userId) {
    const uid = String(userId)
    const ids = (this.data.inviteUserIds || []).map(String)
    if (ids.includes(uid)) return
    const member = (this.data.clubMembers || []).find((m) => String(m.user_id) === uid)
    if (!member) return
    const nextIds = ids.concat([uid])
    const nextMembers = (this.data.inviteMembers || []).concat([{
      user_id: member.user_id,
      user_name: member.user_name,
      avatar: member.avatar || '/assets/images/default-avatar.png',
      phone: member.phone,
      department: member.department,
      position: member.position,
      role: member.role,
      role_display: member.role_display,
    }])
    this.setData({ inviteUserIds: nextIds, inviteMembers: nextMembers }, () => this.prepareIsotopeMembers())
  },

  removeInviteById(userId) {
    const uid = String(userId)
    const ids = (this.data.inviteUserIds || []).map(String)
    if (!ids.includes(uid)) return
    const nextIds = ids.filter((x) => x !== uid)
    const nextMembers = (this.data.inviteMembers || []).filter((m) => String(m.user_id) !== uid)
    this.setData({ inviteUserIds: nextIds, inviteMembers: nextMembers }, () => this.prepareIsotopeMembers())
  },

  addMemberFromCard(e) {
    const userId = e.currentTarget?.dataset?.userId
    if (!userId) return
    this.addInviteById(userId)
  },
  removeMemberFromCard(e) {
    const userId = e.currentTarget?.dataset?.userId
    if (!userId) return
    this.removeInviteById(userId)
  },

  async addSelectedMembersToEvent(eventId) {
    const ids = (this.data.inviteUserIds || []).map(String)
    if (!eventId || !ids.length) return
    for (const uid of ids) {
      try {
        await this.request({ url: `/event/${eventId}/addmember/${uid}`, method: 'GET' })
      } catch (e) {
        // ignore
  }
    }
  },

  // ========= 首条动态：按 event-manage “发布动态”样式，点击发布后回填卡片 =========
  confirmFirstMomentDraft() {
    // 仅更新本地预览；真正发布在 submitForm 里 createFirstMoment 完成
    this.setData({ firstMomentConfirmed: true }, () => {
      this.selectComponent('#ec-first-moment')?.collapse?.()
    })
  },





  // ========== 地图选择相关方法 ==========
  


  // 选择地点
  chooseLocation() {
    wx.chooseLocation({
      latitude: 23.176149,
      longitude: 113.261868,
      success: async (res) => {
       
        // 创建地图标记
    const markers = [{
          id: 1,
          latitude: res.latitude,
          longitude: res.longitude,
          title: res.name,
          width: 20,
          height: 30
        }];
        const mapUrl = await buildGeoapifyStaticMapUrl({ longitude: res.longitude, latitude: res.latitude, width: 600, height: 400, zoom: 14 });
        
        this.setData({
          'formData.locationName': res.name,
          'formData.locationAddress': res.address,
          'formData.latitude': res.latitude,
          'formData.longitude': res.longitude,
          'formData.location': res.name,
          locationMarkers: markers,
          locationMapSmallUrl: mapUrl
        });
      },
      fail: (err) => {
        if (err.errMsg.includes('cancel')) {
          return;
        }
        this.showErrorToast('选择位置失败，请重试');
      }
    });
  },

  // 清除位置
  clearLocation() {
    this.setData({
      'formData.locationName': '',
      'formData.locationAddress': '',
      'formData.latitude': '',
      'formData.longitude': '',
      'formData.location': '',
      locationMarkers: [],
      locationMapSmallUrl: ''
    });
  },

  // ========== 表单提交相关方法 ==========
  


  // 提交表单
  async submitForm() {
    if (this.data.submitting) return;
    
    if (!this.validateFormAll()) return;

    this.setData({ submitting: true });
    
    try {
      let coverId = null;
      
      // 如果封面是远程图片（来自模板），先下载到本地
    let coverFilePath = this.data.coverFile.url;
      if (this.data.coverFile.isRemote) {
        try {
          const downloadRes = await this.downloadRemoteImage(this.data.coverFile.url);
          coverFilePath = downloadRes.tempFilePath;
        } catch (error) {
          throw new Error('下载模板封面失败，请重新选择封面');
        }
      }
      
      const uploadResult = await this.uploadImage(coverFilePath);
      coverId = uploadResult.file_id;

      // 2. 创建活动（包含cover_id）
    const eventResult = await this.createEvent(coverId);
      this.setData({
        'createdEvent': eventResult
      })

      // 2.2 创建后批量预邀请成员（不阻塞主流程）
      await this.addSelectedMembersToEvent(eventResult.eventID)
      
      // 2.5 创建封面动态（如果有封面图片）
    if (this.data.coverFile) {
        const uploadForMoment = await this.uploadImage(coverFilePath);  // 使用同一个本地文件路径
    const momentCoverId = uploadForMoment.file_id;
        await this.createMoment(momentCoverId);
      }
      
      // 2.6 创建首条动态
      await this.createFirstMoment();
      
      // 3. 创建日程（可选）
    if (this.data.scheduleEnabled && this.data.tempScheduleDisplay.trim() !== '') {
        await this.createSchedule();
      }
      
      // 4. 所有操作完成后发送通知
    const message_data = {
        club_id: eventResult.clubId,
        url: `/packageEvent/event-detail/index?eventId=${eventResult.eventID}`,
        operation: 'event_create',
        text: eventResult.clubName + '发布了新活动：' + eventResult.title + '，快来查看详情并报名参加吧！',
        media: app.convertToThumbnailUrl(eventResult.cover_url, 300)
      };
      
      await app.message_for_club(message_data);
      
      // 统一记录变更（event 创建）
      getApp().recordChange(eventResult.eventID, 'create', {
        type: 'event',
        event_id: eventResult.eventID,
        content: eventResult.content,
        cover_url: eventResult.cover_url,
        title: eventResult.title,
        club_id: eventResult.clubId,
        club_name: eventResult.clubName
      });
      
      // 触发创建成功事件
    this.triggerEvent('create-success', { event: eventResult });
      
      // 显示成功弹窗（不自动关闭）
    this.setData({
        showSuccessPopup: true,
        createdEventData: eventResult
      }, () => {
        // 在成功弹窗显示后，准备分享消息
    this.prepareShareMessage();
      });
    } catch (error) {
      this.showErrorToast('提交失败，请重试');
      // 触发创建失败事件
    this.triggerEvent('create-error', { error: error.message || '提交失败' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  // 创建活动 - 返回活动信息
  async createEvent(coverId) {
    const { formData } = this.data;
    
    const eventData = {
      club_id: formData.clubId,
      title: formData.title.trim(),
      pre_startTime: formData.preStartTimeDisplay,
      pre_endTime: formData.preEndTimeDisplay,
      content: formData.content.trim(),
      location: formData.location || formData.locationName,
      budget: formData.budget ? parseFloat(formData.budget) : 0
    };
    
    // 只有当coverId存在时才添加到请求中
    if (coverId) {
      eventData.cover_id = coverId;
    }
    
    // 添加位置数据
    if (formData.latitude && formData.longitude) {
      eventData.location_data = {
        name: formData.locationName,
        address: formData.locationAddress,
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude)
      };
    }
    
    const apiPromise = this.request({
      url: `/event/create/${formData.clubId}`,
      method: 'PUT',
      data: eventData,
      loadingText: '创建活动中...'
    });
    
    const data = await this.handleApiCall(apiPromise, '活动创建成功', '创建活动失败');
    
    // 返回包含活动信息的对象，用于后续通知
    return {
      eventID: data.eventID,
      title: data.title,
      content: data.content,
      clubName: data.clubName,
      clubId: data.clubID,
      cover_url: data.eventCover
    };
  },

  // 新增：创建动态（对接 app.js 的 createMomentWithParams）
  async createMoment(coverId) {
    try {
      await app.createMomentWithParams({
        description: `我发起了${this.data.createdEvent.title} 大家快来参与吧`,
        imageIds: coverId ? [coverId] : [],
        refEventId: this.data.createdEvent.eventID,
        refClubId: this.data.createdEvent.clubId,
        throwError: false
      });
    } catch (err) {
      // 不阻塞主流程，仅提示
    this.showErrorToast('创建动态失败');
    }
  },

  // 上传单个图片
  async uploadImage(filePath) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: this.data.uploadAPI,
        filePath: filePath,
        name: 'file',
        header: {
          'Authorization': 'Bearer ' + wx.getStorageSync('token')
        },
        dataType: 'json',
        success: (res) => {
          try {
            const data = JSON.parse(res.data);
            if (data.Flag === 4000) {
              resolve(data.data);
            } else {
              reject(new Error(data.Message || '上传失败'));
            }
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },

  // 下载远程图片到本地临时文件
  async downloadRemoteImage(url) {
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url: url,
        success: (res) => {
          if (res.statusCode === 200) {
            resolve(res);
          } else {
            reject(new Error('下载失败'));
          }
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },



  // 处理文件选择
  onUploadAdd(e) {
    const { files } = e.detail;
    
    if (files.length > 0) {
      // 直接保存选中的封面文件，无需确认
    const selectedFile = files[0];
      this.setData({
        coverFile: {
          ...selectedFile,
          isRemote: false  // 本地选择的文件，不是远程图片
  },
        uploadFiles: files
      });
      
      wx.showToast({ 
        title: '封面设置成功', 
        icon: 'success',
        duration: 1500
      });
    } else {
      this.setData({
        uploadFiles: files
      });
    }
  },

  // 处理文件移除
  onUploadRemove(e) {
    const { index } = e.detail;
    const files = [...this.data.uploadFiles];
    files.splice(index, 1);
    this.setData({
      uploadFiles: files,
      coverFile: null // 清除封面文件，确保验证逻辑正确
  });
  },

  // 格式化日期时间
  formatDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },

  // 计算结束时间
  calculateEndTime() {
    const { formData } = this.data;
    if (!formData.preStartTimeDisplay) return;
    
    const startTime = new Date(formData.preStartTimeDisplay);
    const durationHours = this.getDurationHours(formData.duration);
    const endTime = new Date(startTime.getTime() + durationHours * 60 * 60 * 1000);
    
    this.setData({
      'formData.preEndTimeDisplay': this.formatDateTime(endTime)
    });
  },

  // 获取时长对应的小时数
  getDurationHours(duration) {
    const durationMap = [1, 1.5, 2, 3, 4, 6, 8, 24];
    return durationMap[duration] || 1;
  },

  // ========== 成功弹窗相关方法 ==========
  
  // 关闭成功弹窗并返回
  closeSuccessPopup() {
    this.setData({ showSuccessPopup: false });
    this.triggerEvent('close');
  },

  // 准备动态消息分享（在创建成功后调用）
  prepareShareMessage() {
    // 动态消息功能已移除，此方法保留为空以避免调用错误
  },

  // 微信分享配置（同步返回）
  onShareAppMessage() {
    const eventData = this.data.createdEventData;
    
    if (!eventData) {
      return {
        title: '活动分享',
        path: '/pages/home/index'
      };
    }

    // 直接返回分享配置
    const shareConfig = {
      title: `【${eventData.title}】点击参加活动`,
      path: `/pages/share-redirect/index?eventId=${eventData.eventID}&autoOpen=joined`,
      imageUrl: eventData.cover_url
    };
    
    return shareConfig;
  },


  // ========== 日程管理相关方法 ==========
  
  // 日程启用状态切换
  onScheduleEnabledChange(event) {
    try {
      const enabled = event.detail === 'enabled';
      this.setData({
        scheduleEnabled: enabled,
        'scheduleForm.enabled': enabled,
        tempScheduleDisplay: '' // 清空临时显示
  }, this.updateScheduleDisplay); // 添加回调
  } catch (error) {
      this.setData({ scheduleEnabled: false });
    }
  },
  
  // 日程类型变更
  onScheduleTypeChange(event) {
    // 添加对undefined值的检查，如果为undefined则使用默认值'weekly'
    const value = event.detail !== undefined ? event.detail : 'weekly';
    this.setData({
      'scheduleForm.schedule_type': value
    }, this.updateScheduleDisplay); // 添加回调
    // 移除自动更新显示文本，只有确认时才更新
  },

  // 监听时间选择器变化（实时更新显示，但不更新数据）
  onTimeInput(event) {
    // 确保 time 是字符串格式
    let time = event.detail || '09:00';
    if (typeof time !== 'string') {
      // 如果是对象，尝试转换为字符串
    if (time && typeof time === 'object') {
        const hour = String(time.hour || 9).padStart(2, '0');
        const minute = String(time.minute || 0).padStart(2, '0');
        time = `${hour}:${minute}`;
      } else {
        time = String(time);
      }
    }
    
    // 只更新显示值，不更新实际数据
    this.setData({
      timeOfDayValue: time
    });
  },

  // 时间选择器展开时，同步当前时间到显示值
  onTimeSelectorExpand() {
    // 展开时，将当前已保存的时间同步到显示值
    const currentTime = this.data.scheduleForm.activity_time || '09:00';
    this.setData({
      timeOfDayValue: currentTime
    });
  },

  // 时间选择器关闭时保存时间数据
  onTimeSelectorCollapse() {
    // 当弹窗关闭时，将当前选择的时间保存到数据中
    const time = this.data.timeOfDayValue || this.data.scheduleForm.activity_time || '09:00';
    this.setData({
      'scheduleForm.activity_time': time
    }, () => {
      this.updateScheduleDisplay();
    });
  },

  // 活动时间确认
  onTimeOfDayConfirm(event) {
    // 添加对undefined值的检查，如果为undefined则使用默认值'09:00'
    const time = event.detail !== undefined ? event.detail : '09:00';
    this.setData({
      'scheduleForm.activity_time': time,
      timeOfDayValue: time
    }, this.updateScheduleDisplay); // 添加回调
    // 移除自动更新显示文本，只有确认时才更新
  },

  // 提前通知时间变更
  onAdvanceHoursChange(event) {
    // 修复：使用event.detail而不是event.detail.value来获取滑块值
    const value = event.detail !== undefined ? event.detail : 1;
    
    this.setData({
      'scheduleForm.advance_hours_slider': value
    }, this.updateScheduleDisplay); // 添加回调
  },

  // 获取星期显示文本
  getWeekdaysDisplay(weekdays) {
    if (!weekdays || !weekdays.length) return '';
    const dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return weekdays.map(day => dayLabels[day] || '').filter(Boolean).join('、');
  },

  // 获取月份日期显示文本
  getMonthdaysDisplay(monthdays) {
    if (!monthdays || !monthdays.length) return '';
    return monthdays.map(day => `${day}日`).join('、');
  },

  // 阻止事件冒泡（用于 expandable-container 的 content slot）
  stopPropagation(e) {
    // 空函数，仅用于阻止事件冒泡
  },

  // 星期选择器展开时，同步当前选择到临时状态
  onWeekdaySelectorExpand() {
    // 展开时，将当前已保存的选择同步到临时状态
    const currentWeekdays = this.data.scheduleForm.weekdays || [];
    const weekdaysMap = {};
    currentWeekdays.forEach(day => {
      weekdaysMap[day] = true;
    });
    this.setData({
      tempWeekdays: [...currentWeekdays],
      tempWeekdaysMap: weekdaysMap
    });
  },

  // 星期选择器关闭时保存选择
  onWeekdaySelectorCollapse() {
    // 当弹窗关闭时，将临时选择保存到数据中
    const weekdays = this.data.tempWeekdays || [];
    this.setData({
      'scheduleForm.weekdays': weekdays
    }, () => {
      this.updateScheduleDisplay();
    });
  },

  // 切换星期选择 (自定义 Grid UI) - 只更新临时状态
  toggleWeekday(e) {
    const day = parseInt(e.currentTarget.dataset.day);
    // 使用临时状态
    const currentWeekdays = this.data.tempWeekdays || [];
    const currentMap = this.data.tempWeekdaysMap || {};
    const index = currentWeekdays.indexOf(day);
    
    let newWeekdays;
    let newMap = {...currentMap};
    if (index > -1) {
      newWeekdays = currentWeekdays.filter(d => d !== day);
      delete newMap[day];
    } else {
      newWeekdays = [...currentWeekdays, day].sort((a, b) => a - b);
      newMap[day] = true;
    }
    
    // 只更新临时状态，不更新实际数据
    this.setData({
      tempWeekdays: newWeekdays,
      tempWeekdaysMap: newMap
    });
  },

  // 日期选择器展开时，同步当前选择到临时状态
  onMonthdaySelectorExpand() {
    // 展开时，将当前已保存的选择同步到临时状态
    const currentMonthdays = this.data.scheduleForm.month_days || [];
    const monthdaysMap = {};
    currentMonthdays.forEach(day => {
      monthdaysMap[day] = true;
    });
    this.setData({
      tempMonthdays: [...currentMonthdays],
      tempMonthdaysMap: monthdaysMap
    });
  },

  // 日期选择器关闭时保存选择
  onMonthdaySelectorCollapse() {
    // 当弹窗关闭时，将临时选择保存到数据中
    const monthdays = this.data.tempMonthdays || [];
    this.setData({
      'scheduleForm.month_days': monthdays
    }, () => {
      this.updateScheduleDisplay();
    });
  },

  // 切换日期选择 (自定义 Grid UI) - 只更新临时状态
  toggleMonthday(e) {
    const day = parseInt(e.currentTarget.dataset.day);
    // 使用临时状态
    const currentDays = this.data.tempMonthdays || [];
    const currentMap = this.data.tempMonthdaysMap || {};
    const index = currentDays.indexOf(day);
    
    let newMonthdays;
    let newMap = {...currentMap};
    if (index > -1) {
      newMonthdays = currentDays.filter(d => d !== day);
      delete newMap[day];
    } else {
      newMonthdays = [...currentDays, day].sort((a, b) => a - b);
      newMap[day] = true;
    }
    
    // 只更新临时状态，不更新实际数据
    this.setData({
      tempMonthdays: newMonthdays,
      tempMonthdaysMap: newMap
    });
  },

  // 星期选择确认 (t-checkbox-group) - 兼容旧代码，但已不再使用
  onWeekdaysChange(event) {
    const value = event.detail.value || [0];
    this.setData({
      'scheduleForm.weekdays': value,
      'weekdaysDisplayText': this.getWeekdaysDisplay(value)
    }, this.updateScheduleDisplay);
  },

  // 月份日期选择确认 (t-checkbox-group) - 兼容旧代码，但已不再使用
  onMonthdaysChange(event) {
    const value = event.detail.value || [1];
    this.setData({
      'scheduleForm.month_days': value,
      'monthdaysDisplayText': this.getMonthdaysDisplay(value)
    }, this.updateScheduleDisplay);
  },

  // 新增方法：实时生成日程显示文本
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
      if (advanceText && advanceText !== '不提醒') {
        displayText += `，${advanceText}提醒`;
      }
    }
    
    this.setData({ 
      tempScheduleDisplay: displayText
    });
  },

  // 创建日程
  async createSchedule() {
    const { scheduleForm } = this.data;
    if (!scheduleForm) return;
    
    const scheduleData = {
      schedule_type: scheduleForm.schedule_type,
      time_of_day: scheduleForm.activity_time,
      advance_hours: this.getAdvanceHours(scheduleForm.advance_hours_slider)
    };
    
    // 根据类型添加执行日期
    if (scheduleForm.schedule_type === 'weekly') {
      scheduleData.weekdays = scheduleForm.weekdays;
    } else if (scheduleForm.schedule_type === 'monthly') {
      scheduleData.month_days = scheduleForm.month_days;
    }
    
    const apiPromise = this.request({
      url: `/schedule/create/${this.data.createdEvent.eventID}`,
      method: 'PUT',
      data: scheduleData,
      loadingText: '创建日程中...'
    });
    
    return this.handleApiCall(apiPromise, '日程创建成功', '创建日程失败');
  },

  // 获取提前通知小时数
  getAdvanceHours(sliderValue) {
    const hours = [0, 1, 2, 3, 6, 12, 24, 48];
    if (typeof sliderValue !== 'number' || sliderValue < 0 || sliderValue >= hours.length) {
      return 1;
    }
    return hours[sliderValue];
  },

  // ========== 首条动态相关方法 ==========
  
  // 首条动态文本输入
  onFirstMomentDescChange(event) {
    const description = event.detail.value || '';
    this.setData({
      'firstMomentForm.description': description,
      'firstMomentForm.descriptionLength': description.length
    });
  },

  // 首条动态图片添加
  onFirstMomentImageAdd(e) {
    const { files } = e.detail;
    this.setData({
      'firstMomentForm.uploadFiles': files
    });
  },

  // 首条动态图片移除
  onFirstMomentImageRemove(e) {
    const { index } = e.detail;
    const uploadFiles = [...this.data.firstMomentForm.uploadFiles];
    uploadFiles.splice(index, 1);
    
    this.setData({
      'firstMomentForm.uploadFiles': uploadFiles
    });
  },

  // 上传首条动态图片
  async uploadFirstMomentImage(filePath) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: this.data.uploadAPI,
        filePath: filePath,
        name: 'file',
        formData: {
          'file_type': 'moment_img'
        },
        header: {
          'Authorization': 'Bearer ' + wx.getStorageSync('token')
        },
        dataType: 'json',
        success: (res) => {
          try {
            const data = JSON.parse(res.data);
            if (data.Flag === 4000) {
              resolve(data.data);
            } else {
              reject(new Error(data.Message || '上传失败'));
            }
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },

  // 创建首条动态
  async createFirstMoment() {
    const { firstMomentForm, formData } = this.data;
    let imageIds = [];

    try {
      // 上传首条动态的图片
    if (firstMomentForm.uploadFiles && firstMomentForm.uploadFiles.length > 0) {
        wx.showLoading({ title: '上传首条动态图片中...' });
        
        for (let i = 0; i < firstMomentForm.uploadFiles.length; i++) {
          const file = firstMomentForm.uploadFiles[i];
          const result = await this.uploadFirstMomentImage(file.url);
          imageIds.push(result.file_id);
        }
        
        wx.hideLoading();
      }

      // 生成默认描述文本
    const defaultDescription = `我为活动${formData.title}创建了首条动态`;
      const description = firstMomentForm.description.trim() || defaultDescription;

      // 创建首条动态
      await app.createMomentWithParams({
        description: description,
        imageIds: imageIds,
        refEventId: this.data.createdEvent.eventID,
        refClubId: this.data.createdEvent.clubId,
        throwError: true
      });
      
    } catch (error) {
      wx.showToast({
        title: '创建首条动态失败',
        icon: 'none'
      });
    }
  },

  // ========== 模板选择相关方法 ==========
  
  // 滚动加载更多历史活动（用于弹窗中的活动列表）
  onTemplateScrollToLower() {
    const { templatePage, templateTotalPages } = this.data;
    if (templatePage < templateTotalPages) {
      this.loadHistoryEventsWithPagination(templatePage + 1);
    }
  },

  // 分页加载历史活动
  async loadHistoryEventsWithPagination(page = 1) {
    if (this.data.templateLoading || !this.data.selectedClubId) return;
    
    this.setData({ templateLoading: true });
    
    try {
      const res = await this.request({
        url: `/event/club_public/${this.data.selectedClubId}/list/all?page=${page}&per_page=20`,
        method: 'GET',
        silent: true
      });

      if (res.Flag == 4000) {
        const events = res.data.records || [];
        // 格式化活动数据
    const formattedEvents = events.map(event => ({
          event_id: event.event_id,
          title: event.title,
          content: event.content,
          location: event.location,
          startTime: event.startTime,
          cover_thumb: event.cover ? app.convertToThumbnailUrl(event.cover, 100) : '',
          cover: event.cover,
          real_cost: event.real_cost,
          budget: event.budget,
          join_count: event.join_count,
          is_ended: event.is_ended,
          is_cancelled: event.is_cancelled
        }));

        this.setData({
          historyEvents: page === 1 ? formattedEvents : [...this.data.historyEvents, ...formattedEvents],
          templatePage: page,
          templateTotalPages: res.data.pagination?.total_pages || 1
        });
      }
    } catch (error) {
      } finally {
      this.setData({ templateLoading: false });
    }
  },

  // 加载活动详情
  async loadEventDetail(eventId) {
    const res = await this.request({
      url: `/event/${eventId}`,
      method: 'GET'
    });

    if (res.Flag == 4000) {
      return res.data;
    } else {
      throw new Error(res.message || '加载活动详情失败');
    }
  },

  // 应用模板数据
  async applyTemplate(eventDetail) {
    // 应用基本信息
    this.setData({
      'formData.title': eventDetail.title,
      'formData.content': eventDetail.content,
      'formData.location': eventDetail.location,
      'formData.budget': eventDetail.budget?.toString() || ''
    });

    // 应用地址信息
    if (eventDetail.location_data) {
      this.setData({
        'formData.locationName': eventDetail.location_data.name,
        'formData.locationAddress': eventDetail.location_data.address,
        'formData.latitude': eventDetail.location_data.latitude,
        'formData.longitude': eventDetail.location_data.longitude
      });

      // 创建地图标记
    const markers = [{
        id: 1,
        latitude: eventDetail.location_data.latitude,
        longitude: eventDetail.location_data.longitude,
        title: eventDetail.location_data.name,
        width: 20,
        height: 30
      }];
      this.setData({ locationMarkers: markers });
    }

    // 处理封面
    if (eventDetail.cover_url) {
      try {
        // 下载封面到临时目录
    const downloadRes = await new Promise((resolve, reject) => {
          wx.downloadFile({
            url: eventDetail.cover_url,
            success: resolve,
            fail: reject
          });
        });

        // 设置封面文件
    const coverFile = {
          url: downloadRes.tempFilePath,
          status: 'done',
          percent: 100
        };

        this.setData({
          coverFile: coverFile,
          uploadFiles: [coverFile]
        });
      } catch (error) {
        }
    }

    // 处理首条动态
    if (eventDetail.first_moment) {
      try {
        const momentDetail = await this.loadMomentDetail(eventDetail.first_moment);
        // 设置首条动态文本
    const description = momentDetail.description || '';
        this.setData({
          'firstMomentForm.description': description,
          'firstMomentForm.descriptionLength': description.length
        });

        // 处理首条动态图片
    if (momentDetail.image_files && momentDetail.image_files.length > 0) {
          const momentImages = [];
          
          for (const img of momentDetail.image_files) {
            try {
              const downloadRes = await new Promise((resolve, reject) => {
                wx.downloadFile({
                  url: img.fileUrl,
                  success: resolve,
                  fail: reject
                });
              });

              momentImages.push({
                url: downloadRes.tempFilePath,
                status: 'done',
                percent: 100
              });
            } catch (error) {
              }
          }

          this.setData({
            'firstMomentForm.uploadFiles': momentImages
          });
        }
      } catch (error) {
        }
    }
  },

  // 加载动态详情
  async loadMomentDetail(momentId) {
      const res = await this.request({
        url: `/moment/${momentId}`,
        method: 'GET'
      });
      if (res.Flag == 4000) {
        
        return res.data;

      } else {
        throw new Error(res.message || '加载动态详情失败');
      }
    }
  }
});