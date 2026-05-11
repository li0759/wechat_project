# Requirements Document

## Introduction

本规范定义了将 profile 页面中的创建协会和创建活动功能从页面跳转改造为全屏弹窗的需求。参考 home 页面的全屏弹窗实现模式，将 club-create 和 event-create 的内容封装为可复用的 panel 组件，并通过 expandable-container_fullscreen 组件实现全屏弹窗展示。

## Glossary

- **Profile_Page**: 用户个人中心页面，显示用户信息和管理功能
- **Club_Create_Panel**: 创建协会的面板组件，封装创建协会的所有功能
- **Event_Create_Panel**: 创建活动的面板组件，封装创建活动的所有功能
- **Expandable_Container_Fullscreen**: 全屏可展开容器组件，用于实现全屏弹窗效果
- **Navigation_Utility**: 导航工具函数，用于页面跳转的辅助方法

## Requirements

### Requirement 1: 创建 Club Create Panel 组件

**User Story:** 作为开发者，我想要将 club-create 页面的内容封装为独立的 panel 组件，以便在 profile 页面中以全屏弹窗形式展示。

#### Acceptance Criteria

1. THE System SHALL create a new component directory at `components/club-components/club-create-panel`
2. WHEN creating the panel component, THE System SHALL copy all content from `packageClub/club-create/index` files (js, wxml, wxss, json)
3. WHEN the panel component is created, THE System SHALL maintain all original functionality including form validation, data submission, and error handling
4. THE Panel_Component SHALL expose necessary event handlers for parent component communication
5. THE Panel_Component SHALL support receiving clubId parameter when needed

### Requirement 2: 创建 Event Create Panel 组件

**User Story:** 作为开发者，我想要将 event-create 页面的内容封装为独立的 panel 组件，以便在 profile 页面中以全屏弹窗形式展示。

#### Acceptance Criteria

1. THE System SHALL create a new component directory at `components/event-components/event-create-panel`
2. WHEN creating the panel component, THE System SHALL copy all content from `packageEvent/event-create/index` files (js, wxml, wxss, json)
3. WHEN the panel component is created, THE System SHALL maintain all original functionality including form validation, data submission, and error handling
4. THE Panel_Component SHALL expose necessary event handlers for parent component communication
5. THE Panel_Component SHALL support receiving clubId parameter from parent component

### Requirement 3: 在 Profile 页面集成全屏弹窗

**User Story:** 作为用户，我想要在 profile 页面点击"创建协会"或"创建活动"按钮时，通过全屏弹窗打开创建表单，而不是跳转到新页面。

#### Acceptance Criteria

1. WHEN user clicks "创建协会" button, THE Profile_Page SHALL open a fullscreen popup with Club_Create_Panel
2. WHEN user clicks "创建活动" button, THE Profile_Page SHALL open a fullscreen popup with Event_Create_Panel
3. THE Profile_Page SHALL use expandable-container_fullscreen component for popup implementation
4. WHEN popup is opened, THE System SHALL display appropriate loading skeleton until content is ready
5. WHEN user completes creation or cancels, THE System SHALL close the popup and return to profile page

### Requirement 4: 替换原有页面跳转逻辑

**User Story:** 作为开发者，我想要移除 profile 页面中使用 navigateTo 跳转到创建页面的逻辑，改为使用全屏弹窗。

#### Acceptance Criteria

1. WHEN user triggers create club action, THE System SHALL call popup open method instead of wx.navigateTo
2. WHEN user triggers create event action, THE System SHALL call popup open method instead of wx.navigateTo
3. THE System SHALL remove or update navigation utility function calls for create actions
4. THE System SHALL maintain backward compatibility with other navigation functions
5. WHEN popup is closed, THE System SHALL refresh profile page data if creation was successful

### Requirement 5: 弹窗状态管理

**User Story:** 作为开发者，我想要在 profile 页面中管理弹窗的状态，包括显示/隐藏、加载状态和内容类型。

#### Acceptance Criteria

1. THE Profile_Page SHALL maintain a popup state object with properties: visible, loading, type, clubId
2. WHEN opening club create popup, THE System SHALL set type to 'club-create' and loading to true
3. WHEN opening event create popup, THE System SHALL set type to 'event-create' and loading to true
4. WHEN panel content is ready, THE System SHALL set loading to false
5. WHEN popup is closed, THE System SHALL reset popup state to initial values

### Requirement 6: 触摸交互处理

**User Story:** 作为用户，我想要通过触摸操作打开全屏弹窗，并且弹窗能够从触摸位置展开。

#### Acceptance Criteria

1. WHEN user touches create button, THE System SHALL record touch coordinates (tapX, tapY)
2. WHEN opening popup, THE System SHALL pass touch coordinates to expandable-container_fullscreen
3. THE Expandable_Container_Fullscreen SHALL animate expansion from touch coordinates
4. WHEN user touches outside popup content, THE System SHALL close the popup
5. THE System SHALL provide smooth animation transitions for open and close actions

### Requirement 7: 组件通信和数据传递

**User Story:** 作为开发者，我想要在 profile 页面和 panel 组件之间传递数据和事件。

#### Acceptance Criteria

1. WHEN opening event create panel, THE Profile_Page SHALL pass clubId to the panel component
2. WHEN panel completes creation successfully, THE Panel_Component SHALL emit success event to parent
3. WHEN parent receives success event, THE Profile_Page SHALL refresh relevant data
4. WHEN panel encounters error, THE Panel_Component SHALL emit error event to parent
5. THE Profile_Page SHALL handle panel events and update UI accordingly

### Requirement 8: 骨架屏加载状态

**User Story:** 作为用户，我想要在弹窗内容加载时看到骨架屏，以获得更好的用户体验。

#### Acceptance Criteria

1. WHEN popup is opened with loading state true, THE System SHALL display skeleton screen
2. THE Skeleton_Screen SHALL match the layout structure of the panel content
3. WHEN panel content is ready, THE System SHALL hide skeleton and show actual content
4. THE Skeleton_Screen SHALL use gradient animation for visual feedback
5. THE System SHALL provide different skeleton layouts for club-create and event-create types

### Requirement 9: 组件配置和注册

**User Story:** 作为开发者，我想要在 profile 页面的配置文件中正确注册新创建的 panel 组件。

#### Acceptance Criteria

1. THE Profile_Page JSON configuration SHALL include club-create-panel component registration
2. THE Profile_Page JSON configuration SHALL include event-create-panel component registration
3. THE Profile_Page JSON configuration SHALL include expandable-container_fullscreen component registration
4. THE Component_Paths SHALL be correctly specified relative to profile page location
5. THE System SHALL verify component registration before page load

### Requirement 10: 样式和布局适配

**User Story:** 作为用户，我想要全屏弹窗中的创建表单具有良好的视觉效果和布局。

#### Acceptance Criteria

1. THE Panel_Components SHALL adapt their styles for fullscreen display
2. WHEN displayed in popup, THE Panel_Content SHALL have appropriate padding and margins
3. THE Panel_Components SHALL maintain responsive layout for different screen sizes
4. THE System SHALL ensure consistent styling with home page popup panels
5. THE Panel_Components SHALL handle safe area insets for devices with notches
