from flask import Blueprint, jsonify, request, current_app
import os
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..models import Event, User, ClubMember, EventJoin, Club, Schedule, ScheduleJoin, Message, File
from .. import db, TEST_MODE
from datetime import datetime, timedelta
from sqlalchemy import and_
from zoneinfo import ZoneInfo
import threading
import time
from dateutil.relativedelta import relativedelta  # 新增导入
from app.permission import check_permission, schedule
from minio import Minio
from minio.error import S3Error
import uuid
import io

bp = Blueprint('schedule', __name__, url_prefix='/api/v1/schedule')

# 自动化机制相关函数
def get_last_event_time(schedule):
    """获取计划的最后一次活动计划开始时间（新增时区处理）"""
    if not schedule.schedule_events:
        return schedule.startTime.astimezone(ZoneInfo('Asia/Shanghai'))
    
    latest_event = max(schedule.schedule_events, key=lambda e: e.pre_startTime)
    return latest_event.pre_startTime.astimezone(ZoneInfo('Asia/Shanghai'))

def calculate_next_time(schedule):
    """计算下次应创建活动的时间"""
    last_time = get_last_event_time(schedule)
    config = schedule.time_config or {}
    now = datetime.now(ZoneInfo('Asia/Shanghai'))
    
    if schedule.schedule_type == 'weekly':
        # 处理每周模式：找到下一个应该执行的星期几
        weekdays = config.get('weekdays', [])
        if not weekdays:
            return None
        
        # 从上次活动时间的第二天开始找
        search_date = last_time.date() + timedelta(days=1)
        
        # 最多搜索14天（两周）
        for i in range(14):
            check_date = search_date + timedelta(days=i)
            if check_date.weekday() in weekdays:
                return datetime.combine(
                    check_date,
                    datetime.min.time().replace(
                        hour=config.get('hour', 0),
                        minute=config.get('minute', 0)
                    )
                ).replace(tzinfo=ZoneInfo('Asia/Shanghai'))
    
    elif schedule.schedule_type == 'monthly':
        # 处理每月模式：找到下一个应该执行的日期
        month_days = config.get('days', [1])
        if not month_days:
            return None
        
        # 从下个月开始找
        next_month = last_time.replace(day=1) + relativedelta(months=1)
        
        # 在下个月中找第一个有效日期
        for day in sorted(month_days):
            try:
                next_date = next_month.replace(
                    day=day,
                    hour=config.get('hour', 0),
                    minute=config.get('minute', 0),
                    second=0,
                    microsecond=0
                )
                return next_date.replace(tzinfo=ZoneInfo('Asia/Shanghai'))
            except ValueError:
                # 如果日期无效（如2月30日），继续下一个
                continue
    
    else:  # 默认每日模式
        # 日模式：每天执行，使用time_config中的时间
        next_date = last_time + timedelta(days=1)
        
        # 如果有time_config，使用其中的时间
        if config:
            next_date = next_date.replace(
                hour=config.get('hour', next_date.hour),
                minute=config.get('minute', next_date.minute),
                second=0,
                microsecond=0
            )
        
        return next_date.replace(tzinfo=ZoneInfo('Asia/Shanghai'))
    
    return None

def should_create_new_event(schedule):
    """判断是否应该创建新活动（新增提前量检查）"""
    if schedule.endTime:
        return False
    
    now = datetime.now(ZoneInfo('Asia/Shanghai'))
    
    # 计算下次活动时间
    next_time = calculate_next_time(schedule)
    if not next_time:
        return False  # 如果无法计算下次时间，不创建活动
    
    # 🔧 新增：检查是否已经有同一时间的活动存在
    # 查找是否已经存在预计开始时间在下次时间前后1小时内的活动
    time_window_start = next_time - timedelta(hours=1)
    time_window_end = next_time + timedelta(hours=1)
    
    existing_events = [
        event for event in schedule.schedule_events
        if (event.pre_startTime and 
            time_window_start <= event.pre_startTime.replace(tzinfo=ZoneInfo('Asia/Shanghai')) <= time_window_end)
    ]
    
    if existing_events:
        return False  # 已经存在相近时间的活动，不重复创建
    
    # 检查是否在提前创建窗口内
    advance_window_start = next_time - timedelta(hours=schedule.advance_hours)
    
    # 🔧 修改：确保当前时间在提前窗口内，且未到活动开始时间
    return advance_window_start <= now < next_time

