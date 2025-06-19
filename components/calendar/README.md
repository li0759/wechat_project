# 微信小程序自定义日历插件

这是一个专为微信小程序设计的自定义日历插件，使用原生JS开发，配合vant组件库实现美观的UI效果。

## 功能特点

1. 支持显示特定日期的特定事件，每个日期可显示多个事件
2. 有事件的日期右上角显示红色角标，标明事件数量，底色为粉红色
3. 点击有事件的日期会在屏幕中央弹出窗口(宽高为屏幕的80%)，列出该日期的所有事件
4. 支持按月显示、翻页切换月份
5. 点击年月可以直接选择指定的年月
6. 支持通过年月切换事件获取指定年月的数据
7. 使用vant组件库的弹窗、按钮等组件，统一视觉效果

## 安装使用

### 前提条件

确保你的项目已经安装了Vant Weapp组件库：

```bash
npm i @vant/weapp -S --production
```

并且在app.json或对应页面的json文件中配置了vant组件的路径。

### 使用方法

1. 将整个calendar文件夹复制到你的项目的components目录下

2. 在需要使用日历组件的页面的json文件中添加组件引用：

```json
{
  "usingComponents": {
    "calendar": "/components/calendar/calendar"
  }
}
```

3. 在页面的wxml文件中使用组件：

```html
<calendar 
  show="{{ showCalendar }}" 
  events="{{ calendarEvents }}" 
  bind:select="onCalendarSelect"
  bind:close="onCalendarClose"
  bind:eventClick="onCalendarEventClick"
  bind:monthChange="onCalendarMonthChange"
/>
```

4. 在页面的js文件中添加相关数据和方法：

```javascript
Page({
  data: {
    showCalendar: false,
    calendarEvents: [
      {
        active_time: new Date('2024-01-01').getTime(),
        active_url: 'https://example.com/image1.jpg',
        active_title: '元旦活动',
        url: '/pages/event/detail?id=1'
      },
      {
        active_time: new Date('2024-01-15').getTime(),
        active_title: '中旬促销',
        url: '/pages/event/detail?id=2'
      }
    ]
  },
  
  // 显示日历
  showCalendar() {
    this.setData({
      showCalendar: true
    });
  },
  
  // 日历选择回调
  onCalendarSelect(e) {
    const { date, events } = e.detail;
    console.log('选中日期:', new Date(date));
    console.log('当日事件:', events);
  },
  
  // 日历关闭
  onCalendarClose() {
    this.setData({
      showCalendar: false
    });
  },
  
  // 点击事件项
  onCalendarEventClick(e) {
    const { event } = e.detail;
    
    if (event && event.url) {
      wx.navigateTo({
        url: event.url
      });
    }
  },
  
  // 日历月份变更
  onCalendarMonthChange(e) {
    const { year, month } = e.detail;
    console.log('日历切换到:', year + '年' + month + '月');
    // 这里可以根据年月获取新的数据
    this.fetchCalendarData(year, month);
  },
  
  // 获取指定年月的数据
  fetchCalendarData(year, month) {
    // 示例：通过API获取指定年月的数据
    wx.request({
      url: 'your-api-endpoint',
      data: { year, month },
      success: (res) => {
        this.setData({
          calendarEvents: this.formatCalendarEvents(res.data)
        });
      }
    });
  }
})
```

## API

### 属性

| 参数 | 说明 | 类型 | 默认值 |
| --- | --- | --- | --- |
| show | 是否显示日历 | Boolean | false |
| events | 事件数据数组 | Array | [] |
| minDate | 可选择的最小日期 | Number(时间戳) | 去年1月1日 |
| maxDate | 可选择的最大日期 | Number(时间戳) | 明年12月31日 |

### events数组项的结构

| 字段 | 说明 | 类型 | 必填 |
| --- | --- | --- | --- |
| active_time | 事件时间 | Number(时间戳) | 是 |
| active_url | 事件封面图片URL | String | 否 |
| active_title | 事件标题 | String | 是 |
| url | 事件详情页面路径 | String | 否 |

### 事件

| 事件名 | 说明 | 参数 |
| --- | --- | --- |
| bind:select | 选择日期时触发 | event.detail = { date: 选中的日期(时间戳), events: 当日事件数组 } |
| bind:close | 关闭日历时触发 | - |
| bind:eventClick | 点击事件项时触发 | event.detail = { event: 事件对象, date: 选中的日期(时间戳) } |
| bind:monthChange | 日历月份变更时触发 | event.detail = { year: 年份, month: 月份 } |

## 自定义样式

组件采用BEM命名规范，你可以通过修改以下CSS类来自定义样式：

- `.custom-calendar` - 日历容器
- `.day-has-events` - 有事件的日期
- `.event-badge` - 事件数量角标
- `.event-popup` - 事件弹窗

## 注意事项

1. 事件数据(events)中的active_time必须是时间戳格式
2. 组件内部会根据active_time自动计算并显示对应日期的事件标记
3. 当有多个事件时，右上角的数字会显示事件的数量
4. 点击有事件的日期会自动弹出事件列表弹窗
5. 当日历月份变更时，会触发monthChange事件，可在该事件中获取指定年月的数据 