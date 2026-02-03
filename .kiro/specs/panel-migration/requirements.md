# Panel 迁移需求文档

## 目标
将 Profile 页面中的 4 个页面改造为 Panel 组件，实现弹窗式交互，提升用户体验。

## 已有 Panel 的标准结构（参考模板）

### Component 结构
```javascript
Component({
  properties: {
    // 必需的参数，如 eventId, clubId 等
  },
  
  data: {
    loading: true,
    // 其他数据
  },
  
  lifetimes: {
    attached() {
      // 组件初始化
      // 不在这里加载数据
    }
  },
  
  methods: {
    // 懒加载入口：供外部调用，只有弹窗展开时才加载数据
    loadData() {
      this._hasExpanded = true;
      if (this._loaded) return Promise.resolve();
      this._loaded = true;
      
      // 加载数据逻辑
      // ...
      
      this.setData({ loading: false });
      this.triggerEvent('loaded'); // 触发加载完成事件
    },
    
    // 其他方法
  }
})
```

### 关键点
1. **不在 `attached()` 中加载数据**，只做初始化
2. **提供 `loadData()` 方法**供父组件调用
3. **使用 `_loaded` 标志**防止重复加载
4. **加载完成后触发 `loaded` 事件**
5. **使用 `loading` 状态**控制骨架屏显示

## 改造列表

### 1. club-members-panel - 成员管理 ✅ 优先级最高
- **原页面**: `/packageProfile/club-members/index`
- **目标位置**: `/packageProfile/components/club-members-panel/index`
- **骨架屏**: `/components/panel-skeleton/club-members-skeleton/index`
- **功能**: 
  - 显示协会成员列表（按首字母索引）
  - 搜索成员
  - 添加成员（通讯录 + 搜索）
  - 修改成员角色
  - 移除成员
- **参数**: `club-id`
- **参考**: `club-manage-panel` (成员管理部分)

### 2. joined-events-panel - 我的活动列表
- **原页面**: `/packageEvent/index` (通过 url 参数区分不同类型)
- **目标位置**: `/packageEvent/components/joined-events-panel/index`
- **骨架屏**: `/components/panel-skeleton/joined-events-skeleton/index`
- **功能**:
  - Tab 切换：全部/预计开始/正在进行/已结束
  - 活动列表展示（瀑布流）
  - 点击活动触发 navigate 事件
- **参数**: `event-type` (all/prego/going/ended)
- **注意**: 原页面自带骨架屏，需要移到 panel-skeleton 中
- **参考**: `event-manage-panel` (列表展示部分)

### 3. joined-clubs-panel - 我的协会列表
- **原页面**: `/packageClub/index?url=/club/user_joined/list`
- **目标位置**: `/packageClub/components/joined-clubs-panel/index`
- **骨架屏**: `/components/panel-skeleton/joined-clubs-skeleton/index`
- **功能**:
  - 显示已加入的协会列表
  - 点击协会触发 navigate 事件
- **参数**: 无
- **参考**: `club-manage-panel` (列表展示部分)

### 4. all-clubs-panel - 所有协会列表
- **原页面**: `/packageClub/index?url=/club/list/all`
- **目标位置**: `/packageClub/components/all-clubs-panel/index`
- **骨架屏**: `/components/panel-skeleton/all-clubs-skeleton/index`
- **功能**:
  - 显示所有协会列表
  - 搜索协会
  - 点击协会触发 navigate 事件
- **参数**: 无
- **参考**: `club-manage-panel` (列表展示部分)

## 改造要求

### Panel 组件标准
1. **组件类型**: Component（不是 Page）
2. **生命周期**: 
   - `lifetimes.attached()` - 只做初始化，不加载数据
   - 提供 `loadData()` 方法供父组件调用
3. **状态管理**:
   - `loading: true` - 初始加载状态
   - `_loaded` - 防止重复加载
   - `_hasExpanded` - 标记是否已展开过
4. **事件触发**: 
   - `loaded` - 数据加载完成（在 `loadData()` 结束时触发）
   - `close` - 关闭 panel
   - `navigate` - 需要跳转到其他页面（传递目标 URL）
5. **导航栏**: 
   - 自定义导航栏
   - 返回按钮触发 `close` 事件

### 骨架屏标准
1. **位置**: `/components/panel-skeleton/[name]-skeleton/`
2. **内容**: 使用 `t-skeleton` 组件模拟真实内容
3. **样式**: 与真实内容布局一致
4. **参考**: 已有的 6 个骨架屏组件

### Profile 页面集成标准
1. **globalPopup 扩展**: 
   - 添加新的 type: `'club-members'`, `'joined-events'`, `'joined-clubs'`, `'all-clubs'`
   - 支持传递参数（如 clubId, eventType）
2. **延迟渲染**: 
   - 使用 `renderPanel: false` 机制
   - 在 `onGlobalPopupContentReady()` 中设置 `renderPanel: true`
   - 在 `renderPanel: true` 后调用 panel 的 `loadData()`
3. **componentPlaceholder**: 
   - 配置骨架屏占位符
   - 格式: `"panel-name": "skeleton-name"`

## 代码风格要求
1. **参考已有 panel**: 严格遵循已有 6 个 panel 的代码结构和风格
2. **命名规范**: 与已有 panel 保持一致
3. **注释风格**: 与已有 panel 保持一致
4. **错误处理**: 与已有 panel 保持一致
5. **UI 组件**: 使用相同的 UI 组件库（vant-weapp, tdesign-miniprogram）

## 实施步骤

### 阶段 1: club-members-panel ⏳ 进行中
1. ✅ 研究已有 panel 的结构和代码风格
2. ⏳ 创建 panel 组件目录结构
3. ⏳ 复制原页面代码并改造为 Component
4. ⏳ 创建骨架屏组件
5. ⏳ 在 Profile 页面中集成
6. ⏳ 测试功能

### 阶段 2: joined-events-panel
### 阶段 3: joined-clubs-panel
### 阶段 4: all-clubs-panel

## 注意事项
1. ✅ 原页面保持不变，以便其他地方继续使用
2. ✅ Panel 组件需要处理好数据刷新和状态管理
3. ✅ 骨架屏要与真实内容布局一致
4. ✅ 测试跨分包加载和 componentPlaceholder 功能
5. ✅ 严格参考已有 panel 的结构和代码风格

