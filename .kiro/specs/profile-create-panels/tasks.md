# Implementation Plan: Profile Create Panels

## Overview

本实现计划将 profile 页面中的创建协会和创建活动功能从页面跳转改造为全屏弹窗。主要工作包括创建两个 panel 组件、在 profile 页面集成全屏弹窗、替换原有跳转逻辑，并添加相应的状态管理和错误处理。

## Tasks

- [x] 1. 创建 Club Create Panel 组件
  - 在 `components/club-components/` 目录下创建 `club-create-panel` 文件夹
  - 复制 `packageClub/club-create/index.js` 到 `club-create-panel/index.js`
  - 复制 `packageClub/club-create/index.wxml` 到 `club-create-panel/index.wxml`
  - 复制 `packageClub/club-create/index.wxss` 到 `club-create-panel/index.wxss`
  - 复制 `packageClub/club-create/index.json` 到 `club-create-panel/index.json`
  - 修改 `index.json` 将 `"component": true` 添加到配置中
  - 在 `index.js` 中将 `Page()` 改为 `Component()`
  - 添加 `loaded` 事件触发（在组件 ready 生命周期中）
  - 添加 `create-success` 事件触发（在创建成功后）
  - 添加 `create-error` 事件触发（在创建失败后）
  - 移除页面级别的生命周期函数（onLoad, onShow, onHide 等）
  - 调整样式以适应弹窗环境（移除页面级 padding-top）
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. 创建 Event Create Panel 组件
  - 在 `components/event-components/` 目录下创建 `event-create-panel` 文件夹
  - 复制 `packageEvent/event-create/index.js` 到 `event-create-panel/index.js`
  - 复制 `packageEvent/event-create/index.wxml` 到 `event-create-panel/index.wxml`
  - 复制 `packageEvent/event-create/index.wxss` 到 `event-create-panel/index.wxss`
  - 复制 `packageEvent/event-create/index.json` 到 `event-create-panel/index.json`
  - 修改 `index.json` 将 `"component": true` 添加到配置中
  - 在 `index.js` 中将 `Page()` 改为 `Component()`
  - 添加 `clubId` 属性定义
  - 添加 `loaded` 事件触发（在组件 ready 生命周期中）
  - 添加 `create-success` 事件触发（在创建成功后）
  - 添加 `create-error` 事件触发（在创建失败后）
  - 移除页面级别的生命周期函数（onLoad, onShow, onHide 等）
  - 调整样式以适应弹窗环境（移除页面级 padding-top）
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 3. 在 Profile 页面添加弹窗状态管理
  - 在 `pages/profile/index.js` 的 data 中添加 `createPopup` 状态对象
  - 添加触摸追踪变量（touchStartX, touchStartY, touchStartTime）
  - 初始化 `createPopup` 状态为 `{visible: false, loading: true, type: '', clubId: '', bgColor: '#f7f8fa', sheetBgColor: '#f7f8fa', tapX: 0, tapY: 0}`
  - _Requirements: 5.1_

- [x] 4. 实现触摸事件处理函数
  - 在 `pages/profile/index.js` 中添加 `onCreatePopupTouchStart` 方法
  - 记录触摸起始坐标和时间戳
  - 处理触摸事件缺失的情况（使用屏幕中心作为默认值）
  - _Requirements: 6.1, 6.2_

- [x] 5. 实现弹窗打开逻辑
  - 在 `pages/profile/index.js` 中添加 `openCreatePopup` 方法
  - 接收参数：type ('club-create' | 'event-create'), clubId (可选)
  - 设置 `createPopup` 状态：visible=true, loading=true, type, clubId, tapX, tapY
  - 添加超时检测（5秒），如果加载失败提供 fallback 选项
  - _Requirements: 3.1, 3.2, 5.2, 5.3_

- [x] 6. 实现弹窗关闭逻辑
  - 在 `pages/profile/index.js` 中添加 `closeCreatePopup` 方法
  - 调用 expandable-container_fullscreen 的 collapse 方法
  - 添加 `onCreatePopupCollapse` 回调方法
  - 在回调中延迟 800ms 后重置 `createPopup` 状态
  - _Requirements: 3.5, 5.5_

