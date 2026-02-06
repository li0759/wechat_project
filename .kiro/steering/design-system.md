---
inclusion: always
---

# 微信小程序设计系统规则

本文档定义了 WeTest 小程序的设计系统规范，包括颜色、字体、间距、组件样式等。

## ⚠️ 核心设计原则（必读）

### 🎯 设计系统适用范围
本设计系统适用于 **WeTest 小程序的所有页面**，包括但不限于：
- **首页（home）**：活动列表、协会总览、搜索
- **个人中心（profile）**：用户信息、我的活动、我的协会
- **管理面板（panels）**：活动管理、协会管理、成员管理
- **详情页（detail）**：活动详情、协会详情、用户详情
- **创建/编辑页**：创建活动、编辑协会、表单页面

### 🔧 优化指导原则
在优化任何页面时，遵循以下原则：

**如非必要，不要改变**：
1. **布局结构**：保持现有的 WXML 结构、组件层级、容器类型（除非有明确的优化理由）
2. **交互模式**：保留 expandable-container、抽屉、瀑布流等已有交互方式
3. **功能逻辑**：保持所有功能性元素的完整性（除非需要删除冗余功能）

**优先优化的内容**：
1. **视觉样式**：颜色、字体、间距、圆角、阴影、边框
2. **交互反馈**：:active 状态、动画时长、过渡效果
3. **可供性**：图标、文案提示、视觉层次
4. **一致性**：统一相同元素的样式和行为

**必须遵守的规则**：
1. **响应式单位**：必须使用 rpx，不能使用 px
2. **设计哲学**：遵循"少点击、扁平展开、快速操作"原则
3. **品牌色**：主题色 #DF76B0（粉色），不是紫色
4. **移动优先**：使用 :active 而非 :hover

### 🎯 设计目标
- **视觉现代化**：使用简洁、清晰的视觉语言
- **品牌一致性**：强化主题色 #DF76B0（粉色，不是紫色）
- **可读性优化**：提升文本对比度和层次感
- **触摸友好**：优化移动端交互体验

### 📐 设计参考（REFERENCES）
**推荐风格**：
- Notion：简洁、清晰的卡片设计
- Linear：现代、扁平的界面风格
- Apple Human Interface Guidelines：优雅、克制的视觉语言
- WeChat 原生组件：符合用户习惯的交互模式

**避免风格**：
- Material Design：过于厚重的阴影和动画
- Bootstrap：传统的按钮和表单样式
- Ant Design：企业级的复杂视觉
- 紫色/蓝色渐变：避免千篇一律的渐变设计

### 🎨 视觉风格指南
1. **简洁优先**：使用细边框而非厚重阴影
2. **留白充足**：保持元素间的呼吸感
3. **层次清晰**：通过颜色和间距区分层级，而非阴影
4. **品牌色克制使用**：主题色用于强调，不要过度使用
5. **移动优先**：使用 :active 而非 :hover

## 📐 布局设计哲学（LAYOUT PHILOSOPHY）

### 视觉层次原则（Visual Hierarchy）

#### 1. 信息密度控制
- **主要内容区域**：占屏幕 60-70%，是用户视觉焦点
- **次要信息区域**：占屏幕 20-30%，提供辅助信息
- **留白区域**：占屏幕 10-20%，提供呼吸感

#### 2. 内容占比规范
```
图片 vs 文字比例：
- 卡片封面：图片 60% + 文字 40%
- 详情页：图片 30% + 文字 70%
- 列表项：图片 20% + 文字 80%

色块 vs 内容比例：
- 强调区域（头部、按钮）：色块 100%
- 信息展示区域：色块 0%，使用边框
- 状态标签：色块作为点缀，不超过 10%
```

#### 3. 视觉焦点设计
**F 型阅读模式**（适用于列表、表单）：
- 左上角：最重要信息（标题、用户名）
- 左侧纵向：次要信息（描述、时间）
- 右侧：操作按钮、状态标签

**Z 型阅读模式**（适用于卡片、海报）：
- 左上 → 右上：标题 → 状态
- 左下 → 右下：描述 → 操作

#### 4. 输入与展示的结合
**表单设计原则**：
- 标签在上，输入框在下（垂直布局）
- 标签字号 26-28rpx，输入框字号 30-32rpx
- 输入框高度 80-100rpx，保证触摸友好
- 输入框与展示内容使用相同样式，保持一致性

**内容展示原则**：
- 只读内容：浅色背景 + 细边框
- 可编辑内容：白色背景 + 明显边框
- 禁用内容：灰色背景 + 灰色文字

### 布局气质定义（Layout Personality）

#### 当前项目气质：**高效、扁平、直接**

**具体体现**：
1. **扁平展开 > 层层嵌套**
   - ✅ 使用 expandable-container 一次展开所有信息
   - ❌ 避免多层弹窗、多级菜单

2. **快速操作 > 繁琐流程**
   - ✅ 关键操作在首屏可见（如"开始活动"按钮）
   - ✅ 使用头像墙快速浏览成员
   - ❌ 避免"点击查看详情 → 再点击操作"的多步流程

3. **信息密度适中 > 过度留白**
   - ✅ 在有限空间内展示更多信息（如 split-row 左右布局）
   - ✅ 使用紧凑的 mini-row 展示关键数据
   - ❌ 避免过度留白导致滚动过多

4. **功能优先 > 装饰优先**
   - ✅ 每个元素都有明确功能
   - ✅ 装饰性元素（如图标）辅助理解，不喧宾夺主
   - ❌ 避免纯装饰性的大图、动画

### 布局模式库（Layout Patterns）

