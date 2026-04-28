# Implementation Plan: Club/Event Display Permission Refactor

## Overview

本实现计划将协会和活动显示权限重构分解为具体的编码任务。采用"前端为主、后端为辅"的策略，最小化后端改动（约150-200行代码），大部分功能通过前端实现（约500-800行代码）。

## Tasks

- [x] 1. 后端API改动 - 活动管理列表扩展
  - [x] 1.1 修改 `/event/user_manage/list/<show>` API
    - 修正角色判断：使用 `role in ['president', 'vice_president', 'director']`
    - 扩展show参数支持：prego（预计开始）、going（正在进行）、ended（已结束）、cancelled（已取消）
    - 扩展count模式返回4种状态统计（prego_count, going_count, ended_count, cancelled_count）
    - 文件：`app/routes/event.py`
    - _Requirements: 6.10, 6.11, 6.12, 6.13, 6.14, 16.2, 16.3, 16.4, 16.5_

- [x] 2. 后端API改动 - 协会删除级联操作
  - [x] 2.1 修改 `/club/<id>/delete` API
    - 使用数据库事务确保原子性
    - 设置 Club.isDelete=True
    - 设置所有 ClubMember.isDelete=True
    - 取消所有未结束的活动（Event.is_cancelled=True）
    - 拒绝所有待审批的申请（ClubApplication.approved=False）
    - 失败时回滚所有操作
    - 文件：`app/routes/club.py`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 23.1, 23.2, 23.3, 23.4, 23.5_

- [x] 3. 后端API改动 - 活动操作验证
  - [x] 3.1 加入活动验证 (`/event/<id>/join`)
    - 验证活动未取消（is_cancelled=False）
    - 验证活动未结束（actual_endTime=NULL）
    - 验证协会未删除（Club.isDelete=False）
    - 验证用户是协会成员（ClubMember.isDelete=False）
    - 文件：`app/routes/event.py`
    - _Requirements: 21.7, 21.8, 21.9, 21.10, 21.11_

  - [x] 3.2 退出活动验证 (`/event/<id>/quit`)
    - 验证活动未结束（actual_endTime=NULL）
    - 验证用户已加入该活动
    - 文件：`app/routes/event.py`
    - _Requirements: 21.12, 21.13_

  - [x] 3.3 开始活动验证 (`/event/<id>/begin`)
    - 验证活动未取消（is_cancelled=False）
    - 验证活动未已开始（actual_startTime=NULL）
    - 文件：`app/routes/event.py`
    - _Requirements: 21.14_

  - [x] 3.4 结束活动验证 (`/event/<id>/end`)
    - 验证活动已开始（actual_startTime!=NULL）
    - 验证活动未已结束（actual_endTime=NULL）
    - 验证活动未取消（is_cancelled=False）
    - 文件：`app/routes/event.py`
    - _Requirements: 21.15_

  - [x] 3.5 取消活动验证 (`/event/<id>/delete`)
    - 验证活动未已结束（actual_endTime=NULL）
    - 验证活动未已取消（is_cancelled=False）
    - 文件：`app/routes/event.py`
    - _Requirements: 21.16_

- [ ] 4. Checkpoint - 后端API测试
  - 测试所有后端API改动
  - 验证事务回滚机制
  - 验证错误信息返回
  - 确保所有测试通过，如有问题请询问用户

- [x] 5. 前端 - 首页显示过滤
  - [x] 5.1 实现首页协会列表过滤
    - 在 `pages/home/index.js` 中过滤 isDelete=False 的协会
    - 文件：`pages/home/index.js`
    - _Requirements: 1.1, 1.3_

  - [x] 5.2 实现首页活动列表过滤
    - 在 `pages/home/index.js` 中过滤   的活动
    - 文件：`pages/home/index.js`
    - _Requirements: 1.2, 1.4_

- [x] 6. 前端 - 个人中心显示逻辑
  - [x] 6.1 实现我的协会灰色蒙层
    - 在 `packageProfile/components/clubs-panel/` 中添加灰色蒙层效果
    - 为 Club.isDelete=True 的协会显示蒙层
    - 文件：`packageProfile/components/clubs-panel/index.wxml`, `index.wxss`
    - _Requirements: 2.3, 12.2, 12.5, 12.6_

  - [x] 6.2 实现我的活动灰色蒙层
    - 在 `packageProfile/components/events-panel/` 中添加灰色蒙层效果
    - 为 is_cancelled=True 或 club_deleted=True 的活动显示蒙层
    - 文件：`packageProfile/components/events-panel/index.wxml`, `index.wxss`
    - _Requirements: 3.5, 3.6, 12.1, 12.3, 12.4_

