# Implementation Tasks

## Task 1: Isotope 组件新增 showQuickAction 属性和 quickaction 事件

**Requirements Addressed:** Req 1

**Files to Modify:**
- `components/isotope/index.js`
- `components/isotope/index.wxml`
- `components/isotope/index.wxss`

**Acceptance Criteria:**
- [x] 新增 `showQuickAction` 属性（Boolean，默认 false）
- [x] 当 `showQuickAction=true` 且 item 包含 `is_joined` 字段时，在头像右上角渲染快速操作按钮
- [x] `is_joined=false` 时显示绿色 "+" 按钮，`is_joined=true` 时显示红色 "-" 按钮
- [x] 快速操作按钮使用 `catchtap` 阻止冒泡
- [x] 点击快速操作按钮触发 `quickaction` 事件，携带 `{ index, id, item, action }` 数据

**Implementation Details:**

1. 在 `index.js` 的 properties 中添加：
```javascript
showQuickAction: {
  type: Boolean,
  value: false
}
```

2. 在 `index.js` 的 methods 中添加：
```javascript
onQuickActionTap(e) {
  const { index, id, item } = e.currentTarget.dataset
  const action = item.is_joined ? 'remove' : 'add'
  this.triggerEvent('quickaction', { index, id, item, action })
}
```

3. 在 `index.wxml` 的 `isotope-item-image` view 内部添加快速操作按钮

4. 在 `index.wxss` 中添加快速操作按钮样式

---

## Task 2: 替换 t-grid 为 isotope 布局

**Requirements Addressed:** Req 2

**Files to Modify:**
- `components/event-manage-panel/index.wxml`
- `components/event-manage-panel/index.js`
- `components/event-manage-panel/index.json`

**Acceptance Criteria:**
- [x] 移除 card-members 弹窗内的 t-grid + t-grid-item 结构
- [x] 使用 isotope 组件替代，配置 `layoutMode="fitRows"`
- [x] 配置 `showQuickAction="{{true}}"` 启用快速操作按钮
- [x] 成员数据包含 `is_joined` 字段用于按钮状态区分

**Implementation Details:**

1. 在 `index.json` 中确保已引入 isotope 组件

2. 在 `index.js` 中添加：
   - `memberIsotopeItems` 数据
   - `memberIsoHeight` 数据
   - `buildMemberIsotopeItems()` 方法
   - `updateMemberIsotope()` 方法

3. 在 `index.wxml` 中替换 t-grid 为 isotope：
```xml
<isotope
  id="eventMemberIsotope"
  items="{{memberIsotopeItems}}"
  layoutMode="fitRows"
  width="700rpx"
  height="{{memberIsoHeight}}"
  gutter="{{12}}"
  transitionDuration="0.3s"
  backgroundColor="transparent"
  imageStyle="{{memberImageStyle}}"
  showLabel="{{true}}"
  labelStyle="{{memberLabelStyle}}"
  labelHeight="{{32}}"
  autoHeight="{{true}}"
  showQuickAction="{{true}}"
  sortBy="{{memberSortBy}}"
  sortAscending="{{memberSortAscending}}"
  bind:heightChange="onMemberIsoHeightChange"
  bind:itemtap="onMemberItemTap"
  bind:quickaction="onMemberQuickAction"
/>
```

---

## Task 3: 实现共享成员详情弹窗

**Requirements Addressed:** Req 3

**Files to Modify:**
- `components/event-manage-panel/index.wxml`
- `components/event-manage-panel/index.js`

**Acceptance Criteria:**
- [x] 在组件底部添加共享的 expandable-container 弹窗
- [x] 通过 `currentMember` 数据控制弹窗显示内容
- [x] 弹窗显示成员头像、姓名、角色、部门、职位、联系电话
- [x] 弹窗显示参加状态和打卡状态
- [x] 未参加成员显示"把ta加入活动"按钮
- [x] 已参加成员显示"把ta退出活动"按钮
- [x] 弹窗从点击位置展开（涟漪效果）

**Implementation Details:**

1. 在 `index.js` 的 data 中添加 `currentMember: null`

2. 添加 `onMemberItemTap(e)` 方法处理头像点击

3. 添加 `onSharedMemberPopupCollapse()` 方法处理弹窗收起

4. 在 `index.wxml` 底部添加共享弹窗结构（参考 club-manage-panel 的 `#cm-shared-member-detail`）

---

## Task 4: 实现成员排序功能

**Requirements Addressed:** Req 4