#### 模式 1：管理行（Management Row）
```
用途：快速编辑单个字段
布局：[标签 20%] [内容 60%] [箭头 20%]
高度：100rpx
交互：点击展开 expandable-container
```

#### 模式 2：信息面板（Info Panel）
```
用途：展示一组相关信息
布局：
  - 头部：[图标+标题 70%] [提示 30%]
  - 主体：多行 mini-row 或自定义内容
高度：300rpx
交互：点击展开查看详情
```

#### 模式 3：分栏布局（Split Layout）
```
用途：并列展示两个同等重要的内容
布局：[左侧 50%] [右侧 50%]
间距：16rpx
应用：封面+地图、活动人员+动态
```

#### 模式 4：头像墙（Avatar Grid）
```
用途：快速浏览成员列表
布局：Isotope 瀑布流，自适应高度
头像尺寸：92rpx × 92rpx
间距：12rpx
交互：点击头像查看详情，快捷按钮操作
```

#### 模式 5：瀑布流卡片（Waterfall Cards）
```
用途：浏览大量内容（活动、协会）
布局：双列，自适应高度
卡片比例：图片 60% + 文字 40%
间距：12rpx
交互：点击卡片进入详情
```

### 操作便捷性原则（Usability）

#### 1. 触摸目标尺寸
- **最小触摸区域**：88rpx × 88rpx（44px × 44px）
- **推荐按钮高度**：80-100rpx
- **推荐输入框高度**：80-100rpx
- **头像可点击区域**：≥ 88rpx

#### 2. 操作层级 ⭐
**一级操作**（最常用）：
- 位置：**固定在屏幕底部**（必须始终可见）
- 样式：主题色填充按钮，高度 88rpx
- 示例：开始活动、保存、提交
- **关键原则**：无需滚动即可操作

**二级操作**（次常用）：
- 位置：固定底部栏或内容区域内
- 样式：边框按钮，高度 72-80rpx
- 示例：分享、编辑

**三级操作**（偶尔使用）：
- 位置：固定底部栏（紧凑型）或更多菜单
- 样式：浅色边框按钮，高度 72rpx
- 示例：取消、删除

**固定底部操作栏规范**：
```xml
<view class="fixed-action-bar">
  <view class="action-primary">主操作</view>
  <button class="action-secondary">次操作</button>
  <view class="action-tertiary-compact">三级</view>
</view>
```

```css
.fixed-action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16rpx 20rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  background: #FFFFFF;
  box-shadow: 0 -4rpx 20rpx rgba(0, 0, 0, 0.08);
  z-index: 1000;
  display: flex;
  gap: 12rpx;
}
```

**适用场景**：
- ✅ 管理面板的主要操作
- ✅ 表单的提交按钮
- ✅ 详情页的关键操作

**禁止**：
- ❌ 将关键操作放在需要滚动的位置
- ❌ 底部栏放置次要操作
- ❌ 底部栏超过 3 个按钮

#### 3. 反馈机制 ⭐
**所有交互元素必须有统一的即时反馈**：

- **即时反馈**：:active 状态（0.3s 内）
  ```css
  .clickable:active {
    background: var(--md-sys-color-surface-variant);
    border-color: var(--md-sys-color-primary);
    transform: scale(0.98-0.99);
    transition: all 0.3s;
  }
  ```

- **加载反馈**：骨架屏、loading 动画
  ```xml
  <view class="action-primary {{loading ? 'loading' : ''}}">
    <t-loading wx:if="{{loading}}" size="20" color="#fff" />
    <text wx:else>开始活动</text>
  </view>
  ```

- **结果反馈**：Toast 提示、状态变化

**反馈一致性原则**：
- ✅ 所有可点击元素使用相同的 :active 效果
- ✅ 动画时长统一为 0.3s
- ✅ 包含背景变化 + 边框高亮 + 轻微缩放
- ❌ 禁止不同元素使用不同时长
- ❌ 禁止某些元素没有反馈
- ❌ 禁止使用 button::after 作为唯一反馈

### 视觉焦点引导（Visual Focus）

#### 1. 颜色引导
- **主题色**：用于最重要的操作（如"保存"按钮）
- **高对比度**：用于关键信息（如标题）
- **低对比度**：用于次要信息（如时间戳）

#### 2. 尺寸引导
- **大字号**（36-48rpx）：页面标题、重要数字
- **标准字号**（28-32rpx）：正文内容
- **小字号**（22-26rpx）：辅助信息

#### 3. 位置引导
- **屏幕上方**：导航、标题
- **屏幕中央**：主要内容
- **屏幕下方**：主要操作按钮

#### 4. 动效引导
- **入场动画**：新内容从下方滑入
- **强调动画**：重要元素轻微缩放
- **过渡动画**：状态变化平滑过渡

## 🎨 颜色系统（现代化升级）

### 主色调
- **主题色**: `#DF76B0` - 用于头部、按钮、强调元素
- **主题色（深色）**: `#C85A9E` - 用于按压状态（:active）
- **主题色（浅色）**: `rgba(223, 118, 176, 0.1)` - 用于背景高亮
- **主题色渐变**: `linear-gradient(135deg, #DF76B0 0%, #C85A9E 100%)` - 用于按钮、卡片强调
- **主题色阴影**: `rgba(223, 118, 176, 0.25)` - 用于主题色元素阴影

### 背景色（优化层次）
- **页面背景**: `#F8F9FB` - 主要页面背景（更柔和）
- **卡片背景**: `#FFFFFF` - 卡片、面板背景
- **次级背景**: `#F2F4F7` - 输入框、次级区域（更清晰的层次）
- **悬浮背景**: `#F7F8FA` - 触摸反馈背景
- **遮罩背景**: `rgba(0, 0, 0, 0.6)` - 半透明遮罩

