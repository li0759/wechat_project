# Requirements Document

## Introduction

将 event-manage-panel 组件中活动人员弹窗（card-members）内的成员列表从 t-grid 组件改为 isotope 组件，以实现排序切换时的平滑动画效果。完全复制 club-manage-panel 中人员管理区域的 isotope 实现方式，删除添加用户功能（event-manage-panel 不需要）。

## Glossary

- **Event_Manage_Panel**: 活动管理面板组件，用于管理活动的各项信息
- **Club_Manage_Panel**: 协会管理面板组件，已实现 isotope 成员列表，作为参考
- **T_Grid**: TDesign 小程序组件库中的网格布局组件，不支持排序动画
- **Isotope**: 自定义布局组件，支持 fitRows 网格布局，提供排序动画、动态添加/删除等功能
- **Member_List**: 活动人员列表，展示协会成员及其参与状态
- **Expandable_Container**: 可展开容器组件，点击触发器后展开显示详细内容

## Requirements

### Requirement 1: 完全复制 club-manage-panel 的 isotope 实现

**User Story:** As a 开发者, I want 将 club-manage-panel 中的 isotope 实现完全复制到 event-manage-panel, so that 两个组件的成员列表行为一致。

#### Acceptance Criteria

1. THE Event_Manage_Panel SHALL 使用与 club-manage-panel 完全相同的 isotope 组件配置
2. THE isotope 组件 SHALL 使用 fitRows 布局模式
3. THE isotope 组件 SHALL 使用 700rpx 宽度、12rpx 间距、0.3s 过渡时长
4. THE isotope 组件 SHALL 使用 autoHeight 自动高度模式
5. THE isotope 组件 SHALL 显示成员姓名标签（showLabel=true）

### Requirement 2: 复制排序功能

**User Story:** As a 活动管理员, I want 排序切换时成员头像有平滑的过渡动画, so that 界面交互更加流畅自然。

#### Acceptance Criteria

1. THE Event_Manage_Panel SHALL 使用与 club-manage-panel 相同的排序选择器样式
2. THE Event_Manage_Panel SHALL 保留现有的三种排序模式：会长在前、参加时间、姓名字母
3. WHEN 用户切换排序模式 THEN THE isotope 组件 SHALL 调用 sort 方法实现平滑动画
4. THE 排序逻辑 SHALL 使用 _sortPriority 字段进行角色优先级排序

### Requirement 3: 复制成员点击弹窗功能

**User Story:** As a 活动管理员, I want 点击成员头像后弹出详情弹窗, so that 我可以查看成员信息并进行操作。

#### Acceptance Criteria

1. THE Event_Manage_Panel SHALL 使用与 club-manage-panel 相同的 onMemberItemTap 事件处理
2. THE Event_Manage_Panel SHALL 使用共享弹窗（expandable-container）显示成员详情
3. THE 共享弹窗 SHALL 从点击位置以涟漪效果展开
4. THE 共享弹窗 SHALL 在收起时延迟清空数据（等待动画完成）

### Requirement 4: 保留 event-manage-panel 特有功能

**User Story:** As a 活动管理员, I want 保留活动人员管理的特有功能, so that 我可以管理成员的活动参与状态。

#### Acceptance Criteria

1. THE isotope 中的每个成员头像 SHALL 保留快速操作按钮（+/-）
2. THE 详情弹窗 SHALL 显示成员的参加状态和打卡状态
3. THE 详情弹窗 SHALL 根据成员参加状态显示"把ta加入活动"或"把ta退出活动"按钮
4. THE 成员头像 SHALL 保留状态视觉区分（已打卡绿色、已参加蓝色、未参加灰色）

### Requirement 5: 删除不需要的功能

**User Story:** As a 开发者, I want 删除 event-manage-panel 不需要的功能, so that 代码更简洁。

#### Acceptance Criteria

1. THE Event_Manage_Panel SHALL NOT 包含添加成员弹窗功能（club-manage-panel 特有）
2. THE Event_Manage_Panel SHALL NOT 包含待审批成员功能（club-manage-panel 特有）
3. THE Event_Manage_Panel SHALL NOT 包含角色变更功能（club-manage-panel 特有）

