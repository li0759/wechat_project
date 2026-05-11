from flask import Blueprint, jsonify, request, make_response
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..models import User, Club, ClubMember, Event, EventJoin, ClubFee, PayGroup, Moment
from .. import db
from app.permission import check_permission, statistics
from datetime import datetime, timedelta
import io
import tempfile
import os
import re
import shutil
import subprocess
import zipfile
from collections import defaultdict
from minio import Minio
from minio.error import S3Error
from flask import current_app
import requests
import hashlib
try:
    import openpyxl
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.drawing.image import Image as ExcelImage
    # 尝试导入Pillow，这是openpyxl图片功能所需的
    try:
        from PIL import Image as PILImage
        PILLOW_AVAILABLE = True
    except ImportError:
        PILLOW_AVAILABLE = False
    EXCEL_AVAILABLE = True
except ImportError:
    EXCEL_AVAILABLE = False
    PILLOW_AVAILABLE = False

bp = Blueprint('statistics', __name__, url_prefix='/api/v1/statistics')

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

def ensure_bucket_exists(minio_client, bucket_name):
    """确保bucket存在"""
    try:
        if not minio_client.bucket_exists(bucket_name):
            minio_client.make_bucket(bucket_name)
    except Exception as e:
        current_app.logger.error(f"创建bucket失败: {str(e)}")
        raise

@bp.route('/export/all_club/users', methods=['GET'])
@jwt_required()
def export_all_club_users():
    """导出所有协会会员详情（每协会一个Excel+文件夹，整体压缩包）"""
    # 权限检查
    has_permission, message = check_permission(statistics.export_all_club_users.permission_judge)
    if not has_permission:
        return jsonify({'code': 4003, 'message': message}), 200
    
    user_id = get_jwt_identity()
    current_user = User.query.filter_by(userID=user_id).first()
    
    if not current_user:
        return jsonify({'code': 4004, 'message': '用户不存在'}), 200
    
    if not EXCEL_AVAILABLE:
        return jsonify({'code': 5000, 'message': '服务器未安装Excel支持库'}), 200
    
    split_by_club_raw = request.args.get('split_by_club', '1')
    split_by_club = str(split_by_club_raw).lower() in {'1', 'true', 'yes', 'on'}

    try:
        clubs = Club.query.filter_by(isDelete=False).all()
        if split_by_club:
            return create_all_club_users_archive(clubs, 'all_club_users')
        return create_all_users_single_archive(clubs, 'all_club_users')
    except Exception as e:
        return jsonify({'code': 5000, 'message': f'导出失败: {str(e)}'}), 200

@bp.route('/export/club/<int:club_id>/all_event/details', methods=['GET'])
@jwt_required()
def export_club_all_event_details(club_id):
    """导出指定协会的所有活动详细信息（包含图片）"""
    # 权限检查
    has_permission, message = check_permission(statistics.export_club_all_event_details.permission_judge)
    if not has_permission:
        return jsonify({'code': 4003, 'message': message}), 200
    
    user_id = get_jwt_identity()
    current_user = User.query.filter_by(userID=user_id).first()
    
    if not current_user:
        return jsonify({'code': 4004, 'message': '用户不存在'}), 200
    
    if not EXCEL_AVAILABLE:
        return jsonify({'code': 5000, 'message': '服务器未安装Excel支持库'}), 200
    
    if not PILLOW_AVAILABLE:
        return jsonify({'code': 5000, 'message': '服务器未安装图片处理库，将导出不含图片的版本'}), 200
    
    try:
        # 验证协会是否存在
        club = Club.query.filter_by(clubID=club_id).first()
        if not club:
            return jsonify({'code': 4004, 'message': '协会不存在'}), 200
        
        # 获取该协会的所有活动
        events = Event.query.filter_by(clubID=club_id).all()
        
        return create_excel_file_with_images_and_upload(events, f'club_{club_id}_all_events', include_club_info=False)
        
    except Exception as e:
        return jsonify({'code': 5000, 'message': f'导出失败: {str(e)}'}), 200

@bp.route('/export/all_club/all_event/details', methods=['GET'])
@jwt_required()
def export_all_club_all_event_details():
    """导出所有协会活动详情（每个协会一个sheet，包含图片缩略图与外部原图链接）"""
    # 权限检查
    has_permission, message = check_permission(statistics.export_all_club_all_event_details.permission_judge)
    if not has_permission:
        return jsonify({'code': 4003, 'message': message}), 200
    
    user_id = get_jwt_identity()
    current_user = User.query.filter_by(userID=user_id).first()
    
    if not current_user:
        return jsonify({'code': 4004, 'message': '用户不存在'}), 200
    
    if not EXCEL_AVAILABLE:
        return jsonify({'code': 5000, 'message': '服务器未安装Excel支持库'}), 200
    
    if not PILLOW_AVAILABLE:
        return jsonify({'code': 5000, 'message': '服务器未安装图片处理库，将导出不含图片的版本'}), 200
    
    start_date = request.args.get('start_date', '').strip()
    end_date = request.args.get('end_date', '').strip()

    try:
        start_dt, end_dt = parse_date_range(start_date, end_date)

        all_events = Event.query.join(Club).all()
        events = [event for event in all_events if is_event_in_range(event, start_dt, end_dt)]

        return create_all_club_event_details_rar_package(
            events=events,
            filename_prefix='all_club_all_events',
            start_date=start_dt,
            end_date=end_dt
        )
    except ValueError:
        return jsonify({'code': 4001, 'message': '日期格式错误，请使用YYYY-MM-DD格式'}), 200
    except Exception as e:
        return jsonify({'code': 5000, 'message': f'导出失败: {str(e)}'}), 200

@bp.route('/export/event/<int:event_id>/details', methods=['GET'])
@jwt_required()
def export_event_details(event_id):
    """导出指定活动的详细信息（包含参与者列表）"""
    # 权限检查
    has_permission, message = check_permission(statistics.export_event_details.permission_judge)
    if not has_permission:
        return jsonify({'code': 4003, 'message': message}), 200
    
    user_id = get_jwt_identity()
    current_user = User.query.filter_by(userID=user_id).first()
    
    if not current_user:
        return jsonify({'code': 4004, 'message': '用户不存在'}), 200
    
    # 验证活动是否存在
    event = Event.query.filter_by(eventID=event_id).first()
    if not event:
        return jsonify({'code': 4004, 'message': '活动不存在'}), 200
    
    if not EXCEL_AVAILABLE:
        return jsonify({'code': 5000, 'message': '服务器未安装Excel支持库'}), 200
    
    try:
        # 获取活动参与者
        event_joins = EventJoin.query.filter_by(eventID=event_id).all()
        
        # 准备数据
        headers = [
            '活动标题', '参与者ID', '参与者姓名', '性别', '手机号', '邮箱', '单位',
            '报名时间', '签到时间', '签到状态', '备注'
        ]
        
        data_rows = []
        for join in event_joins:
            user = User.query.filter_by(userID=join.userID).first()
            if user:
                is_checked_in = '已签到' if join.clockinDate else '未签到'
                data_rows.append([
                    event.title,
                    user.userID,
                    user.userName,
                    user.gender or '',
                    user.phone or '',
                    user.email or '',
                    user.department or '',
                    join.createDate.strftime('%Y-%m-%d %H:%M:%S') if join.createDate else '',
                    join.clockinDate.strftime('%Y-%m-%d %H:%M:%S') if join.clockinDate else '',
                    is_checked_in,
                    join.note or ''
                ])
        
        return create_excel_file_and_upload(headers, data_rows, f'event_{event_id}_details')
        
    except Exception as e:
        return jsonify({'code': 5000, 'message': f'导出失败: {str(e)}'}), 200

@bp.route('/show/all_club/users', methods=['GET'])
@jwt_required()
def show_all_club_users():
    """显示所有协会的会员情况"""
    # 权限检查
    has_permission, message = check_permission(statistics.show_all_club_users.permission_judge)
    if not has_permission:
        return jsonify({'code': 4003, 'message': message}), 200
    
    user_id = get_jwt_identity()
    current_user = User.query.filter_by(userID=user_id).first()
    
    if not current_user:
        return jsonify({'code': 4004, 'message': '用户不存在'}), 200
    
    try:
        # 获取所有协会
        clubs = Club.query.all()
        
        result_data = []
        for club in clubs:
            # 获取该协会的所有成员
            members = ClubMember.query.filter(ClubMember.clubID == club.clubID).all()
            
            member_list = []
            for member in members:
                user = User.query.filter(User.userID == member.userID).first()
                if user:
                    member_list.append({
                        'user_id': user.userID,
                        'user_name': user.userName,
                        'gender': user.gender or '',
                        'phone_number': user.phone or '',
                        'email': user.email or '',
                        'department': user.department or '',
                        'role': member.role or 'member',
                        'join_date': member.joinDate.strftime('%Y-%m-%d %H:%M:%S') if member.joinDate else '',
                        'create_date': user.createDate.strftime('%Y-%m-%d %H:%M:%S') if user.createDate else ''
                    })
            
            result_data.append({
                'club_id': club.clubID,
                'club_name': club.clubName,
                'member_count': len(member_list),
                'members': member_list
            })
        
        return jsonify({
            'code': 200,
            'message': 'success',
            'data': {
                'clubs': result_data,
                'total_clubs': len(result_data),
                'total_members': sum(club['member_count'] for club in result_data)
            }
        })
        
    except Exception as e:
        return jsonify({'code': 5000, 'message': f'获取数据失败: {str(e)}'}), 200

@bp.route('/show/club/<int:club_id>/all_event/details', methods=['GET'])
@jwt_required()
def show_club_all_event_details(club_id):
    """显示指定协会的所有活动详细信息"""
    # 权限检查
    has_permission, message = check_permission(statistics.show_club_all_event_details.permission_judge)
    if not has_permission:
        return jsonify({'code': 4003, 'message': message}), 200
    
    user_id = get_jwt_identity()
    current_user = User.query.filter_by(userID=user_id).first()
    
    if not current_user:
        return jsonify({'code': 4004, 'message': '用户不存在'}), 200
    
    try:
        # 验证协会是否存在
        club = Club.query.filter_by(clubID=club_id).first()
        if not club:
            return jsonify({'code': 4004, 'message': '协会不存在'}), 200
        
        # 获取该协会的所有活动
        events = Event.query.filter_by(clubID=club_id).all()
        
        event_list = []
        for event in events:
            # 获取报名人数和签到人数
            total_participants = EventJoin.query.filter_by(eventID=event.eventID).count()
            checked_in_count = EventJoin.query.filter_by(eventID=event.eventID).filter(
                EventJoin.clockinDate.isnot(None)
            ).count()
            
            # 获取组织者信息
            organizer = User.query.filter_by(userID=event.authorID).first()
            
            event_list.append({
                'event_id': event.eventID,
                'title': event.title,
                'message': event.message or '',
                'location_name': event.location_name or event.location or '',
                'location_address': event.location_address or '',
                'pre_start_time': event.pre_startTime.strftime('%Y-%m-%d %H:%M:%S') if event.pre_startTime else '',
                'pre_end_time': event.pre_endTime.strftime('%Y-%m-%d %H:%M:%S') if event.pre_endTime else '',
                'actual_start_time': event.actual_startTime.strftime('%Y-%m-%d %H:%M:%S') if event.actual_startTime else '',
                'actual_end_time': event.actual_endTime.strftime('%Y-%m-%d %H:%M:%S') if event.actual_endTime else '',
                'budget': event.budget or 0,
                'real_cost': event.real_cost or 0,
                'total_participants': total_participants,
                'checked_in_count': checked_in_count,
                'create_time': event.createDate.strftime('%Y-%m-%d %H:%M:%S') if event.createDate else '',
                'organizer': {
                    'user_id': organizer.userID if organizer else None,
                    'user_name': organizer.userName if organizer else '未知'
                }
            })
        
        return jsonify({
            'code': 200,
            'message': 'success',
            'data': {
                'club': {
                    'club_id': club.clubID,
                    'club_name': club.clubName
                },
                'events': event_list,
                'total_events': len(event_list),
                'total_participants': sum(event['total_participants'] for event in event_list),
                'total_checked_in': sum(event['checked_in_count'] for event in event_list)
            }
        })
        
    except Exception as e:
        return jsonify({'code': 5000, 'message': f'获取数据失败: {str(e)}'}), 200