def create_event_from_schedule(schedule):
    """根据计划创建新活动（调整时间设置）"""
    prototype = schedule.prototype_event
    if not prototype:
        return None
    
    # 先计算下次活动的准确时间
    next_time = calculate_next_time(schedule)
    if not next_time:
        # 如果无法计算下次时间，使用配置的时间
        config = schedule.time_config or {}
        next_time = datetime.now(ZoneInfo('Asia/Shanghai')).replace(
            hour=config.get('hour', 0),
            minute=config.get('minute', 0),
            second=0,
            microsecond=0
        )
    
    # 计算活动持续时间
    if prototype.pre_endTime and prototype.pre_startTime:
        duration = prototype.pre_endTime - prototype.pre_startTime
        next_end_time = next_time + duration
    else:
        # 如果原型活动没有结束时间，默认持续2小时
        next_end_time = next_time + timedelta(hours=2)
    
    # 创建新活动，使用计算出的正确时间
    new_event = Event(
        clubID=prototype.clubID,
        title=prototype.title,
        message=prototype.message,
        location=prototype.location,
        location_latitude=prototype.location_latitude,
        location_longitude=prototype.location_longitude,
        location_name=prototype.location_name,
        location_address=prototype.location_address,
        authorID=prototype.authorID,
        pre_startTime=next_time,  # 🔧 修复：使用计算出的下次时间
        pre_endTime=next_end_time,  # 🔧 修复：使用计算出的结束时间
        budget=prototype.budget,
        scheduleID=schedule.scheduleID,
        is_cancelled=False
    )
    
    db.session.add(new_event)
    db.session.flush()
    
    # 🔧 修改：完整复制原型活动的图片（包括MinIO文件和数据库记录）
    try:
        # 获取原型活动的所有图片记录
        prototype_images = File.query.filter_by(
            refEventID=prototype.eventID,
            fileType='image'
        ).order_by(File.order).all()
        
        if prototype_images:
            # 获取MinIO客户端
            minio_client = get_minio_client()
            bucket_name = current_app.config.get('MINIO_BUCKET', 'manage-mate')
            
            for original_file in prototype_images:
                try:
                    # 从原始URL中提取文件路径
                    original_file_path = original_file.fileUrl.split('/api/v1/file/download/')[-1]
                    
                    # 生成新的文件路径
                    file_ext = original_file.originalName.split('.')[-1] if '.' in original_file.originalName else 'jpg'
                    date_path = datetime.now().strftime('%Y/%m/%d')
                    timestamp = str(int(time.time()))
                    unique_id = str(uuid.uuid4())[:8]
                    new_file_path = f"{date_path}/{timestamp}_{unique_id}.{file_ext}"
                    
                    # 从MinIO复制文件
                    # 首先获取原文件
                    original_file_obj = minio_client.get_object(bucket_name, original_file_path)
                    file_data = original_file_obj.read()
                    original_file_obj.close()
                    
                    # 上传到新路径
                    file_stream = io.BytesIO(file_data)
                    minio_client.put_object(
                        bucket_name,
                        new_file_path,
                        file_stream,
                        length=len(file_data),
                        content_type=f"image/{file_ext}"
                    )
                    
                    # 生成新的访问URL
                    base_url = current_app.config.get('BASE_URL', 'https://www.vhhg.top')
                    new_file_url = f"{base_url}/api/v1/file/download/{new_file_path}"
                    
                    # 创建新的File记录
                    new_file_record = File(
                        userID=prototype.authorID,  # 使用原型活动的作者作为上传者
                        originalName=original_file.originalName,
                        fileUrl=new_file_url,
                        fileSize=len(file_data),
                        fileType=original_file.fileType,
                        uploadTime=datetime.utcnow(),
                        order=original_file.order,
                        refEventID=new_event.eventID  # 关联到新活动
                    )
                    
                    db.session.add(new_file_record)
                    
                    print(f"  ✅ 复制图片: {original_file.originalName} -> {new_file_path}")
                    
                except S3Error as e:
                    print(f"  ❌ 复制图片失败 (MinIO错误): {original_file.originalName}, 错误: {str(e)}")
                    continue
                except Exception as e:
                    print(f"  ❌ 复制图片失败: {original_file.originalName}, 错误: {str(e)}")
                    continue
            
            print(f"  📸 成功复制 {len(prototype_images)} 张图片到新活动")
        
    except Exception as e:
        print(f"  ⚠️  图片复制过程出错: {str(e)}")
        # 图片复制失败不影响活动创建，继续执行

    # 自动将订阅者加入新活动
    subscribed_user_ids = set()
    for schedule_join in schedule.scheduleJoins:
        subscribed_user_ids.add(schedule_join.userID)
        event_join = EventJoin(
            eventID=new_event.eventID,
            userID=schedule_join.userID,
            joinDate=datetime.utcnow(),
            isDelete=False,
        )
        db.session.add(event_join)

    # 原型活动作者未在订阅者列表中时，为其补充参与记录
    if prototype.authorID not in subscribed_user_ids:
        db.session.add(
            EventJoin(
                eventID=new_event.eventID,
                userID=prototype.authorID,
                joinDate=datetime.utcnow(),
                isDelete=False,
            )
        )

    # 为所有订阅日程的用户生成消息
    for schedule_join in schedule.scheduleJoins:
        message = Message(
            url=f'/packageEvent/event-detail/index?eventId={new_event.eventID}',
            content='您订阅的日程发布了一个新的活动，已为您自动加入该活动',
            booker_id=schedule_join.userID,
            operation='schedule_new_event'
        )
        db.session.add(message)
    
    # 为活动作者生成消息（如果作者没有订阅该日程）
    author_subscribed = any(sj.userID == prototype.authorID for sj in schedule.scheduleJoins)
    if not author_subscribed:
        author_message = Message(
            url=f'/packageEvent/event-manage/index?eventId={new_event.eventID}',
            content='您创建的日程发布了一个新的活动',
            booker_id=prototype.authorID,
            operation='schedule_new_event_author'
        )
        db.session.add(author_message)
    
    db.session.commit()
    return new_event

def get_minio_client():
    """获取MinIO客户端"""
    try:
        return Minio(
            current_app.config['MINIO_ENDPOINT'],
            access_key=current_app.config['MINIO_ACCESS_KEY'],
            secret_key=current_app.config['MINIO_SECRET_KEY'],
            secure=current_app.config['MINIO_SECURE']
        )
    except Exception as e:
        current_app.logger.error(f"MinIO客户端初始化失败: {str(e)}")
        raise

def process_all_schedules():
    """处理所有活跃的计划"""
    try:
        active_schedules = Schedule.query.filter(Schedule.endTime.is_(None)).all()
        
        for schedule in active_schedules:
            
            # 🔧 新增：获取当前状态信息
            now = datetime.now(ZoneInfo('Asia/Shanghai'))
            last_time = get_last_event_time(schedule)
            next_time = calculate_next_time(schedule)
            
            # 检查是否应该创建新活动
            should_create = should_create_new_event(schedule)
            
            if should_create:
                # 🔧 新增：创建前再次检查，避免并发问题
                # 重新获取最新的schedule对象
                fresh_schedule = Schedule.query.filter_by(scheduleID=schedule.scheduleID).first()
                if fresh_schedule and should_create_new_event(fresh_schedule):
                    new_event = create_event_from_schedule(fresh_schedule)
                    if new_event:
                        print(f"✅ 成功创建活动 ID: {new_event.eventID}, 开始时间: {new_event.pre_startTime}")
                        # 提交事务，确保数据持久化
                        db.session.commit()


    except Exception as e:
        print(f"❌ 处理计划时出错: {e}")
        import traceback
        traceback.print_exc()
        db.session.rollback()

def schedule_worker(app):
    """后台工作线程，改为每分钟检查"""
    while True:
        try:
            with app.app_context():
                print("开始检查计划")
                process_all_schedules()
        except Exception as e:
            print(f"计划工作线程出错: {e}")
        
        time.sleep(60)  # 从每小时改为每分钟

# 启动自动化机制
def start_schedule_automation(app):
    """启动计划自动化机制"""
    if not hasattr(app, '_schedule_thread_started'):
        app._schedule_thread_started = True
        thread = threading.Thread(target=schedule_worker, args=(app,), daemon=True)
        thread.start()
        print("计划自动化机制已启动")

