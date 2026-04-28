# SearchSuggest 搜索建议组件

一个功能完整的搜索建议组件，基于 **TDesign** 组件库构建，支持自动补全、搜索历史、防抖搜索等功能。

## 功能特色

- 🔍 **智能搜索**：支持实时搜索建议和自动补全
- 📝 **搜索历史**：自动保存和管理搜索历史记录
- ⚡ **防抖优化**：避免频繁请求，提升性能
- 🎨 **TDesign设计**：基于TDesign组件库，界面现代化统一
- 📱 **响应式**：适配不同屏幕尺寸
- 🔧 **高度可配置**：丰富的配置选项

## 技术栈

- **UI组件库**: TDesign Miniprogram
- **主要组件**: t-icon, t-cell, t-cell-group, t-loading, t-tag, t-button, t-empty
- **渲染引擎**: Skyline (Glass-Easel)

## 安装使用

### 1. 环境要求

确保项目中已安装 TDesign Miniprogram：

```bash
npm install tdesign-miniprogram
```

### 2. 引入组件

在页面的 `.json` 文件中引入组件：

```json
{
  "usingComponents": {
    "search-suggest": "/components/search_suggest/index"
  }
}
```

### 3. 基础用法

```html
<!-- 基础搜索框 -->
<search-suggest 
  placeholder="搜索用户、协会..."
  themeColor="#ff6b9d"
  shape="round"
  bind:search="onSearch"
  bind:fetchSuggestions="onFetchSuggestions"
/>
```

### 4. 完整用法示例

```html
<!-- 完整功能搜索框 -->
<search-suggest 
  id="userSearchSuggest"
  placeholder="搜索用户姓名、手机号、邮箱..."
  themeColor="#ff6b9d"
  shape="round"
  enableAutocomplete="{{true}}"
  showHistory="{{true}}"
  maxSuggestions="{{8}}"
  debounceTime="{{300}}"
  minSearchLength="{{1}}"
  bind:search="onUserSearch"
  bind:fetchSuggestions="onFetchUserSuggestions"
  bind:select="onSelectUserSuggestion"
  bind:historySelect="onUserHistorySelect"
/>
```

## API 文档

### Props 属性

| 参数 | 说明 | 类型 | 默认值 | 版本 |
|------|------|------|--------|------|
| placeholder | 搜索框占位符 | `string` | `'请输入搜索内容...'` | - |
| value | 搜索值 | `string` | `''` | - |
| showSearchButton | 是否显示搜索按钮 | `boolean` | `true` | - |
| searchButtonText | 搜索按钮文字 | `string` | `'搜索'` | - |
| enableAutocomplete | 是否启用自动补全 | `boolean` | `true` | - |
| debounceTime | 防抖延迟时间(毫秒) | `number` | `300` | - |
| minSearchLength | 最小搜索字符数 | `number` | `1` | - |
| maxSuggestions | 最大显示建议数量 | `number` | `10` | - |
| showHistory | 是否显示历史记录 | `boolean` | `true` | - |
| maxHistoryCount | 最大历史记录数量 | `number` | `10` | - |
| historyStorageKey | 历史记录存储key | `string` | `'search_history'` | - |
| showClearButton | 是否显示清空按钮 | `boolean` | `true` | - |
| customClass | 自定义样式类名 | `string` | `''` | - |
| customStyle | 自定义样式 | `string` | `''` | - |
| shape | 搜索框形状 | `string` | `'round'` | - |
| themeColor | 主题色 | `string` | `'#ff6b9d'` | - |

### shape 形状

| 值 | 说明 |
|----|------|
| round | 圆角搜索框 |
| square | 方角搜索框 |

### Events 事件

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| input | 输入内容变化 | `{ value: string }` |
| search | 执行搜索 | `{ value: string }` |
| select | 选择建议项 | `{ value: string, item: object, index: number }` |
| fetchSuggestions | 获取搜索建议 | `{ keyword: string, callback: function }` |
| historySelect | 选择历史记录 | `{ value: string, index: number }` |
| historyDelete | 删除历史记录 | `{ index: number }` |
| historyClear | 清空历史记录 | - |
| clear | 清空输入框 | - |

### Methods 方法

通过 `this.selectComponent('#searchSuggest')` 获取组件实例后调用：

| 方法名 | 说明 | 参数 | 返回值 |
|--------|------|------|-------|
| setSuggestions | 设置搜索建议 | `suggestions: array` | - |
| getValue | 获取当前输入值 | - | `string` |
| setValue | 设置输入值 | `value: string` | - |
| clear | 清空组件状态 | - | - |
| search | 手动触发搜索 | - | - |

## 后台接口格式

### 搜索建议接口

当用户输入时，组件会触发 `fetchSuggestions` 事件，你需要在事件处理函数中调用后台接口获取建议数据。

#### 请求参数

```javascript
{
  keyword: "搜索关键词"
}
```

