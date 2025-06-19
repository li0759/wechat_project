from flask import Blueprint, jsonify, request, current_app
import os
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..models import Event, User, ClubMember, EventJoin, Club, Schedule
from .. import db, TEST_MODE
from datetime import datetime, timedelta
from sqlalchemy import and_
from zoneinfo import ZoneInfo
bp = Blueprint('event', __name__, url_prefix='/api/v1/event')

# 获取活动列表
@bp.route('/list/<string:show>', methods=['GET'])
@jwt_required()
def get_eventlist(show):
    # 新增参数处理
    mode = request.args.get('mode', 'page')
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    page = request.args.get('page', default=1, type=int)

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()
    print(get_jwt_identity())
    # 获取基础数据，过滤掉已取消的活动
    base_query = Event.query.filter(Event.is_cancelled == False)
    eventlist = base_query.all()
    
    # Show参数过滤
    if show == 'going':
        eventlist = [e for e in eventlist if e.actual_endTime is None]
    elif show == 'ended':
        eventlist = [e for e in eventlist if e.actual_endTime is not None]
    elif show != 'all':
        return jsonify({'Flag':'4001','message': '参数错误，show只能是going/ended/all'}), 200

    # 时间过滤逻辑
    if mode == 'month':
        if not year or not month:
            return jsonify({'Flag':'4001','message': '需要year和month参数'}), 200
        try:
            start_date = datetime(year, month, 1)
            end_date = datetime(year, month+1, 1) if month < 12 else datetime(year+1, 1, 1)
            eventlist = [e for e in eventlist if start_date <= (e.actual_startTime if e.actual_startTime else e.pre_startTime) < end_date]
        except ValueError as e:
            return jsonify({'Flag':'4001','message': f'日期参数错误：{str(e)}'}), 200

    # 保持原有排序逻辑
    eventlist = sorted(
        eventlist,
        key=lambda x: (x.actual_endTime is None, x.actual_startTime if x.actual_startTime else x.pre_startTime),
        reverse=True
    )

    # 分页处理
    if mode == 'page':
        PAGE_SIZE = 10
        total_records = len(eventlist)
        total_pages = (total_records + PAGE_SIZE - 1) // PAGE_SIZE
        
        start_index = (page - 1) * PAGE_SIZE
        end_index = start_index + PAGE_SIZE
        paged_events = eventlist[start_index:end_index]

        return jsonify({
            'Flag':'4000',
            'message': '调用成功',
            'data':{
                'records': [{  # 保持原有字段结构
                    'event_id': event.eventID,
                    'club_id': event.club.clubID,
                    'club_name': event.club.clubName,
                    'title': event.title,
                    'content': event.message,
                    'location': event.location,
                    'join_count': len(event.eventjoins),
                    'process_images': event.process_images,		
                    'pre_startTime': event.pre_startTime.isoformat(),
                    'pre_endTime': event.pre_endTime.isoformat(),
                    'actual_startTime': event.actual_startTime.isoformat() if isinstance(event.actual_startTime, datetime) else event.actual_startTime,
                    'actual_endTime': event.actual_endTime.isoformat() if isinstance(event.actual_endTime, datetime) else event.actual_endTime,
                    'author_id': event.authorID,
                    'created_at': event.createDate.isoformat(),
                    'cur_user_is_joined': any(eventjoin.userID == cur_user.userID for eventjoin in event.eventjoins),
                    'cur_user_managed': event.club.leader.userID == cur_user.userID,
                    'cur_user_can_join': (
                        any(m.clubID == event.clubID for m in cur_user.clubmembers) and 
                        not any(eventjoin.userID == cur_user.userID for eventjoin in event.eventjoins)
                    ),
                    'is_ended': event.actual_endTime is not None,
                    'is_cancelled': event.is_cancelled
                } for event in paged_events],
                'pagination': {  # 新增分页字段
                    'total_pages': total_pages,
                    'current_page': page,
                    'page_size': PAGE_SIZE,
                    'total_records': total_records
                }
            }
        })
    else:  # 非分页模式保持原结构
        return jsonify({
            'Flag':'4000',
            'message': '调用成功',
            'data':[{  # 完全保持原有字段
                'event_id': event.eventID,
                'club_id': event.club.clubID,
                'club_name': event.club.clubName,
                'title': event.title,
                'content': event.message,
                'location': event.location,
                'join_count': len(event.eventjoins),
                'process_images': event.process_images,		
                'pre_startTime': event.pre_startTime.isoformat(),
                'pre_endTime': event.pre_endTime.isoformat(),
                'actual_startTime': event.actual_startTime.isoformat() if isinstance(event.actual_startTime, datetime) else event.actual_startTime,
                'actual_endTime': event.actual_endTime.isoformat() if isinstance(event.actual_endTime, datetime) else event.actual_endTime,
                'author_id': event.authorID,
                'created_at': event.createDate.isoformat(),
                'cur_user_is_joined': any(eventjoin.userID == cur_user.userID for eventjoin in event.eventjoins),
                'cur_user_managed': event.club.leader.userID == cur_user.userID,
                'cur_user_can_join': (
                    any(m.clubID == event.clubID for m in cur_user.clubmembers) and 
                    not any(eventjoin.userID == cur_user.userID for eventjoin in event.eventjoins)
                ),
                'is_ended': event.actual_endTime is not None,
                'is_cancelled': event.is_cancelled
            } for event in eventlist]}
        )

 
