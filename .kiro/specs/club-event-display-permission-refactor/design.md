# Design Document

## Overview

本设计文档详细说明了协会和活动显示权限重构的技术实现方案。基于需求文档中的23个需求，本设计采用"前端过滤为主、后端验证为辅"的策略，最小化后端改动，将大部分显示逻辑和用户体验优化放在前端实现。

## Architecture Principles

### 1. 职责划分原则

**前端职责**:
- 显示过滤逻辑（基于后端返回的状态字段）
- 表单验证和用户体验优化
- 按钮禁用和视觉反馈
- 状态标签显示
- 灰色蒙层效果

**后端职责**:
- 数据安全验证（最后防线）
- 级联操作的原子性保证
- 服务器端时间计算（4种活动状态）
- 数据库事务管理

### 2. 最小改动原则

只修改3个核心后端API：
1. `/event/user_manage/list/<show>` - 扩展状态支持
2. `/club/<id>/delete` - 级联删除
3. 5个活动操作API - 增加后端验证

其他所有功能通过前端实现。

## Backend Design

### 1. 活动管理列表API扩展

**API**: `GET /api/v1/event/user_manage/list/<string:show>`

**当前实现问题**:
- 只支持 `going`/`ended`/`all` 三种状态
- 角色判断错误：使用 `role == 'admin'` 而非正确的管理员角色
- 缺少 `count` 模式的详细统计

**设计改动**:


```python
# 修改 app/routes/event.py 中的 get_user_manage_eventlist 函数

@bp.route('/user_manage/list/<string:show>', methods=['GET'])
@jwt_required()
def get_user_manage_eventlist(show):
    # 权限检查
    has_permission, message = check_permission(event.get_user_manage_eventlist.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200
    
    mode = request.args.get('mode', 'page')
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    page = request.args.get('page', default=1, type=int)

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 修正：获取管理中的活动（包括已被移出的协会）
    managed_events = []
    for memberShip in cur_user.clubmembers:
        # 修正角色判断：使用正确的管理员角色
        if memberShip.role in ['president', 'vice_president', 'director']:
            club = Club.query.filter_by(clubID=memberShip.clubID).first()
            if club and club.events:
                managed_events.extend(club.events)

    # 获取当前时间（用于判断预计开始状态）
    now = datetime.now(ZoneInfo('Asia/Shanghai'))

    # Count模式处理 - 扩展为4种状态统计
    if mode == 'count':
        prego_count = len([e for e in managed_events 
                          if e.actual_startTime is None and e.pre_startTime > now and not e.is_cancelled])
        going_count = len([e for e in managed_events 
                          if e.actual_startTime is not None and e.actual_endTime is None and not e.is_cancelled])
        ended_count = len([e for e in managed_events 
                          if e.actual_endTime is not None])
        cancelled_count = len([e for e in managed_events 
                              if e.is_cancelled])
        
        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data': {
                'prego_count': prego_count,
                'going_count': going_count,
                'ended_count': ended_count,
                'cancelled_count': cancelled_count,
                'total_count': len(managed_events)
            }
        })

    # 时间过滤
    if mode == 'month' and year and month:
        start_date = datetime(year, month, 1)
        end_date = datetime(year, month+1, 1) if month < 12 else datetime(year+1, 1, 1)
        managed_events = [e for e in managed_events 
                         if start_date <= (e.actual_startTime if e.actual_startTime else e.pre_startTime) < end_date]

    # Show参数过滤 - 扩展为4种状态
    if show == 'prego':
        # 预计开始：未实际开始 且 预计开始时间在未来 且 未取消
        filtered_events = [e for e in managed_events 
                          if e.actual_startTime is None and e.pre_startTime > now and not e.is_cancelled]
    elif show == 'going':
        # 正在进行：已实际开始 且 未实际结束 且 未取消
        filtered_events = [e for e in managed_events 
                          if e.actual_startTime is not None and e.actual_endTime is None and not e.is_cancelled]
    elif show == 'ended':
        # 已结束：已实际结束
        filtered_events = [e for e in managed_events 
                          if e.actual_endTime is not None]
    elif show == 'cancelled':
        # 已取消：is_cancelled=True
        filtered_events = [e for e in managed_events 
                          if e.is_cancelled]
    elif show == 'all':
        filtered_events = managed_events
    else:
        filtered_events = managed_events

    # 排序逻辑：按开始时间降序
    filtered_events = sorted(
        filtered_events,
        key=lambda x: x.actual_startTime if x.actual_startTime else x.pre_startTime,
        reverse=True
    )

    # 分页处理
    if mode == 'page':
        PAGE_SIZE = 10
        total_records = len(filtered_events)
        total_pages = (total_records + PAGE_SIZE - 1) // PAGE_SIZE
        
        paged_events = filtered_events[(page-1)*PAGE_SIZE : page*PAGE_SIZE]
        
        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data':{
                'records': [{
                    'event_id': e.eventID,
                    'title': e.title,
                    'club_name': e.club.clubName,
                    'club_cover': e.club.cover.fileUrl if e.club.cover else None,
                    'event_imgs': (
                        ([e.cover.fileUrl] if e.cover else []) +
                        ([file.fileUrl for file in (e.moments[-1].image_files or [])] 
                         if e.moments and e.moments[-1].image_files else [])
                    ),
                    'actual_startTime': e.actual_startTime.isoformat() if e.actual_startTime else None,
                    'pre_startTime': e.pre_startTime.isoformat() if e.pre_startTime else None,
                    'join_count': len(e.eventjoins),
                    'real_cost': e.real_cost,
                    'budget': e.budget,
                    'cover': e.cover.fileUrl if e.cover else None,
                    'is_cancelled': e.is_cancelled,
                    'club_deleted': e.club.isDelete
                } for e in paged_events],
                'pagination': {
                    'total_pages': total_pages,
                    'current_page': page,
                    'page_size': PAGE_SIZE,
                    'total_records': total_records
                }
            }
        })
    else:  # month模式
        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data': [{
                'event_id': e.eventID,
                'title': e.title,
                'club_name': e.club.clubName,
                'startTime': e.actual_startTime.isoformat() if e.actual_startTime else e.pre_startTime.isoformat(),
                'clockin_count': sum(1 for ej in e.eventjoins if ej.clockinDate is not None),
                'real_cost': e.real_cost,
                'budget': e.budget,
                'is_cancelled': e.is_cancelled,
                'club_deleted': e.club.isDelete
            } for e in filtered_events]
        })
```

**关键改动点**:
1. 修正角色判断：`role in ['president', 'vice_president', 'director']`
2. 新增 `prego` 状态：`actual_startTime is None and pre_startTime > now and not is_cancelled`
3. 新增 `cancelled` 状态：`is_cancelled=True`
4. Count模式返回4种状态的详细统计
5. 包含已被移出协会的活动（只要曾经管理过）

