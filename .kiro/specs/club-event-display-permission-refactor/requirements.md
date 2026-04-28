# Requirements Document

## Introduction

本规范定义了小程序前后端协会和活动显示逻辑的全面改造，包括不同显示区域的权限控制、不同角色的操作权限、以及协会会长管理功能的重构。系统需要处理已删除协会、已取消活动等多种边界状态，确保各个角色的用户在不同场景下都能看到正确的内容。

## Glossary

- **System**: 小程序前后端系统
- **Club**: 协会实体，包含 isDelete 状态字段
- **Event**: 活动实体，包含 is_cancelled 状态字段
- **ClubMember**: 协会成员关系，包含 isDelete 状态字段和 role 字段
- **ClubApplication**: 协会申请记录，包含 approved 状态字段
- **EventJoin**: 活动参与记录
- **User**: 用户实体
- **President**: 协会会长角色
- **SuperUser**: 超级管理员角色
- **Home_Area**: 首页显示区域
- **Profile_Area**: 个人中心显示区域
- **Management_Panel**: 管理面板
- **Detail_Panel**: 详情面板
- **Event_Create_Panel**: 活动创建面板
- **Expandable_Container**: 可展开容器组件

## Requirements

### Requirement 1: 首页显示过滤

**User Story:** 作为普通用户，我想在首页只看到有效的协会和活动，这样我可以专注于当前可参与的内容。

#### Acceptance Criteria

1. WHEN 用户访问首页 THEN THE System SHALL 只显示 isDelete=False 的协会
2. WHEN 用户访问首页 THEN THE System SHALL 只显示 is_cancelled=False 的活动
3. WHEN 协会被删除后 THEN THE System SHALL 立即从首页列表中移除该协会
4. WHEN 活动被取消后 THEN THE System SHALL 立即从首页列表中移除该活动

### Requirement 2: 个人中心我的协会显示

**User Story:** 作为用户，我想在个人中心看到我所有加入过的协会（包括已删除的），这样我可以查看完整的协会参与历史。

#### Acceptance Criteria

1. WHEN 用户访问个人中心我的协会 THEN THE System SHALL 显示所有 ClubMember.isDelete=False 的协会记录
2. WHEN 显示协会列表 THEN THE System SHALL 包括 Club.isDelete=True 的协会
3. WHEN 协会被删除 THEN THE System SHALL 在协会卡片上显示灰色蒙层
4. WHEN 用户点击已删除协会 THEN THE System SHALL 显示协会详情并标注已删除状态

### Requirement 3: 个人中心我的活动显示

**User Story:** 作为用户，我想看到我所有参与过的活动（包括已取消、已删除协会的活动、被退出协会的活动），这样我可以查看完整的活动参与历史。

#### Acceptance Criteria

1. WHEN 用户访问个人中心我的活动 THEN THE System SHALL 显示所有 EventJoin 记录对应的活动
2. WHEN 显示活动列表 THEN THE System SHALL 包括 is_cancelled=True 的活动
3. WHEN 显示活动列表 THEN THE System SHALL 包括所属协会 isDelete=True 的活动
4. WHEN 显示活动列表 THEN THE System SHALL 包括用户已被退出（ClubMember.isDelete=True）的协会发起的活动
5. WHEN 活动被取消 THEN THE System SHALL 在活动卡片上显示灰色蒙层
6. WHEN 活动所属协会被删除 THEN THE System SHALL 在活动卡片上显示灰色蒙层

### Requirement 4: 活动创建协会选择过滤

**User Story:** 作为用户，我想在创建活动时只看到有效的协会，这样我不会为已删除的协会创建活动。

#### Acceptance Criteria

1. WHEN 用户打开活动创建面板 THEN THE System SHALL 只显示 isDelete=False 的协会列表
2. WHEN 用户选择协会 THEN THE System SHALL 只允许选择未删除的协会
3. WHEN 协会在选择过程中被删除 THEN THE System SHALL 从选择列表中移除该协会

### Requirement 5: 超级管理员协会管理显示

**User Story:** 作为超级管理员，我想看到所有协会（包括已删除的），这样我可以进行全面的协会管理。