- [x] 7. 前端 - 活动状态标签显示
  - [x] 7.1 实现活动列表状态标签
    - 在活动列表组件中添加状态标签（预计开始、进行中、已结束、已取消、协会已删除）
    - 使用不同颜色区分状态（蓝色、绿色、灰色、红色）
    - 文件：`packageProfile/components/events-panel/index.wxml`, `index.wxss`
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7_

- [x] 8. 前端 - 协会会长管理功能重构
  - [x] 8.1 实现"我管理的活动"区块UI
    - 在个人中心页面添加"我管理的活动"区块
    - 添加4个状态按钮（预计开始、正在进行、已结束、已取消）
    - 添加"全部"按钮和"创建活动"按钮
    - 文件：`packageProfile/index.wxml`, `index.wxss`
    - _Requirements: 6.1, 6.2, 7.1, 9.1_

  - [x] 8.2 实现活动统计数据获取
    - 调用 `/event/user_manage/list/all?mode=count` 获取统计
    - 根据统计数据判断 hasEverManaged 和 currentlyManaging
    - 在"预计开始"和"正在进行"按钮上显示角标
    - 文件：`packageProfile/index.js`
    - _Requirements: 6.7, 6.8, 6.9, 6.14, 16.1, 16.6, 16.7_

  - [x] 8.3 实现状态按钮点击事件
    - 实现 showPregoEvents、showGoingEvents、showEndedEvents、showCancelledEvents 方法
    - 使用 expandable-container 显示 events-panel
    - 传递对应的 requestUrl 参数
    - 文件：`packageProfile/index.js`
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 7.2, 7.3, 7.4, 7.5_

  - [x] 8.4 移除旧的协会活动管理功能
    - 删除所有协会的活动追踪区域
    - 删除所有协会的活动管理按钮
    - 删除所有协会的创建活动按钮（从协会区域）
    - 文件：`packageProfile/index.wxml`
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 9. 前端 - Event Create Panel 弹窗交互优化（Swiper设计）
  - [x] 9.1 实现单个t-popup弹窗结构
    - 创建单个t-popup弹窗（90%宽度，70vh高度）
    - 添加弹窗头部（动态标题、关闭按钮）
    - 文件：`packageEvent/components/event-create-panel/index.wxml`, `index.wxss`
    - _Requirements: 13.1, 13.12_

  - [ ] 9.2 实现内部swiper组件
    - 配置swiper：display-multiple-items="1.25", previous-margin="10rpx", next-margin="10rpx"
    - 创建两个swiper-item：协会选择（item 0）和模板选择（item 1）
    - 每个item宽度80%，间隔10rpx
    - 文件：`packageEvent/components/event-create-panel/index.wxml`, `index.wxss`
    - _Requirements: 13.2, 13.3_

  - [x] 9.3 实现swiper item缩放动画
    - 添加CSS class `.swiper-item.active` 实现1.2倍放大
    - 使用 `transform: scale(1.2)` + `transition: transform 0.3s ease`
    - 根据 swiperCurrent 动态添加 active class
    - 文件：`packageEvent/components/event-create-panel/index.wxss`
    - _Requirements: 13.4, 13.6, 14.7, 14.8_

  - [x] 9.4 实现协会选择item
    - 以卡片形式展示协会列表（封面图96rpx + 协会名称）
    - 实现选中状态高亮（蓝色边框 + 浅蓝色背景 + 勾选图标）
    - 实现空状态提示"暂无可选协会"
    - 文件：`packageEvent/components/event-create-panel/index.wxml`, `index.wxss`
    - _Requirements: 14.1, 14.3, 14.5_

  - [x] 9.5 实现模板选择item
    - 以卡片形式展示活动模板列表（封面图128rpx + 活动名称）
    - 实现选中状态高亮（蓝色边框 + 浅蓝色背景 + 勾选图标）
    - 实现空状态提示"暂无历史活动"
    - 添加底部按钮："不使用模板"和"确认"
    - 文件：`packageEvent/components/event-create-panel/index.wxml`, `index.wxss`
    - _Requirements: 14.2, 14.4, 14.6, 14.9_

  - [x] 9.6 实现swiper数据结构和状态管理
    - 添加 showSelectorPopup、swiperCurrent 状态
    - 添加 clubList、historyEvents、formData 数据结构
    - 文件：`packageEvent/components/event-create-panel/index.js`
    - _Requirements: 13.2, 13.3, 13.4_

  - [x] 9.7 实现协会选择逻辑
    - 实现 selectClub 方法：更新选中状态、加载历史活动、触发swiper滑动
    - 调用 `this.setData({ swiperCurrent: 1 })` 触发自动滑动
    - 文件：`packageEvent/components/event-create-panel/index.js`
    - _Requirements: 13.5, 13.7, 13.8_

  - [x] 9.8 实现swiper滑动事件处理
    - 实现 onSwiperChange 方法：更新 swiperCurrent 状态
    - 支持手动左右滑动
    - 文件：`packageEvent/components/event-create-panel/index.js`
    - _Requirements: 13.6_

  - [x] 9.9 实现单协会优化
    - 检测到只有1个协会时，初始化 swiperCurrent=1
    - 直接显示模板选择item，跳过协会选择
    - 文件：`packageEvent/components/event-create-panel/index.js`
    - _Requirements: 13.11_

  - [x] 9.10 实现模板选择和确认逻辑
    - 实现 selectTemplate、confirmTemplate、skipTemplate 方法
    - 将选择同步到 formData 对象
    - 关闭弹窗并同步数据到表单字段
    - 文件：`packageEvent/components/event-create-panel/index.js`
    - _Requirements: 13.9, 13.10_

  - [x] 9.11 实现协会列表过滤
    - 在 fetchUserClubList 中过滤 isDelete=False 的协会
    - 文件：`packageEvent/components/event-create-panel/index.js`
    - _Requirements: 4.1, 4.2, 4.3, 23.1, 23.2, 23.3_

