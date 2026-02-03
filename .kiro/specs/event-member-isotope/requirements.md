# Requirements Document

## Introduction

将 event-manage-panel 组件中的活动人员弹窗（card-members）内的人员列表改造为 isotope 容器布局，参考 club-manage-panel 中人员管理区域的 isotope 实现方式。实现点击头像弹出人员详情弹窗、支持排序等功能。

## Glossary

- **Event_Manage_Panel**: 活动管理面板组件，用于管理活动的各项信息
- **Isotope**: 一个自定义的布局组件，支持网格布局（fitRows）和瀑布流布局（masonryHorizontal），提供排序、动态添加/删除等功能
- **Member_Isotope**: 使用 isotope 组件展示的成员头像墙
- **Expandable_Container**: 可展开容器组件，点击触发器后展开显示详细内容
- **Club_Members**: 协会成员列表，包含所有协会成员的信息
- **Event_Members**: 活动参与成员列表，是协会成员的子集

## Requirements

### Requirement 1: 替换活动人员列表为 Isotope 布局

**User Story:** As a 活动管理员, I want 在活动人员弹窗中看到 isotope 布局的成员头像墙, so that 我可以更直观地查看和管理活动参与人员。

#### Acceptance Criteria

1. WHEN 活动人员弹窗展开 THEN THE Event_Manage_Panel SHALL 使用 isotope 组件替代原有的 t-grid 布局展示成员列表
2. THE Member_Isotope SHALL 使用 fitRows 布局模式展示成员头像
3. THE Member_Isotope SHALL 显示成员头像和姓名标签
4. WHEN 成员数量变化 THEN THE Member_Isotope SHALL 自动调整容器高度

### Requirement 2: 成员头像点击弹出详情

**User Story:** As a 活动管理员, I want 点击成员头像后弹出详情弹窗, so that 我可以查看成员的详细信息并进行操作。

#### Acceptance Criteria

1. WHEN 用户点击 isotope 中的成员头像 THEN THE Event_Manage_Panel SHALL 弹出该成员的详情弹窗
2. THE 成员详情弹窗 SHALL 显示成员头像、姓名、角色、部门、职位、联系电话等信息
3. THE 成员详情弹窗 SHALL 显示成员的参加状态和打卡状态
4. WHEN 成员未参加活动 THEN THE 成员详情弹窗 SHALL 显示"把ta加入活动"按钮
5. WHEN 成员已参加活动 THEN THE 成员详情弹窗 SHALL 显示"把ta退出活动"按钮
6. THE 详情弹窗 SHALL 使用 expandable-container 组件实现涟漪展开效果

### Requirement 3: 成员排序功能

**User Story:** As a 活动管理员, I want 对活动人员列表进行排序, so that 我可以按不同维度查看成员。

#### Acceptance Criteria

1. THE Event_Manage_Panel SHALL 提供排序选择器，支持多种排序模式
2. WHEN 用户选择"参与优先"排序 THEN THE Member_Isotope SHALL 将已参加活动的成员排在前面
3. WHEN 用户选择"角色优先"排序 THEN THE Member_Isotope SHALL 按会长、副会长、理事、会员的顺序排列
4. WHEN 用户选择"姓名排序" THEN THE Member_Isotope SHALL 按成员姓名字母顺序排列
5. WHEN 排序模式改变 THEN THE Member_Isotope SHALL 平滑过渡到新的排列顺序

### Requirement 4: 快速操作按钮

**User Story:** As a 活动管理员, I want 在头像上有快速操作按钮, so that 我可以快速添加或移除成员参与活动。

#### Acceptance Criteria

1. THE Member_Isotope 中的每个成员头像 SHALL 显示一个快速操作按钮
2. WHEN 成员未参加活动 THEN THE 快速操作按钮 SHALL 显示为"+"图标
3. WHEN 成员已参加活动 THEN THE 快速操作按钮 SHALL 显示为"-"图标
4. WHEN 用户点击快速操作按钮 THEN THE Event_Manage_Panel SHALL 切换该成员的参与状态
5. WHEN 成员参与状态改变 THEN THE Member_Isotope SHALL 更新该成员的显示状态

### Requirement 5: 成员状态视觉区分

**User Story:** As a 活动管理员, I want 通过视觉效果区分成员的不同状态, so that 我可以快速识别成员的参与和打卡情况。

#### Acceptance Criteria

1. THE Member_Isotope SHALL 通过不同的视觉样式区分成员状态
2. WHEN 成员已打卡 THEN THE 成员头像 SHALL 显示绿色边框或标记
3. WHEN 成员已参加但未打卡 THEN THE 成员头像 SHALL 显示蓝色边框或标记
4. WHEN 成员未参加活动 THEN THE 成员头像 SHALL 显示灰色或无边框样式