#### Acceptance Criteria

1. WHEN 超级管理员访问协会管理 THEN THE System SHALL 显示所有协会记录
2. WHEN 显示协会列表 THEN THE System SHALL 包括 isDelete=True 的协会
3. WHEN 协会被删除 THEN THE System SHALL 在协会卡片上显示灰色蒙层
4. WHEN 超级管理员点击已删除协会 THEN THE System SHALL 显示完整的协会信息

### Requirement 6: 协会会长管理功能重构 - 我管理的活动块

**User Story:** 作为协会会长，我想看到我管理的所有活动的分类统计，这样我可以快速了解活动状态分布。

#### Acceptance Criteria

1. WHEN 会长访问管理面板 THEN THE System SHALL 显示"我管理的活动"区块
2. WHEN 显示活动区块 THEN THE System SHALL 包含4个状态按钮：预计开始、正在进行、已结束、已取消
3. WHEN 点击"预计开始"按钮 THEN THE System SHALL 弹窗显示 actual_startTime=NULL 且 pre_startTime > 当前时间 的活动
4. WHEN 点击"正在进行"按钮 THEN THE System SHALL 弹窗显示 actual_startTime != NULL 且 actual_endTime=NULL 的活动
5. WHEN 点击"已结束"按钮 THEN THE System SHALL 弹窗显示 actual_endTime != NULL 的活动
6. WHEN 点击"已取消"按钮 THEN THE System SHALL 弹窗显示 is_cancelled=True 的活动
7. WHEN 会长曾经管理过协会并发起过活动 THEN THE System SHALL 始终显示"已结束"和"已取消"按钮
8. WHEN 会长不再管理任何协会 THEN THE System SHALL 隐藏"预计开始"和"正在进行"按钮
9. WHEN 显示"预计开始"和"正在进行"按钮 THEN THE System SHALL 在按钮右上角显示对应状态活动的数量角标
10. WHEN 后端API接收 show='prego' THEN THE System SHALL 返回预计开始的活动（actual_startTime=NULL 且 pre_startTime > 当前时间）
11. WHEN 后端API接收 show='going' THEN THE System SHALL 返回正在进行的活动（actual_startTime != NULL 且 actual_endTime=NULL）
12. WHEN 后端API接收 show='ended' THEN THE System SHALL 返回已结束的活动（actual_endTime != NULL）
13. WHEN 后端API接收 show='cancelled' THEN THE System SHALL 返回已取消的活动（is_cancelled=True）
14. WHEN 后端API接收 mode='count' THEN THE System SHALL 返回4种状态的活动数量统计

### Requirement 7: 协会会长管理功能重构 - 全部活动按钮

**User Story:** 作为协会会长，我想快速查看我管理的所有活动，这样我可以全面了解活动情况。

#### Acceptance Criteria

1. WHEN 显示"我管理的活动"区块标题行 THEN THE System SHALL 在右侧显示"全部"按钮
2. WHEN 点击"全部"按钮 THEN THE System SHALL 弹窗显示 events-panel
3. WHEN 显示全部活动 THEN THE System SHALL 包含所有4种状态的活动
4. WHEN 显示全部活动 THEN THE System SHALL 按 pre_startTime 降序排列
5. WHEN 显示活动列表项 THEN THE System SHALL 在每个活动右侧显示对应的状态标签

### Requirement 8: 协会会长管理功能重构 - 移除旧功能

**User Story:** 作为系统设计者，我想移除冗余的协会活动管理功能，这样可以简化界面并避免功能重复。

#### Acceptance Criteria

1. WHEN 重构管理面板 THEN THE System SHALL 删除所有协会的活动追踪区域
2. WHEN 重构管理面板 THEN THE System SHALL 删除所有协会的活动管理按钮
3. WHEN 重构管理面板 THEN THE System SHALL 删除所有协会的创建活动按钮（从协会区域）

### Requirement 9: 协会会长管理功能重构 - 创建活动按钮位置调整

**User Story:** 作为协会会长，我想在我管理的活动区块中创建新活动，这样操作更符合逻辑。

#### Acceptance Criteria

