from flask import Blueprint, jsonify, request, current_app
import os
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..models import Event, User, ClubMember, EventJoin, Club, Schedule, File, Moment
from .. import db, TEST_MODE
from datetime import datetime, timedelta
from sqlalchemy import and_, or_, case
from zoneinfo import ZoneInfo
from collections import defaultdict
from app.permission import check_permission, event
from flask_sqlalchemy import Pagination  # 如果用的是 Flask-SQLAlchemy
from app.routes.file import delete_file_inside
from app.routes.message import send_wecom_message
import requests

bp = Blueprint('event', __name__, url_prefix='/api/v1/event')


def _user_active_join_for_event(cur_user, event_id):
    """当前用户在该活动下未软删除的参与记录。"""
    if not cur_user:
        return None
    return next(
        (
            ej
            for ej in cur_user.eventjoins
            if ej.eventID == event_id and not getattr(ej, 'isDelete', False)
        ),
        None,
    )


def _event_user_has_active_join(event, cur_user):
    """活动维度：当前用户是否仍在参与（未软删除）。"""
    if not cur_user or not event:
        return False
    return any(
        ej.userID == cur_user.userID and not getattr(ej, 'isDelete', False)
        for ej in event.eventjoins
    )


# 生成地图预览URL（用于创建活动时的预览）
@bp.route('/generate_map_url', methods=['POST'])
@jwt_required()
def generate_map_url():
    data = request.get_json()
    latitude = data.get('latitude')
    longitude = data.get('longitude')
    width = data.get('width', 600)
    height = data.get('height', 400)
    zoom = data.get('zoom', 14)
    
    if not latitude or not longitude:
        return jsonify({'Flag': '4001', 'message': '缺少经纬度参数'}), 200
    
    map_url = current_app.config['GEOAPIFY_MAP_URL'].format(
        width=width, 
        height=height, 
        longitude=longitude, 
        latitude=latitude, 
        zoom=zoom
    ) + f"&apiKey={current_app.config['GEOAPIFY_API_KEY']}"
    
    return jsonify({
        'Flag': '4000',
        'message': '生成成功',
        'data': {
            'map_url': map_url
        }
    })

