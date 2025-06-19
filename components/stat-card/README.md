# 统计卡片组件 (Stat Card)

## 概述

统计卡片组件是一个用于展示关键数据指标的优雅卡片组件，支持数值动画、趋势指示器、自定义图标和颜色。适用于仪表板、统计页面等场景。

## 特性

- ✨ 数值动画效果
- 📈 趋势指示器（上升/下降）
- 🎨 自定义图标和颜色
- 📱 响应式设计
- 👆 点击交互
- 🎯 数值观察器（自动更新）
- 💫 按压反馈动画

## 属性 (Properties)

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `title` | String | `''` | 卡片标题 |
| `value` | Number | `0` | 显示的数值 |
| `unit` | String | `''` | 数值单位 |
| `icon` | String | `'star-o'` | 图标名称（Vant Icon） |
| `color` | String | `'#df76b0'` | 主题颜色 |
| `trend` | Number | `0` | 趋势值（正数上升，负数下降，0无趋势） |
| `showAnimation` | Boolean | `true` | 是否显示数值动画 |

## 事件 (Events)

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| `cardTap` | 卡片点击事件 | `{title, value, unit}` |

## 使用示例

### 基础用法

```xml
<stat-card
  title="总销售额"
  value="{{totalSales}}"
  unit="元"
  icon="cash-o"
  color="#07c160"
  trend="12.5"
  bind:cardTap="onStatCardTap"
/>
```

### JavaScript

```javascript
Page({
  data: {
    totalSales: 125800,
    userCount: 1520,
    orderCount: 386,
    conversionRate: 68.5
  },

  onStatCardTap(event) {
    const { detail } = event;
    console.log('卡片点击:', detail);
    
    wx.showToast({
      title: `${detail.title}: ${detail.value}${detail.unit}`,
      icon: 'none'
    });
  }
});
```

### 多卡片布局

```xml
<view class="stats-grid">
  <stat-card
    title="总销售额"
    value="{{totalSales}}"
    unit="元"
    icon="cash-o"
    color="#07c160"
    trend="12.5"
  />
  
  <stat-card
    title="用户总数"
    value="{{userCount}}"
    unit="人"
    icon="friends-o"
    color="#1989fa"
    trend="-2.1"
  />
  
  <stat-card
    title="订单数量"
    value="{{orderCount}}"
    unit="单"
    icon="shopping-cart-o"
    color="#ff976a"
    trend="8.3"
  />
  
  <stat-card
    title="转化率"
    value="{{conversionRate}}"
    unit="%"
    icon="chart-trending-o"
    color="#ee0a24"
    trend="0"
    show-animation="{{false}}"
  />
</view>
```

```css
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24rpx;
  padding: 32rpx;
}

@media (max-width: 750rpx) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
```

## 数据格式说明

### 趋势值 (trend)
- **正数**: 表示上升趋势，显示绿色上箭头
- **负数**: 表示下降趋势，显示红色下箭头  
- **0**: 不显示趋势指示器

### 颜色格式
支持各种CSS颜色格式：
- 十六进制: `#ff6b6b`, `#007bff`
- RGB: `rgb(255, 107, 107)`
- 渐变: `linear-gradient(45deg, #ff6b6b, #ffa726)`

## 样式自定义

### 外部样式类

```css
/* 自定义卡片样式 */
.custom-stat-card {
  border: 2rpx solid #e8e8e8;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

/* 自定义数值样式 */
.custom-stat-card .value-number {
  color: #fff;
  text-shadow: 0 2rpx 4rpx rgba(0,0,0,0.3);
}
```

### 使用外部样式

```xml
<stat-card
  class="custom-stat-card"
  title="特殊指标"
  value="{{specialValue}}"
  color="#764ba2"
/>
```

## 注意事项

1. **数值类型**: `value` 属性必须为数字类型
2. **动画性能**: 大量卡片同时动画可能影响性能，建议分批显示
3. **图标依赖**: 需要引入 Vant Weapp 图标库
4. **趋势计算**: 趋势值需要业务层计算，组件只负责显示
5. **无障碍**: 考虑为数值添加语义化标签

## 最佳实践

### 数据更新
```javascript
// 推荐：批量更新数据
this.setData({
  'statsData.totalSales': newSalesValue,
  'statsData.userCount': newUserCount
});

// 避免：频繁单独更新
// this.setData({ totalSales: newValue }); // 每次都会触发动画
```

### 响应式布局
```css
/* 根据屏幕宽度调整卡片布局 */
.stats-container {
  display: flex;
  flex-wrap: wrap;
  gap: 24rpx;
}

.stat-card {
  flex: 1;
  min-width: 300rpx;
}
```

## 兼容性

- 微信小程序基础库版本: 2.9.0+
- 支持 Vant Weapp 组件库
- 需要 Canvas 2D 支持（如使用高级动画）

## 更新日志

### v1.0.0 (2024-01-15)
- 初始版本发布
- 支持基础数值显示和动画
- 支持趋势指示器
- 支持自定义图标和颜色
- 支持点击事件
- 支持数值观察器 