### 2. 协会删除级联操作

**API**: `GET /api/v1/club/<int:club_id>/delete`

**当前实现问题**:
- 缺少级联删除逻辑
- 没有事务保证

**设计改动**:

```python
# 修改 app/routes/club.py 中的 delete_club 函数

@bp.route('/<int:club_id>/delete', methods=['GET'])
@jwt_required()
def delete_club(club_id):
    # 权限检查
    has_permission, message = check_permission(club.delete_club.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    try:
        # 开启事务
        club_to_delete = Club.query.filter_by(clubID=club_id).first()
        if not club_to_delete:
            return jsonify({'Flag': '4001', 'message': '协会不存在'}), 200

        # 1. 设置协会为已删除
        club_to_delete.isDelete = True

        # 2. 设置所有成员关系为已删除
        ClubMember.query.filter_by(clubID=club_id).update({'isDelete': True})

        # 3. 取消所有未结束的活动
        Event.query.filter_by(clubID=club_id, actual_endTime=None).update({'is_cancelled': True})

        # 4. 拒绝所有待审批的申请
        ClubApplication.query.filter_by(clubID=club_id, approved=None).update({
            'approved': False,
            'processedDate': datetime.now(ZoneInfo('Asia/Shanghai'))
        })

        # 提交事务
        db.session.commit()

        return jsonify({
            'Flag':'4000',
            'message': '删除协会成功',
            'data':{
                'clubID': club_to_delete.clubID,
                'clubName': club_to_delete.clubName
            }
        })

    except Exception as e:
        # 回滚事务
        db.session.rollback()
        return jsonify({'Flag': '4001', 'message': f'删除协会失败: {str(e)}'}), 200
```

**关键改动点**:
1. 使用数据库事务确保原子性
2. 级联操作：协会、成员、活动、申请
3. 只取消未结束的活动（保留已结束活动记录）
4. 失败时自动回滚


### 3. 活动操作API后端验证

**目的**: 作为安全防线，防止前端验证被绕过

**设计原则**: 
- 简单验证，每个API增加5-10行代码
- 返回明确的错误信息
- 不影响现有功能

#### 3.1 加入活动验证

**API**: `GET /api/v1/event/<int:event_id>/join`

```python
@bp.route('/<int:event_id>/join', methods=['GET'])
@jwt_required()
def join_event(event_id):
    # 权限检查
    has_permission, message = check_permission(event.join_event.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()
    
    # 获取活动信息
    event_to_join = Event.query.filter_by(eventID=event_id).first()
    if not event_to_join:
        return jsonify({'Flag': '4001', 'message': '活动不存在'}), 200

    # 后端验证 - 新增
    if event_to_join.is_cancelled:
        return jsonify({'Flag': '4001', 'message': '活动已取消，无法加入'}), 200
    
    if event_to_join.actual_endTime is not None:
        return jsonify({'Flag': '4001', 'message': '活动已结束，无法加入'}), 200
    
    if event_to_join.club.isDelete:
        return jsonify({'Flag': '4001', 'message': '协会已删除，无法加入'}), 200
    
    # 验证用户是协会成员
    is_club_member = any(
        m.clubID == event_to_join.clubID and not m.isDelete 
        for m in cur_user.clubmembers
    )
    if not is_club_member:
        return jsonify({'Flag': '4001', 'message': '请先加入协会'}), 200

    # 原有逻辑
    join = EventJoin(eventID=event_id, userID=cur_user.userID)
    db.session.add(join)
    db.session.commit()
    return jsonify({'Flag':'4000','message': '加入活动成功'})
```

#### 3.2 退出活动验证

**API**: `GET /api/v1/event/<int:event_id>/quit`

```python
@bp.route('/<int:event_id>/quit', methods=['GET'])
@jwt_required()
def quit_event(event_id):
    # 权限检查
    has_permission, message = check_permission(event.quit_event.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()
    
    # 获取活动信息
    event_to_quit = Event.query.filter_by(eventID=event_id).first()
    if not event_to_quit:
        return jsonify({'Flag': '4001', 'message': '活动不存在'}), 200

    # 后端验证 - 新增
    if event_to_quit.actual_endTime is not None:
        return jsonify({'Flag': '4001', 'message': '活动已结束，无法退出'}), 200

    # 原有逻辑
    join_record = next((ej for ej in cur_user.eventjoins if ej.eventID == event_id), None)
    if not join_record:
        return jsonify({'Flag': '4001', 'message': '您未加入该活动'}), 200

    db.session.delete(join_record)
    db.session.commit()
    return jsonify({'Flag':'4000','message': '退出活动成功'})
```

#### 3.3 开始活动验证

**API**: `GET /api/v1/event/<int:event_id>/begin`

```python
@bp.route('/<int:event_id>/begin', methods=['GET'])
@jwt_required()
def event_begin(event_id):
    # 权限检查
    has_permission, message = check_permission(event.event_begin.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    event_to_begin = Event.query.filter_by(eventID=event_id).first()
    if not event_to_begin:
        return jsonify({'Flag': '4001', 'message': '活动不存在'}), 200

    # 后端验证 - 新增
    if event_to_begin.is_cancelled:
        return jsonify({'Flag': '4001', 'message': '活动已取消，无法开始'}), 200
    
    if event_to_begin.actual_startTime is not None:
        return jsonify({'Flag': '4001', 'message': '活动已开始'}), 200

    # 原有逻辑
    event_to_begin.actual_startTime = datetime.now(ZoneInfo('Asia/Shanghai'))
    db.session.commit()
    
    return jsonify({
        'Flag':'4000',
        'message': '活动开始',
        'data':{
            'clubID': event_to_begin.club.clubID,
            'clubName': event_to_begin.club.clubName,
            'eventCover': event_to_begin.cover.fileUrl if event_to_begin.cover else None,
            'eventID': event_to_begin.eventID,
            'authorID': event_to_begin.authorID,
            'title': event_to_begin.title
        }
    })
```

#### 3.4 结束活动验证

**API**: `GET /api/v1/event/<int:event_id>/end`