# 获取活动列表 - 过滤掉协会已删除的活动
@bp.route('/list/<string:show>', methods=['GET'])
@jwt_required()
def get_eventlist(show):
    # 权限检查
    has_permission, message = check_permission(event.get_eventlist.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    mode = request.args.get('mode', 'page')
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    page = request.args.get('page', default=1, type=int)
    PAGE_SIZE = 5

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 1. 构建基础查询
    query = Event.query.join(Event.club).filter(
        Event.is_cancelled == False,
        Club.isDelete == False
    )

    # 2. show参数过滤
    if show == 'going':
        query = query.filter(Event.actual_endTime.is_(None))
    elif show == 'ended':
        query = query.filter(Event.actual_endTime.is_not(None))

    # 3. 时间过滤
    if mode == 'month' and year and month:
        start_date = datetime(year, month, 1)
        end_date = datetime(year, month+1, 1) if month < 12 else datetime(year+1, 1, 1)
        query = query.filter(
            or_(
                and_(
                    Event.actual_startTime.is_not(None),
                    Event.actual_startTime >= start_date,
                    Event.actual_startTime < end_date
                ),
                and_(
                    Event.actual_startTime.is_(None),
                    Event.pre_startTime >= start_date,
                    Event.pre_startTime < end_date
                )
            )
        )

    # 4. 排序
    query = query.order_by(
        Event.actual_endTime.is_(None).desc(),
        Event.actual_startTime.desc(),
        Event.pre_startTime.desc()
    )

    # 5. 最后执行查询
    if mode == 'page':
        pagination = query.paginate(page=page, per_page=PAGE_SIZE, error_out=False)
        events = pagination.items
        total_pages = pagination.pages
        total_records = pagination.total
        print(total_pages)
    else:
        events = query.all()
        total_pages = 1
        total_records = len(events)

    # 6. 返回
    return jsonify({
        'Flag':'4000',
        'message': '调用成功',
        'data':{
            'records': [{
                'event_id': event.eventID,
                'club_id': event.club.clubID,
                'club_name': event.club.clubName,
                'title': event.title,
                'content': event.message,
                'location': event.location,
                'join_count': len(event.eventjoins),
                'cover_url': event.cover.fileUrl if event.cover else None,
                'pre_startTime': event.pre_startTime.isoformat(),
                'pre_endTime': event.pre_endTime.isoformat(),
                'actual_startTime': event.actual_startTime.isoformat() if isinstance(event.actual_startTime, datetime) else event.actual_startTime,
                'actual_endTime': event.actual_endTime.isoformat() if isinstance(event.actual_endTime, datetime) else event.actual_endTime,
                'author_id': event.authorID,
                'created_at': event.createDate.isoformat(),
                'cur_user_is_joined': _event_user_has_active_join(event, cur_user),
                'cur_user_managed': any(manager.userID == cur_user.userID for manager in event.club.managers),
                'cur_user_can_join': (
                    any(m.clubID == event.clubID for m in cur_user.clubmembers) and 
                    not _event_user_has_active_join(event, cur_user)
                ),
                'is_ended': event.actual_endTime is not None,
                'is_cancelled': event.is_cancelled
            } for event in events],
            'pagination': {
                'total_pages': total_pages,
                'current_page': page,
                'page_size': PAGE_SIZE,
                'total_records': total_records
            }
        }
    })

 
# 创建活动
@bp.route('/create/<int:club_id>', methods=['PUT'])
@jwt_required()
def create_event(club_id):
    data = request.get_json()
    title = data.get('title')
    content = data.get('content')
    location = data.get('location')
    pre_startTime = data.get('pre_startTime')
    pre_endTime = data.get('pre_endTime')
    event_imgs = data.get('event_imgs')
    budget = data.get('budget')
    cover_id = data.get('cover_id')

    print(data)
    # 新增位置数据处理
    location_data = data.get('location_data') 

    # 权限检查
    has_permission, message = check_permission(event.create_event.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200


    
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    club = Club.query.filter_by(clubID=club_id).first()


    event_created = Event(
        clubID=club_id, 
        title=title,
        message=content, 
        location=location, 
        pre_startTime=datetime.fromisoformat(pre_startTime), 
        pre_endTime=datetime.fromisoformat(pre_endTime), 
        authorID=cur_user.userID,
		budget = budget,
        coverID = cover_id
        )    
        
    # 如果提供了位置数据，保存到Event中
    if location_data:
        event_created.location_latitude = location_data.get('latitude')
        event_created.location_longitude = location_data.get('longitude')
        event_created.location_name = location_data.get('name')
        event_created.location_address = location_data.get('address')
        
    db.session.add(event_created)
    db.session.flush()

    # 发起人自动加入活动
    db.session.add(
        EventJoin(
            eventID=event_created.eventID,
            userID=cur_user.userID,
            isDelete=False,
        )
    )

    db.session.commit()

    
    return jsonify({
		'Flag':'4000',
		'message': '创建活动成功',
        'data':{
		'clubID':event_created.club.clubID,
        'clubName':event_created.club.clubName,
		'eventID':event_created.eventID,
        'eventCover':event_created.cover.fileUrl if event_created.cover else None,
		'authorID':event_created.authorID,
		'title':event_created.title,
        'content':event_created.message
        }
	})
	
# 活动开始
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

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 后端验证
    if event_to_begin.is_cancelled:
        return jsonify({'Flag': '4001', 'message': '活动已取消，无法开始'}), 200
    
    if event_to_begin.actual_startTime is not None:
        return jsonify({'Flag': '4001', 'message': '活动已开始'}), 200

    event_to_begin.actual_startTime = datetime.now(ZoneInfo('Asia/Shanghai'))
    db.session.commit()
    
    return jsonify({
        'Flag':'4000',
        'message': '活动开始',
        'data':{
		'clubID':event_to_begin.club.clubID,
        'clubName':event_to_begin.club.clubName,
        'eventCover':event_to_begin.cover.fileUrl if event_to_begin.cover else None,
		'eventID':event_to_begin.eventID,
		'authorID':event_to_begin.authorID,
		'title':event_to_begin.title
        }
    })
	



# 修改预计开始时间
@bp.route('/<int:event_id>/update_pre_startTime', methods=['POST'])
@jwt_required()
def update_pre_starttime(event_id):
    # 权限检查
    has_permission, message = check_permission(event.update_pre_starttime.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    data = request.get_json()
    pre_startTime = data.get('pre_startTime')

    event_update = Event.query.filter_by(eventID=event_id).first()

    # 更新预计开始时间
    if pre_startTime:
        event_update.pre_startTime = datetime.fromisoformat(pre_startTime)
    
    db.session.commit()
    return jsonify({
        'Flag':'4000',
        'message': '修改活动时间成功',
        'data':{
            'clubID':event_update.club.clubID,
            'clubName':event_update.club.clubName,
            'eventID':event_update.eventID,
            'eventCover':event_update.cover.fileUrl if event_update.cover else None,
            'authorID':event_update.authorID,
            'title':event_update.title,
            'pre_startTime': event_update.pre_startTime.isoformat(),
        }
    })

# 修改预计结束时间
@bp.route('/<int:event_id>/update_pre_endTime', methods=['POST'])
@jwt_required()
def update_pre_endtime(event_id):
    # 权限检查
    has_permission, message = check_permission(event.update_pre_endtime.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    data = request.get_json()
    pre_endTime = data.get('pre_endTime')

    event_update = Event.query.filter_by(eventID=event_id).first()

    # 更新预计结束时间
    if pre_endTime:
        event_update.pre_endTime = datetime.fromisoformat(pre_endTime)
    
    db.session.commit()
    return jsonify({
        'Flag':'4000',
        'message': '修改活动时间成功',
        'data':{
            'clubID':event_update.club.clubID,
            'clubName':event_update.club.clubName,
            'eventID':event_update.eventID,
            'authorID':event_update.authorID,
            'title':event_update.title,
            'pre_endTime': event_update.pre_endTime.isoformat(),
        }
    })

# 活动结束
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

    # 后端验证
    if event_to_end.actual_startTime is None:
        return jsonify({'Flag': '4001', 'message': '活动尚未开始，无法结束'}), 200
    
    if event_to_end.actual_endTime is not None:
        return jsonify({'Flag': '4001', 'message': '活动已结束'}), 200
    
    if event_to_end.is_cancelled:
        return jsonify({'Flag': '4001', 'message': '活动已取消，无法结束'}), 200

    event_to_end.actual_endTime = datetime.now(ZoneInfo('Asia/Shanghai'))
    db.session.commit()
    return jsonify({
        'Flag':'4000',
        'message': '活动结束',
        'data':{
		'clubID':event_to_end.club.clubID,
        'clubName':event_to_end.club.clubName,
        'eventCover':event_to_end.cover.fileUrl if event_to_end.cover else None,
		'eventID':event_to_end.eventID,
		'authorID':event_to_end.authorID,
		'title':event_to_end.title
        }
    })
	
	
# 修改活动实际费用
@bp.route('/<int:event_id>/update_real_cost', methods=['POST'])
@jwt_required()
def update_real_cost(event_id):
    # 权限检查
    has_permission, message = check_permission(event.update_real_cost.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    data = request.get_json()
    real_cost = data.get('real_cost')

    event_update = Event.query.filter_by(eventID=event_id).first()

    event_update.real_cost = real_cost
    db.session.commit()
    return jsonify({'Flag':'4000','message': '修改活动实际费用成功'})
	
@bp.route('/<int:event_id>/update_location', methods=['POST'])
@jwt_required()
def update_location(event_id):
    # 权限检查
    has_permission, message = check_permission(event.update_location.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    data = request.get_json()
    location = data.get('location')
    location_data = data.get('location_data')  # 新增位置数据参数

    event_update = Event.query.filter_by(eventID=event_id).first()

    # 更新基础位置信息
    if location:
        event_update.location = location
        
    # 更新详细位置数据
    if location_data:
        event_update.location_latitude = location_data.get('latitude')
        event_update.location_longitude = location_data.get('longitude')
        event_update.location_name = location_data.get('name')
        event_update.location_address = location_data.get('address')

    db.session.commit()

    # 与 GET /event/:id 一致，便于前端刷新地图与首页热门 premap
    out_location_data = None
    out_premap_url = None
    if (
        hasattr(event_update, 'location_latitude')
        and event_update.location_latitude
        and hasattr(event_update, 'location_longitude')
        and event_update.location_longitude
    ):
        out_location_data = {
            'name': event_update.location_name,
            'address': event_update.location_address,
            'latitude': float(event_update.location_latitude),
            'longitude': float(event_update.location_longitude),
        }
        out_premap_url = (
            current_app.config['GEOAPIFY_MAP_URL'].format(
                width=600,
                height=400,
                longitude=event_update.location_longitude,
                latitude=event_update.location_latitude,
                zoom=14,
            )
            + f"&apiKey={current_app.config['GEOAPIFY_API_KEY']}"
        )

    return jsonify({
        'Flag': '4000',
        'message': '更新活动位置成功',
        'data': {
            'location': event_update.location,
            'location_data': out_location_data,
            'premap_url': out_premap_url,
        },
    })

@bp.route('/<int:event_id>/update_cover', methods=['POST'])
@jwt_required()
def update_cover(event_id):
    # 权限检查
    has_permission, message = check_permission(event.update_cover.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    data = request.get_json()
    file_id = data.get('file_id')

    event_update = Event.query.filter_by(eventID=event_id).first()
    old_file_id = event_update.coverID

    # 删除旧封面文件
    if old_file_id:
        delete_file_inside(old_file_id)

    # 更新封面
    event_update.coverID = file_id

    db.session.commit()
    
    # 获取文件信息
    file_record = File.query.filter_by(fileID=file_id).first()
    
    return jsonify({
        'Flag':'4000',
        'message': '更新活动封面成功',
        'data': {
            'new_file_id': file_id,
            'new_cover_url': file_record.fileUrl if file_record else None,
            'old_file_id': old_file_id
        }
    })




@bp.route('/<int:event_id>/update_content', methods=['POST'])
@jwt_required()
def update_message(event_id):
    # 权限检查
    has_permission, message = check_permission(event.update_message.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    data = request.get_json()
    title = data.get('title')
    content = data.get('content')

    event_update = Event.query.filter_by(eventID=event_id).first()

    # 更新信息
    event_update.title = title
    event_update.message = content
    db.session.commit()
    
    return jsonify({'Flag':'4000','message': '更新活动信息成功'})



def _clockin_img_url(event_join):
    if not event_join or not event_join.clockimgID:
        return None
    img = getattr(event_join, 'clock_img', None)
    if img and img.fileUrl:
        return img.fileUrl
    file_rec = File.query.filter_by(fileID=event_join.clockimgID).first()
    return file_rec.fileUrl if file_rec else None


# 活动打卡（POST 需携带签名图 file_id）
@bp.route('/clockin/<int:event_id>', methods=['GET', 'POST'])
@jwt_required()
def clockin(event_id):
    # 权限检查
    has_permission, message = check_permission(event.clockin.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    event_record = Event.query.filter_by(eventID=event_id).first()
    if not event_record:
        return jsonify({'Flag': '4001', 'message': '活动不存在'}), 200
    if event_record.is_cancelled:
        return jsonify({'Flag': '4001', 'message': '活动已取消'}), 200
    if not event_record.actual_startTime:
        return jsonify({'Flag': '4001', 'message': '活动尚未开始'}), 200
    if event_record.actual_endTime:
        return jsonify({'Flag': '4001', 'message': '活动已结束'}), 200

    # 查找用户在该活动的参与记录
    event_join = EventJoin.query.filter_by(
        eventID=event_id,
        userID=cur_user.userID,
        isDelete=False,
    ).first()
    if not event_join:
        return jsonify({'Flag': '4001', 'message': '未参加该活动或已退出'}), 200

    clockimg_id = None
    if request.method == 'POST':
        payload = request.get_json(silent=True) or {}
        clockimg_id = payload.get('clockimg_id') or payload.get('clockimgID')
        try:
            clockimg_id = int(clockimg_id) if clockimg_id is not None else None
        except (TypeError, ValueError):
            clockimg_id = None
        if not clockimg_id:
            return jsonify({'Flag': '4001', 'message': '请先完成手写签名'}), 200
        file_rec = File.query.filter_by(fileID=clockimg_id).first()
        if not file_rec:
            return jsonify({'Flag': '4001', 'message': '签名图片不存在'}), 200
        if file_rec.uploaderID != cur_user.userID:
            return jsonify({'Flag': '4002', 'message': '签名图片无效'}), 200
        if file_rec.fileType and not str(file_rec.fileType).startswith('image'):
            return jsonify({'Flag': '4001', 'message': '签名须为图片文件'}), 200
        event_join.clockimgID = clockimg_id
    else:
        return jsonify({'Flag': '4001', 'message': '请完成手写签名后打卡'}), 200

    event_join.clockinDate = datetime.now(ZoneInfo('Asia/Shanghai'))
    db.session.commit()

    return jsonify({
        'Flag': '4000',
        'message': '活动打卡成功',
        'data': {
            'clockin_date': event_join.clockinDate.isoformat(),
            'clockimg_id': event_join.clockimgID,
            'clockin_img_url': _clockin_img_url(event_join),
        },
    })


# 删除活动
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

    # 后端验证
    if event_to_cancel.actual_endTime is not None:
        return jsonify({'Flag': '4001', 'message': '活动已结束，无法取消'}), 200
    
    if event_to_cancel.is_cancelled:
        return jsonify({'Flag': '4001', 'message': '活动已取消'}), 200

    event_to_cancel.is_cancelled = True
    db.session.commit()
    return jsonify({
        'Flag':'4000',
        'message': '活动已取消',
        'data':{
		'clubID':event_to_cancel.club.clubID,
        'clubName':event_to_cancel.club.clubName,
		'eventID':event_to_cancel.eventID,
		'authorID':event_to_cancel.authorID,
		'title':event_to_cancel.title
        }
    })

# 获取单个活动详情 - 保留club_deleted字段
@bp.route('/<int:event_id>', methods=['GET'])
@jwt_required()
def get_event(event_id):	
    # 权限检查
    has_permission, message = check_permission(event.get_event.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    event_show = Event.query.filter_by(eventID=event_id).first()
    
    # 如果活动已取消且用户没有管理权限，则不允许查看
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()
		
    # 通过关系属性获取用户参与记录（不含已软删除的退出）
    user_join = _user_active_join_for_event(cur_user, event_id)

    # 准备位置数据
    if hasattr(event_show, 'location_latitude') and hasattr(event_show, 'location_longitude') and event_show.location_latitude and event_show.location_longitude:
        location_data = {
            'name': event_show.location_name,
            'address': event_show.location_address,
            'latitude': event_show.location_latitude,
            'longitude': event_show.location_longitude
        }
        # 生成地图预览URL（包含API key）
        lon = event_show.location_longitude
        lat = event_show.location_latitude
        width = 600
        height = 400
        zoom = 14
    club_info = {
        'club_id': event_show.club.clubID,
        'club_name': event_show.club.clubName,
        'club_cover': event_show.club.cover.fileUrl if event_show.club.cover else None,
        'description': event_show.club.description,
        'president': event_show.club.president.userID if event_show.club.president and event_show.club.president.user and not event_show.club.president.isDelete else None,
        'president_name': event_show.club.president.user.userName if event_show.club.president and event_show.club.president.user and not event_show.club.president.isDelete else None,
        'president_avatar': event_show.club.president.user.avatar.fileUrl if event_show.club.president and event_show.club.president.user and not event_show.club.president.isDelete and event_show.club.president.user.avatar else None,
        'charter': event_show.club.charter,
        'member_count': len([m for m in event_show.club.members if not m.isDelete]),
        'recent_events_count': len([e for e in event_show.club.events if not e.is_cancelled]),
        'cur_user_has_pending_application': any(
            app.clubID == event_show.clubID and app.processedDate is None
            for app in cur_user.appliced_clubApplications
        ),
        'cur_user_is_member': any(c.clubID == event_show.clubID for c in cur_user.clubmembers if not c.isDelete)
    }   

    # 准备日程相关数据
    schedule_info = None
    can_create_schedule = False
    can_subscribe_schedule = False
    cur_user_joined_schedule = False  # 添加默认值

    if event_show.scheduleID:
        # 活动关联了日程，获取日程信息
        schedule = event_show.schedule
        if schedule and schedule.endTime is None:
            # 日程存在且未结束
            schedule_info = {
                'schedule_id': schedule.scheduleID,
                'startTime': schedule.startTime.isoformat(),
                'join_count': len(schedule.scheduleJoins)
            }
            # 检查当前用户是否能订阅该日程
            user_already_joined = any(sj.userID == cur_user.userID for sj in schedule.scheduleJoins)
            can_subscribe_schedule = not user_already_joined and club_info['cur_user_is_member']
            cur_user_joined_schedule = user_already_joined  # 确保赋值
        else:
            # 日程不存在或已结束，可以基于该活动创建新日程
            can_create_schedule = True
    else:
        # 活动未关联日程，检查是否能基于该活动创建日程
        # 条件：scheduleID为空
        can_create_schedule = True
    event_imgs = [{
                'fileUrl': img.fileUrl,
                'userName': (img.uploader.userName if getattr(img, 'uploader', None) else None),
                'uploadTime': img.uploadTime,
            } for moment in event_show.moments[1:] for img in (moment.image_files or [])]
    event_imgs.sort(key=lambda x: (x['uploadTime'] or datetime.min), reverse=True)
    event_imgs = event_imgs[:20] if len(event_imgs) > 20 else event_imgs

    first_moment_imgs = []
    if event_show.moments:
        target_index = 1 if len(event_show.moments) > 1 else 0
        first_moment_imgs = [{
                'fileUrl': img.fileUrl,
            } for img in (event_show.moments[target_index].image_files or [])]

    # 获取该协会可以加入的活动的信息（用于前端显示该活动）
    can_join_events = event_show.club.event_can_join
    can_join_events_data = [{
        'event_id': event_can_join.eventID,
        'title': event_can_join.title,
        'pre_startTime': event_can_join.pre_startTime.isoformat(),
        'pre_endTime': event_can_join.pre_endTime.isoformat(),
        'join_count': len(event_can_join.eventjoins),
        'content': event_can_join.message,
        'location': event_can_join.location,
        'cover_url': event_can_join.cover.fileUrl if event_can_join.cover else None,
        'first_moment_imgs':[{
                'fileUrl': img.fileUrl,
            } for img in ((event_can_join.moments[1].image_files if len(event_can_join.moments) > 1 else (event_can_join.moments[0].image_files if len(event_can_join.moments) > 0 else [])) or [])],
    } for event_can_join in can_join_events if event_can_join.eventID != event_show.eventID]  # 排除当前活动


    return jsonify({
        'Flag':'4000',
        'message': '调用成功',
        'data':{
            'event_id': event_show.eventID,
            'club_info':club_info,
            'title': event_show.title,
            'content': event_show.message,
            'location': event_show.location,
            'location_data': location_data,  # 新增位置数据字段
            'premap_url': (
                current_app.config['GEOAPIFY_MAP_URL'].format(
                    width=600, 
                    height=400, 
                    longitude=event_show.location_longitude, 
                    latitude=event_show.location_latitude, 
                    zoom=14
                ) + f"&apiKey={current_app.config['GEOAPIFY_API_KEY']}"
                if (hasattr(event_show, 'location_latitude') and event_show.location_latitude and 
                    hasattr(event_show, 'location_longitude') and event_show.location_longitude) 
                else None
            ),
            'pre_startTime': event_show.pre_startTime.isoformat(),
            'pre_endTime': event_show.pre_endTime.isoformat(),
            'actual_startTime': event_show.actual_startTime.isoformat() if isinstance(event_show.actual_startTime, datetime) else event_show.actual_startTime,
            'actual_endTime': event_show.actual_endTime.isoformat() if isinstance(event_show.actual_endTime, datetime) else event_show.actual_endTime,
            'author_id': event_show.authorID,
            'created_at': event_show.createDate.isoformat(),
            'cover_url': event_show.cover.fileUrl if event_show.cover else None,
            'first_moment_imgs':first_moment_imgs,
            'event_imgs':event_imgs,
            'real_cost': event_show.real_cost,
            'budget':event_show.budget,
            'approveDate':event_show.approveDate,
            'join_count': len([ej for ej in event_show.eventjoins if not getattr(ej, 'isDelete', False)]),
            'clockin_count': len(
                [
                    ej
                    for ej in event_show.eventjoins
                    if not getattr(ej, 'isDelete', False) and ej.clockinDate is not None
                ]
            ),
            'cur_user_in_club': any(m.clubID == event_show.clubID for m in cur_user.clubmembers),
            'cur_user_is_joined': user_join is not None,  # 优化后的加入状态判断
            'cur_user_managed': any(manager.userID == cur_user.userID for manager in event_show.club.managers),
            'cur_user_clockin_date': user_join.clockinDate.isoformat() if user_join and isinstance(user_join.clockinDate, datetime) else (user_join.clockinDate if user_join else None),
            'cur_user_clockin_img_url': _clockin_img_url(user_join) if user_join else None,
            'is_ended': event_show.actual_endTime is not None,
            'is_cancelled': event_show.is_cancelled,
            'club_deleted': event_show.club.isDelete,  # 保留协会删除状态
            # 新增日程相关字段
            'schedule_info': schedule_info,
            'can_create_schedule': can_create_schedule,
            'can_subscribe_schedule': can_subscribe_schedule,
            'cur_user_joined_schedule': cur_user_joined_schedule,
            'club_can_join_events': can_join_events_data  # 该协会其他可加入的活动
        }})

# 获取指定活动的参加人员列表
@bp.route('/<int:event_id>/members', methods=['GET'])
@jwt_required()
def get_event_members(event_id):
    # 权限检查
    has_permission, message = check_permission(event.get_event_members.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200
    # 当前用户
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 活动成员列表（不含已退出活动的记录）
    event_joins = EventJoin.query.filter_by(eventID=event_id, isDelete=False).all()

    members = []
    for ej in event_joins:
        user = ej.user
        member_info = {
            'member_id': ej.joinID,
            'user_id': user.userID,
            'user_name': user.userName,
            'phone': user.phone,
            'department': user.department,
            'position': user.position,
            'avatar': user.avatar.fileUrl if user.avatar else None,
            'join_date': ej.joinDate.isoformat() if ej.joinDate else None,
            'clockin_date': ej.clockinDate.isoformat() if ej.clockinDate else None,
            'clockin_img_id': ej.clockimgID,
            'clockin_img_url': _clockin_img_url(ej),
            'is_current_user': user.userID == cur_user.userID,
        }
        members.append(member_info)

    # 当前用户优先，其余按加入时间排序
    current_user_member = [m for m in members if m['is_current_user']]
    other_members = [m for m in members if not m['is_current_user']]
    other_members.sort(key=lambda x: x['join_date'] or '')

    sorted_members = (current_user_member + other_members)

    return jsonify({
        'Flag':'4000',
        'message': '调用成功',
        'data': {
            'members': sorted_members,
        }
    })


@bp.route('/club/<int:club_id>/manage_events', methods=['GET'])
@jwt_required()
def get_club_manage_events(club_id):
    """协会活动管理列表：供活动管理 panel 按月索引展示。"""
    has_permission, message = check_permission(event.get_club_manage_events.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    club_show = Club.query.filter_by(clubID=club_id).first()
    if not club_show:
        return jsonify({'Flag': '4001', 'message': '协会不存在'}), 200

    events = (
        Event.query.filter_by(clubID=club_id)
        .order_by(
            Event.pre_startTime.desc(),
            Event.createDate.desc(),
            Event.eventID.desc(),
        )
        .all()
    )

    event_list = []
    for ev in events:
        joins = [j for j in (ev.eventjoins or []) if not getattr(j, 'isDelete', False)]
        checked_in_count = sum(1 for j in joins if j.clockinDate is not None)
        event_list.append({
            'event_id': ev.eventID,
            'title': ev.title or '',
            'location_name': ev.location_name or ev.location or '',
            'pre_start_time': ev.pre_startTime.strftime('%Y-%m-%d %H:%M:%S') if ev.pre_startTime else '',
            'pre_end_time': ev.pre_endTime.strftime('%Y-%m-%d %H:%M:%S') if ev.pre_endTime else '',
            'actual_start_time': ev.actual_startTime.strftime('%Y-%m-%d %H:%M:%S') if ev.actual_startTime else '',
            'actual_end_time': ev.actual_endTime.strftime('%Y-%m-%d %H:%M:%S') if ev.actual_endTime else '',
            'create_time': ev.createDate.strftime('%Y-%m-%d %H:%M:%S') if ev.createDate else '',
            'cover_url': ev.cover.fileUrl if ev.cover else None,
            'is_cancelled': bool(ev.is_cancelled),
            'club_deleted': bool(ev.club.isDelete) if ev.club else False,
            'total_participants': len(joins),
            'checked_in_count': checked_in_count,
        })

    return jsonify({
        'Flag': '4000',
        'message': '调用成功',
        'data': {
            'club': {
                'club_id': club_show.clubID,
                'club_name': club_show.clubName,
            },
            'events': event_list,
            'total_events': len(event_list),
        },
    })


@bp.route('/<int:event_id>/participation', methods=['GET'])
@jwt_required()
def get_event_participation(event_id):
    """活动参与明细（分页）：参与人员、参加时间、打卡时间、人员发布的动态。page 默认 1；page_size 默认 10，最大 50。"""
    has_permission, message = check_permission(event.get_event_participation.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    ev = Event.query.filter_by(eventID=event_id).first()
    if not ev:
        return jsonify({'Flag': '4001', 'message': '活动不存在'}), 200

    page = request.args.get('page', default=1, type=int) or 1
    page_size = request.args.get('page_size', default=10, type=int) or 10
    page = max(1, int(page))
    page_size = max(1, min(int(page_size), 50))

    join_date_null_last = case((EventJoin.joinDate.is_(None), 1), else_=0)
    base_q = (
        EventJoin.query.filter_by(eventID=event_id, isDelete=False)
        .order_by(join_date_null_last.asc(), EventJoin.joinDate.desc(), EventJoin.joinID.desc())
    )

    total_records = base_q.count()
    total_pages = max(1, (total_records + page_size - 1) // page_size) if total_records else 1
    event_joins = (
        base_q.offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    clockin_count = base_q.filter(EventJoin.clockinDate.isnot(None)).count()
    moment_count = Moment.query.filter_by(ref_event_ID=event_id).count()

    user_ids = [ej.userID for ej in event_joins if ej.userID is not None]
    moments_by_user = defaultdict(list)
    if user_ids:
        moments = (
            Moment.query.filter(
                Moment.ref_event_ID == event_id,
                Moment.creatorID.in_(user_ids),
            )
            .order_by(Moment.createDate.desc(), Moment.momentID.desc())
            .all()
        )
        for m in moments:
            if m.creatorID is not None:
                moments_by_user[m.creatorID].append(m)

    def _fmt(dt):
        if not dt:
            return ''
        return dt.strftime('%Y-%m-%d %H:%M')

    def _serialize_moments(moments_list):
        serialized = []
        for m in moments_list:
            image_urls = []
            for f in (m.image_files or []):
                url = getattr(f, 'fileUrl', None)
                if url:
                    image_urls.append(url)
            desc = (m.description or '').strip() or '（无文字）'
            t = _fmt(m.createDate)
            serialized.append({
                'moment_id': m.momentID,
                'description': desc,
                'create_time_display': t or None,
                'image_urls': image_urls,
            })
        return serialized

    items = []
    for ej in event_joins:
        user = ej.user
        if not user:
            continue
        user_moments = moments_by_user.get(user.userID, [])
        moment_lines = []
        for m in user_moments:
            desc = (m.description or '').strip() or '（无文字）'
            t = _fmt(m.createDate)
            moment_lines.append(f'{desc}（{t}）' if t else desc)
        items.append({
            'user_id': user.userID,
            'user_name': user.userName or '',
            'join_time': ej.joinDate.isoformat() if ej.joinDate else None,
            'join_time_display': _fmt(ej.joinDate) or '—',
            'clockin_time': ej.clockinDate.isoformat() if ej.clockinDate else None,
            'clockin_time_display': _fmt(ej.clockinDate) or '未打卡',
            'clockin_img_id': ej.clockimgID,
            'clockin_img_url': _clockin_img_url(ej),
            'moment_count': len(user_moments),
            'moments_text': '；'.join(moment_lines) if moment_lines else '无',
            'moments': _serialize_moments(user_moments),
        })

    return jsonify({
        'Flag': '4000',
        'message': '调用成功',
        'data': {
            'event_id': ev.eventID,
            'title': ev.title or '',
            'summary': {
                'participant_count': total_records,
                'clockin_count': clockin_count,
                'moment_count': moment_count,
            },
            'items': items,
            'pagination': {
                'total_pages': total_pages,
                'current_page': page,
                'page_size': page_size,
                'total_records': total_records,
            },
        },
    })


def _event_timeline_iso(dt):
    if not dt or not isinstance(dt, datetime):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo('Asia/Shanghai'))
    else:
        dt = dt.astimezone(ZoneInfo('Asia/Shanghai'))
    return dt.isoformat()


def _timeline_operator_brief(u):
    if not u:
        return None
    return {
        'user_id': u.userID,
        'user_name': u.userName or '用户',
        'avatar': u.avatar.fileUrl if getattr(u, 'avatar', None) and u.avatar else None,
    }


@bp.route('/<int:event_id>/timeline', methods=['GET'])
@jwt_required()
def get_event_timeline(event_id):
    """活动操作时间线，支持 page / page_size 分页；含操作人头像、动态图片等。"""
    has_permission, message = check_permission(event.get_event_timeline.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    page = request.args.get('page', default=1, type=int) or 1
    page_size = request.args.get('page_size', default=5, type=int) or 5
    page = max(1, int(page))
    page_size = max(1, min(int(page_size), 50))

    e = Event.query.filter_by(eventID=event_id).first()
    if not e:
        return jsonify({'Flag': '4001', 'message': '活动不存在'}), 200

    author = User.query.filter_by(userID=e.authorID).first()
    author_brief = _timeline_operator_brief(author)
    author_name = (author.userName if author else None) or '用户'

    raw = []

    def append_row(at_dt, kind, summary, extra_id, operator, milestone=False, moment=None):
        if not at_dt or not isinstance(at_dt, datetime):
            return
        raw.append({
            'id': f'{kind}-{extra_id}-{_event_timeline_iso(at_dt)}',
            'type': kind,
            'at_dt': at_dt,
            'summary': summary,
            'operator': operator,
            'milestone': bool(milestone),
            'moment': moment,
        })

    if e.createDate:
        append_row(e.createDate, 'created', f'{author_name} 创建活动', f'ev{e.eventID}', author_brief, False, None)

    for ej in EventJoin.query.filter_by(eventID=event_id, isDelete=False).all():
        u = ej.user
        op = _timeline_operator_brief(u)
        uname = (u.userName if u else '') or '用户'
        if ej.joinDate:
            append_row(ej.joinDate, 'join', f'{uname} 参加活动', f'ej{ej.joinID}', op, False, None)
        if ej.clockinDate:
            append_row(ej.clockinDate, 'clockin', f'{uname} 完成打卡', f'ejc{ej.joinID}', op, False, None)

    if e.actual_startTime:
        append_row(e.actual_startTime, 'started', '活动已开始', f'st{e.eventID}', author_brief, True, None)
    if e.actual_endTime:
        append_row(e.actual_endTime, 'ended', '活动已结束', f'en{e.eventID}', author_brief, True, None)

    for m in Moment.query.filter_by(ref_event_ID=event_id).all():
        if not m.createDate:
            continue
        cu = m.creator
        cname = (cu.userName if cu else '') or '用户'
        imgs = [{'file_id': f.fileID, 'fileUrl': f.fileUrl} for f in (m.image_files or [])]
        moment_payload = {
            'moment_id': m.momentID,
            'description': (m.description or '').strip(),
            'image_files': imgs,
        }
        append_row(m.createDate, 'moment', f'{cname} 发布动态', f'm{m.momentID}', _timeline_operator_brief(cu), False, moment_payload)

    raw.sort(key=lambda r: r['at_dt'], reverse=True)
    total_records = len(raw)
    total_pages = max(1, (total_records + page_size - 1) // page_size) if total_records else 1
    start = (page - 1) * page_size
    page_slice = raw[start:start + page_size]

    out_items = []
    for r in page_slice:
        out_items.append({
            'id': r['id'],
            'type': r['type'],
            'at': _event_timeline_iso(r['at_dt']),
            'summary': r['summary'],
            'operator': r['operator'],
            'milestone': r['milestone'],
            'moment': r['moment'],
        })

    return jsonify({
        'Flag': '4000',
        'message': '获取成功',
        'data': {
            'items': out_items,
            'pagination': {
                'total_pages': total_pages,
                'current_page': page,
                'page_size': page_size,
                'total_records': total_records,
            },
        },
    })


# 加入活动
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

    # 后端验证
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

    existing = EventJoin.query.filter_by(eventID=event_id, userID=cur_user.userID).first()
    if existing:
        if getattr(existing, 'isDelete', False):
            existing.isDelete = False
            db.session.commit()
            return jsonify({'Flag': '4000', 'message': '加入活动成功'})
        return jsonify({'Flag': '4000', 'message': '您已在该活动中'}), 200

    join = EventJoin(eventID=event_id, userID=cur_user.userID, isDelete=False)
    db.session.add(join)
    db.session.commit()
    
    return jsonify({'Flag':'4000','message': '加入活动成功'})

#邀请参加活动
@bp.route('/<int:event_id>/addmember/<int:user_id>', methods=['GET'])
@jwt_required()
def add_event_member(event_id, user_id):
    # 权限检查
    has_permission, message = check_permission(event.add_event_member.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200
    # 校验活动与用户是否存在
    cur_event = Event.query.filter_by(eventID=event_id).first()

    # 处理社团成员关系（包括已删除的记录）
    club_id = cur_event.clubID
    existing_member = ClubMember.query.filter_by(userID=user_id, clubID=club_id).first()
    if not existing_member:
        # 如果用户不在社团中，返回错误
        return jsonify({'Flag':'4000','message': '该用户不在社团中'}), 200

    # 避免重复加入活动（允许恢复已软删除的参与记录）
    existing_join = EventJoin.query.filter_by(eventID=event_id, userID=user_id).first()
    if existing_join:
        if getattr(existing_join, 'isDelete', False):
            existing_join.isDelete = False
            db.session.commit()
            return jsonify({'Flag': '4000', 'message': '邀请参加活动成功'})
        return jsonify({'Flag':'4000','message': '该用户已在活动中'}), 200

    join = EventJoin(eventID=event_id, userID=user_id, isDelete=False)
    db.session.add(join)
    db.session.commit()
    
    return jsonify({'Flag':'4000','message': '邀请参加活动成功'})

# 退出活动
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

    # 后端验证
    if event_to_quit.actual_endTime is not None:
        return jsonify({'Flag': '4001', 'message': '活动已结束，无法退出'}), 200

    join_record = EventJoin.query.filter_by(
        eventID=event_id, userID=cur_user.userID, isDelete=False
    ).first()
    if not join_record:
        return jsonify({'Flag': '4001', 'message': '您未加入该活动'}), 200

    join_record.isDelete = True
    db.session.commit()
    
    return jsonify({'Flag':'4000','message': '退出活动成功'})


# 管理员移除成员
@bp.route('/<int:event_id>/remove/<int:user_id>', methods=['GET'])
@jwt_required()
def remove_event_member(event_id, user_id):
    # 权限检查
    has_permission, message = check_permission(event.remove_member.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    # 查找该用户在该活动中的参与记录
    join_record = EventJoin.query.filter_by(eventID=event_id, userID=user_id, isDelete=False).first()
    if not join_record:
        return jsonify({'Flag': '4004', 'message': '成员未参加该活动或已被移除'}), 200

    join_record.isDelete = True
    db.session.commit()
    return jsonify({'Flag':'4000','message': '移除成员成功'})





# 合并后的统一接口 - user_joined 可以看到已取消的活动
@bp.route('/user_joined/list/<string:show>', methods=['GET'])
@jwt_required()
def get_user_joined_eventlist(show):
    # 权限检查
    has_permission, message = check_permission(event.get_user_joined_eventlist.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200
    
    # 参数处理
    mode = request.args.get('mode', 'page')
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    page = request.args.get('page', default=1, type=int)

    # 获取当前用户及每条活动对应的参与记录（含已软删除，供「全部」「已取消」等展示）
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()
    if cur_user is None:
        return jsonify({'Flag': '4002', 'message': '用户不存在'}), 200

    join_by_event = {}
    event_order = []
    for ej in cur_user.eventjoins:
        if ej.event is None:
            continue
        eid = ej.event.eventID
        if eid not in join_by_event:
            event_order.append(eid)
        join_by_event[eid] = ej
    joined_event_list = [join_by_event[eid].event for eid in event_order]

    def _ej_active_for(e):
        ej = join_by_event.get(e.eventID)
        return ej is not None and not getattr(ej, 'isDelete', False)

    def _in_ended_tab(e):
        """仅已实际结束的活动（有 actual_endTime）。已结束活动不应再被退出/退会标记为软删参与。"""
        return e.actual_endTime is not None

    def _in_cancelled_tab(e):
        """主办方取消，或用户已退出参与且活动尚未实际结束（与已取消归为一类）。"""
        if e.actual_endTime is not None:
            return False
        ej = join_by_event.get(e.eventID)
        return e.is_cancelled or (ej is not None and getattr(ej, 'isDelete', False))

    # Count模式处理（不按月份）
    if mode == 'count':
        prego_count = len(
            [
                e
                for e in joined_event_list
                if _ej_active_for(e) and e.actual_startTime is None and not e.is_cancelled
            ]
        )
        going_count = len(
            [
                e
                for e in joined_event_list
                if _ej_active_for(e)
                and e.actual_startTime is not None
                and e.actual_endTime is None
                and not e.is_cancelled
            ]
        )
        ended_count = len([e for e in joined_event_list if _in_ended_tab(e)])
        cancelled_count = len([e for e in joined_event_list if _in_cancelled_tab(e)])

        if show == 'all':
            count_payload = {
                'prego_count': prego_count,
                'going_count': going_count,
                'ended_count': ended_count,
                'cancelled_count': cancelled_count,
                'total_count': len(joined_event_list),
            }
        elif show == 'prego':
            count_payload = {'count': prego_count}
        elif show == 'going':
            count_payload = {'count': going_count}
        elif show == 'ended':
            count_payload = {'count': ended_count}
        elif show == 'cancelled':
            count_payload = {'count': cancelled_count}
        else:
            count_payload = {'count': len(joined_event_list)}

        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data': count_payload
        })

    joined_after_month = joined_event_list
    # 时间过滤逻辑
    if mode == 'month':
        start_date = datetime(year, month, 1, tzinfo=ZoneInfo('Asia/Shanghai'))
        end_date = (datetime(year, month+1, 1, tzinfo=ZoneInfo('Asia/Shanghai')) if month < 12 
                   else datetime(year+1, 1, 1, tzinfo=ZoneInfo('Asia/Shanghai')))
        joined_after_month = [e for e in joined_event_list if start_date <= (
            (e.actual_startTime.replace(tzinfo=ZoneInfo('Asia/Shanghai')) if e.actual_startTime.tzinfo is None else e.actual_startTime) if e.actual_startTime 
            else (e.pre_startTime.replace(tzinfo=ZoneInfo('Asia/Shanghai')) if e.pre_startTime 
                 else datetime.min.replace(tzinfo=ZoneInfo('Asia/Shanghai')))
        ) < end_date]

    # Show参数过滤
    if show == 'prego':
        filtered_events = [
            e for e in joined_after_month
            if _ej_active_for(e) and e.actual_startTime is None and not e.is_cancelled
        ]
    elif show == 'going':
        filtered_events = [
            e for e in joined_after_month
            if _ej_active_for(e)
            and e.actual_startTime is not None
            and e.actual_endTime is None
            and not e.is_cancelled
        ]
    elif show == 'ended':
        filtered_events = [e for e in joined_after_month if _in_ended_tab(e)]
    elif show == 'cancelled':
        filtered_events = [e for e in joined_after_month if _in_cancelled_tab(e)]
    elif show == 'all':
        filtered_events = joined_after_month
    else:
        filtered_events = joined_after_month

    # 排序逻辑
    filtered_events = sorted(
        filtered_events,
        key=lambda x: (x.actual_endTime is None, 
                      (x.actual_startTime.replace(tzinfo=ZoneInfo('Asia/Shanghai')) if x.actual_startTime and x.actual_startTime.tzinfo is None else x.actual_startTime) if x.actual_startTime 
                      else (x.pre_startTime.replace(tzinfo=ZoneInfo('Asia/Shanghai')) if x.pre_startTime 
                           else datetime.min.replace(tzinfo=ZoneInfo('Asia/Shanghai')))),
        reverse=True
    )

    def _joined_row(e):
        ej = join_by_event.get(e.eventID)
        c = e.club
        return {
            'event_id': e.eventID,
            'title': e.title,
            'club_id': c.clubID if c else None,
            'club_name': c.clubName if c else None,
            'club_cover': c.cover.fileUrl if c and c.cover else None,
            'location': e.location,
            'event_imgs': (
                ([e.cover.fileUrl] if e.cover else []) +
                ([file.fileUrl for file in (e.moments[-1].image_files or [])] if e.moments and e.moments[-1].image_files else [])
            ),
            'pre_startTime': e.pre_startTime.isoformat() if e.pre_startTime else None,
            'actual_startTime': e.actual_startTime.isoformat() if e.actual_startTime else None,
            'actual_endTime': e.actual_endTime.isoformat() if e.actual_endTime else None,
            'joined_date': ej.joinDate.isoformat() if ej and ej.joinDate else None,
            'clockin_date': ej.clockinDate.isoformat() if ej and ej.clockinDate else None,
            'is_ended': e.actual_endTime is not None,
            'is_cancelled': e.is_cancelled,
            'club_deleted': c.isDelete if c else False,
            'join_is_delete': bool(getattr(ej, 'isDelete', False)) if ej else False,
        }

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
                'records': [_joined_row(e) for e in paged_events],
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
            'data': [_joined_row(e) for e in filtered_events]
        })

# 统一用户可参加活动接口 - 返回用户作为member加入的未删除协会的正在进行且未取消的活动
@bp.route('/user_can_join/list/<string:show>', methods=['GET'])
@jwt_required()
def get_user_can_join_eventlist(show):
    # 权限检查
    has_permission, message = check_permission(event.get_user_can_join_eventlist.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200
    
    mode = request.args.get('mode', 'page')
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    page = request.args.get('page', default=1, type=int)

    # 用户验证
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 获取用户作为member的未删除协会
    member_clubs = []
    for memberShip in cur_user.clubmembers:
        if memberShip.role == 'member' and not memberShip.isDelete:
            club = Club.query.filter_by(clubID=memberShip.clubID, isDelete=False).first()
            if club:
                member_clubs.append(club)

    # 获取这些协会的正在进行且未取消的活动
    clubs_events = []
    for club in member_clubs:
        club_events = [
            e for e in club.events 
            if e.actual_endTime is None and not e.is_cancelled
        ]
        clubs_events.extend(club_events)
    print(clubs_events)
    # Count模式处理
    if mode == 'count':
        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data': {
                'count': len(clubs_events)
            }
        })

    # 时间过滤逻辑
    if mode == 'month':
        start_date = datetime(year, month, 1, tzinfo=ZoneInfo('Asia/Shanghai'))
        end_date = (datetime(year, month+1, 1, tzinfo=ZoneInfo('Asia/Shanghai')) if month < 12 
                   else datetime(year+1, 1, 1, tzinfo=ZoneInfo('Asia/Shanghai')))
        clubs_events = [
            e for e in clubs_events 
            if start_date <= (
                (e.actual_startTime.replace(tzinfo=ZoneInfo('Asia/Shanghai')) if e.actual_startTime.tzinfo is None else e.actual_startTime) if e.actual_startTime 
                else (e.pre_startTime.replace(tzinfo=ZoneInfo('Asia/Shanghai')) if e.pre_startTime 
                     else datetime.min.replace(tzinfo=ZoneInfo('Asia/Shanghai')))
            ) < end_date
        ]

    # Show参数过滤
    if show == 'going':
        clubs_events = [e for e in clubs_events if e.actual_endTime is None]
    elif show == 'ended':
        clubs_events = [e for e in clubs_events if e.actual_endTime is not None]
    elif show == 'all':
        clubs_events = clubs_events

    # 排序逻辑 - 按开始时间降序排列
    clubs_events = sorted(
        clubs_events, 
        key=lambda x: (
            (x.actual_startTime.replace(tzinfo=ZoneInfo('Asia/Shanghai')) if x.actual_startTime.tzinfo is None else x.actual_startTime) if x.actual_startTime 
            else (x.pre_startTime.replace(tzinfo=ZoneInfo('Asia/Shanghai')) if x.pre_startTime 
                 else datetime.min.replace(tzinfo=ZoneInfo('Asia/Shanghai')))
        ), 
        reverse=True
    )

    # 分页处理
    if mode == 'page':
        PAGE_SIZE = 10
        total_records = len(clubs_events)
        total_pages = (total_records + PAGE_SIZE - 1) // PAGE_SIZE
        
        paged_events = clubs_events[(page-1)*PAGE_SIZE : page*PAGE_SIZE]
        
        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data':{
                'records': [{
                    'event_id': e.eventID,
                    'title': e.title,
                    'club_name': e.club.clubName,
                    'club_cover': e.club.cover.fileUrl if e.club.cover else None,
                    'location': e.location,
                    'event_imgs': (
                                ([e.cover.fileUrl] if e.cover else []) +
                                ([file.fileUrl for file in (e.moments[-1].image_files or [])] if e.moments and e.moments[-1].image_files else [])
                            ),
                    'actual_startTime': e.actual_startTime.isoformat() if e.actual_startTime else e.pre_startTime.isoformat(),
                    'pre_startTime': e.pre_startTime.isoformat() if e.pre_startTime else None,
                    'join_count': len(e.eventjoins),
                    'cur_user_can_join': not _event_user_has_active_join(e, cur_user)
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
                'startTime': e.actual_startTime.isoformat() if e.actual_startTime else e.pre_startTime.isoformat(),
                'join_count': len(e.eventjoins),
                'cover': e.cover.fileUrl if e.cover else None,
            } for e in clubs_events]
        })

# 统一用户管理活动接口 - user_manage 可以看到已取消的活动
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

    # 用户验证
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 获取管理中的活动（包括已删除的协会）
    managed_events = []
    for memberShip in cur_user.clubmembers:
        # 修正角色判断：使用正确的管理员角色
        if memberShip.role in ['president', 'vice_president', 'director']:
            club = Club.query.filter_by(clubID=memberShip.clubID).first()
            if club and club.events:
                # 包含所有协会的活动（包括已删除的协会）
                # 前端会通过 club_deleted 字段显示相应的状态
                managed_events.extend(club.events)
    
    # 调试信息
    print(f"[DEBUG] User {user_id} managed_events count: {len(managed_events)}")
    for e in managed_events:
        print(f"[DEBUG] Event {e.eventID}: actual_startTime={e.actual_startTime}, pre_startTime={e.pre_startTime}, is_cancelled={e.is_cancelled}")

    # 获取当前时间（用于判断预计开始状态）
    now = datetime.now(ZoneInfo('Asia/Shanghai'))
    print(f"[DEBUG] Current time (Asia/Shanghai): {now}")

    # Count模式处理 - 扩展为4种状态统计
    if mode == 'count':
        # 预计开始：未实际开始 且 未取消（不管预计时间是否已过）
        prego_count = len([e for e in managed_events 
                          if e.actual_startTime is None and not e.is_cancelled])
        going_count = len([e for e in managed_events 
                          if e.actual_startTime is not None and e.actual_endTime is None and not e.is_cancelled])
        # 已结束：已实际结束
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
        start_date = datetime(year, month, 1, tzinfo=ZoneInfo('Asia/Shanghai'))
        end_date = (datetime(year, month+1, 1, tzinfo=ZoneInfo('Asia/Shanghai')) if month < 12 
                   else datetime(year+1, 1, 1, tzinfo=ZoneInfo('Asia/Shanghai')))
        managed_events = [e for e in managed_events 
                         if start_date <= (
                             (e.actual_startTime.replace(tzinfo=ZoneInfo('Asia/Shanghai')) if e.actual_startTime.tzinfo is None else e.actual_startTime) if e.actual_startTime 
                             else (e.pre_startTime.replace(tzinfo=ZoneInfo('Asia/Shanghai')) if e.pre_startTime 
                                  else datetime.min.replace(tzinfo=ZoneInfo('Asia/Shanghai')))
                         ) < end_date]

    # Show参数过滤 - 扩展为4种状态
    if show == 'prego':
        # 预计开始：未实际开始 且 未取消（不管预计时间是否已过）
        filtered_events = []
        for e in managed_events:
            has_actual_start = e.actual_startTime is not None
            is_not_cancelled = not e.is_cancelled
            
            if not has_actual_start and is_not_cancelled:
                filtered_events.append(e)
                print(f"[DEBUG] Event {e.eventID} INCLUDED in prego")
            else:
                print(f"[DEBUG] Event {e.eventID} EXCLUDED: has_actual_start={has_actual_start}, is_not_cancelled={is_not_cancelled}")
        
        print(f"[DEBUG] Prego filtered_events count: {len(filtered_events)}")
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
        key=lambda x: (
            (x.actual_startTime.replace(tzinfo=ZoneInfo('Asia/Shanghai')) if x.actual_startTime.tzinfo is None else x.actual_startTime) if x.actual_startTime 
            else (x.pre_startTime.replace(tzinfo=ZoneInfo('Asia/Shanghai')) if x.pre_startTime 
                 else datetime.min.replace(tzinfo=ZoneInfo('Asia/Shanghai')))
        ),
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
                        ([file.fileUrl for file in (e.moments[-1].image_files or [])] if e.moments and e.moments[-1].image_files else [])
                    ),
                    'actual_startTime': e.actual_startTime.isoformat() if e.actual_startTime else None,
                    'pre_startTime': e.pre_startTime.isoformat() if e.pre_startTime else None,
                    'join_count': len(e.eventjoins),
                    'real_cost': e.real_cost,
                    'budget': e.budget,
                    'cover': e.cover.fileUrl if e.cover else None,
                    'is_cancelled': e.is_cancelled,
                    'club_deleted': e.club.isDelete  # 新增协会删除状态
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
                'club_deleted': e.club.isDelete  # 新增协会删除状态
            } for e in filtered_events]
        })

def _club_public_pick_featured_event(paged_events, tz):
    """与小程序 club-joined-panel 一致：当前页内 进行中 > 即将开始 > 首条。"""
    if not paged_events:
        return None
    now = datetime.now(tz)
    for e in paged_events:
        if e.actual_startTime is not None and e.actual_endTime is None:
            return e
    for e in paged_events:
        if e.actual_startTime is None and e.pre_startTime is not None:
            pst = e.pre_startTime
            if pst.tzinfo is None:
                pst = pst.replace(tzinfo=tz)
            elif pst.tzinfo != tz:
                pst = pst.astimezone(tz)
            if pst > now:
                return e
    return paged_events[0]


def _club_public_featured_isotope_payload(featured_e, max_moments=15, max_members=12):
    """一次 SQL 取成员预览 + 动态缩略图，避免前端再调 /event/:id/members 与多页 /moment/event/:id。"""
    if featured_e is None:
        return None
    eid = featured_e.eventID
    joins = (
        EventJoin.query.filter_by(eventID=eid, isDelete=False)
        .order_by(EventJoin.joinID.asc())
        .limit(max_members)
        .all()
    )
    members = []
    for ej in joins:
        u = ej.user
        if not u:
            continue
        members.append({
            'user_id': u.userID,
            'userID': u.userID,
            'avatar': u.avatar.fileUrl if u.avatar else None,
        })
    moments_q = (
        Moment.query.filter(Moment.ref_event_ID == eid)
        .order_by(Moment.createDate.desc())
        .limit(max_moments)
        .all()
    )
    moments = []
    for m in moments_q:
        files = m.image_files or []
        moments.append({
            'momentID': m.momentID,
            'image_files': [
                {'fileUrl': f.fileUrl, 'file_url': f.fileUrl} for f in files
            ],
        })
    return {'event_id': eid, 'members': members, 'moments': moments}


# 统一社团公开活动接口 - 返回协会发起的正在进行且未取消的活动
@bp.route('/club_public/<int:club_id>/list/<string:show>', methods=['GET'])
@jwt_required()
def get_club_public_eventlist(club_id, show):
    # 权限检查
    has_permission, message = check_permission(event.get_club_public_eventlist.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200
    
    mode = request.args.get('mode', 'page')
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    page = request.args.get('page', default=1, type=int)

    # 用户验证
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    club = Club.query.filter_by(clubID=club_id).first()
    # 当前用户是否协会管理员、是否有效会员（勿在行尾加逗号，否则 is_managed 会变成元组）
    is_managed = any(
        manager.userID == cur_user.userID for manager in club.managers
    )
    is_member = any(
        m.clubID == club_id and not getattr(m, 'isDelete', False)
        for m in cur_user.clubmembers
    )

    # 根据show参数获取活动
    if show == 'going':
        # 正在进行且未取消的活动
        club_events = [
            e for e in club.events 
            if e.actual_endTime is None and not e.is_cancelled
        ]
    elif show == 'ended':
        # 已结束且未取消的活动
        club_events = [
            e for e in club.events 
            if e.actual_endTime is not None and not e.is_cancelled
        ]
    else:  # show == 'all'
        # 所有活动，包括已取消的
        club_events = list(club.events)
    # Count模式处理
    if mode == 'count':
        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data': {
                'count': len(club_events)
            }
        })

    # 时间过滤
    if mode == 'month':
        start_date = datetime(year, month, 1, tzinfo=ZoneInfo('Asia/Shanghai'))
        end_date = (datetime(year, month+1, 1, tzinfo=ZoneInfo('Asia/Shanghai')) if month < 12 
                   else datetime(year+1, 1, 1, tzinfo=ZoneInfo('Asia/Shanghai')))
        club_events = [
            e for e in club_events 
            if start_date <= (
                (e.actual_startTime.replace(tzinfo=ZoneInfo('Asia/Shanghai')) if e.actual_startTime.tzinfo is None else e.actual_startTime) if e.actual_startTime 
                else (e.pre_startTime.replace(tzinfo=ZoneInfo('Asia/Shanghai')) if e.pre_startTime 
                     else datetime.min.replace(tzinfo=ZoneInfo('Asia/Shanghai')))
            ) < end_date
        ]


    # 排序逻辑 - 按开始时间降序排列
    club_events = sorted(
        club_events,
        key=lambda x: (
            (x.actual_startTime.replace(tzinfo=ZoneInfo('Asia/Shanghai')) if x.actual_startTime.tzinfo is None else x.actual_startTime) if x.actual_startTime 
            else (x.pre_startTime.replace(tzinfo=ZoneInfo('Asia/Shanghai')) if x.pre_startTime 
                 else datetime.min.replace(tzinfo=ZoneInfo('Asia/Shanghai')))
        ),
        reverse=True
    )

    # 分页处理
    if mode == 'page':
        PAGE_SIZE = 8
        total_records = len(club_events)
        total_pages = (total_records + PAGE_SIZE - 1) // PAGE_SIZE

        paged_events = club_events[(page-1)*PAGE_SIZE : page*PAGE_SIZE]
        want_iso = request.args.get('include_featured_isotope', '').lower() in (
            '1', 'true', 'yes', 'on',
        )
        featured_isotope = None
        if want_iso and page == 1 and paged_events:
            featured_e = _club_public_pick_featured_event(
                paged_events, ZoneInfo('Asia/Shanghai')
            )
            featured_isotope = _club_public_featured_isotope_payload(featured_e)

        public_records = []
        for e in paged_events:
            ej_active = _user_active_join_for_event(cur_user, e.eventID)
            public_records.append({
                'event_id': e.eventID,
                'title': e.title,
                'content': e.message,
                'premap_url': (
                    current_app.config['GEOAPIFY_MAP_URL'].format(
                        width=600,
                        height=400,
                        longitude=e.location_longitude,
                        latitude=e.location_latitude,
                        zoom=14
                    ) + f"&apiKey={current_app.config['GEOAPIFY_API_KEY']}"
                    if (hasattr(e, 'location_latitude') and e.location_latitude and
                        hasattr(e, 'location_longitude') and e.location_longitude)
                    else None
                ),
                'location_data': {
                    'name': e.location_name,
                    'address': e.location_address,
                    'latitude': e.location_latitude,
                    'longitude': e.location_longitude
                } if e.location_latitude and e.location_longitude else None,
                'event_imgs': (
                    ([e.cover.fileUrl] if e.cover else []) +
                    ([file.fileUrl for file in (e.moments[-1].image_files or [])] if e.moments and e.moments[-1].image_files else [])
                ),
                'club_name': e.club.clubName,
                'club_cover': e.club.cover.fileUrl if e.club.cover else None,
                'actual_startTime': e.actual_startTime.isoformat() if e.actual_startTime else None,
                'actual_endTime': e.actual_endTime.isoformat() if e.actual_endTime else None,
                'pre_startTime': e.pre_startTime.isoformat() if e.pre_startTime else None,
                'pre_endTime': e.pre_endTime.isoformat() if e.pre_endTime else None,
                'cover': e.cover.fileUrl if e.cover else None,
                'real_cost': e.real_cost,
                'budget': e.budget,
                'join_count': len([j for j in e.eventjoins if not getattr(j, 'isDelete', False)]),
                'is_ended': e.actual_endTime is not None,
                'is_cancelled': e.is_cancelled,
                'cur_user_managed': is_managed,
                'cur_user_can_join': is_member and not is_managed and ej_active is None,
                'cur_user_is_joined': ej_active is not None,
                'cur_user_join_date': ej_active.joinDate.isoformat() if ej_active and ej_active.joinDate else None,
                'cur_user_clockin_date': (
                    ej_active.clockinDate.isoformat()
                    if ej_active and isinstance(ej_active.clockinDate, datetime)
                    else None
                ),
            })

        data_out = {
            'records': public_records,
            'pagination': {
                'total_pages': total_pages,
                'current_page': page,
                'page_size': PAGE_SIZE,
                'total_records': total_records
            },
        }
        if want_iso:
            data_out['featured_isotope'] = featured_isotope

        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data': data_out
        })
    else:  # month模式
        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data': [{
                'event_id': e.eventID,
                'title': e.title,
                'club_name': club.clubName,
                'startTime': e.actual_startTime.isoformat() if e.actual_startTime else e.pre_startTime.isoformat(),
                'join_count': len(e.eventjoins),
                'clockin_count': sum(1 for ej in e.eventjoins if ej.clockinDate is not None),
                'cover': e.cover.fileUrl if e.cover else None,
                'is_ended': e.actual_endTime is not None,
                'is_cancelled': e.is_cancelled,
            } for e in club_events]
        })

