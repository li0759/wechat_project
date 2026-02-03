# Requirements Document

## Introduction

将 club-manage-panel 组件中的人员管理区域（people-strip）改造为使用 Isotope 组件来显示会员头像，并在顶部添加排序条件选择器，支持按入会日期、姓名字母、会长在前等多种排序方式。同时需要改造 Isotope 组件以支持在头像下方显示姓名。

## Glossary

- **Club_Manage_Panel**: 协会管理面板组件，用于管理协会的基本信息、成员、活动等
- **People_Strip**: 人员管理区域，显示会员头像列表
- **Isotope_Component**: 瀑布流布局组件，支持排序和动画效果
- **Member_Avatar_Item**: 会员头像项，包含头像图片、姓名、角色等信息
- **Sort_Selector**: 排序条件选择器，用于切换不同的排序方式
- **Add_Member_Button**: 添加会员按钮，显示为"+"号，用于添加新成员

## Requirements

### Requirement 1: Isotope 组件支持显示姓名

**User Story:** As a developer, I want the Isotope component to support displaying names below avatars, so that users can identify members easily.

#### Acceptance Criteria

1. THE Isotope_Component SHALL accept a `showLabel` property to enable/disable label display below items
2. WHEN `showLabel` is true, THE Isotope_Component SHALL render a label below each item using the `label` field from item data
3. THE Isotope_Component SHALL accept a `labelStyle` property to customize label appearance (font-size, color, max-width, etc.)
4. WHEN rendering labels, THE Isotope_Component SHALL truncate long names with ellipsis
5. THE Isotope_Component SHALL calculate item height including label height when `showLabel` is enabled

### Requirement 2: 人员管理区域改造为 Isotope

**User Story:** As a user, I want to see club members displayed in an organized grid layout with smooth animations, so that I can browse members more intuitively.

#### Acceptance Criteria

1. THE Club_Manage_Panel SHALL replace the existing people-strip with Isotope_Component for displaying member avatars
2. THE Club_Manage_Panel SHALL preserve the existing avatar size (72rpx) and styling (circular shape)
3. THE Club_Manage_Panel SHALL preserve the role indicator (star icon for president) on avatars
4. THE Club_Manage_Panel SHALL display member names below each avatar
5. WHEN a member avatar is tapped, THE Club_Manage_Panel SHALL show the member detail popup (preserving existing functionality)

### Requirement 3: 添加会员按钮集成

**User Story:** As a club manager, I want the add member button to be part of the member grid, so that the interface is consistent and intuitive.

#### Acceptance Criteria

1. THE Club_Manage_Panel SHALL include the add member button ("+") as the last item in the Isotope grid
2. WHEN any sort order is applied, THE Add_Member_Button SHALL always appear at the end of the grid
3. THE Add_Member_Button SHALL maintain its existing appearance (dashed border, pink color)
4. WHEN the Add_Member_Button is tapped, THE Club_Manage_Panel SHALL open the add member popup (preserving existing functionality)

### Requirement 4: 排序条件选择器

**User Story:** As a club manager, I want to sort members by different criteria, so that I can quickly find specific members.

#### Acceptance Criteria

1. THE Club_Manage_Panel SHALL display a Sort_Selector above the member Isotope grid
2. THE Sort_Selector SHALL provide the following sort options:
   - 会长在前 (President First): Sort by role priority (president > vice_president > director > member), then by join_date
   - 入会日期 (Join Date): Sort by join_date field
   - 姓名字母 (Name Alphabetical): Sort by user_name field using locale-aware comparison
3. WHEN a sort option is selected, THE Isotope_Component SHALL animate members to their new positions
4. THE Sort_Selector SHALL visually indicate the currently active sort option
5. THE Club_Manage_Panel SHALL default to "会长在前" sort order

### Requirement 5: 会长在前排序逻辑

**User Story:** As a club manager, I want to see the president and leadership first, so that I can quickly identify the club hierarchy.

#### Acceptance Criteria

1. WHEN "会长在前" sort is active, THE Isotope_Component SHALL sort members by role priority:
   - president (会长) = 0
   - vice_president (副会长) = 1
   - director (理事) = 2
   - member (普通会员) = 3
2. WHEN members have the same role, THE Isotope_Component SHALL sort them by join_date (ascending)
3. THE Add_Member_Button SHALL always appear after all members regardless of sort order

### Requirement 6: 待审批成员显示

**User Story:** As a club manager, I want to see pending applications in the member grid, so that I can review and approve them.

#### Acceptance Criteria

1. THE Club_Manage_Panel SHALL display pending application avatars in the Isotope grid
2. THE pending avatars SHALL have a gray border and clock icon (preserving existing styling)
3. WHEN a pending avatar is tapped, THE Club_Manage_Panel SHALL show the approval popup (preserving existing functionality)
4. THE pending members SHALL appear after the president but before regular members in "会长在前" sort
5. WHEN sorting by join_date or name, THE pending members SHALL be sorted separately and appear at the end (before the add button)

### Requirement 7: 动态添加/删除成员动画

**User Story:** As a club manager, I want to see smooth animations when members are added or removed, so that I can track changes visually.

#### Acceptance Criteria

1. WHEN a new member is added, THE Isotope_Component SHALL animate the new member into the grid
2. WHEN a member is removed, THE Isotope_Component SHALL animate the member out of the grid
3. THE remaining members SHALL smoothly reposition after add/remove operations
4. THE Club_Manage_Panel SHALL use the existing Isotope addItem/removeItem methods for dynamic updates