```python
@bp.route('/<int:event_id>/end', methods=['GET'])
@jwt_required()
def event_end(event_id):
    # 权限检查
    has_permission, message = check_permission(event.event_end.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    event_to_end = Event.query.filter_by(eventID=event_id).first()
    if not event_to_end:
        return jsonify({'Flag': '4001', 'message': '活动不存在'}), 200

    # 后端验证 - 新增
    if event_to_end.actual_startTime is None:
        return jsonify({'Flag': '4001', 'message': '活动尚未开始，无法结束'}), 200
    
    if event_to_end.actual_endTime is not None:
        return jsonify({'Flag': '4001', 'message': '活动已结束'}), 200
    
    if event_to_end.is_cancelled:
        return jsonify({'Flag': '4001', 'message': '活动已取消，无法结束'}), 200

    # 原有逻辑
    event_to_end.actual_endTime = datetime.now(ZoneInfo('Asia/Shanghai'))
    db.session.commit()
    
    return jsonify({
        'Flag':'4000',
        'message': '活动结束',
        'data':{
            'clubID': event_to_end.club.clubID,
            'clubName': event_to_end.club.clubName,
            'eventCover': event_to_end.cover.fileUrl if event_to_end.cover else None,
            'eventID': event_to_end.eventID,
            'authorID': event_to_end.authorID,
            'title': event_to_end.title
        }
    })
```

#### 3.5 取消活动验证

**API**: `GET /api/v1/event/<int:event_id>/delete`

```python
@bp.route('/<int:event_id>/delete', methods=['GET'])
@jwt_required()
def delete_event(event_id):
    # 权限检查
    has_permission, message = check_permission(event.delete_event.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    event_to_cancel = Event.query.filter_by(eventID=event_id).first()
    if not event_to_cancel:
        return jsonify({'Flag': '4001', 'message': '活动不存在'}), 200

    # 后端验证 - 新增
    if event_to_cancel.actual_endTime is not None:
        return jsonify({'Flag': '4001', 'message': '活动已结束，无法取消'}), 200
    
    if event_to_cancel.is_cancelled:
        return jsonify({'Flag': '4001', 'message': '活动已取消'}), 200

    # 原有逻辑
    event_to_cancel.is_cancelled = True
    db.session.commit()
    
    return jsonify({
        'Flag':'4000',
        'message': '活动已取消',
        'data':{
            'clubID': event_to_cancel.club.clubID,
            'clubName': event_to_cancel.club.clubName,
            'eventID': event_to_cancel.eventID,
            'authorID': event_to_cancel.authorID,
            'title': event_to_cancel.title
        }
    })
```

## Frontend Design

### 1. 显示过滤逻辑

**原则**: 基于后端返回的状态字段进行前端过滤，不修改后端API

#### 1.1 首页显示过滤

**文件**: `pages/home/index.js` (或相关首页组件)

**实现**:
```javascript
// 在获取协会列表后进行过滤
loadClubList() {
  this.request({
    url: '/club/list/all',
    method: 'GET'
  }).then(res => {
    if (res.Flag == '4000') {
      // 前端过滤：只显示未删除的协会
      const clubs = res.data.records.filter(club => !club.is_deleted);
      this.setData({ clubList: clubs });
    }
  });
}

// 在获取活动列表后进行过滤
loadEventList() {
  this.request({
    url: '/event/list/all',
    method: 'GET'
  }).then(res => {
    if (res.Flag == '4000') {
      // 前端过滤：只显示未取消的活动
      const events = res.data.records.filter(event => !event.is_cancelled);
      this.setData({ eventList: events });
    }
  });
}
```

#### 1.2 个人中心我的协会显示

**文件**: `packageProfile/components/clubs-panel/index.js`

**实现**:
```javascript
// 不需要修改，已经显示所有协会（包括已删除）
// 只需添加灰色蒙层效果（见视觉标识部分）
loadClubList(page = 1) {
  // ... 现有代码保持不变
  // 后端API已返回 is_deleted 字段
  // 前端根据该字段显示灰色蒙层
}
```

#### 1.3 个人中心我的活动显示

**文件**: `packageProfile/components/events-panel/index.js`

**实现**:
```javascript
// 不需要修改，已经显示所有活动（包括已取消、已删除协会的活动）
// 只需添加灰色蒙层效果和状态标签（见视觉标识部分）
loadEventList(page = 1) {
  // ... 现有代码保持不变
  // 后端API已返回 is_cancelled 和 club_deleted 字段
  // 前端根据这些字段显示灰色蒙层和状态标签
}
```

#### 1.4 活动创建协会选择过滤

**文件**: `packageEvent/components/event-create-panel/index.js`

**实现**:
```javascript
// 在获取协会列表后进行过滤
fetchUserClubList() {
  return this.request({
    url: `/club/user_managed/list`,
    method: 'GET',
    silent: true
  }).then(res => {
    if (res.Flag == 4000 && res.data) {
      // 前端过滤：只显示未删除的协会
      const clubList = res.data
        .filter(club => !club.is_deleted)
        .map(club => ({
          id: club.club_id,
          name: club.club_name
        }));
      
      this.setData({ clubList });
      
      // 处理默认选择
      if (clubList.length > 0) {
        const defaultIndex = this.properties.clubId 
          ? clubList.findIndex(club => club.id == this.properties.clubId) 
          : 0;
        
        const selectedIndex = defaultIndex !== -1 ? defaultIndex : 0;
        const selectedClub = clubList[selectedIndex];
        
        this.setData({
          'formData.clubId': selectedClub.id,
          'formData.clubName': selectedClub.name,
          selectedClubId: selectedClub.id
        });
      }
    }
  });
}
```


### 2. 协会会长管理功能重构

**文件**: `packageProfile/index.js` 或相关个人中心页面

#### 2.1 UI结构设计

```javascript
// 新增数据结构
data: {
  // 我管理的活动统计
  managedEventStats: {
    prego_count: 0,
    going_count: 0,
    ended_count: 0,
    cancelled_count: 0
  },
  // 是否曾经管理过协会
  hasEverManaged: false,
  // 当前是否管理协会
  currentlyManaging: false
}
```

#### 2.2 获取活动统计

```javascript
// 获取我管理的活动统计
async loadManagedEventStats() {
  try {
    const res = await this.request({
      url: '/event/user_manage/list/all?mode=count',
      method: 'GET'
    });
    
    if (res.Flag == '4000') {
      const stats = res.data;
      
      // 判断是否曾经管理过协会（有已结束或已取消的活动）
      const hasEverManaged = (stats.ended_count > 0 || stats.cancelled_count > 0);
      
      // 判断当前是否管理协会（有预计开始或正在进行的活动）
      const currentlyManaging = (stats.prego_count > 0 || stats.going_count > 0);
      
      this.setData({
        managedEventStats: stats,
        hasEverManaged,
        currentlyManaging
      });
    }
  } catch (error) {
    console.error('获取活动统计失败:', error);
  }
}
```

#### 2.3 按钮显示逻辑