@bp.route('/show/all_club/all_event/details', methods=['GET'])
@jwt_required()
def show_all_club_all_event_details():
    """显示所有协会的所有活动详细信息"""
    # 权限检查
    has_permission, message = check_permission(statistics.show_all_club_all_event_details.permission_judge)
    if not has_permission:
        return jsonify({'code': 4003, 'message': message}), 200
    
    user_id = get_jwt_identity()
    current_user = User.query.filter_by(userID=user_id).first()
    
    if not current_user:
        return jsonify({'code': 4004, 'message': '用户不存在'}), 200
    
    start_date = request.args.get('start_date', '').strip()
    end_date = request.args.get('end_date', '').strip()

    try:
        start_dt, end_dt = parse_date_range(start_date, end_date)
        all_events = Event.query.join(Club).all()
        events = [event for event in all_events if is_event_in_range(event, start_dt, end_dt)]
        
        event_list = []
        for event in events:
            # 获取报名人数和签到人数
            total_participants = EventJoin.query.filter_by(eventID=event.eventID).count()
            checked_in_count = EventJoin.query.filter_by(eventID=event.eventID).filter(
                EventJoin.clockinDate.isnot(None)
            ).count()
            
            # 获取组织者信息
            organizer = User.query.filter_by(userID=event.authorID).first()
            
            event_list.append({
                'event_id': event.eventID,
                'title': event.title,
                'message': event.message or '',
                'club': {
                    'club_id': event.club.clubID if event.club else None,
                    'club_name': event.club.clubName if event.club else '未知协会'
                },
                'location_name': event.location_name or event.location or '',
                'location_address': event.location_address or '',
                'pre_start_time': event.pre_startTime.strftime('%Y-%m-%d %H:%M:%S') if event.pre_startTime else '',
                'pre_end_time': event.pre_endTime.strftime('%Y-%m-%d %H:%M:%S') if event.pre_endTime else '',
                'actual_start_time': event.actual_startTime.strftime('%Y-%m-%d %H:%M:%S') if event.actual_startTime else '',
                'actual_end_time': event.actual_endTime.strftime('%Y-%m-%d %H:%M:%S') if event.actual_endTime else '',
                'budget': event.budget or 0,
                'real_cost': event.real_cost or 0,
                'total_participants': total_participants,
                'checked_in_count': checked_in_count,
                'create_time': event.createDate.strftime('%Y-%m-%d %H:%M:%S') if event.createDate else '',
                'organizer': {
                    'user_id': organizer.userID if organizer else None,
                    'user_name': organizer.userName if organizer else '未知'
                }
            })
        
        return jsonify({
            'code': 200,
            'message': 'success',
            'data': {
                'events': event_list,
                'total_events': len(event_list),
                'total_participants': sum(event['total_participants'] for event in event_list),
                'total_checked_in': sum(event['checked_in_count'] for event in event_list)
            }
        })
        
    except ValueError:
        return jsonify({'code': 4001, 'message': '日期格式错误，请使用YYYY-MM-DD格式'}), 200
    except Exception as e:
        return jsonify({'code': 5000, 'message': f'获取数据失败: {str(e)}'}), 200

@bp.route('/show/event/<int:event_id>/details', methods=['GET'])
@jwt_required()
def show_event_details(event_id):
    """显示指定活动的详细信息（包含参与者列表）"""
    # 权限检查
    has_permission, message = check_permission(statistics.show_event_details.permission_judge)
    if not has_permission:
        return jsonify({'code': 4003, 'message': message}), 200
    
    user_id = get_jwt_identity()
    current_user = User.query.filter_by(userID=user_id).first()
    
    if not current_user:
        return jsonify({'code': 4004, 'message': '用户不存在'}), 200
    
    # 验证活动是否存在
    event = Event.query.filter_by(eventID=event_id).first()
    if not event:
        return jsonify({'code': 4004, 'message': '活动不存在'}), 200
    
    try:
        # 获取活动参与者
        event_joins = EventJoin.query.filter_by(eventID=event_id).all()
        
        # 获取组织者信息
        organizer = User.query.filter_by(userID=event.authorID).first()
        
        participant_list = []
        for join in event_joins:
            user = User.query.filter_by(userID=join.userID).first()
            if user:
                participant_list.append({
                    'user_id': user.userID,
                    'user_name': user.userName,
                    'gender': user.gender or '',
                    'phone_number': user.phone or '',
                    'email': user.email or '',
                    'department': user.department or '',
                    'join_date': join.createDate.strftime('%Y-%m-%d %H:%M:%S') if join.createDate else '',
                    'checkin_date': join.clockinDate.strftime('%Y-%m-%d %H:%M:%S') if join.clockinDate else '',
                    'is_checked_in': bool(join.clockinDate),
                    'note': join.note or ''
                })
        
        # 统计信息
        total_participants = len(participant_list)
        checked_in_count = sum(1 for p in participant_list if p['is_checked_in'])
        
        return jsonify({
            'code': 200,
            'message': 'success',
            'data': {
                'event': {
                    'event_id': event.eventID,
                    'title': event.title,
                    'message': event.message or '',
                    'club': {
                        'club_id': event.club.clubID if event.club else None,
                        'club_name': event.club.clubName if event.club else '未知协会'
                    },
                    'location_name': event.location_name or event.location or '',
                    'location_address': event.location_address or '',
                    'pre_start_time': event.pre_startTime.strftime('%Y-%m-%d %H:%M:%S') if event.pre_startTime else '',
                    'pre_end_time': event.pre_endTime.strftime('%Y-%m-%d %H:%M:%S') if event.pre_endTime else '',
                    'actual_start_time': event.actual_startTime.strftime('%Y-%m-%d %H:%M:%S') if event.actual_startTime else '',
                    'actual_end_time': event.actual_endTime.strftime('%Y-%m-%d %H:%M:%S') if event.actual_endTime else '',
                    'budget': event.budget or 0,
                    'real_cost': event.real_cost or 0,
                    'create_time': event.createDate.strftime('%Y-%m-%d %H:%M:%S') if event.createDate else '',
                    'organizer': {
                        'user_id': organizer.userID if organizer else None,
                        'user_name': organizer.userName if organizer else '未知'
                    }
                },
                'participants': participant_list,
                'statistics': {
                    'total_participants': total_participants,
                    'checked_in_count': checked_in_count,
                    'checkin_rate': round(checked_in_count / total_participants * 100, 2) if total_participants > 0 else 0
                }
            }
        })
        
    except Exception as e:
        return jsonify({'code': 5000, 'message': f'获取数据失败: {str(e)}'}), 200

@bp.route('/show/club/<int:club_id>/financial/statistics', methods=['GET'])
@jwt_required()
def show_club_financial_statistics(club_id):
    """显示指定协会的收支统计信息"""
    # 权限检查
    has_permission, message = check_permission(statistics.show_club_financial_statistics.permission_judge)
    if not has_permission:
        return jsonify({'code': 4003, 'message': message}), 200
    
    user_id = get_jwt_identity()
    current_user = User.query.filter_by(userID=user_id).first()
    
    if not current_user:
        return jsonify({'code': 4004, 'message': '用户不存在'}), 200
    
    # 验证协会是否存在
    club = Club.query.filter_by(clubID=club_id).first()
    if not club:
        return jsonify({'code': 4004, 'message': '协会不存在'}), 200
    
    # 获取时间参数
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')
    
    try:
        if start_date_str and end_date_str:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
            # 将结束日期设为当天的23:59:59
            end_date = end_date.replace(hour=23, minute=59, second=59)
        else:
            # 默认显示当年的数据
            current_year = datetime.now().year
            start_date = datetime(current_year, 1, 1)
            end_date = datetime(current_year, 12, 31, 23, 59, 59)
    except ValueError:
        return jsonify({'code': 4001, 'message': '日期格式错误，请使用YYYY-MM-DD格式'}), 200
    
    try:
        # 1. 计算支出
        # 1.1 ClubFee支出
        club_fees = ClubFee.query.filter(
            ClubFee.clubID == club_id,
            ClubFee.createDate >= start_date,
            ClubFee.createDate <= end_date
        ).all()
        
        club_fee_total = sum(fee.feement for fee in club_fees)
        club_fee_details = [{
            'fee_id': fee.feeID,
            'amount': fee.feement,
            'description': fee.description,
            'create_date': fee.createDate.strftime('%Y-%m-%d %H:%M:%S') if fee.createDate else ''
        } for fee in club_fees]
        
        # 1.2 活动实际费用支出
        events = Event.query.filter(Event.clubID == club_id).all()
        event_cost_total = 0
        event_cost_details = []
        
        for event in events:
            event_date = event.actual_startTime if event.actual_startTime else event.pre_startTime
            if event_date and start_date <= event_date <= end_date and event.real_cost:
                event_cost_total += event.real_cost
                event_cost_details.append({
                    'event_id': event.eventID,
                    'title': event.title,
                    'amount': event.real_cost,
                    'date': event_date.strftime('%Y-%m-%d %H:%M:%S')
                })
        
        total_expenses = club_fee_total + event_cost_total
        
        # 2. 计算收入
        # 2.1 已完成的PayGroup收入（与该协会相关的）
        completed_pay_groups = PayGroup.query.filter(
            PayGroup.clubID == club_id,
            PayGroup.createDate >= start_date,
            PayGroup.createDate <= end_date
        ).all()
        
        paygroup_income_total = 0
        paygroup_income_details = []
        
        for pay_group in completed_pay_groups:
            # 计算已收到的款项
            paid_amount = sum(p.payment for p in pay_group.paypersonals if p.payDate)
            paygroup_income_total += paid_amount
            paygroup_income_details.append({
                'group_id': pay_group.groupID,
                'description': pay_group.description,
                'total_payment': pay_group.totalpayment,
                'paid_amount': paid_amount,
                'unpaid_amount': pay_group.totalpayment - paid_amount,
                'create_date': pay_group.createDate.strftime('%Y-%m-%d %H:%M:%S') if pay_group.createDate else '',
                'participants_count': len(pay_group.paypersonals),
                'paid_participants': len([p for p in pay_group.paypersonals if p.payDate])
            })
        
        total_income = paygroup_income_total
        
        # 3. 计算净收支
        net_balance = total_income - total_expenses
        
        # 4. 按月份统计
        monthly_stats = {}
        
        # 按月份统计支出
        for fee in club_fees:
            month_key = fee.createDate.strftime('%Y-%m') if fee.createDate else 'unknown'
            if month_key not in monthly_stats:
                monthly_stats[month_key] = {'income': 0, 'expenses': 0}
            monthly_stats[month_key]['expenses'] += fee.feement
        
        for event in events:
            event_date = event.actual_startTime if event.actual_startTime else event.pre_startTime
            if event_date and start_date <= event_date <= end_date and event.real_cost:
                month_key = event_date.strftime('%Y-%m')
                if month_key not in monthly_stats:
                    monthly_stats[month_key] = {'income': 0, 'expenses': 0}
                monthly_stats[month_key]['expenses'] += event.real_cost
        
        # 按月份统计收入
        for pay_group in completed_pay_groups:
            month_key = pay_group.createDate.strftime('%Y-%m') if pay_group.createDate else 'unknown'
            paid_amount = sum(p.payment for p in pay_group.paypersonals if p.payDate)
            if month_key not in monthly_stats:
                monthly_stats[month_key] = {'income': 0, 'expenses': 0}
            monthly_stats[month_key]['income'] += paid_amount
        
        # 转换月度统计为列表格式
        monthly_list = []
        for month_key in sorted(monthly_stats.keys()):
            if month_key != 'unknown':
                monthly_data = monthly_stats[month_key]
                monthly_list.append({
                    'month': month_key,
                    'income': monthly_data['income'],
                    'expenses': monthly_data['expenses'],
                    'net_balance': monthly_data['income'] - monthly_data['expenses']
                })
        
        return jsonify({
            'code': 200,
            'message': 'success',
            'data': {
                'club': {
                    'club_id': club.clubID,
                    'club_name': club.clubName
                },
                'time_range': {
                    'start_date': start_date.strftime('%Y-%m-%d'),
                    'end_date': end_date.strftime('%Y-%m-%d')
                },
                'summary': {
                    'total_income': total_income,
                    'total_expenses': total_expenses,
                    'net_balance': net_balance,
                    'club_fee_expenses': club_fee_total,
                    'event_cost_expenses': event_cost_total,
                    'paygroup_income': paygroup_income_total
                },
                'income_details': {
                    'paygroups': paygroup_income_details
                },
                'expense_details': {
                    'club_fees': club_fee_details,
                    'event_costs': event_cost_details
                },
                'monthly_statistics': monthly_list
            }
        })
        
    except Exception as e:
        return jsonify({'code': 5000, 'message': f'获取数据失败: {str(e)}'}), 200

