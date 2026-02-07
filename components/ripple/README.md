# Ripple 涟漪效果组件

Material Design 风格的涟漪点击反馈效果组件。

## 功能特性

- ✅ 从点击位置扩散的涟漪效果
- ✅ 支持长按时持续扩散
- ✅ 自动计算涟漪大小以覆盖整个元素
- ✅ 支持自定义颜色和速度
- ✅ 支持居中扩散模式
- ✅ 移动超过阈值自动取消
- ✅ 完全可复用

## 使用方法

### 1. 在页面 JSON 中引入组件

```json
{
  "usingComponents": {
    "ripple": "/components/ripple/index"
  }
}
```

### 2. 在 WXML 中使用

#### 基础用法
```xml
<ripple bindtap="onItemTap">
  <view class="card">
    <text>点击我查看涟漪效果</text>
  </view>
</ripple>
```

#### 自定义颜色
```xml
<ripple ripple-color="rgba(223, 118, 176, 0.2)" bindtap="onItemTap">
  <view class="card">
    <text>粉色涟漪</text>
  </view>
</ripple>
```

#### 居中扩散
```xml
<ripple center="{{true}}" bindtap="onItemTap">
  <view class="icon-button">
    <t-icon name="add" />
  </view>
</ripple>
```

#### 自定义速度和样式
```xml
<!-- 快速涟漪 -->
<ripple 
  duration="{{400}}" 
  initial-opacity="{{0.2}}"
  spread-ratio="{{0.9}}"
  bindtap="onItemTap"
>
  <view class="card">
    <text>快速涟漪</text>
  </view>
</ripple>

<!-- 慢速涟漪 -->
<ripple 
  duration="{{800}}"
  initial-opacity="{{0.4}}"
  spread-ratio="{{1.1}}"
  bindtap="onItemTap"
>
  <view class="card">
    <text>慢速涟漪</text>
  </view>
</ripple>
```

### 3. 在 JS 中处理点击事件

```javascript
Page({
  onItemTap(e) {
    console.log('Item tapped!', e);
    // 处理点击逻辑
  }
})
```

## 属性

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| ripple-color | String | `rgba(0, 0, 0, 0.1)` | 涟漪颜色 |
| disabled | Boolean | `false` | 是否禁用涟漪效果 |
| duration | Number | `600` | 涟漪扩散时长（毫秒） |
| center | Boolean | `false` | 是否从中心扩散 |
| initial-opacity | Number | `0.3` | 涟漪初始不透明度（0-1） |
| spread-ratio | Number | `1.0` | 涟漪扩散比例，控制最终大小（建议 0.8-1.2） |

## 事件

| 事件名 | 说明 | 参数 |
|--------|------|------|
| tap | 点击事件 | event detail（包含原始 touches 和 changedTouches） |

**事件对象包含：**
- `detail.touches`: 原始触摸点数组
- `detail.changedTouches`: 变化的触摸点数组
- 可以从 `changedTouches[0]` 获取触摸位置

```javascript
onItemTap(e) {
  // 方法1：从 changedTouches 获取（推荐）
  if (e.detail.changedTouches && e.detail.changedTouches[0]) {
    const touch = e.detail.changedTouches[0];
    console.log('点击位置:', touch.clientX, touch.clientY);
  }
  
  // 方法2：从 touches 获取
  if (e.detail.touches && e.detail.touches[0]) {
    const touch = e.detail.touches[0];
    console.log('点击位置:', touch.clientX, touch.clientY);
  }
}
```

## 样式要求

**重要**：被包裹的元素需要设置 `position: relative`，以确保涟漪效果正确显示。

```css
.card {
  position: relative;
  /* 其他样式 */
}
```

如果不设置，组件会自动添加，但建议显式设置以避免样式冲突。

## 使用场景

### 1. 卡片列表
```xml
<view class="waterfall-column">
  <block wx:for="{{eventList}}" wx:key="event_id">
    <ripple bindtap="onCardTap" data-id="{{item.event_id}}">
      <view class="card">
        <image class="card-image" src="{{item.cover_url}}" />
        <view class="card-content">
          <text class="card-title">{{item.title}}</text>
        </view>
      </view>
    </ripple>
  </block>
</view>
```

### 2. 按钮
```xml
<ripple center="{{true}}" bindtap="onSubmit">
  <button class="primary-button">提交</button>
</ripple>
```

### 3. 列表项
```xml
<ripple bindtap="onListItemTap">
  <view class="list-item">
    <text class="item-text">列表项</text>
    <t-icon name="chevron-right" />
  </view>
</ripple>
```

### 4. 图标按钮
```xml
<ripple center="{{true}}" bindtap="onIconTap">
  <view class="icon-button">
    <t-icon name="add" size="24px" />
  </view>
</ripple>
```

## 注意事项

1. **性能优化**：涟漪效果使用 CSS 动画，性能良好，但不建议在一个页面中同时显示超过 10 个涟漪
2. **层级问题**：涟漪层的 z-index 为 1，如果内容有更高的 z-index，需要调整
3. **overflow**：组件会自动设置 `overflow: hidden`，确保涟漪不会溢出
4. **触摸反馈**：涟漪效果会自动处理 touchstart、touchend、touchmove、touchcancel 事件
5. **滚动支持**：组件不会阻止页面滚动，拖动时涟漪仍然显示
6. **位置传递**：点击事件会传递触摸位置坐标，可用于定位弹窗等

## 高级用法

### 动态颜色
```xml
<ripple ripple-color="{{item.isActive ? 'rgba(223, 118, 176, 0.2)' : 'rgba(0, 0, 0, 0.1)'}}" bindtap="onItemTap">
  <view class="card">...</view>
</ripple>
```

### 条件禁用
```xml
<ripple disabled="{{item.disabled}}" bindtap="onItemTap">
  <view class="card {{item.disabled ? 'card-disabled' : ''}}">...</view>
</ripple>
```

## 浏览器兼容性

- ✅ 微信小程序
- ✅ 支持所有现代浏览器的 CSS 动画

## 更新日志

### v1.1.0 (2026-02-07)
- ✅ 修复：支持拖动滚动，不再阻止页面滚动
- ✅ 新增：`initial-opacity` 属性，控制涟漪初始不透明度
- ✅ 新增：`spread-ratio` 属性，控制涟漪扩散比例
- ✅ 改进：点击事件传递触摸位置坐标（x, y）
- ✅ 改进：拖动时涟漪仍然显示，提供更好的视觉反馈

### v1.0.0 (2026-02-07)
- 初始版本
- 支持基础涟漪效果
- 支持长按持续扩散
- 支持自定义颜色和速度
