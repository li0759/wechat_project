const app = getApp();

function tryCloseFullscreenPopup() {
  const fn = getApp()?.globalData?.__fullscreenExpandableClose
  if (typeof fn === 'function') return !!fn()
  return false
}

Component({
  properties: {
    // 可选：如果需要从外部传入初始数据
  },
  
  data: {
    uploadAPI: app.globalData.request_url + `/file/upload_file`,
    formData: {
      club_name: '',
      description: '',
      charter: '',
      president_id: ''
    },
    // 封面上传相关数据
    uploadFiles: [],
    coverFile: null, // 保存确认后的封面文件
    gridConfig: {column: 1, width: 500, height: 450},

    // 人员管理相关数据
    selectedPresident: null,
    membersList: [], // 已添加的初始成员列表
    searchResults: [], // 搜索结果
    showMemberDetailPopup: false,
    currentMemberDetail: null,
    memberDetailSource: '', // 记录用户详情弹窗的来源：'president' 或 'member'
    
    // 保留必要的弹窗状态
    presidentSearchResults: [],
    
    // 新增：Tab切换和部门列表
    addMemberTab: 0, // 添加会员弹窗的tab：0=search, 1=allUsers
    presidentTab: 0, // 会长选择弹窗的tab：0=search, 1=allUsers（改为数字）
    // 通讯录：仅顶级部门；展开时向后端请求 children/users
    deptTree: [],
    deptExpand: {},

    // 通讯录组件状态
    addressbookExistingUserIds: [],
    addressbookSelectedPresidentId: '',

    // 通讯录导航视图（目录式入/返回，对应club-members的添加成员）
    abDeptTree: [],
    abDeptExpand: {},
    abNavStack: [],
    abNavTitle: '',
    abViewType: 'root', // root | children | users
    abCurrentDeptId: '',
    abCurrentDepartments: [],
    abCurrentUsers: [],
    abLoading: false,
    abThemeColor: '#ff6b9d',

    // 会长选择通讯录导航视图（pab = president addressbook）    pabDeptTree: [],
    pabDeptExpand: {},
    pabNavStack: [],
    pabNavTitle: '',
    pabViewType: 'root', // root | children | users
    pabCurrentDeptId: '',
    pabCurrentDepartments: [],
    pabCurrentUsers: [],
    pabLoading: false,
    pabThemeColor: '#ff6b9d',

    // isotope 头像组- 成员
    memberAvatarItems: [],
    memberImageStyle: { borderRadius: '50%' },
    memberIsoHeight: '150rpx',

    // isotope 头像组- 会长（只有一个）
    presidentAvatarItems: [],
    presidentIsoHeight: '150rpx',
    
    creating: false
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

  // 现在会长选择弹窗由? / *”自身作为trigger 触发，这里仅保留兼容（不再主动expand中央隐藏trigger）
  openPresidentPicker() {},

  // 成员选择弹窗由“成员+”自身作为trigger 触发
  openMemberPicker() {},

  // trigger 展开时初始化状态，确保每次打开都是最新
  onPresidentPickerExpand() {
    this.updateAddressbookState()
    this.setData({ presidentTab: 0, presidentSearchResults: [] })
    // 更新会长头像组    
    setTimeout(() => {
      this.updatePresidentIsotope()
    }, 500)
    // 加载会长选择通讯录
    this.pabEnsureLoaded()
  },
  
  onPresidentPickerCollapse() {
    // 收起时不清空数据，保持状态
  },

  // 打开更换会长弹窗
  openPresidentChangePicker() {
    // 先关闭会长详情弹窗
    const detailPopup = this.selectComponent('#cc-president-detail')
  if (detailPopup && detailPopup.collapse) {
      detailPopup.collapse()
    }
    // 延迟打开更换会长弹窗
    setTimeout(() => {
      const changePicker = this.selectComponent('#cc-president-change-picker')
      if (changePicker && changePicker.expand) {
        changePicker.expand()
      }
    }, 300)
  },

  // 从详情弹窗移除成员
  removeMemberFromDetail(e) {
    const userId = e.currentTarget.dataset.userid
    const userName = e.currentTarget.dataset.username
    
    // 先关闭详情弹窗
    const detailPopup = this.selectComponent(`#cc-member-detail-${userId}`)
  if (detailPopup && detailPopup.collapse) {
      detailPopup.collapse()
    }
    
    // 延迟执行移除确认
    setTimeout(() => {
      wx.showModal({
        title: '确认移除',
        content: `确定要移除${userName || '该成员'} 吗？`,
        success: (res) => {
          if (res.confirm) {
            const updatedMembersList = this.data.membersList.filter(member => 
              String(member.user_id) !== String(userId)
            )
            
            this.setData({
              membersList: updatedMembersList
            }, () => {
              this.updateSearchResultsStatus()
              this.updateAddressbookState()
              this.abRefreshExistingStatus()
              
              wx.showToast({
                title: '移除成功',
                icon: 'success'
              })
            })
          }
        }
      })
    }, 300)
  },
  
  onMemberPickerExpand() {
    this.updateAddressbookState()
    // 对齐 club-members：默认打开“搜索用户"
    this.setData({ addMemberTab: 0, searchResults: [] })
    // 更新头像组    
    setTimeout(() => {
      this.updateMemberIsotope()
    }, 500)
    // 加载通讯录
    this.abEnsureLoaded()
    // 刷新通讯录中已存在用户的状态（会长/成员标识）
    this.abRefreshExistingStatus()
  },

  // 统一请求方法（持silent模式，不显示loading）
  request(options) {
    const silent = options.silent === true;
    if (!silent) {
      wx.showLoading({ title: options.loadingText || '加载?..' });
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

  // 显示错误提示
  showErrorToast(message) {
    wx.showToast({
      title: message,
      icon: 'none'
    });
  },

  // 单页滚动模式：不再需要steps/next/prev

  // ========== 表单输入处理方法 ==========
  
  // 协会名称输入
  onClubNameChange(event) {
    this.setData({
      'formData.club_name': event.detail.value
    });
  },

  // 协会简介输入
  onDescriptionChange(event) {
    this.setData({
      'formData.description': event.detail.value
    });
  },

  // 协会章程输入
  onCharterChange(event) {
    this.setData({
      'formData.charter': event.detail.value
    });
  },

  // ========== 封面上传相关方法 ==========
  // 直接选择封面（不再先弹窗）
  chooseCoverDirect() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFiles = res.tempFiles || []
        const files = tempFiles.map((file) => ({
          url: file.tempFilePath,
          name: 'cover.jpg',
          type: 'image'
        }))
        this.onUploadAdd({ detail: { files } })
      }
    })
  },
  
  // 处理文件选择
  onUploadAdd(e) {
    const { files } = e.detail;
    
    if (files.length > 0) {
      // 直接保存选中的封面文件，无需确认
    const selectedFile = files[0];
      this.setData({
        coverFile: selectedFile,
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

  // ========== 人员管理相关方法 ==========

  // 会长选择弹窗tab切换
  onPresidentTabChange(e) {
    const nextRaw = e && e.detail ? e.detail.value : undefined
    let nextTab = nextRaw
    if (nextRaw === 'search') nextTab = 0
    if (nextRaw === 'allUsers') nextTab = 1
    if (nextRaw === '0') nextTab = 0
    if (nextRaw === '1') nextTab = 1

    const nextNum = Number(nextTab)
    this.setData({ presidentTab: Number.isFinite(nextNum) ? nextNum : 0 }, () => {
      if (this.data.presidentTab === 1) this.pabEnsureLoaded()
    })
  },

  // 获取会长搜索建议（search_suggest组件专用）  
  async onFetchPresidentSuggestions(e) {
    const { keyword, callback } = e.detail;
    
    if (!keyword || keyword.length < 1) {
      callback([]);
      return;
    }

    try {
      const res = await this.request({
        url: `/search/user/suggestions?keyword=${encodeURIComponent(keyword)}&limit=8`,
        method: 'GET'
      });

      if (res.code === 200) {
        callback(res.data.suggestions);
      } else {
        callback([]);
      }
    } catch (error) {      callback([]);
    }
  },

  // 执行会长搜索（search_suggest组件专用）  
  async onPresidentSearch(e) {
    const keyword = e.detail.value;
    await this.performPresidentSearch(keyword);
  },

  // 选择搜索建议
  onSelectPresidentSuggestion(e) {
    const { value, item } = e.detail;

    // 执行搜索
    this.performPresidentSearch(value);
  },

  // 选择历史记录
  onPresidentHistorySelect(e) {
    const { value } = e.detail;
    this.performPresidentSearch(value);
  },

  // 执行搜索的通用方法
  async performPresidentSearch(keyword) {
    if (!keyword || !keyword.trim()) {
      this.showErrorToast('请输入搜索关键词');
      return;
    }

    wx.showLoading({ title: '搜索?..' });

    try {
      const res = await this.request({
        url: `/search/user?q=${encodeURIComponent(keyword)}&page=1&per_page=20`,
        method: 'GET'
      });

      if (res.Flag == 4000) {
        // 为每个用户添加初始状态
    const usersWithStatus = res.data.users.map(user => ({
          ...user,
          isSelectedPresident: this.data.selectedPresident && this.data.selectedPresident.id === user.user_id
        }));

        // 将搜索结果存储到临时数据中，供选择使用
    this.setData({
          presidentSearchResults: usersWithStatus
        });
      } else {
        this.showErrorToast('搜索失败');
      }
    } catch (error) {
      this.showErrorToast('搜索失败');
    } finally {
      wx.hideLoading();
    }
  },

  // 直接从搜索结果设置会长（快捷操作）
  setAsPresidentFromSearch(e) {
    const user = e.currentTarget.dataset.user;

    if (!user) {
      this.showErrorToast('用户信息不存在');
      return;
    }

    // 检查是否已经是会长
    if (this.data.selectedPresident && this.data.selectedPresident.id === user.user_id) {
      this.showErrorToast('该用户已被指定为会长');
      return;
    }

    // 直接设置为会长
    this.setPresident(user);
  },

  // 从搜索结果中选择会长
  selectPresidentFromSearch(e) {
    const user = e.currentTarget.dataset.user;
    if (!user) return;
    
    // 如果已经是会长，不做任何操作
    const isPresident = this.data.selectedPresident && String(this.data.selectedPresident.id) === String(user.user_id);
    if (isPresident) {
      wx.showToast({ title: '已是当前会长', icon: 'none' });
      return;
    }
    
    // 直接设置为会长
    this.setPresident(user);
  },

  // 打开已选会长详情弹窗
  openPresidentDetail() {
    if (!this.data.selectedPresident) return;
    const p = this.data.selectedPresident;
    const presidentDetail = {
      user_id: p.id,
      user_name: p.name,
      avatar: p.avatar || '/assets/icons/user.png',
      phone: p.phone || '',
      department: p.department || '',
      position: p.position || '',
      tag: p.tag || '',
      role: 'president',
      role_display: '会长',
      is_current_user: false,
      join_date: 'pending' // 会长标记为pending
  };
    this.setData({
      currentMemberDetail: presidentDetail,
      showMemberDetailPopup: true
    });
  },

  // 添加会员弹窗tab切换
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

  // 获取成员搜索建议
  async onFetchMemberSuggestions(e) {
    const { keyword, callback } = e.detail;
    
    if (!keyword || keyword.length < 1) {
      callback([]);
      return;
    }

    try {
      const res = await this.request({
        url: `/search/user/suggestions?keyword=${encodeURIComponent(keyword)}&limit=8`,
        method: 'GET'
      });

      if (res.code === 200) {
        callback(res.data.suggestions);
      } else {
        callback([]);
      }
    } catch (error) {      callback([]);
    }
  },

  // 执行成员搜索
  async onMemberSearch(e) {
    const keyword = e.detail.value;
    await this.performMemberSearch(keyword);
  },

  // 选择成员搜索建议
  onSelectMemberSuggestion(e) {
    const { value, item } = e.detail;

    // 执行搜索
    this.performMemberSearch(value);
  },

  // 选择成员历史记录
  onMemberHistorySelect(e) {
    const { value } = e.detail;
    this.performMemberSearch(value);
  },

  // 执行成员搜索的通用方法
  async performMemberSearch(keyword) {
    if (!keyword || !keyword.trim()) {
      this.showErrorToast('请输入搜索关键词');
      return;
    }

    wx.showLoading({ title: '搜索?..' });

    try {
      const res = await this.request({
        url: `/search/user?q=${encodeURIComponent(keyword)}&page=1&per_page=20`,
        method: 'GET'
      });

      if (res.Flag == 4000) {
        // 标记已存在的成员和会长
    const resultsWithStatus = res.data.users.map(user => ({
          ...user,
          isExistingMember: this.data.membersList.some(member => member.user_id === user.user_id) ||
                           (this.data.selectedPresident && this.data.selectedPresident.id === user.user_id)
        }));
        
        this.setData({
          searchResults: resultsWithStatus
        });
      } else {
        this.showErrorToast('搜索失败');
      }
    } catch (error) {
      this.showErrorToast('搜索失败');
    } finally {
      wx.hideLoading();
    }
  },

  // 添加用户到协会（从搜索结果列表或全部用户列表）
  addUserToClub(e) {
    const userId = e.currentTarget.dataset.id;
    
    // 先检查是否是会长
    if (this.abIsPresident(userId)) {
      this.showErrorToast('该用户已被指定为会长');
      return;
    }
    
    // 先从搜索结果中查找
    let userInfo = this.data.searchResults.find(user => user.user_id === userId);
    
    // 如果搜索结果中没有，再从全部用户列表中查找
    if (!userInfo) {
      userInfo = this.findUserInDeptState(userId);
    }
    
    if (!userInfo) {
      wx.showToast({
        title: '用户信息不存在',
        icon: 'none'
      });
      return;
    }

    // 直接添加到成员列表缓存
    this.addUserToMembersList(userInfo);
  },

  // 搜索结果点击事件 - 显示用户详情
  onSearchResultTap(e) {
    const user = e.currentTarget.dataset.user;

    // 检查是否已经是成员或会长
    const existingMember = this.data.membersList.find(member => member.user_id === user.user_id);
    const isPresident = this.data.selectedPresident && this.data.selectedPresident.id === user.user_id;

    let userDetail;
    if (existingMember) {
      // 如果已经是成员，显示成员信息（用'pending'标识已在缓存中）
      userDetail = {
        ...existingMember,
        avatar: user.avatar || existingMember.avatar || '/assets/icons/user.png',
        phone: user.phone || existingMember.phone,
        department: user.department || existingMember.department,
        tag: user.tag || existingMember.tag,
        is_current_user: false,
        join_date: 'pending' // ?pending'表示已在缓存中但未真正加入
  };
    } else if (isPresident) {
      // 如果是会长，显示会长信息
      userDetail = {
        user_id: user.user_id,
        user_name: user.user_name,
        avatar: user.avatar || '/assets/icons/user.png',
        phone: user.phone,
        department: user.department,
        tag: user.tag,
        role: 'president',
        role_display: '会长',
        is_current_user: false,
        join_date: 'pending' // 会长也标记为pending
  };
    } else {
      // 普通搜索结果，可以添加
      userDetail = {
        user_id: user.user_id,
        user_name: user.user_name,
        avatar: user.avatar || '/assets/icons/user.png',
        phone: user.phone,
        department: user.department,
        tag: user.tag,
        role: 'candidate',
        role_display: '待添加',
        is_current_user: false,
        join_date: null // null表示还未添加到协会
  };
    }

    this.setData({
      currentMemberDetail: userDetail,
      showMemberDetailPopup: true,
      memberDetailSource: 'member' // 记录来源为添加会员弹窗
  });
  },

  // 从详情弹窗设为会长
  setAsPresident(e) {
    const user = e.currentTarget.dataset.user || this.data.currentMemberDetail;

    if (!user) {
      this.showErrorToast('用户信息不存在');
      return;
    }

    // 关闭详情弹窗
    this.setData({
      showMemberDetailPopup: false
    });

    // 直接设置为会长
    this.setPresident(user);
  },

  // 从会员详情弹窗添加用户到成员列表
  addUserToClubFromDetail(e) {
    const user = e.currentTarget.dataset.user || this.data.currentMemberDetail;

    // 检查用户是否有效且未添加（join_date为null表示未添加）
    if (!user) {
      this.showErrorToast('用户信息不存在');
      return;
    }

    // 如果join_date不为null，说明已经是成员，不能重复添加
    if (user.join_date !== null && user.role !== 'candidate') {
      this.showErrorToast('该用户已在成员列表中');
      return;
    }

    // 关闭详情弹窗
    this.setData({
      showMemberDetailPopup: false
    });

    // 添加到成员列表缓存
    this.addUserToMembersList(user);
  },

  // 设置会长
  setPresident(user) {
    // 检查会长是否已在成员列表中
    const presidentInMembers = this.data.membersList.find((member) => String(member.user_id) === String(user.user_id));
    
    // 获取旧会长信息（如果有）
    const oldPresident = this.data.selectedPresident

    if (presidentInMembers) {
      // 从成员列表中移除，因为会长不在成员列表中显示
    const updatedMembersList = this.data.membersList.filter(member =>
        String(member.user_id) !== String(user.user_id)
      );
      this.setData({
        membersList: updatedMembersList
      });
      
      // 从成员isotope 中移除该成员
    const memberIso = this.selectComponent('#clubMemberIsotope')
      if (memberIso && memberIso.removeItem) {
        memberIso.removeItem(`club-member-${String(user.user_id)}`)
      }
    }

    // 设置会长
    const presidentData = {
      id: user.user_id,
      name: user.user_name,
      avatar: user.avatar || '/assets/icons/user.png',
      description: user.phone || '暂无描述',
      phone: user.phone || '',
      department: user.department || '',
      position: user.position || '',
      tag: user.tag || ''
    };

    this.setData({
      selectedPresident: presidentData,
      'formData.president_id': user.user_id
    }, () => {
      // 会长选择后，同步更新搜索结果状态
    this.updateSearchResultsStatus();
      this.updateAddressbookState();
      // 刷新会长选择通讯录状态
    this.pabRefreshSelectedStatus();
      // 刷新成员添加弹窗通讯录状态（更新会长和成员的显示）
    this.abRefreshExistingStatus();
      
      // 动态更新会长isotope：移除旧会长（如果有），添加新会长
    const presIso = this.selectComponent('#presidentIsotope')
      const avatar = 50
      const newPresItem = {
        id: `president-${String(presidentData.id)}`,
        image: (presidentData.avatar && presidentData.avatar.trim()) || '/assets/images/default-avatar.png',
        ini_width: avatar,
        ini_height: avatar,
        user_id: String(presidentData.id),
        user_name: presidentData.name
      }
      
      // 更新会长 isotope
    if (presIso) {
        if (oldPresident && oldPresident.id) {
          // 有旧会长，先移除再添加（需要等待移除动画完成）
      if (presIso.removeItem) {
            presIso.removeItem(`president-${String(oldPresident.id)}`)
          }
          // 等待移除动画完成后再添加新会长（isotope的transitionDuration是0.25s = 250ms）  
          setTimeout(() => {
          if (presIso.addItem) {
                    presIso.addItem(newPresItem, { index: 0 })
                  }
                }, 350) // 等待 350ms，确保移除动画完成
      } else {
          // 没有旧会长，直接添加
        if (presIso.addItem) {
            presIso.addItem(newPresItem, { index: 0 })
          }
        }
      }
      
      // 注意：成员isotope 不显示会长，所以这里不需要更新成员isotope

      wx.showToast({
        title: '会长设置成功',
        icon: 'success'
      });
    });
  },

  // 添加用户到成员列表
  addUserToMembersList(user) {
    // 严格检查是否已存在（防止重复添加）
    const exists = this.data.membersList.some((member) => String(member.user_id) === String(user.user_id));
    const isPresident = this.data.selectedPresident && String(this.data.selectedPresident.id) === String(user.user_id);

    if (exists) {
      this.showErrorToast('该用户已在成员列表中');
      return;
    }

    if (isPresident) {
      this.showErrorToast('该用户已被指定为会长');
      return;
    }

    // 构建新成员对象，确保数据完整性
    const newMember = {
      user_id: user.user_id,
      user_name: user.user_name,
      avatar: user.avatar || '/assets/icons/user.png',
      phone: user.phone || '',
      department: user.department || '',
      tag: user.tag || '',
      role: 'member',
      role_display: '成员',
      is_current_user: false
    };

    // 先动态添加到 isotope（立即显示动画）
    const iso = this.selectComponent('#clubMemberIsotope')
    if (iso && iso.addItem) {
      const avatar = 50
      const newItem = {
        id: `club-member-${String(newMember.user_id)}`,
        image: newMember.avatar || '/assets/images/default-avatar.png',
        ini_width: avatar,
        ini_height: avatar,
        user_id: String(newMember.user_id),
        user_name: newMember.user_name
      }
      // 添加到最前面（新添加的成员）
      iso.addItem(newItem, { index: 0 })
    }

    // 使用函数式更新确保状态正确
    this.setData({
      membersList: [...this.data.membersList, newMember]
    }, () => {
      // 在成员列表更新后，同步更新搜索结果状态
    this.updateSearchResultsStatus();
      this.updateAddressbookState();
      this.abRefreshExistingStatus();
      
      // 如果组件未加载，兜底更新整个数组
    if (!iso || !iso.addItem) {
        this.updateMemberIsotope()
      }

      wx.showToast({
        title: '添加成功',
        icon: 'success'
      });

      // 移除关闭弹窗的代码，让弹窗保持显示      // 旧版 t-popup 已移除：成员选择改为 expandable-container
  });
  },

  // 更新搜索结果状态（防止状态不一致）
  updateSearchResultsStatus() {
    // 更新添加会员的搜索结果状态
    if (this.data.searchResults && this.data.searchResults.length > 0) {
      const updatedSearchResults = this.data.searchResults.map(searchUser => {
        const isInMembers = this.data.membersList.some(member => member.user_id === searchUser.user_id);
        const isPresident = this.data.selectedPresident && this.data.selectedPresident.id === searchUser.user_id;

        return {
          ...searchUser,
          isExistingMember: isInMembers, // 只标记成员，不包含会长          isPresident: isPresident
        };
      });

      this.setData({
        searchResults: updatedSearchResults
      });
    }

    // 更新会长搜索结果状态
    if (this.data.presidentSearchResults && this.data.presidentSearchResults.length > 0) {
      const updatedPresidentSearchResults = this.data.presidentSearchResults.map(presidentUser => {
        const isSelectedPresident = this.data.selectedPresident && this.data.selectedPresident.id === presidentUser.user_id;

        return {
          ...presidentUser,
          isSelectedPresident: isSelectedPresident
        };
      });

      this.setData({
        presidentSearchResults: updatedPresidentSearchResults
      });
    }

    // 更新已加载叶子部门的用户状态
    const deptExpand = this.data.deptExpand || {}
    const newDeptExpand = { ...deptExpand }
    let changed = false
    for (const [deptId, s] of Object.entries(deptExpand)) {
      if (!s || s.type !== 'users' || !Array.isArray(s.users) || !s.users.length) continue
      const updatedUsers = s.users.map((u) => {
        const isExistingMember = this.data.membersList.some((m) => m.user_id === u.user_id)
        const isPresident = this.data.selectedPresident && this.data.selectedPresident.id === u.user_id
        return { ...u, isExistingMember: isExistingMember || isPresident, isSelectedPresident: !!isPresident }
      })
      newDeptExpand[deptId] = { ...s, users: updatedUsers }
      changed = true
    }
    if (changed) this.setData({ deptExpand: newDeptExpand })
  },

  updateAddressbookState() {
    const ids = (this.data.membersList || []).map((m) => String(m.user_id));
    const pid = this.data.selectedPresident && this.data.selectedPresident.id ? String(this.data.selectedPresident.id) : '';
    if (pid) ids.push(pid);
    const uniq = Array.from(new Set(ids));
    this.setData({
      addressbookExistingUserIds: uniq,
      addressbookSelectedPresidentId: pid
    });
  },

  // 通讯录组件：选择会长
  onAddressbookPresidentAction(e) {
    const { action, user } = e.detail || {};
    if (!user) return;
    if (action === 'select_president') this.setPresident(user);
  },

  // 通讯录组件：添加/移除初始成员
  onAddressbookMemberAction(e) {
    const { action, user } = e.detail || {};
    if (!user) return;
    if (action === 'add') this.addUserToMembersList(user);
    else if (action === 'remove') this.removeMember({ currentTarget: { dataset: { userid: user.user_id } } });
  },

  // 点击成员头像
  onMemberAvatarTap(e) {
    const member = e.currentTarget.dataset.member;
    // 标记为pending状态，表示已在缓存中
    const memberDetail = {
      ...member,
      join_date: 'pending',
      role_display: member.role_display || '成员'
    };
    this.setData({
      currentMemberDetail: memberDetail,
      showMemberDetailPopup: true
    });
  },

  // 关闭成员详情弹窗
  closeMemberDetailPopup() {
    this.setData({
      showMemberDetailPopup: false,
      currentMemberDetail: null,
      memberDetailSource: '' // 清空来源信息
  });
  },

  // 移除成员
  removeMember(e) {
    const userId = e.currentTarget.dataset.userid;
    
    wx.showModal({
      title: '确认移除',
      content: '确定要移除该成员吗？',
      success: (res) => {
        if (res.confirm) {
          // 先执行删除动画
    const iso = this.selectComponent('#clubMemberIsotope')
  if (iso && iso.removeItem) {
            iso.removeItem(`club-member-${String(userId)}`)
          }
          
          const updatedMembersList = this.data.membersList.filter(member => 
            String(member.user_id) !== String(userId)
          );
          
          this.setData({
            membersList: updatedMembersList,
            showMemberDetailPopup: false
          }, () => {
            // 移除成员后，同步更新搜索结果状态
    this.updateSearchResultsStatus();
            this.updateAddressbookState();
            this.abRefreshExistingStatus();
            // 注意：不再调用updateMemberIsotope()，因为已经用 iso.removeItem 动态删除了
            
            wx.showToast({
              title: '移除成功',
              icon: 'success'
            });
          });
        }
      }
    });
  },

  // 移除会长
  removePresident() {
    wx.showModal({
      title: '确认移除会长',
      content: '确定要取消该用户的会长职位吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            selectedPresident: null,
            'formData.president_id': '',
            showMemberDetailPopup: false
          }, () => {
            // 移除会长后，同步更新搜索结果状态
    this.updateSearchResultsStatus();
            this.updateAddressbookState();
            
            wx.showToast({
              title: '已移除会长',
              icon: 'success'
            });
          });
        }
      }
    });
  },

  // ========== 表单提交相关方法 ==========
  
  // 表单验证
  validateForm() {
    const { formData } = this.data;
    
    if (!formData.club_name || formData.club_name.trim() === '') {
      this.showErrorToast('请输入协会名称');
      return false;
    }
    
    if (!formData.description || formData.description.trim() === '') {
      this.showErrorToast('请输入协会简介');
      return false;
    }
    
    if (!this.data.coverFile) {
      this.showErrorToast('请设置协会封面');
      return false;
    }
    
    if (!formData.president_id) {
      this.showErrorToast('请选择协会会长');
      return false;
    }
    
    if (this.data.membersList.length < 1) {
      this.showErrorToast(`至少需要添加名初始成员，当前已添加{this.data.membersList.length}名`);
      return false;
    }
    
    return true;
  },

  // 提交表单
  async submitForm() {
    if (this.data.creating) return;
    
    if (!this.validateForm()) return;
    
    this.setData({ creating: true });
    
    try {
      // 1. 上传封面图片
    let coverId = null;
      if (this.data.coverFile) {
        const uploadResult = await this.uploadImage(this.data.coverFile.url);
        coverId = uploadResult.file_id;
      }
      
      // 2. 创建协会（包含cover_id）
    const clubResult = await this.createClub(coverId);      // 3. 批量添加初始成员
    if (clubResult && this.data.membersList.length > 0) {
        await this.addInitialMembers(clubResult.club_id);
      }
      
      // 4. 创建动态，记录社团创建（直接调用app.js的createMomentWithParams）
    if (clubResult) {
        try {
          await app.createMomentWithParams({
            description: `我创建了${clubResult.club_name}社团`,
            imageIds: coverId ? [coverId] : [],
            refEventId: null,
            refClubId: clubResult.club_id,
            throwError: false
          });
        } catch (e) {
          // 不阻塞主流程
  }
      }      // 5. 创建成功后发送通知给新会长
    if (clubResult) {
        try {
          const message_data = {
            booker_id: clubResult.president_id,
            url: `/packageClub/club-manage/index?clubId=${clubResult.club_id}`,
            operation: 'club_created',
            text: `恭喜您被指定?{clubResult.club_name}协会的会长，请尽快完善协会信息并开始管理协会`,
            media: app.convertToThumbnailUrl(clubResult.cover_url, 300)
          };
          await app.message(message_data);
        } catch (error) {        }
      }
      
      // 统一记录变更（club创建）
    if (clubResult && clubResult.club_id) {
        getApp().recordChange(clubResult.club_id, 'create', {
          type: 'club',
          club_id: clubResult.club_id,
          club_name: clubResult.club_name,
          description: clubResult.description,
          president_id: clubResult.president_id,
          cover_url: clubResult.cover_url
        });
      }
      
      // 触发创建成功事件
    this.triggerEvent('create-success', { club: clubResult });
      
      // 延迟后自动关闭 
    setTimeout(() => {
      this.triggerEvent('close');
      }, 1000);
    } catch (error) {      this.showErrorToast('提交失败，请重试');
      // 触发创建失败事件
    this.triggerEvent('create-error', { error: error.message || '提交失败' });
    } finally {
      this.setData({ creating: false });
    }
  },

  // 创建协会 - 返回协会信息
  async createClub(coverId) {
    const { formData } = this.data;
    
    const clubData = {
      club_name: formData.club_name.trim(),
      description: formData.description.trim(),
      charter: formData.charter.trim(),
      president_id: parseInt(formData.president_id),
      cover_id: coverId
    };
    
    const apiPromise = this.request({
      url: '/club/create',
      method: 'PUT',
      data: clubData,
      loadingText: '创建协会?..'
    });
    
    const data = await this.handleApiCall(apiPromise, '协会创建成功', '创建协会失败');
    return data;
  },

  // 批量添加初始成员
  async addInitialMembers(clubId) {
    const memberIds = this.data.membersList.map(member => member.user_id);
    
    const apiPromise = this.request({
      url: `/club/${clubId}/addmember/batch`,
      method: 'POST',
      data: { user_ids: memberIds },
      loadingText: '添加初始成员数..'
    });
    
    return this.handleApiCall(apiPromise, '初始成员添加成功', '添加初始成员失败');
  },

  // 上传图片到服务器
  async uploadImage(imagePath) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: this.data.uploadAPI,
        filePath: imagePath,
        name: 'file',
        header: {
          'Authorization': 'Bearer ' + wx.getStorageSync('token')
        },
        success: (res) => {          try {
            const data = JSON.parse(res.data);
            if (data.Flag === 4000) {
              resolve(data.data);
            } else {
              reject(new Error(data.Msg || '上传失败'));
            }
          } catch (error) {
            reject(new Error('解析响应失败'));
          }
        },
        fail: (error) => {
          reject(error);
        }
      });
    });
  },

  // ========== 部门和全部用户相关方法==========

  // 获取全部部门列表（不包含用户数据）  
  async fetchAllDepartments() {
    if ((this.data.deptTree || []).length > 0) {
      return;
    }
    try {
      const res = await this.request({
        url: `/user/departments`,
        method: 'GET'
      });
      if (res.Flag == 4000 && res.data && res.data.departments) {
        const departments = (res.data.departments || []).map((d) => ({
          ...d,
          department_id: String(d.department_id)
        }))
        this.setData({ deptTree: departments })
      }
    } catch (error) {    }
  },

  async expandDepartment(deptId) {
    const key = String(deptId)
    const existing = (this.data.deptExpand || {})[key]
    if (existing && existing.loaded) return

    this.setData({
      [`deptExpand.${key}`]: { loading: true, loaded: false, type: null, departments: [], users: [] }
    })

    try {
      const res = await this.request({ url: `/user/departments/${key}/expand`, method: 'GET' })
      if (res.Flag == 4000 && res.data) {
        if (res.data.type === 'children') {
          this.setData({
            [`deptExpand.${key}`]: {
              loading: false,
              loaded: true,
              type: 'children',
              departments: (res.data.departments || []).map((d) => ({ ...d, department_id: String(d.department_id) })),
              users: []
            }
          })
        } else if (res.data.type === 'users') {
          const rawUsers = res.data.users || []
          const usersWithStatus = rawUsers.map((user) => {
            const existingMember = this.data.membersList.find((m) => m.user_id === user.user_id)
            const isPresident = this.data.selectedPresident && this.data.selectedPresident.id === user.user_id
          return {
            ...user,
              isExistingMember: !!existingMember || !!isPresident,
              isSelectedPresident: !!isPresident
            }
          })
      this.setData({
            [`deptExpand.${key}`]: {
              loading: false,
              loaded: true,
              type: 'users',
              departments: [],
              users: usersWithStatus
            }
          })
        } else {
          this.setData({ [`deptExpand.${key}.loading`]: false, [`deptExpand.${key}.loaded`]: true })
        }
      } else {
        this.setData({ [`deptExpand.${key}.loading`]: false })
      }
    } catch (e) {
      this.setData({ [`deptExpand.${key}.loading`]: false })
    }
  },

  // 部门折叠面板展开事件处理
  onDepartmentChange(e) {
    const detail = e.detail; // TDesign 返回 {value: Array} 的结果
    const v = detail ? detail.value : null
    const currentValue = Array.isArray(v) ? v[0] : v
    if (currentValue == null || currentValue === '') return
    this.expandDepartment(String(currentValue))
  },

  findUserInDeptState(userId) {
    const sid = String(userId)
    const deptExpand = this.data.deptExpand || {}
    for (const s of Object.values(deptExpand)) {
      const u = (s?.users || []).find((x) => String(x.user_id) === sid)
      if (u) return u
    }
    return null
  },

  // ===== 通讯录导航（对齐 club-members）=====
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
    const sid = String(userId)
    const isInMembers = this.data.membersList.some((m) => String(m.user_id) === sid)
    const isPresident = this.data.selectedPresident && String(this.data.selectedPresident.id) === sid
    return isInMembers || isPresident
  },

  // 判断用户是否是会长
  abIsPresident(userId) {
    const sid = String(userId)
    return this.data.selectedPresident && String(this.data.selectedPresident.id) === sid
  },

  // 判断用户是否在成员列表中（不包含会长）
  abIsInMembersList(userId) {
    const sid = String(userId)
    return this.data.membersList.some((m) => String(m.user_id) === sid)
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
            const isPresident = this.abIsPresident(uid)
            const isInMembers = this.abIsInMembersList(uid)
            return {
              ...u,
              user_id: uid,
              is_current_user: false,
              isPresident: isPresident,
              isExistingMember: isInMembers // 只标记成员，不包含会长
  }
          })
          this.setData({
            [`abDeptExpand.${key}`]: {
              loading: false,
              loaded: true,
              type: 'users',
              departments: [],
              users
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
    if (action === 'add') {
      // 检查是否是会长
    if (user.isPresident || this.abIsPresident(user.user_id)) {
        this.showErrorToast('该用户已被指定为会长')
        return
      }
      this.addUserToMembersList(user)
    }
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
        const nextIsPresident = this.abIsPresident(uid)
        const nextIsInMembers = this.abIsInMembersList(uid)
        if (u.isExistingMember !== nextIsInMembers || u.isPresident !== nextIsPresident) changed = true
        return { ...u, isExistingMember: nextIsInMembers, isPresident: nextIsPresident }
      })
      updates[`abDeptExpand.${deptId}.users`] = nextUsers
      
      // 如果是当前显示的部门，保存更新后的用户列表
    if (String(deptId) === currentDeptId) {
        currentDeptNextUsers = nextUsers
      }
    }
    
    // 同时更新 abCurrentUsers，避免setData 异步导致读取旧数据
    if (this.data.abViewType === 'users' && currentDeptNextUsers) {
      updates.abCurrentUsers = currentDeptNextUsers
    }
    
    if (changed || currentDeptNextUsers) {
      this.setData(updates)
    }
  },

  // ===== 头像墙相关=====
  updateMemberIsotope() {
    // 成员 isotope 只显示成员，不显示会长（会长有单独的isotope）
    const members = Array.isArray(this.data.membersList) ? this.data.membersList : []
    const avatar = 50

    const items = members.map((m) => ({
      id: `club-member-${String(m.user_id)}`,
      image: m.avatar || '/assets/images/default-avatar.png',
      ini_width: avatar,
      ini_height: avatar,
      user_id: String(m.user_id),
      user_name: m.user_name
    }))

    // 检查isotope 组件是否已经加载且有items
    const iso = this.selectComponent('#clubMemberIsotope')
    const currentItems = iso && iso.data && iso.data.itemsWithPosition || []
    
    // 如果组件已经加载且有items，且?items 只是数量变化（可能是动态操作），    // 就不更新 memberAvatarItems，避免触发onItemsChange 导致全部重新初始化
    if (currentItems.length > 0 && items.length > 0) {
      const currentIds = new Set(currentItems.map(i => String(i.id || '')))
      const newIds = new Set(items.map(i => String(i.id)))
      
      // 如果只是新增一个或删除一个，就不更新，让动态接口处理
    const diff = Math.abs(items.length - currentItems.length)
  if (diff <= 1) {
        const allCurrentInNew = Array.from(currentIds).every(id => newIds.has(id))
        const allNewInCurrent = Array.from(newIds).every(id => currentIds.has(id))
        
        if (allCurrentInNew || allNewInCurrent) {
          // 只同步数据到组件内部，不更新 memberAvatarItems
          // 动态接口已经处理了，这里只更新数据源，不触发重新初始化
          return
        }
      }
    }

    this.setData({ memberAvatarItems: items })
  },

  onIsoHeightChange(e) {
    const { heightStr } = e.detail
    this.setData({ memberIsoHeight: heightStr })
  },

  // 会长 isotope 高度变化
  onPresidentIsoHeightChange(e) {
    const { heightStr } = e.detail
    this.setData({ presidentIsoHeight: heightStr })
  },

  // 更新会长 isotope 头像墙（仅用于首次打开弹窗时初始化）
  updatePresidentIsotope() {
    const president = this.data.selectedPresident
    const avatar = 50

    if (!president) {
      this.setData({ presidentAvatarItems: [] })
      return
    }

    const items = [{
      id: `president-${String(president.id)}`,
      image: president.avatar || '/assets/images/default-avatar.png',
      ini_width: avatar,
      ini_height: avatar,
      user_id: String(president.id),
      user_name: president.name
    }]

    // 检查isotope 组件是否已经加载且有items
    const iso = this.selectComponent('#presidentIsotope')
    const currentItems = iso && iso.data && iso.data.itemsWithPosition || []
    
    // 如果组件已经?items，检查是否需要更新
    if (currentItems.length > 0) {
      // 检查当前显示的会长是否与selectedPresident一致
    const currentPresidentId = currentItems[0]?.id
      const newPresidentId = items[0]?.id
      
      // 如果是同一个会长，不更新
    if (currentPresidentId === newPresidentId) {
        return
      }
      
      // 如果是不同会长，说明 setPresident 中的动态操作可能还在进行中
      // 这里不更新presidentAvatarItems，让动态操作完成      // 但如果动态操作失败了，需要兜底更新      // 检查当?isotope 中的会长是否与selectedPresident匹配
    const expectedId = `president-${String(president.id)}`
      if (currentPresidentId !== expectedId) {
        // 动态操作可能失败了，强制更新
    this.setData({ presidentAvatarItems: items })
  }
      return
    }
    
    // 组件没有 items 时设置（首次打开弹窗时
    this.setData({ presidentAvatarItems: items })
  },

  // ===== 会长选择通讯录导航（pab = president addressbook）=====
  async pabEnsureLoaded() {
    if (Number(this.data.presidentTab) !== 1) return
    if ((this.data.pabDeptTree || []).length) return
    await this.pabFetchAllDepartments()
  },

  async pabFetchAllDepartments() {
    try {
      this.setData({ pabLoading: true })
      const res = await this.request({ url: `/user/departments`, method: 'GET' })
      if (res.Flag == 4000 && res.data && Array.isArray(res.data.departments)) {
        const departments = (res.data.departments || []).map((d) => ({
          ...d,
          department_id: String(d.department_id)
        }))
        this.setData({
          pabDeptTree: departments,
          pabDeptExpand: {},
          pabNavStack: [],
          pabNavTitle: '',
          pabViewType: 'root',
          pabCurrentDeptId: '',
          pabCurrentDepartments: [],
          pabCurrentUsers: []
        })
      } else {
        this.setData({ pabDeptTree: [], pabDeptExpand: {}, pabViewType: 'root', pabNavStack: [], pabNavTitle: '' })
      }
    } catch (e) {
      this.setData({ pabDeptTree: [], pabDeptExpand: {}, pabViewType: 'root', pabNavStack: [], pabNavTitle: '' })
    } finally {
      this.setData({ pabLoading: false })
    }
  },

  pabIsSelectedPresident(userId) {
    const president = this.data.selectedPresident
    return president && String(president.id) === String(userId)
  },

  pabUpdateNavTitle() {
    const stack = this.data.pabNavStack || []
    const title = stack.map((d) => d.department_name).filter(Boolean).join(' / ')
    this.setData({ pabNavTitle: title })
  },

  async pabEnterDept(e) {
    const dept = e?.currentTarget?.dataset?.dept
    if (!dept) return
    const deptId = String(dept.department_id || '')
    if (!deptId) return

    const nextStack = [...(this.data.pabNavStack || []), { ...dept, department_id: deptId }]
    this.setData({ pabNavStack: nextStack, pabCurrentDeptId: deptId }, () => this.pabUpdateNavTitle())

    await this.pabEnsureDeptExpanded(deptId)
    this.pabBuildViewForDept(deptId)
  },

  pabNavBack() {
    const stack = [...(this.data.pabNavStack || [])]
    if (!stack.length) return
    stack.pop()
    const top = stack[stack.length - 1]
    const deptId = top ? String(top.department_id) : ''
    this.setData(
      {
        pabNavStack: stack,
        pabCurrentDeptId: deptId,
      },
      () => {
        this.pabUpdateNavTitle()
        if (!deptId) {
          this.setData({ pabViewType: 'root', pabCurrentDepartments: [], pabCurrentUsers: [] })
        } else {
          this.pabBuildViewForDept(deptId)
        }
      }
    )
  },

  pabBuildViewForDept(deptId) {
    const s = (this.data.pabDeptExpand || {})[String(deptId)]
    if (!s || !s.loaded) {
      this.setData({ pabViewType: 'children', pabCurrentDepartments: [], pabCurrentUsers: [] })
      return
    }
    if (s.type === 'children') {
      this.setData({ pabViewType: 'children', pabCurrentDepartments: s.departments || [], pabCurrentUsers: [] })
      return
    }
    if (s.type === 'users') {
      this.setData({ pabViewType: 'users', pabCurrentDepartments: [], pabCurrentUsers: s.users || [] })
      return
    }
    this.setData({ pabViewType: 'children', pabCurrentDepartments: [], pabCurrentUsers: [] })
  },

  async pabEnsureDeptExpanded(deptId) {
    const key = String(deptId)
    const existing = (this.data.pabDeptExpand || {})[key]
    if (existing && existing.loaded) return
    await this.pabExpandDepartment(key)
  },

  async pabExpandDepartment(deptId) {
    const key = String(deptId)
    const existing = (this.data.pabDeptExpand || {})[key]
    if (existing && existing.loaded) return

    this.setData({
      pabLoading: true,
      [`pabDeptExpand.${key}`]: { loading: true, loaded: false, type: null, departments: [], users: [] }
    })

    try {
      const res = await this.request({ url: `/user/departments/${key}/expand`, method: 'GET' })
      if (res.Flag == 4000 && res.data) {
        if (res.data.type === 'children') {
          const departments = (res.data.departments || []).map((d) => ({
            ...d,
            department_id: String(d.department_id)
          }))
          this.setData({
            [`pabDeptExpand.${key}`]: {
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
            return {
              ...u,
              user_id: uid,
              isSelectedPresident: this.pabIsSelectedPresident(uid)
            }
          })
          this.setData({
            [`pabDeptExpand.${key}`]: {
              loading: false,
              loaded: true,
              type: 'users',
              departments: [],
              users
            }
          })
        } else {
          this.setData({
            [`pabDeptExpand.${key}`]: { loading: false, loaded: true, type: 'children', departments: [], users: [] }
          })
        }
      } else {
        this.setData({ [`pabDeptExpand.${key}.loading`]: false })
      }
    } catch (e) {
      this.setData({ [`pabDeptExpand.${key}.loading`]: false })
    } finally {
      this.setData({ pabLoading: false })
    }
  },

  // 从会长选择通讯录选择会长
  pabSelectPresident(e) {
    const user = e?.currentTarget?.dataset?.user
    if (!user) return
    this.setPresident(user)
  },

  // 刷新会长选择通讯录中的已选状态
  pabRefreshSelectedStatus() {
    const expand = this.data.pabDeptExpand || {}
    const updates = {}
    let changed = false
    let currentDeptNextUsers = null
    const currentDeptId = String(this.data.pabCurrentDeptId || '')
    
    for (const [deptId, s] of Object.entries(expand)) {
      if (!s || s.type !== 'users' || !Array.isArray(s.users)) continue
      const nextUsers = s.users.map((u) => {
        const uid = String(u.user_id)
        const nextSelected = this.pabIsSelectedPresident(uid)
        if (u.isSelectedPresident !== nextSelected) changed = true
        return { ...u, isSelectedPresident: nextSelected }
      })
      updates[`pabDeptExpand.${deptId}.users`] = nextUsers
      
      if (String(deptId) === currentDeptId) {
        currentDeptNextUsers = nextUsers
      }
    }
    
    // 同时更新 pabCurrentUsers
    if (this.data.pabViewType === 'users' && currentDeptNextUsers) {
      updates.pabCurrentUsers = currentDeptNextUsers
    }
    
    // 同时更新搜索结果中的状态
    if (this.data.presidentSearchResults && this.data.presidentSearchResults.length > 0) {
      const updatedResults = this.data.presidentSearchResults.map(u => ({
        ...u,
        isSelectedPresident: this.pabIsSelectedPresident(u.user_id)
      }))
      updates.presidentSearchResults = updatedResults
      changed = true
    }
    
    if (changed || currentDeptNextUsers) {
      this.setData(updates)
    }
  },

  onAddMemberCollapse() {
    // 收起时不清空数据，保持状态
  },
  removeUserFromList(e) {
    const userId = e.currentTarget.dataset.userid
    const userName = e.currentTarget.dataset.username
    
    wx.showModal({
      title: '确认移除',
      content: `确定要移除${userName || '该成员'} 吗？`,
      success: (res) => {
        if (res.confirm) {
          // 先执行删除动画
    const iso = this.selectComponent('#clubMemberIsotope')
  if (iso && iso.removeItem) {
            iso.removeItem(`club-member-${String(userId)}`)
          }
          
          const updatedMembersList = this.data.membersList.filter(member => 
            String(member.user_id) !== String(userId)
          )
          
          this.setData({
            membersList: updatedMembersList
          }, () => {
            this.updateSearchResultsStatus()
            this.updateAddressbookState()
            this.abRefreshExistingStatus()
            // 注意：不再调用updateMemberIsotope()，因为已经用 iso.removeItem 动态删除了
            
            wx.showToast({
              title: '移除成功',
              icon: 'success'
            })
          })
        }
      }
    })
  },

  catchTouchMove() {
    return
  }
  },

  lifetimes: {
    attached() {
      // 组件实例被放入页面节点树时执数
      // 初始化完成后触发 loaded 事件
    this.triggerEvent('loaded');
    },
    
    ready() {
      // 组件在视图层布局完成后执数
      // 注意：loaded 事件数attached 中触发，不在这里触发
  },
    
    detached() {
      // 组件实例被从页面节点树移除时执行
  }
  }
});