# 新增热度活动接口 - 全局智能推荐排序
@bp.route('/heat/list', methods=['GET'])
@jwt_required()
def get_hot_events():
    # 权限检查
    has_permission, message = check_permission(event.get_hot_events.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200
    
    # 获取当前用户
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 获取用户加入的所有未删除社团ID
    joined_club_ids = set()
    user_departments = set()
    for m in cur_user.clubmembers:
        if not m.isDelete:  # 成员记录未删除
            club = Club.query.filter_by(clubID=m.clubID, isDelete=False).first()
            if club:  # 协会未删除
                joined_club_ids.add(m.clubID)
                # 收集用户相关部门信息
                if hasattr(cur_user, 'department') and cur_user.department:
                    user_departments.add(cur_user.department)

    # 获取所有未结束且未取消的活动（全局推荐）
    all_ongoing_events = Event.query.join(Event.club).filter(
        Event.actual_endTime.is_(None),
        Event.is_cancelled == False,
        Club.isDelete == False  # 过滤掉已删除的协会
    ).all()

    # 计算时间范围
    now = datetime.now()
    one_day = timedelta(days=1)
    three_days = timedelta(days=3)
    one_week = timedelta(days=7)

    # 智能排序算法
    def calculate_event_score(event_item):
        score = 0.0
        
        # 1. 参与人数热度 (25%)
        join_count = len(event_item.eventjoins)
        if join_count > 0:
            score += min(join_count / 20.0, 1.0) * 25
        
        # 2. 时间紧迫性 (25%) - 即将开始的活动优先
        start_time = event_item.actual_startTime if event_item.actual_startTime else event_item.pre_startTime
        if start_time:
            time_diff = start_time - now
            if time_diff.total_seconds() > 0:  # 未开始的活动
                if time_diff <= one_day:
                    score += 25  # 1天内开始
                elif time_diff <= three_days:
                    score += 20  # 3天内开始
                elif time_diff <= one_week:
                    score += 15  # 1周内开始
                else:
                    score += 5   # 超过1周
            else:
                # 已开始但未结束的活动
                score += 10
        
        # 3. 用户相关性 (30%) - 最重要的因素
        user_relevance = 0
        
        # 用户已加入该活动，分数为0（不推荐已参加的；不含已退出）
        if _event_user_has_active_join(event_item, cur_user):
            user_relevance = 0
        # 用户是该协会成员但未参加活动
        elif event_item.clubID in joined_club_ids:
            user_relevance = 25  # 高优先级
        # 用户不是该协会成员
        else:
            # 检查协会中是否有同部门的人
            if user_departments:
                club_members = [m for m in event_item.club.members if not m.isDelete]
                same_dept_count = sum(1 for m in club_members 
                                    if hasattr(m.user, 'department') and m.user.department in user_departments)
                if same_dept_count > 0:
                    user_relevance = 15  # 中等优先级
                else:
                    user_relevance = 5   # 低优先级
            else:
                user_relevance = 5
        
        score += user_relevance
        
        # 4. 活动新鲜度 (20%) - 最近创建的活动
        if hasattr(event_item, 'createDate') and event_item.createDate:
            days_since_created = (now - event_item.createDate).days
            if days_since_created <= 1:
                score += 20  # 1天内创建
            elif days_since_created <= 3:
                score += 15  # 3天内创建
            elif days_since_created <= 7:
                score += 10  # 1周内创建
            else:
                score += 5   # 超过1周
        else:
            score += 5  # 默认分数
        
        # 额外加分项
        # 活动有封面图片
        if event_item.cover:
            score += 2
        
        # 活动有详细位置信息
        if (hasattr(event_item, 'location_latitude') and event_item.location_latitude and 
            hasattr(event_item, 'location_longitude') and event_item.location_longitude):
            score += 2
        
        # 活动描述详细
        if event_item.message and len(event_item.message) > 50:
            score += 1
        
        return score

    # 计算分数并排序
    event_scores = [(event_item, calculate_event_score(event_item)) for event_item in all_ongoing_events]
    sorted_events = sorted(event_scores, key=lambda x: x[1], reverse=True)
    
    # 进一步筛选，确保多样性
    final_events = []
    seen_clubs = set()
    
    for event_item, score in sorted_events:
        # 限制每个协会最多推荐2个活动
        club_id = event_item.clubID
        club_event_count = sum(1 for e, s in final_events if e.clubID == club_id)
        if club_event_count >= 2:
            continue
        
        final_events.append((event_item, score))
        
        if len(final_events) >= 8:  # 取前8个候选
            break
    
    # 最终筛选出前5个
    top_events = [event_item for event_item, score in final_events[:5]]

    return jsonify({
        'Flag': '4000',
        'message': '获取成功',
        'data': [{
            'event_id': e.eventID,
            'title': e.title,
            'club_id': e.club.clubID,
            'club_name': e.club.clubName,
            'location': e.location,
            'location_data': {
                'latitude': e.location_latitude if hasattr(e, 'location_latitude') else None,
                'longitude': e.location_longitude if hasattr(e, 'location_longitude') else None,
                'name': e.location_name if hasattr(e, 'location_name') else None,
                'address': e.location_address if hasattr(e, 'location_address') else None
            } if (hasattr(e, 'location_latitude') and e.location_latitude) else None,
            'premap_url': (
                current_app.config['GEOAPIFY_MAP_URL'].format(
                    width=600, 
                    height=400, 
                    longitude=e.location_longitude, 
                    latitude=e.location_latitude, 
                    zoom=14
                ) + f"&apiKey={current_app.config['GEOAPIFY_API_KEY']}"
                if (hasattr(e, 'location_latitude') and e.location_latitude and 
                    hasattr(e, 'location_longitude') and e.location_longitude) 
                else None
            ),
            'description': e.message,
            'join_count': len(e.eventjoins),
            'pre_startTime': e.pre_startTime.isoformat(),
            'pre_endTime': e.pre_endTime.isoformat(),
            'actual_startTime': e.actual_startTime.isoformat() if isinstance(e.actual_startTime, datetime) else e.actual_startTime,
            'actual_endTime': e.actual_endTime.isoformat() if isinstance(e.actual_endTime, datetime) else e.actual_endTime,
            'cover_url': e.cover.fileUrl if e.cover else None,
            # 用户状态字段
            'cur_user_managed': any(manager.userID == cur_user.userID for manager in e.club.managers),
            'cur_user_is_joined': _event_user_has_active_join(e, cur_user),
            'cur_user_can_join': (
                e.clubID in joined_club_ids and 
                not _event_user_has_active_join(e, cur_user)
            ),
            'cur_user_is_club_member': e.clubID in joined_club_ids,
            # 最新5位参加人员
            'latest_joins': [
                {
                    'user_id': ej.user.userID,
                    'user_name': ej.user.userName,
                    'avatar': ej.user.avatar.fileUrl if ej.user.avatar else None,
                    'join_date': ej.joinDate.isoformat() if ej.joinDate else None
                }
                for ej in sorted(
                    [j for j in e.eventjoins if not getattr(j, 'isDelete', False)],
                    key=lambda x: x.joinDate or datetime.min,
                    reverse=True,
                )[:5]
                if ej.user  # Only include joins where user exists
            ]
        } for e in top_events]
    })

# 新增取消活动接口
@bp.route('/<int:event_id>/cancel', methods=['POST'])
@jwt_required()
def cancel_event(event_id):
    # 权限检查
    has_permission, message = check_permission(event.cancel_event.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200
    
    event_to_cancel = Event.query.filter_by(eventID=event_id).first()
    if not event_to_cancel:
        return jsonify({'Flag': '4001', 'message': '活动不存在'}), 200

    # 后端验证
    if event_to_cancel.actual_endTime is not None:
        return jsonify({'Flag': '4001', 'message': '活动已结束，无法取消'}), 200
    
    if event_to_cancel.is_cancelled:
        return jsonify({'Flag': '4001', 'message': '活动已取消'}), 200

    event_to_cancel.is_cancelled = True
    db.session.commit()
    return jsonify({
        'Flag':'4000',
        'message': '活动取消成功',
        'data':{
            'clubID':event_to_cancel.club.clubID,
            'clubName':event_to_cancel.club.clubName,
            'eventID':event_to_cancel.eventID,
            'authorID':event_to_cancel.authorID,
            'title':event_to_cancel.title
        }
    })

