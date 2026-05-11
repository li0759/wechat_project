# Design Document

## Introduction

本设计文档描述如何将 event-manage-panel 组件中的活动人员弹窗（card-members）内的人员列表从 t-grid 改造为 isotope 布局，核心改进是在 isotope 组件内支持自定义渲染快速操作按钮（+/-）。

## Design Overview

### 架构变更

```
当前架构:
┌─────────────────────────────────────────────────────────┐
│ event-manage-panel                                       │
│  └─ card-members (expandable-container_fullscreen)       │
│      └─ t-grid + t-grid-item                            │
│          └─ expandable-container (每个成员独立弹窗)      │
│              ├─ trigger: 头像 + 快速操作按钮            │
│              └─ content: 成员详情                       │
└─────────────────────────────────────────────────────────┘

目标架构:
┌─────────────────────────────────────────────────────────┐
│ event-manage-panel                                       │
│  └─ card-members (expandable-container_fullscreen)       │
│      ├─ isotope (成员头像墙)                            │
│      │   └─ 内置快速操作按钮 (+/-)                      │
│      └─ expandable-container (共享弹窗，底部)            │
│          └─ content: 当前选中成员详情                   │
└─────────────────────────────────────────────────────────┘
```

### 核心设计决策

1. **Isotope 组件扩展**: 新增 `showQuickAction` 属性，在组件内部渲染快速操作按钮
2. **共享弹窗模式**: 使用单个 expandable-container 作为共享弹窗，通过 JS 动态控制显示内容
3. **事件分离**: 快速操作按钮使用 `catchtap` 阻止冒泡，触发独立的 `quickaction` 事件

## Detailed Design

### Component 1: Isotope 组件扩展

**文件**: `components/isotope/index.js`, `components/isotope/index.wxml`, `components/isotope/index.wxss`

#### 新增属性

```javascript
properties: {
  // 是否显示快速操作按钮（用于活动成员管理）
  showQuickAction: {
    type: Boolean,
    value: false
  }
}
```

#### 新增事件

```javascript
// 快速操作按钮点击事件
this.triggerEvent('quickaction', {
  index,
  id: item.id,
  item,
  action: item.is_joined ? 'remove' : 'add'
})
```

#### WXML 模板变更

在 `isotope-item-image` 内部添加快速操作按钮渲染逻辑：

```xml
<!-- 快速操作按钮：仅当 showQuickAction=true 且 item 有 is_joined 字段时显示 -->
<view 
  wx:if="{{showQuickAction && item.is_joined !== undefined}}" 
  class="isotope-quick-action {{item.is_joined ? 'isotope-quick-action-remove' : 'isotope-quick-action-add'}}"
  catchtap="onQuickActionTap"
  data-index="{{index}}"
  data-id="{{item.id}}"
  data-item="{{item}}"
>
  <t-icon name="{{item.is_joined ? 'remove' : 'add'}}" size="16" color="#fff" />
</view>
```

#### WXSS 样式

```css
/* 快速操作按钮 */
.isotope-quick-action {
  position: absolute;
  top: 0;
  right: 0;
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.isotope-quick-action-add {
  background: linear-gradient(135deg, #52c41a 0%, #389e0d 100%);
}

.isotope-quick-action-remove {
  background: linear-gradient(135deg, #ff4d4f 0%, #cf1322 100%);
}
```

### Component 2: Event-Manage-Panel 改造

**文件**: `components/event-manage-panel/index.wxml`, `components/event-manage-panel/index.js`

#### 数据结构

```javascript
data: {
  // 成员 Isotope items（包含 is_joined、status 等字段）
  memberIsotopeItems: [],
  // 当前选中的成员（用于共享弹窗）
  currentMember: null,
  // Isotope 容器高度
  memberIsoHeight: '300rpx',
  // 排序相关
  memberSortMode: 'roleFirst',
  memberSortBy: ['_sortPriority', 'join_date'],
  memberSortAscending: [true, true]
}
```

#### WXML 结构

```xml
<!-- 成员 Isotope 头像墙 -->
<view class="member-isotope-container">
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
</view>

<!-- 共享成员详情弹窗 -->
<expandable-container
  id="em-shared-member-detail"
  expanded-width="700"
  expanded-height="900"
  bg-color="#f2f3f5"
  z-index="30000"
  bind:collapse="onSharedMemberPopupCollapse"
>
  <view slot="trigger" style="display: none;"></view>
  <view slot="content" class="popup-shell" wx:if="{{currentMember}}">
    <!-- 成员详情内容 -->
  </view>
</expandable-container>
```

#### JS 方法

```javascript
/**
 * 构建成员 Isotope items
 */
buildMemberIsotopeItems() {
  const members = this.data.clubMembers || []
  const avatarSize = 72
  
  return members.map(m => ({
    id: `event-member-${m.user_id}`,
    image: m.avatar || '/assets/images/default-avatar.png',
    ini_width: avatarSize,
    ini_height: avatarSize,
    label: m.user_name,
    user_id: m.user_id,
    user_name: m.user_name,
    is_joined: m.is_joined,
    is_clockin: m.is_clockin,
    status: m.is_clockin ? 'clockin' : (m.is_joined ? 'joined' : 'not_joined'),
    role: m.role,
    role_display: m.role_display,
    phone: m.phone,
    department: m.department,
    position: m.position,
    _sortPriority: this.getMemberSortPriority(m),
    _memberData: m
  }))
}

/**
 * 成员头像点击 - 显示共享弹窗
 */
onMemberItemTap(e) {
  const { item, tapX, tapY } = e.detail
  if (!item) return
  
  this.setData({ currentMember: item._memberData || item }, () => {
    setTimeout(() => {
      const popup = this.selectComponent('#em-shared-member-detail')
      if (popup && popup.expand) {
        popup.expand(tapX, tapY)
      }
    }, 50)
  })
}

/**
 * 快速操作按钮点击
 */
onMemberQuickAction(e) {
  const { item, action } = e.detail
  if (!item) return
  
  if (action === 'add') {
    this.addMemberToEvent(item.user_id)
  } else {
    this.removeMemberFromEvent(item.user_id, item.user_name)
  }
}
```