### 文本颜色（优化对比度）
- **主文本**: `#1A1D1F` - 标题、重要文本（更深，对比度更好）
- **次文本**: `#6F767E` - 描述性文本（更柔和）
- **辅助文本**: `#9A9FA5` - 提示、标签
- **禁用文本**: `#D1D5DB` - 禁用状态文本
- **白色文本**: `#FFFFFF` - 深色背景上的文本

### 状态颜色（更鲜明）
- **成功**: `#10B981` - 成功状态（更现代的绿色）
- **成功（浅色）**: `#D1FAE5` - 成功背景
- **进行中**: `#10B981` - 进行中状态
- **错误**: `#EF4444` - 错误、警告状态（更鲜明的红色）
- **错误（浅色）**: `#FEE2E2` - 错误背景
- **信息**: `#3B82F6` - 信息提示（更现代的蓝色）
- **信息（浅色）**: `#DBEAFE` - 信息背景
- **警告**: `#F59E0B` - 警告提示（更鲜明的橙色）
- **警告（浅色）**: `#FEF3C7` - 警告背景
- **管理**: `#6750A4` - 管理相关

### 边框颜色（更清晰的层次）
- **浅边框**: `#E5E7EB` - 主要分隔线
- **中边框**: `#D1D5DB` - 次级分隔线
- **深边框**: `#9CA3AF` - 强调边框
- **半透明边框**: `rgba(255, 255, 255, 0.3)` - 毛玻璃效果边框

## 📝 字体系统

### 字号规范
- **超大标题**: `48rpx` - 统计数字、重要数据
- **大标题**: `44rpx` - 主标题
- **标题**: `40rpx` - 弹窗标题
- **副标题**: `36rpx` - 用户名、卡片标题
- **大正文**: `34rpx` - 热门活动标题
- **标准标题**: `32rpx` - 用户名、section 标题
- **正文**: `30rpx` - 列表项文本
- **小正文**: `28rpx` - 描述文本、卡片标题
- **辅助文本**: `26rpx` - 次要信息
- **小字**: `24rpx` - 标签、角标、时间
- **超小字**: `22rpx` - 提示文本、徽章
- **最小字**: `20rpx` - 标签内文本

### 字重规范
- **特粗**: `900` / `850` / `800` - 重要标题
- **粗体**: `700` / `650` - 强调文本、数字
- **半粗**: `600` - 标题、用户名
- **中等**: `500` - 次级标题
- **常规**: `400` (默认) - 正文

## 📏 间距系统

### 内边距 (Padding)
- **超小**: `4rpx` - 徽章、标签
- **小**: `6rpx` / `8rpx` / `10rpx` - 紧凑元素
- **标准**: `12rpx` / `16rpx` / `20rpx` - 常规间距
- **中等**: `24rpx` / `30rpx` - 卡片、section
- **大**: `40rpx` - 页面边距

### 外边距 (Margin)
- **超小**: `2rpx` / `4rpx` / `6rpx` - 紧密元素
- **小**: `8rpx` / `10rpx` / `12rpx` - 相关元素
- **标准**: `16rpx` / `20rpx` - 常规间距
- **中等**: `24rpx` - 组件间距
- **大**: `40rpx` / `100rpx` - 大区块间距

### 间隙 (Gap)
- **紧密**: `2rpx` / `4rpx` - flex 子元素
- **标准**: `8rpx` / `10rpx` / `12rpx` - 图标与文本
- **宽松**: `16rpx` / `20rpx` - 按钮组

## 🔲 圆角系统（现代化升级）

- **超小圆角**: `6rpx` - 小标签、徽章
- **小圆角**: `12rpx` - 按钮、输入框
- **标准圆角**: `16rpx` - 卡片、小面板
- **大圆角**: `20rpx` - 大卡片、面板
- **超大圆角**: `24rpx` - 弹窗、大面板
- **特大圆角**: `32rpx` - 搜索框、特殊容器
- **圆形**: `9999rpx` / `50%` - 头像、圆形按钮

## 🎭 阴影系统（现代化升级）

### 卡片阴影（多层柔和）
```css
/* 超小阴影 - 悬浮元素 */
box-shadow: 0 1rpx 2rpx rgba(0, 0, 0, 0.05);

/* 小阴影 - 卡片默认 */
box-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.06), 0 1rpx 2rpx rgba(0, 0, 0, 0.04);

/* 中阴影 - 卡片悬浮 */
box-shadow: 0 4rpx 8rpx rgba(0, 0, 0, 0.08), 0 2rpx 4rpx rgba(0, 0, 0, 0.06);

/* 大阴影 - 弹窗、面板 */
box-shadow: 0 8rpx 16rpx rgba(0, 0, 0, 0.1), 0 4rpx 8rpx rgba(0, 0, 0, 0.08);

/* 超大阴影 - 全屏弹窗 */
box-shadow: 0 12rpx 24rpx rgba(0, 0, 0, 0.12), 0 6rpx 12rpx rgba(0, 0, 0, 0.1);
```

### 主题色阴影（增强品牌感）
```css
/* 主题色阴影 - 主按钮 */
box-shadow: 0 4rpx 12rpx rgba(223, 118, 176, 0.25);

/* 主题色大阴影 - 主按钮激活 */
box-shadow: 0 8rpx 20rpx rgba(223, 118, 176, 0.3);
```