# 手动触发计划处理接口
@bp.route('/trigger_automation', methods=['POST'])
@jwt_required()
def trigger_automation():
    """手动触发计划自动化处理"""
    # 权限检查
    has_permission, message = check_permission(schedule.trigger_automation.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()
    
    try:
        process_all_schedules()
        return jsonify({'Flag':'4000','message': '自动化处理完成'})
    except Exception as e:
        return jsonify({'Flag':'4001','message': f'处理失败: {str(e)}'}), 200

# 获取计划列表
@bp.route('/list/<string:show>', methods=['GET'])
@jwt_required()
def get_schedule_list(show):
    # 权限检查
    has_permission, message = check_permission(schedule.get_schedule_list.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    # 参数处理
    mode = request.args.get('mode', 'page')
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    page = request.args.get('page', default=1, type=int)

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    if not cur_user:
        return jsonify({'Flag':'4004','message': '用户不存在'}), 200

    # 获取基础数据
    base_query = Schedule.query
    schedule_list = base_query.all()
    
    # Show参数过滤 - 基于计划本身的开始和结束时间
    if show == 'going':
        schedule_list = [s for s in schedule_list if s.endTime is None]
    elif show == 'ended':
        schedule_list = [s for s in schedule_list if s.endTime is not None]
    elif show != 'all':
        return jsonify({'Flag':'4001','message': '参数错误，show只能是going/ended/all'}), 200

    # 时间过滤逻辑 - 基于计划的开始时间
    if mode == 'month':
        if not year or not month:
            return jsonify({'Flag':'4001','message': '需要year和month参数'}), 200
        try:
            start_date = datetime(year, month, 1)
            end_date = datetime(year, month+1, 1) if month < 12 else datetime(year+1, 1, 1)
            schedule_list = [s for s in schedule_list if start_date <= s.startTime < end_date]
        except ValueError as e:
            return jsonify({'Flag':'4001','message': f'日期参数错误：{str(e)}'}), 200

    # 排序逻辑 - 基于计划的开始时间
    schedule_list = sorted(
        schedule_list,
        key=lambda x: (x.endTime is None, x.startTime),
        reverse=True
    )

    # 分页处理
    if mode == 'page':
        PAGE_SIZE = 10
        total_records = len(schedule_list)
        total_pages = (total_records + PAGE_SIZE - 1) // PAGE_SIZE
        
        start_index = (page - 1) * PAGE_SIZE
        end_index = start_index + PAGE_SIZE
        paged_schedules = schedule_list[start_index:end_index]

        return jsonify({
            'Flag':'4000',
            'message': '调用成功',
            'data':{
                'records': [{
                    'schedule_id': schedule.scheduleID,
                    'prototype_event_id': schedule.prototype_eventID,
                    'prototype_event_title': schedule.prototype_event.title if schedule.prototype_event else None,
                    'prototype_event_club_name': schedule.prototype_event.club.clubName if schedule.prototype_event and schedule.prototype_event.club else None,
                    'start_time': schedule.startTime.isoformat(),
                    'end_time': schedule.endTime.isoformat() if isinstance(schedule.endTime, datetime) else schedule.endTime,
                    'join_count': len(schedule.scheduleJoins),
                    'event_count': len(schedule.schedule_events),
                    'cur_user_is_joined': any(sj.userID == cur_user.userID for sj in schedule.scheduleJoins),
                    'cur_user_managed': schedule.prototype_event and schedule.prototype_event.authorID == cur_user.userID,
                    'cur_user_can_join': (
                        schedule.prototype_event and 
                        any(m.clubID == schedule.prototype_event.clubID for m in cur_user.clubmembers) and
                        not any(sj.userID == cur_user.userID for sj in schedule.scheduleJoins) and
                        schedule.endTime is None and
                        schedule.prototype_event.authorID != cur_user.userID  # 作者不能加入自己的计划
                    ),
                    'is_active': schedule.endTime is None
                } for schedule in paged_schedules],
                'pagination': {
                    'total_pages': total_pages,
                    'current_page': page,
                    'page_size': PAGE_SIZE,
                    'total_records': total_records
                }
            }
        })
    else:  # 非分页模式
        return jsonify({
            'Flag':'4000',
            'message': '调用成功',
            'data':[{
                'schedule_id': schedule.scheduleID,
                'prototype_event_id': schedule.prototype_eventID,
                'prototype_event_title': schedule.prototype_event.title if schedule.prototype_event else None,
                'prototype_event_club_name': schedule.prototype_event.club.clubName if schedule.prototype_event and schedule.prototype_event.club else None,
                'start_time': schedule.startTime.isoformat(),
                'end_time': schedule.endTime.isoformat() if isinstance(schedule.endTime, datetime) else schedule.endTime,
                'join_count': len(schedule.scheduleJoins),
                'event_count': len(schedule.schedule_events),
                'cur_user_is_joined': any(sj.userID == cur_user.userID for sj in schedule.scheduleJoins),
                'cur_user_managed': schedule.prototype_event and schedule.prototype_event.authorID == cur_user.userID,
                'cur_user_can_join': (
                    schedule.prototype_event and 
                    any(m.clubID == schedule.prototype_event.clubID for m in cur_user.clubmembers) and
                    not any(sj.userID == cur_user.userID for sj in schedule.scheduleJoins) and
                    schedule.endTime is None and
                    schedule.prototype_event.authorID != cur_user.userID  # 作者不能加入自己的计划
                ),
                'is_active': schedule.endTime is None
            } for schedule in schedule_list]}
        )

# 创建计划
@bp.route('/create/<int:event_id>', methods=['PUT'])
@jwt_required()
def create_schedule(event_id):
    # 权限检查
    has_permission, message = check_permission(schedule.create_schedule.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    prototype_event_id = event_id
    data = request.get_json()
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    schedule_type = data.get('schedule_type')
    weekdays = data.get('weekdays')
    month_days = data.get('month_days')
    time_of_day = data.get('time_of_day')
    advance_hours = data.get('advance_hours', 0)
    
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 验证原型事件是否存在
    prototype_event = Event.query.filter_by(eventID=prototype_event_id).first()
    if not prototype_event:
        return jsonify({'Flag':'4004','message': '原型事件不存在'}), 200

    # 🚨 检查活动是否已经关联了活跃的日程，防止重复创建
    if prototype_event.scheduleID is not None:
        # 获取关联的日程
        existing_schedule = Schedule.query.filter_by(scheduleID=prototype_event.scheduleID).first()
        # 如果关联的日程存在且未结束，则不允许创建新日程
        if existing_schedule and existing_schedule.endTime is None:
            return jsonify({'Flag':'4003','message': '该活动已经关联了活跃的日程，无法重复创建'}), 200
        # 如果关联的日程已结束或不存在，清除scheduleID以便创建新日程
        elif not existing_schedule or existing_schedule.endTime is not None:
            prototype_event.scheduleID = None
            db.session.commit()

    # 🚨 简化时间处理
    try:
        start_datetime = datetime.fromisoformat(start_time) if start_time else datetime.utcnow()
        end_datetime = datetime.fromisoformat(end_time) if end_time else None
    except ValueError:
        return jsonify({'Flag':'4001','message': '时间格式错误'}), 200

    # 参数验证
    if schedule_type not in ['weekly', 'monthly']:
        return jsonify({'Flag':'4001','message': '无效的调度类型'}), 200

    # 构建时间配置
    time_config = {}
    try:
        # 解析时间
        hour, minute = map(int, time_of_day.split(':'))
        time_config['hour'] = hour
        time_config['minute'] = minute
        
        # 根据调度类型设置执行日期
        if schedule_type == 'weekly':
            weekdays = [int(d) for d in weekdays]
            if not weekdays or not all(0 <= d <= 6 for d in weekdays):
                return jsonify({'Flag':'4001','message': '周模式需要有效的星期参数（0-6）'}), 200
            time_config['weekdays'] = weekdays
        elif schedule_type == 'monthly':
            month_days = [int(d) for d in month_days]
            if not month_days or not all(1 <= d <= 31 for d in month_days):
                return jsonify({'Flag':'4001','message': '月模式需要有效的日期参数（1-31）'}), 200
            time_config['days'] = month_days
            
    except ValueError:
        return jsonify({'Flag':'4001','message': '时间格式错误'}), 200

    try:
        schedule_create = Schedule(
            prototype_eventID=prototype_event_id,
            startTime=start_datetime,
            endTime=end_datetime,
            schedule_type=schedule_type,
            time_config=time_config,
            advance_hours=advance_hours,
            next_check_time=datetime.now(ZoneInfo('Asia/Shanghai'))
        )
            
        db.session.add(schedule_create)
        db.session.flush()
        
        # 将原型活动的scheduleID设置为新创建的计划ID
        prototype_event.scheduleID = schedule_create.scheduleID
        
        db.session.commit()
        
        return jsonify({
            'Flag':'4000',
            'message': '创建计划成功',
            'data':{
                'schedule_id': schedule_create.scheduleID,
                'prototype_event_id': schedule_create.prototype_eventID,
                'schedule_type': schedule_create.schedule_type,
                'time_config': schedule_create.time_config,
                'advance_hours': schedule_create.advance_hours,
                'start_time': schedule_create.startTime.isoformat(),
                'end_time': schedule_create.endTime.isoformat() if isinstance(schedule_create.endTime, datetime) else schedule_create.endTime
            }
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'Flag':'4001','message': f'创建日程失败：{str(e)}'}), 200

# 更新计划
@bp.route('/<int:schedule_id>/update', methods=['POST'])
@jwt_required()
def update_schedule(schedule_id):
    data = request.get_json()
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    schedule_type = data.get('schedule_type')
    weekdays = data.get('weekdays')
    month_days = data.get('month_days')
    time_of_day = data.get('time_of_day')
    advance_hours = data.get('advance_hours', 0)
    # 权限检查
    has_permission, message = check_permission(schedule.update_schedule.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200


    
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 验证计划是否存在
    schedule_show = Schedule.query.filter_by(scheduleID=schedule_id).first()
    if not schedule_show:
        return jsonify({'Flag':'4004','message': '计划不存在'}), 200

    # 🚨 简化时间处理
    try:
        start_datetime = datetime.fromisoformat(start_time) if start_time else schedule_show.startTime
        end_datetime = datetime.fromisoformat(end_time) if end_time else None
    except ValueError:
        return jsonify({'Flag':'4001','message': '时间格式错误'}), 200

    # 参数验证
    if schedule_type not in ['weekly', 'monthly']:
        return jsonify({'Flag':'4001','message': '无效的调度类型'}), 200

    # 构建时间配置
    time_config = {}
    try:
        # 解析时间
        hour, minute = map(int, time_of_day.split(':'))
        time_config['hour'] = hour
        time_config['minute'] = minute
        
        # 根据调度类型设置执行日期
        if schedule_type == 'weekly':
            if not weekdays or not all(0 <= d <= 6 for d in weekdays):
                return jsonify({'Flag':'4001','message': '周模式需要有效的星期参数（0-6）'}), 200
            time_config['weekdays'] = weekdays
        elif schedule_type == 'monthly':
            if not month_days or not all(1 <= d <= 31 for d in month_days):
                return jsonify({'Flag':'4001','message': '月模式需要有效的日期参数（1-31）'}), 200
            time_config['days'] = month_days
            
    except ValueError:
        return jsonify({'Flag':'4001','message': '时间格式错误'}), 200

    try:
        # 全量更新所有字段（除了scheduleID和prototype_eventID）
        schedule_show.startTime = start_datetime
        schedule_show.endTime = end_datetime
        schedule_show.schedule_type = schedule_type
        schedule_show.time_config = time_config
        schedule_show.advance_hours = advance_hours
        schedule_show.next_check_time = datetime.now(ZoneInfo('Asia/Shanghai'))
        
        db.session.commit()
        
        return jsonify({
            'Flag':'4000',
            'message': '更新计划成功',
            'data':{
                'schedule_id': schedule_show.scheduleID,
                'prototype_event_id': schedule_show.prototype_eventID,
                'schedule_type': schedule_show.schedule_type,
                'time_config': schedule_show.time_config,
                'advance_hours': schedule_show.advance_hours,
                'start_time': schedule_show.startTime.isoformat(),
                'end_time': schedule_show.endTime.isoformat() if isinstance(schedule_show.endTime, datetime) else schedule_show.endTime
            }
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'Flag':'4001','message': f'更新日程失败：{str(e)}'}), 200

# 计划开始
@bp.route('/<int:schedule_id>/begin', methods=['GET'])
@jwt_required()
def schedule_begin(schedule_id):
    # 权限检查
    has_permission, message = check_permission(schedule.schedule_begin.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    schedule_show = Schedule.query.filter_by(scheduleID=schedule_id).first()
    if schedule_show is None:
        return jsonify({'Flag':'4004','message': '计划不存在'}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    schedule_show.startTime = datetime.now(ZoneInfo('Asia/Shanghai'))
    db.session.commit()
    return jsonify({
        'Flag':'4000',
        'message': '计划开始',
        'data':{
            'schedule_id': schedule_show.scheduleID,
            'prototype_event_title': schedule_show.prototype_event.title if schedule_show.prototype_event else None,
            'start_time': schedule_show.startTime.isoformat()
        }
    })

# 计划结束
@bp.route('/<int:schedule_id>/end', methods=['GET'])
@jwt_required()
def schedule_end(schedule_id):
    # 权限检查
    has_permission, message = check_permission(schedule.schedule_end.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    schedule_show = Schedule.query.filter_by(scheduleID=schedule_id).first()
    if schedule_show is None:
        return jsonify({'Flag':'4004','message': '计划不存在'}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    schedule_show.endTime = datetime.now(ZoneInfo('Asia/Shanghai'))
    db.session.commit()
    return jsonify({
        'Flag':'4000',
        'message': '计划结束',
        'data':{
            'schedule_id': schedule_show.scheduleID,
            'prototype_event_title': schedule_show.prototype_event.title if schedule_show.prototype_event else None,
            'end_time': schedule_show.endTime.isoformat()
        }
    })

# 获取单个计划详情
@bp.route('/<int:schedule_id>', methods=['GET'])
@jwt_required()
def get_schedule(schedule_id):
    # 权限检查
    has_permission, message = check_permission(schedule.get_schedule.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    schedule_show = Schedule.query.filter_by(scheduleID=schedule_id).first()
    if schedule_show is None:
        return jsonify({'Flag':'4004','message': '计划不存在'}), 200
        
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()
		
    # 通过关系属性获取用户参与记录
    user_join = next((sj for sj in cur_user.schedule_joins if sj.scheduleID == schedule_id), None)
    
    # 检查用户是否管理该计划
    is_managed = schedule_show.prototype_event and schedule_show.prototype_event.authorID == cur_user.userID
    
    # 检查用户是否可以加入该计划
    can_join = (
        schedule_show.prototype_event and 
        any(m.clubID == schedule_show.prototype_event.clubID for m in cur_user.clubmembers) and
        user_join is None and
        schedule_show.endTime is None and
        not is_managed  # 管理者不能加入自己的计划
    )
    
    return jsonify({
        'Flag':'4000',
        'message': '调用成功',
        'data':{
            'schedule_id': schedule_show.scheduleID,
            'prototype_event_id': schedule_show.prototype_eventID,
            'prototype_event': {
                'event_id': schedule_show.prototype_event.eventID,
                'title': schedule_show.prototype_event.title,
                'content': schedule_show.prototype_event.message,
                'location': schedule_show.prototype_event.location,
                'club_name': schedule_show.prototype_event.club.clubName if schedule_show.prototype_event.club else None
            } if schedule_show.prototype_event else None,
            'schedule_type': schedule_show.schedule_type,
            'time_config': schedule_show.time_config,
            'advance_hours': schedule_show.advance_hours,
            'start_time': schedule_show.startTime.isoformat(),
            'end_time': schedule_show.endTime.isoformat() if isinstance(schedule_show.endTime, datetime) else schedule_show.endTime,
            'join_count': len(schedule_show.scheduleJoins),
            'event_count': len(schedule_show.schedule_events),
            'cur_user_is_joined': user_join is not None,
            'cur_user_join_date': user_join.joinDate.isoformat() if user_join else None,
            'cur_user_managed': is_managed,
            'cur_user_can_join': can_join,
            'is_active': schedule_show.endTime is None
        }
    })

# 加入计划
@bp.route('/<int:schedule_id>/join', methods=['GET'])
@jwt_required()
def join_schedule(schedule_id):
    # 权限检查
    has_permission, message = check_permission(schedule.join_schedule.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    schedule_show = Schedule.query.filter_by(scheduleID=schedule_id).first()
    if schedule_show is None:
        return jsonify({'Flag':'4004','message': '计划不存在'}), 200

    # 检查计划是否已结束
    if schedule_show.endTime is not None:
        return jsonify({'Flag':'4003','message': '计划已结束，无法加入'}), 200

    # 检查是否是计划的作者
    if schedule_show.prototype_event and schedule_show.prototype_event.authorID == cur_user.userID:
        return jsonify({'Flag':'4003','message': '您是该计划的创建者，无法加入'}), 200

    # 检查是否已经加入
    if any(sj.scheduleID == schedule_id for sj in cur_user.schedule_joins):
        return jsonify({'Flag':'4003','message': '您已参加该计划'}), 200

    # 检查是否是相关社团成员（基于原型事件的社团）
    if schedule_show.prototype_event and not any(m.clubID == schedule_show.prototype_event.clubID for m in cur_user.clubmembers):
        return jsonify({'Flag':'4002','message': '您不是相关社团成员，无法参加该计划'}), 200

    join = ScheduleJoin(scheduleID=schedule_id, userID=cur_user.userID)
    db.session.add(join)
    db.session.commit()
    return jsonify({'Flag':'4000','message': '加入计划成功'})

# 退出计划
@bp.route('/<int:schedule_id>/quit', methods=['GET'])
@jwt_required()
def quit_schedule(schedule_id):
    # 权限检查
    has_permission, message = check_permission(schedule.quit_schedule.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    schedule_show = Schedule.query.filter_by(scheduleID=schedule_id).first()
    if schedule_show is None:
        return jsonify({'Flag':'4004','message': '计划不存在'}), 200

    # 通过关系属性查找具体的join记录
    join_record = next((sj for sj in cur_user.schedule_joins if sj.scheduleID == schedule_id), None)   
    if not join_record:
        return jsonify({'Flag':'4003','message': '您未参加该计划'}), 200

    db.session.delete(join_record)
    db.session.commit()
    return jsonify({'Flag':'4000','message': '退出计划成功'})

# 获取指定计划的参加人员列表
@bp.route('/<int:schedule_id>/members', methods=['GET'])
def get_schedule_members(schedule_id):
    # 权限检查
    has_permission, message = check_permission(schedule.get_schedule_members.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    schedule_show = Schedule.query.filter_by(scheduleID=schedule_id).first()
    if schedule_show is None:
        return jsonify({'Flag':'4004','message': '计划不存在'}), 200

    schedule_joins = ScheduleJoin.query.filter_by(scheduleID=schedule_id).all()

    return jsonify({
        'Flag':'4000',
        'message': '调用成功',
        'data':[{
            'user_id': sj.user.userID,
            'user_name': sj.user.userName,
            'avatar': sj.user.avatar,
            'join_date': sj.joinDate.isoformat() if sj.joinDate else None
        } for sj in schedule_joins]
    })

# 删除计划
@bp.route('/<int:schedule_id>/delete', methods=['POST'])
@jwt_required()
def delete_schedule(schedule_id):
    # 权限检查
    has_permission, message = check_permission(schedule.delete_schedule.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    schedule_show = Schedule.query.filter_by(scheduleID=schedule_id).first()

    if schedule_show is None:
        return jsonify({'Flag':'4004','message': '计划不存在'}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()
    
    # 删除相关的参与记录和事件
    db.session.delete(schedule_show)
    db.session.commit()
    return jsonify({'Flag':'4000','message': '删除计划成功'})

# 用户参加的计划列表
@bp.route('/user_joined/list/<string:show>', methods=['GET'])
@jwt_required()
def get_user_joined_schedule_list(show):
    # 权限检查
    has_permission, message = check_permission(schedule.get_user_joined_schedule_list.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    mode = request.args.get('mode', 'page')
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    page = request.args.get('page', default=1, type=int)

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    schedule_joins = cur_user.schedule_joins
    if not schedule_joins:
        return jsonify({'Flag':'4004','message': '用户未参加任何计划'}), 200

    # Count模式处理
    if mode == 'count':
        going_count = len([sj for sj in schedule_joins if sj.schedule.endTime is None])
        ended_count = len([sj for sj in schedule_joins if sj.schedule.endTime is not None])
        
        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data': {
                'going_count': going_count,
                'ended_count': ended_count,
                'total_count': len(schedule_joins)
            } if show == 'all' else {
                'count': going_count if show == 'going' else ended_count
            }
        })

    # 时间过滤逻辑
    if mode == 'month':
        if not year or not month:
            return jsonify({'Flag':'4001','message': '按月查询需要year和month参数'}), 200
        try:
            start_date = datetime(year, month, 1)
            end_date = datetime(year, month+1, 1) if month < 12 else datetime(year+1, 1, 1)
            filtered_schedules = [sj for sj in schedule_joins if start_date <= sj.schedule.startTime < end_date]
        except ValueError as e:
            return jsonify({'Flag':'4001','message': f'日期参数错误：{str(e)}'}), 200
    else:
        filtered_schedules = schedule_joins

    # Show参数过滤
    if show == 'going':
        filtered_schedules = [sj for sj in filtered_schedules if sj.schedule.endTime is None]
    elif show == 'ended':
        filtered_schedules = [sj for sj in filtered_schedules if sj.schedule.endTime is not None]
    elif show != 'all':
        return jsonify({'Flag':'4001','message': '参数错误，show只能是going/ended/all'}), 200

    # 排序逻辑
    filtered_schedules = sorted(
        filtered_schedules,
        key=lambda x: (x.schedule.endTime is None, x.schedule.startTime),
        reverse=True
    )

    # 分页处理
    if mode == 'page':
        PAGE_SIZE = 10
        total_records = len(filtered_schedules)
        total_pages = (total_records + PAGE_SIZE - 1) // PAGE_SIZE
        
        start_index = (page - 1) * PAGE_SIZE
        end_index = start_index + PAGE_SIZE
        paged_schedules = filtered_schedules[start_index:end_index]

        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data':{
                'records': [{
                    'schedule_id': sj.schedule.scheduleID,
                    'prototype_event_title': sj.schedule.prototype_event.title if sj.schedule.prototype_event else None,
                    'prototype_event_club_name': sj.schedule.prototype_event.club.clubName if sj.schedule.prototype_event and sj.schedule.prototype_event.club else None,
                    'join_date': sj.joinDate.isoformat() if sj.joinDate else None,
                    'start_time': sj.schedule.startTime.isoformat(),
                    'end_time': sj.schedule.endTime.isoformat() if isinstance(sj.schedule.endTime, datetime) else sj.schedule.endTime,
                    'cur_user_managed': sj.schedule.prototype_event and sj.schedule.prototype_event.authorID == cur_user.userID,
                    'is_active': sj.schedule.endTime is None
                } for sj in paged_schedules],
                'pagination': {
                    'total_pages': total_pages,
                    'current_page': page,
                    'page_size': PAGE_SIZE,
                    'total_records': total_records
                }
            }
        })
    else:  # 按月查询
        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data':[{
                'schedule_id': sj.schedule.scheduleID,
                'prototype_event_title': sj.schedule.prototype_event.title if sj.schedule.prototype_event else None,
                'prototype_event_club_name': sj.schedule.prototype_event.club.clubName if sj.schedule.prototype_event and sj.schedule.prototype_event.club else None,
                'join_date': sj.joinDate.isoformat() if sj.joinDate else None,
                'start_time': sj.schedule.startTime.isoformat(),
                'end_time': sj.schedule.endTime.isoformat() if isinstance(sj.schedule.endTime, datetime) else sj.schedule.endTime,
                'join_count': len(sj.schedule.scheduleJoins),
                'event_count': len(sj.schedule.schedule_events),
                'cur_user_managed': sj.schedule.prototype_event and sj.schedule.prototype_event.authorID == cur_user.userID,
                'is_active': sj.schedule.endTime is None
            } for sj in filtered_schedules]
        })

# 用户可参加的计划列表
@bp.route('/user_can_join/list/<string:show>', methods=['GET'])
@jwt_required()
def get_user_can_join_schedule_list(show):
    # 权限检查
    has_permission, message = check_permission(schedule.get_user_can_join_schedule_list.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    mode = request.args.get('mode', 'page')
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    page = request.args.get('page', default=1, type=int)

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 获取用户加入的社团
    user_clubs = [m.clubID for m in cur_user.clubmembers]
    
    # 获取这些社团相关的计划
    available_schedules = []
    for schedule in Schedule.query.all():
        # 检查是否是相关社团的计划且用户未参加且用户不是作者
        if (schedule.prototype_event and 
            schedule.prototype_event.clubID in user_clubs and
            not any(sj.userID == cur_user.userID for sj in schedule.scheduleJoins) and
            schedule.prototype_event.authorID != cur_user.userID):
            available_schedules.append(schedule)

    # Count模式处理
    if mode == 'count':
        going_count = len([s for s in available_schedules if s.endTime is None])
        ended_count = len([s for s in available_schedules if s.endTime is not None])
        
        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data': {
                'going_count': going_count,
                'ended_count': ended_count,
                'total_count': len(available_schedules)
            } if show == 'all' else {
                'count': going_count if show == 'going' else ended_count
            }
        })

    # 时间过滤逻辑
    if mode == 'month':
        if not year or not month:
            return jsonify({'Flag':'4001','message': '需要year和month参数'}), 200
        try:
            start_date = datetime(year, month, 1)
            end_date = datetime(year, month+1, 1) if month < 12 else datetime(year+1, 1, 1)
            available_schedules = [s for s in available_schedules if start_date <= s.startTime < end_date]
        except ValueError as e:
            return jsonify({'Flag':'4001','message': f'日期参数错误：{str(e)}'}), 200

    # Show参数过滤
    if show == 'going':
        filtered_schedules = [s for s in available_schedules if s.endTime is None]
    elif show == 'ended':
        filtered_schedules = [s for s in available_schedules if s.endTime is not None]
    elif show == 'all':
        filtered_schedules = available_schedules
    else:
        return jsonify({'Flag':'4001','message': '参数错误，show只能是going/ended/all'}), 200

    # 排序逻辑
    filtered_schedules = sorted(filtered_schedules, key=lambda x: (x.endTime is None, x.startTime), reverse=True)

    # 分页处理
    if mode == 'page':
        PAGE_SIZE = 10
        total_records = len(filtered_schedules)
        total_pages = (total_records + PAGE_SIZE - 1) // PAGE_SIZE
        
        paged_schedules = filtered_schedules[(page-1)*PAGE_SIZE : page*PAGE_SIZE]
        
        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data':{
                'records': [{
                    'schedule_id': schedule.scheduleID,
                    'prototype_event_title': schedule.prototype_event.title if schedule.prototype_event else None,
                    'prototype_event_club_name': schedule.prototype_event.club.clubName if schedule.prototype_event and schedule.prototype_event.club else None,
                    'start_time': schedule.startTime.isoformat(),
                    'end_time': schedule.endTime.isoformat() if isinstance(schedule.endTime, datetime) else schedule.endTime,
                    'join_count': len(schedule.scheduleJoins),
                    'event_count': len(schedule.schedule_events),
                    'cur_user_can_join': True,
                    'cur_user_managed': schedule.prototype_event and schedule.prototype_event.authorID == cur_user.userID
                } for schedule in paged_schedules],
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
                'schedule_id': schedule.scheduleID,
                'prototype_event_title': schedule.prototype_event.title if schedule.prototype_event else None,
                'prototype_event_club_name': schedule.prototype_event.club.clubName if schedule.prototype_event and schedule.prototype_event.club else None,
                'start_time': schedule.startTime.isoformat(),
                'end_time': schedule.endTime.isoformat() if isinstance(schedule.endTime, datetime) else schedule.endTime,
                'join_count': len(schedule.scheduleJoins),
                'event_count': len(schedule.schedule_events),
                'cur_user_managed': schedule.prototype_event and schedule.prototype_event.authorID == cur_user.userID
            } for schedule in filtered_schedules]
        })

