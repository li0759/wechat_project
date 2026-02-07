# Home 页面使用涟漪效果示例

## 在 home/index.wxml 中应用涟漪效果

### 1. 热门活动卡片（已有的代码）

**原代码：**
```xml
<view 
  class="hot-event-card"
  bindtouchstart="onGlobalPopupTouchStart"
  bindtouchend="openGlobalPopup"
  data-popup-type="{{item.cur_user_managed ? 'event-manage' : 'event-detail'}}"
  data-popup-id="{{item.event_id}}"
>
  <!-- 卡片内容 -->
</view>
```

**改为：**
```xml
<ripple 
  ripple-color="rgba(0, 0, 0, 0.08)"
  bindtap="openGlobalPopup"
  data-popup-type="{{item.cur_user_managed ? 'event-manage' : 'event-detail'}}"
  data-popup-id="{{item.event_id}}"
>
  <view class="hot-event-card">
    <!-- 卡片内容 -->
  </view>
</ripple>
```

### 2. 瀑布流活动卡片

**原代码：**
```xml
<view 
  wx:else
  bindtouchstart="onGlobalPopupTouchStart"
  bindtouchend="openGlobalPopup"
  data-popup-type="{{item.cur_user_managed ? 'event-manage' : 'event-detail'}}"
  data-popup-id="{{item.event_id}}"
>
  <view class="image-container">...</view>
  <view class="card-content">...</view>
</view>
```

**改为：**
```xml
<ripple 
  wx:else
  ripple-color="rgba(0, 0, 0, 0.08)"
  bindtap="openGlobalPopup"
  data-popup-type="{{item.cur_user_managed ? 'event-manage' : 'event-detail'}}"
  data-popup-id="{{item.event_id}}"
>
  <view class="card-wrapper">
    <view class="image-container">...</view>
    <view class="card-content">...</view>
  </view>
</ripple>
```

### 3. 热门协会海报卡片

**原代码：**
```xml
<view 
  class="hot-club-poster-card"
  bindtouchstart="onGlobalPopupTouchStart"
  bindtouchend="openGlobalPopup"
  data-popup-type="{{item.cur_user_managed ? 'club-manage' : 'club-detail'}}"
  data-popup-id="{{item.club_id}}"
>
  <!-- 卡片内容 -->
</view>
```

**改为：**
```xml
<ripple 
  ripple-color="rgba(0, 0, 0, 0.08)"
  bindtap="openGlobalPopup"
  data-popup-type="{{item.cur_user_managed ? 'club-manage' : 'club-detail'}}"
  data-popup-id="{{item.club_id}}"
>
  <view class="hot-club-poster-card">
    <!-- 卡片内容 -->
  </view>
</ripple>
```

### 4. 瀑布流协会卡片

**原代码：**
```xml
<view 
  wx:else
  bindtouchstart="onGlobalPopupTouchStart"
  bindtouchend="openGlobalPopup"
  data-popup-type="{{item.cur_user_managed ? 'club-manage' : 'club-detail'}}"
  data-popup-id="{{item.club_id}}"
>
  <view class="image-container">...</view>
  <view class="card-content">...</view>
</view>
```

**改为：**
```xml
<ripple 
  wx:else
  ripple-color="rgba(0, 0, 0, 0.08)"
  bindtap="openGlobalPopup"
  data-popup-type="{{item.cur_user_managed ? 'club-manage' : 'club-detail'}}"
  data-popup-id="{{item.club_id}}"
>
  <view class="card-wrapper">
    <view class="image-container">...</view>
    <view class="card-content">...</view>
  </view>
</ripple>
```

## 在 home/index.js 中的修改

### 简化事件处理

**原代码：**
```javascript
onGlobalPopupTouchStart(e) {
  this.globalPopupTouchStartTime = Date.now();
  this.globalPopupTouchStartX = e.touches[0].clientX;
  this.globalPopupTouchStartY = e.touches[0].clientY;
},

openGlobalPopup(e) {
  const touchEndTime = Date.now();
  const touchDuration = touchEndTime - this.globalPopupTouchStartTime;
  
  if (touchDuration > 500) {
    return;
  }
  
  const touchEndX = e.changedTouches[0].clientX;
  const touchEndY = e.changedTouches[0].clientY;
  const moveX = Math.abs(touchEndX - this.globalPopupTouchStartX);
  const moveY = Math.abs(touchEndY - this.globalPopupTouchStartY);
  
  if (moveX > 10 || moveY > 10) {
    return;
  }
  
  // 打开弹窗逻辑
  const { popupType, popupId } = e.currentTarget.dataset;
  // ...
}
```

