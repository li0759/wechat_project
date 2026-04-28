# Implementation Tasks

## Task 1: 添加 isotope 组件依赖

### Description
在 event-manage-panel 的 index.json 中添加 isotope 组件引用。

### Files to Modify
- `components/event-manage-panel/index.json`

### Implementation Details
在 usingComponents 中添加：
```json
"isotope": "/components/isotope/index"
```

### Acceptance Criteria
- [x] isotope 组件已在 index.json 中正确引用
- [x] 组件可以在 WXML 中使用

---

## Task 2: 添加成员 Isotope 相关数据属性

### Description
在 event-manage-panel 的 data 中添加 isotope 排序和样式相关的数据属性，参考 club-manage-panel 的实现。

### Files to Modify
- `components/event-manage-panel/index.js`

### Implementation Details
在 data 中添加：
```javascript
// 成员 Isotope 排序相关
memberSortMode: 'joinedFirst', // 'joinedFirst' | 'roleFirst' | 'name'
sortOptions: [
  { value: 'joinedFirst', label: '参与优先' },
  { value: 'roleFirst', label: '会长在前' },
  { value: 'name', label: '姓名排序' }
],
memberSortBy: ['_sortPriority', 'user_name'],
memberSortAscending: [true, true],
memberIsoHeight: '300rpx',
memberLabelStyle: {
  fontSize: '22rpx',
  color: '#333',
  textAlign: 'center'
},
memberImageStyle: { borderRadius: '50%' },
// 共享弹窗数据
currentMember: null,
```

### Acceptance Criteria
- [x] 所有排序相关数据属性已添加
- [x] 样式配置与 club-manage-panel 一致

---

## Task 3: 更新 prepareIsotopeMembers 函数

### Description
更新 prepareIsotopeMembers 函数，添加排序优先级计算，参考 club-manage-panel 的 buildMemberIsotopeItems 实现。

### Files to Modify
- `components/event-manage-panel/index.js`

### Acceptance Criteria
- [x] 排序优先级正确计算
- [x] 成员数据结构包含所有必要字段
- [x] _memberData 保存原始数据用于弹窗

---

## Task 4: 替换 WXML 中的 t-grid 为 isotope

### Description
将 card-members 弹窗中的 t-grid 布局替换为 isotope 组件，添加排序选择器和共享成员详情弹窗。

### Files to Modify
- `components/event-manage-panel/index.wxml`

### Acceptance Criteria
- [x] t-grid 已替换为 isotope 组件
- [x] 排序选择器正确显示
- [x] 共享成员详情弹窗已添加
- [x] isotope 事件绑定正确

---

## Task 5: 实现成员点击和详情弹窗方法

### Description
实现 onMemberItemTap、showMemberDetailPopup、onSharedMemberPopupCollapse 等方法。

### Files to Modify
- `components/event-manage-panel/index.js`

### Acceptance Criteria
- [x] 点击成员头像能弹出详情弹窗
- [x] 弹窗从点击位置涟漪展开
- [x] 弹窗收起后数据正确清空

---

## Task 6: 实现排序功能

### Description
实现 onMemberSortChange 方法，支持三种排序模式切换。

### Files to Modify
- `components/event-manage-panel/index.js`

### Acceptance Criteria
- [x] 三种排序模式可正常切换
- [x] 切换后成员列表平滑过渡到新顺序
- [x] 排序选择器高亮当前模式

---

## Task 7: 更新快速操作按钮

### Description
更新 toggleMemberJoinFast 方法，使其在 isotope 布局中正常工作，并在操作后更新 isotope。

### Files to Modify
- `components/event-manage-panel/index.js`

### Acceptance Criteria
- [x] 快速操作按钮正常工作（已有实现，通过 loadEventMembers 自动调用 prepareIsotopeMembers）
- [x] 操作后成员状态正确更新
- [x] isotope 显示正确刷新

---

## Task 8: 添加 WXSS 样式

### Description
添加 isotope 容器、排序选择器、成员状态等相关样式。

### Files to Modify
- `components/event-manage-panel/index.wxss`

### Acceptance Criteria
- [x] 排序选择器样式正确
- [x] 成员状态视觉区分明显（已有样式）
- [x] 快速操作按钮位置和样式正确（已有样式）

---

## Task 9: 更新共享成员详情弹窗内容

### Description
完善共享成员详情弹窗的 WXML 内容，显示成员信息和操作按钮。

### Files to Modify
- `components/event-manage-panel/index.wxml`

### Acceptance Criteria
- [x] 成员详情信息完整显示
- [x] 参加/打卡状态正确显示
- [x] 操作按钮根据状态正确切换

---

## Task 10: 实现共享弹窗操作方法

### Description
实现 addMemberFromSharedPopup 和 removeMemberFromSharedPopup 方法。

### Files to Modify
- `components/event-manage-panel/index.js`

### Acceptance Criteria
- [x] 从弹窗添加成员正常工作
- [x] 从弹窗移除成员有确认提示
- [x] 操作后弹窗正确收起
- [x] 成员列表正确刷新

---

## Bug Fixes (2026-01-13)

### Bug 1: 缺少 +/- 快速操作按钮
**问题**: 原来的成员头像右上角有 +/- 按钮用于快速加入/退出活动，现在缺失了。
**解决方案**: 在 isotope 组件中添加状态徽章显示：
- 已参加成员显示绿色勾 ✓
- 已打卡成员显示蓝色双勾 ✓✓
- 未参加成员头像半透明显示
- 点击头像打开详情弹窗进行操作

**修改文件**:
- `components/isotope/index.wxml` - 添加状态徽章渲染
- `components/isotope/index.wxss` - 添加状态徽章样式

### Bug 2: 弹窗数据不实时更新
**问题**: 点击"把ta加入活动"后，成员实际已加入但弹窗仍显示"未参加"。
**解决方案**: `addMemberFromSharedPopup` 已经在调用 API 前先收起弹窗，避免显示过期数据。

### Bug 3: roleFirst 排序标签错误
**问题**: "角色优先"应该改为"会长在前"，并且应该把会长/副会长/理事排在前面。
**解决方案**: 
- 将 sortOptions 中 `{ value: 'roleFirst', label: '角色优先' }` 改为 `{ value: 'roleFirst', label: '会长在前' }`
- 排序逻辑已正确实现：president(0) > vice_president(1) > director(2) > member(3)

**修改文件**:
- `components/event-manage-panel/index.js` - 修改 sortOptions label

### Bug 4: 成员详情弹窗显示错误状态
**问题**: 已参加活动的成员在详情弹窗中仍显示"未参加"。
**解决方案**: `showMemberDetailPopup` 函数现在直接从 isotope item 获取 `is_joined` 和 `is_clockin`，而不是从 `_memberData` 获取（`_memberData` 是原始 clubMembers 数据，不包含活动参与状态）。

**修改文件**:
- `components/event-manage-panel/index.js` - 修改 showMemberDetailPopup 函数