- [ ] 10. Checkpoint - 前端弹窗交互测试
  - 测试单协会和多协会场景
  - 测试swiper滑动和缩放动画
  - 测试协会切换和模板刷新
  - 测试数据同步到表单
  - 确保所有测试通过，如有问题请询问用户

- [x] 11. 前端 - 活动详情页按钮状态控制
  - [x] 11.1 实现按钮状态计算函数
    - 实现 computeButtonStates 方法
    - 根据活动状态（is_cancelled, is_ended, club_deleted）计算按钮禁用状态
    - 根据用户状态（cur_user_is_joined, cur_user_can_join）计算按钮显示
    - 文件：`packageEvent/event-detail/index.js`
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8_

  - [x] 11.2 实现前端验证逻辑
    - 在 joinEvent、quitEvent、clockinEvent 方法中添加前端验证
    - 验证失败时显示友好提示，不发送请求
    - 文件：`packageEvent/event-detail/index.js`
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6_

  - [x] 11.3 实现按钮禁用UI
    - 根据 buttonStates 动态设置按钮 disabled 属性
    - 添加禁用状态样式
    - 文件：`packageEvent/event-detail/index.wxml`, `index.wxss`
    - _Requirements: 20.7, 20.8_

  - [x] 11.4 实现操作反馈提示
    - 加入活动：显示"处理中..."、"参加成功"或错误信息
    - 退出活动：显示确认对话框、"处理中..."、"退出成功"或错误信息
    - 网络错误：显示"网络错误"提示
    - 文件：`packageEvent/event-detail/index.js`
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 19.8_

- [x] 12. 前端 - 活动创建表单验证
  - [x] 12.1 实现表单验证函数
    - 验证协会已选择（clubId非空）
    - 验证活动名称、开始时间、描述、封面、地点已填写
    - 验证时间逻辑：pre_startTime < pre_endTime, pre_startTime >= 当前时间
    - 验证失败时显示具体错误提示
    - 文件：`packageEvent/components/event-create-panel/index.js`
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8, 18.9, 18.10_

- [x] 13. 前端 - 协会选择器过滤
  - [x] 13.1 实现协会选择器过滤逻辑
    - 在获取协会列表后过滤 isDelete=False 的协会
    - 只显示用户有管理权限的协会
    - 显示"暂无可选协会"提示
    - 文件：`packageEvent/components/event-create-panel/index.js`
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5_

- [ ] 14. Checkpoint - 前端功能集成测试
  - 测试首页过滤逻辑
  - 测试个人中心显示逻辑
  - 测试会长管理功能
  - 测试活动详情页按钮状态
  - 测试表单验证
  - 确保所有测试通过，如有问题请询问用户

- [ ] 15. 最终测试和验证
  - [ ] 15.1 端到端测试
    - 测试完整的用户流程（创建活动、加入活动、管理活动、删除协会）
    - 测试不同角色的权限控制（普通用户、会长、超级管理员）
    - 测试边界情况（已删除协会、已取消活动、并发操作）

  - [ ] 15.2 性能测试
    - 测试大量数据下的列表渲染性能
    - 测试swiper滑动流畅度
    - 测试API响应时间

  - [ ] 15.3 兼容性测试
    - 测试不同微信版本的兼容性
    - 测试不同设备尺寸的适配

## Notes

- 后端改动集中在3个核心API，总代码量约150-200行
- 前端改动涉及多个组件，总代码量约500-800行
- 优先完成后端API改动，确保数据安全和一致性
- 前端功能可以并行开发，最后集成测试
- Checkpoint任务用于阶段性验证，确保质量
- 所有任务都引用了对应的需求编号，便于追溯

## Estimated Timeline

- 后端开发：1-2天
- 前端开发：3-4天
- 测试和调试：2-3天
- 总计：6-9天