### 文本阴影
```css
/* 小文本阴影 */
text-shadow: 0 1rpx 2rpx rgba(0, 0, 0, 0.5);

/* 中文本阴影 */
text-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.5);

/* 大文本阴影 */
text-shadow: 0 3rpx 6rpx rgba(0, 0, 0, 0.5);
```

### 特殊阴影
```css
/* 徽章阴影 */
box-shadow: 0 4rpx 12rpx rgba(255, 215, 0, 0.4);

/* 错误按钮阴影 */
box-shadow: 0 4rpx 12rpx rgba(239, 68, 68, 0.3);

/* 成功按钮阴影 */
box-shadow: 0 4rpx 12rpx rgba(16, 185, 129, 0.3);
```

## 🎬 动画系统

### 过渡时间
- **快速**: `0.2s` - 小元素（已废弃，统一使用 0.3s）
- **标准**: `0.3s` - 所有交互元素（按钮、行、面板）
- **缓动函数**: `cubic-bezier(0.25, 0.46, 0.45, 0.94)` - 抽屉动画

### 交互反馈一致性原则 ⭐
**所有可点击元素必须有统一的反馈**：
```css
/* 标准交互反馈（所有可点击元素） */
.clickable:active {
  background: var(--md-sys-color-surface-variant);
  border-color: var(--md-sys-color-primary);
  transform: scale(0.98-0.99);
  transition: all 0.3s;  /* 统一时长 */
}
```

**反馈要素**：
1. **背景变化**：白色 → 浅灰
2. **边框高亮**：灰色 → 主题色
3. **轻微缩放**：0.98-0.99
4. **时长统一**：0.3s

**适用范围**：
- ✅ 编辑行
- ✅ 按钮（主按钮、次按钮、三级按钮）
- ✅ 面板卡片
- ✅ FAB 按钮
- ✅ 所有可点击元素

**禁止**：
- ❌ 不同元素使用不同时长
- ❌ 某些元素没有反馈
- ❌ 使用 button::after 作为唯一反馈

### 关键帧动画
```css
/* 浮动动画 */
@keyframes float {
  0%, 100% { transform: translateY(0rpx) rotate(0deg); }
  50% { transform: translateY(-20rpx) rotate(5deg); }
}

/* 发光动画 */
@keyframes glow {
  0% { opacity: 0.5; transform: scale(1); }
  100% { opacity: 1; transform: scale(1.05); }
}

/* 脉冲动画 */
@keyframes badgePulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
```

## 📦 组件规范（通用）

本章节定义了小程序中常见组件的样式规范，适用于所有页面。

### 通用交互元素

#### 可点击元素的统一反馈 ⭐
**适用范围**：所有可点击的元素（按钮、卡片、列表项、编辑行、面板等）

```css
.clickable:active {
  background: var(--md-sys-color-surface-variant);
  border-color: var(--md-sys-color-primary);
  transform: scale(0.98-0.99);
  transition: all 0.3s;
}
```

**反馈要素**：
1. **背景变化**：白色 → 浅灰
2. **边框高亮**：灰色 → 主题色
3. **轻微缩放**：0.98-0.99
4. **时长统一**：0.3s

### 按钮组件 ⭐

按钮是最常用的交互元素，适用于所有页面的操作场景。

#### 一级按钮（主按钮）
**使用场景**：最重要的操作（提交、保存、开始、确认等）

```css
.action-primary {
  flex: 1;
  height: 88rpx;
  background: var(--md-sys-color-primary);
  color: #FFFFFF;
  border-radius: 12rpx;
  font-size: 30rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  transition: all 0.3s;
  box-shadow: 0 2rpx 8rpx rgba(223, 118, 176, 0.25);
}

.action-primary:active {
  background: var(--md-sys-color-primary-dark);
  transform: scale(0.98);
  box-shadow: 0 4rpx 12rpx rgba(223, 118, 176, 0.3);
}
```

#### 二级按钮（次按钮）
**使用场景**：次要操作（分享、编辑、查看等）

```css
.action-secondary {
  flex: 1;
  height: 80rpx;
  background: transparent;
  color: var(--md-sys-color-primary);
  border: 1rpx solid var(--md-sys-color-primary);
  border-radius: 12rpx;
  font-size: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  transition: all 0.3s;
}

.action-secondary:active {
  background: var(--md-sys-color-primary-light);
  transform: scale(0.98);
}

.action-secondary::after {
  border: none;  /* 移除原生 button 边框 */
}
```

#### 三级按钮（危险/取消操作）
**使用场景**：危险操作（取消、删除、退出等）

```css
.action-tertiary {
  width: 100%;
  height: 72rpx;
  background: transparent;
  color: #EF4444;
  border: 1rpx solid #FEE2E2;
  border-radius: 12rpx;
  font-size: 26rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  transition: all 0.3s;
}

.action-tertiary:active {
  background: #FEE2E2;
  transform: scale(0.98);
}

/* 紧凑型三级按钮（用于底部栏或空间受限场景）*/
.action-tertiary-compact {
  flex: 0 0 auto;
  min-width: 100rpx;
  height: 72rpx;
  padding: 0 16rpx;
  /* 其他样式同 action-tertiary */
}
```

#### 危险按钮
**使用场景**：不可逆的危险操作（结束活动、删除协会等）

```css
.action-danger {
  flex: 1;
  height: 88rpx;
  background: #EF4444;
  color: #FFFFFF;
  border-radius: 12rpx;
  font-size: 30rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  transition: all 0.3s;
  box-shadow: 0 2rpx 8rpx rgba(239, 68, 68, 0.25);
}

.action-danger:active {
  background: #DC2626;
  transform: scale(0.98);
  box-shadow: 0 4rpx 12rpx rgba(239, 68, 68, 0.3);
}
```