```javascript
// 在WXML中使用条件渲染
// 预计开始按钮：只在当前管理协会时显示，显示角标
<view wx:if="{{currentlyManaging}}" class="event-btn">
  <button bindtap="showPregoEvents">
    预计开始
    <view wx:if="{{managedEventStats.prego_count > 0}}" class="badge">
      {{managedEventStats.prego_count}}
    </view>
  </button>
</view>

// 正在进行按钮：只在当前管理协会时显示，显示角标
<view wx:if="{{currentlyManaging}}" class="event-btn">
  <button bindtap="showGoingEvents">
    正在进行
    <view wx:if="{{managedEventStats.going_count > 0}}" class="badge">
      {{managedEventStats.going_count}}
    </view>
  </button>
</view>

// 已结束按钮：只要曾经管理过就显示
<view wx:if="{{hasEverManaged}}" class="event-btn">
  <button bindtap="showEndedEvents">已结束</button>
</view>

// 已取消按钮：只要曾经管理过就显示
<view wx:if="{{hasEverManaged}}" class="event-btn">
  <button bindtap="showCancelledEvents">已取消</button>
</view>

// 创建活动按钮：只在当前管理协会时显示
<view wx:if="{{currentlyManaging}}" class="event-btn">
  <button bindtap="createEvent">创建活动</button>
</view>

// 全部按钮：在标题行右侧
<view class="title-row">
  <text>我管理的活动</text>
  <button bindtap="showAllEvents" class="all-btn">全部</button>
</view>
```

#### 2.4 弹窗显示逻辑

```javascript
// 显示预计开始的活动
showPregoEvents() {
  this.showEventsPanel('/event/user_manage/list/prego');
},

// 显示正在进行的活动
showGoingEvents() {
  this.showEventsPanel('/event/user_manage/list/going');
},

// 显示已结束的活动
showEndedEvents() {
  this.showEventsPanel('/event/user_manage/list/ended');
},

// 显示已取消的活动
showCancelledEvents() {
  this.showEventsPanel('/event/user_manage/list/cancelled');
},

// 显示所有活动
showAllEvents() {
  this.showEventsPanel('/event/user_manage/list/all');
},

// 通用弹窗显示方法
showEventsPanel(requestUrl) {
  // 使用 expandable-container 或类似组件显示 events-panel
  // 传递 requestUrl 参数
  this.setData({
    eventsRequestUrl: requestUrl,
    showEventsPanel: true
  });
}
```

### 3. 视觉标识实现

#### 3.1 灰色蒙层效果

**WXSS样式**:
```css
/* 协会/活动卡片容器 */
.card-container {
  position: relative;
}

/* 灰色蒙层 */
.card-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 1;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 蒙层文字 */
.overlay-text {
  color: #ffffff;
  font-size: 16px;
  font-weight: bold;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}
```

**WXML实现**:
```xml
<!-- 协会卡片 -->
<view class="card-container">
  <view class="club-card">
    <!-- 协会内容 -->
  </view>
  <!-- 已删除协会的灰色蒙层 -->
  <view wx:if="{{club.is_deleted}}" class="card-overlay">
    <text class="overlay-text">协会已删除</text>
  </view>
</view>

<!-- 活动卡片 -->
<view class="card-container">
  <view class="event-card">
    <!-- 活动内容 -->
  </view>
  <!-- 已取消活动的灰色蒙层 -->
  <view wx:if="{{event.is_cancelled}}" class="card-overlay">
    <text class="overlay-text">活动已取消</text>
  </view>
  <!-- 已删除协会的活动的灰色蒙层 -->
  <view wx:elif="{{event.club_deleted}}" class="card-overlay">
    <text class="overlay-text">协会已删除</text>
  </view>
</view>
```

#### 3.2 状态标签显示

**WXSS样式**:
```css
/* 状态标签容器 */
.status-tags {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

/* 状态标签 */
.status-tag {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: #ffffff;
}

/* 不同状态的颜色 */
.status-tag.prego {
  background-color: #0052d9; /* 蓝色 - 预计开始 */
}

.status-tag.going {
  background-color: #00a870; /* 绿色 - 正在进行 */
}

.status-tag.ended {
  background-color: #888888; /* 灰色 - 已结束 */
}

.status-tag.cancelled {
  background-color: #e34d59; /* 红色 - 已取消 */
}

.status-tag.club-deleted {
  background-color: #888888; /* 灰色 - 协会已删除 */
}
```

**WXML实现**:
```xml
<!-- 活动列表项中的状态标签 -->
<view class="event-item">
  <view class="event-content">
    <!-- 活动内容 -->
  </view>
  <view class="status-tags">
    <!-- 预计开始 -->
    <view wx:if="{{!event.actual_startTime && !event.is_cancelled}}" 
          class="status-tag prego">
      预计开始
    </view>
    <!-- 正在进行 -->
    <view wx:elif="{{event.actual_startTime && !event.actual_endTime && !event.is_cancelled}}" 
          class="status-tag going">
      进行中
    </view>
    <!-- 已结束 -->
    <view wx:elif="{{event.actual_endTime}}" 
          class="status-tag ended">
      已结束
    </view>
    <!-- 已取消 -->
    <view wx:if="{{event.is_cancelled}}" 
          class="status-tag cancelled">
      已取消
    </view>
    <!-- 协会已删除 -->
    <view wx:if="{{event.club_deleted}}" 
          class="status-tag club-deleted">
      协会已删除
    </view>
  </view>
</view>
```

### 4. 前端验证和按钮禁用

#### 4.1 活动详情页按钮状态

**文件**: `packageEvent/event-detail/index.js`