### Component 3: 快速操作按钮样式

#### 按钮样式（在 isotope 组件中）

```css
/* 快速操作按钮基础样式 */
.isotope-quick-action {
  position: absolute;
  top: 0;
  right: 0;
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

/* 加入按钮：绿色 "+" */
.isotope-quick-action-add {
  background: linear-gradient(135deg, #52c41a 0%, #389e0d 100%);
}

/* 移除按钮：红色 "-" */
.isotope-quick-action-remove {
  background: linear-gradient(135deg, #ff4d4f 0%, #cf1322 100%);
}
```

**状态区分方式**：
- 只通过快速操作按钮的颜色和图标区分成员状态
- 绿色 "+" = 未参加活动，可加入
- 红色 "-" = 已参加活动，可退出
- 不使用头像透明度或状态徽章

### Component 4: 排序与状态变化联动

#### 排序模式配置

```javascript
// 三种排序模式
sortOptions: [
  { value: 'roleFirst', label: '会长在前' },
  { value: 'joinTime', label: '参加时间' },
  { value: 'name', label: '姓名排序' }
]

// 排序字段映射
getSortConfig(mode) {
  switch (mode) {
    case 'roleFirst':
      return {
        sortBy: ['_sortPriority'],
        sortAscending: [true]  // 会长优先级最高(0)，升序排列
      }
    case 'joinTime':
      return {
        sortBy: ['is_joined', 'join_time'],
        sortAscending: [false, false]  // 已参加在前(降序)，参加时间新的在前(降序)
      }
    case 'name':
      return {
        sortBy: ['user_name'],
        sortAscending: [true]  // 字母升序
      }
  }
}
```

#### "参加时间"排序规则

排序优先级（从前到后）：
1. **新加入活动的人** - is_joined=true, join_time 最新
2. **之前参加活动的人** - is_joined=true, join_time 较早
3. **未参加活动的人** - is_joined=false, join_time 为空

#### 成员加入/退出活动后的变化

**Isotope 显示变化**：
| 变化项 | 加入前 | 加入后 |
|-------|-------|-------|
| 快速操作按钮图标 | "+" (add) | "-" (remove) |
| 快速操作按钮颜色 | 绿色背景 | 红色背景 |
| item.is_joined | false | true |
| item.join_time | 无/空 | 当前时间戳 |

**排序位置变化**：
| 排序模式 | 加入后位置变化 | 退出后位置变化 |
|---------|--------------|--------------|
| 会长在前 | 不变 | 不变 |
| 参加时间 | **移动到最前面** | **移动到最后面** |
| 姓名排序 | 不变 | 不变 |

**共享弹窗变化**：
| 变化项 | 加入前 | 加入后 |
|-------|-------|-------|
| 参加状态文字 | "未参加" | "已参加" |
| 打卡状态行 | 不显示 | 显示 "未打卡" |
| 操作按钮文字 | "把ta加入活动" | "把ta退出活动" |
| 操作按钮主题 | primary | danger |

**统计数字变化**：
| 变化项 | 加入后 | 退出后 |
|-------|-------|-------|
| 参与人员数 | +1 | -1 |
| 已打卡数 | 不变 | 可能 -1 |

#### 快速操作后的更新流程

```javascript
/**
 * 快速操作按钮点击处理
 */
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
  
  // 3. 原地更新 isotope item（按钮状态）
  this.updateIsotopeItem(item.id, {
    is_joined: newIsJoined,
    join_time: newJoinTime
  })
  
  // 4. 判断是否需要重新排序
  if (this.data.memberSortMode === 'joinTime') {
    // 参加时间排序模式：触发重新排序
    const iso = this.selectComponent('#eventMemberIsotope')
    if (iso && iso.sort) {
      iso.sort(['is_joined', 'join_time'], [false, false])
    }
  }
  
  // 5. 更新统计数字
  this.updateMemberStats()
  
  // 6. 如果弹窗打开中，同步更新弹窗内容
  if (this.data.currentMember && this.data.currentMember.user_id === item.user_id) {
    this.setData({
      'currentMember.is_joined': newIsJoined,
      'currentMember.join_time': newJoinTime
    })
  }
}
```

## Alternatives Considered

### 方案 B: 在 event-manage-panel 中使用 slot 自定义渲染

**优点**: 不需要修改 isotope 组件
**缺点**: 
- 需要使用 useCustomSlot 模式，复杂度高
- 无法利用 isotope 的内置布局和动画
- 代码重复度高

**结论**: 选择方案 A（修改 isotope 组件），因为：
1. 快速操作按钮是通用功能，可复用
2. 保持 isotope 组件的封装性
3. 代码更简洁，维护成本低

### 方案 C: 保留每个成员独立的 expandable-container

**优点**: 不需要改变现有弹窗逻辑
**缺点**:
- 无法使用 isotope 的排序动画
- 性能较差（大量 expandable-container 实例）
- 与 club-manage-panel 实现不一致

**结论**: 选择共享弹窗模式，与 club-manage-panel 保持一致

## References

- `components/club-manage-panel/index.wxml` - 参考实现
- `components/club-manage-panel/index.js` - 共享弹窗模式参考
- `components/isotope/index.js` - 现有 isotope 组件实现
- `components/isotope/index.wxml` - 现有 isotope 模板