# 创建活动
@bp.route('/create', methods=['PUT'])
@jwt_required()
def create_event():
    data = request.get_json()
    clubID = data.get('club_id')
    title = data.get('title')
    content = data.get('content')
    location = data.get('location')
    pre_startTime = data.get('pre_startTime')
    pre_endTime = data.get('pre_endTime')
    process_images = data.get('process_images')
    budget = data.get('budget')
    # 新增位置数据处理
    location_data = data.get('location_data')
    
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    club = Club.query.filter_by(clubID=clubID).first()

    if club.leader.userID != cur_user.userID and cur_user.isSuperUser == False:
        return jsonify({'Flag':'4002','message': '您没有权限创建该社团活动'}), 200

    event = Event(
        clubID=clubID, 
        title=title,
        message=content, 
        location=location, 
        pre_startTime=datetime.fromisoformat(pre_startTime), 
        pre_endTime=datetime.fromisoformat(pre_endTime), 
        authorID=cur_user.userID,
        process_images = process_images,
		budget = budget
        )    
        
    # 如果提供了位置数据，保存到Event中
    if location_data:
        event.location_latitude = location_data.get('latitude')
        event.location_longitude = location_data.get('longitude')
        event.location_name = location_data.get('name')
        event.location_address = location_data.get('address')
        
    db.session.add(event)
    db.session.flush()
    db.session.commit()
    return jsonify({
		'Flag':'4000',
		'message': '创建活动成功',
        'data':{
		'clubID':event.club.clubID,
        'clubName':event.club.clubName,
		'eventID':event.eventID,
		'authorID':event.authorID,
		'title':event.title
        }
	})
	