**按钮使用原则**：
- ✅ 所有按钮必须有 :active 状态
- ✅ 动画时长统一为 0.3s
- ✅ 包含缩放效果（0.98）
- ✅ 主按钮和危险按钮有阴影增强
- ✅ 原生 button 组件必须添加 `::after { border: none; }`
- ❌ 禁止使用不同的动画时长
- ❌ 禁止某些按钮没有反馈

### 卡片组件

**适用场景**：首页活动卡片、协会卡片、列表项等

```css
.card {
  background: var(--md-sys-color-surface);
  border-radius: var(--md-sys-shape-corner-medium);
  box-shadow: var(--md-sys-elevation-1);
  border: 1rpx solid #E5E7EB;
  overflow: hidden;
  transition: all 0.3s;
}

.card:active {
  border-color: var(--md-sys-color-primary);
  box-shadow: var(--md-sys-elevation-2);
  transform: scale(0.99);
}
```

**卡片规范**：
- 背景: `#fff`
- 圆角: `16rpx`（标准）/ `12rpx`（小卡片）
- 阴影: `0 2rpx 4rpx rgba(0, 0, 0, 0.06), 0 1rpx 2rpx rgba(0, 0, 0, 0.04)`
- 内边距: `16rpx`（标准）/ `12rpx`（紧凑）
- 边框: `1rpx solid #E5E7EB`

### 列表项组件

**适用场景**：个人中心列表、设置列表、选择列表等

```css
.list-item {
  background: var(--md-sys-color-surface);
  padding: 24rpx 32rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1rpx solid #E5E7EB;
  transition: all 0.3s;
}

.list-item:active {
  background: var(--md-sys-color-surface-variant);
}
```

### 可编辑行组件（管理面板专用）⭐

**适用场景**：活动管理、协会管理等需要编辑的场景

#### 标准编辑行（100rpx）
```xml
<expandable-container id="row-title" expanded-width="700" expanded-height="520" bg-color="#f2f3f5">
  <view slot="trigger" class="row row-100 row-editable">
    <view class="row-left">
      <text class="row-label">标题</text>
      <text class="edit-hint">点击编辑</text>
    </view>
    <view class="row-right">
      <text class="row-value">{{value || '未设置'}}</text>
      <t-icon name="edit" size="20" color="var(--md-sys-color-primary)" />
    </view>
  </view>
  <view slot="content" class="popup-shell">
    <!-- 编辑内容 -->
  </view>
</expandable-container>
```

```css
.row-editable {
  transition: all 0.3s;
  cursor: pointer;
}

.row-editable:active {
  background: var(--md-sys-color-surface-variant);
  border-color: var(--md-sys-color-primary);
  transform: scale(0.99);
}

.edit-hint {
  font-size: 20rpx;
  color: var(--md-sys-color-primary);
  margin-top: 4rpx;
  font-weight: 500;
}
```

**可供性设计原则**：
- ✅ 使用 edit 图标（而非 chevron-right）
- ✅ 添加"点击编辑"文案提示
- ✅ 图标使用主题色强调
- ✅ 必须有 :active 状态反馈
- ✅ 内容预览至少 2 行（clamp-2）

#### 基础行（多行内容）
```xml
<view class="row row-basic row-editable">
  <view class="row-basic-left">
    <text class="row-label">简介</text>
    <text class="edit-hint">点击编辑</text>
  </view>
  <view class="row-basic-right">
    <view class="row-basic-title clamp-1">已填写</view>
    <view class="row-basic-desc clamp-2">{{content}}</view>
  </view>
  <view class="row-basic-arrow">
    <t-icon name="edit" size="20" color="var(--md-sys-color-primary)" />
  </view>
</view>
```
    </view>
  </view>
  <view slot="content" class="popup-shell">
    <!-- 编辑内容 -->
  </view>
</expandable-container>
```

```css
.row-editable {
  transition: all 0.3s;
  cursor: pointer;
}

.row-editable:active {
  background: var(--md-sys-color-surface-variant);
  border-color: var(--md-sys-color-primary);
  transform: scale(0.99);
}

.edit-hint {
  font-size: 20rpx;
  color: var(--md-sys-color-primary);
  margin-top: 4rpx;
  font-weight: 500;
}
```

**可供性设计原则**：
- ✅ 使用 edit 图标（而非 chevron-right）
- ✅ 添加"点击编辑"文案提示
- ✅ 图标使用主题色强调
- ✅ 必须有 :active 状态反馈
- ✅ 内容预览至少 2 行（clamp-2）

#### 基础行（多行内容）
```xml
<view class="row row-basic row-editable">
  <view class="row-basic-left">
    <text class="row-label">简介</text>
    <text class="edit-hint">点击编辑</text>
  </view>
  <view class="row-basic-right">
    <view class="row-basic-title clamp-1">已填写</view>
    <view class="row-basic-desc clamp-2">{{content}}</view>
  </view>
  <view class="row-basic-arrow">
    <t-icon name="edit" size="20" color="var(--md-sys-color-primary)" />
  </view>
</view>
```

### 面板组件（管理面板专用）⭐

**适用场景**：活动管理、协会管理中的信息展示面板

#### 可点击面板
```xml
<view class="panel panel-300" bindtap="onPanelTap">
  <view class="panel-header">
    <view class="panel-title">
      <t-icon name="image" color="var(--md-sys-color-primary)" />
      <text>封面</text>
    </view>
    <text class="panel-hint">点我更换</text>
  </view>
  <image class="panel-image" src="{{cover}}" mode="aspectFill" />