```javascript
// 计算按钮状态
computeButtonStates(eventData) {
  const {
    is_cancelled,
    is_ended,
    club_deleted,
    cur_user_is_joined,
    cur_user_can_join,
    cur_user_managed
  } = eventData;
  
  return {
    // 加入活动按钮
    canJoin: !is_cancelled && !is_ended && !club_deleted && cur_user_can_join,
    joinDisabled: is_cancelled || is_ended || club_deleted || !cur_user_can_join,
    joinDisabledReason: is_cancelled ? '活动已取消' : 
                       is_ended ? '活动已结束' : 
                       club_deleted ? '协会已删除' : 
                       !cur_user_can_join ? '请先加入协会' : '',
    
    // 退出活动按钮
    canQuit: cur_user_is_joined && !is_ended,
    quitDisabled: !cur_user_is_joined || is_ended,
    quitDisabledReason: !cur_user_is_joined ? '未加入活动' : 
                       is_ended ? '活动已结束' : '',
    
    // 活动打卡按钮
    canClockin: cur_user_is_joined && !is_cancelled && !is_ended && eventData.actual_startTime,
    clockinDisabled: !cur_user_is_joined || is_cancelled || is_ended || !eventData.actual_startTime,
    clockinDisabledReason: !cur_user_is_joined ? '未加入活动' : 
                          is_cancelled ? '活动已取消' : 
                          is_ended ? '活动已结束' : 
                          !eventData.actual_startTime ? '活动尚未开始' : '',
    
    // 管理按钮（开始、结束、取消）
    canManage: cur_user_managed,
    canBegin: cur_user_managed && !is_cancelled && !eventData.actual_startTime,
    canEnd: cur_user_managed && eventData.actual_startTime && !is_ended && !is_cancelled,
    canCancel: cur_user_managed && !is_ended && !is_cancelled
  };
}

// 在页面加载时计算按钮状态
onLoad(options) {
  // ... 获取活动数据
  this.request({
    url: `/event/${eventId}`,
    method: 'GET'
  }).then(res => {
    if (res.Flag == '4000') {
      const eventData = res.data;
      const buttonStates = this.computeButtonStates(eventData);
      
      this.setData({
        eventData,
        buttonStates
      });
    }
  });
}

// 加入活动前验证
joinEvent() {
  if (this.data.buttonStates.joinDisabled) {
    wx.showToast({
      title: this.data.buttonStates.joinDisabledReason,
      icon: 'none'
    });
    return;
  }
  
  // 发送请求
  wx.showLoading({ title: '处理中...' });
  this.request({
    url: `/event/${this.data.eventData.event_id}/join`,
    method: 'GET'
  }).then(res => {
    wx.hideLoading();
    if (res.Flag == '4000') {
      wx.showToast({
        title: '参加成功',
        icon: 'success'
      });
      // 刷新页面数据
      this.loadEventData();
    } else {
      wx.showToast({
        title: res.message || '加入失败',
        icon: 'none'
      });
    }
  }).catch(err => {
    wx.hideLoading();
    wx.showToast({
      title: '网络错误',
      icon: 'none'
    });
  });
}
```

**WXML实现**:
```xml
<!-- 加入活动按钮 -->
<button wx:if="{{!eventData.cur_user_is_joined}}"
        bindtap="joinEvent"
        disabled="{{buttonStates.joinDisabled}}"
        class="action-btn {{buttonStates.joinDisabled ? 'disabled' : ''}}">
  加入活动
</button>

<!-- 退出活动按钮 -->
<button wx:if="{{eventData.cur_user_is_joined}}"
        bindtap="quitEvent"
        disabled="{{buttonStates.quitDisabled}}"
        class="action-btn {{buttonStates.quitDisabled ? 'disabled' : ''}}">
  退出活动
</button>

<!-- 活动打卡按钮 -->
<button wx:if="{{eventData.cur_user_is_joined}}"
        bindtap="clockinEvent"
        disabled="{{buttonStates.clockinDisabled}}"
        class="action-btn {{buttonStates.clockinDisabled ? 'disabled' : ''}}">
  活动打卡
</button>

<!-- 管理按钮 -->
<view wx:if="{{buttonStates.canManage}}" class="manage-buttons">
  <button wx:if="{{buttonStates.canBegin}}"
          bindtap="beginEvent"
          class="manage-btn">
    开始活动
  </button>
  <button wx:if="{{buttonStates.canEnd}}"
          bindtap="endEvent"
          class="manage-btn">
    结束活动
  </button>
  <button wx:if="{{buttonStates.canCancel}}"
          bindtap="cancelEvent"
          class="manage-btn danger">
    取消活动
  </button>
</view>
```


### 5. Event Create Panel 弹窗交互优化

**文件**: `packageEvent/components/event-create-panel/index.js`

**设计目标**: 使用单个 t-popup 弹窗 + 内部 swiper 实现流畅的滑动选择交互，协会选择和模板选择通过 swiper 切换，当前选中的 item 放大显示。

#### 5.1 交互流程设计

**流程概述**:
1. 用户打开活动创建面板
2. 显示一个居中的 t-popup 弹窗（90%宽度，70vh高度，带遮罩层）
3. 弹窗内包含一个水平 swiper，有两个 swiper-item：
   - Item 0: 协会选择（每个item 80%屏幕宽度）
   - Item 1: 模板选择（每个item 80%屏幕宽度）
   - 间隔：10rpx
4. 初始状态：
   - 如果用户管理多个协会：swiper current=0（协会选择），item 0 放大 1.2 倍
   - 如果用户仅管理1个协会：swiper current=1（模板选择），item 1 放大 1.2 倍，跳过协会选择
5. 用户点击某个协会后：
   - 调用 `this.setData({ swiperCurrent: 1 })` 触发 swiper 自动向左滑动到 item 1
   - item 0 缩小到原始大小，item 1 放大 1.2 倍
   - 加载该协会的历史活动列表
6. 用户可以手动左右滑动 swiper，`bindchange` 事件触发 `onSwiperChange`，当前 item 自动放大 1.2 倍
7. 用户在协会 item 中切换协会时，swiper 自动滑动到模板 item（`swiperCurrent: 1`）
8. 用户选择模板并确认后，关闭弹窗，选择的协会和模板同步到 event-create-panel 表单字段

**视觉效果**:
```
初始状态（多协会）:
┌─────────────────────────────────────┐
│         [遮罩层 - 半透明]            │
│                                     │
│      ┌─────────────────────┐        │
│      │    t-popup 弹窗      │        │
│      │  ┌───────────────┐  │        │
│      │  │ 协会选择 item  │  │        │
│      │  │  (1.2倍放大)  │  │        │
│      │  │               │  │        │
│      │  └───────────────┘  │        │
│      │  [模板 item 在右侧] │        │
│      └─────────────────────┘        │
└─────────────────────────────────────┘

选择协会后（swiper 滑动）:
┌─────────────────────────────────────┐
│         [遮罩层 - 半透明]            │
│                                     │
│      ┌─────────────────────┐        │
│      │    t-popup 弹窗      │        │
│      │  [协会 item 在左侧] │        │
│      │  ┌───────────────┐  │        │
│      │  │ 模板选择 item  │  │        │
│      │  │  (1.2倍放大)  │  │        │
│      │  │               │  │        │
│      │  └───────────────┘  │        │
│      └─────────────────────┘        │
└─────────────────────────────────────┘
```

#### 5.2 数据结构设计

```javascript
Component({
  data: {
    // 单个弹窗显示状态
    showSelectorPopup: false,
    
    // Swiper 状态
    swiperCurrent: 0,  // 当前显示的 swiper item 索引（0=协会，1=模板）
    
    // 协会列表
    clubList: [],
    selectedClubId: '',
    selectedClubName: '',
    
    // 模板列表
    historyEvents: [],
    selectedTemplateId: '',
    selectedTemplateTitle: '',
    selectedTemplateCover: '',
    
    // 表单数据（同步到 event-create-panel）
    formData: {
      clubId: '',
      clubName: '',
      templateId: '',
      templateTitle: '',
      templateCover: ''
    }
  }
});
```

#### 5.3 核心方法实现