# 用户管理的计划列表
@bp.route('/user_manage/list/<string:show>', methods=['GET'])
@jwt_required()
def get_user_manage_schedule_list(show):
    # 权限检查
    has_permission, message = check_permission(schedule.get_user_manage_schedule_list.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    mode = request.args.get('mode', 'page')
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    page = request.args.get('page', default=1, type=int)

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 获取用户管理的计划（基于原型事件的作者权限）
    managed_schedules = []
    for schedule in Schedule.query.all():
        if (schedule.prototype_event and 
            schedule.prototype_event.authorID == cur_user.userID):
            managed_schedules.append(schedule)

    # Count模式处理
    if mode == 'count':
        going_count = len([s for s in managed_schedules if s.endTime is None])
        ended_count = len([s for s in managed_schedules if s.endTime is not None])
        
        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data': {
                'going_count': going_count,
                'ended_count': ended_count,
                'total_count': len(managed_schedules)
            } if show == 'all' else {
                'count': going_count if show == 'going' else ended_count
            }
        })

    # 时间过滤
    if mode == 'month':
        if not year or not month:
            return jsonify({'Flag':'4001','message': '需要year和month参数'}), 200
        try:
            start_date = datetime(year, month, 1)
            end_date = datetime(year, month+1, 1) if month < 12 else datetime(year+1, 1, 1)
            managed_schedules = [s for s in managed_schedules if start_date <= s.startTime < end_date]
        except ValueError as e:
            return jsonify({'Flag':'4001','message': f'日期参数错误：{str(e)}'}), 200

    # Show参数过滤
    if show == 'going':
        filtered_schedules = [s for s in managed_schedules if s.endTime is None]
    elif show == 'ended':
        filtered_schedules = [s for s in managed_schedules if s.endTime is not None]
    elif show == 'all':
        filtered_schedules = managed_schedules
    else:
        return jsonify({'Flag':'4001','message': '参数错误'}), 200

    # 排序
    filtered_schedules = sorted(filtered_schedules, key=lambda x: (x.endTime is None, x.startTime), reverse=True)

    # 分页处理
    if mode == 'page':
        PAGE_SIZE = 10
        total_records = len(filtered_schedules)
        total_pages = (total_records + PAGE_SIZE - 1) // PAGE_SIZE
        
        paged_schedules = filtered_schedules[(page-1)*PAGE_SIZE : page*PAGE_SIZE]
        
        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data':{
                'records': [{
                    'schedule_id': schedule.scheduleID,
                    'prototype_event_title': schedule.prototype_event.title if schedule.prototype_event else None,
                    'prototype_event_club_name': schedule.prototype_event.club.clubName if schedule.prototype_event and schedule.prototype_event.club else None,
                    'start_time': schedule.startTime.isoformat(),
                    'end_time': schedule.endTime.isoformat() if isinstance(schedule.endTime, datetime) else schedule.endTime,
                    'join_count': len(schedule.scheduleJoins),
                    'event_count': len(schedule.schedule_events),
                    'cur_user_managed': True
                } for schedule in paged_schedules],
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
                'schedule_id': schedule.scheduleID,
                'prototype_event_title': schedule.prototype_event.title if schedule.prototype_event else None,
                'prototype_event_club_name': schedule.prototype_event.club.clubName if schedule.prototype_event and schedule.prototype_event.club else None,
                'start_time': schedule.startTime.isoformat(),
                'end_time': schedule.endTime.isoformat() if isinstance(schedule.endTime, datetime) else schedule.endTime,
                'join_count': len(schedule.scheduleJoins),
                'event_count': len(schedule.schedule_events),
                'cur_user_managed': schedule.prototype_event and schedule.prototype_event.authorID == cur_user.userID
            } for schedule in filtered_schedules]
        })