1. WHEN 显示"我管理的活动"区块 THEN THE System SHALL 在4个状态按钮后显示"创建活动"按钮
2. WHEN 会长不再管理任何协会 THEN THE System SHALL 隐藏"创建活动"按钮
3. WHEN 点击"创建活动"按钮 THEN THE System SHALL 弹窗显示 event-create-panel
4. WHEN 会长管理多个协会 THEN THE System SHALL 在创建面板中显示所有管理的协会供选择

### Requirement 10: 协会和活动操作权限控制

**User Story:** 作为用户，我想根据我的角色和状态执行相应的操作，这样系统可以保证操作的合法性。

#### Acceptance Criteria

1. WHEN 用户未加入协会 THEN THE System SHALL 在协会详情面板显示"加入协会"按钮
2. WHEN 用户已加入协会 THEN THE System SHALL 在协会详情面板显示"退出协会"按钮
3. WHEN 用户未加入活动 THEN THE System SHALL 在活动详情面板显示"加入活动"按钮
4. WHEN 用户已加入活动 THEN THE System SHALL 在活动详情面板显示"退出活动"和"活动打卡"按钮
5. WHEN 用户是协会管理人员 THEN THE System SHALL 在活动管理面板显示"开始"、"结束"、"取消"按钮
6. WHEN 用户是超级管理员 THEN THE System SHALL 在协会详情面板显示"删除协会"按钮
7. WHEN 用户既是超级管理员又是协会管理员 THEN THE System SHALL 显示协会管理面板并在其中显示"删除协会"按钮

### Requirement 11: 协会删除级联操作

**User Story:** 作为超级管理员，我想删除协会时自动处理相关数据，这样可以保证数据一致性。

#### Acceptance Criteria

1. WHEN 超级管理员删除协会 THEN THE System SHALL 设置 Club.isDelete=True
2. WHEN 删除协会 THEN THE System SHALL 设置所有 ClubMember.isDelete=True
3. WHEN 删除协会 THEN THE System SHALL 设置所有关联活动 Event.is_cancelled=True
4. WHEN 删除协会 THEN THE System SHALL 拒绝所有待审批的 ClubApplication（设置 approved=False）
5. WHEN 删除操作完成 THEN THE System SHALL 返回成功响应并刷新相关界面

### Requirement 12: 已取消活动和已删除协会的视觉标识

**User Story:** 作为用户，我想清楚地识别已取消的活动和已删除的协会，这样我可以快速了解其状态。

#### Acceptance Criteria

1. WHEN 显示已取消活动 THEN THE System SHALL 在活动卡片上覆盖灰色半透明蒙层
2. WHEN 显示已删除协会 THEN THE System SHALL 在协会卡片上覆盖灰色半透明蒙层
3. WHEN 在管理面板显示已取消活动 THEN THE System SHALL 应用灰色蒙层
4. WHEN 在详情面板显示已取消活动 THEN THE System SHALL 应用灰色蒙层
5. WHEN 在管理面板显示已删除协会 THEN THE System SHALL 应用灰色蒙层
6. WHEN 在详情面板显示已删除协会 THEN THE System SHALL 应用灰色蒙层

### Requirement 13: Event Create Panel 弹窗交互优化

**User Story:** 作为用户，我想在创建活动时有流畅的弹窗交互体验，这样我可以高效地完成协会和模板选择。

#### Acceptance Criteria