```javascript
Component({
  lifetimes: {
    attached() {
      this.initializeComponent();
    }
  },
  
  methods: {
    async initializeComponent() {
      // 获取用户管理的协会列表
      await this.fetchUserClubList();
    },
    
    // 获取用户管理的协会列表
    async fetchUserClubList() {
      try {
        const res = await this.request({
          url: `/club/user_managed/list`,
          method: 'GET',
          silent: true
        });
        
        if (res.Flag == '4000' && res.data) {
          // 前端过滤：只显示未删除的协会
          const clubList = res.data
            .filter(club => !club.is_deleted)
            .map(club => ({
              id: club.club_id,
              name: club.club_name,
              cover_url: club.cover_url
            }));
          
          this.setData({ clubList });
        }
      } catch (error) {
        console.error('获取协会列表失败:', error);
      }
    },
    
    // 显示选择器弹窗
    showSelectorPopup() {
      const clubCount = this.data.clubList.length;
      
      if (clubCount === 0) {
        wx.showToast({
          title: '暂无可选协会',
          icon: 'none'
        });
        return;
      }
      
      if (clubCount === 1) {
        // 只有1个协会，直接选中并跳到模板选择
        const club = this.data.clubList[0];
        this.setData({
          selectedClubId: club.id,
          selectedClubName: club.name,
          'formData.clubId': club.id,
          'formData.clubName': club.name,
          swiperCurrent: 1,  // 直接显示模板选择
          showSelectorPopup: true
        });
        
        // 加载该协会的历史活动
        this.loadClubHistoryEvents(club.id);
      } else {
        // 多个协会，从协会选择开始
        this.setData({
          swiperCurrent: 0,  // 显示协会选择
          showSelectorPopup: true
        });
      }
    },
    
    // Swiper 滑动事件
    onSwiperChange(e) {
      const current = e.detail.current;
      this.setData({
        swiperCurrent: current
      });
    },
    
    // 选择协会
    selectClub(e) {
      const clubId = e.currentTarget.dataset.clubId;
      const clubName = e.currentTarget.dataset.clubName;
      
      // 更新选中状态
      this.setData({
        selectedClubId: clubId,
        selectedClubName: clubName,
        'formData.clubId': clubId,
        'formData.clubName': clubName
      });
      
      // 加载该协会的历史活动
      this.loadClubHistoryEvents(clubId);
      
      // 自动滑动到模板选择
      this.setData({
        swiperCurrent: 1
      });
    },
    
    // 加载协会的历史活动
    async loadClubHistoryEvents(clubId) {
      try {
        const res = await this.request({
          url: `/event/club/${clubId}/history`,
          method: 'GET',
          silent: true
        });
        
        if (res.Flag == '4000' && res.data) {
          this.setData({
            historyEvents: res.data.events || []
          });
        } else {
          this.setData({
            historyEvents: []
          });
        }
      } catch (error) {
        this.setData({
          historyEvents: []
        });
      }
    },
    
    // 选择模板
    selectTemplate(e) {
      const templateId = e.currentTarget.dataset.templateId;
      const templateTitle = e.currentTarget.dataset.templateTitle;
      const templateCover = e.currentTarget.dataset.templateCover;
      
      this.setData({
        selectedTemplateId: templateId,
        selectedTemplateTitle: templateTitle,
        selectedTemplateCover: templateCover
      });
    },
    
    // 确认模板选择
    confirmTemplate() {
      if (this.data.selectedTemplateId) {
        // 保存模板选择到表单
        this.setData({
          'formData.templateId': this.data.selectedTemplateId,
          'formData.templateTitle': this.data.selectedTemplateTitle,
          'formData.templateCover': this.data.selectedTemplateCover
        });
        
        // 加载模板数据到表单字段
        this.loadTemplateData(this.data.selectedTemplateId);
      }
      
      // 关闭弹窗
      this.closePopup();
    },
    
    // 不使用模板
    skipTemplate() {
      // 清空模板选择
      this.setData({
        selectedTemplateId: '',
        'formData.templateId': '',
        'formData.templateTitle': '',
        'formData.templateCover': ''
      });
      
      // 关闭弹窗
      this.closePopup();
    },
    
    // 关闭弹窗
    closePopup() {
      this.setData({
        showSelectorPopup: false,
        swiperCurrent: 0,
        selectedTemplateId: ''
      });
    },
    
    // 点击遮罩层关闭
    onMaskTap() {
      this.closePopup();
    }
  }
});
```

#### 5.4 WXML实现

```xml
<!-- 单个 t-popup 弹窗，包含 swiper -->
<t-popup
  visible="{{showSelectorPopup}}"
  placement="center"
  custom-style="width: 90%; height: 70vh; border-radius: 16rpx;"
  show-overlay="{{true}}"
  bind:overlay-click="onMaskTap">
  
  <view class="selector-popup-container">
    <!-- 弹窗头部 -->
    <view class="popup-header">
      <text class="popup-title">{{swiperCurrent === 0 ? '选择协会' : '选择模板'}}</text>
      <icon class="close-icon" type="clear" size="20" bindtap="closePopup"/>
    </view>
    
    <!-- Swiper 容器 -->
    <swiper 
      class="selector-swiper"
      current="{{swiperCurrent}}"
      bindchange="onSwiperChange"
      display-multiple-items="1.25"
      previous-margin="10rpx"
      next-margin="10rpx"
      duration="300">
      
      <!-- Swiper Item 0: 协会选择 -->
      <swiper-item class="swiper-item {{swiperCurrent === 0 ? 'active' : ''}}">
        <view class="swiper-item-content">
          <scroll-view class="item-scroll" scroll-y>
            <view wx:if="{{clubList.length > 0}}" class="club-list">
              <view wx:for="{{clubList}}" wx:key="id"
                    class="club-card {{selectedClubId == item.id ? 'selected' : ''}}"
                    bindtap="selectClub"
                    data-club-id="{{item.id}}"
                    data-club-name="{{item.name}}">
                <image src="{{item.cover_url}}" class="club-cover" mode="aspectFill"/>
                <text class="club-name">{{item.name}}</text>
                <icon wx:if="{{selectedClubId == item.id}}" class="check-icon" type="success" size="24"/>
              </view>
            </view>
            
            <view wx:else class="empty-hint">
              <text>暂无可选协会</text>
            </view>
          </scroll-view>
        </view>
      </swiper-item>
      
      <!-- Swiper Item 1: 模板选择 -->
      <swiper-item class="swiper-item {{swiperCurrent === 1 ? 'active' : ''}}">
        <view class="swiper-item-content">
          <scroll-view class="item-scroll" scroll-y>
            <view wx:if="{{historyEvents.length > 0}}" class="template-list">
              <view wx:for="{{historyEvents}}" wx:key="event_id"
                    class="template-card {{selectedTemplateId == item.event_id ? 'selected' : ''}}"
                    bindtap="selectTemplate"
                    data-template-id="{{item.event_id}}"
                    data-template-title="{{item.title}}"
                    data-template-cover="{{item.cover_url}}">
                <image src="{{item.cover_url}}" class="template-cover" mode="aspectFill"/>
                <text class="template-title">{{item.title}}</text>
                <icon wx:if="{{selectedTemplateId == item.event_id}}" class="check-icon" type="success" size="24"/>
              </view>
            </view>
            
            <view wx:else class="empty-hint">
              <text>暂无历史活动</text>
            </view>
          </scroll-view>
          
          <!-- 模板选择底部按钮 -->
          <view wx:if="{{swiperCurrent === 1}}" class="template-footer">
            <button class="skip-btn" bindtap="skipTemplate">不使用模板</button>
            <button class="confirm-btn" bindtap="confirmTemplate" disabled="{{!selectedTemplateId}}">
              确认
            </button>
          </view>
        </view>
      </swiper-item>
    </swiper>
  </view>
</t-popup>
```