# 活动开始
@bp.route('/<int:event_id>/begin', methods=['GET'])
@jwt_required()
def event_begin(event_id):
    event = Event.query.filter_by(eventID=event_id).first()
    if event is None:
        return jsonify({'Flag':'4004','message': '活动不存在'}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    if event.club.leader.userID != cur_user.userID and cur_user.isSuperUser == False:
        return jsonify({'Flag':'4002','message': '您没有权限修改该社团活动'}), 200

    event.actual_startTime = datetime.now(ZoneInfo('Asia/Shanghai'))
    db.session.commit()
    return jsonify({
        'Flag':'4000',
        'message': '活动开始',
        'data':{
		'clubID':event.club.clubID,
        'clubName':event.club.clubName,
		'eventID':event.eventID,
		'authorID':event.authorID,
		'title':event.title
        }
    })
	

# 同时修改预计开始时间和预计结束时间
@bp.route('/<int:event_id>/update_pre_schedule', methods=['POST'])
@jwt_required()
def update_pre_schedule(event_id):
    data = request.get_json()
    print(data)
    pre_startTime = data.get('pre_startTime')
    pre_endTime = data.get('pre_endTime')

    event = Event.query.filter_by(eventID=event_id).first()
    if event is None:
        return jsonify({'Flag':'4004','message': '活动不存在'}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    if event.club.leader.userID != cur_user.userID and cur_user.isSuperUser == False:
        return jsonify({'Flag':'4002','message': '您没有权限修改该社团活动'}), 200

    # 同时更新预计开始时间和预计结束时间
    if pre_startTime:
        event.pre_startTime = datetime.fromisoformat(pre_startTime)
    if pre_endTime:
        event.pre_endTime = datetime.fromisoformat(pre_endTime)
    
    db.session.commit()
    return jsonify({
        'Flag':'4000',
        'message': '修改活动时间成功',
        'data':{
            'clubID':event.club.clubID,
            'clubName':event.club.clubName,
            'eventID':event.eventID,
            'authorID':event.authorID,
            'title':event.title,
            'pre_startTime': event.pre_startTime.isoformat(),
            'pre_endTime': event.pre_endTime.isoformat()
        }
    })

# 活动结束
@bp.route('/<int:event_id>/end', methods=['GET'])
@jwt_required()
def event_end(event_id):
    event = Event.query.filter_by(eventID=event_id).first()
    if event is None:
        return jsonify({'Flag':'4004','message': '活动不存在'}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    if event.club.leader.userID != cur_user.userID and cur_user.isSuperUser == False:
        return jsonify({'Flag':'4002','message': '您没有权限修改该社团活动'}), 200

    event.actual_endTime = datetime.now(ZoneInfo('Asia/Shanghai'))
    db.session.commit()
    return jsonify({
        'Flag':'4000',
        'message': '活动结束',
        'data':{
		'clubID':event.club.clubID,
        'clubName':event.club.clubName,
		'eventID':event.eventID,
		'authorID':event.authorID,
		'title':event.title
        }
    })
	
	
# 修改活动实际费用
@bp.route('/<int:event_id>/update_real_cost', methods=['POST'])
@jwt_required()
def update_real_cost(event_id):
    data = request.get_json()
    real_cost = data.get('real_cost')

    event = Event.query.filter_by(eventID=event_id).first()

    if event is None:
        return jsonify({'Flag':'4004','message': '活动不存在'}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()
        
    member = ClubMember.query.filter_by(clubID=event.clubID, userID=cur_user.userID, role='admin').first()

    if member is None and cur_user.isSuperUser == False:
        return jsonify({'Flag':'4002','message': '您没有权限修改该社团活动'}), 200

    event.real_cost = real_cost
    db.session.commit()
    return jsonify({'Flag':'4000','message': '修改活动实际费用成功'})
	
@bp.route('/<int:event_id>/update_location', methods=['POST'])
@jwt_required()
def update_location(event_id):
    data = request.get_json()
    location = data.get('location')
    location_data = data.get('location_data')  # 新增位置数据参数

    event = Event.query.filter_by(eventID=event_id).first()
    if event is None:
        return jsonify({'Flag':'4004','message': '活动不存在'}), 200

    # 权限验证
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()
        
    member = ClubMember.query.filter_by(clubID=event.clubID, userID=cur_user.userID, role='admin').first()
    if member is None and cur_user.isSuperUser == False:
        return jsonify({'Flag':'4002','message': '您没有权限修改该活动'}), 200

    # 更新基础位置信息
    if location:
        event.location = location
        
    # 更新详细位置数据
    if location_data:
        event.location_latitude = location_data.get('latitude')
        event.location_longitude = location_data.get('longitude')
        event.location_name = location_data.get('name')
        event.location_address = location_data.get('address')

    db.session.commit()
    return jsonify({'Flag':'4000','message': '更新活动位置成功'})

@bp.route('/<int:event_id>/update_content', methods=['POST'])
@jwt_required()
def update_message(event_id):
    data = request.get_json()
    title = data.get('title')
    content = data.get('content')

    if not title or not content:
        return jsonify({'Flag':'4001','message': '标题和内容不能为空'}), 200

    event = Event.query.filter_by(eventID=event_id).first()
    if event is None:
        return jsonify({'Flag':'4004','message': '活动不存在'}), 200

    # 权限验证
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()
        
    member = ClubMember.query.filter_by(clubID=event.clubID, userID=cur_user.userID, role='admin').first()
    if member is None and cur_user.isSuperUser == False:
        return jsonify({'Flag':'4002','message': '您没有权限修改该活动'}), 200

    # 更新信息
    event.title = title
    event.message = content
    db.session.commit()
    
    return jsonify({'Flag':'4000','message': '更新活动信息成功'})

# 更新活动过程图片
@bp.route('/<int:event_id>/update_process_images', methods=['POST'])
@jwt_required()
def process_images(event_id):
    data = request.get_json()
    process_images = data.get('process_images')
   
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    event = Event.query.filter_by(eventID=event_id).first()
    if event is None:
        return jsonify({'Flag':'4004','message': '活动不存在'}), 200
    
    # 处理原始图片列表，避免空值问题
    ori_process_images = event.process_images.split(';') if event.process_images else []
    new_process_images = process_images.split(';') if process_images else []
    diff = set(ori_process_images) - set(new_process_images)
    
    upload_folder = current_app.config['UPLOAD_FOLDER']
    for delete_pic in diff:
        if delete_pic:  # 确保不是空字符串
            file_path = os.path.join(upload_folder, delete_pic.split('/').pop())
            if os.path.exists(file_path):
                os.remove(file_path)
                print(file_path)

    event.process_images = process_images
    db.session.commit()
    return jsonify({
		'Flag':'4000',
		'message': '更新活动过程图片成功',
	})


# 活动打卡
@bp.route('/clockin/<int:event_id>', methods=['GET'])
@jwt_required()
def clockin(event_id):
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    event = Event.query.filter_by(eventID=event_id).first()
    if event is None:
        return jsonify({'Flag':'4004','message': '活动不存在'}), 200

    # 查找用户在该活动的参与记录
    event_join = EventJoin.query.filter_by(
        eventID=event_id, 
        userID=cur_user.userID
    ).first()

    if not event_join:
        return jsonify({'Flag':'4003','message': '您未参加该活动'}), 200

    # 更新打卡时间
    event_join.clockinDate = datetime.now(ZoneInfo('Asia/Shanghai'))
    db.session.commit()
    
    return jsonify({
        'Flag':'4000',
        'message': '活动打卡成功',
    })


# 删除活动
@bp.route('/<int:event_id>/delete', methods=['POST'])
@jwt_required()
def delete_event(event_id):
    event = Event.query.filter_by(eventID=event_id).first()

    if event is None:
        return jsonify({'Flag':'4004','message': '活动不存在'}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()
    member = ClubMember.query.filter_by(clubID=event.clubID, userID=cur_user.userID, role='admin').first()
    if member is None and cur_user.isSuperUser == False:
        return jsonify({'Flag':'4002','message': '您没有权限删除该社团活动'}), 200
    event.isDelete = True
    db.session.commit()
    return jsonify({'Flag':'4000','message': '删除活动成功'})

# 获取单个活动详情
@bp.route('/<int:event_id>', methods=['GET'])
@jwt_required()
def get_event(event_id):	
    event = Event.query.filter_by(eventID=event_id).first()
    if event is None:
        return jsonify({'Flag':'4004','message': '活动不存在'}), 200
    
    # 如果活动已取消且用户没有管理权限，则不允许查看
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()
    if event.is_cancelled and event.club.leader.userID != cur_user.userID and cur_user.isSuperUser == False:
        return jsonify({'Flag':'4004','message': '活动已取消'}), 200
		
    # 通过关系属性获取用户参与记录
    user_join = next((ej for ej in cur_user.eventjoins if ej.eventID == event_id), None)

    cur_user_in_club = any(m.clubID == event.clubID for m in cur_user.clubmembers)
    cur_user_can_join = (
        cur_user_in_club and 
        not (user_join is not None) and
        event.actual_endTime is None and
        not event.is_cancelled  # 已取消的活动不能加入
    )   
    # 准备位置数据
    location_data = None
    if hasattr(event, 'location_latitude') and hasattr(event, 'location_longitude') and event.location_latitude and event.location_longitude:
        location_data = {
            'name': event.location_name,
            'address': event.location_address,
            'latitude': event.location_latitude,
            'longitude': event.location_longitude
        }
    
    # 准备日程相关数据
    schedule_info = None
    can_create_schedule = False
    can_subscribe_schedule = False
    cur_user_joined_schedule = False  # 添加默认值

    if event.scheduleID:
        # 活动关联了日程，获取日程信息
        schedule = event.schedule
        if schedule and schedule.endTime is None:
            # 日程存在且未结束
            schedule_info = {
                'schedule_id': schedule.scheduleID,
                'startTime': schedule.startTime.isoformat(),
                'join_count': len(schedule.scheduleJoins)
            }
            # 检查当前用户是否能订阅该日程
            user_already_joined = any(sj.userID == cur_user.userID for sj in schedule.scheduleJoins)
            can_subscribe_schedule = not user_already_joined and cur_user_in_club
            cur_user_joined_schedule = user_already_joined  # 确保赋值
        else:
            # 日程不存在或已结束，可以基于该活动创建新日程
            can_create_schedule = True
    else:
        # 活动未关联日程，检查是否能基于该活动创建日程
        # 条件：scheduleID为空
        can_create_schedule = True
    
    return jsonify({
        'Flag':'4000',
        'message': '调用成功',
        'data':{
            'event_id': event.eventID,
            'club_name':event.club.clubName,
            'club_id': event.clubID,
            'title': event.title,
            'content': event.message,
            'location': event.location,
            'location_data': location_data,  # 新增位置数据字段
            'pre_startTime': event.pre_startTime.isoformat(),
            'pre_endTime': event.pre_endTime.isoformat(),
            'actual_startTime': event.actual_startTime.isoformat() if isinstance(event.actual_startTime, datetime) else event.actual_startTime,
            'actual_endTime': event.actual_endTime.isoformat() if isinstance(event.actual_endTime, datetime) else event.actual_endTime,
            'author_id': event.authorID,
            'created_at': event.createDate.isoformat(),
            'process_images':event.process_images,	
            'real_cost':event.real_cost,
            'budget':event.budget,
            'approveDate':event.approveDate,
            'join_count': len(event.eventjoins),
            'cur_user_is_joined': user_join is not None,  # 优化后的加入状态判断
            'cur_user_managed': event.club.leader.userID is cur_user.userID,
            'cur_user_clockin_date': user_join.clockinDate.isoformat() if user_join and isinstance(user_join.clockinDate, datetime) else (user_join.clockinDate if user_join else None),
            'cur_user_can_join': cur_user_can_join,
            'is_cancelled': event.is_cancelled,  # 新增取消状态
            # 新增日程相关字段
            'schedule_info': schedule_info,
            'can_create_schedule': can_create_schedule,
            'can_subscribe_schedule': can_subscribe_schedule,
            'cur_user_joined_schedule': cur_user_joined_schedule
        }})

# 获取指定活动的参加人员列表
@bp.route('/<int:event_id>/members', methods=['GET'])
def get_event_members(event_id):
    event = Event.query.filter_by(eventID=event_id).first()
    if event is None:
        return jsonify({'Flag':'4004','message': '活动不存在'}), 200

    EventJoins = EventJoin.query.filter_by(eventID=event_id).all()

    return jsonify({
        'Flag':'4000',
        'message': '调用成功',
        'data':[{
            'user_id': eventjoin.user.userID,
            'user_name':eventjoin.user.userName,
			'avatar':eventjoin.user.avatar,
			'clockinDate':eventjoin.clockinDate
        }for eventjoin in EventJoins]})

# 加入活动
@bp.route('/<int:event_id>/join', methods=['GET'])
@jwt_required()
def join_event(event_id):
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    event = Event.query.filter_by(eventID=event_id).first()
    if event is None:
        return jsonify({'Flag':'4004','message': '活动不存在'}), 200

    if event.is_cancelled:
        return jsonify({'Flag':'4003','message': '活动已取消，无法加入'}), 200

    if any(eventjoin.eventID == event_id for eventjoin in cur_user.eventjoins):
        return jsonify({'Flag':'4003','message': '您已参加该活动'}), 200

    if not any(m.clubID == event.clubID for m in cur_user.clubmembers):
        return jsonify({'Flag':'4002','message': '您不是该社团成员，无法参加该活动'}), 200

    if any(m.clubID == event.clubID and m.role == 'admin' for m in cur_user.clubmembers):
        return jsonify({'Flag':'4002','message':'社团管理员不能参加自己管理的活动'}), 200

    join = EventJoin(eventID=event_id, userID=cur_user.userID)
    db.session.add(join)
    db.session.commit()
    return jsonify({'Flag':'4000','message': '加入活动成功'})

# 退出活动
@bp.route('/<int:event_id>/quit', methods=['GET'])
@jwt_required()
def quit_event(event_id):
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    event = Event.query.filter_by(eventID=event_id).first()
    if event is None:
        return jsonify({'Flag':'4004','message': '活动不存在'}), 200

  # 通过关系属性查找具体的join记录
    join_record = next((ej for ej in cur_user.eventjoins if ej.eventID == event_id), None)   
    if not join_record:
        return jsonify({'Flag':'4003','message': '您未参加该活动'}), 200


    db.session.delete(join_record)
    db.session.commit()
    return jsonify({'Flag':'4000','message': '退出活动成功'})





# 合并后的统一接口 - user_joined 可以看到已取消的活动
@bp.route('/user_joined/list/<string:show>', methods=['GET'])
@jwt_required()
def get_user_joined_eventlist(show):
    # 参数处理
    mode = request.args.get('mode', 'page')
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    page = request.args.get('page', default=1, type=int)

    # 获取当前用户
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 获取用户的社团成员关系
    memberShips = cur_user.eventjoins
    joined_events = []

    # Count模式处理
    if mode == 'count':
        for event_join in memberShips:
            if event_join.event is not None:
                joined_events.append(event_join.event)
        
        going_count = len([e for e in joined_events if e.actual_endTime is None])
        ended_count = len([e for e in joined_events if e.actual_endTime is not None])
        
        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data': {
                'going_count': going_count,
                'ended_count': ended_count,
                'total_count': len(joined_events)
            } if show == 'all' else {
                'count': going_count if show == 'going' else ended_count
            }
        })

    # 时间过滤逻辑
    time_filter = None
    if mode == 'month':
        if not year or not month:
            return jsonify({'Flag':'4001','message': '需要year和month参数'}), 200
        try:
            start_date = datetime(year, month, 1)
            end_date = datetime(year, month+1, 1) if month < 12 else datetime(year+1, 1, 1)
            time_filter = (start_date, end_date)
        except ValueError as e:
            return jsonify({'Flag':'4001','message': f'日期参数错误：{str(e)}'}), 200

    # 活动过滤逻辑
    for event_join in memberShips:
        if event_join.event is not None:
            event = event_join.event
            
            # 时间过滤
            if time_filter:
                event_time = event.actual_startTime if event.actual_startTime else event.pre_startTime
                if not (time_filter[0] <= event_time < time_filter[1]):
                    continue
                    
            joined_events.append(event)

    # Show参数过滤
    if show == 'going':
        filtered_events = [e for e in joined_events if e.actual_endTime is None]
    elif show == 'ended':
        filtered_events = [e for e in joined_events if e.actual_endTime is not None]
    elif show == 'all':
        filtered_events = joined_events
    else:
        return jsonify({'Flag':'4001','message': '参数错误，show只能是going/ended/all'}), 200

    # 排序逻辑
    filtered_events = sorted(
        filtered_events,
        key=lambda x: (x.actual_endTime is None, 
                      x.actual_startTime if x.actual_startTime else x.pre_startTime),
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
                    'club_id': e.club.clubID,
                    'club_name': e.club.clubName,
                    'location': e.location,
                    'process_images': e.process_images,
                    'pre_startTime': e.pre_startTime.isoformat(),
                    'pre_endTime': e.pre_endTime.isoformat(),
                    'actual_startTime': e.actual_startTime.isoformat() if e.actual_startTime else None,
                    'actual_endTime': e.actual_endTime.isoformat() if e.actual_endTime else None,
                    'clockin_date': next((ej.clockinDate for ej in e.eventjoins if ej.userID == cur_user.userID), None),
                    'is_ended': e.actual_endTime is not None,
                    'is_canceled': e.is_cancelled
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
                'club_id': e.club.clubID,
                'club_name': e.club.clubName,
                'location': e.location,
                'process_images': e.process_images,
                'pre_startTime': e.pre_startTime.isoformat(),
                'pre_endTime': e.pre_endTime.isoformat(),
                'actual_startTime': e.actual_startTime.isoformat() if e.actual_startTime else None,
                'actual_endTime': e.actual_endTime.isoformat() if e.actual_endTime else None,
                'clockin_date': next((ej.clockinDate for ej in e.eventjoins if ej.userID == cur_user.userID), None),
                'is_ended': e.actual_endTime is not None,
                'is_canceled': e.is_cancelled
            } for e in filtered_events]
        })