1. WHEN 用户打开活动创建面板 THEN THE System SHALL 显示一个居中的 t-popup 弹窗（带遮罩层）
2. WHEN 弹窗显示 THEN THE System SHALL 在弹窗内显示一个水平 swiper，包含两个 item（协会选择和模板选择）
3. WHEN swiper 显示 THEN THE System SHALL 设置每个 item 宽度为 80%屏幕宽度，间隔为 10rpx
4. WHEN swiper 初始化 THEN THE System SHALL 显示协会选择 item 在屏幕中间，并放大 1.2 倍
5. WHEN 用户点击某个协会 THEN THE System SHALL swiper 自动向左滑动，协会 item 缩小，模板 item 放大 1.2 倍并滑到屏幕中间
6. WHEN 用户手动左右滑动 swiper THEN THE System SHALL 当前选中的 item 放大 1.2 倍，其他 item 保持原始大小
7. WHEN 用户在协会 item 中切换协会 THEN THE System SHALL swiper 自动向左滑动到模板 item
8. WHEN 用户切换协会 THEN THE System SHALL 刷新模板 item 中显示的活动列表
9. WHEN 用户选择模板并确认 THEN THE System SHALL 关闭弹窗，选择的协会和模板同步显示在 event-create-panel 的表单框中
10. WHEN 用户点击"不使用模板"按钮 THEN THE System SHALL 关闭弹窗，只同步协会选择到表单框中
11. WHEN 用户仅管理1个协会 THEN THE System SHALL swiper 初始显示模板选择 item（跳过协会选择）
12. WHEN 弹窗显示时 THEN THE System SHALL 在底层显示半透明遮罩层

### Requirement 14: 协会和模板选择器UI设计

**User Story:** 作为用户，我想看到清晰的协会和模板选择界面，这样我可以快速做出选择。

#### Acceptance Criteria

1. WHEN 显示协会选择 item THEN THE System SHALL 以卡片形式展示每个协会（封面图 + 协会名称）
2. WHEN 显示模板选择 item THEN THE System SHALL 以卡片形式展示每个活动模板（封面图 + 活动名称）
3. WHEN 用户选择协会 THEN THE System SHALL 高亮显示选中的协会卡片
4. WHEN 用户选择模板 THEN THE System SHALL 高亮显示选中的模板卡片
5. WHEN 协会列表为空 THEN THE System SHALL 显示"暂无可选协会"提示
6. WHEN 模板列表为空 THEN THE System SHALL 显示"暂无历史活动"提示
7. WHEN swiper item 被选中 THEN THE System SHALL 该 item 放大 1.2 倍，使用平滑的缩放动画（300ms）
8. WHEN swiper 滑动 THEN THE System SHALL 使用平滑的滑动动画（300ms）
9. WHEN 模板选择 item 显示 THEN THE System SHALL 在底部显示"不使用模板"和"确认"按钮

### Requirement 15: 后端 API 过滤逻辑调整

**User Story:** 作为后端开发者，我想调整 API 的过滤逻辑，这样可以支持不同场景的数据查询需求。

#### Acceptance Criteria

1. WHEN 首页请求协会列表 THEN THE System SHALL 过滤 isDelete=True 的协会
2. WHEN 首页请求活动列表 THEN THE System SHALL 过滤 is_cancelled=True 的活动
3. WHEN 个人中心请求我的协会 THEN THE System SHALL 不过滤 Club.isDelete 状态
4. WHEN 个人中心请求我的活动 THEN THE System SHALL 不过滤 Event.is_cancelled 状态
5. WHEN 超级管理员请求协会列表 THEN THE System SHALL 不过滤 Club.isDelete 状态
6. WHEN 会长请求管理的活动 THEN THE System SHALL 根据状态参数返回对应活动
7. WHEN 活动创建请求协会列表 THEN THE System SHALL 只返回 isDelete=False 的协会

### Requirement 16: 活动状态统计接口

**User Story:** 作为协会会长，我想快速获取各状态活动的数量统计，这样可以在按钮上显示角标。

#### Acceptance Criteria

1. WHEN 会长访问管理面板 THEN THE System SHALL 扩展现有 /event/user_manage/list/all?mode=count 接口
2. WHEN 请求统计数据 THEN THE System SHALL 返回预计开始活动数量（actual_startTime=NULL 且 pre_startTime > 当前时间）
3. WHEN 请求统计数据 THEN THE System SHALL 返回正在进行活动数量（actual_startTime != NULL 且 actual_endTime=NULL）
4. WHEN 请求统计数据 THEN THE System SHALL 返回已结束活动数量（actual_endTime != NULL）
5. WHEN 请求统计数据 THEN THE System SHALL 返回已取消活动数量（is_cancelled=True）
6. WHEN 统计数据变化 THEN THE System SHALL 通过前端重新请求接口更新角标显示
7. WHEN 返回统计数据 THEN THE System SHALL 包含所有会长曾经管理过的协会的活动（即使已被移出协会）

