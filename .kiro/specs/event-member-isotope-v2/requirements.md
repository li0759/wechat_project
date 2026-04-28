# Requirements Document

## Introduction

将 event-manage-panel 组件中的活动人员弹窗（card-members）内的人员列表从 t-grid 改造为 isotope 布局，参考 club-manage-panel 中人员管理区域的 isotope 实现方式。核心改进是在 isotope 组件内支持自定义渲染快速操作按钮（+/-），实现点击头像弹出人员详情弹窗、支持排序等功能。

## Glossary

- **Event_Manage_Panel**: 活动管理面板组件，用于管理活动的各项信息
- **Isotope**: 自定义布局组件，支持网格布局（fitRows）和瀑布流布局（masonryHorizontal），提供排序、动态添加/删除等功能
- **Member_Isotope**: 使用 isotope 组件展示的成员头像墙
- **Expandable_Container**: 可展开容器组件，点击触发器后展开显示详细内容
- **Quick_Action_Button**: 快速操作按钮，显示在成员头像右上角，用于快速添加/移除成员参与活动
- **Shared_Popup**: 共享弹窗，独立于 isotope 组件，通过 JS 动态控制显示内容

## Requirements

### Requirement 1: Isotope 组件支持快速操作按钮渲染

**User Story:** As a 开发者, I want isotope 组件支持渲染快速操作按钮, so that 我可以在头像上显示 +/- 按钮用于快速操作。

#### Acceptance Criteria

1. THE Isotope 组件 SHALL 支持 `showQuickAction` 属性，控制是否显示快速操作按钮
2. WHEN `showQuickAction` 为 true 且 item 包含 `is_joined` 字段 THEN THE Isotope 组件 SHALL 在头像右上角渲染快速操作按钮
3. WHEN item.is_joined 为 false THEN THE 快速操作按钮 SHALL 显示为 "+" 图标（绿色背景）
4. WHEN item.is_joined 为 true THEN THE 快速操作按钮 SHALL 显示为 "-" 图标（红色背景）
5. WHEN 用户点击快速操作按钮 THEN THE Isotope 组件 SHALL 触发 `quickaction` 事件，携带 item 数据和操作类型
6. THE 快速操作按钮点击 SHALL 使用 catchtap 阻止冒泡，不触发 itemtap 事件

### Requirement 2: 替换 t-grid 为 Isotope 布局

**User Story:** As a 活动管理员, I want 在活动人员弹窗中看到 isotope 布局的成员头像墙, so that 我可以更直观地查看和管理活动参与人员。

#### Acceptance Criteria

1. WHEN 活动人员弹窗展开 THEN THE Event_Manage_Panel SHALL 使用 isotope 组件替代原有的 t-grid 布局展示成员列表
2. THE Member_Isotope SHALL 使用 fitRows 布局模式展示成员头像
3. THE Member_Isotope SHALL 显示成员头像和姓名标签
4. WHEN 成员数量变化 THEN THE Member_Isotope SHALL 自动调整容器高度
5. THE Member_Isotope SHALL 配置 `showQuickAction="{{true}}"` 启用快速操作按钮

### Requirement 3: 成员头像点击弹出共享详情弹窗

**User Story:** As a 活动管理员, I want 点击成员头像后弹出详情弹窗, so that 我可以查看成员的详细信息并进行操作。

#### Acceptance Criteria

1. WHEN 用户点击 isotope 中的成员头像 THEN THE Event_Manage_Panel SHALL 弹出该成员的详情弹窗
2. THE 成员详情弹窗 SHALL 是一个共享的 expandable-container，位于组件底部
3. THE Event_Manage_Panel SHALL 通过 `currentMember` 数据控制弹窗显示内容
4. THE 成员详情弹窗 SHALL 显示成员头像、姓名、角色、部门、职位、联系电话等信息
5. THE 成员详情弹窗 SHALL 显示成员的参加状态和打卡状态
6. WHEN 成员未参加活动 THEN THE 成员详情弹窗 SHALL 显示"把ta加入活动"按钮
7. WHEN 成员已参加活动 THEN THE 成员详情弹窗 SHALL 显示"把ta退出活动"按钮
8. THE 详情弹窗 SHALL 使用 expandable-container 组件实现涟漪展开效果，从点击位置展开

### Requirement 4: 成员排序功能

**User Story:** As a 活动管理员, I want 对活动人员列表进行排序, so that 我可以按不同维度查看成员。

#### Acceptance Criteria

1. THE Event_Manage_Panel SHALL 提供排序选择器，支持三种排序模式
2. WHEN 用户选择"会长在前"排序 THEN THE Member_Isotope SHALL 按会长、副会长、理事、会员的顺序排列
3. WHEN 用户选择"参加时间"排序 THEN THE Member_Isotope SHALL 按以下顺序排列：
   - 新加入活动的人排在最前
   - 之前参加活动的人按参加时间倒序（最近参加的在前）
   - 未参加活动的人排在最后
4. WHEN 用户选择"姓名排序" THEN THE Member_Isotope SHALL 按成员姓名字母顺序排列
5. WHEN 排序模式改变 THEN THE Member_Isotope SHALL 通过 isotope 的 sort() 方法实现平滑过渡动画

### Requirement 5: 快速操作功能（通过按钮颜色区分状态）

**User Story:** As a 活动管理员, I want 通过快速操作按钮快速添加或移除成员, so that 我可以高效管理活动参与人员。

#### Acceptance Criteria

1. WHEN 用户点击未参加成员的 "+" 按钮 THEN THE Event_Manage_Panel SHALL 将该成员添加到活动
2. WHEN 用户点击已参加成员的 "-" 按钮 THEN THE Event_Manage_Panel SHALL 将该成员从活动移除
3. WHEN 成员参与状态改变 THEN THE Member_Isotope SHALL 更新该成员的快速操作按钮（绿色"+"变为红色"-"，或反之）
4. WHEN 成员参与状态改变且当前排序模式为"参加时间" THEN THE Member_Isotope SHALL 触发重新排序，新加入的成员移动到最前面
5. WHEN 成员参与状态改变且当前排序模式为"会长在前"或"姓名排序" THEN THE Member_Isotope SHALL 只原地更新按钮，不触发重新排序
6. THE 快速操作 SHALL 调用 API 后更新成员的 is_joined 和 join_time 字段
