# Implementation Plan: Club Member Isotope Sorting

## Overview

分步实现 club-manage-panel 人员管理区域的 Isotope 改造和排序功能。先扩展 Isotope 组件支持标签显示，再改造 club-manage-panel 使用 Isotope，最后添加排序功能。

## Tasks

- [x] 1. 扩展 Isotope 组件支持标签显示
  - [x] 1.1 添加 showLabel、labelStyle、labelHeight 属性
    - 在 properties 中添加三个新属性
    - 添加 labelStyleStr 到 data 用于编译后的样式字符串
    - 添加 parseLabelStyle 方法解析 labelStyle 配置
    - _Requirements: 1.1, 1.3_
  - [x] 1.2 修改 WXML 模板添加标签渲染
    - 在 isotope-item-wrapper 内添加标签 view
    - 使用 wx:if 控制标签显示
    - 应用 labelStyleStr 样式
    - _Requirements: 1.2, 1.4_
  - [x] 1.3 修改 WXSS 添加标签样式
    - 添加 .isotope-item-label 样式类
    - 设置文本截断、居中等默认样式
    - _Requirements: 1.4_
  - [x] 1.4 修改布局计算包含标签高度
    - 修改 layoutItemsFitRows 方法
    - 当 showLabel 为 true 时，item 高度加上 labelHeight
    - _Requirements: 1.5_

- [x] 2. Checkpoint - Isotope 标签功能验证
  - 确保标签显示正常
  - 确保布局计算正确
  - 如有问题请提出

- [x] 3. 改造 club-manage-panel 使用 Isotope
  - [x] 3.1 添加排序相关的 data 属性
    - 添加 memberSortMode、sortOptions
    - 添加 memberIsotopeItems、memberSortBy、memberGetSortData
    - 添加 memberLabelStyle、memberImageStyle
    - _Requirements: 4.1, 4.2, 4.5_
  - [x] 3.2 实现 item 转换函数
    - 实现 buildMemberIsotopeItems 方法
    - 将 membersList 转换为 Isotope items
    - 将 peoplePending 转换为 Isotope items
    - 添加 add-member-button item
    - _Requirements: 2.1, 3.1, 6.1_
  - [x] 3.3 修改 WXML 替换 people-strip
    - 添加排序选择器 UI
    - 替换 people-strip 为 isotope 组件
    - 配置 isotope 属性（showLabel、imageStyle 等）
    - _Requirements: 2.1, 2.2, 2.4, 4.1_
  - [x] 3.4 修改 WXSS 添加排序选择器样式
    - 添加 .member-sort-bar 样式
    - 添加 .sort-option 和 .sort-option.active 样式
    - _Requirements: 4.4_

- [x] 4. Checkpoint - Isotope 集成验证
  - 确保成员头像正确显示
  - 确保姓名标签正确显示
  - 确保添加按钮正确显示
  - 如有问题请提出

- [x] 5. 实现排序功能
  - [x] 5.1 实现排序模式切换
    - 实现 onMemberSortChange 方法
    - 根据排序模式更新 memberSortBy 和 memberGetSortData
    - 调用 isotope.sort() 方法
    - _Requirements: 4.3, 5.1, 5.2_
  - [x] 5.2 实现会长在前排序逻辑
    - 配置 _sortPriority 计算函数
    - 角色优先级：president=0, vice_president=1, director=2, member=3
    - 待审批优先级：0.5
    - 添加按钮优先级：9999
    - _Requirements: 5.1, 5.2, 5.3, 6.4_
  - [x] 5.3 实现入会日期和姓名排序逻辑
    - 配置 join_date 排序函数
    - 配置 user_name 排序函数
    - 待审批和添加按钮在这些模式下排在最后
    - _Requirements: 4.2, 6.5_

- [x] 6. Checkpoint - 排序功能验证
  - 确保三种排序模式正常工作
  - 确保排序动画平滑
  - 确保添加按钮始终在最后
  - 如有问题请提出

- [x] 7. 实现点击事件处理
  - [x] 7.1 实现 onMemberItemTap 方法
    - 判断 item 类型（_isAddButton、_isPending）
    - 普通成员：显示成员详情弹窗
    - 待审批：显示审批弹窗
    - 添加按钮：显示添加成员弹窗
    - _Requirements: 2.5, 3.4, 6.3_
  - [x] 7.2 保留现有弹窗功能
    - 确保成员详情弹窗内容不变
    - 确保审批弹窗内容不变
    - 确保添加成员弹窗内容不变
    - _Requirements: 2.5, 3.4, 6.3_

- [x] 8. 实现动态添加/删除
  - [x] 8.1 修改 addUserToClub 方法
    - 使用 isotope.addItem() 添加新成员
    - 确保新成员按当前排序模式插入正确位置
    - _Requirements: 7.1, 7.4_
  - [x] 8.2 修改 removeMember 方法
    - 使用 isotope.removeItem() 删除成员
    - 确保删除动画正常
    - _Requirements: 7.2, 7.4_

- [x] 9. Checkpoint - 完整功能验证
  - 确保所有点击事件正常
  - 确保动态添加/删除动画正常
  - 确保与现有功能兼容
  - 如有问题请提出

- [ ] 10. 编写属性测试
  - [ ] 10.1 Property 2: 添加按钮位置不变性测试
    - **Property 2: Add button position invariant**
    - **Validates: Requirements 3.2, 5.3**
  - [ ] 10.2 Property 3: 角色排序正确性测试
    - **Property 3: Role-based sorting correctness**
    - **Validates: Requirements 5.1, 5.2**
  - [ ] 10.3 Property 4: 待审批成员排序位置测试
    - **Property 4: Pending member sorting position**
    - **Validates: Requirements 6.4, 6.5**

- [ ] 11. Final Checkpoint
  - 确保所有功能正常工作
  - 确保与现有功能完全兼容
  - 如有问题请提出

## Notes

- 任务按顺序执行，每个 Checkpoint 需要验证前面的功能
- 所有任务均为必需，包括属性测试
- Isotope 组件已有排序功能，本次主要是扩展标签显示和集成到 club-manage-panel
- 保留所有现有的弹窗功能，只改变触发方式（从直接点击改为通过 Isotope itemtap 事件）
- 添加按钮需要特殊处理，使用 useCustomSlot 或在 itemtap 中判断类型

