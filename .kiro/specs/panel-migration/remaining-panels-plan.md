# 剩余3个Panel改造方案

## 总览

需要改造的3个panel：
1. **joined-events-panel** - 我的活动列表（包含列表视图和日历视图）
2. **joined-clubs-panel** - 我的协会列表
3. **all-clubs-panel** - 所有协会列表

## 1. joined-events-panel 改造方案

### 源文件
- `packageEvent/index.js/wxml/wxss/json`

### 目标文件
- `packageProfile/components/joined-events-panel/index.js/wxml/wxss/json`
- `components/panel-skeleton/joined-events-skeleton/index.js/wxml/wxss/json`

### 关键改造点

#### JS文件改造
```javascript
// 1. 从 Page({}) 改为 Component({})
Component({
  properties: {
    requestUrl: {
      type: String,
      value: '/event/user_joined/list/all'
    }
  },
  
  lifetimes: {
    attached() {
      // 初始化但不加载数据
      this.setData({
        requestUrl: this.properties.requestUrl
      });
    }
  },
  
  methods: {
    // 添加 loadData 方法供外部调用
    loadData() {
      this.initData();
      this.triggerEvent('loaded');
    },
    
    // 原有的所有方法移到 methods 中
    initData() { /* ... */ },
    loadEventList() { /* ... */ },
    // ... 其他方法
    
    // 修改返回按钮行为
    onNavBack() {
      this.triggerEvent('close');
    }
  }
});
```

#### WXML文件改造
- 保留完整的Tab结构（列表视图 + 日历视图）
- 移除自定义导航栏（如果有）
- 确保所有事件绑定正确

#### Skeleton设计
```xml
<!-- 列表视图骨架屏 -->
<view class="skeleton-container">
  <view class="skeleton-tabs">
    <view class="skeleton-tab active"></view>
    <view class="skeleton-tab"></view>
  </view>
  
  <view class="skeleton-list">
    <!-- 3-4个活动卡片骨架 -->
    <view class="skeleton-event-card" wx:for="{{4}}" wx:key="index">
      <view class="skeleton-club-name"></view>
      <view class="skeleton-event-content">
        <t-skeleton rowCol="{{[{ width: '150rpx', height: '150rpx', borderRadius: '8rpx' }]}}" />
        <view class="skeleton-event-info">
          <t-skeleton rowCol="{{[{ width: '200rpx', height: '32rpx' }]}}" />
          <t-skeleton rowCol="{{[{ width: '180rpx', height: '24rpx', marginTop: '8rpx' }]}}" />
          <t-skeleton rowCol="{{[{ width: '250rpx', height: '24rpx', marginTop: '8rpx' }]}}" />
        </view>
      </view>
    </view>
  </view>
</view>
```

### Profile页面集成
```javascript
// pages/profile/index.js
navigateToJoinedEvents() {
  this.openGlobalPopup({
    type: 'joined-events',
    data: {
      requestUrl: '/event/user_joined/list/all'
    }
  });
},

onGlobalPopupContentReady(e) {
  const { type } = e.detail;
  if (type === 'joined-events') {
    const panel = this.selectComponent('#joined-events-panel');
    if (panel && panel.loadData) {
      panel.loadData();
    }
  }
  // ... 其他类型
}
```

```xml
<!-- pages/profile/index.wxml -->
<joined-events-skeleton wx:if="{{globalPopup.type === 'joined-events'}}" />
<joined-events-panel 
  wx:if="{{globalPopup.renderPanel && globalPopup.type === 'joined-events'}}"
  id="joined-events-panel"
  requestUrl="{{globalPopup.data.requestUrl}}"
  bind:loaded="onGlobalPopupLoaded"
  bind:close="closeGlobalPopup"
/>
```

---

## 2. joined-clubs-panel 改造方案

### 源文件
- `packageClub/index.js/wxml/wxss/json`

### 目标文件
- `packageProfile/components/joined-clubs-panel/index.js/wxml/wxss/json`
- `components/panel-skeleton/joined-clubs-skeleton/index.js/wxml/wxss/json`

### 关键改造点

#### JS文件改造
```javascript
Component({
  properties: {
    requestUrl: {
      type: String,
      value: '/club/user_joined/list'
    }
  },
  
  lifetimes: {
    attached() {
      this.setData({
        requestUrl: this.properties.requestUrl
      });
    }
  },
  
  methods: {
    loadData() {
      this.loadClubList(1);
      this.triggerEvent('loaded');
    },
    
    loadClubList(page) { /* ... */ },
    onClubTap(e) {
      const clubId = e.currentTarget.dataset.club_id;
      wx.navigateTo({
        url: `/packageClub/club-detail/index?clubId=${clubId}`
      });
    },
    
    onNavBack() {
      this.triggerEvent('close');
    }
  }
});
```

#### Skeleton设计
```xml
<view class="skeleton-container">
  <view class="skeleton-list">
    <view class="skeleton-club-card" wx:for="{{5}}" wx:key="index">
      <t-skeleton rowCol="{{[{ width: '120rpx', height: '120rpx', borderRadius: '50%' }]}}" />
      <view class="skeleton-club-info">
        <t-skeleton rowCol="{{[{ width: '180rpx', height: '32rpx' }]}}" />
        <t-skeleton rowCol="{{[{ width: '220rpx', height: '24rpx', marginTop: '8rpx' }]}}" />
        <t-skeleton rowCol="{{[{ width: '150rpx', height: '24rpx', marginTop: '8rpx' }]}}" />
      </view>
    </view>
  </view>
</view>
```

---

## 3. all-clubs-panel 改造方案

### 源文件
- `packageClub/index.js/wxml/wxss/json`（同joined-clubs，但URL不同）

### 目标文件
- `packageProfile/components/all-clubs-panel/index.js/wxml/wxss/json`
- `components/panel-skeleton/all-clubs-skeleton/index.js/wxml/wxss/json`

### 关键改造点
与joined-clubs-panel类似，主要区别是：
- requestUrl默认值为 `/club/list/all`
- 可能需要搜索功能
- 可能需要分类筛选

---

## 实施步骤

### 对于每个panel：

1. **创建panel组件**
   - 复制源文件到目标目录
   - 修改JS：Page → Component
   - 添加properties、lifetimes、loadData方法
   - 移除onLoad，修改onShow逻辑
   - 修改返回按钮触发close事件

2. **创建skeleton组件**
   - 创建4个文件（js/wxml/wxss/json）
   - 设计骨架屏布局
   - 使用t-skeleton组件
   - 添加padding-top: 100rpx

3. **更新profile页面**
   - 在index.json中注册组件
   - 在index.js中添加导航方法
   - 在index.wxml中添加skeleton和panel
   - 配置componentPlaceholder

4. **测试验证**
   - 点击打开popup
   - 验证skeleton显示
   - 验证数据加载
   - 验证功能完整性
   - 验证关闭操作

---

## 优先级建议

1. **joined-events-panel** - 最常用，优先级最高
2. **joined-clubs-panel** - 次常用
3. **all-clubs-panel** - 管理员功能，优先级较低

---

## 注意事项

1. **保持原页面不变** - 其他地方可能还在使用
2. **完整功能** - 不要简化，保持所有功能
3. **样式一致** - 确保在popup中显示正常
4. **事件处理** - 所有wx.navigateTo保持不变
5. **数据隔离** - 每个panel独立管理数据