### Requirement 17: 数据一致性和边界处理

**User Story:** 作为系统管理员，我想确保系统在各种边界情况下都能正确处理数据，这样可以保证系统的稳定性。

#### Acceptance Criteria

1. WHEN 用户被移除协会 THEN THE System SHALL 保留该用户的 EventJoin 记录
2. WHEN 协会被删除 THEN THE System SHALL 保留所有历史数据记录
3. WHEN 活动被取消 THEN THE System SHALL 保留所有 EventJoin 记录
4. WHEN 用户查询不存在的协会 THEN THE System SHALL 返回友好的错误提示
5. WHEN 用户查询不存在的活动 THEN THE System SHALL 返回友好的错误提示
6. WHEN 并发操作导致状态冲突 THEN THE System SHALL 使用数据库事务保证一致性

### Requirement 18: 前端活动创建表单验证增强

**User Story:** 作为用户，我想在创建活动时得到完整的表单验证，这样可以避免提交无效数据。

#### Acceptance Criteria

1. WHEN 用户创建活动 THEN THE System SHALL 验证协会已选择（clubId 非空）
2. WHEN 用户创建活动 THEN THE System SHALL 验证活动名称已填写且非空白
3. WHEN 用户创建活动 THEN THE System SHALL 验证开始时间已选择
4. WHEN 用户创建活动 THEN THE System SHALL 验证活动描述已填写且非空白
5. WHEN 用户创建活动 THEN THE System SHALL 验证封面图片已上传
6. WHEN 用户创建活动 THEN THE System SHALL 验证地点已选择
7. WHEN 用户创建活动且启用日程 THEN THE System SHALL 验证日程配置已完成
8. WHEN 表单验证失败 THEN THE System SHALL 显示具体的错误提示信息
9. WHEN 用户创建活动 THEN THE System SHALL 在前端验证 pre_startTime < pre_endTime
10. WHEN 用户创建活动 THEN THE System SHALL 在前端验证 pre_startTime >= 当前时间

### Requirement 19: 前端活动加入/退出操作验证

**User Story:** 作为用户，我想在加入或退出活动时得到明确的状态反馈，这样我可以了解操作是否成功。

#### Acceptance Criteria

1. WHEN 用户点击加入活动 THEN THE System SHALL 显示加载提示"处理中..."
2. WHEN 加入活动成功 THEN THE System SHALL 显示"参加成功"提示并刷新页面数据
3. WHEN 加入活动失败 THEN THE System SHALL 显示后端返回的错误信息
4. WHEN 用户点击退出活动 THEN THE System SHALL 显示确认对话框"确定要退出这个活动吗？"
5. WHEN 用户确认退出 THEN THE System SHALL 显示加载提示"处理中..."
6. WHEN 退出活动成功 THEN THE System SHALL 显示"退出成功"提示并刷新页面数据
7. WHEN 退出活动失败 THEN THE System SHALL 显示后端返回的错误信息
8. WHEN 网络请求失败 THEN THE System SHALL 显示"网络错误"提示

### Requirement 20: 前端活动状态显示逻辑

**User Story:** 作为用户，我想根据活动和协会的状态看到不同的操作按钮，这样我可以执行合适的操作。

#### Acceptance Criteria

1. WHEN 显示活动详情 THEN THE System SHALL 根据 cur_user_is_joined 显示"加入活动"或"退出活动"按钮
2. WHEN 显示活动详情 THEN THE System SHALL 根据 cur_user_managed 显示管理相关按钮
3. WHEN 显示活动详情 THEN THE System SHALL 根据 cur_user_can_join 判断是否允许加入
4. WHEN 显示活动详情 THEN THE System SHALL 根据 is_cancelled 显示活动已取消状态
5. WHEN 显示活动详情 THEN THE System SHALL 根据 is_ended 显示活动已结束状态
6. WHEN 显示活动详情 THEN THE System SHALL 根据 club_deleted 显示协会已删除状态
7. WHEN 活动已取消或已结束 THEN THE System SHALL 禁用加入活动按钮
8. WHEN 协会已删除 THEN THE System SHALL 禁用加入活动按钮