#### 5.5 WXSS样式实现

```css
/* 弹窗容器 */
.selector-popup-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #ffffff;
  border-radius: 16rpx;
  overflow: hidden;
}

/* 弹窗头部 */
.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx 40rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.popup-title {
  font-size: 36rpx;
  font-weight: 600;
  color: #333333;
}

.close-icon {
  color: #999999;
}

/* Swiper 容器 */
.selector-swiper {
  flex: 1;
  width: 100%;
}

/* Swiper Item */
.swiper-item {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.3s ease;
  transform: scale(1);
}

/* 当前选中的 item 放大 1.2 倍 */
.swiper-item.active {
  transform: scale(1.2);
}

/* Swiper Item 内容 */
.swiper-item-content {
  display: flex;
  flex-direction: column;
  width: 80%;
  height: 90%;
  background-color: #f8f8f8;
  border-radius: 16rpx;
  overflow: hidden;
}

/* 滚动区域 */
.item-scroll {
  flex: 1;
  padding: 32rpx;
}

/* 协会列表 */
.club-list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.club-card {
  position: relative;
  display: flex;
  align-items: center;
  padding: 24rpx;
  background-color: #ffffff;
  border-radius: 16rpx;
  border: 2rpx solid transparent;
  transition: all 0.2s ease;
}

.club-card.selected {
  background-color: #e6f7ff;
  border-color: #0052d9;
}

.club-cover {
  width: 96rpx;
  height: 96rpx;
  border-radius: 16rpx;
  margin-right: 24rpx;
}

.club-name {
  flex: 1;
  font-size: 32rpx;
  color: #333333;
}

.check-icon {
  color: #0052d9;
}

/* 模板列表 */
.template-list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.template-card {
  position: relative;
  display: flex;
  align-items: center;
  padding: 24rpx;
  background-color: #ffffff;
  border-radius: 16rpx;
  border: 2rpx solid transparent;
  transition: all 0.2s ease;
}

.template-card.selected {
  background-color: #e6f7ff;
  border-color: #0052d9;
}

.template-cover {
  width: 128rpx;
  height: 128rpx;
  border-radius: 16rpx;
  margin-right: 24rpx;
}

.template-title {
  flex: 1;
  font-size: 32rpx;
  color: #333333;
}

/* 空状态提示 */
.empty-hint {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 400rpx;
  color: #999999;
  font-size: 28rpx;
}

/* 模板选择底部按钮 */
.template-footer {
  display: flex;
  gap: 24rpx;
  padding: 32rpx 40rpx;
  border-top: 1rpx solid #f0f0f0;
  background-color: #ffffff;
}

.skip-btn {
  flex: 1;
  height: 88rpx;
  background-color: #f0f0f0;
  color: #666666;
  border: none;
  border-radius: 16rpx;
  font-size: 32rpx;
}

.confirm-btn {
  flex: 1;
  height: 88rpx;
  background-color: #0052d9;
  color: #ffffff;
  border: none;
  border-radius: 16rpx;
  font-size: 32rpx;
}

.confirm-btn[disabled] {
  background-color: #cccccc;
  color: #999999;
}
```

#### 5.6 关键技术点

**1. Swiper 配置**:
- `display-multiple-items="1.25"`: 同时显示1.25个item，让用户看到下一个item的一部分
- `previous-margin="10rpx"` 和 `next-margin="10rpx"`: 设置左右边距
- `duration="300"`: 滑动动画时长300ms
- `current="{{swiperCurrent}}"`: 绑定当前显示的item索引
- `bindchange="onSwiperChange"`: 监听滑动事件

**2. Item 缩放动画**:
- 使用 CSS class `.swiper-item.active` 实现当前item放大1.2倍
- `transform: scale(1.2)` + `transition: transform 0.3s ease` 实现平滑缩放
- 通过 `{{swiperCurrent === 0 ? 'active' : ''}}` 动态添加 active class

**3. 自动滑动触发**:
- 用户点击协会后，调用 `this.setData({ swiperCurrent: 1 })` 
- Swiper 组件自动滑动到 item 1（模板选择）
- 同时触发 CSS 动画，item 0 缩小，item 1 放大

**4. 单协会优化**:
- 检测到只有1个协会时，初始化 `swiperCurrent: 1`
- Swiper 直接显示模板选择item，跳过协会选择

**5. 联动刷新**:
- 选择协会时调用 `loadClubHistoryEvents(clubId)` 加载该协会的历史活动
- 使用 `silent: true` 静默加载，不显示 loading

**6. 数据同步**:
- 确认选择后，将协会和模板信息同步到 `formData` 对象
- `formData` 对象的数据会同步显示在 event-create-panel 的表单字段中

**7. 卡片式UI**:
- 协会卡片：封面图（96rpx）+ 协会名称 + 选中图标
- 模板卡片：封面图（128rpx）+ 活动名称 + 选中图标
- 选中状态：蓝色边框 + 浅蓝色背景 + 勾选图标


## Data Flow

### 1. 活动状态判断流程

```
用户请求活动列表
    ↓
后端返回完整数据（包含所有状态字段）
    ↓
前端根据场景过滤：
  - 首页：过滤 is_cancelled=true
  - 个人中心：显示全部
  - 管理面板：根据 show 参数显示对应状态
    ↓
前端渲染：
  - 添加灰色蒙层（is_cancelled 或 club_deleted）
  - 显示状态标签
  - 禁用相应按钮
```

### 2. 活动操作验证流程