</view>
```

```css
.panel {
  background: var(--md-sys-color-surface);
  border-radius: var(--md-sys-shape-corner-medium);
  box-shadow: var(--md-sys-elevation-1);
  border: 1rpx solid #E5E7EB;
  overflow: hidden;
  transition: all 0.3s;
}

.panel:active {
  border-color: var(--md-sys-color-primary);
  box-shadow: var(--md-sys-elevation-2);
  transform: scale(0.99);
}
```

**面板使用原则**：
- ✅ 所有可点击面板必须有 :active 状态
- ✅ 包含边框高亮 + 阴影增强 + 轻微缩放
- ✅ 动画时长 0.3s
- ✅ 添加"点我更换"等文案提示

#### 通知面板（弹窗内容）
```css
.notification-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #ffffff;
  border-radius: 24rpx;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid rgba(0, 0, 0, 0.06);
}

.panel-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333333;
}
```

### 徽章组件
- 背景: `#ff4d4f` / `linear-gradient(135deg, #ffd700, #ffb347)`
- 圆角: `16rpx` / `20rpx`
- 最小宽度: `32rpx`
- 高度: `32rpx`
- 字号: `20rpx` / `22rpx`

### 头像组件
- 尺寸: `60rpx` / `72rpx` / `80rpx` / `120rpx`
- 圆角: `50%`
- 边框: `2rpx solid #fff` / `3rpx solid rgba(255, 255, 255, 0.8)`
- 阴影: `0 2rpx 8rpx rgba(0, 0, 0, 0.1)`

### 标签组件
- 背景: `rgba(255, 255, 255, 0.15)` + `backdrop-filter: blur(10rpx)`
- 边框: `1rpx solid rgba(255, 255, 255, 0.3)`
- 圆角: `20rpx`
- 内边距: `8rpx 16rpx`
- 字号: `20rpx` / `22rpx`

### 弹窗组件（通用）⭐

**适用场景**：所有需要弹窗的场景（详情、编辑、选择等）

#### 弹窗容器
```css
.popup-container {
  height: 100%;
  background: #fff;  /* 详情弹窗 */
  /* background: #f7f8fa;  管理弹窗 */
  display: flex;
  flex-direction: column;
}
```

#### 弹窗头部
```css
.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid #E5E7EB;
}

.popup-title {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--md-sys-color-on-surface);
}

.popup-close {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

.popup-close:active {
  background: rgba(0, 0, 0, 0.1);
}
```

#### 弹窗主体
```css
.popup-body {
  flex: 1;
  overflow-y: auto;
  padding: 24rpx;
}
```

#### 弹窗底部操作栏
```css
.popup-footer {
  padding: 20rpx 30rpx;
  padding-bottom: calc(20rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -4rpx 20rpx rgba(0, 0, 0, 0.08);
  display: flex;
  gap: 12rpx;
}
```

## 🎯 布局规范（通用）

### 页面布局

**适用于所有页面**：

```css
.page {
  background: #f7f8fa;  /* 标准页面背景 */
  min-height: 100vh;
  padding-bottom: 40rpx;  /* 标准底部间距 */
}

.page-with-tabbar {
  padding-bottom: calc(100rpx + env(safe-area-inset-bottom));  /* 有 tabbar 的页面 */
}

.page-with-fixed-action {
  padding-bottom: 160rpx;  /* 有固定底部操作栏的页面 */
}
```

### 固定底部操作栏 ⭐

**适用场景**：管理面板、表单页面、详情页等需要关键操作的页面

**关键操作必须固定在底部，始终可见**：

```xml
<!-- 必须在 scroll-view 外部 -->
<scroll-view class="page-scroll" scroll-y>
  <!-- 页面内容 -->
  <view class="footer-space"></view>
</scroll-view>

<!-- 固定底部操作栏 -->
<view class="fixed-action-bar">
  <view class="action-primary" bindtap="onPrimary">主操作</view>
  <button class="action-secondary" open-type="share">次操作</button>
  <view class="action-tertiary-compact" bindtap="onTertiary">取消</view>
</view>
```

```css
.fixed-action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16rpx 20rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  background: #FFFFFF;
  box-shadow: 0 -4rpx 20rpx rgba(0, 0, 0, 0.08);
  z-index: 1000;
  display: flex;
  gap: 12rpx;
  align-items: center;
}

.footer-space {
  height: 160rpx;  /* 为固定底部栏预留空间 */
}
```

**设计原则**：
1. **始终可见**：无需滚动即可操作
2. **安全区域**：适配 iPhone 底部安全区
3. **阴影分离**：向上投影，与内容分离
4. **按钮布局**：主按钮 + 次按钮 + 三级按钮（可选）

**适用场景**：
- ✅ 管理面板的主要操作（开始活动、结束活动）
- ✅ 表单的提交按钮
- ✅ 详情页的关键操作

**禁止**：
- ❌ 将关键操作放在需要滚动才能看到的位置
- ❌ 底部栏放置次要操作
- ❌ 底部栏超过 3 个按钮

### 网格布局（首页、列表页）

**瀑布流双列布局**（适用于首页活动卡片、协会卡片）：

```css
.waterfall-container {
  padding: 16rpx;
}

/* 使用 Isotope 组件或自定义网格 */
.grid-2col {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12rpx;
}
```

**列表布局**（适用于个人中心、设置页）：

```css
.list-container {
  background: #fff;
  border-radius: 16rpx;
  margin: 16rpx;
  overflow: hidden;
}

.list-item {
  padding: 24rpx 32rpx;
  border-bottom: 1rpx solid #E5E7EB;
}

.list-item:last-child {
  border-bottom: none;
}
```