**Files to Modify:**
- `components/event-manage-panel/index.js`

**Acceptance Criteria:**
- [x] 保留现有排序选择器 UI
- [x] 支持"会长在前"排序（按角色优先级）
- [x] 支持"参加时间"排序（新参加的在前，未参加的在后）
- [x] 支持"姓名排序"（字母顺序）
- [x] 排序切换时更新 isotope items

**Implementation Details:**

1. 复用现有的 `sortOptions` 和 `memberSortMode` 数据

2. 修改 `onMemberSortChange(e)` 方法：
```javascript
onMemberSortChange(e) {
  const mode = e.currentTarget.dataset.mode
  let sortBy, sortAscending
  
  switch (mode) {
    case 'roleFirst':
      sortBy = ['_sortPriority']
      sortAscending = [true]
      break
    case 'joinTime':
      // 已参加在前(降序)，参加时间新的在前(降序)
      sortBy = ['is_joined', 'join_time']
      sortAscending = [false, false]
      break
    case 'name':
      sortBy = ['user_name']
      sortAscending = [true]
      break
  }
  
  this.setData({ memberSortMode: mode, memberSortBy: sortBy, memberSortAscending: sortAscending }, () => {
    const iso = this.selectComponent('#eventMemberIsotope')
    if (iso && iso.sort) {
      iso.sort(sortBy, sortAscending)
    }
  })
}
```

---

## Task 5: 实现快速操作功能

**Requirements Addressed:** Req 5

**Files to Modify:**
- `components/event-manage-panel/index.js`

**Acceptance Criteria:**
- [ ] 点击 "+" 按钮将成员添加到活动
- [ ] 点击 "-" 按钮将成员从活动移除
- [ ] 操作后更新成员的 `is_joined` 和 `join_time` 字段
- [ ] 操作后更新快速操作按钮（图标和颜色）
- [ ] 如果当前排序模式为"参加时间"，触发重新排序
- [ ] 如果当前排序模式为其他，只原地更新按钮
- [ ] 更新统计数字（参与人员数）
- [ ] 如果弹窗打开中，同步更新弹窗内容

**Implementation Details:**

1. 添加 `onMemberQuickAction(e)` 方法：
```javascript
async onMemberQuickAction(e) {
  const { item, action } = e.detail
  if (!item) return
  
  // 1. 调用 API
  if (action === 'add') {
    await this.addMemberToEventAPI(item.user_id)
  } else {
    await this.removeMemberFromEventAPI(item.user_id)
  }
  
  // 2. 更新 item 数据
  const newIsJoined = action === 'add'
  const newJoinTime = newIsJoined ? Date.now() : null
  
  // 3. 原地更新 isotope item
  this.updateIsotopeItem(item.id, {
    is_joined: newIsJoined,
    join_time: newJoinTime
  })
  
  // 4. 判断是否需要重新排序
  if (this.data.memberSortMode === 'joinTime') {
    const iso = this.selectComponent('#eventMemberIsotope')
    if (iso && iso.sort) {
      iso.sort(['is_joined', 'join_time'], [false, false])
    }
  }
  
  // 5. 更新统计数字
  this.updateMemberStats()
  
  // 6. 同步更新弹窗内容
  if (this.data.currentMember && this.data.currentMember.user_id === item.user_id) {
    this.setData({
      'currentMember.is_joined': newIsJoined,
      'currentMember.join_time': newJoinTime
    })
  }
}
```

2. 添加 `updateIsotopeItem(itemId, newData)` 方法用于原地更新单个 item

3. 添加 `updateMemberStats()` 方法用于更新统计数字

---

## Task 6: 清理旧代码

**Requirements Addressed:** All

**Files to Modify:**
- `components/event-manage-panel/index.wxml`
- `components/event-manage-panel/index.js`
- `components/event-manage-panel/index.wxss`

**Acceptance Criteria:**
- [ ] 移除 t-grid 相关的 WXML 代码
- [ ] 移除每个成员独立的 expandable-container
- [ ] 移除不再使用的 JS 方法和数据
- [ ] 移除不再使用的 CSS 样式
- [ ] 确保组件正常工作，无报错

**Implementation Details:**

1. 移除 `<t-grid>` 和 `<t-grid-item>` 结构

2. 移除每个成员的 `<expandable-container id="member-detail-{{item.user_id}}">` 

3. 保留 `toggleMemberJoinFast`、`addMemberFromCard`、`removeMemberFromCard` 方法（可能被其他地方使用）

4. 测试排序、点击、快速操作等功能