@bp.route('/export/club/<int:club_id>/financial/statistics', methods=['GET'])
@jwt_required()
def export_club_financial_statistics(club_id):
    """导出指定协会的收支统计信息到Excel"""
    # 权限检查
    has_permission, message = check_permission(statistics.export_club_financial_statistics.permission_judge)
    if not has_permission:
        return jsonify({'code': 4003, 'message': message}), 200
    
    user_id = get_jwt_identity()
    current_user = User.query.filter_by(userID=user_id).first()
    
    if not current_user:
        return jsonify({'code': 4004, 'message': '用户不存在'}), 200
    
    # 验证协会是否存在
    club = Club.query.filter_by(clubID=club_id).first()
    if not club:
        return jsonify({'code': 4004, 'message': '协会不存在'}), 200
    
    if not EXCEL_AVAILABLE:
        return jsonify({'code': 5000, 'message': '服务器未安装Excel支持库'}), 200
    
    # 获取时间参数
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')
    
    try:
        if start_date_str and end_date_str:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
            # 将结束日期设为当天的23:59:59
            end_date = end_date.replace(hour=23, minute=59, second=59)
        else:
            # 默认导出当年的数据
            current_year = datetime.now().year
            start_date = datetime(current_year, 1, 1)
            end_date = datetime(current_year, 12, 31, 23, 59, 59)
    except ValueError:
        return jsonify({'code': 4001, 'message': '日期格式错误，请使用YYYY-MM-DD格式'}), 200
    
    try:
        # 获取统计数据（复用上面的逻辑）
        # 1. 支出数据
        club_fees = ClubFee.query.filter(
            ClubFee.clubID == club_id,
            ClubFee.createDate >= start_date,
            ClubFee.createDate <= end_date
        ).all()
        
        events = Event.query.filter(Event.clubID == club_id).all()
        event_costs = []
        for event in events:
            event_date = event.actual_startTime if event.actual_startTime else event.pre_startTime
            if event_date and start_date <= event_date <= end_date and event.real_cost:
                event_costs.append(event)
        
        # 2. 收入数据
        completed_pay_groups = PayGroup.query.filter(
            PayGroup.clubID == club_id,
            PayGroup.createDate >= start_date,
            PayGroup.createDate <= end_date
        ).all()
        
        # 创建Excel工作簿
        wb = Workbook()
        
        # 样式定义
        header_font = Font(bold=True, size=12)
        header_fill = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")
        header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        data_font = Font(size=11)
        data_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        
        # 工作表1：汇总统计
        ws_summary = wb.active
        ws_summary.title = "收支汇总"
        
        # 计算汇总数据
        club_fee_total = sum(fee.feement for fee in club_fees)
        event_cost_total = sum(event.real_cost for event in event_costs)
        total_expenses = club_fee_total + event_cost_total
        
        paygroup_income_total = sum(
            sum(p.payment for p in pg.paypersonals if p.payDate) 
            for pg in completed_pay_groups
        )
        total_income = paygroup_income_total
        net_balance = total_income - total_expenses
        
        # 写入汇总数据
        summary_data = [
            ['协会名称', club.clubName],
            ['统计时间范围', f"{start_date.strftime('%Y-%m-%d')} 至 {end_date.strftime('%Y-%m-%d')}"],
            ['', ''],
            ['收入项目', '金额(元)'],
            ['缴费收入', paygroup_income_total],
            ['收入小计', total_income],
            ['', ''],
            ['支出项目', '金额(元)'],
            ['协会费用', club_fee_total],
            ['活动费用', event_cost_total],
            ['支出小计', total_expenses],
            ['', ''],
            ['净收支', net_balance]
        ]
        
        for row_idx, (item, value) in enumerate(summary_data, 1):
            ws_summary.cell(row=row_idx, column=1, value=item)
            ws_summary.cell(row=row_idx, column=2, value=value)
            
            # 设置样式
            if item in ['收入项目', '支出项目'] or row_idx == 1:
                ws_summary.cell(row=row_idx, column=1).font = header_font
                ws_summary.cell(row=row_idx, column=1).fill = header_fill
                ws_summary.cell(row=row_idx, column=2).font = header_font
                ws_summary.cell(row=row_idx, column=2).fill = header_fill
        
        # 设置列宽
        ws_summary.column_dimensions['A'].width = 20
        ws_summary.column_dimensions['B'].width = 15
        
        # 工作表2：支出明细
        ws_expenses = wb.create_sheet("支出明细")
        expense_headers = ['类型', '项目ID', '项目名称', '金额(元)', '日期', '描述']
        
        for col, header in enumerate(expense_headers, 1):
            cell = ws_expenses.cell(row=1, column=col, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_alignment
        
        current_row = 2
        
        # 协会费用明细
        for fee in club_fees:
            ws_expenses.cell(row=current_row, column=1, value='协会费用')
            ws_expenses.cell(row=current_row, column=2, value=fee.feeID)
            ws_expenses.cell(row=current_row, column=3, value='协会日常支出')
            ws_expenses.cell(row=current_row, column=4, value=fee.feement)
            ws_expenses.cell(row=current_row, column=5, value=fee.createDate.strftime('%Y-%m-%d') if fee.createDate else '')
            ws_expenses.cell(row=current_row, column=6, value=fee.description or '')
            current_row += 1
        
        # 活动费用明细
        for event in event_costs:
            event_date = event.actual_startTime if event.actual_startTime else event.pre_startTime
            ws_expenses.cell(row=current_row, column=1, value='活动费用')
            ws_expenses.cell(row=current_row, column=2, value=event.eventID)
            ws_expenses.cell(row=current_row, column=3, value=event.title)
            ws_expenses.cell(row=current_row, column=4, value=event.real_cost)
            ws_expenses.cell(row=current_row, column=5, value=event_date.strftime('%Y-%m-%d') if event_date else '')
            ws_expenses.cell(row=current_row, column=6, value='活动实际费用')
            current_row += 1
        
        # 设置列宽
        for col_letter, width in [('A', 12), ('B', 10), ('C', 25), ('D', 12), ('E', 12), ('F', 30)]:
            ws_expenses.column_dimensions[col_letter].width = width
        
        # 工作表3：收入明细
        ws_income = wb.create_sheet("收入明细")
        income_headers = ['缴费组ID', '描述', '应收金额(元)', '已收金额(元)', '未收金额(元)', '创建日期', '参与人数', '已缴费人数']
        
        for col, header in enumerate(income_headers, 1):
            cell = ws_income.cell(row=1, column=col, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_alignment
        
        current_row = 2
        for pay_group in completed_pay_groups:
            paid_amount = sum(p.payment for p in pay_group.paypersonals if p.payDate)
            ws_income.cell(row=current_row, column=1, value=pay_group.groupID)
            ws_income.cell(row=current_row, column=2, value=pay_group.description or '')
            ws_income.cell(row=current_row, column=3, value=pay_group.totalpayment)
            ws_income.cell(row=current_row, column=4, value=paid_amount)
            ws_income.cell(row=current_row, column=5, value=pay_group.totalpayment - paid_amount)
            ws_income.cell(row=current_row, column=6, value=pay_group.createDate.strftime('%Y-%m-%d') if pay_group.createDate else '')
            ws_income.cell(row=current_row, column=7, value=len(pay_group.paypersonals))
            ws_income.cell(row=current_row, column=8, value=len([p for p in pay_group.paypersonals if p.payDate]))
            current_row += 1
        
        # 设置列宽
        for col_letter, width in [('A', 12), ('B', 25), ('C', 15), ('D', 15), ('E', 15), ('F', 12), ('G', 12), ('H', 12)]:
            ws_income.column_dimensions[col_letter].width = width
        
        # 冻结首行
        ws_summary.freeze_panes = 'A2'
        ws_expenses.freeze_panes = 'A2'
        ws_income.freeze_panes = 'A2'
        
        # 保存到内存
        output = io.BytesIO()
        try:
            wb.save(output)
            output.seek(0)
            
            # 上传到MinIO
            minio_client = get_minio_client()
            bucket_name = current_app.config.get('MINIO_BUCKET', 'manage-mate')
            ensure_bucket_exists(minio_client, bucket_name)
            
            # 生成文件名
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"club_{club_id}_financial_statistics_{timestamp}.xlsx"
            file_path = f"statistics/{filename}"
            
            # 获取文件大小
            file_size = output.getbuffer().nbytes
            
            minio_client.put_object(
                bucket_name,
                file_path,
                output,
                length=file_size,
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            
            # 在上传完成后关闭工作簿，释放所有资源
            wb.close()
            
        finally:
            # 确保关闭输出流
            if output:
                try:
                    output.close()
                except:
                    pass
        
        # 生成下载URL
        base_url = current_app.config.get('BASE_URL', 'https://www.vhhg.top')
        download_url = f"{base_url}/api/v1/file/download/tmp/{file_path}"
        
        current_app.logger.info(f"协会{club_id}收支统计Excel文件生成并上传成功: {file_path}")
        
        return jsonify({
            'code': 200,
            'message': '导出成功',
            'data': {
                'download_url': download_url,
                'filename': filename,
                'file_path': file_path,
                'file_size': file_size,
                'create_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'club_name': club.clubName,
                'time_range': {
                    'start_date': start_date.strftime('%Y-%m-%d'),
                    'end_date': end_date.strftime('%Y-%m-%d')
                }
            }
        })
        
    except S3Error as e:
        current_app.logger.error(f"MinIO上传失败: {str(e)}")
        return jsonify({'code': 5000, 'message': f'文件上传失败: {str(e)}'}), 200
    except Exception as e:
        current_app.logger.error(f'导出协会{club_id}收支统计失败: {str(e)}')
        return jsonify({'code': 5000, 'message': f'导出失败: {str(e)}'}), 200

def create_excel_file_and_upload(headers, data_rows, filename_prefix):
    """创建Excel文件并上传到MinIO，返回下载URL"""
    if not EXCEL_AVAILABLE:
        raise Exception("Excel支持库未安装")
    
    try:
        # 创建工作簿
        wb = Workbook()
        ws = wb.active
        ws.title = "统计数据"
        
        # 简化标题样式以提高微信兼容性
        header_font = Font(bold=True, size=12)
        header_fill = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")
        header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        
        # 写入标题行
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_alignment
            ws.row_dimensions[1].height = 25
        
        # 写入数据行
        data_font = Font(size=11)
        data_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        
        for row_idx, row_data in enumerate(data_rows, 2):
            for col, value in enumerate(row_data, 1):
                cell = ws.cell(row=row_idx, column=col, value=value)
                cell.font = data_font
                cell.alignment = data_alignment
                ws.row_dimensions[row_idx].height = 20
        
        # 优化列宽设置
        for column in ws.columns:
            max_length = 0
            column_letter = column[0].column_letter
            for cell in column:
                try:
                    cell_length = len(str(cell.value))
                    if cell_length > max_length:
                        max_length = cell_length
                except:
                    pass
            adjusted_width = min(max(max_length + 2, 8), 30)
            ws.column_dimensions[column_letter].width = adjusted_width
        
        # 冻结首行
        ws.freeze_panes = 'A2'
        
        # 设置打印和显示选项
        ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
        
        # 保存到内存
        output = io.BytesIO()
        try:
            wb.save(output)
            output.seek(0)
            
            # 生成文件名
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{filename_prefix}_{timestamp}.xlsx"
            
            # 上传到MinIO
            minio_client = get_minio_client()
            bucket_name = current_app.config.get('MINIO_BUCKET', 'manage-mate')
            
            # 确保bucket存在
            ensure_bucket_exists(minio_client, bucket_name)
            
            # 将文件上传到statistics文件夹
            file_path = f"statistics/{filename}"
            
            # 获取文件大小
            file_size = output.getbuffer().nbytes
            
            minio_client.put_object(
                bucket_name,
                file_path,
                output,
                length=file_size,
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            
            # 在上传完成后关闭工作簿，释放所有资源
            wb.close()
            
        finally:
            # 确保关闭输出流
            if output:
                try:
                    output.close()
                except:
                    pass
        
        # 生成下载URL
        base_url = current_app.config.get('BASE_URL', 'https://www.vhhg.top')
        download_url = f"{base_url}/api/v1/file/download/tmp/{file_path}"
        
        current_app.logger.info(f"Excel文件生成并上传成功: {file_path}")
        
        return jsonify({
            'code': 200,
            'message': '导出成功',
            'data': {
                'download_url': download_url,
                'filename': filename,
                'file_path': file_path,
                'file_size': file_size,
                'create_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }
        })
        
    except S3Error as e:
        current_app.logger.error(f"MinIO上传失败: {str(e)}")
        raise Exception(f"文件上传失败: {str(e)}")
    except Exception as e:
        current_app.logger.error(f"创建Excel文件失败: {str(e)}")
        raise

def get_excel_column_name(col_num):
    """
    将列号转换为Excel列名
    例如: 1->A, 2->B, 26->Z, 27->AA, 28->AB, 702->ZZ, 703->AAA
    """
    result = ""
    while col_num > 0:
        col_num -= 1  # 转换为0-based索引
        result = chr(ord('A') + col_num % 26) + result
        col_num //= 26
    return result

def parse_date_range(start_date_str, end_date_str):
    """解析日期区间。两个参数都为空时表示不筛选。"""
    if not start_date_str and not end_date_str:
        return None, None

    if not start_date_str or not end_date_str:
        raise ValueError("start_date 和 end_date 必须同时传入")

    start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
    end_date = datetime.strptime(end_date_str, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
    if start_date > end_date:
        raise ValueError("开始日期不能大于结束日期")
    return start_date, end_date

def get_event_reference_datetime(event):
    """活动时间优先级：预开始 > 实际开始 > 创建时间。"""
    return event.pre_startTime or event.actual_startTime or event.createDate

def is_event_in_range(event, start_date, end_date):
    """判断活动是否在时间范围内。"""
    if not start_date or not end_date:
        return True
    ref_dt = get_event_reference_datetime(event)
    if not ref_dt:
        return False
    return start_date <= ref_dt <= end_date

def sanitize_sheet_title(sheet_title):
    """Excel sheet 名称清洗并截断到31字符。"""
    safe_title = re.sub(r'[\\/*?:\[\]]', '_', (sheet_title or '未命名协会')).strip()
    if not safe_title:
        safe_title = '未命名协会'
    return safe_title[:31]

def sanitize_filename(file_name):
    safe_name = re.sub(r'[\\/:*?"<>|]', '_', (file_name or '').strip())
    return safe_name or '未命名'

def extract_file_path_from_download_url(file_url):
    if not file_url:
        return None
    marker = '/api/v1/file/download/'
    if marker in file_url:
        return file_url.split(marker, 1)[1]
    return None

def generate_thumbnail_bytes(image_data, minlength=50):
    """参考 download_thumbnail 生成略缩图。"""
    if not PILLOW_AVAILABLE:
        return None

    try:
        with PILImage.open(io.BytesIO(image_data)) as img:
            width, height = img.size
            if width <= 0 or height <= 0:
                return None

            aspect_ratio = width / height
            if 0.8 <= aspect_ratio <= 1.25:
                target_width, target_height = minlength, minlength
            elif width > height:
                target_width, target_height = 2 * minlength, minlength
            else:
                target_width, target_height = minlength, 2 * minlength

            scale = max(target_width / width, target_height / height)
            scaled_width = int(width * scale)
            scaled_height = int(height * scale)
            resized = img.resize((scaled_width, scaled_height), PILImage.Resampling.LANCZOS)

            left = (scaled_width - target_width) // 2
            top = (scaled_height - target_height) // 2
            thumbnail = resized.crop((left, top, left + target_width, top + target_height))

            output = io.BytesIO()
            if img.mode in ('RGBA', 'LA', 'P'):
                converted = thumbnail.convert('RGB')
                converted.save(output, format='JPEG', quality=85)
            else:
                fmt = img.format if img.format in ('JPEG', 'PNG', 'GIF') else 'JPEG'
                if fmt == 'JPEG':
                    thumbnail.convert('RGB').save(output, format='JPEG', quality=85)
                else:
                    thumbnail.save(output, format=fmt)
            output.seek(0)
            return output.getvalue()
    except Exception as e:
        current_app.logger.warning(f"生成略缩图失败: {str(e)}")
        return None

def build_moment_collage_thumbnail(moment_files, minlength=50, max_images=6):
    """将多张动态略缩图拼接成单张图片，放入一个Excel单元格。"""
    if not PILLOW_AVAILABLE or not moment_files:
        return None

    thumbnails = []
    for file_obj in moment_files[:max_images]:
        img_data = download_image_from_minio(file_obj.fileUrl)
        if not img_data:
            continue
        thumb_data = generate_thumbnail_bytes(img_data, minlength=minlength)
        if not thumb_data:
            continue
        try:
            thumb = PILImage.open(io.BytesIO(thumb_data)).convert('RGB')
            thumbnails.append(thumb)
        except Exception:
            continue

    if not thumbnails:
        return None

    gap = 8
    total_width = sum(img.width for img in thumbnails) + gap * (len(thumbnails) - 1)
    max_height = max(img.height for img in thumbnails)
    canvas = PILImage.new('RGB', (total_width, max_height), (255, 255, 255))

    cursor_x = 0
    for img in thumbnails:
        y = (max_height - img.height) // 2
        canvas.paste(img, (cursor_x, y))
        cursor_x += img.width + gap

    output = io.BytesIO()
    canvas.save(output, format='JPEG', quality=85)
    output.seek(0)
    return output.getvalue()

def collect_event_moment_files(event):
    """按动态发布时间汇总活动动态图片文件。"""
    from app.models.file import File

    moments = Moment.query.filter_by(ref_event_ID=event.eventID).order_by(Moment.createDate.asc()).all()
    image_ids = []
    for moment in moments:
        if moment.imageIDs and isinstance(moment.imageIDs, list):
            for image_id in moment.imageIDs:
                if image_id not in image_ids:
                    image_ids.append(image_id)

    if not image_ids:
        return []

    files = File.query.filter(File.fileID.in_(image_ids)).all()
    file_map = {f.fileID: f for f in files}
    return [file_map[file_id] for file_id in image_ids if file_id in file_map]

def create_all_club_event_details_rar_package(events, filename_prefix, start_date=None, end_date=None):
    """每个协会单独一个Excel与原图文件夹，优先RAR，失败则ZIP。"""
    if not EXCEL_AVAILABLE:
        raise Exception("Excel支持库未安装")
    if not PILLOW_AVAILABLE:
        raise Exception("图片处理库未安装")

    grouped_events = defaultdict(list)
    for event in events:
        club_name = event.club.clubName if event.club else '未知协会'
        grouped_events[club_name].append(event)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    package_name = f"{filename_prefix}_{timestamp}"
    temp_root = tempfile.mkdtemp(prefix='club_events_rar_')
    package_root = os.path.join(temp_root, package_name)
    os.makedirs(package_root, exist_ok=True)

    summary = {
        'club_count': 0,
        'event_count': len(events),
        'dynamic_image_count': 0
    }

    try:
        if not grouped_events:
            readme_path = os.path.join(package_root, 'README.txt')
            with open(readme_path, 'w', encoding='utf-8') as f:
                f.write("当前时间范围内无活动数据。\n")
        else:
            for club_name in sorted(grouped_events.keys()):
                safe_club_name = sanitize_filename(club_name)
                club_excel_name = f"{safe_club_name}.xlsx"
                club_folder_name = f"{safe_club_name}协会文件夹"

                club_excel_path = os.path.join(package_root, club_excel_name)
                club_asset_folder = os.path.join(package_root, club_folder_name)
                os.makedirs(club_asset_folder, exist_ok=True)

                dynamic_count = create_single_club_event_excel(
                    excel_path=club_excel_path,
                    club_name=club_name,
                    events=grouped_events[club_name],
                    club_asset_folder=club_asset_folder,
                    club_folder_name=club_folder_name,
                    temp_root=temp_root
                )
                summary['dynamic_image_count'] += dynamic_count
                summary['club_count'] += 1

        archive_info = create_export_archive(source_dir=package_root, output_dir=temp_root, package_name=package_name)

        minio_response = upload_local_file_to_minio(
            local_file_path=archive_info['archive_path'],
            object_path=f"statistics/{archive_info['archive_filename']}",
            content_type=archive_info['content_type']
        )

        return jsonify({
            'code': 200,
            'message': archive_info['message'],
            'data': {
                **minio_response,
                **summary,
                'archive_format': archive_info['archive_format'],
                'start_date': start_date.strftime('%Y-%m-%d') if start_date else '',
                'end_date': end_date.strftime('%Y-%m-%d') if end_date else ''
            }
        })
    finally:
        try:
            shutil.rmtree(temp_root, ignore_errors=True)
        except Exception:
            pass

def create_single_club_event_excel(excel_path, club_name, events, club_asset_folder, club_folder_name, temp_root):
    """生成单个协会活动Excel，并把原图放到同级协会文件夹。"""
    wb = Workbook()
    ws = wb.active
    ws.title = sanitize_sheet_title(club_name)

    headers = ['活动封面略缩图', '动态图片略缩图', '人员名单', '时间', '地点']
    header_font = Font(bold=True, size=12)
    header_fill = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    text_alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
    center_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    ws.append(headers)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment

    ws.column_dimensions['A'].width = 26
    ws.column_dimensions['B'].width = 58
    ws.column_dimensions['C'].width = 42
    ws.column_dimensions['D'].width = 30
    ws.column_dimensions['E'].width = 30
    ws.freeze_panes = 'A2'

    dynamic_image_count = 0
    temp_thumb_files = []

    sorted_events = sorted(
        events,
        key=lambda item: get_event_reference_datetime(item) or datetime.min,
        reverse=True
    )

    try:
        for row_idx, event in enumerate(sorted_events, 2):
            ws.row_dimensions[row_idx].height = 160
            event_folder_name = f"{sanitize_filename(event.title) or event.eventID}活动"
            event_asset_folder = os.path.join(club_asset_folder, event_folder_name)
            dynamic_asset_folder = os.path.join(event_asset_folder, "动态原图")
            os.makedirs(dynamic_asset_folder, exist_ok=True)

            join_list = EventJoin.query.filter_by(eventID=event.eventID).all()
            names = []
            for join in join_list:
                if hasattr(join, 'isDelete') and join.isDelete:
                    continue
                if join.user and join.user.userName:
                    names.append(f"【{join.user.userName}】")

            member_text = ''.join(names) if names else '无'
            start_text = event.pre_startTime.strftime('%Y-%m-%d %H:%M') if event.pre_startTime else ''
            end_text = event.pre_endTime.strftime('%Y-%m-%d %H:%M') if event.pre_endTime else ''
            time_text = f"{start_text} - {end_text}".strip(' -') or '无'
            location_text = event.location_name or event.location_address or event.location or '无'

            ws.cell(row=row_idx, column=3, value=member_text).alignment = text_alignment
            ws.cell(row=row_idx, column=4, value=time_text).alignment = center_alignment
            ws.cell(row=row_idx, column=5, value=location_text).alignment = text_alignment

            cover_cell = ws.cell(row=row_idx, column=1, value='无封面')
            cover_cell.alignment = center_alignment
            if event.cover and event.cover.fileUrl:
                cover_bytes = download_image_from_minio(event.cover.fileUrl)
                if cover_bytes:
                    original_cover_path = extract_file_path_from_download_url(event.cover.fileUrl)
                    cover_ext = os.path.splitext(original_cover_path)[1] if original_cover_path else '.jpg'
                    cover_file_name = f"cover{cover_ext or '.jpg'}"
                    cover_file_abs = os.path.join(event_asset_folder, cover_file_name)
                    with open(cover_file_abs, 'wb') as f:
                        f.write(cover_bytes)

                    cover_thumb = generate_thumbnail_bytes(cover_bytes, minlength=50)
                    if cover_thumb:
                        fd, thumb_path = tempfile.mkstemp(prefix='cover_thumb_', suffix='.jpg', dir=temp_root)
                        os.close(fd)
                        with open(thumb_path, 'wb') as f:
                            f.write(cover_thumb)
                        temp_thumb_files.append(thumb_path)

                        excel_cover = ExcelImage(thumb_path)
                        excel_cover.anchor = f'A{row_idx}'
                        ws.add_image(excel_cover)

                    relative_cover_link = os.path.relpath(cover_file_abs, os.path.dirname(excel_path)).replace("\\", "/")
                    cover_cell.value = '封面原图'
                    cover_cell.hyperlink = relative_cover_link
                    cover_cell.style = "Hyperlink"

            dynamic_cell = ws.cell(row=row_idx, column=2, value='无动态图片')
            dynamic_cell.alignment = center_alignment
            moment_files = collect_event_moment_files(event)
            if moment_files:
                saved_dynamic_paths = []
                for idx, file_obj in enumerate(moment_files, 1):
                    if not file_obj.fileUrl:
                        continue
                    image_bytes = download_image_from_minio(file_obj.fileUrl)
                    if not image_bytes:
                        continue
                    dynamic_image_count += 1
                    origin_path = extract_file_path_from_download_url(file_obj.fileUrl)
                    ext = os.path.splitext(origin_path)[1] if origin_path else '.jpg'
                    dynamic_name = f"moment_{idx}{ext or '.jpg'}"
                    dynamic_abs = os.path.join(dynamic_asset_folder, dynamic_name)
                    with open(dynamic_abs, 'wb') as f:
                        f.write(image_bytes)
                    saved_dynamic_paths.append(dynamic_abs)

                collage_bytes = build_moment_collage_thumbnail(moment_files, minlength=50, max_images=12)
                if collage_bytes:
                    fd, collage_path = tempfile.mkstemp(prefix='moment_thumb_', suffix='.jpg', dir=temp_root)
                    os.close(fd)
                    with open(collage_path, 'wb') as f:
                        f.write(collage_bytes)
                    temp_thumb_files.append(collage_path)

                    excel_collage = ExcelImage(collage_path)
                    excel_collage.anchor = f'B{row_idx}'
                    ws.add_image(excel_collage)

                if saved_dynamic_paths:
                    relative_dynamic_link = os.path.relpath(saved_dynamic_paths[0], os.path.dirname(excel_path)).replace("\\", "/")
                    dynamic_cell.value = '动态原图'
                    dynamic_cell.hyperlink = relative_dynamic_link
                    dynamic_cell.style = "Hyperlink"

        wb.save(excel_path)
    finally:
        try:
            wb.close()
        except Exception:
            pass
        for tmp_file in temp_thumb_files:
            if tmp_file and os.path.exists(tmp_file):
                try:
                    os.unlink(tmp_file)
                except Exception:
                    pass

    return dynamic_image_count

def create_rar_archive(source_dir, rar_path):
    """使用系统 rar/winrar 打包目录。"""
    rar_commands = []
    rar_exe = shutil.which('rar')
    winrar_exe = shutil.which('winrar')
    if rar_exe:
        rar_commands.append([rar_exe, 'a', '-r', rar_path, '.'])
    if winrar_exe:
        rar_commands.append([winrar_exe, 'a', '-r', rar_path, '.'])

    if not rar_commands:
        raise Exception('服务器未安装 rar/winrar，无法生成RAR压缩包')

    last_error = None
    for cmd in rar_commands:
        try:
            subprocess.run(cmd, cwd=source_dir, check=True, capture_output=True, text=True)
            return
        except Exception as e:
            last_error = e

    raise Exception(f'生成RAR失败: {str(last_error)}')

def create_zip_archive(source_dir, zip_path):
    """使用Python标准库zipfile打包目录。"""
    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zipf:
        for root, _, files in os.walk(source_dir):
            for file_name in files:
                file_path = os.path.join(root, file_name)
                arc_name = os.path.relpath(file_path, os.path.dirname(source_dir))
                zipf.write(file_path, arc_name)

def create_export_archive(source_dir, output_dir, package_name):
    """优先生成RAR，若不可用则自动降级为ZIP。"""
    rar_filename = f"{package_name}.rar"
    rar_path = os.path.join(output_dir, rar_filename)

    try:
        create_rar_archive(source_dir=source_dir, rar_path=rar_path)
        return {
            'archive_path': rar_path,
            'archive_filename': rar_filename,
            'archive_format': 'rar',
            'content_type': 'application/vnd.rar',
            'message': '导出成功'
        }
    except Exception as rar_error:
        current_app.logger.warning(f"RAR打包失败，降级ZIP: {str(rar_error)}")
        zip_filename = f"{package_name}.zip"
        zip_path = os.path.join(output_dir, zip_filename)
        create_zip_archive(source_dir=source_dir, zip_path=zip_path)
        return {
            'archive_path': zip_path,
            'archive_filename': zip_filename,
            'archive_format': 'zip',
            'content_type': 'application/zip',
            'message': '导出成功（服务器未安装RAR工具，已自动提供ZIP压缩包）'
        }

def upload_local_file_to_minio(local_file_path, object_path, content_type):
    """上传本地文件到MinIO并返回下载信息。"""
    minio_client = get_minio_client()
    bucket_name = current_app.config.get('MINIO_BUCKET', 'manage-mate')
    ensure_bucket_exists(minio_client, bucket_name)

    file_size = os.path.getsize(local_file_path)
    with open(local_file_path, 'rb') as f:
        minio_client.put_object(
            bucket_name,
            object_path,
            f,
            length=file_size,
            content_type=content_type
        )

    base_url = current_app.config.get('BASE_URL', 'https://www.vhhg.top')
    download_url = f"{base_url}/api/v1/file/download/tmp/{object_path}"
    return {
        'download_url': download_url,
        'filename': os.path.basename(local_file_path),
        'file_path': object_path,
        'file_size': file_size,
        'create_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }

def create_all_club_users_archive(clubs, filename_prefix):
    """导出所有协会用户：每协会Excel+协会文件夹，整体打包下载。"""
    if not EXCEL_AVAILABLE:
        raise Exception("Excel支持库未安装")
    if not PILLOW_AVAILABLE:
        raise Exception("图片处理库未安装")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    package_name = f"{filename_prefix}_{timestamp}"
    temp_root = tempfile.mkdtemp(prefix='club_users_archive_')
    package_root = os.path.join(temp_root, package_name)
    os.makedirs(package_root, exist_ok=True)

    summary = {
        'club_count': 0,
        'member_count': 0,
        'moment_image_count': 0
    }

    try:
        if not clubs:
            readme_path = os.path.join(package_root, 'README.txt')
            with open(readme_path, 'w', encoding='utf-8') as f:
                f.write("当前没有可导出的协会用户数据。\n")
        else:
            for club in sorted(clubs, key=lambda c: c.clubName or ''):
                safe_club_name = sanitize_filename(club.clubName or f"club_{club.clubID}")
                excel_path = os.path.join(package_root, f"{safe_club_name}.xlsx")
                club_folder_name = f"{safe_club_name}协会文件夹"
                club_asset_folder = os.path.join(package_root, club_folder_name)
                os.makedirs(club_asset_folder, exist_ok=True)

                export_result = create_single_club_user_excel(
                    club=club,
                    excel_path=excel_path,
                    club_asset_folder=club_asset_folder,
                    temp_root=temp_root
                )
                summary['club_count'] += 1
                summary['member_count'] += export_result['member_count']
                summary['moment_image_count'] += export_result['moment_image_count']

        archive_info = create_export_archive(source_dir=package_root, output_dir=temp_root, package_name=package_name)
        minio_response = upload_local_file_to_minio(
            local_file_path=archive_info['archive_path'],
            object_path=f"statistics/{archive_info['archive_filename']}",
            content_type=archive_info['content_type']
        )

        return jsonify({
            'code': 200,
            'message': archive_info['message'],
            'data': {
                **minio_response,
                **summary,
                'archive_format': archive_info['archive_format'],
                'split_by_club': True
            }
        })
    finally:
        try:
            shutil.rmtree(temp_root, ignore_errors=True)
        except Exception:
            pass

def create_all_users_single_archive(clubs, filename_prefix):
    """导出所有协会用户到单一Excel与单一文件夹。"""
    if not EXCEL_AVAILABLE:
        raise Exception("Excel支持库未安装")
    if not PILLOW_AVAILABLE:
        raise Exception("图片处理库未安装")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    package_name = f"{filename_prefix}_single_{timestamp}"
    temp_root = tempfile.mkdtemp(prefix='all_users_single_archive_')
    package_root = os.path.join(temp_root, package_name)
    os.makedirs(package_root, exist_ok=True)

    summary = {
        'club_count': len(clubs),
        'member_count': 0,
        'moment_image_count': 0
    }

    try:
        user_map = {}
        for club in clubs:
            members = ClubMember.query.filter_by(clubID=club.clubID, isDelete=False).all()
            for member in members:
                if not member.user:
                    continue
                uid = member.user.userID
                if uid not in user_map:
                    user_map[uid] = {
                        'user': member.user,
                        'memberships': []
                    }
                user_map[uid]['memberships'].append({
                    'club': club,
                    'member': member
                })

        excel_path = os.path.join(package_root, "所有协会用户.xlsx")
        asset_folder = os.path.join(package_root, "所有协会用户文件夹")
        os.makedirs(asset_folder, exist_ok=True)

        export_result = create_all_users_single_excel(
            excel_path=excel_path,
            asset_folder=asset_folder,
            user_rows=list(user_map.values()),
            temp_root=temp_root
        )
        summary['member_count'] = export_result['member_count']
        summary['moment_image_count'] = export_result['moment_image_count']

        archive_info = create_export_archive(source_dir=package_root, output_dir=temp_root, package_name=package_name)
        minio_response = upload_local_file_to_minio(
            local_file_path=archive_info['archive_path'],
            object_path=f"statistics/{archive_info['archive_filename']}",
            content_type=archive_info['content_type']
        )

        return jsonify({
            'code': 200,
            'message': archive_info['message'],
            'data': {
                **minio_response,
                **summary,
                'archive_format': archive_info['archive_format'],
                'split_by_club': False
            }
        })
    finally:
        try:
            shutil.rmtree(temp_root, ignore_errors=True)
        except Exception:
            pass

def create_all_users_single_excel(excel_path, asset_folder, user_rows, temp_root):
    """生成单表用户导出（新增协会列）。"""
    wb = Workbook()
    ws = wb.active
    ws.title = "全部用户"

    headers = ['用户名', '用户头像略缩图', '加入协会时间', '协会', '参加活动', '发布过的动态']
    header_font = Font(bold=True, size=12)
    header_fill = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    text_alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
    center_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    ws.append(headers)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment

    ws.column_dimensions['A'].width = 22
    ws.column_dimensions['B'].width = 18
    ws.column_dimensions['C'].width = 24
    ws.column_dimensions['D'].width = 36
    ws.column_dimensions['E'].width = 56
    ws.column_dimensions['F'].width = 62
    ws.freeze_panes = 'A2'

    sorted_users = sorted(user_rows, key=lambda item: (item['user'].userName or ''))
    temp_thumb_files = []
    moment_image_count = 0

    try:
        for row_idx, row in enumerate(sorted_users, 2):
            user = row['user']
            memberships = row['memberships']
            club_names = [m['club'].clubName for m in memberships if m['club'] and m['club'].clubName]
            club_ids = [m['club'].clubID for m in memberships if m['club']]

            ws.row_dimensions[row_idx].height = 120
            safe_user_name = sanitize_filename(user.userName or f"user_{user.userID}")
            folder_prefix = sanitize_filename(club_names[0]) if len(club_names) == 1 else f"{sanitize_filename(club_names[0])}等{len(club_names)}协会"
            user_folder_name = f"{folder_prefix}-{safe_user_name}文件夹" if club_names else f"未知协会-{safe_user_name}文件夹"
            user_asset_folder = os.path.join(asset_folder, user_folder_name)
            moment_asset_folder = os.path.join(user_asset_folder, '动态原图')
            os.makedirs(moment_asset_folder, exist_ok=True)

            ws.cell(row=row_idx, column=1, value=user.userName or '').alignment = text_alignment

            join_dates = [m['member'].joinDate for m in memberships if m['member'] and m['member'].joinDate]
            earliest_join = min(join_dates).strftime('%Y-%m-%d %H:%M:%S') if join_dates else ''
            ws.cell(row=row_idx, column=3, value=earliest_join).alignment = center_alignment

            clubs_text = ''.join([f"【{name}】" for name in sorted(set(club_names))]) if club_names else '无'
            ws.cell(row=row_idx, column=4, value=clubs_text).alignment = text_alignment

            event_names = get_user_joined_event_names_with_club(user.userID, club_ids)
            events_text = ''.join([f"【{name}】" for name in event_names]) if event_names else '无'
            ws.cell(row=row_idx, column=5, value=events_text).alignment = text_alignment

            avatar_cell = ws.cell(row=row_idx, column=2, value='无头像')
            avatar_cell.alignment = center_alignment
            if user.avatar and user.avatar.fileUrl:
                avatar_bytes = download_image_from_minio(user.avatar.fileUrl)
                if avatar_bytes:
                    avatar_origin_path = extract_file_path_from_download_url(user.avatar.fileUrl)
                    avatar_ext = os.path.splitext(avatar_origin_path)[1] if avatar_origin_path else '.jpg'
                    avatar_name = f"avatar{avatar_ext or '.jpg'}"
                    avatar_abs_path = os.path.join(user_asset_folder, avatar_name)
                    with open(avatar_abs_path, 'wb') as f:
                        f.write(avatar_bytes)

                    avatar_thumb = generate_thumbnail_bytes(avatar_bytes, minlength=30)
                    if avatar_thumb:
                        fd, thumb_path = tempfile.mkstemp(prefix='avatar_single_thumb_', suffix='.jpg', dir=temp_root)
                        os.close(fd)
                        with open(thumb_path, 'wb') as f:
                            f.write(avatar_thumb)
                        temp_thumb_files.append(thumb_path)
                        avatar_img = ExcelImage(thumb_path)
                        avatar_img.anchor = f'B{row_idx}'
                        ws.add_image(avatar_img)

                    avatar_cell.value = '头像原图'
                    avatar_cell.hyperlink = os.path.relpath(avatar_abs_path, os.path.dirname(excel_path)).replace("\\", "/")
                    avatar_cell.style = "Hyperlink"

            moments_cell = ws.cell(row=row_idx, column=6, value='无动态')
            moments_cell.alignment = center_alignment
            moment_files = collect_user_moment_files_in_clubs(user.userID, club_ids)
            if moment_files:
                saved_paths = []
                for idx, file_obj in enumerate(moment_files, 1):
                    if not file_obj.fileUrl:
                        continue
                    image_bytes = download_image_from_minio(file_obj.fileUrl)
                    if not image_bytes:
                        continue
                    moment_image_count += 1
                    origin_path = extract_file_path_from_download_url(file_obj.fileUrl)
                    ext = os.path.splitext(origin_path)[1] if origin_path else '.jpg'
                    image_name = f"moment_{idx}{ext or '.jpg'}"
                    image_abs = os.path.join(moment_asset_folder, image_name)
                    with open(image_abs, 'wb') as f:
                        f.write(image_bytes)
                    saved_paths.append(image_abs)

                collage_bytes = build_moment_collage_thumbnail(moment_files, minlength=50, max_images=20)
                if collage_bytes:
                    fd, collage_path = tempfile.mkstemp(prefix='all_user_moment_thumb_', suffix='.jpg', dir=temp_root)
                    os.close(fd)
                    with open(collage_path, 'wb') as f:
                        f.write(collage_bytes)
                    temp_thumb_files.append(collage_path)
                    collage_img = ExcelImage(collage_path)
                    collage_img.anchor = f'F{row_idx}'
                    ws.add_image(collage_img)

                if saved_paths:
                    moments_cell.value = '动态原图'
                    moments_cell.hyperlink = os.path.relpath(saved_paths[0], os.path.dirname(excel_path)).replace("\\", "/")
                    moments_cell.style = "Hyperlink"

        wb.save(excel_path)
    finally:
        try:
            wb.close()
        except Exception:
            pass
        for temp_file in temp_thumb_files:
            if temp_file and os.path.exists(temp_file):
                try:
                    os.unlink(temp_file)
                except Exception:
                    pass

    return {
        'member_count': len(sorted_users),
        'moment_image_count': moment_image_count
    }

def create_single_club_user_excel(club, excel_path, club_asset_folder, temp_root):
    """生成单个协会用户导出Excel与原图目录。"""
    wb = Workbook()
    ws = wb.active
    ws.title = sanitize_sheet_title(club.clubName or f"club_{club.clubID}")

    headers = ['用户名', '用户头像略缩图', '加入协会时间', '参加活动', '发布过的动态']
    header_font = Font(bold=True, size=12)
    header_fill = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    text_alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
    center_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    ws.append(headers)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment

    ws.column_dimensions['A'].width = 22
    ws.column_dimensions['B'].width = 18
    ws.column_dimensions['C'].width = 24
    ws.column_dimensions['D'].width = 48
    ws.column_dimensions['E'].width = 62
    ws.freeze_panes = 'A2'

    members = ClubMember.query.filter_by(clubID=club.clubID, isDelete=False).all()
    temp_thumb_files = []
    moment_image_count = 0

    try:
        for row_idx, member in enumerate(members, 2):
            user = member.user
            if not user:
                continue

            ws.row_dimensions[row_idx].height = 120
            safe_user_name = sanitize_filename(user.userName or f"user_{user.userID}")
            user_folder_name = f"{sanitize_filename(club.clubName)}-{safe_user_name}文件夹"
            user_asset_folder = os.path.join(club_asset_folder, user_folder_name)
            moment_asset_folder = os.path.join(user_asset_folder, '动态原图')
            os.makedirs(moment_asset_folder, exist_ok=True)

            ws.cell(row=row_idx, column=1, value=user.userName or '').alignment = text_alignment
            ws.cell(
                row=row_idx,
                column=3,
                value=member.joinDate.strftime('%Y-%m-%d %H:%M:%S') if member.joinDate else ''
            ).alignment = center_alignment

            event_names = get_user_joined_event_names_in_club(user.userID, club.clubID)
            ws.cell(row=row_idx, column=4, value=''.join([f"【{name}】" for name in event_names]) if event_names else '无').alignment = text_alignment

            avatar_cell = ws.cell(row=row_idx, column=2, value='无头像')
            avatar_cell.alignment = center_alignment
            if user.avatar and user.avatar.fileUrl:
                avatar_bytes = download_image_from_minio(user.avatar.fileUrl)
                if avatar_bytes:
                    avatar_origin_path = extract_file_path_from_download_url(user.avatar.fileUrl)
                    avatar_ext = os.path.splitext(avatar_origin_path)[1] if avatar_origin_path else '.jpg'
                    avatar_file_name = f"avatar{avatar_ext or '.jpg'}"
                    avatar_abs_path = os.path.join(user_asset_folder, avatar_file_name)
                    with open(avatar_abs_path, 'wb') as f:
                        f.write(avatar_bytes)

                    avatar_thumb = generate_thumbnail_bytes(avatar_bytes, minlength=30)
                    if avatar_thumb:
                        fd, thumb_path = tempfile.mkstemp(prefix='avatar_thumb_', suffix='.jpg', dir=temp_root)
                        os.close(fd)
                        with open(thumb_path, 'wb') as f:
                            f.write(avatar_thumb)
                        temp_thumb_files.append(thumb_path)
                        avatar_img = ExcelImage(thumb_path)
                        avatar_img.anchor = f'B{row_idx}'
                        ws.add_image(avatar_img)

                    avatar_cell.value = '头像原图'
                    avatar_cell.hyperlink = os.path.relpath(avatar_abs_path, os.path.dirname(excel_path)).replace("\\", "/")
                    avatar_cell.style = "Hyperlink"

            moments_cell = ws.cell(row=row_idx, column=5, value='无动态')
            moments_cell.alignment = center_alignment
            moment_files = collect_user_moment_files_in_club(user.userID, club.clubID)
            if moment_files:
                saved_paths = []
                for idx, file_obj in enumerate(moment_files, 1):
                    if not file_obj.fileUrl:
                        continue
                    image_bytes = download_image_from_minio(file_obj.fileUrl)
                    if not image_bytes:
                        continue
                    moment_image_count += 1
                    origin_path = extract_file_path_from_download_url(file_obj.fileUrl)
                    ext = os.path.splitext(origin_path)[1] if origin_path else '.jpg'
                    file_name = f"moment_{idx}{ext or '.jpg'}"
                    file_abs = os.path.join(moment_asset_folder, file_name)
                    with open(file_abs, 'wb') as f:
                        f.write(image_bytes)
                    saved_paths.append(file_abs)

                collage_bytes = build_moment_collage_thumbnail(moment_files, minlength=50, max_images=16)
                if collage_bytes:
                    fd, collage_path = tempfile.mkstemp(prefix='user_moment_thumb_', suffix='.jpg', dir=temp_root)
                    os.close(fd)
                    with open(collage_path, 'wb') as f:
                        f.write(collage_bytes)
                    temp_thumb_files.append(collage_path)
                    collage_img = ExcelImage(collage_path)
                    collage_img.anchor = f'E{row_idx}'
                    ws.add_image(collage_img)

                if saved_paths:
                    moments_cell.value = '动态原图'
                    moments_cell.hyperlink = os.path.relpath(saved_paths[0], os.path.dirname(excel_path)).replace("\\", "/")
                    moments_cell.style = "Hyperlink"

        wb.save(excel_path)
    finally:
        try:
            wb.close()
        except Exception:
            pass
        for temp_file in temp_thumb_files:
            if temp_file and os.path.exists(temp_file):
                try:
                    os.unlink(temp_file)
                except Exception:
                    pass

    return {
        'member_count': len(members),
        'moment_image_count': moment_image_count
    }

def get_user_joined_event_names_in_club(user_id, club_id):
    """获取用户在指定协会参加过的活动名称列表。"""
    joins = EventJoin.query.join(Event, Event.eventID == EventJoin.eventID).filter(
        EventJoin.userID == user_id,
        Event.clubID == club_id
    ).all()

    names = []
    for join in joins:
        if hasattr(join, 'isDelete') and join.isDelete:
            continue
        if join.event and join.event.title:
            if join.event.title not in names:
                names.append(join.event.title)
    return names

def get_user_joined_event_names_with_club(user_id, club_ids):
    """获取用户在多个协会中的活动名，格式：协会-活动。"""
    if not club_ids:
        return []

    joins = EventJoin.query.join(Event, Event.eventID == EventJoin.eventID).join(
        Club, Club.clubID == Event.clubID
    ).filter(
        EventJoin.userID == user_id,
        Event.clubID.in_(club_ids)
    ).all()

    names = []
    for join in joins:
        if hasattr(join, 'isDelete') and join.isDelete:
            continue
        if join.event and join.event.title and join.event.club and join.event.club.clubName:
            full_name = f"{join.event.club.clubName}-{join.event.title}"
            if full_name not in names:
                names.append(full_name)
    return names

def collect_user_moment_files_in_club(user_id, club_id):
    """获取用户在指定协会发布过的动态图片文件。"""
    from app.models.file import File

    club_event_ids = [event.eventID for event in Event.query.filter_by(clubID=club_id).all()]
    moment_conditions = [Moment.ref_club_ID == club_id]
    if club_event_ids:
        moment_conditions.append(Moment.ref_event_ID.in_(club_event_ids))

    moments = Moment.query.filter(
        Moment.creatorID == user_id,
        db.or_(*moment_conditions)
    ).order_by(Moment.createDate.asc()).all()

    image_ids = []
    for moment in moments:
        if moment.imageIDs and isinstance(moment.imageIDs, list):
            for image_id in moment.imageIDs:
                if image_id not in image_ids:
                    image_ids.append(image_id)

    if not image_ids:
        return []

    files = File.query.filter(File.fileID.in_(image_ids)).all()
    file_map = {f.fileID: f for f in files}
    return [file_map[file_id] for file_id in image_ids if file_id in file_map]

def collect_user_moment_files_in_clubs(user_id, club_ids):
    """获取用户在多个协会发布过的动态图片文件。"""
    from app.models.file import File

    if not club_ids:
        return []

    club_event_ids = [event.eventID for event in Event.query.filter(Event.clubID.in_(club_ids)).all()]
    moment_conditions = [Moment.ref_club_ID.in_(club_ids)]
    if club_event_ids:
        moment_conditions.append(Moment.ref_event_ID.in_(club_event_ids))

    moments = Moment.query.filter(
        Moment.creatorID == user_id,
        db.or_(*moment_conditions)
    ).order_by(Moment.createDate.asc()).all()

    image_ids = []
    for moment in moments:
        if moment.imageIDs and isinstance(moment.imageIDs, list):
            for image_id in moment.imageIDs:
                if image_id not in image_ids:
                    image_ids.append(image_id)

    if not image_ids:
        return []

    files = File.query.filter(File.fileID.in_(image_ids)).all()
    file_map = {f.fileID: f for f in files}
    return [file_map[file_id] for file_id in image_ids if file_id in file_map]

def create_excel_file_with_images_and_upload(events, filename_prefix, include_club_info=True):
    """创建包含图片的Excel文件并上传到MinIO，返回下载URL"""
    if not EXCEL_AVAILABLE:
        raise Exception("Excel支持库未安装")
    
    try:
        # 创建工作簿
        wb = Workbook()
        ws = wb.active
        ws.title = "活动详情（含图片）"
        
        # 首先扫描所有活动，找出最大动态数量来确定需要多少个动态列
        max_moments = 0
        for event in events:
            # 统计该活动的动态数量
            moments = Moment.query.filter_by(ref_event_ID=event.eventID).all()
            max_moments = max(max_moments, len(moments))
        
        # 设置基础列
        base_columns = ['活动ID', '活动标题', '活动描述', '活动地点', '开始时间', '结束时间', '报名人数', '签到人数', '组织者']
        if include_club_info:
            base_columns.insert(0, '协会名称')
        
        # 限制最大动态数量，避免Excel列名超出范围和文件过于复杂
        # Excel 2007+ 支持最多16,384列，但为了可读性，我们设置一个合理的上限
        base_col_count = len(base_columns)
        max_excel_cols = 16384  # Excel最大列数
        max_allowed_moments = max_excel_cols - base_col_count
        original_max_moments = max_moments
        max_moments = min(max_moments, max_allowed_moments, 100)  # 最多100个动态，保持可读性
        
        if max_moments < original_max_moments:
            current_app.logger.warning(f"动态数量过多，限制为{max_moments}个动态以保持Excel文件的可读性")
        
        # 创建基础表头
        headers = base_columns.copy()
        
        # 为每个动态添加列（每个动态只包含图片列，文本通过合并单元格实现）
        for i in range(max_moments):
            # 每个动态最多5张图片，所以需要5个图片列
            for j in range(5):
                headers.append(f'动态{i+1}图片{j+1}')
        
        # 设置列宽
        col_widths = {}
        base_col_count = len(base_columns)
        
        # 设置基础列宽
        for i in range(base_col_count):
            col_letter = get_excel_column_name(i + 1)
            if include_club_info:
                if i == 0: col_widths[col_letter] = 20  # 协会名称
                elif i == 1: col_widths[col_letter] = 15  # 活动ID
                elif i == 2: col_widths[col_letter] = 25  # 活动标题
                elif i == 3: col_widths[col_letter] = 35  # 活动描述
                elif i == 4: col_widths[col_letter] = 20  # 活动地点
                elif i == 5: col_widths[col_letter] = 20  # 开始时间
                elif i == 6: col_widths[col_letter] = 20  # 结束时间
                elif i == 7: col_widths[col_letter] = 15  # 报名人数
                elif i == 8: col_widths[col_letter] = 15  # 签到人数
                elif i == 9: col_widths[col_letter] = 15  # 组织者
            else:
                if i == 0: col_widths[col_letter] = 15  # 活动ID
                elif i == 1: col_widths[col_letter] = 25  # 活动标题
                elif i == 2: col_widths[col_letter] = 35  # 活动描述
                elif i == 3: col_widths[col_letter] = 20  # 活动地点
                elif i == 4: col_widths[col_letter] = 20  # 开始时间
                elif i == 5: col_widths[col_letter] = 20  # 结束时间
                elif i == 6: col_widths[col_letter] = 15  # 报名人数
                elif i == 7: col_widths[col_letter] = 15  # 签到人数
                elif i == 8: col_widths[col_letter] = 15  # 组织者
        
        # 计算每列的最大图片宽度
        col_max_widths = {}  # 存储每列的最大宽度
        for moment_idx in range(max_moments):
            for img_idx in range(5):  # 5个图片列
                col_num = base_col_count + moment_idx * 5 + img_idx + 1
                col_letter = get_excel_column_name(col_num)
                col_max_widths[col_letter] = 0  # 初始化列宽
        
        # 扫描所有活动，计算每列的最大图片宽度
        for event in events:
            moments = Moment.query.filter_by(ref_event_ID=event.eventID).all()
            for moment_idx, moment in enumerate(moments):
                if moment_idx >= max_moments:
                    break
                
                if moment.imageIDs and PILLOW_AVAILABLE:
                    from app.models.file import File
                    moment_images = File.query.filter(File.fileID.in_(moment.imageIDs)).all()
                    
                    for img_idx, img_file in enumerate(moment_images):
                        if img_idx >= 5:  # 最多5张图片
                            break
                        
                        if img_file.fileUrl and (img_file.fileUrl.startswith('https://www.vhhg.top/api/v1/file/download/') or 
                                                img_file.fileUrl.startswith('/api/v1/file/download/')):
                            try:
                                # 获取图片尺寸
                                image_data = download_image_from_minio(img_file.fileUrl)
                                if image_data:
                                    from PIL import Image
                                    import io
                                    img = Image.open(io.BytesIO(image_data))
                                    original_width, original_height = img.size
                                    
                                    # 计算略缩图宽度（等比例缩放，最大200像素）
                                    max_size = 200
                                    if original_width > original_height:
                                        if original_width > max_size:
                                            adjusted_width = max_size
                                        else:
                                            adjusted_width = original_width
                                    else:
                                        if original_height > max_size:
                                            adjusted_width = int(max_size * original_width / original_height)
                                        else:
                                            adjusted_width = original_width
                                    
                                    # 更新该列的最大宽度
                                    col_num = base_col_count + moment_idx * 5 + img_idx + 1
                                    col_letter = get_excel_column_name(col_num)
                                    col_max_widths[col_letter] = max(col_max_widths[col_letter], adjusted_width)
                            except Exception as e:
                                current_app.logger.warning(f"获取图片尺寸失败: {str(e)}")
        
        # 设置动态列宽（根据每列的最大图片宽度）
        for moment_idx in range(max_moments):
            for img_idx in range(5):  # 5个图片列
                col_num = base_col_count + moment_idx * 5 + img_idx + 1
                col_letter = get_excel_column_name(col_num)
                # 设置列宽为最大图片宽度
                # Excel列宽单位：1单位 ≈ 7像素，所以像素宽度除以7
                col_widths[col_letter] = col_max_widths[col_letter] / 7
        
        # 应用列宽设置
        for col_letter, width in col_widths.items():
            ws.column_dimensions[col_letter].width = width
            
        # 写入标题行
        header_font = Font(bold=True, size=12)
        header_fill = PatternFill(start_color="D9D9D9", end_color="D9D9D9", fill_type="solid")
        header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        
        # 写入所有表头
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_alignment
        
        # 设置标题行高度
        ws.row_dimensions[1].height = 25
        
        # 写入数据行
        data_font = Font(size=11)
        data_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        
        current_row = 2
        images_processed = 0
        images_failed = 0
        temp_image_files = []  # 存储所有临时图片文件，在Excel保存后清理
        
        for event in events:
            # 获取报名人数和签到人数
            total_participants = EventJoin.query.filter_by(eventID=event.eventID).count()
            checked_in_count = EventJoin.query.filter_by(eventID=event.eventID).filter(
                EventJoin.clockinDate.isnot(None)
            ).count()
            
            # 获取组织者信息
            organizer = User.query.filter_by(userID=event.authorID).first()
            organizer_name = organizer.userName if organizer else '未知'
            
            # 准备基础数据行
            row_data = [
                event.eventID,
                event.title,
                event.message or '',
                event.location_name or event.location or '',
                event.pre_startTime.strftime('%Y-%m-%d %H:%M') if event.pre_startTime else '',
                event.pre_endTime.strftime('%Y-%m-%d %H:%M') if event.pre_endTime else '',
                total_participants,
                checked_in_count,
                organizer_name
            ]
            
            if include_club_info:
                row_data.insert(0, event.club.clubName if event.club else '未知协会')
            
            # 写入基础数据到Excel
            for col, value in enumerate(row_data, 1):
                cell = ws.cell(row=current_row, column=col, value=value)
                cell.font = data_font
                cell.alignment = data_alignment
            
            # 处理动态内容
            base_col_count = len(base_columns)
            moments = Moment.query.filter_by(ref_event_ID=event.eventID).all()
            
            # 计算图片行需要的最大高度
            max_img_height = 0
            if moments:
                for moment in moments:
                    if moment.imageIDs and PILLOW_AVAILABLE:
                        from app.models.file import File
                        moment_images = File.query.filter(File.fileID.in_(moment.imageIDs)).all()
                        for img_file in moment_images:
                            if img_file.fileUrl and (img_file.fileUrl.startswith('https://www.vhhg.top/api/v1/file/download/') or 
                                                    img_file.fileUrl.startswith('/api/v1/file/download/')):
                                try:
                                    # 获取图片尺寸
                                    image_data = download_image_from_minio(img_file.fileUrl)
                                    if image_data:
                                        from PIL import Image
                                        import io
                                        img = Image.open(io.BytesIO(image_data))
                                        original_width, original_height = img.size
                                        
                                        # 计算略缩图高度（等比例缩放，最大200像素）
                                        max_size = 200
                                        if original_width > original_height:
                                            if original_width > max_size:
                                                adjusted_height = int(max_size * original_height / original_width)
                                            else:
                                                adjusted_height = original_height
                                        else:
                                            if original_height > max_size:
                                                adjusted_height = max_size
                                            else:
                                                adjusted_height = original_height
                                        
                                        max_img_height = max(max_img_height, adjusted_height)
                                except Exception as e:
                                    current_app.logger.warning(f"获取图片尺寸失败: {str(e)}")
                                    max_img_height = max(max_img_height, 200)  # 使用默认高度
            
            # 设置行高以容纳图片和文字
            if moments:
                # Excel行高单位：1单位 ≈ 1.33像素，所以像素高度除以1.33
                adjusted_row_height = max_img_height / 1.33 + 5  # 图片行高度（根据最大图片高度）
                ws.row_dimensions[current_row].height = adjusted_row_height
                ws.row_dimensions[current_row + 1].height = 45   # 文本行高度
            
            # 处理每个动态
            for moment_idx, moment in enumerate(moments):
                if moment_idx >= max_moments:
                    break
                
                # 计算动态的起始列位置
                moment_start_col = base_col_count + moment_idx * 5 + 1
                
                # 1. 处理动态中的图片（图片行）
                if moment.imageIDs and PILLOW_AVAILABLE:
                    from app.models.file import File
                    moment_images = File.query.filter(File.fileID.in_(moment.imageIDs)).all()
                    
                    for img_idx, img_file in enumerate(moment_images):
                        if img_idx >= 5:  # 最多5张图片
                            break
                        
                        if img_file.fileUrl and (img_file.fileUrl.startswith('https://www.vhhg.top/api/v1/file/download/') or 
                                                img_file.fileUrl.startswith('/api/v1/file/download/')):
                            try:
                                # 从MinIO下载图片
                                image_data = download_image_from_minio(img_file.fileUrl)
                                if image_data:
                                    temp_img_file = None
                                    try:
                                        temp_fd, temp_img_file = tempfile.mkstemp(suffix='.jpg')
                                        os.close(temp_fd)
                                        with open(temp_img_file, 'wb') as f:
                                            f.write(image_data)
                                        excel_img = ExcelImage(temp_img_file)
                                        original_width = excel_img.width
                                        original_height = excel_img.height
                                        
                                        # 计算略缩图尺寸（等比例缩放，最大200像素）
                                        max_size = 200
                                        if original_width > original_height:
                                            if original_width > max_size:
                                                excel_img.width = max_size
                                                excel_img.height = int(max_size * original_height / original_width)
                                            else:
                                                excel_img.width = original_width
                                                excel_img.height = original_height
                                        else:
                                            if original_height > max_size:
                                                excel_img.height = max_size
                                                excel_img.width = int(max_size * original_width / original_height)
                                            else:
                                                excel_img.width = original_width
                                                excel_img.height = original_height
                                        
                                        # 计算图片列位置
                                        img_col = moment_start_col + img_idx
                                        img_col_letter = get_excel_column_name(img_col)
                                        
                                        # 设置图片位置（图片行）
                                        excel_img.anchor = f'{img_col_letter}{current_row}'
                                        
                                        # 添加略缩图到工作表
                                        ws.add_image(excel_img)
                                        
                                        # 创建原始图片对象（用于打包）
                                        original_excel_img = ExcelImage(temp_img_file)
                                        original_excel_img.width = original_width
                                        original_excel_img.height = original_height
                                        
                                        # 将原始图片放在隐藏位置（比如Z列之后）
                                        hidden_col = 26 + moment_idx * 5 + img_idx  # 使用隐藏列
                                        hidden_col_letter = get_excel_column_name(hidden_col)
                                        original_excel_img.anchor = f'{hidden_col_letter}999'  # 放在第999行
                                        
                                        # 添加原始图片到工作表（隐藏）
                                        ws.add_image(original_excel_img)
                                        
                                        # 为略缩图单元格添加超链接到原始图片
                                        cell = ws.cell(row=current_row, column=img_col)
                                        cell.hyperlink = f"#{hidden_col_letter}999"
                                        cell.style = "Hyperlink"
                                        
                                        images_processed += 1
                                        temp_image_files.append(temp_img_file)
                                        
                                        current_app.logger.info(f"成功添加动态{moment.momentID}的第{img_idx+1}张图片到列{img_col_letter}")
                                    except Exception as img_error:
                                        current_app.logger.error(f"创建Excel图片对象失败，动态{moment.momentID}第{img_idx+1}张图片: {str(img_error)}")
                                        images_failed += 1
                                        if temp_img_file and os.path.exists(temp_img_file):
                                            try: os.unlink(temp_img_file)
                                            except: pass
                                else:
                                    images_failed += 1
                            except Exception as e:
                                current_app.logger.error(f"处理动态{moment.momentID}图片时出错: {str(e)}")
                                images_failed += 1
                        else:
                            current_app.logger.warning(f"动态{moment.momentID}第{img_idx+1}张图片URL无效")
                
                # 2. 准备动态文字内容
                creator_name = moment.creator.userName if moment.creator else '未知用户'
                moment_content = moment.description or '无内容'
                moment_text = f"发布者: {creator_name}\n内容: {moment_content}"
                
                # 3. 合并文本单元格并写入内容（文本行）
                text_start_col = moment_start_col
                text_end_col = moment_start_col + 4  # 合并5个图片列的宽度
                text_start_letter = get_excel_column_name(text_start_col)
                text_end_letter = get_excel_column_name(text_end_col)
                
                # 合并单元格
                ws.merge_cells(f'{text_start_letter}{current_row + 1}:{text_end_letter}{current_row + 1}')
                
                # 写入文本内容
                cell = ws.cell(row=current_row + 1, column=text_start_col, value=moment_text)
                cell.font = data_font
                cell.alignment = data_alignment
                
                # 4. 添加动态外部边框（只在动态外部添加边框）
                from openpyxl.styles import Border, Side
                
                # 定义外部边框样式
                left_border = Border(left=Side(style='thick', color='000000'))
                right_border = Border(right=Side(style='thick', color='000000'))
                top_border = Border(top=Side(style='thick', color='000000'))
                bottom_border = Border(bottom=Side(style='thick', color='000000'))
                
                # 为图片行添加外部边框
                for col_idx in range(5):
                    col_num = moment_start_col + col_idx
                    cell = ws.cell(row=current_row, column=col_num)
                    
                    # 构建边框（组合多个边框）
                    border_parts = []
                    
                    # 上边框（所有列）
                    border_parts.append(Side(style='thick', color='000000'))
                    
                    # 左边框（第一列）
                    if col_idx == 0:
                        border_parts.append(Side(style='thick', color='000000'))
                    
                    # 右边框（最后一列）
                    if col_idx == 4:
                        border_parts.append(Side(style='thick', color='000000'))
                    
                    # 设置边框
                    if len(border_parts) == 1:
                        cell.border = Border(top=border_parts[0])
                    elif len(border_parts) == 2:
                        if col_idx == 0:
                            cell.border = Border(top=border_parts[0], left=border_parts[1])
                        else:
                            cell.border = Border(top=border_parts[0], right=border_parts[1])
                    elif len(border_parts) == 3:
                        cell.border = Border(top=border_parts[0], left=border_parts[1], right=border_parts[2])
                
                # 为文本行添加外部边框
                text_cell = ws.cell(row=current_row + 1, column=text_start_col)
                text_cell.border = Border(
                    left=Side(style='thick', color='000000'),
                    right=Side(style='thick', color='000000'),
                    bottom=Side(style='thick', color='000000')
                )
            
            # 如果没有动态，设置较小的行高
            if not moments:
                ws.row_dimensions[current_row].height = 30
                current_row += 1
            else:
                # 有动态时，移动到下一行活动（图片行 + 文本行）
                current_row += 2
        
        # 冻结首行
        ws.freeze_panes = 'A2'
        
        # 设置打印和显示选项
        ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
        
        # 使用临时文件保存Excel，避免内存流问题
        temp_file = None
        try:
            # 创建临时文件
            temp_fd, temp_file = tempfile.mkstemp(suffix='.xlsx')
            os.close(temp_fd)  # 关闭文件描述符，我们只需要文件路径
            
            # 保存到临时文件
            wb.save(temp_file)
            
            # 生成文件名
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{filename_prefix}_with_images_{timestamp}.xlsx"
            
            # 上传到MinIO
            minio_client = get_minio_client()
            bucket_name = current_app.config.get('MINIO_BUCKET', 'manage-mate')
            
            # 确保bucket存在
            ensure_bucket_exists(minio_client, bucket_name)
            
            # 将文件上传到statistics文件夹
            file_path = f"statistics/{filename}"
            
            # 获取文件大小
            file_size = os.path.getsize(temp_file)
            
            # 从临时文件上传到MinIO
            current_app.logger.info(f"开始上传文件到MinIO: bucket={bucket_name}, path={file_path}, size={file_size}")
            with open(temp_file, 'rb') as file_data:
                minio_client.put_object(
                    bucket_name,
                    file_path,
                    file_data,
                    length=file_size,
                    content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                )
            current_app.logger.info(f"MinIO上传完成: {file_path}")
            
            # 在上传完成后关闭工作簿，释放所有资源
            wb.close()
            
        finally:
            # 清理临时Excel文件
            if temp_file and os.path.exists(temp_file):
                try:
                    os.unlink(temp_file)
                except:
                    pass
            
            # 清理所有临时图片文件
            for temp_img_file in temp_image_files:
                if temp_img_file and os.path.exists(temp_img_file):
                    try:
                        os.unlink(temp_img_file)
                    except:
                        pass
        
        # 生成下载URL
        base_url = current_app.config.get('BASE_URL', 'https://www.vhhg.top')
        download_url = f"{base_url}/api/v1/file/download/tmp/{file_path}"
        
        current_app.logger.info(f"包含动态图片的Excel文件生成并上传成功: {file_path}, 最大动态数: {max_moments}, 处理图片: {images_processed}张, 失败: {images_failed}张")
        
        return jsonify({
            'code': 200,
            'message': f'导出成功（包含动态图片）- 最大动态数: {max_moments}, 成功处理{images_processed}张图片，失败{images_failed}张',
            'data': {
                'download_url': download_url,
                'filename': filename,
                'file_path': file_path,
                'file_size': file_size,
                'create_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'includes_images': True,
                'max_moments': max_moments,
                'images_processed': images_processed,
                'images_failed': images_failed
            }
        })
        
    except Exception as e:
        current_app.logger.error(f"创建包含图片的Excel文件失败: {str(e)}")
        raise

def is_supported_image_format(file_type):
    """检查图片格式是否被Excel支持"""
    if not file_type:
        return False
    
    # Excel支持的图片格式
    supported_formats = ['JPEG', 'JPG', 'PNG', 'GIF', 'BMP', 'TIFF']
    file_type_upper = file_type.upper().replace('.', '')
    return file_type_upper in supported_formats

def download_image_from_minio(image_url):
    """从MinIO下载图片数据并转换为Excel支持的格式"""
    try:
        # 提取文件路径 - 支持完整URL和相对路径
        if image_url.startswith('https://www.vhhg.top/api/v1/file/download/'):
            file_path = image_url.replace('https://www.vhhg.top/api/v1/file/download/', '')
        elif image_url.startswith('/api/v1/file/download/'):
            file_path = image_url.replace('/api/v1/file/download/', '')
        else:
            current_app.logger.error(f"无效的图片URL格式: {image_url}")
            return None
        
        # 获取MinIO客户端
        minio_client = get_minio_client()
        bucket_name = current_app.config.get('MINIO_BUCKET', 'manage-mate')
        
        # 下载图片数据
        response = minio_client.get_object(bucket_name, file_path)
        image_data = response.read()
        response.close()
        response.release_conn()
        
        # 检查图片格式并转换为Excel支持的格式
        if PILLOW_AVAILABLE:
            img_stream = None
            output_stream = None
            try:
                # 使用Pillow打开图片
                img_stream = io.BytesIO(image_data)
                pil_image = PILImage.open(img_stream)
                
                # 检查图片格式
                image_format = pil_image.format
                current_app.logger.info(f"图片格式: {image_format}")
                
                # 如果是不支持的格式（如webp），转换为JPEG
                if image_format and image_format.upper() in ['WEBP', 'BMP', 'TIFF']:
                    current_app.logger.info(f"转换图片格式从 {image_format} 到 JPEG")
                    # 如果图片有透明通道，需要转换为RGB
                    if pil_image.mode in ('RGBA', 'LA', 'P'):
                        # 创建白色背景
                        background = PILImage.new('RGB', pil_image.size, (255, 255, 255))
                        if pil_image.mode == 'P':
                            pil_image = pil_image.convert('RGBA')
                        background.paste(pil_image, mask=pil_image.split()[-1] if pil_image.mode == 'RGBA' else None)
                        pil_image = background
                    elif pil_image.mode != 'RGB':
                        pil_image = pil_image.convert('RGB')
                    
                    # 转换为JPEG格式
                    output_stream = io.BytesIO()
                    pil_image.save(output_stream, format='JPEG', quality=85)
                    image_data = output_stream.getvalue()
                    current_app.logger.info(f"成功转换图片格式为JPEG")
                
            except Exception as conversion_error:
                current_app.logger.error(f"图片格式转换失败: {str(conversion_error)}")
                # 如果转换失败，返回原始数据，让Excel处理
                pass
            finally:
                # 确保所有流都被正确关闭
                if img_stream:
                    try:
                        img_stream.close()
                    except:
                        pass
                if output_stream:
                    try:
                        output_stream.close()
                    except:
                        pass
        
        current_app.logger.info(f"成功下载图片: {file_path}")
        return image_data
        
    except Exception as e:
        current_app.logger.error(f"从MinIO下载图片失败 {image_url}: {str(e)}")
        return None

@bp.route('/export/test_image_support', methods=['GET'])
@jwt_required()
def test_image_support():
    """测试图片导出功能的支持情况"""
    # 权限检查
    has_permission, message = check_permission(statistics.test_image_support.permission_judge)
    if not has_permission:
        return jsonify({'code': 4003, 'message': message}), 200
    
    user_id = get_jwt_identity()
    current_user = User.query.filter_by(userID=user_id).first()
    
    if not current_user:
        return jsonify({'code': 4004, 'message': '用户不存在'}), 200
    
    support_info = {
        'excel_available': EXCEL_AVAILABLE,
        'pillow_available': PILLOW_AVAILABLE,
        'image_export_supported': EXCEL_AVAILABLE and PILLOW_AVAILABLE
    }
    
    if EXCEL_AVAILABLE and PILLOW_AVAILABLE:
        message = '图片导出功能完全支持'
        code = 200
    elif EXCEL_AVAILABLE:
        message = '仅支持基础Excel导出，缺少图片处理库Pillow'
        code = 200
    else:
        message = '不支持Excel导出功能，缺少openpyxl库'
        code = 500
    
    return jsonify({
        'code': code,
        'message': message,
        'data': support_info
    })