### 抽屉布局（首页专用）

```css
.drawer-container {
  position: fixed;
  top: 0;
  width: calc(750rpx + 800rpx);
  height: 100vh;
  transition: left 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  will-change: left;
  display: flex;
}

.drawer-sidebar {
  width: 800rpx;
  height: 100vh;
  background: #f5f5f5;
  flex-shrink: 0;
}

.drawer-main {
  width: 750rpx;
  height: 100vh;
  background: #f7f8fa;
  flex-shrink: 0;
}
```

## 🖼️ 图片规范

### 图片容器
- 圆角: `8rpx` / `16rpx`
- 对象适配: `object-fit: cover`
- 背景色: `#f0f2f5` (占位符)

### 图片遮罩
```css
/* 渐变遮罩 */
background: linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.2) 20%, rgba(0, 0, 0, 0.4) 40%, rgba(0, 0, 0, 0.4) 100%);

/* 底部遮罩 */
background: linear-gradient(to bottom, transparent, rgba(0,0,0,0.6));
```

### 毛玻璃效果
```css
backdrop-filter: blur(5rpx);
backdrop-filter: blur(10rpx);
background: rgba(255, 255, 255, 0.15);
```

## 📱 响应式规范

### 安全区域
```css
padding-bottom: calc(20rpx + env(safe-area-inset-bottom));
```

### 视口高度
```css
height: 100vh;
height: calc(100vh - 100rpx); /* 减去头部 */
height: calc(100vh - 300rpx); /* 减去头部和标签栏 */
```

## 🎨 UI 库集成

### Vant Weapp
- 使用 `van-` 前缀组件
- 自定义主题色: `rgb(223, 118, 176)`

### TDesign Miniprogram
- 使用 `t-` 前缀组件
- 覆盖默认样式: `!important`

## 📝 命名规范

### BEM 命名
- Block: `.card`, `.header`, `.drawer`
- Element: `.card-title`, `.header-right`
- Modifier: `.card-active`, `.drawer-touching`

### 状态类
- `.active` - 激活状态
- `.unread` - 未读状态
- `.disabled` - 禁用状态
- `.loading` - 加载状态

### 功能类
- `.clamp-2` - 两行省略
- `.compact-grid` - 紧凑网格
- `.skeleton` - 骨架屏

## 🔧 最佳实践

1. **使用 rpx 单位**：所有尺寸使用 rpx 以适配不同屏幕
2. **避免固定高度**：使用 flex 布局和最小高度
3. **性能优化**：使用 `will-change` 和 `transform` 优化动画
4. **无障碍**：保持足够的对比度和可点击区域
5. **一致性**：遵循设计系统规范，保持视觉一致性

## 🎯 组件使用指南（实际案例）

### 不同页面类型的应用示例

#### 1. 首页（home）- 瀑布流 + 抽屉

**当前布局优势**：
- **瀑布流双列**：充分利用横向空间，图片主导（60%）+ 文字辅助（40%）
- **侧边抽屉**：不占用主屏幕空间，协会总览信息丰富
- **轮播图**：热门内容优先展示

**应用的设计规范**：
- 卡片组件：活动卡片使用标准卡片样式
- 抽屉布局：侧边栏 800rpx，主内容 750rpx
- 交互反馈：卡片点击有 :active 状态

**优化建议**：
- ✅ 确保所有卡片有统一的 :active 反馈
- ✅ 统一卡片圆角为 16rpx
- ✅ 统一阴影为轻柔多层阴影

#### 2. 个人中心（profile）- 列表布局

**当前布局优势**：
- **列表项清晰**：头像 + 信息 + 箭头的标准布局
- **分组明确**：我的活动、我的协会、设置等分组清晰

**应用的设计规范**：
- 列表项组件：使用标准列表项样式
- 交互反馈：列表项点击有 :active 状态
- 头像组件：统一尺寸和边框

**优化建议**：
- ✅ 确保所有列表项有统一的 :active 反馈
- ✅ 统一列表项高度和内边距
- ✅ 统一分隔线颜色和粗细

#### 3. 管理面板（event-manage-panel）- 编辑行 + 固定底部栏

**当前布局优势**：
- **信息密度适中**：标题、简介使用 expandable-container，收起时占 100rpx
- **视觉焦点清晰**：顶部基本信息 → 中部时间地点 → 底部人员动态
- **操作便捷**：关键操作固定在底部，始终可见

**应用的设计规范**：
- 可编辑行组件：使用 edit 图标 + "点击编辑"提示
- 固定底部操作栏：主按钮 + 次按钮 + 三级按钮
- 面板组件：封面、地图等可点击面板有 :active 状态

**优化建议**：
- ✅ 所有编辑行使用统一的反馈效果
- ✅ 固定底部栏必须在 scroll-view 外部
- ✅ 所有面板添加"点我更换"等提示

#### 4. 详情页（event-detail）- 封面 + 内容 + 底部操作

**应用的设计规范**：
- 弹窗组件：全屏弹窗，封面 + 内容 + 底部操作栏
- 按钮组件：报名、分享等操作使用标准按钮
- 状态标签：进行中、已结束等状态使用标准徽章

**优化建议**：
- ✅ 封面遮罩使用标准渐变
- ✅ 底部操作栏固定在底部
- ✅ 所有按钮有统一的 :active 反馈

### 通用优化检查清单

无论优化哪个页面，都应该检查：

1. **交互反馈**：
   - [ ] 所有可点击元素都有 :active 状态
   - [ ] 动画时长统一为 0.3s
   - [ ] 包含背景变化 + 边框高亮 + 缩放