#### 响应格式

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "suggestions": [
      {
        "id": "1",
        "title": "建议标题",
        "text": "建议文本（可选，优先使用title）",
        "description": "建议描述（可选）",
        "icon": "图标名称（可选，默认search）",
        "iconColor": "图标颜色（可选，默认#999）",
        "tag": "标签文本（可选）",
        "extra": {
          "type": "user",
          "userId": "123"
        }
      },
      {
        "id": "2",
        "title": "另一个建议",
        "description": "这是描述信息",
        "icon": "friends-o",
        "iconColor": "#ff6b9d",
        "tag": "热门"
      }
    ]
  }
}
```

#### 建议项字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 唯一标识 |
| title | string | 是 | 主标题，显示的主要文本 |
| text | string | 否 | 备用文本，当title不存在时使用 |
| description | string | 否 | 描述信息，显示在标题下方 |
| icon | string | 否 | 图标名称，使用vant图标 |
| iconColor | string | 否 | 图标颜色 |
| tag | string | 否 | 标签文本，显示在右侧 |
| extra | object | 否 | 额外数据，可用于业务逻辑 |

## 使用示例

### 完整示例

```html
<!-- 页面模板 -->
<view class="search-page">
  <!-- 搜索组件 -->
  <search-suggest 
    id="searchSuggest"
    placeholder="搜索用户、协会、活动..."
    themeColor="#ff6b9d"
    shape="round"
    enableAutocomplete="{{true}}"
    showHistory="{{true}}"
    maxSuggestions="{{8}}"
    debounceTime="{{300}}"
    bind:search="onSearch"
    bind:fetchSuggestions="onFetchSuggestions"
    bind:select="onSelectSuggestion"
    bind:historySelect="onHistorySelect"
  />
  
  <!-- 搜索结果 -->
  <view class="search-results" wx:if="{{searchResults.length > 0}}">
    <view class="result-item" wx:for="{{searchResults}}" wx:key="id">
      <text>{{item.title}}</text>
    </view>
  </view>
</view>
```

```javascript
// 页面逻辑
Page({
  data: {
    searchResults: []
  },

  // 执行搜索
  onSearch(e) {
    const keyword = e.detail.value;
    console.log('搜索关键词:', keyword);
    
    // 调用搜索接口
    this.performSearch(keyword);
  },

  // 获取搜索建议
  onFetchSuggestions(e) {
    const { keyword, callback } = e.detail;
    
    // 调用后台接口获取建议
    wx.request({
      url: 'https://your-api.com/search/suggestions',
      method: 'GET',
      data: { keyword },
      success: (res) => {
        if (res.data.code === 200) {
          // 调用回调函数设置建议
          callback(res.data.data.suggestions);
        } else {
          callback([]);
        }
      },
      fail: () => {
        callback([]);
      }
    });
  },

  // 选择建议项
  onSelectSuggestion(e) {
    const { value, item } = e.detail;
    console.log('选择建议:', value, item);
    
    // 根据建议项类型执行不同操作
    if (item.extra && item.extra.type === 'user') {
      // 跳转到用户详情
      wx.navigateTo({
        url: `/pages/user/detail?id=${item.extra.userId}`
      });
    } else {
      // 执行搜索
      this.performSearch(value);
    }
  },

  // 选择历史记录
  onHistorySelect(e) {
    const { value } = e.detail;
    console.log('选择历史记录:', value);
    this.performSearch(value);
  },

  // 执行搜索
  performSearch(keyword) {
    wx.showLoading({ title: '搜索中...' });
    
    wx.request({
      url: 'https://your-api.com/search',
      method: 'GET',
      data: { keyword },
      success: (res) => {
        wx.hideLoading();
        if (res.data.code === 200) {
          this.setData({
            searchResults: res.data.data.results
          });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({
          title: '搜索失败',
          icon: 'error'
        });
      }
    });
  }
});
```

### 自定义样式示例

```html
<!-- 自定义主题色 -->
<search-suggest 
  themeColor="#007aff"
  customClass="custom-search"
  customStyle="margin: 20rpx;"
/>

<!-- 方角搜索框 -->
<search-suggest 
  shape="square"
  showSearchButton="{{false}}"
  placeholder="输入关键词..."
/>

<!-- 禁用历史记录 -->
<search-suggest 
  showHistory="{{false}}"
  enableAutocomplete="{{true}}"
  minSearchLength="{{2}}"
/>
```

```css
/* 自定义样式 */
.custom-search {
  margin: 20rpx;
}

.custom-search .search-input-wrapper {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.custom-search .search-input {
  color: white;
}

.custom-search .search-input::placeholder {
  color: rgba(255, 255, 255, 0.7);
}
```

## 注意事项

1. **防抖机制**：组件内置防抖功能，避免频繁请求接口
2. **历史记录**：自动保存在本地存储中，可自定义存储key
3. **建议数据**：支持多种数据格式，灵活适配不同业务场景
4. **性能优化**：建议列表支持虚拟滚动，处理大量数据时性能良好
5. **事件处理**：注意在 `fetchSuggestions` 事件中正确调用回调函数

## 更新日志

### v1.0.0
- 初始版本发布
- 支持基础搜索功能
- 支持自动补全和搜索建议
- 支持搜索历史记录
- 支持自定义主题和样式 