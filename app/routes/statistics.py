from flask import Blueprint, jsonify, request, make_response
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..models import User, Club, ClubMember, Event, EventJoin, ClubFee, PayGroup, Moment
from .. import db
from app.permission import check_permission, statistics
from datetime import datetime, timedelta
import io
import tempfile
import os
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
    """导出所有协会的会员情况"""
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
    
    try:
        # 获取所有协会
        clubs = Club.query.all()
        
        # 准备数据
        headers = [
            '协会名称', '用户ID', '用户名', '性别', '手机号', '邮箱', '单位', 
            '角色', '加入时间', '创建时间', '状态'
        ]
        
        data_rows = []
        for club in clubs:
            # 获取该协会的所有成员
            members = ClubMember.query.filter(ClubMember.clubID == club.clubID).all()
            
            for member in members:
                user = User.query.filter(User.userID == member.userID).first()
                if user:
                    data_rows.append([
                        club.clubName,
                        user.userID,
                        user.userName,
                        user.gender or '',
                        user.phone or '',
                        user.email or '',
                        user.department or '',
                        member.role or 'member',
                        member.joinDate.strftime('%Y-%m-%d %H:%M:%S') if member.joinDate else '',
                        user.createDate.strftime('%Y-%m-%d %H:%M:%S') if user.createDate else '',
                        '正常'
                    ])
        
        return create_excel_file_and_upload(headers, data_rows, 'all_club_users')
        
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
    """导出所有协会的所有活动详细信息（包含图片）"""
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
    
    try:
        # 获取所有活动
        events = Event.query.join(Club).all()
        
        return create_excel_file_with_images_and_upload(events, 'all_club_all_events', include_club_info=True)
        
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
    
    try:
        # 获取所有活动
        events = Event.query.join(Club).all()
        
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
                'file_size': output.getbuffer().nbytes,
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
                'file_size': output.getbuffer().nbytes,
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