2. **视觉一致性**：
   - [ ] 颜色使用设计系统定义的颜色
   - [ ] 圆角使用标准圆角（12rpx / 16rpx）
   - [ ] 阴影使用轻柔多层阴影

3. **布局合理性**：
   - [ ] 关键操作固定在底部（如需要）
   - [ ] 页面底部留有足够空间
   - [ ] 适配了安全区域

4. **可供性**：
   - [ ] 可编辑元素有明确提示
   - [ ] 图标使用主题色强调
   - [ ] 文案清晰易懂


---

## ✅ 交互设计检查清单

在开发或优化任何页面时，请使用此检查清单确保一致性：

### 1. 反馈一致性检查

- [ ] 所有可点击元素都有 :active 状态
- [ ] 所有动画时长统一为 0.3s
- [ ] :active 状态包含：背景变化 + 边框高亮 + 缩放（0.98-0.99）
- [ ] 原生 button 组件添加了 `::after { border: none; }`
- [ ] 面板组件添加了 :active 状态
- [ ] 编辑行使用 edit 图标（而非 chevron-right）

### 2. 操作可见性检查

- [ ] 关键操作固定在底部，始终可见
- [ ] 固定底部栏适配了安全区域（env(safe-area-inset-bottom)）
- [ ] 固定底部栏 z-index 设置为 1000
- [ ] 底部栏按钮不超过 3 个
- [ ] 主按钮高度 88rpx，次按钮 72-80rpx
- [ ] 页面底部留有 footer-space（160rpx）

### 3. 可供性设计检查

- [ ] 可编辑行添加了"点击编辑"文案提示
- [ ] 可编辑行使用主题色图标
- [ ] 内容预览至少 2 行（clamp-2）
- [ ] 可点击面板添加了"点我更换"等提示
- [ ] 所有交互元素有明确的视觉提示

### 4. 视觉层次检查

- [ ] 主要操作使用主题色填充
- [ ] 次要操作使用边框样式
- [ ] 三级操作使用浅色边框
- [ ] 危险操作使用红色
- [ ] 按钮有清晰的层级区分

### 5. 动画流畅性检查

- [ ] 所有过渡动画使用 0.3s
- [ ] 没有"空白期"（动画衔接流畅）
- [ ] 加载状态有 loading 动画
- [ ] 危险操作有二次确认（可选）

### 6. 移动端适配检查

- [ ] 所有尺寸使用 rpx 单位
- [ ] 触摸目标至少 88rpx × 88rpx
- [ ] 使用 :active 而非 :hover
- [ ] 适配了 iPhone 安全区域
- [ ] 测试了不同屏幕尺寸

---

## 🎯 快速参考

### 常用动画时长
```css
transition: all 0.3s;  /* 所有交互元素统一使用 */
```

### 常用 :active 状态
```css
.clickable:active {
  background: var(--md-sys-color-surface-variant);
  border-color: var(--md-sys-color-primary);
  transform: scale(0.98-0.99);
}
```

### 固定底部栏模板
```xml
<view class="fixed-action-bar">
  <view class="action-primary" bindtap="onPrimary">主操作</view>
  <button class="action-secondary" open-type="share">次操作</button>
  <view class="action-tertiary-compact" bindtap="onTertiary">取消</view>
</view>
```

```css
.fixed-action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16rpx 20rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  background: #FFFFFF;
  box-shadow: 0 -4rpx 20rpx rgba(0, 0, 0, 0.08);
  z-index: 1000;
  display: flex;
  gap: 12rpx;
}
```

### 可编辑行模板
```xml
<expandable-container id="row-field" expanded-width="700" expanded-height="520" bg-color="#f2f3f5">
  <view slot="trigger" class="row row-100 row-editable">
    <view class="row-left">
      <text class="row-label">字段名</text>
      <text class="edit-hint">点击编辑</text>
    </view>
    <view class="row-right">
      <text class="row-value">{{value || '未设置'}}</text>
      <t-icon name="edit" size="20" color="var(--md-sys-color-primary)" />
    </view>
  </view>
  <view slot="content" class="popup-shell">
    <!-- 编辑内容 -->
  </view>
</expandable-container>
```

---

## 📚 版本历史

### v2.1 (2026-02-06)
- ✅ 调整设计系统适用范围，明确适用于所有页面
- ✅ 修改核心设计原则，从"禁止/允许"改为"优化指导原则"
- ✅ 重构组件规范章节，区分通用组件和专用组件
- ✅ 新增不同页面类型的应用示例（home、profile、panel、detail）
- ✅ 新增通用优化检查清单
- ✅ 明确布局结构和功能逻辑可以根据需要修改

### v2.0 (2026-02-06)
- ✅ 新增"交互反馈一致性原则"
- ✅ 新增"固定底部操作栏规范"
- ✅ 新增"可供性设计原则"
- ✅ 统一所有动画时长为 0.3s
- ✅ 新增"交互设计检查清单"
- ✅ 更新按钮组件规范
- ✅ 更新可编辑行组件规范
- ✅ 更新面板组件规范

### v1.0 (2026-02-05)
- 初始版本
- 定义颜色、字体、间距系统
- 定义布局设计哲学
- 定义组件规范

---

**最后更新**：2026-02-06  
**适用范围**：WeTest 小程序所有页面（home、profile、panels、detail、create/edit）  
**维护者**：设计系统团队

**使用建议**：
1. 优化任何页面前，先阅读"核心设计原则"和"优化指导原则"
2. 参考对应页面类型的应用示例
3. 使用"交互设计检查清单"验证优化结果
4. 保持整个小程序的视觉和交互一致性