- [x] 7. 实现弹窗内容加载完成处理
  - 在 `pages/profile/index.js` 中添加 `onCreatePopupContentReady` 方法
  - 清除超时检测定时器
  - 根据 popup type 获取对应的 panel 组件
  - 如果是 event-create，设置 clubId 属性
  - _Requirements: 3.4, 7.1_

- [x] 8. 实现 Panel 加载完成处理
  - 在 `pages/profile/index.js` 中添加 `onPanelLoaded` 方法
  - 设置 `createPopup.loading` 为 false
  - _Requirements: 3.4, 5.4_

- [x] 9. 实现 Panel 创建成功处理
  - 在 `pages/profile/index.js` 中添加 `onPanelCreateSuccess` 方法
  - 关闭弹窗
  - 显示成功提示
  - 刷新 profile 页面数据（调用 fetchUserData）
  - 处理刷新失败的情况（记录日志但不显示错误）
  - _Requirements: 4.5, 7.2, 7.3, 7.5_

- [x] 10. 实现 Panel 创建失败处理
  - 在 `pages/profile/index.js` 中添加 `onPanelCreateError` 方法
  - 显示错误提示
  - 保持弹窗打开状态
  - _Requirements: 7.4, 7.5_

- [x] 11. 修改创建协会按钮的点击处理
  - 在 `pages/profile/index.wxml` 中找到创建协会按钮
  - 添加 `bindtouchstart="onCreatePopupTouchStart"` 和 `data-type="club-create"`
  - 修改 `bindtap="navigateToCreateClub"` 为 `bindtap="handleCreateClub"`
  - 在 `pages/profile/index.js` 中修改 `navigateToCreateClub` 方法
  - 改为调用 `openCreatePopup('club-create')`
  - 保留 fallback 逻辑（如果 useFallbackNavigation 为 true）
  - _Requirements: 4.1, 4.3_

- [x] 12. 修改创建活动按钮的点击处理
  - 在 `pages/profile/index.wxml` 中找到创建活动按钮
  - 添加 `bindtouchstart="onCreatePopupTouchStart"` 和 `data-type="event-create"`
  - 修改 `bindtap="navigateToCreateEvent"` 为 `bindtap="handleCreateEvent"`
  - 在 `pages/profile/index.js` 中修改 `navigateToCreateEvent` 方法
  - 改为调用 `openCreatePopup('event-create', clubId)`
  - 保留 fallback 逻辑（如果 useFallbackNavigation 为 true）
  - _Requirements: 4.2, 4.3_

- [x] 13. 在 Profile 页面添加全屏弹窗容器
  - 在 `pages/profile/index.wxml` 的 scroll-view 外部添加 expandable-container_fullscreen
  - 设置 `wx:if="{{createPopup.visible}}"`
  - 设置 id 为 "createFullscreenPopup"
  - 绑定 `bind:collapse="onCreatePopupCollapse"`
  - 绑定 `bind:contentReady="onCreatePopupContentReady"`
  - 设置背景颜色属性
  - _Requirements: 3.3_

- [x] 14. 添加骨架屏 - Club Create
  - 在 expandable-container_fullscreen 的 content slot 中添加骨架屏
  - 使用 `wx:if="{{createPopup.loading && createPopup.type === 'club-create'}}"`
  - 参考 home 页面的骨架屏结构
  - 使用 t-skeleton 组件创建表单字段的骨架屏
  - 包括：协会名称、描述、封面图片、其他表单字段
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 15. 添加骨架屏 - Event Create
  - 在 expandable-container_fullscreen 的 content slot 中添加骨架屏
  - 使用 `wx:if="{{createPopup.loading && createPopup.type === 'event-create'}}"`
  - 参考 home 页面的骨架屏结构
  - 使用 t-skeleton 组件创建表单字段的骨架屏
  - 包括：活动标题、描述、时间、地点、封面图片、其他表单字段
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 16. 添加 Club Create Panel 到弹窗内容
  - 在 expandable-container_fullscreen 的 content slot 中添加 club-create-panel
  - 使用 `wx:if="{{createPopup.type === 'club-create'}}"`
  - 设置 id 为 "clubCreatePanel"
  - 绑定 `bind:loaded="onPanelLoaded"`
  - 绑定 `bind:create-success="onPanelCreateSuccess"`
  - 绑定 `bind:create-error="onPanelCreateError"`
  - _Requirements: 3.1, 7.2, 7.4_