# 统一用户可参加活动接口 - 过滤掉已取消的活动
@bp.route('/user_can_join/list/<string:show>', methods=['GET'])
@jwt_required()
def get_user_can_join_eventlist(show):
    mode = request.args.get('mode', 'page')
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    page = request.args.get('page', default=1, type=int)

    # 用户验证
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    memberShips = cur_user.clubmembers
    clubs_events = []

    # Count模式处理
    if mode == 'count':
        for memberShip in memberShips:
            club = memberShip.club_as_member
            if club and club.events:
                club_events = [event for event in club.events 
                             if not event.is_cancelled and not any(ej.userID == cur_user.userID for ej in event.eventjoins)]
                clubs_events.extend(club_events)
        
        going_count = len([e for e in clubs_events if e.actual_endTime is None])
        ended_count = len([e for e in clubs_events if e.actual_endTime is not None])
        
        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data': {
                'going_count': going_count,
                'ended_count': ended_count,
                'total_count': len(clubs_events)
            } if show == 'all' else {
                'count': going_count if show == 'going' else ended_count
            }
        })

    # 时间过滤逻辑
    time_filter = None
    if mode == 'month':
        if not year or not month:
            return jsonify({'Flag':'4001','message': '需要year和month参数'}), 200
        try:
            start_date = datetime(year, month, 1)
            end_date = datetime(year, month+1, 1) if month < 12 else datetime(year+1, 1, 1)
            eventlist = [e for e in eventlist if start_date <= (e.actual_startTime if e.actual_startTime else e.pre_startTime) < end_date]
        except ValueError as e:
            return jsonify({'Flag':'4001','message': f'日期参数错误：{str(e)}'}), 200

    # 活动过滤逻辑
    for memberShip in memberShips:
        club = memberShip.club_as_member
        if club and club.events:
            club_events = [
                event for event in club.events 
                if not event.is_cancelled and not any(ej.userID == cur_user.userID for ej in event.eventjoins)
            ]
            
            if time_filter:
                club_events = [e for e in club_events if time_filter[0] <= e.actual_startTime < time_filter[1]]
                
            clubs_events.extend(club_events)

    # Show参数过滤
    if show == 'going':
        filtered_events = [e for e in clubs_events if e.actual_endTime is None]
    elif show == 'ended':
        filtered_events = [e for e in clubs_events if e.actual_endTime is not None]
    elif show == 'all':
        filtered_events = clubs_events
    else:
        return jsonify({'Flag':'4001','message': '参数错误，show只能是going/ended/all'}), 200

    # 排序逻辑
    filtered_events = sorted(filtered_events, key=lambda x: (x.actual_endTime is None, x.actual_startTime if x.actual_startTime else x.pre_startTime), reverse=True)

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
                    'event_id': event.eventID,
                    'title': event.title,
                    'club_id': event.club.clubID,
                    'club_name': event.club.clubName,
                    'location': event.location,
                    'process_images': event.process_images,
                    'pre_startTime': event.pre_startTime.isoformat(),
                    'pre_endTime': event.pre_endTime.isoformat(),
                    'actual_startTime': event.actual_startTime.isoformat() if isinstance(event.actual_startTime, datetime) else event.actual_startTime,
                    'actual_endTime': event.actual_endTime.isoformat() if isinstance(event.actual_endTime, datetime) else event.actual_endTime,
                    'join_count': len(event.eventjoins),
                    'cur_user_can_join': True
                } for event in paged_events],
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
                'event_id': event.eventID,
                'title': event.title,
                'club_id': event.club.clubID,
                'club_name': event.club.clubName,
                'location': event.location,
                'pre_startTime': event.pre_startTime.isoformat(),
                'pre_endTime': event.pre_endTime.isoformat(),
                'actual_startTime': event.actual_startTime.isoformat() if isinstance(event.actual_startTime, datetime) else event.actual_startTime,
                'actual_endTime': event.actual_endTime.isoformat() if isinstance(event.actual_endTime, datetime) else event.actual_endTime,
                'join_count': len(event.eventjoins),
                'process_images': event.process_images
            } for event in filtered_events]
        })

