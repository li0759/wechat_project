const app = getApp();

const ENTER_LEAVE_MS = 180;

Component({
  properties: {
    /** 是否激活（弹窗打开且位于“全部用户”tab时设置true），避免无意义请求*/
    active: { type: Boolean, value: false },
    /** 模式：add | president | event */
    mode: { type: String, value: 'add' },
    /** 已存在成员（禁用/打勾?*/
    existingUserIds: { type: Array, value: [] },
    /** 会长选择：当前已完成user_id */
    selectedUserId: { type: String, value: '' },
    /** 活动邀请：允许添加载user_id 列表（不在列表内则不显示按钮?*/
    eligibleUserIds: { type: Array, value: [] },
    /** 主题?*/
    themeColor: { type: String, value: '#667eea' },
    /** 缩进步长（rpx），层级越深缩进越大 */
    indentStep: { type: Number, value: 16 },
    /** 调试模式：展示节点状态并输出日志 */
    debug: { type: Boolean, value: false }
  },

  data: {
    deptTree: [],
    // 用“可见列表”渲染，避免 WXML template 递归被运行时强制停止
    visibleItems: []
  },

  observers: {
    active(val) {
      if (val) this.ensureLoaded();
    },
    'existingUserIds, selectedUserId, eligibleUserIds, debug'(a, b, c, d) {
      // 这些字段变化会影响按钮选中心调试行显示，重建可见列表即可
    if (Array.isArray(this.data.deptTree) && this.data.deptTree.length) this.rebuildVisible();
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
        });
      });
    },

    async ensureLoaded() {
      if (Array.isArray(this.data.deptTree) && this.data.deptTree.length) return;
      await this.reload();
    },

    async reload() {
      try {
        if (this.properties.debug) {
          const res = await this.request({ url: `/user/departments`, method: 'GET' });
        }       
          
        if (res.Flag == 4000 && res.data && Array.isArray(res.data.departments)) {
          const departments = res.data.departments.map((d) => this.normalizeDeptNode(d));
          this.setData({ deptTree: departments }, () => this.rebuildVisible());
        } else {
          this.setData({ deptTree: [], visibleItems: [] });
        }
      } catch (e) {
        this.setData({ deptTree: [], visibleItems: [] });
      }
    },

    normalizeDeptNode(d) {
      return {
        ...d,
        department_id: String(d.department_id),
        _open: false,
        _loading: false,
        _loaded: false,
        _type: null, // children | users
        _departments: [],
        _users: []
      };
    },

    findNodePathById(nodes, id, basePath) {
      const sid = String(id);
      const list = Array.isArray(nodes) ? nodes : [];
      for (let i = 0; i < list.length; i++) {
        const n = list[i];
        const p = `${basePath}[${i}]`;
        if (String(n.department_id) === sid) return p;
        const child = n && n._departments;
        if (Array.isArray(child) && child.length) {
          const found = this.findNodePathById(child, sid, `${p}._departments`);
          if (found) return found;
        }
      }
      return '';
    },

    rebuildVisible() {
      const items = [];
      const walk = (nodes, level, basePath) => {
        const list = Array.isArray(nodes) ? nodes : [];
        for (let i = 0; i < list.length; i++) {
          const node = list[i];
          if (!node) continue;
          const path = `${basePath}[${i}]`;
          const deptId = String(node.department_id);

          items.push({
            kind: 'dept',
            key: `dept-${deptId}`,
            path,
            level,
            deptId,
            department_name: node.department_name,
            user_count_total: node.user_count_total || 0,
            _open: !!node._open,
            _loaded: !!node._loaded,
            _loading: !!node._loading,
            _type: node._type || null,
            _departments_len: (node._departments && node._departments.length) || 0,
            _users_len: (node._users && node._users.length) || 0
          });

          if (!node._open) continue;

          if (this.properties.debug) {
            items.push({
              kind: 'debug',
              key: `debug-${deptId}`,
              level: level + 1,
              ownerPath: path,
              text: `debug id=${deptId} open=${node._open ? 1 : 0} loaded=${node._loaded ? 1 : 0} loading=${
                node._loading ? 1 : 0
              } type=${node._type || 'none'} c=${(node._departments && node._departments.length) || 0} u=${
                (node._users && node._users.length) || 0
              }`
            });
          }

          if (node._loading) {
            items.push({ kind: 'loading', key: `loading-${deptId}`, level: level + 1, ownerPath: path });
            continue;
          }

          if (!node._loaded) {
            items.push({ kind: 'hint', key: `hint-${deptId}`, level: level + 1, ownerPath: path, text: '点击上方展开加载' });
            continue;
          }

          if (node._type === 'children') {
            const children = node._departments || [];
            if (!children.length) {
              items.push({ kind: 'empty', key: `empty-${deptId}`, level: level + 1, ownerPath: path, text: '暂无子部门' });
            } else {
              walk(children, level + 1, `${path}._departments`);
            }
          } else if (node._type === 'users') {
            const users = node._users || [];
            if (!users.length) {
              items.push({ kind: 'empty', key: `empty-${deptId}`, level: level + 1, ownerPath: path, text: '暂无成员' });
            } else {
              for (const u of users) {
                const uid = String(u.user_id || '');
                const computedUser = {
                  ...u,
                  user_id: uid,
                  isExistingMember: this.isExisting(uid),
                  isSelected: this.isSelected(uid),
                  eligible: this.isEligible(uid)
                };
                items.push({
                  kind: 'user',
                  key: `user-${deptId}-${uid}`,
                  level: level + 1,
                  ownerPath: path,
                  user: computedUser
                });
              }
            }
          } else {
            items.push({ kind: 'empty', key: `empty-${deptId}`, level: level + 1, ownerPath: path, text: '暂无数据' });
          }
        }
      };
      walk(this.data.deptTree, 0, 'deptTree');
      this.setData({ visibleItems: items });
    },

    onDeptTap(e) {
      const deptId = String(e.currentTarget.dataset.id || '');
      if (!deptId) return;

      const path = String(e.currentTarget.dataset.path || this.findNodePathById(this.data.deptTree, deptId, 'deptTree'));
      if (!path) return;

      const ds = e.currentTarget.dataset || {};
      const isOpen = ds.open === true || ds.open === 'true';
      const loaded = ds.loaded === true || ds.loaded === 'true';

      if (this.properties.debug)      // 展开：先打开节点，再 rebuildVisible 让子项带 enter 动画出现
    if (!isOpen) {
        this.setData({ [`${path}._open`]: true }, () => this.rebuildVisible());
        if (!loaded) this.expandDepartment(deptId, path);
        return;
      }

      // 收回：先标记子项 leaving 动画，延?rebuildVisible 真正移除
    this.setData({ [`${path}._open`]: false }, () => this.animateCollapse(path));
    },

    animateCollapse(path) {
      const base = `${path}._departments`;
      const list = Array.isArray(this.data.visibleItems) ? this.data.visibleItems : [];

      // 收集所有“子部门路径”（用于命中用户/提示?ownerPath数
      const deptPaths = new Set([path]);
  for (const it of list) {
        if (it && it.kind === 'dept' && it.path && String(it.path).startsWith(base)) {
          deptPaths.add(String(it.path));
        }
      }

      const next = list.map((it) => {
        if (!it) return it;
        if (it.kind === 'dept') {
          if (it.path === path) return { ...it, _open: false };
          if (it.path && String(it.path).startsWith(base)) return { ...it, _leaving: true };
          return it;
        }
        if (it.ownerPath && deptPaths.has(String(it.ownerPath))) return { ...it, _leaving: true };
        return it;
      });

      // 覆盖一次可见列表，让离场动画先跑起数
      this.setData({ visibleItems: next });

      // 清理旧定时器，避免快速点按导致错数
      if (this.__collapseTimer) clearTimeout(this.__collapseTimer);
    this.__collapseTimer = setTimeout(() => {
        this.rebuildVisible();
        this.__collapseTimer = null;
      }, ENTER_LEAVE_MS);
    },

    async expandDepartment(deptId, knownPath) {
      const key = String(deptId);
      const path = knownPath || this.findNodePathById(this.data.deptTree, key, 'deptTree');
      if (!path) return;

      if (this.properties.debug)      this.setData({ [`${path}._loading`]: true, [`${path}._loaded`]: false }, () => this.rebuildVisible());

      try {
        const res = await this.request({ url: `/user/departments/${key}/expand`, method: 'GET' });
        if (this.properties.debug)        if (res.Flag == 4000 && res.data) {
          if (res.data.type === 'children') {
            const children = (res.data.departments || []).map((d) => this.normalizeDeptNode(d));
            this.setData({
              [`${path}._loading`]: false,
              [`${path}._loaded`]: true,
              [`${path}._type`]: 'children',
              [`${path}._departments`]: children,
              [`${path}._users`]: []
            }, () => this.rebuildVisible());
          } else if (res.data.type === 'users') {
            const users = (res.data.users || []).map((u) => ({
              ...u,
              user_id: String(u.user_id),
              isExistingMember: this.isExisting(String(u.user_id)),
              isSelected: this.isSelected(String(u.user_id)),
              eligible: this.isEligible(String(u.user_id))
            }));
            this.setData({
              [`${path}._loading`]: false,
              [`${path}._loaded`]: true,
              [`${path}._type`]: 'users',
              [`${path}._departments`]: [],
              [`${path}._users`]: users
            }, () => this.rebuildVisible());
          } else {
            this.setData({
              [`${path}._loading`]: false,
              [`${path}._loaded`]: true,
              [`${path}._type`]: 'children',
              [`${path}._departments`]: [],
              [`${path}._users`]: []
            }, () => this.rebuildVisible());
          }
        } else {
          this.setData({ [`${path}._loading`]: false }, () => this.rebuildVisible());
        }
      } catch (e) {
        if (this.properties.debug)        this.setData({ [`${path}._loading`]: false }, () => this.rebuildVisible());
      }
    },

    isExisting(userId) {
      const arr = this.properties.existingUserIds || [];
      return arr.some((x) => String(x) === String(userId));
    },

    isSelected(userId) {
      const sid = this.properties.selectedUserId;
      if (!sid) return false;
      return String(sid) === String(userId);
    },

    isEligible(userId) {
      const ids = this.properties.eligibleUserIds || [];
      if (!ids.length) return true; // 未提供则默认可添数
      return ids.some((x) => String(x) === String(userId));
  },

    onUserAction(e) {
      const user = e.currentTarget.dataset.user;
      if (!user) return;
      const mode = this.properties.mode || 'add';
      const actionHint = e.currentTarget.dataset.action;
      let action = String(actionHint || '');
      if (mode === 'president') action = 'select_president';
      else if (action !== 'add' && action !== 'remove') action = 'add';

      this.triggerEvent('useraction', { action, mode, user });
    }
  }
});


