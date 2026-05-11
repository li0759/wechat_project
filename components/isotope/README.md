# Isotope 瀑布流组件（微信小程序版）

基于 Isotope.js 实现的微信小程序版本水平瀑布流布局组件。

## 功能特性

- ✅ 支持 masonryHorizontal（水平瀑布流）布局模式
- ✅ 图片动态加载，每张图片加载完成后自动重新布局
- ✅ 根据实际图片尺寸自动调整布局
- ✅ 支持自定义行高和间距
- ✅ 使用 rpx 单位，适配不同屏幕尺寸
- ✅ 平滑飞入 / 飞出过渡动画（自动执行：items 更新或图片加载完成时自动飞入）
- ✅ 双层数组数据时支持定时轮播与反向飞出动画
- ✅ **排序功能**：支持按自定义字段排序，多字段排序，自定义排序函数

## 使用方法

### 1. 在页面 JSON 中引入组件

```json
{
  "usingComponents": {
    "isotope": "../../components/isotope/index"
  }
}
```

### 2. 在 WXML 中使用组件

```xml
<isotope
  id="myIsotope"
  items="{{imagesData}}"
  layoutMode="masonryHorizontal"
  masonryHorizontal="{{masonryConfig}}"
  width="750rpx"
  height="420rpx"
  transitionDuration="0.4s">
</isotope>
```

### 3. 在 JS 中准备数据

```javascript
Page({
  data: {
    // Isotope 配置
    masonryConfig: {
      rowHeight: 50,  // 行高（rpx）
      gutter: 10      // 图片间距（rpx）
    },
    
    // 图片数据
    imagesData: [
      {
        id: 'img-1',
        image: 'https://example.com/image1.jpg',
        ini_width: 200,   // 初始宽度（rpx）
        ini_height: 150   // 初始高度（rpx）
      },
      {
        id: 'img-2',
        image: 'https://example.com/image2.jpg',
        ini_width: 100,
        ini_height: 100
      }
      // ... 更多图片
    ]
  }
})
```

## 属性说明

| 属性名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| items | Array | 是 | [] | 图片数据数组，支持一维或二维数组（二维表示分组轮播） |
| layoutMode | String | 否 | masonryHorizontal | 布局模式 |
| masonryHorizontal | Object | 否 | {} | 水平瀑布流配置 |
| width | String | 否 | 750rpx | 容器宽度 |
| height | String | 否 | 420rpx | 容器高度 |
| transitionDuration | String | 否 | 0.4s | 过渡动画时长 |
| groupInterval | Number | 否 | 6000 | 分组轮播间隔，单位 ms，仅二维数组时生效 |
| imageStyle | Object | 否 | {} | 图片样式配置（见下方说明） |
| autoHeight | Boolean | 否 | false | 是否启用自动高度调整 |
| sortBy | String/Array | 否 | null | 排序字段，支持单字段或多字段数组 |
| sortAscending | Boolean/Array | 否 | true | 排序方向，true 升序，false 降序 |
| getSortData | Object | 否 | {} | 自定义排序值获取函数 |

## imageStyle 图片样式配置

用于设置每个 item 内图片的样式，支持以下属性：

```javascript
{
  borderRadius: '50%',           // 圆角，如 '50%' 或 '10rpx'
  border: '2rpx solid #fff',     // 边框
  boxShadow: '0 4rpx 12rpx rgba(0,0,0,0.2)', // 阴影
  opacity: 0.9                   // 透明度
}
```

示例：圆形头像
```xml
<isotope
  items="{{avatarItems}}"
  imageStyle="{{ { borderRadius: '50%' } }}"
/>
```

## autoHeight 自动高度调整

启用 `autoHeight` 后，组件会根据 items 数量自动计算容器高度：

- 当 `items数量 * (item宽度 + gutter) <= 容器宽度` 时，保持单行高度
- 当 items 需要换行时，自动增加容器高度
- 删除 items 导致行数减少时，自动缩减容器高度
- 高度变化时会触发 `heightChange` 事件

```xml
<isotope
  items="{{items}}"
  autoHeight="{{true}}"
  bind:heightChange="onHeightChange"
/>
```

```javascript
onHeightChange(e) {
  const { height, heightStr, itemCount, rowsNeeded, itemsPerRow } = e.detail
  console.log(`高度变化: ${heightStr}, 行数: ${rowsNeeded}`)
}
```

## 外部接口方法

组件提供以下方法供外部调用：

### setHeight(newHeight)
手动设置容器高度

```javascript
const iso = this.selectComponent('#myIsotope')
iso.setHeight('500rpx')
```

### getHeightInfo()
获取当前高度信息

```javascript
const iso = this.selectComponent('#myIsotope')
const info = iso.getHeightInfo()
// { height: 350, rowsNeeded: 3, itemsPerRow: 7 }
```

### addItem(item, options)
动态添加单个 item（带动画）

### removeItem(itemId)
动态删除单个 item（带动画）

### sort(sortBy, sortAscending)
按指定字段排序