# 统一用户管理活动接口 - user_manage 可以看到已取消的活动
@bp.route('/user_manage/list/<string:show>', methods=['GET'])
@jwt_required()
def get_user_manage_eventlist(show):
    mode = request.args.get('mode', 'page')
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    page = request.args.get('page', default=1, type=int)

    # 用户验证
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 获取管理中的活动
    managed_events = []
    for memberShip in cur_user.clubmembers:
        if memberShip.role == 'admin':
            club = memberShip.club_as_leader
            if club and club.events:
                managed_events.extend(club.events)

    # Count模式处理
    if mode == 'count':
        going_count = len([e for e in managed_events if e.actual_endTime is None])
        ended_count = len([e for e in managed_events if e.actual_endTime is not None])
        
        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data': {
                'going_count': going_count,
                'ended_count': ended_count,
                'total_count': len(managed_events)
            } if show == 'all' else {
                'count': going_count if show == 'going' else ended_count
            }
        })

    # 时间过滤
    time_filter = None
    if mode == 'month':
        if not year or not month:
            return jsonify({'Flag':'4001','message': '需要year和month参数'}), 200
        try:
            start_date = datetime(year, month, 1)
            end_date = datetime(year, month+1, 1) if month < 12 else datetime(year+1, 1, 1)
            time_filter = (start_date, end_date)
            managed_events = [e for e in managed_events if time_filter[0] <= e.actual_startTime < time_filter[1]]
        except ValueError as e:
            return jsonify({'Flag':'4001','message': f'日期参数错误：{str(e)}'}), 200

    # Show参数过滤
    if show == 'going':
        filtered_events = [e for e in managed_events if e.actual_endTime is None]
    elif show == 'ended':
        filtered_events = [e for e in managed_events if e.actual_endTime is not None]
    elif show == 'all':
        filtered_events = managed_events
    else:
        return jsonify({'Flag':'4001','message': '参数错误'}), 200

    # 排序逻辑
    filtered_events = sorted(
        filtered_events,
        key=lambda x: (x.actual_endTime is None, 
                      x.actual_startTime if x.actual_startTime else x.pre_startTime),
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
                    'event_id': event.eventID,
                    'title': event.title,
                    'club_id': event.club.clubID,
                    'club_name': event.club.clubName,
                    'pre_startTime': event.pre_startTime.isoformat(),
                    'pre_endTime': event.pre_endTime.isoformat(),
                    'actual_startTime': event.actual_startTime.isoformat() if isinstance(event.actual_startTime, datetime) else event.actual_startTime,
                    'actual_endTime': event.actual_endTime.isoformat() if isinstance(event.actual_endTime, datetime) else event.actual_endTime,
                    'join_count': len(event.eventjoins),
                    'real_cost': event.real_cost,
                    'budget': event.budget,
                    'process_images': event.process_images,
                    'is_cancelled': event.is_cancelled  # 显示取消状态
                } for event in paged_events],
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
                'event_id': event.eventID,
                'title': event.title,
                'club_name': event.club.clubName,
                'pre_startTime': event.pre_startTime.isoformat(),
                'pre_endTime': event.pre_endTime.isoformat(),
                'actual_startTime': event.actual_startTime.isoformat() if isinstance(event.actual_startTime, datetime) else event.actual_startTime,
                'actual_endTime': event.actual_endTime.isoformat() if isinstance(event.actual_endTime, datetime) else event.actual_endTime,
                'clockin_count': sum(1 for ej in event.eventjoins if ej.clockinDate is not None),
                'real_cost': event.real_cost,
                'budget': event.budget,
                'is_cancelled': event.is_cancelled  # 显示取消状态
            } for event in filtered_events]
        })