### Requirement 21: 活动操作边界条件验证（前后端协同）

**User Story:** 作为系统，我想在前后端都进行必要的验证，这样既能提供良好的用户体验，又能保证数据安全。

#### Acceptance Criteria - 前端验证（用户体验优化）

1. WHEN 用户点击加入活动按钮 THEN THE System SHALL 在前端检查活动是否已取消（is_cancelled=True）并禁用按钮
2. WHEN 用户点击加入活动按钮 THEN THE System SHALL 在前端检查活动是否已结束（is_ended=True）并禁用按钮
3. WHEN 用户点击加入活动按钮 THEN THE System SHALL 在前端检查协会是否已删除（club_deleted=True）并禁用按钮
4. WHEN 用户点击加入活动按钮 THEN THE System SHALL 在前端检查用户是否已加入（cur_user_is_joined=True）并显示"退出活动"按钮
5. WHEN 用户点击加入活动按钮 THEN THE System SHALL 在前端检查用户是否为协会成员（cur_user_can_join=False）并禁用按钮
6. WHEN 前端验证失败 THEN THE System SHALL 显示友好的提示信息而不发送请求

#### Acceptance Criteria - 后端验证（数据安全保证）

7. WHEN 用户加入活动请求到达后端 THEN THE System SHALL 验证用户是协会成员（ClubMember.isDelete=False）
8. WHEN 用户加入活动请求到达后端 THEN THE System SHALL 验证活动未取消（is_cancelled=False）
9. WHEN 用户加入活动请求到达后端 THEN THE System SHALL 验证活动未结束（actual_endTime=NULL）
10. WHEN 用户加入活动请求到达后端 THEN THE System SHALL 验证协会未删除（Club.isDelete=False）
11. WHEN 用户加入活动请求到达后端 THEN THE System SHALL 验证用户未已加入（使用数据库唯一约束）
12. WHEN 用户退出活动请求到达后端 THEN THE System SHALL 验证用户已加入该活动
13. WHEN 用户退出活动请求到达后端 THEN THE System SHALL 验证活动未结束（actual_endTime=NULL）
14. WHEN 管理员开始活动请求到达后端 THEN THE System SHALL 验证活动未取消且未开始
15. WHEN 管理员结束活动请求到达后端 THEN THE System SHALL 验证活动已开始且未结束
16. WHEN 管理员取消活动请求到达后端 THEN THE System SHALL 验证活动未结束且未已取消
17. WHEN 后端验证失败 THEN THE System SHALL 返回明确的错误信息（Flag='4001'，message说明原因）

### Requirement 22: 前端活动列表状态标识显示

**User Story:** 作为用户，我想在活动列表中清楚地看到每个活动的状态，这样我可以快速了解活动情况。

#### Acceptance Criteria

1. WHEN 显示活动列表 THEN THE System SHALL 在已取消活动卡片上显示"已取消"标签
2. WHEN 显示活动列表 THEN THE System SHALL 在已结束活动卡片上显示"已结束"标签
3. WHEN 显示活动列表 THEN THE System SHALL 在正在进行活动卡片上显示"进行中"标签
4. WHEN 显示活动列表 THEN THE System SHALL 在预计开始活动卡片上显示开始时间
5. WHEN 显示活动列表 THEN THE System SHALL 在已删除协会的活动卡片上显示"协会已删除"标签
6. WHEN 显示我管理的活动列表 THEN THE System SHALL 在每个活动右侧显示对应的状态标签
7. WHEN 活动状态改变 THEN THE System SHALL 实时更新列表中的状态标签

### Requirement 23: 前端协会选择器过滤逻辑

**User Story:** 作为用户，我想在创建活动时只看到有效的协会，这样我不会选择无效的协会。

#### Acceptance Criteria

