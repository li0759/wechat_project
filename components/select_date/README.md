# select_date 日期选择器组件

## 概述

`select_date` 是一个微信小程序自定义组件，用于选择每月的特定日期（1-31日）。组件提供了友好的用户界面，支持多选，并以弹窗形式展示选择器。

## 功能特性

- 📅 支持选择1-31日的任意日期组合
- 🎯 多选支持，可同时选择多个日期
- 💫 美观的弹窗界面设计
- 🔧 完全可定制的样式
- 📱 响应式设计，适配各种屏幕尺寸
- ⚡ 基于 Vant Weapp 组件库

## 安装使用

### 1. 引入组件

在页面的 `.json` 文件中引入组件：

```json
{
  "usingComponents": {
    "select-date": "/components/select_date/select_date"
  }
}
```

### 2. 在页面中使用

```xml
<select-date
  title="选择提醒日期"
  value="{{selectedDates}}"
  show="{{showDatePicker}}"
  bind:display="onShowDatePicker"
  bind:close="onCloseDatePicker"
  bind:confirm="onConfirmDate"
/>
```

## API 文档

### Properties 属性

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|------|------|
| value | Array | [] | 否 | 初始选中的日期数组，数字1-31 |
| title | String | '选择日期' | 否 | 选择器标题 |
| show | Boolean | false | 否 | 是否显示弹窗 |
| disabled | Boolean | false | 否 | 是否禁用组件 |
| customClass | String | '' | 否 | 自定义样式类名 |

### Events 事件

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| display | 点击触发器时触发 | - |
| close | 关闭弹窗时触发 | - |
| confirm | 确认选择时触发 | `{value: Array}` 选中的日期数组 |

### Methods 方法

| 方法名 | 说明 | 参数 | 返回值 |
|--------|------|------|-------|
| getValue | 获取当前选中的日期 | - | Array |
| setValue | 设置选中的日期 | Array | - |

## 使用示例

### 基础用法

```javascript
// 页面 JS
Page({
  data: {
    selectedDates: [1, 15, 30], // 默认选中1号、15号、30号
    showDatePicker: false
  },

  // 显示日期选择器
  onShowDatePicker() {
    this.setData({
      showDatePicker: true
    });
  },

  // 关闭日期选择器
  onCloseDatePicker() {
    this.setData({
      showDatePicker: false
    });
  },

  // 确认选择日期
  onConfirmDate(e) {
    const selectedDates = e.detail.value;
    this.setData({
      selectedDates,
      showDatePicker: false
    });
    
    console.log('选中的日期:', selectedDates);
  }
});
```

### 高级用法

```javascript
// 通过组件实例调用方法
const selectDateComponent = this.selectComponent('#select-date');

// 获取当前选中值
const currentValue = selectDateComponent.getValue();

// 设置新的选中值
selectDateComponent.setValue([1, 5, 10, 15, 20, 25, 30]);
```

## 样式定制

组件支持通过 `customClass` 属性传入自定义样式类：

```xml
<select-date custom-class="my-date-picker" />
```

```css
/* 自定义样式 */
.my-date-picker {
  margin: 20rpx;
}
```

## 显示规则

- 未选择任何日期：显示 "请选择"
- 选择全部31天：显示 "每天"
- 选择部分日期：显示 "1日、15日、30日" 格式

## 注意事项

1. 组件依赖 Vant Weapp 组件库，请确保项目中已正确安装
2. 日期值范围为 1-31，超出范围的值会被忽略
3. 组件会自动对选中的日期进行排序
4. 建议在使用前检查 `value` 属性是否为有效数组

## 依赖组件

- `van-cell`: 用于显示触发器
- `van-popup`: 用于弹窗容器
- `van-button`: 用于操作按钮
- `van-icon`: 用于图标显示

## 文件结构

```
select_date/
├── select_date.js      # 组件逻辑
├── select_date.wxml    # 组件模板
├── select_date.wxss    # 组件样式
└── select_date.json    # 组件配置
``` 