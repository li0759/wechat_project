# 后端API改动汇总（最终精简版）

基于需求文档和前后端职责划分，以下是**真正必须**修改的后端API：

## 必须修改的后端API（仅3个核心功能）

### 1. `/api/v1/event/user_manage/list/<string:show>` (我管理的活动列表)
**需求来源**: Requirement 6, 16
**为什么必须改**: 
- 前端无法自行计算4种状态（需要服务器时间判断）
- 分页API必须在后端过滤，否则分页逻辑会错误
**需要修改**:
1. **扩展 show 参数**:
   - `prego`: actual_startTime=NULL 且 pre_startTime > 当前时间
   - `going`: actual_startTime != NULL 且 actual_endTime=NULL  
   - `ended`: actual_endTime != NULL
   - `cancelled`: is_cancelled=True

2. **修改 count 模式返回**:
   ```json
   {
     "prego_count": 5,
     "going_count": 3,
     "ended_count": 10,
     "cancelled_count": 2
   }
   ```

3. **修正角色判断**:
   - 从 `memberShip.role == 'admin'` 改为
   - `memberShip.role in ['president', 'vice_president', 'director']`

### 2. `/api/v1/club/<int:club_id>/delete` (协会删除)
**需求来源**: Requirement 11, 23
**为什么必须改**: 
- 级联操作必须在后端保证原子性和数据一致性
- 涉及多表操作，前端无法实现
**需要修改**:
1. **级联操作**（在事务中执行）:
   - 设置 `Club.isDelete = True`
   - 设置所有 `ClubMember.isDelete = True`
   - 设置所有关联活动 `Event.is_cancelled = True`
   - 拒绝所有待审批的 `ClubApplication`（设置 `approved = False`）

2. **事务处理**:
   - 使用数据库事务确保原子性
   - 失败时回滚所有操作

### 3. 活动操作API增加后端验证（安全防护）
**需求来源**: Requirement 21
**为什么必须改**: 
- 前端验证可以被绕过（用户可以直接调用API）
- 后端验证是最后的安全防线
- **但验证逻辑很简单，只需要在现有代码基础上增加几行检查**

#### `/api/v1/event/<int:event_id>/join` (加入活动)
**增加验证**（在现有代码开头增加）:
```python
# 验证活动状态
if event.is_cancelled:
    return jsonify({'Flag': '4001', 'message': '活动已取消，无法加入'}), 200
if event.actual_endTime is not None:
    return jsonify({'Flag': '4001', 'message': '活动已结束，无法加入'}), 200
if event.club.isDelete:
    return jsonify({'Flag': '4001', 'message': '协会已删除，无法加入'}), 200
# 验证用户是协会成员
if not any(m.clubID == event.clubID and not m.isDelete for m in cur_user.clubmembers):
    return jsonify({'Flag': '4001', 'message': '请先加入协会'}), 200
```

#### `/api/v1/event/<int:event_id>/quit` (退出活动)
**增加验证**:
```python
if event.actual_endTime is not None:
    return jsonify({'Flag': '4001', 'message': '活动已结束，无法退出'}), 200
```

#### `/api/v1/event/<int:event_id>/begin` (开始活动)
**增加验证**:
```python
if event.is_cancelled:
    return jsonify({'Flag': '4001', 'message': '活动已取消'}), 200
if event.actual_startTime is not None:
    return jsonify({'Flag': '4001', 'message': '活动已开始'}), 200
```

#### `/api/v1/event/<int:event_id>/end` (结束活动)
**增加验证**:
```python
if event.actual_startTime is None:
    return jsonify({'Flag': '4001', 'message': '活动尚未开始'}), 200
if event.actual_endTime is not None:
    return jsonify({'Flag': '4001', 'message': '活动已结束'}), 200
```

#### `/api/v1/event/<int:event_id>/delete` 或 `/cancel` (取消活动)
**增加验证**:
```python
if event.actual_endTime is not None:
    return jsonify({'Flag': '4001', 'message': '活动已结束，无法取消'}), 200
if event.is_cancelled:
    return jsonify({'Flag': '4001', 'message': '活动已取消'}), 200
```

## 不需要修改的API（前端处理即可）

### 1. 所有列表API的过滤逻辑
**原因**: 
- 这些API都是分页API，已经返回完整数据
- 前端可以根据返回的状态字段（`isDelete`、`is_cancelled`、`club_deleted`）进行过滤
- 前端过滤不影响分页逻辑（因为是在已加载的数据上过滤）

**包括**:
- `/club/list/all` - 前端过滤 `isDelete = False`
- `/club/user_joined/list` - 前端显示所有，包括已删除
- `/event/list/<show>` - 前端过滤 `is_cancelled = False`
- `/event/user_joined/list/<show>` - 前端显示所有，包括已取消

### 2. 活动创建API的验证
**原因**:
- 前端已经有完整的表单验证
- 后端的基本验证（必填字段、数据类型）已经存在
- 时间逻辑验证可以在前端完成

### 3. 活动详情API
**原因**:
- 已经返回所有必要的状态字段
- 无需修改

### 4. 协会选择列表API
**原因**:
- 前端可以基于现有API返回的数据进行过滤
- 无需新增API

## 总结

**必须修改的后端API：只有3个**
1. ✅ `/event/user_manage/list/<show>` - 扩展状态支持（核心功能，约50行代码）
2. ✅ `/club/<id>/delete` - 级联删除（核心功能，约30行代码）
3. ✅ 5个活动操作API - 增加验证（安全防护，每个约5-10行代码）

**总代码量估算**: 约150-200行

**前端处理的功能**:
1. ✅ 所有列表过滤逻辑
2. ✅ 表单验证
3. ✅ 按钮禁用
4. ✅ 视觉标识
5. ✅ 协会选择器过滤
6. ✅ 状态标签显示

**优先级**:
1. **最高**: `/event/user_manage/list/<show>` - 会长管理功能的核心
2. **高**: `/club/<id>/delete` - 数据一致性保证
3. **中**: 活动操作验证 - 安全防护（可以逐步添加）
