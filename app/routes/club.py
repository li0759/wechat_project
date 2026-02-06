from flask import Flask, Blueprint, request, jsonify
from flask_jwt_extended import JWTManager, jwt_required,  get_jwt_identity
from ..models import Event, User, ClubMember, EventJoin, Club, Schedule, File, ClubApplication
from app import db, TEST_MODE
from datetime import datetime, timedelta
from sqlalchemy import func 
import base64
import hashlib
import os
from flask import current_app
from app.permission import check_permission, club
from app.routes.file import delete_file_inside
import requests

bp = Blueprint('club', __name__, url_prefix='/api/v1/club')


# ==================== 协会管理路由 ====================


# 获取协会列表
# 参数：show - "all"(全部协会) 或 "active"(未删除协会，默认)
# 参数：mode - "page"(分页模式) 或 "all"(全部模式)
# 参数：page - 页码（仅在分页模式下有效）
# 返回参数：
# 4000：调用成功
@bp.route('/list/<string:show>', methods=['GET'])
@jwt_required()
def get_club_list(show):
    # 权限检查
    has_permission, message = check_permission(club.get_club_list.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    # 获取分页参数
    mode = request.args.get('mode', 'page')
    page = request.args.get('page', default=1, type=int)
    PAGE_SIZE = 6

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()
    
    # 1. 构建基础查询
    query = Club.query
    
    # 2. show参数过滤
    if show == "all":
        # 查询所有协会（包括已删除的）
        pass  # 不添加过滤条件
    elif show == "active":
        # 只查询未删除的协会
        query = query.filter_by(isDelete=False)
    
    # 3. 排序（按创建时间降序）
    query = query.order_by(Club.createDate.desc())
    
    # 4. 最后执行查询
    if mode == 'page':
        pagination = query.paginate(page=page, per_page=PAGE_SIZE, error_out=False)
        clubs = pagination.items
        total_pages = pagination.pages
        total_records = pagination.total
    else:
        clubs = query.all()
        total_pages = 1
        total_records = len(clubs)
    
    # 获取用户已加入的协会ID和管理员协会ID（只包括未删除的成员记录）
    joined_club_ids = {m.clubID for m in cur_user.clubmembers if not m.isDelete}
    # 管理员协会ID：只包含未删除的成员记录
    # 即使协会被删除，成员记录也不会被标记为删除，所以这里的逻辑很简单
    admin_club_ids = {m.clubID for m in cur_user.clubmembers 
                     if m.role in ['president', 'vice_president', 'director'] and not m.isDelete}
    
    return jsonify({
        'Flag':'4000',
        'message': '调用成功',
        'data':{
            'records': [{
            'club_id': club.clubID,
            'club_name': club.clubName,
            'description': club.description,
            'president_username': club.president.user.userName if club.president and not club.president.isDelete and club.president.user else None,
            'president_avatar': club.president.user.avatar.fileUrl if club.president and not club.president.isDelete and club.president.user and club.president.user.avatar else None,
            # 获取协会成员数量（只统计未删除的成员）
            'member_num': len([m for m in club.members if not m.isDelete]),
            'cover_url': club.cover.fileUrl if club.cover else None,
            'is_deleted': club.isDelete,  # 标识协会是否已删除
            'cur_user_is_member': club.clubID in joined_club_ids,
            'cur_user_managed': club.clubID in admin_club_ids    
        } for club in clubs],
        'pagination': {
            'total_pages': total_pages,
            'current_page': page,
            'page_size': PAGE_SIZE,
            'total_records': total_records
            }
        }
    })



# 获取协会详细信息（包含协会章程）
# 返回参数：
# 4000：调用成功
@bp.route('/<int:club_id>', methods=['GET'])
@jwt_required()
def get_club_detail(club_id):
    # 权限检查
    has_permission, message = check_permission(club.get_club_detail.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    # 查询未删除的协会
    club_show = Club.query.filter_by(clubID=club_id).first()

    
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 利用User模型的关系属性（只检查未删除的成员记录）
    is_member = any(manager.userID == cur_user.userID for manager in club_show.members)
    
    # 利用Club模型的managers关系（检查managers是否未删除）
    is_manager = any(manager.userID == cur_user.userID for manager in club_show.managers)   
    is_president = (club_show.president and club_show.president.userID == cur_user.userID)
    # 检查当前用户是否对当前协会有待处理的申请
    has_pending_application = any(
        app.clubID == club_id and app.processedDate is None
        for app in cur_user.appliced_clubApplications
    )
    return jsonify({
        'Flag': '4000',
        'message': '调用成功',
        'data': {
            'id': club_show.clubID,
            'is_deleted': club_show.isDelete,
            'name': club_show.clubName,
            'description': club_show.description,
            'charter': club_show.charter,
            'cover_url': club_show.cover.fileUrl if club_show.cover else None,
			# 最近开展的5个活动：actual_endTime为空的在前，其余按actual_endTime倒序
			'recent_events': [{
				'event_id': e.eventID,
				'title': e.title,
				'pre_startTime': e.pre_startTime.isoformat() if e.pre_startTime else None,
				'pre_endTime': e.pre_endTime.isoformat() if e.pre_endTime else None,
				'join_count': len(e.eventjoins),
				'content': e.message,
				'location': e.location,
                'location_data': ({
                    'name': e.location_name,
                    'address': e.location_address,
                    'latitude': e.location_latitude,
                    'longitude': e.location_longitude
                } if (hasattr(e, 'location_latitude') and hasattr(e, 'location_longitude') and e.location_latitude and e.location_longitude) else None),
                'premap_url': (
                    f"https://maps.geoapify.com/v1/staticmap?style=osm-bright-grey&width=600&height=400&center=lonlat:{e.location_longitude},{e.location_latitude}&zoom=14&styleCustomization=road_label_primary:36|road_label_secondary:36|place_label_park:36|place_label_village:36|place_label_city:36|place_label_town:36|place_state-label:36|place_label_country:36&marker=lonlat:{e.location_longitude},{e.location_latitude};type:awesome;color:%23ff0000;size:28&scaleFactor=2&apiKey={current_app.config.get('GEOAPIFY_API_KEY', '')}"
                    if (hasattr(e, 'location_latitude') and hasattr(e, 'location_longitude') and e.location_latitude and e.location_longitude) else None
                ),
				'cover_url': e.cover.fileUrl if e.cover else None,
                'recent_moments': [
                    {
                        'moment_id': m.momentID,
                        'image_files': [file.to_dict() for file in m.image_files] if m.image_files else [],
                        'description': m.description,
                        'createDate': m.createDate.isoformat() if m.createDate else None
                    } for m in sorted(e.moments, key=lambda x: x.createDate or datetime.min, reverse=True)
                ][:5],
			} for e in sorted(
				[e for e in club_show.events if not e.is_cancelled],
				key=lambda x: (
					x.actual_endTime is None,
					(x.actual_startTime if x.actual_endTime is None else x.actual_endTime) or datetime.min
				),
				reverse=True
			)][:5],
            	
            'member_count': len(club_show.members),
            'joined_date': next((ej.joinDate for ej in club_show.members if ej.userID == cur_user.userID), None),
            'cur_user_is_manager': is_manager,
            'cur_user_is_president': is_president,
            'cur_user_is_member': is_member,
            'cur_user_is_superuser': cur_user.isSuperUser,
            'cur_user_has_pending_application': has_pending_application,
            # 新增会长信息（只显示未删除的会长）
            'president_id': club_show.president.user.userID if club_show.president and not club_show.president.isDelete else None,
            'president_username': club_show.president.user.userName if club_show.president and not club_show.president.isDelete else None,
            'president_avatar': club_show.president.user.avatar.fileUrl if club_show.president and not club_show.president.isDelete and club_show.president.user.avatar else None,
        }
    })

# 发起加入某个社团的申请
# 返回参数：
# 4000：申请成功
@bp.route('/<int:club_id>/applicated', methods=['GET'])
@jwt_required()
def applicated_club(club_id):
    # 权限检查
    has_permission, message = check_permission(club.applicated_club.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 加载目标社团，避免与权限模块 club 名称冲突
    target_club = Club.query.filter_by(clubID=club_id).first()

    application = ClubApplication(
        userID=cur_user.userID,
        clubID=club_id,
    )
    db.session.add(application)
    db.session.commit()

    return jsonify({
        'Flag':'4000',
        'message': '用户成功发起加入协会申请',
        'data': {
            'user_name': cur_user.userName,
            'president_id': target_club.president.userID if target_club and target_club.president and not target_club.president.isDelete else None,
            'club_name': target_club.clubName if target_club else None,
            'club_id': target_club.clubID if target_club else club_id
        }
    })

# 删除入团申请
# 返回参数：
# 4000：申请成功
# 4001：申请不存在
# 4002：用户无权限删除申请
@bp.route('/application/<int:application_id>/delete', methods=['GET'])
@jwt_required()
def delete_application(application_id):
    # 权限检查
    has_permission, message = check_permission(club.delete_application.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 查询申请记录
    application = ClubApplication.query.filter_by(applicationID=application_id).first()

    # 删除申请记录
    db.session.delete(application)
    db.session.commit()

    return jsonify({
        'Flag': '4000',
        'message': '删除申请成功'
    })

# 删除指定社团成员（软删除）
# 权限：社团管理员或超级管理员
# 返回参数：
# 4000: 调用成功
# 4001: 社团不存在
# 4002：该用户无权限调用该API
# 4003: 成员不存在
# 4004: 成员已被删除
@bp.route('/<int:club_id>/quit', methods=['GET'])
@jwt_required()
def quit_club(club_id):
    # 权限检查
    has_permission, message = check_permission(club.quit_club.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200
    
    user_id = get_jwt_identity()
    
    # 先获取社团信息（只查询未删除的协会）
    club_show = Club.query.filter_by(clubID=club_id).first()
    
    # 检查成员是否存在（通过user_id和club_id查询）
    member = ClubMember.query.filter_by(userID=user_id, clubID=club_id).first()
    if not member:
        return jsonify({'Flag': '4003', 'message': '成员不存在'}), 200
    if member.isDelete:
        return jsonify({'Flag': '4004', 'message': '成员已被删除'}), 200
    
    # 获取被删除用户的信息
    deleted_user = User.query.get(user_id)
    
    # 软删除成员记录
    member.isDelete = True
    db.session.commit()
    
    return jsonify({
        'Flag':'4000',
        'message': '退出社团成功',
        'data': {
            'club_id': club_show.clubID,
            'club_name': club_show.clubName,
            'user_id': user_id,
            'user_name': deleted_user.userName
        }
    }), 200

# 处理用户社团申请
# 功能：实现社团管理员和超级管理用审批用户入团申请
# 返回参数：
# 4000：调用成功
# 4001：申请不存在
# 4002：处理人权限不足
# 4003：请求参数不完整、不正确
@bp.route('/application/<int:application_id>/processed/<string:operation>', methods=['POST'])
@jwt_required()
def process_application(application_id, operation):
    # 权限检查
    has_permission, message = check_permission(club.process_application.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    data = request.get_json()
    opinion = data.get('opinion')
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 根据handleID查询ClubApplication表中的数据
    application = ClubApplication.query.filter_by(
        applicationID=application_id
    ).first()


    if operation == 'approved':
        application.approved = True
    else:
        application.approved = False
    application.processedDate = datetime.utcnow()
    application.processedBy = cur_user.userID
    application.opinion = opinion

    if operation == 'approved':
        # 获取协会信息
        club_show = Club.query.filter_by(clubID=application.clubID).first()
        # 获取申请用户信息
        apply_user = User.query.get(application.userID)
        
        # 若该用户在该社团已有成员记录，则优先处理软删除恢复，避免重复
        existing_member = ClubMember.query.filter_by(
            userID=application.userID,
            clubID=application.clubID
        ).first()
        
        if existing_member:
            if existing_member.isDelete:
                existing_member.isDelete = False
                existing_member.role = 'member'
                existing_member.joinDate = datetime.utcnow()
                existing_member.exitReason = None
            # 若已是活跃成员，则不重复创建
        else:
            # 创建新的会员记录
            member = ClubMember(
                userID=application.userID,
                clubID=application.clubID,
                role='member'
            )
            db.session.add(member)
        
        db.session.flush()  # 确保member有ID

    db.session.commit()

    return jsonify({
        'Flag':'4000',
        'message': '调用成功',
        'data': {
            'approved': application.approved,
            'appliced_user_id': application.appliced_user.userID, 
            'applicatedDate': application.applicatedDate,
            'club_id': application.club.clubID,
            'club_name':application.club.clubName,
            'club_cover':application.club.cover.fileUrl if application.club.cover else None,
            'processedDate':application.processedDate,
            'opinion':application.opinion
        }}
    )

# 查看某协会的所有未审批的入会申请
# 返回参数：
# 4000: 调用成功
# 4002：该用户无权限调用该API
@bp.route('/application/<int:club_id>/pending/list', methods=['GET'])
@jwt_required()
def get_application_for_club_pending(club_id):
    # 权限检查
    has_permission, message = check_permission(club.get_application_for_club_pending.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    # 当前接口不依赖当前用户实体，避免在某些身份上下文下出现空用户异常
    _ = get_jwt_identity()
    
    # 检查协会是否存在且未删除
    club_show = Club.query.filter_by(clubID=club_id).first()

    # 过滤出未处理的申请（processedDate为None）
    pending_applications = [app for app in club_show.clubApplications if app.processedDate is None]

    return jsonify({
        'Flag':'4000',
        'message': '调用成功',
        'data': [{
            'applicationID': app.applicationID,
            'approved': app.approved,
            'appliced_user_name': app.appliced_user.userName if app.appliced_user else '未知用户',
            'appliced_user_id': app.appliced_user.userID if app.appliced_user else None,
            'appliced_user_avartor': (app.appliced_user.avatar.fileUrl if app.appliced_user and app.appliced_user.avatar else None),
            'applicatedDate': app.applicatedDate.isoformat() if app.applicatedDate else None,
            'processed_user_name': app.processed_user.userName if app.processed_user else None,
            'processed_user_id': app.processed_user.userID if app.processed_user else None,
            'club_name': app.club.clubName,
            'processedDate': app.processedDate.isoformat() if app.processedDate else None,
            'opinion': app.opinion
        } for app in pending_applications]
    })

# 查看某协会的所有入会申请
# 返回参数：
# 4000: 调用成功
# 4002：该用户无权限调用该API
@bp.route('/application/<int:club_id>/list', methods=['GET'])
@jwt_required()
def get_all_applications_for_club(club_id):
    # 权限检查
    has_permission, message = check_permission(club.get_all_applications_for_club.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    # 当前接口不依赖当前用户实体，避免在某些身份上下文下出现空用户异常
    _ = get_jwt_identity()
    
    # 检查协会是否存在且未删除
    club_show = Club.query.filter_by(clubID=club_id).first()


    # 获取所有申请，并按 applicatedDate 为 null 的排在前面
    applications = club_show.clubApplications
    sorted_applications = sorted(
        applications,
        key=lambda app: (app.applicatedDate is not None, app.applicatedDate)
    )
    
    return jsonify({
        'Flag':'4000',
        'message': '调用成功',
        'data': [{
            'applicationID': app.applicationID,
            'approved': app.approved,
            'appliced_user_name': app.appliced_user.userName if app.appliced_user else '未知用户',
            'appliced_user_id': app.appliced_user.userID if app.appliced_user else None,
            'appliced_user_avartor': app.appliced_user.avatar.fileUrl if app.appliced_user and app.appliced_user.avatar else None, 
            'applicatedDate': app.applicatedDate,
            'processed_user_name': app.processed_user.userName if app.processed_user else None,
            'processed_user_id': app.processed_user.userID if app.processed_user else None,
            'club_name': app.club.clubName,
            'processedDate': app.processedDate,
            'opinion': app.opinion
        } for app in sorted_applications]
    })

# 将指定用户加入社团(不用走审批流程)
# 权限：社团管理员或超级管理员
# 功能：将指定用户的role设置为member，并将社团的leader设置为指定会员的userID
# 返回参数：
# 4000: 调用成功
# 4001: 社团不存在
# 4002：该用户无权限调用该API
# 4003: 用户不存在
# 4004: 用户已经是社团成员
@bp.route('/<int:club_id>/addmember/<int:user_id>', methods=['GET'])
@jwt_required()
def add_member(club_id, user_id):
    # 权限检查
    has_permission, message = check_permission(club.add_member.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    if TEST_MODE:
        current_user_id = get_jwt_identity()
        cur_user = User.query.filter_by(userID=current_user_id).first()
    else:
        user_weid = get_jwt_identity()
        cur_user = User.query.filter_by(wecomUserID=user_weid).first()
    
    # 先获取社团信息（只查询未删除的协会）
    club_show = Club.query.filter_by(clubID=club_id).first()
    
    # 检查目标用户是否存在
    user = User.query.get(user_id)
    if user is None:
        return jsonify({'Flag':'4003','message': '用户不存在'}), 200
    
    # 检查用户是否已经是社团成员（包括已删除的记录）
    existing_member = ClubMember.query.filter_by(userID=user_id, clubID=club_id).first()
    if existing_member:
        # 如果是已删除的成员，重新激活
        existing_member.isDelete = False
        existing_member.role = 'member'
        existing_member.joinDate = datetime.utcnow()
        existing_member.exitReason = None
        
        db.session.commit()
        return jsonify({
            'Flag':'4000',
            'message': '重新激活用户成员身份成功',
            'data': {
                'club_id': club_show.clubID,
                'club_name': club_show.clubName,
                'user_id': user_id,
                'user_name': user.userName
            }
        }), 200

    # 创建新的成员记录
    member = ClubMember(clubID=club_id, userID=user_id)
    # 将指定用户设置为社团成员
    member.role = 'member'
    member.joinDate = datetime.utcnow()
    db.session.add(member)
    db.session.flush()  # 确保member有ID

    db.session.commit()
    return jsonify({
        'Flag':'4000',
        'message': '添加成员成功',
        'data': {
            'club_id': club_show.clubID,
            'club_name': club_show.clubName,
            'user_id': user_id,
            'user_name': user.userName
        }
    }), 200

# 批量添加成员（支持重新激活被软删除的成员）
# 权限：社团管理员或超级管理员（复用单个添加成员的权限判断）
# 前端请求：POST /api/v1/club/<club_id>/addmember/batch  body: { "user_ids": [1,2,3] }
@bp.route('/<int:club_id>/addmember/batch', methods=['POST'])
@jwt_required()
def add_member_batch(club_id):
    # 权限检查（复用单用户添加成员的权限）
    has_permission, message = check_permission(club.add_member_batch.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    # 校验协会
    club_show = Club.query.filter_by(clubID=club_id).first()
    if not club_show:
        return jsonify({'Flag': '4001', 'message': '社团不存在'}), 200

    data = request.get_json() or {}
    user_ids = data.get('user_ids')
    if not isinstance(user_ids, list):
        return jsonify({'Flag': '4003', 'message': '请求参数不完整或格式不正确，需提供user_ids数组'}), 200

    added_user_ids = []
    reactivated_user_ids = []
    skipped_already_member_ids = []
    missing_user_ids = []

    # 批量处理
    for uid in user_ids:
        user = User.query.get(uid)
        if not user:
            missing_user_ids.append(uid)
            continue

        existing_member = ClubMember.query.filter_by(userID=uid, clubID=club_id).first()
        if existing_member:
            if existing_member.isDelete:
                existing_member.isDelete = False
                existing_member.role = 'member'
                existing_member.joinDate = datetime.utcnow()
                existing_member.exitReason = None
                reactivated_user_ids.append(uid)
            else:
                skipped_already_member_ids.append(uid)
            continue

        member = ClubMember(clubID=club_id, userID=uid)
        member.role = 'member'
        member.joinDate = datetime.utcnow()
        db.session.add(member)
        added_user_ids.append(uid)

    db.session.flush()  # 确保所有member都有ID

    db.session.commit()

    return jsonify({
        'Flag': '4000',
        'message': '批量添加成员处理完成',
        'data': {
            'club_id': club_show.clubID,
            'club_name': club_show.clubName,
            'added_user_ids': added_user_ids,
            'reactivated_user_ids': reactivated_user_ids,
            'skipped_already_member_ids': skipped_already_member_ids,
            'missing_user_ids': missing_user_ids,
            'summary': {
                'added': len(added_user_ids),
                'reactivated': len(reactivated_user_ids),
                'skipped': len(skipped_already_member_ids),
                'missing': len(missing_user_ids)
            }
        }
    }), 200

# 删除指定社团成员（软删除）
# 权限：社团管理员或超级管理员
# 返回参数：
# 4000: 调用成功
# 4001: 社团不存在
# 4002：该用户无权限调用该API
# 4003: 成员不存在
# 4004: 成员已被删除
@bp.route('/<int:club_id>/deletemember/<int:user_id>', methods=['GET'])
@jwt_required()
def delete_member(club_id, user_id):
    # 权限检查
    has_permission, message = check_permission(club.delete_member.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200
    
    # 先获取社团信息（只查询未删除的协会）
    club_show = Club.query.filter_by(clubID=club_id).first()
    
    # 检查成员是否存在（通过user_id和club_id查询）
    member = ClubMember.query.filter_by(userID=user_id, clubID=club_id).first()
    if not member:
        return jsonify({'Flag': '4003', 'message': '成员不存在'}), 200
    if member.isDelete:
        return jsonify({'Flag': '4004', 'message': '成员已被删除'}), 200
    
    # 获取被删除用户的信息
    deleted_user = User.query.get(user_id)
    
    # 软删除成员记录
    member.isDelete = True
    db.session.commit()
    
    return jsonify({
        'Flag':'4000',
        'message': '删除成员成功',
        'data': {
            'club_id': club_show.clubID,
            'club_name': club_show.clubName,
            'user_id': user_id,
            'user_name': deleted_user.userName
        }
    }), 200

# 更新社团成员信息
# 因为用户可以加入多个社团，所以按照member_id来更新
# 返回参数：
# 4000: 调用成功
# 4001: 申请不存在
# 4002：该用户无权限调用该API
# 4003: 角色参数不正确
@bp.route('/member/<int:member_id>/update', methods=['PUT'])
@jwt_required()
def update_member(member_id):
    # 权限检查
    has_permission, message = check_permission(club.update_member.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    if TEST_MODE:
        current_user_id = get_jwt_identity()
        cur_user = User.query.filter_by(userID=current_user_id).first()
    else:
        user_weid = get_jwt_identity()
        cur_user = User.query.filter_by(wecomUserID=user_weid).first()
    
    # 先获取成员信息（只查询未删除的成员）
    member = ClubMember.query.filter_by(memberID=member_id, isDelete=False).first()
    if not member:
        return jsonify({'Flag':'4001','message': '该用户不存在或已被删除'}), 200
    
    # 获取社团信息（只查询未删除的协会）
    club_show = Club.query.filter_by(clubID=member.clubID, isDelete=False).first()
    if not club_show:
        return jsonify({'Flag':'4001','message': '协会不存在或已被删除'}), 200

    data = request.get_json()

    if 'join_date' in data:
        member.joinDate = datetime.fromisoformat(data['join_date'])
    if 'membership_fee' in data:
        member.membershipFee = data['membership_fee']
        member.paymentDate = datetime.utcnow()

    db.session.commit()
    return jsonify({'Flag':'4000','message': 'Member information updated'})

# 撤销社团（软删除）
# 权限要求：超级管理员
# 返回参数：
# 4000: 调用成功
# 4001: 协会不存在
# 4002：该用户无权限调用该API
# 4003: 协会已被删除
@bp.route('/<int:club_id>/revoke', methods=['GET'])
@jwt_required()
def revoke_club(club_id):
    # 权限检查
    has_permission, message = check_permission(club.revoke_club.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200
    
    # 查询协会
    club_show = Club.query.filter_by(clubID=club_id).first()
    
    # 软删除协会
    club_show.isDelete = True
    club_show.updateDate = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'Flag':'4000',
        'message': '协会撤销成功',
        'data': {
            'club_id': club_show.clubID,
            'club_name': club_show.clubName,
            'revoke_time': club_show.updateDate.isoformat()
        }
    })

# 删除协会（级联软删除）
# 权限要求：会长或超级管理员
# 功能：软删除协会，并级联处理成员、活动、申请
# 返回参数：
# 4000: 调用成功
# 4001: 协会不存在
# 4002：该用户无权限调用该API
@bp.route('/<int:club_id>/delete', methods=['GET'])
@jwt_required()
def delete_club(club_id):
    # 权限检查
    has_permission, message = check_permission(club.delete_club.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    try:
        # 查询协会
        club_to_delete = Club.query.filter_by(clubID=club_id).first()
        if not club_to_delete:
            return jsonify({'Flag': '4001', 'message': '协会不存在'}), 200

        # 1. 设置协会为已删除
        club_to_delete.isDelete = True
        club_to_delete.updateDate = datetime.utcnow()

        # 2. 不再设置成员关系为已删除
        # 成员记录保持原状，通过 Club.isDelete 来判断协会是否被删除
        # ClubMember.isDelete 只用于标识成员是否被主动移除

        # 3. 取消所有未结束的活动（actual_endTime为None）
        Event.query.filter_by(clubID=club_id, actual_endTime=None).update({'is_cancelled': True})

        # 4. 拒绝所有待审批的申请（processedDate为None）
        now = datetime.utcnow()
        pending_applications = ClubApplication.query.filter_by(
            clubID=club_id, 
            processedDate=None
        ).all()
        
        for app in pending_applications:
            app.approved = False
            app.processedDate = now

        # 提交事务
        db.session.commit()

        return jsonify({
            'Flag':'4000',
            'message': '删除协会成功',
            'data':{
                'club_id': club_to_delete.clubID,
                'club_name': club_to_delete.clubName,
                'delete_time': club_to_delete.updateDate.isoformat()
            }
        })

    except Exception as e:
        # 回滚事务
        db.session.rollback()
        return jsonify({'Flag': '4001', 'message': f'删除协会失败: {str(e)}'}), 200


# 获取某社团成员列表（按角色排序）
# 返回参数：
# 4000: 调用成功
# 4001: 社团不存在
# 4002: 用户无权限
@bp.route('/<int:club_id>/members', methods=['GET'])
@jwt_required()
def get_club_members(club_id):
    """
    获取社团成员列表，用于会长管理
    排序规则：会长、副会长、理事、普通会员，当前用户排在所在角色的最前面
    只有会长或超级管理员可以访问
    只显示未删除的成员
    """
    # 权限检查
    has_permission, message = check_permission(club.get_club_members.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    # 获取当前用户
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 检查社团是否存在
    club_show = Club.query.filter_by(clubID=club_id).first()
    if not club_show:
        return jsonify({'Flag':'4001','message': '社团不存在'}), 200
    
    # 如果协会已删除，只允许管理员或曾经的成员查看成员列表
    if club_show.isDelete:
        # 检查当前用户是否是该协会的管理员或成员
        user_member_record = ClubMember.query.filter_by(clubID=club_id, userID=cur_user.userID, isDelete=False).first()
        if not user_member_record and not cur_user.isSuperUser:
            return jsonify({'Flag':'4001','message': '社团已被删除'}), 200

    # 获取所有未删除的成员（无论协会是否被删除）
    # ClubMember.isDelete 只标识成员是否被主动移除，与协会删除状态无关
    all_members = ClubMember.query.filter_by(clubID=club_id, isDelete=False).all()
    
    # 统计每位成员在该协会开展的活动参与次数（基于 EventJoin 与 Event 的关联）
    participation_counts_query = db.session.query(
        EventJoin.userID,
        func.count(EventJoin.joinID)
    ).join(
        Event, Event.eventID == EventJoin.eventID
    ).filter(
        Event.clubID == club_id
    ).group_by(
        EventJoin.userID
    ).all()
    participation_counts = {user_id: count for user_id, count in participation_counts_query}
    
    # 角色排序优先级
    role_priority = {
        'president': 1,      # 会长
        'vice_president': 2, # 副会长
        'director': 3,       # 理事
        'member': 4          # 普通会员
    }
    
    # 角色显示名称
    role_display_names = {
        'president': '会长',
        'vice_president': '副会长', 
        'director': '理事',
        'member': '普通会员'
    }
    
    # 按角色分组
    members_by_role = {
        'president': [],
        'vice_president': [],
        'director': [],
        'member': []
    }
    
    for member in all_members:
        member_info = {
            'member_id': member.memberID,
            'user_id': member.userID,
            'user_name': member.user.userName,
            'wecom_user_id': member.user.wecomUserID,
            'phone': member.user.phone,
            'department': member.user.department,
            'position': member.user.position,
            'role': member.role,
            'role_display': role_display_names.get(member.role, '普通会员'),
            'avatar': member.user.avatar.fileUrl if member.user.avatar else None,
            'join_date': member.joinDate.isoformat() if member.joinDate else None,
            'is_current_user': member.userID == cur_user.userID,
            'participation_count': participation_counts.get(member.userID, 0),
        }
        
        # 将成员分配到对应角色组
        role = member.role if member.role in members_by_role else 'member'
        members_by_role[role].append(member_info)
    
    # 按角色排序并将当前用户排在所在角色的最前面
    sorted_members = []
    
    for role in ['president', 'vice_president', 'director', 'member']:
        role_members = members_by_role[role]
        if not role_members:
            continue
            
        # 分离当前用户和其他用户
        current_user_member = None
        other_members = []
        
        for member in role_members:
            if member['is_current_user']:
                current_user_member = member
            else:
                other_members.append(member)
        
        # 其他成员按加入时间排序（早加入的在前）
        other_members.sort(key=lambda x: x['join_date'] or '')
        
        # 当前用户排在最前面，然后是其他成员
        if current_user_member:
            sorted_members.append(current_user_member)
        sorted_members.extend(other_members)

    return jsonify({
        'Flag': '4000',
        'message': '调用成功',
        'data': {
            'members': sorted_members,
        }
    })

# 切换会员角色
# 返回参数：
# 4000: 操作成功
# 4001: 社团不存在或成员不存在
# 4002: 用户无权限
# 4003: 操作不允许（目标已经是相同角色）
# 4004: 无效的角色参数
@bp.route('/<int:member_id>/change_role/<string:role>', methods=['GET'])
@jwt_required()
def change_role(member_id, role):
    """
    提拔会员为不同角色功能
    只有现任会长或超级管理员可以提拔其他成员
    - president: 提拔为会长，原会长自动降为普通会员
    - vice_president: 提拔为副会长，会长保持不变
    - director: 提拔为理事，会长保持不变
    只能操作未删除的成员
    """
    # 权限检查
    has_permission, message = check_permission(club.change_role.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    # 检查目标成员是否存在
    target_member = ClubMember.query.filter_by(
        memberID=member_id, 
    ).first()
    if not target_member or target_member.isDelete:
        return jsonify({'Flag': '4001', 'message': '社团不存在或成员不存在'}), 200

    # 校验角色参数
    valid_roles = {'president', 'vice_president', 'director', 'member'}
    if role not in valid_roles:
        return jsonify({'Flag': '4004', 'message': '无效的角色参数'}), 200

    # 获取社团信息
    club_show = Club.query.filter_by(clubID=target_member.clubID).first()

    
    # 如果是提拔为会长(president)，需要将现任会长降为普通会员
    if role == 'president' and club_show.president and club_show.president.memberID != target_member.memberID:
        club_show.president.role = 'member'

 
    target_member.role = role
    
    db.session.commit()


    response_data = {
        'promoted_member': {
            'user_id': target_member.userID,
            'user_name': target_member.user.userName,
            'new_role': role,
        },
        'club_name': club_show.clubName,
        'club_id': club_show.clubID
    }

    # 如果有会长被降级，添加到响应数据中
    if role == 'president':
        message = f"成功提拔{target_member.user.userName}为会长，原会长已降为普通会员"
    else:
        message = f"成功提拔{target_member.user.userName}为{role}"

    return jsonify({
        'Flag': '4000',
        'message': message,
        'data': response_data
    })

# 创建协会
# 返回参数：
# 4000: 调用成功
# 4001: 协会名称已存在
# 4002: 用户无权限调用该API
# 4003: 请求参数不完整、不正确
# 4004: 指定的会长用户不存在
@bp.route('/create', methods=['PUT'])
@jwt_required()
def create_club():
    # 权限检查
    has_permission, message = check_permission(club.create_club.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    data = request.get_json()
    club_name = data.get('club_name')
    description = data.get('description')
    charter = data.get('charter')
    cover_id = data.get('cover_id', '')  # 协会展示图片，参考event的process_images
    president_id = data.get('president_id')  # 前端指定的协会会长ID
    # 创建协会（clubID自动自增）
    new_club = Club(
        clubName=club_name,
        description=description or '',
        charter=charter or '',
        coverID=cover_id
    )

    db.session.add(new_club)
    db.session.flush()  # 获取自动生成的clubID
    db.session.commit()
    # 将指定的用户设为协会会长
    club_member = ClubMember(
        clubID=new_club.clubID,
        userID=president_id,  # 使用前端指定的会长ID
        role='president',  # 修改为president角色
        joinDate=datetime.utcnow()
    )
    db.session.add(club_member)
    db.session.flush()
    db.session.commit()
    
    # 刷新会话以获取最新的关系数据
    db.session.refresh(new_club)
    # removed debug print
    return jsonify({
        'Flag':'4000',
        'message': '创建协会成功',
        'data': {
            'club_id': new_club.clubID,
            'club_name': new_club.clubName,
            'description': new_club.description,
            'charter': new_club.charter,
            'cover_url': new_club.cover.fileUrl if new_club.cover else None,
            'creator_id': cur_user.userID,
            'creator_name': cur_user.userName,
            'president_id': president_id,
            'president_name': new_club.president.user.userName,
            'create_date': new_club.createDate.isoformat(),
            'member_count': 1  # 指定的会长自动成为第一个成员
        }
    })

# 编辑社团介绍
@bp.route('/<int:club_id>/description/upload', methods=['POST'])
@jwt_required()
def edit_club_description(club_id):
    # 权限检查
    has_permission, message = check_permission(club.edit_club_description.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 检查协会是否存在且未删除
    club_show = Club.query.filter_by(clubID=club_id).first()

    data = request.get_json()
    description = data.get('description')

    club_show.description = description
    club_show.updateDate = datetime.utcnow()
    db.session.commit()
    return jsonify({'Flag':'4000','message': 'Description updated successfully'}), 200


@bp.route('/<int:club_id>/update_cover', methods=['POST'])
@jwt_required(optional=True)
def update_cover(club_id):
    # 权限检查
    has_permission, message = check_permission(club.update_cover.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    data = request.get_json()
    file_id = data.get('file_id')

    club_update = Club.query.filter_by(clubID=club_id).first()
    old_file_id = club_update.coverID

    # 删除旧封面文件
    if old_file_id:
        delete_file_inside(old_file_id)

    # 更新封面
    club_update.coverID = file_id

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



# 查看协会章程
@bp.route('/<int:club_id>/charter', methods=['GET'])
@jwt_required()
def get_club_charter(club_id):
    # 权限检查
    has_permission, message = check_permission(club.get_club_charter.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    # 只查询未删除的协会
    club_show = Club.query.filter_by(clubID=club_id).first()
    
    return jsonify({
        'Flag':'4000',
        'message': '调用成功',
        'data': {
            'charter': club_show.charter}
        })

# 上传协会章程，文件转换成base64编码
# 需要协会id，并且验证协会章程hash与前端的hash是否一致
@bp.route('/<int:club_id>/charter/upload', methods=['POST'])
@jwt_required()
def upload_club_charter(club_id):
    # 权限检查
    has_permission, message = check_permission(club.upload_club_charter.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 检查协会是否存在且未删除
    club_show = Club.query.filter_by(clubID=club_id).first()

    data = request.get_json()
    charter = data.get('charter') #（文件名:内容base64编码）
    charter_hash = data.get('charter_hash')

    # 计算协会章程的文件大小
    file_size = os.path.getsize(charter)
    if file_size > 1024 * 1024 * 10:  # 限制文件大小为10MB
        return jsonify({'Flag':'4000','message': 'File size exceeds the limit'}), 200

    # 计算协会章程的哈希值
    clac_charter_hash = hashlib.sha256(charter.encode('utf-8')).hexdigest()
    if clac_charter_hash != charter_hash:
        return jsonify({'Flag':'4000','message': 'Charter hash does not match'}), 200

    club_show.charter = charter
    club_show.updateDate = datetime.utcnow()
    db.session.commit()

    return jsonify({'Flag':'4000','message': 'Charter uploaded successfully', 'Hash': clac_charter_hash}), 200

# ==============================================20250308新增功能==============================================
# 获取用户已加入的社团
@bp.route('/user_joined/list', methods=['GET'])
@jwt_required()
def get_user_joined_club():
    # 权限检查
    has_permission, message = check_permission(club.get_user_joined_club.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    # 获取分页参数
    mode = request.args.get('mode', 'page')
    page = request.args.get('page', default=1, type=int)
    

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    clubmembers = [m for m in cur_user.clubmembers]
    
    # 利用backref关系获取管理的社团（只包括未删除的协会）
    clubs = [
        m.club_as_member for m in clubmembers 
        if m.club_as_member is not None
    ]

    # 分页处理
    if mode == 'page':
        PAGE_SIZE = 5
        total_records = len(clubs)
        total_pages = (total_records + PAGE_SIZE - 1) // PAGE_SIZE
        
        paged_clubs = clubs[(page-1)*PAGE_SIZE : page*PAGE_SIZE]

        # 构建返回数据
        records = []
        for club_show in paged_clubs:
            # 判断当前用户是否管理该协会
            # 检查用户是否是该协会的会长或管理员
            cur_user_managed = False
            for m in clubmembers:
                if m.clubID == club_show.clubID and m.role in ['president', 'admin']:
                    cur_user_managed = True
                    break
            
            record = {
                'club_id': club_show.clubID,
                'club_name': club_show.clubName,
                'description': club_show.description,
                'president_username': club_show.president.user.userName if club_show.president and not club_show.president.isDelete else '暂无',
                'president_avatar': club_show.president.user.avatar.fileUrl if club_show.president and not club_show.president.isDelete and club_show.president.user.avatar else None,
                'club_imgs': (
                    ([club_show.cover.fileUrl] if club_show.cover else []) +
                    ([file.fileUrl for file in club_show.moments[-1].image_files] if club_show.moments and club_show.moments[-1].image_files else [])
                ),
                'cover_url': club_show.cover.fileUrl if club_show.cover else None,
                'is_deleted': club_show.isDelete,
                # 添加用户关系字段
                'cur_user_is_member': True,  # 这个接口返回的都是用户已加入的协会
                'cur_user_managed': cur_user_managed
            }
            
            print(f"[DEBUG] Club {club_show.clubName}: cur_user_is_member={record['cur_user_is_member']}, cur_user_managed={record['cur_user_managed']}")
            records.append(record)

        return jsonify({
            'Flag':'4000',
            'message': '调用成功', 
            'data': {
                'records': records,
                'pagination': {
                    'total_pages': total_pages,
                    'current_page': page,
                    'page_size': PAGE_SIZE,
                    'total_records': total_records
                }
            }
        })
    else:  #一次返回全部的
        return jsonify({
            'Flag':'4001',
            'message': '参数错误，请使用page模式'
        })

# 查看用户发起的入团申请
@bp.route('/application/user_applicated/list', methods=['GET'])
@jwt_required()
def get_user_applicated_application():
    # 权限检查
    has_permission, message = check_permission(club.get_user_applicated_application.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()
    clubApplications = cur_user.appliced_clubApplications

    # 按 processedDate 为 null 的排在前面
    sorted_applications = sorted(
        clubApplications,
        key=lambda app: (app.processedDate is not None, app.processedDate)
    )

    return jsonify({
        'Flag':'4000',
        'message': '调用成功',
        'data': [{
            'approved': clubApplication.approved,
            'processedDate': clubApplication.processedDate,
            'club_name': clubApplication.club.clubName,
            'processed_user': clubApplication.processed_user.userName if clubApplication.processed_user else None,
            'applicatedDate': clubApplication.applicatedDate,
            'applicationID': clubApplication.applicationID
        } for clubApplication in sorted_applications]
    })
		
# 获取用户管理的社团
@bp.route('/user_managed/list', methods=['GET'])
@jwt_required()
def get_user_managed_club():
    # 权限检查
    has_permission, message = check_permission(club.get_user_managed_club.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    
    # 只获取未删除的协会，且用户是管理员的协会
    clubmembers = [m for m in cur_user.clubmembers if not m.isDelete]
    print(clubmembers)
    # 利用backref关系获取管理的社团（只包括未删除的协会）
    clubs = [
        m.club_as_manager for m in clubmembers 
        if m.club_as_manager is not None and not m.club_as_manager.isDelete
    ]
       
    return jsonify({
        'Flag':'4000',
        'message': '调用成功', 
        'data': [{
            'club_id': club_show.clubID,
            'club_name': club_show.clubName,
            'description': club_show.description,
            'is_deleted': club_show.isDelete,
        }for club_show in clubs]})

# 新增热度协会接口 - 智能推荐排序
@bp.route('/heat/list', methods=['GET'])
@jwt_required()
def get_hot_clubs():
    # 权限检查
    has_permission, message = check_permission(club.get_hot_clubs.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()
    
    # 获取用户已加入的协会ID和管理员协会ID（只包括未删除的成员记录）
    joined_club_ids = {m.clubID for m in cur_user.clubmembers if not m.isDelete}
    admin_club_ids = {m.clubID for m in cur_user.clubmembers if m.role in ['president', 'vice_president', 'director'] and not m.isDelete}
    
    # 获取所有未删除的协会
    all_clubs = Club.query.filter_by(isDelete=False).all()
    
    # 计算时间范围
    one_week_ago = datetime.utcnow() - timedelta(days=7)
    one_month_ago = datetime.utcnow() - timedelta(days=30)
    
    # 查询最近申请数据
    recent_applications = ClubApplication.query.join(Club).filter(
        ClubApplication.applicatedDate >= one_week_ago,
        Club.isDelete == False
    ).all()
    
    # 统计各协会申请量
    application_counts = {}
    for app in recent_applications:
        club_id = app.clubID
        application_counts[club_id] = application_counts.get(club_id, 0) + 1
    
    # 统计各协会最近活动数量
    recent_events = Event.query.join(Club).filter(
        Event.createDate >= one_month_ago,
        Event.is_cancelled == False,
        Club.isDelete == False
    ).all()
    
    event_counts = {}
    for event in recent_events:
        club_id = event.clubID
        event_counts[club_id] = event_counts.get(club_id, 0) + 1
    
    # 智能排序算法
    def calculate_club_score(club_item):
        club_id = club_item.clubID
        score = 0.0
        
        # 1. 最近申请热度 (30%)
        app_count = application_counts.get(club_id, 0)
        if app_count > 0:
            score += min(app_count / 10.0, 1.0) * 30
        
        # 2. 成员活跃度 (25%) - 基于成员数量和最近加入情况
        active_members = [m for m in club_item.members if not m.isDelete]
        member_score = min(len(active_members) / 50.0, 1.0) * 15  # 成员数量
        
        # 最近加入的成员数量
        recent_joins = [m for m in active_members if m.joinDate and m.joinDate >= one_month_ago]
        join_score = min(len(recent_joins) / 10.0, 1.0) * 10
        score += member_score + join_score
        
        # 3. 活动频率 (25%)
        event_count = event_counts.get(club_id, 0)
        if event_count > 0:
            score += min(event_count / 5.0, 1.0) * 25
        
        # 4. 用户相关性 (20%)
        user_relevance = 0
        if club_id in joined_club_ids:
            user_relevance = 0  # 已加入的协会不需要推荐
        elif any(app.clubID == club_id and app.processedDate is None for app in cur_user.appliced_clubApplications):
            user_relevance = 15  # 有待处理申请的协会优先
        else:
            # 基于用户部门匹配度
            if hasattr(cur_user, 'department') and cur_user.department:
                # 检查协会成员中是否有同部门的人
                same_dept_members = [m for m in active_members 
                                   if hasattr(m.user, 'department') and m.user.department == cur_user.department]
                if same_dept_members:
                    user_relevance = 10
            user_relevance += 5  # 基础推荐分
        score += user_relevance
        
        return score
    
    # 计算分数并排序
    club_scores = [(club_item, calculate_club_score(club_item)) for club_item in all_clubs]
    sorted_clubs = sorted(club_scores, key=lambda x: x[1], reverse=True)[:8]  # 取前8个候选
    
    # 进一步筛选，确保多样性
    final_clubs = []
    seen_presidents = set()
    
    for club_item, score in sorted_clubs:
        # 避免同一会长的多个协会
        president_id = club_item.president.userID if club_item.president and not club_item.president.isDelete else None
        if president_id and president_id in seen_presidents:
            continue
        
        final_clubs.append(club_item)
        if president_id:
            seen_presidents.add(president_id)
        
        if len(final_clubs) >= 5:
            break
    
    return jsonify({
        'Flag': '4000',
        'message': '获取成功',
        'data': [{
            'club_id': club_show.clubID,
            'club_name': club_show.clubName,
            'cover_url': club_show.cover.fileUrl if club_show.cover else None,
            'cur_user_is_member': club_show.clubID in joined_club_ids,
            'cur_user_managed': any(manager.userID == cur_user.userID for manager in club_show.managers),
            'description': club_show.description,
            'president_info': {
                'name': club_show.president.user.userName if club_show.president and not club_show.president.isDelete else '暂无',
                'avatar': club_show.president.user.avatar.fileUrl if club_show.president and not club_show.president.isDelete and club_show.president.user.avatar else None
            } if club_show.president and not club_show.president.isDelete else None,
            'member_count': len([m for m in club_show.members if not m.isDelete]),
            'recent_members': [
                {
                    'user_name': m.user.userName,
                    'avatar': m.user.avatar.fileUrl if m.user.avatar else None
                } for m in sorted(
                    [m for m in club_show.members if not m.isDelete],
                    key=lambda x: x.joinDate or datetime.min,
                    reverse=True
                )[:9]
            ],
            'recent_events': [
                {
                    'title': e.title,
                    'event_imgs': (
                        [file.fileUrl for moment in (e.moments[-2:] or []) for file in (moment.image_files or [])] if e.moments else []
                    ),                   
                    'description': e.message,
                    'start_time': e.actual_startTime.isoformat() if e.actual_startTime else e.pre_startTime.isoformat()
                } for e in sorted(
                    [e for e in club_show.events if not e.is_cancelled],  # 只包括未取消的活动
                    key=lambda x: x.actual_startTime if x.actual_startTime else x.pre_startTime,
                    reverse=True
                )[:8]
            ]
        } for club_show in final_clubs]
    })


# ==============================================硬删除管理接口==============================================

# 永久删除协会（物理删除）
# 权限要求：超级管理员
# 功能：删除协会及其所有关联数据（成员、申请、活动、费用等）
# 返回参数：
# 4000: 调用成功
# 4001: 协会不存在
# 4002：该用户无权限调用该API
@bp.route('/<int:club_id>/permanent_delete', methods=['DELETE'])
@jwt_required()
def permanent_delete_club(club_id):
    # 权限检查
    has_permission, message = check_permission(club.permanent_delete_club.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()
    
    # 查询协会
    club_show = Club.query.filter_by(clubID=club_id).first()
    if not club_show:
        return jsonify({'Flag':'4001','message': '协会不存在'}), 200
    
    # 导入相关模型
    from app.models.event import Event, EventJoin
    from app.models.money import ClubFee, PayGroup, PayPersonal
    
    try:
        # 1. 删除协会相关的活动参与记录
        events = Event.query.filter_by(clubID=club_id).all()
        for event in events:
            # 删除活动参与记录
            EventJoin.query.filter_by(eventID=event.eventID).delete()
            # 删除活动相关的支付记录
            PayGroup.query.filter_by(eventID=event.eventID).delete()
        
        # 2. 删除协会的活动
        Event.query.filter_by(clubID=club_id).delete()
        
        # 3. 删除协会费用相关记录
        club_fees = ClubFee.query.filter_by(clubID=club_id).all()
        for fee in club_fees:
            # 删除与该费用相关的支付记录
            PayGroup.query.filter_by(feeID=fee.feeID).delete()
        ClubFee.query.filter_by(clubID=club_id).delete()
        
        # 4. 删除协会相关的支付记录
        pay_groups = PayGroup.query.filter_by(clubID=club_id).all()
        for pay_group in pay_groups:
            # 删除个人支付记录
            PayPersonal.query.filter_by(groupID=pay_group.groupID).delete()
        PayGroup.query.filter_by(clubID=club_id).delete()
        
        # 5. 删除协会申请记录
        ClubApplication.query.filter_by(clubID=club_id).delete()
        
        # 6. 删除协会成员记录
        ClubMember.query.filter_by(clubID=club_id).delete()
        
        # 7. 最后删除协会本身
        db.session.delete(club_show)
        
        db.session.commit()
        
        return jsonify({
            'Flag':'4000',
            'message': '协会及所有关联数据永久删除成功',
            'data': {
                'club_id': club_id,
                'club_name': club_show.clubName
            }
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'Flag':'4005',
            'message': f'删除过程中发生错误: {str(e)}'
        }), 200

# 永久删除成员（物理删除）
# 权限：社团管理员或超级管理员
# 功能：删除成员及其所有关联数据（申请记录、支付记录、活动参与记录等）
# 返回参数：
# 4000: 调用成功
# 4001: 成员不存在
# 4002：该用户无权限调用该API
@bp.route('/member/<int:member_id>/permanent_delete', methods=['DELETE'])
@jwt_required()
def permanent_delete_member(member_id):
    # 权限检查
    has_permission, message = check_permission(club.permanent_delete_member.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()
    
    # 查询成员
    member = ClubMember.query.filter_by(memberID=member_id).first()
    if not member:
        return jsonify({'Flag':'4001','message': '成员不存在'}), 200
    
    # 获取协会信息
    club_show = Club.query.filter_by(clubID=member.clubID).first()
    if not club_show:
        return jsonify({'Flag':'4001','message': '协会不存在'}), 200
    
    # 导入相关模型
    from app.models.event import Event, EventJoin
    from app.models.money import PayGroup, PayPersonal
    
    try:
        # 1. 删除该用户在该协会相关活动中的参与记录
        club_events = Event.query.filter_by(clubID=member.clubID).all()
        for event in club_events:
            EventJoin.query.filter_by(eventID=event.eventID, userID=member.userID).delete()
        
        # 2. 删除该用户与该协会相关的申请记录
        ClubApplication.query.filter_by(clubID=member.clubID, userID=member.userID).delete()
        
        # 3. 删除该用户与该协会相关的支付记录
        club_pay_groups = PayGroup.query.filter_by(clubID=member.clubID).all()
        for pay_group in club_pay_groups:
            PayPersonal.query.filter_by(groupID=pay_group.groupID, userID=member.userID).delete()
        
        # 4. 删除该用户创建的与该协会相关的支付组
        PayGroup.query.filter_by(clubID=member.clubID, creatorID=member.userID).delete()
        
        # 5. 最后删除成员记录
        db.session.delete(member)
        
        db.session.commit()
        
        return jsonify({
            'Flag':'4000',
            'message': '成员及所有关联数据永久删除成功',
            'data': {
                'member_id': member_id,
                'user_id': member.userID,
                'club_id': member.clubID,
                'club_name': club_show.clubName
            }
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'Flag':'4005',
            'message': f'删除过程中发生错误: {str(e)}'
        }), 200