```
用户点击操作按钮（加入/退出/开始/结束/取消）
    ↓
前端验证：
  - 检查活动状态（is_cancelled, is_ended, club_deleted）
  - 检查用户状态（cur_user_is_joined, cur_user_can_join）
  - 如果验证失败，显示友好提示，不发送请求
    ↓
前端验证通过，发送请求到后端
    ↓
后端验证：
  - 再次检查活动状态（防止前端验证被绕过）
  - 检查数据库约束
  - 如果验证失败，返回错误信息
    ↓
后端验证通过，执行操作
    ↓
返回成功响应
    ↓
前端刷新数据，更新UI
```

### 3. 协会删除级联流程

```
超级管理员点击删除协会
    ↓
后端开启数据库事务
    ↓
1. 设置 Club.isDelete = True
2. 设置所有 ClubMember.isDelete = True
3. 取消所有未结束的活动（Event.is_cancelled = True）
4. 拒绝所有待审批的申请（ClubApplication.approved = False）
    ↓
提交事务（如果任何步骤失败，自动回滚）
    ↓
返回成功响应
    ↓
前端刷新数据：
  - 协会列表中该协会显示灰色蒙层
  - 相关活动显示灰色蒙层
  - 用户的协会列表中仍显示该协会（但标记为已删除）
```

## State Management

### 1. 活动状态定义

```javascript
// 活动的4种主要状态
const EVENT_STATES = {
  PREGO: 'prego',       // 预计开始：actual_startTime=NULL && pre_startTime > now && !is_cancelled
  GOING: 'going',       // 正在进行：actual_startTime!=NULL && actual_endTime=NULL && !is_cancelled
  ENDED: 'ended',       // 已结束：actual_endTime!=NULL
  CANCELLED: 'cancelled' // 已取消：is_cancelled=True
};

// 判断活动状态的辅助函数
function getEventState(event) {
  if (event.is_cancelled) {
    return EVENT_STATES.CANCELLED;
  }
  if (event.actual_endTime) {
    return EVENT_STATES.ENDED;
  }
  if (event.actual_startTime) {
    return EVENT_STATES.GOING;
  }
  const now = new Date();
  const preStartTime = new Date(event.pre_startTime);
  if (preStartTime > now) {
    return EVENT_STATES.PREGO;
  }
  // 预计开始时间已过但未实际开始，仍算作预计开始
  return EVENT_STATES.PREGO;
}
```

### 2. 用户角色状态

```javascript
// 用户在协会中的角色
const CLUB_ROLES = {
  PRESIDENT: 'president',           // 会长
  VICE_PRESIDENT: 'vice_president', // 副会长
  DIRECTOR: 'director',             // 理事
  MEMBER: 'member'                  // 会员
};

// 判断是否为管理员
function isClubManager(role) {
  return [
    CLUB_ROLES.PRESIDENT,
    CLUB_ROLES.VICE_PRESIDENT,
    CLUB_ROLES.DIRECTOR
  ].includes(role);
}
```

### 3. 显示区域状态

```javascript
// 不同显示区域的过滤规则
const DISPLAY_FILTERS = {
  HOME: {
    clubs: (club) => !club.is_deleted,
    events: (event) => !event.is_cancelled
  },
  PROFILE_MY_CLUBS: {
    clubs: (club) => true // 显示所有，包括已删除
  },
  PROFILE_MY_EVENTS: {
    events: (event) => true // 显示所有，包括已取消、已删除协会的活动
  },
  EVENT_CREATE: {
    clubs: (club) => !club.is_deleted // 只显示未删除的协会
  },
  SUPER_ADMIN: {
    clubs: (club) => true // 显示所有，包括已删除
  }
};
```

## Error Handling

### 1. 前端错误处理

```javascript
// 统一错误提示函数
function showError(message, duration = 2000) {
  wx.showToast({
    title: message,
    icon: 'none',
    duration
  });
}

// API调用错误处理
async function apiCall(url, options = {}) {
  try {
    const res = await request({ url, ...options });
    
    if (res.Flag == '4000') {
      return res.data;
    } else {
      showError(res.message || '操作失败');
      throw new Error(res.message || '操作失败');
    }
  } catch (error) {
    if (error.message) {
      showError(error.message);
    } else {
      showError('网络错误，请重试');
    }
    throw error;
  }
}
```

### 2. 后端错误处理

```python
# 统一错误响应格式
def error_response(message, flag='4001'):
    return jsonify({
        'Flag': flag,
        'message': message
    }), 200

# 事务错误处理
try:
    # 数据库操作
    db.session.commit()
except Exception as e:
    db.session.rollback()
    return error_response(f'操作失败: {str(e)}')
```

## Performance Considerations

### 1. 前端性能优化

- 使用虚拟列表渲染大量数据
- 图片懒加载和缩略图
- 缓存已加载的数据
- 防抖和节流处理频繁操作

### 2. 后端性能优化

- 使用数据库索引（clubID, eventID, userID）
- 避免N+1查询问题
- 分页查询减少数据量
- 缓存常用数据（如用户角色）

## Security Considerations

### 1. 前端安全

- 所有用户输入进行验证
- 敏感操作二次确认
- 防止XSS攻击（转义用户输入）

### 2. 后端安全

- 所有API进行权限检查
- 后端验证作为最后防线
- 使用数据库事务保证一致性
- 防止SQL注入（使用ORM）
- 防止并发冲突（数据库约束）

## Testing Strategy

### 1. 单元测试

- 前端：测试状态判断函数、过滤函数
- 后端：测试API验证逻辑、级联删除逻辑

### 2. 集成测试

- 测试完整的操作流程
- 测试边界情况
- 测试并发操作

### 3. 用户测试

- 测试不同角色的用户体验
- 测试不同场景的显示逻辑
- 测试错误提示的友好性

## Migration Plan

### 1. 数据库迁移

无需数据库迁移，所有必要字段已存在：
- Club.isDelete
- Event.is_cancelled
- ClubMember.isDelete
- ClubMember.role

### 2. 代码部署顺序

1. 部署后端API改动（向后兼容）
2. 部署前端代码
3. 验证功能正常
4. 监控错误日志

### 3. 回滚计划

- 后端改动向后兼容，可直接回滚
- 前端改动独立，可单独回滚
- 保留旧版本代码备份

## Summary

本设计文档详细说明了协会和活动显示权限重构的技术实现方案。核心设计原则是：

1. **最小改动**: 只修改3个核心后端API，其他功能通过前端实现
2. **职责清晰**: 前端负责显示和用户体验，后端负责安全和数据一致性
3. **向后兼容**: 所有改动不影响现有功能
4. **易于维护**: 代码结构清晰，逻辑简单

预计总代码量：
- 后端：约150-200行
- 前端：约500-800行（包括UI和交互）

开发时间估算：
- 后端开发：1-2天
- 前端开发：3-4天
- 测试和调试：2-3天
- 总计：6-9天

