# Implementation Plan: Isotope Sorting Feature

## Overview

为 Isotope 组件添加排序功能，按照设计文档分步实现，确保每一步都可验证。

## Tasks

- [x] 1. 添加排序相关的 properties 和 data
  - 在 `properties` 中添加 `sortBy`, `sortAscending`, `getSortData`
  - 在 `data` 中添加 `currentSortBy`, `currentSortAscending`, `isSorting`
  - 添加 `sortBy` 的 observer: `onSortByChange`
  - _Requirements: 1.1, 1.2, 3.1_

- [x] 2. 实现原始顺序保存
  - [x] 2.1 修改 `loadGroupItems` 方法，为每个 item 添加 `originalIndex` 属性
    - _Requirements: 6.1_
  - [x] 2.2 修改 `addItem` 方法，为新增 item 设置 `originalIndex`
    - _Requirements: 6.3_

- [x] 3. 实现核心排序方法
  - [x] 3.1 实现 `getSortValue(item, key)` 方法
    - 优先从 `getSortData` 获取自定义函数
    - 否则直接访问 item 字段
    - 处理函数执行异常
    - _Requirements: 3.2, 3.3_
  - [x] 3.2 实现 `compareValues(valueA, valueB, ascending)` 方法
    - 字符串使用 `localeCompare`
    - 数字使用数值比较
    - 日期转换为时间戳比较
    - 处理 null/undefined
    - _Requirements: 1.4, 1.5, 1.6_
  - [x] 3.3 实现 `compareItems(a, b, sortBy, sortAscending)` 方法
    - 支持单字段和多字段排序
    - 支持混合排序方向
    - _Requirements: 2.2, 2.3_

- [x] 4. 实现排序执行方法
  - [x] 4.1 实现 `sortItems(sortBy, sortAscending)` 核心排序方法
    - 设置 `isSorting` 标志防止重复触发
    - 对 `itemsWithPosition` 进行排序
    - 更新 `index` 属性
    - 调用 `resetLayout()` 和 `layoutItems()`
    - 触发 `sortComplete` 事件
    - _Requirements: 1.3, 4.1, 7.1, 7.2, 7.3_
  - [x] 4.2 实现 `onSortByChange` observer
    - 当 `sortBy` 属性变化时调用 `sortItems`
    - _Requirements: 1.3_

- [x] 5. 实现对外暴露的 API 方法
  - [x] 5.1 实现 `sort(sortBy, sortAscending)` 方法
    - 更新 properties 并执行排序
    - _Requirements: 5.1, 5.2_
  - [x] 5.2 实现 `shuffle()` 方法
    - 使用 Fisher-Yates 算法随机打乱
    - _Requirements: 5.3_
  - [x] 5.3 实现 `resetSort()` 方法
    - 按 `originalIndex` 恢复原始顺序
    - _Requirements: 5.4, 6.2_

- [x] 6. Checkpoint - 功能验证
  - 确保所有排序功能正常工作
  - 验证动画效果平滑
  - 如有问题请提出

- [x] 7. 编写属性测试
  - [x] 7.1 Property 1: 排序类型正确性测试
    - **Property 1: Sorting produces correct order by type**
    - **Validates: Requirements 1.4, 1.5, 1.6**
  - [x] 7.2 Property 2: 多字段排序优先级测试
    - **Property 2: Multi-field sorting respects field priority**
    - **Validates: Requirements 2.2**
  - [x] 7.3 Property 5: 原始顺序恢复测试
    - **Property 5: Original order is preserved and restorable**
    - **Validates: Requirements 6.1, 6.2, 5.4**

- [x] 8. 更新 README 文档
  - 添加排序功能说明
  - 添加 API 文档
  - 添加使用示例
  - _Requirements: All_

- [x] 9. Final Checkpoint
  - 确保所有测试通过
  - 确保文档完整
  - 如有问题请提出

## Notes

- 所有任务均为必需，包括属性测试
- 排序动画利用现有的 CSS transition 机制，无需额外实现
- 排序与现有的 addItem/removeItem 方法兼容
- 排序与分组轮播功能兼容（每组独立排序）