- [x] 17. 添加 Event Create Panel 到弹窗内容
  - 在 expandable-container_fullscreen 的 content slot 中添加 event-create-panel
  - 使用 `wx:if="{{createPopup.type === 'event-create'}}"`
  - 设置 id 为 "eventCreatePanel"
  - 设置 `club-id="{{createPopup.clubId}}"`
  - 绑定 `bind:loaded="onPanelLoaded"`
  - 绑定 `bind:create-success="onPanelCreateSuccess"`
  - 绑定 `bind:create-error="onPanelCreateError"`
  - _Requirements: 3.2, 7.1, 7.2, 7.4_

- [x] 18. 注册组件到 Profile 页面配置
  - 在 `pages/profile/index.json` 中添加 expandable-container_fullscreen 组件
  - 添加 club-create-panel 组件
  - 添加 event-create-panel 组件
  - 添加 t-skeleton 组件（如果尚未添加）
  - 验证组件路径正确性
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 19. 添加 Profile 页面样式
  - 在 `pages/profile/index.wxss` 中添加 `.popup-content-wrapper` 样式
  - 添加 `.popup-skeleton` 样式
  - 确保弹窗内容有适当的 padding 和布局
  - 适配安全区域（safe-area-inset）
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 20. 添加组件加载验证
  - 在 `pages/profile/index.js` 的 onLoad 中添加组件验证逻辑
  - 尝试获取 club-create-panel 和 event-create-panel 组件
  - 如果组件加载失败，设置 `useFallbackNavigation` 为 true
  - 记录错误日志
  - _Requirements: 4.4_

- [ ] 21. Checkpoint - 测试基本功能
  - 测试点击创建协会按钮是否正确打开弹窗
  - 测试点击创建活动按钮是否正确打开弹窗
  - 测试骨架屏是否正确显示
  - 测试 panel 内容是否正确加载
  - 测试弹窗是否能正确关闭
  - 确保所有测试通过，如有问题请向用户反馈

- [ ]* 22. 编写单元测试
  - [ ]* 22.1 测试 Club Create Panel 表单验证
    - 测试协会名称不能为空
    - 测试协会名称长度限制
    - 测试描述字段验证
    - _Requirements: 1.3_
  
  - [ ]* 22.2 测试 Event Create Panel 表单验证
    - 测试活动标题不能为空
    - 测试活动时间验证
    - 测试地点字段验证
    - _Requirements: 2.3_
  
  - [ ]* 22.3 测试 Profile 页面弹窗状态管理
    - 测试打开弹窗时状态正确设置
    - 测试关闭弹窗时状态正确重置
    - 测试触摸坐标正确记录
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1_

- [ ]* 23. 编写集成测试
  - [ ]* 23.1 测试完整的创建协会流程
    - 测试从点击按钮到弹窗打开
    - 测试表单填写和提交
    - 测试创建成功后数据刷新
    - _Requirements: 3.1, 7.2, 7.3, 4.5_
  
  - [ ]* 23.2 测试完整的创建活动流程
    - 测试从点击按钮到弹窗打开
    - 测试 clubId 正确传递
    - 测试表单填写和提交
    - 测试创建成功后数据刷新
    - _Requirements: 3.2, 7.1, 7.2, 7.3, 4.5_
  
  - [ ]* 23.3 测试错误处理流程
    - 测试组件加载失败的 fallback
    - 测试弹窗打开超时处理
    - 测试表单提交失败处理
    - _Requirements: 7.4, 7.5_

- [ ] 24. 最终验证和清理
  - 在真实设备上测试所有功能
  - 验证动画流畅性
  - 验证不同屏幕尺寸的适配
  - 检查代码中的 console.log 并清理
  - 确认所有 requirements 都已实现
  - 更新相关文档（如有需要）

## Notes

- 任务标记 `*` 的为可选任务，可以跳过以加快 MVP 开发
- 每个任务都引用了具体的 requirements 以便追溯
- 建议按顺序执行任务，因为后续任务依赖前面任务的完成
- Checkpoint 任务用于验证阶段性成果，确保功能正常
- 单元测试和集成测试标记为可选，但强烈建议实现以确保代码质量
