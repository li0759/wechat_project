# 柱状图组件 (BarChart)

## 概述
一个支持动画效果的柱状图组件，用于展示数据的大小对比关系。支持自定义颜色、标题、坐标轴和数值显示。

## 特性
- ✨ 流畅的上升动画效果
- 🎨 自定义柱子颜色
- 📊 自动坐标轴和网格线
- 🔢 可选的数值显示
- 📱 响应式设计
- 🔍 支持点击交互
- 🏷️ 智能标签处理

## 属性 (Properties)

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| data | Array | [] | 图表数据，格式：[{name: string, value: number}] |
| title | String | '' | 图表标题 |
| height | Number | 300 | 画布高度（单位：px） |
| barColor | String | '#df76b0' | 柱子颜色 |
| showValue | Boolean | true | 是否显示数值标签 |
| maxValue | Number | 0 | 最大值，0表示自动计算 |

## 事件 (Events)

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| chartTap | 点击图表时触发 | {data: Array} - 完整的图表数据 |

## 使用示例

### 基础用法
```wxml
<bar-chart 
  data="{{barData}}" 
  title="协会活动数量统计" 
  height="{{350}}"
  bind:chartTap="onChartTap"
/>
```

```js
Page({
  data: {
    barData: [
      { name: '计算机协会', value: 25 },
      { name: '文学社', value: 18 },
      { name: '体育社团', value: 32 },
      { name: '艺术团', value: 15 },
      { name: '音乐社', value: 20 }
    ]
  },
  
  onChartTap(e) {
    console.log('图表被点击:', e.detail.data);
  }
})
```

### 自定义样式
```wxml
<bar-chart 
  data="{{barData}}" 
  title="用户活跃度"
  barColor="#4ecdc4"
  showValue="{{false}}"
  maxValue="{{100}}"
/>
```

### 多组数据展示
```js
const monthlyData = [
  { name: '1月', value: 120 },
  { name: '2月', value: 95 },
  { name: '3月', value: 140 },
  { name: '4月', value: 110 },
  { name: '5月', value: 180 },
  { name: '6月', value: 160 }
];
```

## 数据格式说明

### data 数组格式
```js
[
  {
    name: "数据项名称",    // 必填，字符串，建议不超过6个字符
    value: 100           // 必填，正数值
  }
]
```

### 完整示例数据
```js
const activityData = [
  { name: '学术讲座', value: 45 },
  { name: '文艺演出', value: 32 },
  { name: '体育比赛', value: 28 },
  { name: '社会实践', value: 36 },
  { name: '志愿服务', value: 22 }
];
```

## 样式定制

组件支持通过外部样式类进行定制：

```wxss
/* 自定义容器样式 */
.custom-bar-chart {
  margin: 20rpx;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

/* 自定义标题样式 */
.custom-title {
  color: #fff;
  font-size: 36rpx;
  text-shadow: 0 2rpx 4rpx rgba(0,0,0,0.3);
}
```

## 高级特性

### 自动缩放
当数据值差异较大时，组件会自动调整Y轴范围以获得最佳显示效果。

### 渐变效果
柱子支持自动渐变效果，从顶部的原色到底部的较深色调。

### 响应式标签
当标签文字过长时，会自动截断并添加省略号。

## 注意事项

1. **数据要求**: 
   - data 数组不能为空
   - value 必须为正数
   - name 建议控制在6个字符以内

2. **性能优化**: 
   - 建议数据项不超过 15 个，以保证良好的视觉效果
   - 动画持续约 1.5 秒，避免在动画期间频繁更新数据

3. **显示限制**:
   - 当柱子数量过多时，标签可能会重叠
   - 建议在窄屏设备上控制数据项数量

4. **颜色格式**:
   - barColor 支持 HEX 格式（如 #ff0000）
   - 组件会自动生成渐变效果

## 最佳实践

### 数据准备
```js
// 推荐：预处理数据，确保数值为正数
const processData = (rawData) => {
  return rawData
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value) // 按值排序
    .slice(0, 10); // 限制显示数量
};
```

### 响应式使用
```js
// 根据屏幕宽度调整显示
const screenWidth = wx.getSystemInfoSync().screenWidth;
const maxItems = screenWidth > 400 ? 10 : 6;
const displayData = processData(rawData).slice(0, maxItems);
```

## 兼容性

- 支持微信小程序基础库 2.9.0 及以上版本
- 需要 Canvas 2D 支持
- 支持所有主流设备和屏幕尺寸
- 自动适配深色模式

## 更新日志

### v1.0.0
- 初始版本
- 支持基础柱状图绘制
- 添加上升动画效果
- 支持坐标轴和网格线
- 支持数值标签显示
- 支持点击交互
- 智能标签截断处理 