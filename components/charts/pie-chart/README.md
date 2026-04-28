# 饼图组件 (PieChart)

## 概述
一个支持动画效果的饼图组件，用于展示数据的占比关系。支持自定义颜色、标题和点击事件。

## 特性
- ✨ 流畅的动画效果
- 🎨 自定义颜色方案
- 📱 响应式设计
- 🔍 支持点击交互
- 📊 自动百分比计算
- 🏷️ 图例展示

## 属性 (Properties)

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| data | Array | [] | 图表数据，格式：[{name: string, value: number}] |
| title | String | '' | 图表标题 |
| height | Number | 300 | 画布高度（单位：px） |
| colors | Array | ['#df76b0', '#9c88ff', '#5fb3d4', '#f4b844', '#67c23a', '#ff5722'] | 颜色数组 |

## 事件 (Events)

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| chartTap | 点击图表时触发 | {data: Array} - 完整的图表数据 |

## 使用示例

### 基础用法
```wxml
<pie-chart 
  data="{{pieData}}" 
  title="用户分布" 
  height="{{300}}"
  bind:chartTap="onChartTap"
/>
```

```js
Page({
  data: {
    pieData: [
      { name: '男性用户', value: 120 },
      { name: '女性用户', value: 80 },
      { name: '未知', value: 20 }
    ]
  },
  
  onChartTap(e) {
    console.log('图表被点击:', e.detail.data);
  }
})
```

### 自定义颜色
```wxml
<pie-chart 
  data="{{pieData}}" 
  title="协会类型分布"
  colors="{{['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4']}}"
/>
```

## 数据格式说明

### data 数组格式
```js
[
  {
    name: "数据项名称",    // 必填，字符串
    value: 100           // 必填，数值
  }
]
```

### 完整示例数据
```js
const pieData = [
  { name: '计算机协会', value: 45 },
  { name: '文学社', value: 32 },
  { name: '体育协会', value: 28 },
  { name: '艺术团', value: 15 },
  { name: '其他', value: 10 }
];
```

## 样式定制

组件支持通过外部样式类进行定制：

```wxss
/* 自定义容器样式 */
.custom-pie-chart {
  margin: 20rpx;
  border: 2rpx solid #eee;
}

/* 自定义标题样式 */
.custom-title {
  color: #df76b0;
  font-size: 36rpx;
}
```

## 注意事项

1. **数据要求**: data 数组不能为空，每个对象必须包含 name 和 value 属性
2. **性能优化**: 建议 data 数组长度不超过 10 项，以保证良好的视觉效果
3. **颜色循环**: 当数据项超过 colors 数组长度时，颜色会自动循环使用
4. **动画时长**: 动画持续约 1 秒，在动画期间避免频繁更新数据
5. **画布适配**: 组件会自动适配屏幕密度，确保在不同设备上的清晰度

## 兼容性

- 支持微信小程序基础库 2.9.0 及以上版本
- 需要 Canvas 2D 支持
- 支持所有主流设备和屏幕尺寸

## 更新日志

### v1.0.0
- 初始版本
- 支持基础饼图绘制
- 添加动画效果
- 支持图例展示
- 支持点击交互 