1. WHEN 打开协会选择器 THEN THE System SHALL 只显示 isDelete=False 的协会
2. WHEN 打开协会选择器 THEN THE System SHALL 只显示用户有管理权限的协会
3. WHEN 协会列表为空 THEN THE System SHALL 显示"暂无可选协会"提示
4. WHEN 用户选择协会 THEN THE System SHALL 加载该协会的成员列表用于邀请
5. WHEN 协会被删除 THEN THE System SHALL 从选择器中移除该协会


### Requirement 18: 活动创建边界条件控制

**User Story:** 作为协会管理员，我想在创建活动时受到合理的约束，这样可以避免创建无效或冲突的活动。

#### Acceptance Criteria

1. WHEN 用户创建活动 THEN THE System SHALL 验证用户是当前协会的管理员（president、vice_president、director）
2. WHEN 用户创建活动 THEN THE System SHALL 验证所选协会 isDelete=False
3. WHEN 用户创建活动 THEN THE System SHALL 验证 pre_startTime < pre_endTime
4. WHEN 用户创建活动 THEN THE System SHALL 验证 pre_startTime >= 当前时间
5. WHEN 用户创建活动 THEN THE System SHALL 要求必填字段：title、clubID、pre_startTime、pre_endTime
6. WHEN 用户创建活动 THEN THE System SHALL 限制 title 长度不超过200字符
7. WHEN 创建活动失败 THEN THE System SHALL 返回明确的错误信息说明失败原因

### Requirement 19: 活动加入边界条件控制

**User Story:** 作为用户，我想在加入活动时受到合理的约束，这样可以避免加入不合适的活动。

#### Acceptance Criteria

1. WHEN 用户加入活动 THEN THE System SHALL 验证用户是该活动所属协会的成员（ClubMember.isDelete=False）
2. WHEN 用户加入活动 THEN THE System SHALL 验证活动未被取消（is_cancelled=False）
3. WHEN 用户加入活动 THEN THE System SHALL 验证活动未结束（actual_endTime=NULL）
4. WHEN 用户加入活动 THEN THE System SHALL 验证用户未已加入该活动（避免重复加入）
5. WHEN 用户加入活动 THEN THE System SHALL 验证活动所属协会未被删除（Club.isDelete=False）
6. WHEN 用户加入已取消活动 THEN THE System SHALL 返回错误提示"活动已取消，无法加入"
7. WHEN 用户加入已结束活动 THEN THE System SHALL 返回错误提示"活动已结束，无法加入"
8. WHEN 非协会成员加入活动 THEN THE System SHALL 返回错误提示"请先加入协会"

### Requirement 20: 活动管理操作边界条件控制

**User Story:** 作为协会管理员，我想在管理活动时受到合理的约束，这样可以避免执行无效的操作。

#### Acceptance Criteria

1. WHEN 管理员开始活动 THEN THE System SHALL 验证活动未被取消（is_cancelled=False）
2. WHEN 管理员开始活动 THEN THE System SHALL 验证活动未已开始（actual_startTime=NULL）
3. WHEN 管理员开始活动 THEN THE System SHALL 验证活动未结束（actual_endTime=NULL）
4. WHEN 管理员结束活动 THEN THE System SHALL 验证活动已开始（actual_startTime != NULL）
5. WHEN 管理员结束活动 THEN THE System SHALL 验证活动未已结束（actual_endTime=NULL）
6. WHEN 管理员结束活动 THEN THE System SHALL 验证活动未被取消（is_cancelled=False）
7. WHEN 管理员取消活动 THEN THE System SHALL 验证活动未已结束（actual_endTime=NULL）
8. WHEN 管理员取消活动 THEN THE System SHALL 验证活动未已被取消（is_cancelled=False）
9. WHEN 管理员修改活动时间 THEN THE System SHALL 验证活动未已开始（actual_startTime=NULL）
10. WHEN 管理员修改活动时间 THEN THE System SHALL 验证新的 pre_startTime < pre_endTime
11. WHEN 管理员修改活动时间 THEN THE System SHALL 验证新的 pre_startTime >= 当前时间
12. WHEN 管理员执行任何活动管理操作 THEN THE System SHALL 验证用户是该活动所属协会的管理员

### Requirement 21: 活动退出边界条件控制

**User Story:** 作为用户，我想在退出活动时受到合理的约束，这样可以避免执行无效的操作。