```javascript
const iso = this.selectComponent('#myIsotope')

// 单字段排序
iso.sort('name')           // 按 name 升序
iso.sort('order', false)   // 按 order 降序

// 多字段排序
iso.sort(['category', 'name'], [true, true])  // 先按 category，再按 name
```

### shuffle()
随机打乱顺序

```javascript
const iso = this.selectComponent('#myIsotope')
iso.shuffle()
```

### resetSort()
恢复原始顺序

```javascript
const iso = this.selectComponent('#myIsotope')
iso.resetSort()
```

## items 数据结构

每个 item 对象应包含以下字段：

```javascript
{
  id: String,           // 唯一标识（必填）
  image: String,        // 图片 URL（必填）
  ini_width: Number,    // 初始宽度 rpx（必填）
  ini_height: Number,   // 初始高度 rpx（必填）
  // ... 其他自定义字段（可用于排序）
  name: String,         // 示例：名称字段
  order: Number,        // 示例：排序权重
  date: Date,           // 示例：日期字段
  category: String      // 示例：分类字段
}
```

## masonryHorizontal 配置

```javascript
{
  rowHeight: Number,    // 行高（rpx），建议设置为能被所有图片高度整除的值
  gutter: Number        // 图片间距（rpx）
}
```

## 布局原理

1. **初始布局**：组件根据 `ini_width` 和 `ini_height` 进行初始布局
2. **动态调整**：每张图片加载完成后，获取实际图片尺寸
3. **重新计算**：根据实际宽高比，以 `ini_height` 为基准计算实际宽度
4. **重新布局**：立即重新执行 masonryHorizontal 布局算法
5. **平滑过渡**：通过 CSS transition 实现平滑的位置变化

## 布局算法（masonryHorizontal）

水平瀑布流布局按行排列：

1. 根据容器高度和行高计算可容纳的行数
2. 对每个图片项：
   - 计算它占用的行数（rowSpan）
   - 找出 X 坐标最小的行组
   - 将图片放置在该位置
   - 更新该行组的 X 坐标

## 示例：协会封面展示

参考 `pages/home/index.js` 中的 `prepareClubForIsotope` 方法：

```javascript
prepareClubForIsotope(club, index) {
  const allImagesData = [
    {
      id: `${club.club_id}-cover`,
      image: club.cover_url,
      type: 'club_cover',
      ini_height: 200,
      ini_width: 200
    },
    // 社长头像
    {
      id: `${club.club_id}-president`,
      image: club.president_info.avatar,
      type: 'president_avatar',
      ini_height: 100,
      ini_width: 100
    },
    // 更多图片...
  ];
  
  return {
    ...club,
    allImagesData
  };
}
```

## 注意事项

1. **单位统一**：所有尺寸参数必须使用 rpx 单位
2. **初始尺寸**：`ini_width` 和 `ini_height` 必须提供，用于初始布局
3. **行高设置**：建议 `rowHeight` 能被所有图片高度整除，以获得最佳布局效果
4. **唯一 ID**：每个 item 的 `id` 必须唯一
5. **分组轮播**：当 `items` 传入二维数组时，每一组会依次执行“飞出 → 下一组飞入”的动画，可通过 `groupInterval` 控制停留时间；一维数组时保持原有一次性飞入效果
6. **渐进加载**：每张图片加载完成后立即重新布局，无需等待全部加载完成

## 排序功能

### 基础排序

通过属性或方法触发排序：

```xml
<!-- 通过属性排序 -->
<isotope
  items="{{items}}"
  sortBy="order"
  sortAscending="{{true}}"
  bind:sortComplete="onSortComplete"
/>
```

```javascript
// 通过方法排序
const iso = this.selectComponent('#myIsotope')
iso.sort('name')        // 按 name 升序
iso.sort('order', false) // 按 order 降序
```

### 多字段排序

支持按多个字段依次排序：

```javascript
// 先按 category 升序，再按 order 降序
iso.sort(['category', 'order'], [true, false])
```

### 自定义排序函数

通过 `getSortData` 定义复杂排序逻辑：

```xml
<isotope
  items="{{items}}"
  getSortData="{{sortFunctions}}"
  sortBy="priority"
/>
```

```javascript
Page({
  data: {
    sortFunctions: {
      // 按 order 的绝对值排序
      absOrder: (item) => Math.abs(item.order),
      
      // 按分类优先级排序
      priority: (item) => {
        const rank = { 'VIP': 0, 'Normal': 1, 'Guest': 2 }
        return rank[item.category] || 99
      },
      
      // 按日期排序（转换为时间戳）
      dateNum: (item) => new Date(item.date).getTime()
    }
  }
})
```

### 排序事件

排序完成后触发 `sortComplete` 事件：

```javascript
onSortComplete(e) {
  const { sortBy, sortAscending, items } = e.detail
  console.log('排序完成:', sortBy, items.length)
}
```

### 排序动画

排序时 items 会平滑地从旧位置移动到新位置，动画时长由 `transitionDuration` 控制。

## 兼容性

- 微信小程序基础库 2.0+
- 依赖 TDesign 的 t-image 组件