**改为（ripple 组件已处理触摸逻辑）：**
```javascript
openGlobalPopup(e) {
  // 直接处理打开弹窗逻辑
  const { popupType, popupId } = e.currentTarget.dataset;
  
  this.setData({
    'globalPopup.visible': true,
    'globalPopup.type': popupType,
    'globalPopup.id': popupId,
    'globalPopup.loading': true,
    'globalPopup.renderPanel': false
  });
  
  // 延迟渲染 panel
  setTimeout(() => {
    this.setData({
      'globalPopup.renderPanel': true
    });
  }, 100);
}
```

## 在 home/index.wxss 中的修改

### 确保卡片支持涟漪效果

```css
/* 卡片需要 position: relative */
.card {
  position: relative;
  background-color: #fff;
  border-radius: 16rpx;
  overflow: hidden;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.08);
  transition: all 0.3s;
}

/* 移除原有的 :active 状态（由涟漪效果替代） */
/* .card:active {
  transform: scale(0.98);
} */

/* 热门活动卡片 */
.hot-event-card {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: #fff;
  border-radius: 16rpx;
  overflow: hidden;
}

/* 热门协会海报卡片 */
.hot-club-poster-card {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 20rpx;
}

/* 卡片包装器（用于涟漪组件） */
.card-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}
```

## 完整示例：单个卡片的完整代码

### WXML
```xml
<view class="waterfall-column">
  <block wx:for="{{eventList}}" wx:key="event_id" wx:for-index="index">
    <view wx:if="{{index % 2 === 0}}" class="card" style="width:100%;margin-bottom:15rpx;">
      <!-- 骨架屏 -->
      <view wx:if="{{item.loading}}" class="card-skeleton">
        <t-skeleton animation="gradient" rowCol="{{[{ width: '100%', height: '280rpx' }]}}" />
      </view>
      
      <!-- 实际内容 -->
      <ripple 
        wx:else
        ripple-color="rgba(0, 0, 0, 0.08)"
        bindtap="openGlobalPopup"
        data-popup-type="{{item.cur_user_managed ? 'event-manage' : 'event-detail'}}"
        data-popup-id="{{item.event_id}}"
      >
        <view class="card-wrapper">
          <!-- 图片区域 -->
          <view class="image-container" style="width:100%;height:280rpx;position:relative;">
            <view wx:if="{{!item.imgLoaded}}" class="image-skeleton">
              <t-skeleton animation="gradient" rowCol="{{[{ width: '100%', height: '280rpx' }]}}" />
            </view>
            <image 
              class="card-image" 
              src="{{item.cover_url_thumb}}" 
              mode="aspectFill" 
              bindload="onEventImgLoad" 
              data-index="{{index}}" 
              style="{{item.imgLoaded ? '' : 'opacity: 0;'}}" 
            />
            <block wx:if="{{item.imgLoaded}}">
              <view class="image-gradient-mask"></view>
              <view class="tag-managed" wx:if="{{item.cur_user_managed}}">
                <t-icon name="user-list" size="36rpx" color="#fff"></t-icon>
              </view>
            </block>
          </view>
          
          <!-- 文字内容 -->
          <view class="card-content">
            <view class="card-title"><text>{{item.title}}</text></view>
            <view class="card-info-row">
              <view class="card-club-name" wx:if="{{item.club_name}}">
                <text>{{item.club_name}}</text>
              </view>
              <view class="card-tag"><text>{{item.start_time}}</text></view>
            </view>
          </view>
        </view>
      </ripple>
    </view>
  </block>
</view>
```

### WXSS
```css
.card {
  position: relative;
  background-color: #fff;
  border-radius: 16rpx;
  overflow: hidden;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.08);
}

.card-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.image-container {
  position: relative;
  overflow: hidden;
  background-color: #f0f2f5;
  border-radius: 16rpx 16rpx 0 0;
}

.card-content {
  padding: 12rpx 16rpx;
}
```

### JS
```javascript
Page({
  data: {
    eventList: [],
    globalPopup: {
      visible: false,
      type: '',
      id: '',
      loading: true,
      renderPanel: false
    }
  },

  openGlobalPopup(e) {
    const { popupType, popupId } = e.currentTarget.dataset;
    
    this.setData({
      'globalPopup.visible': true,
      'globalPopup.type': popupType,
      'globalPopup.id': popupId,
      'globalPopup.loading': true,
      'globalPopup.renderPanel': false
    });
    
    setTimeout(() => {
      this.setData({
        'globalPopup.renderPanel': true
      });
    }, 100);
  }
})
```

## 注意事项

1. **移除旧的触摸事件处理**：ripple 组件已经处理了 touchstart、touchend、touchmove 等事件
2. **简化 JS 逻辑**：不再需要手动计算触摸时长和移动距离
3. **保持卡片结构**：确保卡片有 `position: relative` 和 `overflow: hidden`
4. **涟漪颜色**：建议使用 `rgba(0, 0, 0, 0.08)` 以获得柔和的效果
5. **性能**：涟漪效果使用 CSS 动画，性能优秀，不会影响滚动流畅度