#### Acceptance Criteria

1. WHEN 用户退出活动 THEN THE System SHALL 验证用户已加入该活动
2. WHEN 用户退出活动 THEN THE System SHALL 验证活动未已结束（actual_endTime=NULL）
3. WHEN 用户退出已结束活动 THEN THE System SHALL 返回错误提示"活动已结束，无法退出"
4. WHEN 用户退出未加入的活动 THEN THE System SHALL 返回错误提示"您未加入该活动"
5. WHEN 用户退出活动成功 THEN THE System SHALL 删除对应的 EventJoin 记录

### Requirement 22: 活动打卡边界条件控制

**User Story:** 作为活动参与者，我想在打卡时受到合理的约束，这样可以确保打卡的有效性。

#### Acceptance Criteria

1. WHEN 用户打卡 THEN THE System SHALL 验证用户已加入该活动
2. WHEN 用户打卡 THEN THE System SHALL 验证活动已开始（actual_startTime != NULL）
3. WHEN 用户打卡 THEN THE System SHALL 验证活动未结束（actual_endTime=NULL）
4. WHEN 用户打卡 THEN THE System SHALL 验证活动未被取消（is_cancelled=False）
5. WHEN 用户在活动开始前打卡 THEN THE System SHALL 返回错误提示"活动尚未开始"
6. WHEN 用户在活动结束后打卡 THEN THE System SHALL 返回错误提示"活动已结束"
7. WHEN 用户重复打卡 THEN THE System SHALL 更新打卡时间为最新时间

### Requirement 23: 协会删除时的活动状态处理

**User Story:** 作为超级管理员，我想在删除协会时正确处理相关活动，这样可以保证数据一致性。

#### Acceptance Criteria

1. WHEN 删除协会 THEN THE System SHALL 取消所有未结束的活动（actual_endTime=NULL 的活动设置 is_cancelled=True）
2. WHEN 删除协会 THEN THE System SHALL 保留所有已结束的活动记录（actual_endTime != NULL）
3. WHEN 删除协会 THEN THE System SHALL 保留所有活动的 EventJoin 记录
4. WHEN 删除协会 THEN THE System SHALL 在事务中执行所有操作以保证原子性
5. WHEN 删除协会失败 THEN THE System SHALL 回滚所有相关操作

### Requirement 24: 活动时间有效性验证

**User Story:** 作为系统，我想验证活动时间的合理性，这样可以避免创建时间逻辑错误的活动。

#### Acceptance Criteria

1. WHEN 验证活动时间 THEN THE System SHALL 确保 pre_startTime 不早于当前时间超过1年
2. WHEN 验证活动时间 THEN THE System SHALL 确保 pre_endTime 不晚于 pre_startTime 超过30天
3. WHEN 验证活动时间 THEN THE System SHALL 确保 pre_endTime - pre_startTime >= 30分钟
4. WHEN 活动时间验证失败 THEN THE System SHALL 返回具体的错误信息
5. WHEN 修改活动时间 THEN THE System SHALL 重新验证时间有效性

### Requirement 25: 并发操作数据一致性保证

**User Story:** 作为系统，我想正确处理并发操作，这样可以避免数据不一致。

#### Acceptance Criteria

1. WHEN 多个用户同时加入同一活动 THEN THE System SHALL 使用数据库唯一约束（EventJoin表的unique_user_event）防止重复加入
2. WHEN 多个管理员同时开始同一活动 THEN THE System SHALL 使用数据库事务确保 actual_startTime 只被设置一次
3. WHEN 用户加入活动的同时活动被取消 THEN THE System SHALL 在后端验证时检测到 is_cancelled=True 并返回错误
4. WHEN 用户退出活动的同时活动被删除 THEN THE System SHALL 优雅处理（EventJoin记录可能已不存在）并返回成功
5. WHEN 协会被删除的同时有用户加入其活动 THEN THE System SHALL 在后端验证时检测到 Club.isDelete=True 并返回错误
6. WHEN 数据库唯一约束冲突 THEN THE System SHALL 捕获异常并返回友好的错误信息"您已加入该活动"
