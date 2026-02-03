# 搜索建议组件 - 后台接口格式

## 概述

搜索建议组件基于 **TDesign Miniprogram** 组件库构建，需要后台提供搜索建议数据，本文档详细说明了接口的请求和响应格式。

## 技术说明

- **UI组件库**: TDesign Miniprogram
- **图标系统**: TDesign Icon
- **数据格式**: 与之前版本完全兼容，无需更改后台接口

## 搜索建议接口

### 接口地址
```
GET /api/search/suggestions
```

### 请求参数

| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| keyword | string | 是 | 搜索关键词 | "张三" |
| type | string | 否 | 搜索类型，可选值：user、club、event、all | "user" |
| limit | number | 否 | 返回数量限制，默认10 | 10 |

### 请求示例

```javascript
// GET请求
GET /api/search/suggestions?keyword=张三&type=user&limit=5

// 或者在小程序中
wx.request({
  url: 'https://your-api.com/api/search/suggestions',
  method: 'GET',
  data: {
    keyword: '张三',
    type: 'user',
    limit: 5
  },
  success: (res) => {
    // 处理响应
  }
});
```

### 响应格式

#### 成功响应

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "suggestions": [
      {
        "id": "user_001",
        "title": "张三",
        "text": "张三",
        "description": "计算机科学与技术专业 · 大三学生",
        "icon": "user",
        "iconColor": "#ff6b9d",
        "tag": "用户",
        "extra": {
          "type": "user",
          "userId": "001",
          "avatar": "https://example.com/avatar/001.jpg",
          "department": "计算机学院"
        }
      },
      {
        "id": "club_001",
        "title": "计算机协会",
        "description": "专注于计算机技术交流与学习的学生组织",
        "icon": "usergroup",
        "iconColor": "#1890ff",
        "tag": "协会",
        "extra": {
          "type": "club",
          "clubId": "001",
          "memberCount": 156,
          "category": "技术类"
        }
      },
      {
        "id": "event_001",
        "title": "编程大赛",
        "description": "2024年度校园编程竞赛 · 3月15日",
        "icon": "trophy-o",
        "iconColor": "#fa8c16",
        "tag": "活动",
        "extra": {
          "type": "event",
          "eventId": "001",
          "startTime": "2024-03-15T09:00:00Z",
          "location": "计算机楼A101"
        }
      }
    ],
    "total": 3,
    "hasMore": false
  }
}
```

#### 错误响应

```json
{
  "code": 400,
  "message": "参数错误：keyword不能为空",
  "data": null
}
```

```json
{
  "code": 500,
  "message": "服务器内部错误",
  "data": null
}
```

### 响应字段说明

#### 根级字段

| 字段 | 类型 | 说明 |
|------|------|------|
| code | number | 状态码，200表示成功 |
| message | string | 响应消息 |
| data | object | 响应数据 |

#### data 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| suggestions | array | 建议列表 |
| total | number | 总数量 |
| hasMore | boolean | 是否还有更多数据 |

#### suggestions 数组中每个建议项的字段

| 字段 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| id | string | 是 | 唯一标识符 | "user_001" |
| title | string | 是 | 主标题，显示的主要文本 | "张三" |
| text | string | 否 | 备用文本，当title不存在时使用 | "张三" |
| description | string | 否 | 描述信息，显示在标题下方 | "计算机科学与技术专业" |
| icon | string | 否 | 图标名称（vant图标） | "manager-o" |
| iconColor | string | 否 | 图标颜色 | "#ff6b9d" |
| tag | string | 否 | 标签文本，显示在右侧 | "用户" |
| extra | object | 否 | 额外数据，用于业务逻辑 | 见下表 |

#### extra 字段（根据类型不同而不同）

**用户类型 (type: "user")**
```json
{
  "type": "user",
  "userId": "001",
  "avatar": "https://example.com/avatar/001.jpg",
  "department": "计算机学院",
  "grade": "大三",
  "major": "计算机科学与技术"
}
```

**协会类型 (type: "club")**
```json
{
  "type": "club",
  "clubId": "001",
  "memberCount": 156,
  "category": "技术类",
  "status": "active",
  "foundedDate": "2020-09-01"
}
```

**活动类型 (type: "event")**
```json
{
  "type": "event",
  "eventId": "001",
  "startTime": "2024-03-15T09:00:00Z",
  "endTime": "2024-03-15T17:00:00Z",
  "location": "计算机楼A101",
  "status": "upcoming",
  "participantCount": 45
}
```

## 图标建议

根据不同类型的建议项，推荐使用以下图标：

### 用户相关
- `manager-o` - 管理员/会长
- `friends-o` - 普通用户
- `contact` - 联系人
- `user-o` - 用户

### 协会相关
- `cluster-o` - 协会/组织
- `fire-o` - 热门协会
- `star-o` - 精选协会
- `home-o` - 协会主页

### 活动相关
- `trophy-o` - 比赛活动
- `chat-o` - 交流活动
- `medal-o` - 获奖活动
- `calendar-o` - 日程活动

### 通用
- `search` - 默认搜索
- `hot-o` - 热门
- `new-o` - 最新

## 状态码说明

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误 |
| 401 | 未授权 |
| 403 | 禁止访问 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

## 实现建议

### 后端实现要点

1. **性能优化**
   - 使用数据库索引优化搜索性能
   - 实现搜索结果缓存
   - 限制搜索关键词长度

2. **搜索算法**
   - 支持模糊匹配
   - 按相关度排序
   - 支持拼音搜索（中文）

3. **数据安全**
   - 过滤敏感信息
   - 验证用户权限
   - 防止SQL注入

### 前端使用示例

```javascript
// 在小程序页面中使用
Page({
  // 获取搜索建议
  onFetchSuggestions(e) {
    const { keyword, callback } = e.detail;
    
    wx.request({
      url: 'https://your-api.com/api/search/suggestions',
      method: 'GET',
      data: {
        keyword: keyword,
        limit: 8
      },
      success: (res) => {
        if (res.data.code === 200) {
          callback(res.data.data.suggestions);
        } else {
          console.error('获取建议失败:', res.data.message);
          callback([]);
        }
      },
      fail: (error) => {
        console.error('请求失败:', error);
        callback([]);
      }
    });
  }
});
```

## 测试数据

为了方便测试，可以使用以下模拟数据：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "suggestions": [
      {
        "id": "1",
        "title": "张三",
        "description": "计算机科学与技术专业 · 大三学生",
        "icon": "manager-o",
        "iconColor": "#ff6b9d",
        "tag": "用户",
        "extra": { "type": "user", "userId": "1" }
      },
      {
        "id": "2",
        "title": "计算机协会",
        "description": "专注于计算机技术交流与学习",
        "icon": "cluster-o",
        "iconColor": "#1890ff",
        "tag": "协会",
        "extra": { "type": "club", "clubId": "1" }
      }
    ],
    "total": 2,
    "hasMore": false
  }
}
``` 