# 统一社团公开活动接口 - 过滤掉已取消的活动
@bp.route('/club_public/<int:club_id>/list/<string:show>', methods=['GET'])
@jwt_required()
def get_club_public_eventlist(club_id, show):
    mode = request.args.get('mode', 'page')
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    page = request.args.get('page', default=1, type=int)

    # 用户验证
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    club = Club.query.filter_by(clubID=club_id).first()
    if not club:
        return jsonify({'Flag':'4004','message': '社团不存在'}), 200

    # 权限检查
    is_managed = club.leader.userID == cur_user.userID if club.leader else False
    is_member = any(m.clubID == club_id for m in cur_user.clubmembers)

    # 过滤掉已取消的活动
    club_events = [e for e in club.events if not e.is_cancelled]

    # Count模式处理
    if mode == 'count':
        going_count = len([e for e in club_events if e.actual_endTime is None])
        ended_count = len([e for e in club_events if e.actual_endTime is not None])
        
        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data': {
                'going_count': going_count,
                'ended_count': ended_count,
                'total_count': len(club_events)
            } if show == 'all' else {
                'count': going_count if show == 'going' else ended_count
            }
        })

    # 时间过滤
    time_filter = None
    if mode == 'month':
        if not year or not month:
            return jsonify({'Flag':'4001','message': '需要year和month参数'}), 200
        try:
            start_date = datetime(year, month, 1)
            end_date = datetime(year, month+1, 1) if month < 12 else datetime(year+1, 1, 1)
            time_filter = (start_date, end_date)
            filtered_events = [e for e in club_events if time_filter[0] <= e.actual_startTime < time_filter[1]]
        except ValueError as e:
            return jsonify({'Flag':'4001','message': f'日期参数错误：{str(e)}'}), 200
    else:
        filtered_events = club_events

    # Show参数过滤
    if show == 'going':
        filtered_events = [e for e in filtered_events if e.actual_endTime is None]
    elif show == 'ended':
        filtered_events = [e for e in filtered_events if e.actual_endTime is not None]
    elif show != 'all':
        return jsonify({'Flag':'4001','message': '参数错误'}), 200

    # 排序逻辑
    filtered_events = sorted(
        filtered_events,
        key=lambda x: (x.actual_endTime is None, 
                      x.actual_startTime if x.actual_startTime else x.pre_startTime),
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
                    'event_id': event.eventID,
                    'title': event.title,
                    'content': event.message,
                    'location': event.location,
                    'pre_startTime': event.pre_startTime.isoformat(),
                    'pre_endTime': event.pre_endTime.isoformat(),
                    'actual_startTime': event.actual_startTime.isoformat() if isinstance(event.actual_startTime, datetime) else event.actual_startTime,
                    'actual_endTime': event.actual_endTime.isoformat() if isinstance(event.actual_endTime, datetime) else event.actual_endTime,
                    'process_images': event.process_images,
                    'real_cost': event.real_cost,
                    'budget': event.budget,
                    'cur_user_managed': is_managed,
                    'cur_user_can_join': is_member and not is_managed and not any(ej.userID == cur_user.userID for ej in event.eventjoins)
                } for event in paged_events],
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
                'event_id': event.eventID,
                'title': event.title,
                'club_name': club.clubName,
                'pre_startTime': event.pre_startTime.isoformat(),
                'pre_endTime': event.pre_endTime.isoformat(),
                'actual_startTime': event.actual_startTime.isoformat() if isinstance(event.actual_startTime, datetime) else event.actual_startTime,
                'actual_endTime': event.actual_endTime.isoformat() if isinstance(event.actual_endTime, datetime) else event.actual_endTime,
                'join_count': len(event.eventjoins),
                'clockin_count': sum(1 for ej in event.eventjoins if ej.clockinDate is not None)
            } for event in filtered_events]
        })

