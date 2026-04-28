# Requirements Document

## Introduction

为微信小程序版 Isotope 组件添加排序功能，支持按 item 对象的自定义字段进行排序，并在排序切换时实现平滑的位置过渡动画，还原原版 Isotope.js 的排序体验。

## Glossary

- **Isotope_Component**: 微信小程序版瀑布流布局组件
- **Sort_Key**: 用于排序的 item 对象字段名（如 name, date, order 等）
- **Sort_Direction**: 排序方向，升序（asc）或降序（desc）
- **Sort_Function**: 自定义排序函数，用于复杂排序逻辑
- **Layout_Transition**: 排序后 items 从旧位置平滑移动到新位置的动画效果

## Requirements

### Requirement 1: 基础排序功能

**User Story:** As a developer, I want to sort items by custom fields, so that I can display items in different orders based on user preferences.

#### Acceptance Criteria

1. THE Isotope_Component SHALL accept a `sortBy` property specifying the Sort_Key for sorting
2. THE Isotope_Component SHALL accept a `sortAscending` property specifying the Sort_Direction (default: true for ascending)
3. WHEN `sortBy` property changes, THE Isotope_Component SHALL re-sort all items and update the layout
4. WHEN sorting by a string field, THE Isotope_Component SHALL use localeCompare for proper string comparison
5. WHEN sorting by a number field, THE Isotope_Component SHALL use numeric comparison
6. WHEN sorting by a date field, THE Isotope_Component SHALL convert to timestamp for comparison

### Requirement 2: 多字段排序

**User Story:** As a developer, I want to sort by multiple fields, so that I can create complex sorting rules like "sort by category, then by name".

#### Acceptance Criteria

1. THE Isotope_Component SHALL accept `sortBy` as either a string (single field) or an array of strings (multiple fields)
2. WHEN `sortBy` is an array, THE Isotope_Component SHALL sort by fields in order (primary, secondary, etc.)
3. THE Isotope_Component SHALL support mixed sort directions via `sortAscending` as boolean or array of booleans

### Requirement 3: 自定义排序函数

**User Story:** As a developer, I want to provide custom sort functions, so that I can implement complex sorting logic that cannot be expressed with field names alone.

#### Acceptance Criteria

1. THE Isotope_Component SHALL accept a `getSortData` property containing custom getter functions for sort values
2. WHEN `sortBy` references a key in `getSortData`, THE Isotope_Component SHALL use the corresponding function to get the sort value
3. THE Sort_Function SHALL receive the item object and return a comparable value (string, number, or date)

### Requirement 4: 排序动画效果

**User Story:** As a user, I want to see smooth animations when items are re-sorted, so that I can visually track where items move to.

#### Acceptance Criteria

1. WHEN sorting changes, THE Isotope_Component SHALL animate items from their old positions to new positions
2. THE Layout_Transition SHALL use CSS transform for smooth 60fps animation
3. THE Layout_Transition SHALL respect the `transitionDuration` property for animation timing
4. WHEN an item's position changes, THE Isotope_Component SHALL use translate3d for GPU-accelerated animation
5. THE Isotope_Component SHALL NOT cause items to "jump" or "flash" during sorting transition

### Requirement 5: 排序 API 方法

**User Story:** As a developer, I want to programmatically trigger sorting, so that I can sort items in response to user interactions.

#### Acceptance Criteria

1. THE Isotope_Component SHALL expose a `sort(sortBy, sortAscending)` method for external calls
2. WHEN `sort()` is called, THE Isotope_Component SHALL re-sort items and trigger layout animation
3. THE Isotope_Component SHALL expose a `shuffle()` method to randomize item order
4. THE Isotope_Component SHALL expose a `resetSort()` method to restore original order

### Requirement 6: 原始顺序保留

**User Story:** As a developer, I want to restore items to their original order, so that users can reset the view.

#### Acceptance Criteria

1. WHEN items are initialized, THE Isotope_Component SHALL store the original order index for each item
2. WHEN `sortBy` is set to 'original' or null, THE Isotope_Component SHALL restore items to their original order
3. THE Isotope_Component SHALL preserve original order information across dynamic add/remove operations

### Requirement 7: 排序状态事件

**User Story:** As a developer, I want to be notified when sorting completes, so that I can update UI or perform other actions.

#### Acceptance Criteria

1. WHEN sorting completes, THE Isotope_Component SHALL trigger a `sortComplete` event
2. THE `sortComplete` event detail SHALL include the current sortBy value and sort direction
3. THE `sortComplete` event detail SHALL include the sorted items array