# 社团公开计划接口
@bp.route('/club_public/<int:club_id>/list/<string:show>', methods=['GET'])
@jwt_required()
def get_club_public_schedule_list(club_id, show):
    # 权限检查
    has_permission, message = check_permission(schedule.get_club_public_schedule_list.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    mode = request.args.get('mode', 'page')
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    page = request.args.get('page', default=1, type=int)

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    club = Club.query.filter_by(clubID=club_id).first()
    if not club:
        return jsonify({'Flag':'4004','message': '社团不存在'}), 200

    # 获取该社团相关的计划
    club_schedules = []
    for schedule in Schedule.query.all():
        if (schedule.prototype_event and 
            schedule.prototype_event.clubID == club_id):
            club_schedules.append(schedule)

    # 权限检查
    is_managed = club.leader.userID == cur_user.userID if club.leader else False
    is_member = any(m.clubID == club_id for m in cur_user.clubmembers)

    # Count模式处理
    if mode == 'count':
        going_count = len([s for s in club_schedules if s.endTime is None])
        ended_count = len([s for s in club_schedules if s.endTime is not None])
        
        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data': {
                'going_count': going_count,
                'ended_count': ended_count,
                'total_count': len(club_schedules)
            } if show == 'all' else {
                'count': going_count if show == 'going' else ended_count
            }
        })

    # 时间过滤
    if mode == 'month':
        if not year or not month:
            return jsonify({'Flag':'4001','message': '需要year和month参数'}), 200
        try:
            start_date = datetime(year, month, 1)
            end_date = datetime(year, month+1, 1) if month < 12 else datetime(year+1, 1, 1)
            filtered_schedules = [s for s in club_schedules if start_date <= s.startTime < end_date]
        except ValueError as e:
            return jsonify({'Flag':'4001','message': f'日期参数错误：{str(e)}'}), 200
    else:
        filtered_schedules = club_schedules

    # Show参数过滤
    if show == 'going':
        filtered_schedules = [s for s in filtered_schedules if s.endTime is None]
    elif show == 'ended':
        filtered_schedules = [s for s in filtered_schedules if s.endTime is not None]
    elif show != 'all':
        return jsonify({'Flag':'4001','message': '参数错误'}), 200

    # 排序
    filtered_schedules = sorted(filtered_schedules, key=lambda x: (x.endTime is None, x.startTime), reverse=True)

    # 分页处理
    if mode == 'page':
        PAGE_SIZE = 10
        total_records = len(filtered_schedules)
        total_pages = (total_records + PAGE_SIZE - 1) // PAGE_SIZE
        
        paged_schedules = filtered_schedules[(page-1)*PAGE_SIZE : page*PAGE_SIZE]
        
        return jsonify({
            'Flag':'4000',
            'message': '获取成功',
            'data':{
                'records': [{
                    'schedule_id': schedule.scheduleID,
                    'prototype_event_title': schedule.prototype_event.title if schedule.prototype_event else None,
                    'start_time': schedule.startTime.isoformat(),
                    'end_time': schedule.endTime.isoformat() if isinstance(schedule.endTime, datetime) else schedule.endTime,
                    'join_count': len(schedule.scheduleJoins),
                    'event_count': len(schedule.schedule_events),
                    'cur_user_managed': schedule.prototype_event and schedule.prototype_event.authorID == cur_user.userID,
                    'cur_user_can_join': is_member and not (schedule.prototype_event and schedule.prototype_event.authorID == cur_user.userID) and not any(sj.userID == cur_user.userID for sj in schedule.scheduleJoins),
                    'cur_user_is_joined': any(sj.userID == cur_user.userID for sj in schedule.scheduleJoins),
                    # 新增最新5位参加人员
                    'latest_joins': [
                        {
                            'user_id': sj.user.userID,
                            'user_name': sj.user.userName,
                            'avatar': sj.user.avatar,
                            'join_date': sj.joinDate.isoformat() if sj.joinDate else None
                        } 
                        for sj in sorted(schedule.scheduleJoins, key=lambda x: x.joinDate or datetime.min, reverse=True)[:5]
                    ]
                } for schedule in paged_schedules],
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
                'schedule_id': schedule.scheduleID,
                'prototype_event_title': schedule.prototype_event.title if schedule.prototype_event else None,
                'prototype_event_club_name': schedule.prototype_event.club.clubName if schedule.prototype_event and schedule.prototype_event.club else None,
                'start_time': schedule.startTime.isoformat(),
                'end_time': schedule.endTime.isoformat() if isinstance(schedule.endTime, datetime) else schedule.endTime,
                'join_count': len(schedule.scheduleJoins),
                'event_count': len(schedule.schedule_events),
                'cur_user_managed': schedule.prototype_event and schedule.prototype_event.authorID == cur_user.userID,
                'cur_user_is_joined': any(sj.userID == cur_user.userID for sj in schedule.scheduleJoins),
                # 新增最新5位参加人员
                'latest_joins': [
                    {
                        'user_id': sj.user.userID,
                        'user_name': sj.user.userName,
                        'avatar': sj.user.avatar,
                        'join_date': sj.joinDate.isoformat() if sj.joinDate else None
                    } 
                    for sj in sorted(schedule.scheduleJoins, key=lambda x: x.joinDate or datetime.min, reverse=True)[:5]
                ]
            } for schedule in filtered_schedules]
        })