# 新增热度活动接口 - 过滤掉已取消的活动
@bp.route('/heat/list', methods=['GET'])
@jwt_required()
def get_hot_events():
    # 获取当前用户
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 获取用户加入的所有社团ID
    joined_club_ids = [m.clubID for m in cur_user.clubmembers]

    # 查询这些社团的所有未结束且未取消的活动
    ongoing_events = Event.query.filter(
        Event.clubID.in_(joined_club_ids),
        Event.actual_endTime.is_(None),
        Event.is_cancelled == False
    ).all()

    # 按参与人数排序并取前5
    sorted_events = sorted(
        ongoing_events,
        key=lambda x: len(x.eventjoins),
        reverse=True
    )[:5]

    return jsonify({
        'Flag': '4000',
        'message': '获取成功',
        'data': [{
            'event_id': event.eventID,
            'title': event.title,
            'club_id': event.club.clubID,
            'club_name': event.club.clubName,
            'location': event.location,
            'location_data': {
                'latitude': event.location_latitude,
                'longitude': event.location_longitude,
                'name': event.location_name,
                'address': event.location_address
            },
            'description': event.message,
            'join_count': len(event.eventjoins),
            'pre_startTime': event.pre_startTime.isoformat(),
            'pre_endTime': event.pre_endTime.isoformat(),
            'actual_startTime': event.actual_startTime.isoformat() if isinstance(event.actual_startTime, datetime) else event.actual_startTime,
            'actual_endTime': event.actual_endTime.isoformat() if isinstance(event.actual_endTime, datetime) else event.actual_endTime,
            'process_images': event.process_images,
            # 新增用户状态字段
            'cur_user_managed': event.club.leader.userID == cur_user.userID,
            'cur_user_is_joined': any(eventjoin.userID == cur_user.userID for eventjoin in event.eventjoins),
            # 新增最新5位参加人员
            'latest_joins': [
                {
                    'user_id': ej.user.userID,
                    'user_name': ej.user.userName,
                    'avatar': ej.user.avatar,
                    'join_date': ej.joinDate.isoformat()
                } 
                for ej in sorted(event.eventjoins, key=lambda x: x.joinDate, reverse=True)[:5]
            ]
        } for event in sorted_events]
    })

# 新增取消活动接口
@bp.route('/<int:event_id>/cancel', methods=['POST'])
@jwt_required()
def cancel_event(event_id):
    event = Event.query.filter_by(eventID=event_id).first()
    if event is None:
        return jsonify({'Flag':'4004','message': '活动不存在'}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    if event.club.leader.userID != cur_user.userID and cur_user.isSuperUser == False:
        return jsonify({'Flag':'4002','message': '您没有权限取消该社团活动'}), 200

    event.is_cancelled = True
    db.session.commit()
    return jsonify({
        'Flag':'4000',
        'message': '活动取消成功',
        'data':{
            'clubID':event.club.clubID,
            'clubName':event.club.clubName,
            'eventID':event.eventID,
            'authorID':event.authorID,
            'title':event.title
        }
    })
 
