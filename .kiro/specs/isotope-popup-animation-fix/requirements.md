# Requirements Document

## Introduction

本文档定义了修复 club-manage-panel 组件中 isotope 头像点击弹出用户详情弹窗时存在的两个问题的需求：
1. 弹窗展开的起始位置不正确（总是从屏幕左下角开始，而不是从点击的头像位置开始）
2. 弹窗收回时没有动画效果

根本原因分析：
- 问题1：isotope 组件的 `onItemTap` 方法中，`bindtap` 事件的 `e.detail.x/y` 在某些情况下返回 0 或 undefined，导致坐标获取失败，回退到默认值 (0, 0)
- 问题2：collapse 动画的时序控制或状态重置可能存在问题

## Glossary

- **Isotope_Component**: 用于展示成员头像墙的组件，支持网格布局和动态排序
- **Expandable_Container**: 可展开容器组件，支持从点击位置展开弹窗并显示内容
- **Club_Manage_Panel**: 协会管理面板组件，包含人员管理区域的 isotope 头像墙
- **Shared_Popup**: 共享弹窗，使用 `wx:if` 条件渲染，在点击 isotope 头像时动态创建并展开
- **Tap_Coordinates**: 用户点击时的屏幕坐标 (tapX, tapY)，应为 clientX/clientY 而非相对坐标
- **Clip_Path_Animation**: 使用 CSS clip-path 实现的圆形展开/收缩动画
- **Ripple_Mask_Animation**: 涟漪遮罩动画，用于在弹窗展开/收缩时提供视觉过渡效果

## Requirements

### Requirement 1: 正确获取点击坐标

**User Story:** As a user, I want the popup to expand from the exact position where I tapped the avatar, so that the animation feels natural and connected to my action.

#### Acceptance Criteria

1. WHEN a user taps an isotope avatar item, THE Isotope_Component SHALL capture the screen coordinates (clientX, clientY) from the tap event
2. THE Isotope_Component SHALL prioritize touch event coordinates (e.touches or e.changedTouches) over e.detail coordinates for reliability
3. IF touch coordinates are not available, THEN THE Isotope_Component SHALL calculate screen coordinates from the item's position and the tap event
4. THE Isotope_Component SHALL pass valid non-zero coordinates in the itemtap event detail

### Requirement 2: 弹窗从正确位置展开

**User Story:** As a user, I want the popup animation to start from where I clicked, so that the interaction feels connected and intuitive.

#### Acceptance Criteria

1. WHEN the shared popup component receives tap coordinates, THE Expandable_Container SHALL use those coordinates as the clip-path animation origin
2. WHEN expand is called with coordinates (0, 0) or invalid values, THE Expandable_Container SHALL fall back to screen center coordinates
3. THE Expandable_Container SHALL ensure the tap point is within the popup bounds by adjusting popup position if necessary

### Requirement 3: 弹窗收回时显示正确的动画

**User Story:** As a user, I want to see a smooth closing animation when the popup collapses, so that the UI feels polished and responsive.

#### Acceptance Criteria

1. WHEN the user taps the overlay to close the popup, THE Expandable_Container SHALL trigger the collapse animation sequence
2. WHEN collapse is triggered, THE Expandable_Container SHALL first play the ripple mask collapse animation
3. WHEN the ripple mask animation reaches 30% completion, THE Expandable_Container SHALL start the clip-path shrink animation back to the original tap point
4. WHEN the clip-path animation completes, THE Expandable_Container SHALL reset all animation states and hide the popup
5. THE collapse animation duration SHALL match the expand animation duration for visual consistency

### Requirement 4: 组件挂载时机处理

**User Story:** As a developer, I want the popup to reliably expand even when using conditional rendering, so that the animation always works correctly.

#### Acceptance Criteria

1. WHEN setData updates currentMember or currentPendingApplication, THE Club_Manage_Panel SHALL use setData callback to ensure data is committed before proceeding
2. WHEN the shared popup component needs to expand, THE Club_Manage_Panel SHALL use wx.nextTick to wait for component mount
3. IF selectComponent returns null after wx.nextTick, THEN THE Club_Manage_Panel SHALL retry with a short delay up to 3 times
4. IF the component still cannot be found after retries, THEN THE Club_Manage_Panel SHALL log a warning and gracefully handle the failure
