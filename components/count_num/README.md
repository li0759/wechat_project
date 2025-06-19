# CountNum 数字滚动动画组件

一个优雅的数字滚动动画组件，支持从指定起始值滚动到目标值，提供丰富的自定义选项。

## 功能特色

- 🎯 **平滑滚动**：数字从 0、1、2... 逐步滚动到目标值
- 🎨 **多种样式**：支持不同尺寸、颜色主题和字体权重
- ⚡ **高性能**：使用 CSS transform 实现流畅动画
- 🔧 **灵活配置**：支持自定义动画时长、延迟、前后缀等
- 📱 **响应式**：支持不同屏幕尺寸的自适应显示
- 💫 **小数支持**：完美支持小数位数显示

## 安装使用

### 1. 引入组件

在页面的 `.json` 文件中引入组件：

```json
{
  "usingComponents": {
    "count-num": "/components/count_num/index"
  }
}
```

### 2. 基础用法

```html
<!-- 基础数字滚动 -->
<count-num value="{{123}}" />

<!-- 从指定值开始滚动 -->
<count-num value="{{999}}" from="{{0}}" />

<!-- 添加前缀和后缀 -->
<count-num 
  value="{{88}}" 
  prefix="￥" 
  suffix="元" 
/>
```

## API 文档

### Props 属性

| 参数 | 说明 | 类型 | 默认值 | 版本 |
|------|------|------|--------|------|
| value | 目标数值 | `number` | `0` | - |
| from | 起始数值 | `number` | `0` | - |
| duration | 动画持续时间(毫秒) | `number` | `1000` | - |
| delay | 延迟开始时间(毫秒) | `number` | `0` | - |
| decimals | 小数位数 | `number` | `0` | - |
| autoplay | 是否自动播放 | `boolean` | `true` | - |
| prefix | 前缀文字 | `string` | `''` | - |
| suffix | 后缀文字 | `string` | `''` | - |
| size | 尺寸大小 | `string` | `medium` | - |
| color | 颜色主题 | `string` | `primary` | - |
| fontWeight | 字体权重 | `string` | `normal` | - |
| customClass | 自定义样式类名 | `string` | `''` | - |
| customStyle | 自定义样式 | `string` | `''` | - |
| animated | 启用动画增强效果 | `boolean` | `false` | - |
| responsive | 响应式字体大小 | `boolean` | `false` | - |

### size 尺寸

| 值 | 说明 | 字体大小 |
|----|------|----------|
| small | 小尺寸 | 24rpx |
| medium | 中等尺寸 | 28rpx |
| large | 大尺寸 | 32rpx |

### color 颜色主题

| 值 | 说明 | 颜色值 |
|----|------|--------|
| primary | 主要色 | #1989fa |
| success | 成功色 | #07c160 |
| warning | 警告色 | #ff976a |
| danger | 危险色 | #ee0a24 |
| custom | 自定义 | 通过 customStyle 设置 |

### fontWeight 字体权重

| 值 | 说明 | CSS 值 |
|----|------|--------|
| normal | 正常 | 400 |
| medium | 中等 | 500 |
| bold | 粗体 | 700 |

### Events 事件

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| finished | 动画完成时触发 | `{ value: number }` |

### Methods 方法

通过 `this.selectComponent('#countNum')` 获取组件实例后调用：

| 方法名 | 说明 | 参数 | 返回值 |
|--------|------|------|-------|
| start | 手动开始动画 | - | - |
| reset | 重置到起始值 | - | - |
| setValue | 设置新值并开始动画 | `value: number` | - |

## 使用示例

### 基础示例

```html
<!-- 页面模板 -->
<view class="demo-container">
  <!-- 基础用法 -->
  <view class="demo-item">
    <text class="demo-title">基础用法</text>
    <count-num value="{{basicValue}}" />
  </view>

  <!-- 自定义起始值 -->
  <view class="demo-item">
    <text class="demo-title">自定义起始值</text>
    <count-num value="{{100}}" from="{{50}}" />
  </view>

  <!-- 小数显示 -->
  <view class="demo-item">
    <text class="demo-title">小数显示</text>
    <count-num 
      value="{{99.99}}" 
      decimals="{{2}}" 
      prefix="￥" 
    />
  </view>

  <!-- 不同尺寸 -->
  <view class="demo-item">
    <text class="demo-title">不同尺寸</text>
    <count-num value="{{42}}" size="small" />
    <count-num value="{{42}}" size="medium" />
    <count-num value="{{42}}" size="large" />
  </view>

  <!-- 不同颜色 -->
  <view class="demo-item">
    <text class="demo-title">不同颜色</text>
    <count-num value="{{88}}" color="primary" />
    <count-num value="{{88}}" color="success" />
    <count-num value="{{88}}" color="warning" />
    <count-num value="{{88}}" color="danger" />
  </view>

  <!-- 自定义样式 -->
  <view class="demo-item">
    <text class="demo-title">自定义样式</text>
    <count-num 
      value="{{888}}" 
      color="custom"
      customStyle="color: #ff6b9d; font-size: 36rpx;"
      fontWeight="bold"
      prefix="💰 "
      suffix=" 金币"
    />
  </view>

  <!-- 动画增强 -->
  <view class="demo-item">
    <text class="demo-title">动画增强效果</text>
    <count-num 
      value="{{666}}" 
      animated="{{true}}"
      duration="{{1500}}"
      delay="{{300}}"
    />
  </view>

  <!-- 手动控制 -->
  <view class="demo-item">
    <text class="demo-title">手动控制</text>
    <count-num 
      id="manualCount"
      value="{{manualValue}}" 
      autoplay="{{false}}"
    />
    <button bindtap="startManualAnimation">开始动画</button>
    <button bindtap="resetManualAnimation">重置</button>
  </view>
</view>
```

```javascript
// 页面逻辑
Page({
  data: {
    basicValue: 123,
    manualValue: 999
  },

  onLoad() {
    // 延迟更新基础值，触发动画
    setTimeout(() => {
      this.setData({ basicValue: 456 });
    }, 1000);
  },

  // 手动开始动画
  startManualAnimation() {
    const countNum = this.selectComponent('#manualCount');
    countNum.start();
  },

  // 重置动画
  resetManualAnimation() {
    const countNum = this.selectComponent('#manualCount');
    countNum.reset();
  },

  // 监听动画完成
  onCountFinished(e) {
    console.log('动画完成，最终值：', e.detail.value);
    wx.showToast({
      title: `动画完成: ${e.detail.value}`,
      icon: 'success'
    });
  }
});
```

```css
/* 页面样式 */
.demo-container {
  padding: 20rpx;
}

.demo-item {
  margin-bottom: 40rpx;
  padding: 20rpx;
  background: white;
  border-radius: 12rpx;
  box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.1);
}

.demo-title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
  margin-bottom: 20rpx;
}
```

### 实际应用场景

#### 1. 统计数据展示

```html
<view class="stats-card">
  <view class="stat-item">
    <count-num 
      value="{{memberCount}}" 
      size="large" 
      color="primary"
      fontWeight="bold"
      suffix="人"
    />
    <text class="stat-label">会员总数</text>
  </view>
  
  <view class="stat-item">
    <count-num 
      value="{{revenue}}" 
      decimals="{{2}}"
      color="success"
      prefix="￥"
      duration="{{1500}}"
    />
    <text class="stat-label">营业额</text>
  </view>
</view>
```

#### 2. 倒计时应用

```html
<view class="countdown">
  <count-num 
    value="{{timeLeft}}" 
    color="danger"
    size="large"
    fontWeight="bold"
    suffix="秒"
    bind:finished="onCountdownFinished"
  />
</view>
```

#### 3. 进度展示

```html
<view class="progress-display">
  <count-num 
    value="{{progress}}" 
    decimals="{{1}}"
    suffix="%"
    color="warning"
    animated="{{true}}"
  />
</view>
```

## 注意事项

1. **性能优化**：大量数字同时动画时建议设置不同的 `delay` 值，避免同时执行
2. **数值范围**：支持正数、负数和小数，建议数值不要过大（避免影响性能）
3. **动画时长**：建议动画时长在 500-2000ms 之间，过短或过长都可能影响用户体验
4. **自定义样式**：可通过 `customStyle` 和 `customClass` 进行深度样式定制

## 更新日志

### v1.0.0 (2024-01-15)

- 🎉 首次发布
- ✨ 支持基础数字滚动动画
- ✨ 支持小数位数显示
- ✨ 支持多种样式主题
- ✨ 支持自定义前缀后缀
- ✨ 支持手动控制动画 