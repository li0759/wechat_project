from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models.moment import Moment
from app.models.user import User
from app.models.file import File
from app.models import Event, Club
from app.permission import check_permission, moment
from datetime import datetime
import json
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.ext.mutable import MutableList
from sqlalchemy import and_

bp = Blueprint('moment', __name__, url_prefix='/api/v1/moment')

@bp.route('/create', methods=['POST'])
@jwt_required()
def create_moment():
    """创建动态"""
    # 权限检查
    has_permission, message = check_permission(moment.create_moment.permission_judge)
    if not has_permission:
        return jsonify({'Flag': 4002, 'message': message}), 200
    
    try:
        data = request.get_json()
        current_user = User.query.filter_by(userID=get_jwt_identity()).first()
        
        if not current_user:
            return jsonify({'Flag': 4001, 'message': '用户不存在'}), 401
        
        # 获取请求数据
        description = data.get('description', '')
        image_ids = data.get('image_ids', [])
        ref_event_id = data.get('ref_event_id')
        ref_club_id = data.get('ref_club_id')
        
        # 创建动态
        new_moment = Moment(
            description=description,
            imageIDs=image_ids,
            creatorID=current_user.userID,
            ref_event_ID=ref_event_id,
            ref_club_ID=ref_club_id
        )
        
        db.session.add(new_moment)
        db.session.commit()

        return jsonify({
            'Flag': 2000,
            'message': '动态创建成功',
            'data': new_moment.to_dict()
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'Flag': 5000, 'message': f'创建动态失败: {str(e)}'}), 500

@bp.route('/list/<string:show>', methods=['GET'])
@jwt_required()
def get_moment_list(show):
    """获取动态列表"""
    # 权限检查
    has_permission, message = check_permission(moment.get_moment_list.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    mode = request.args.get('mode', 'page')
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    page = request.args.get('page', default=1, type=int)
    PAGE_SIZE = 10

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 1. 构建基础查询
    query = Moment.query

    # 2. 时间过滤
    if mode == 'month' and year and month:
        start_date = datetime(year, month, 1)
        end_date = datetime(year, month+1, 1) if month < 12 else datetime(year+1, 1, 1)
        query = query.filter(
            and_(
                Moment.createDate >= start_date,
                Moment.createDate < end_date
            )
        )

    # 3. 排序 - 按创建时间倒序
    query = query.order_by(Moment.createDate.desc())

    # 4. 执行查询
    if mode == 'page':
        pagination = query.paginate(page=page, per_page=PAGE_SIZE, error_out=False)
        moments = pagination.items
        total_pages = pagination.pages
        total_records = pagination.total
    else:
        moments = query.all()
        total_pages = 1
        total_records = len(moments)

    # 5. 返回
    return jsonify({
        'Flag': '4000',
        'message': '调用成功',
        'data': {
            'records': [{
                'moment_id': moment.momentID,
                'description': moment.description,
                'creator_id': moment.creatorID,
                'creator_name': moment.creator.userName,
                'creator_avatar': moment.creator.avatar.fileUrl if moment.creator.avatar else None,
                'create_date': moment.createDate.isoformat(),
                'image_urls': [file.fileUrl for file in (moment.image_files or [])],
                'like_count': len(moment.likeIDs) if moment.likeIDs else 0,
                'is_liked': moment.is_liked_by_user(cur_user.userID),
                'is_my_moment': moment.creatorID == cur_user.userID,
                'ref_event_id': moment.ref_event_ID,
                'ref_club_id': moment.ref_club_ID,
                'ref_event_title': moment.ref_event.title if moment.ref_event else None,
                'ref_club_name': moment.ref_club.clubName if moment.ref_club else None
            } for moment in moments],
            'pagination': {
                'total_pages': total_pages,
                'current_page': page,
                'page_size': PAGE_SIZE,
                'total_records': total_records
            }
        }
    })

@bp.route('/<int:moment_id>', methods=['GET'])
@jwt_required()
def get_moment_detail(moment_id):
    """获取动态详情"""
    # 权限检查
    has_permission, message = check_permission(moment.get_moment_detail.permission_judge)
    if not has_permission:
        return jsonify({'flag': 4002, 'message': message}), 200
    
    try:
        current_user = User.query.filter_by(userID=get_jwt_identity()).first()
        moment_show = Moment.query.get(moment_id)
        
        if not moment_show:
            return jsonify({'flag': 4000, 'message': '动态不存在'}), 404
        
        moment_dict = moment_show.to_dict()
        moment_dict['liked_users'] = moment_show.get_liked_users()
        moment_dict['is_my_moment'] = moment_show.creatorID == current_user.userID
        moment_dict['is_liked'] = moment_show.is_liked_by_user(current_user.userID)
        
        return jsonify({
            'Flag': 4000,
            'message': '获取动态详情成功',
            'data': moment_dict
        }), 200
        
    except Exception as e:
        return jsonify({'Flag': 5000, 'message': f'获取动态详情失败: {str(e)}'}), 500

@bp.route('/<int:moment_id>/like', methods=['GET'])
@jwt_required()
def like_moment(moment_id):
    """点赞动态"""
    # 权限检查
    has_permission, message = check_permission(moment.like_moment.permission_judge)
    if not has_permission:
        return jsonify({'Flag': 4002, 'message': message}), 200
    

    current_user = User.query.filter_by(userID=get_jwt_identity()).first()
    moment_show = Moment.query.get(moment_id)
    
    if not moment_show:
        return jsonify({'Flag': 4000, 'message': '动态不存在'}), 404
    
    if moment_show.likeIDs:
        moment_show.likeIDs.append(current_user.userID)
    else:
        moment_show.likeIDs = [current_user.userID]
    
    # 添加这两行关键修改
    flag_modified(moment_show, "likeIDs")
    db.session.commit()
    
    return jsonify({
        'Flag': 4000,
        'message': '点赞成功',
        'data': {
            'moment_id': moment_id,
            'like_count': len(moment_show.likeIDs) if moment_show.likeIDs else 0
        }
    }), 200


@bp.route('/<int:moment_id>/unlike', methods=['GET'])
@jwt_required()
def unlike_moment(moment_id):
    """取消点赞"""
    # 权限检查
    has_permission, message = check_permission(moment.unlike_moment.permission_judge)
    if not has_permission:
        return jsonify({'Flag': 4002, 'message': message}), 200
    

    current_user = User.query.filter_by(userID=get_jwt_identity()).first()
    moment_show = Moment.query.get(moment_id)
    
    if not moment_show:
        return jsonify({'Flag': 4000, 'message': '动态不存在'}), 404
    print(current_user.userID)
    print(moment_show.likeIDs)

    moment_show.likeIDs.remove(current_user.userID)
    flag_modified(moment_show, "likeIDs")  # 添加这行
    db.session.commit()

    
    return jsonify({
        'Flag': 4000,
        'message': '取消点赞成功',
        'data': {
            'moment_id': moment_id,
            'like_count': len(moment_show.likeIDs) if moment_show.likeIDs else 0
        }
    }), 200

@bp.route('/<int:moment_id>', methods=['DELETE'])
@jwt_required()
def delete_moment(moment_id):
    """删除动态"""
    # 权限检查
    has_permission, message = check_permission(moment.delete_moment.permission_judge)
    if not has_permission:
        return jsonify({'Flag': 4002, 'message': message}), 200
    

    moment_show = Moment.query.get(moment_id)

    
    db.session.delete(moment_show)
    db.session.commit()
    
    return jsonify({
        'Flag': 2000,
        'message': '动态删除成功',
        'data': {'moment_id': moment_id}
    }), 200


@bp.route('/user/<int:user_id>', methods=['GET'])
@jwt_required()
def get_user_moments(user_id):
    """获取指定用户的动态列表"""
    # 权限检查
    has_permission, message = check_permission(moment.get_user_moments.permission_judge)
    if not has_permission:
        return jsonify({'Flag': 4002, 'message': message}), 200
    
    try:
        current_user = User.query.filter_by(userID=get_jwt_identity()).first()
        
        # 检查用户是否存在
        user = User.query.get(user_id)
        if not user:
            return jsonify({'Flag': 4000, 'message': '用户不存在'}), 404
        
        # 获取查询参数
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        
        # 查询该用户的动态
        query = Moment.query.filter(Moment.creatorID == user_id)
        query = query.order_by(Moment.createDate.desc())
        
        # 分页
        pagination = query.paginate(
            page=page, 
            per_page=per_page, 
            error_out=False
        )
        
        moments = pagination.items
        
        # 转换为字典格式
        moment_list = []
        for moment_show in moments:
            moment_dict = moment_show.to_dict()
            moment_dict['liked_users'] = moment_show.get_liked_users()
            moment_dict['is_liked'] = moment_show.is_liked_by_user(current_user.userID)
            moment_list.append(moment_dict)
        
        return jsonify({
            'Flag': 4000,
            'message': '获取用户动态列表成功',
            'data': {
                'moments': moment_list,
                'total': pagination.total,
                'pages': pagination.pages,
                'current_page': page,
                'per_page': per_page,
                'user_info': {
                    'user_id': user.userID,
                    'username': user.userName,
                    'avatar': user.avatar
                }
            }
        }), 200
        
    except Exception as e:
        return jsonify({'flag': 5000, 'message': f'获取用户动态列表失败: {str(e)}'}), 500

@bp.route('/event/<int:event_id>', methods=['GET'])
@jwt_required()
def get_event_moments(event_id):
    """获取活动相关动态列表（新增分页和按月筛选）"""
    has_permission, message = check_permission(moment.get_event_moments.permission_judge)
    if not has_permission:
        return jsonify({'Flag': 4002, 'message': message}), 200
    
    try:
        current_user = User.query.filter_by(userID=get_jwt_identity()).first()
        event = Event.query.get(event_id)
        if not event:
            return jsonify({'Flag': 4000, 'message': '活动不存在'}), 404

        # 新增参数处理
        mode = request.args.get('mode', 'page')
        year = request.args.get('year', type=int)
        month = request.args.get('month', type=int)
        page = request.args.get('page', default=1, type=int)
        PAGE_SIZE = 5 

        # 构建基础查询
        query = Moment.query.filter(Moment.ref_event_ID == event_id)

        # 新增时间过滤
        if mode == 'month' and year and month:
            start_date = datetime(year, month, 1)
            end_date = datetime(year, month+1, 1) if month < 12 else datetime(year+1, 1, 1)
            query = query.filter(and_(
                Moment.createDate >= start_date,
                Moment.createDate < end_date
            ))

        # 排序保持一致
        query = query.order_by(Moment.createDate.desc())

        # 统一分页逻辑
        if mode == 'page':
            pagination = query.paginate(page=page, per_page=PAGE_SIZE, error_out=False)
            moments = pagination.items
            
            # 转换为字典格式
            moment_list = []
            for moment_show in moments:
                moment_dict = moment_show.to_dict()
                moment_dict['liked_users'] = moment_show.get_liked_users()
                moment_dict['is_liked'] = moment_show.is_liked_by_user(current_user.userID)
                moment_dict['is_my_moment'] = moment_show.creatorID == current_user.userID
                moment_list.append(moment_dict)
            total_pages = pagination.pages
            total_records = pagination.total
        else:
            moments = query.all()
                        # 转换为字典格式
            moment_list = []
            for moment_show in moments:
                moment_dict = moment_show.to_dict()
                moment_dict['liked_users'] = moment_show.get_liked_users()
                moment_dict['is_liked'] = moment_show.is_liked_by_user(current_user.userID)
                moment_dict['is_my_moment'] = moment_show.creatorID == current_user.userID
                moment_list.append(moment_dict)
            total_pages = 1
            total_records = len(moments)

        # 保持与list接口相同的返回结构
        return jsonify({
            'Flag': 4000,
            'message': '获取活动动态列表成功',
            'data': {
                'moments': moment_list,
                'pagination': {
                    'total_pages': total_pages,
                    'current_page': page,
                    'page_size': PAGE_SIZE,
                    'total_records': total_records
                },
                'event_info': {
                    'event_id': event.eventID,
                    'event_title': event.title,
                    'event_cover_url': event.cover.fileUrl if event.cover else None
                }
            }
        }), 200

    except Exception as e:
        return jsonify({'Flag': 5000, 'message': f'获取活动动态列表失败: {str(e)}'}), 500

@bp.route('/club/<int:club_id>', methods=['GET'])
@jwt_required()
def get_club_moments(club_id):
    """获取协会动态列表（只获取协会直接发布的动态）"""
    # 权限检查
    has_permission, message = check_permission(moment.get_club_moments.permission_judge)
    if not has_permission:
        return jsonify({'Flag': 4002, 'message': message}), 200
    
    try:
        current_user = User.query.filter_by(userID=get_jwt_identity()).first()
        club = Club.query.get(club_id)
        if not club:
            return jsonify({'Flag': 4000, 'message': '协会不存在'}), 404

        # 获取查询参数
        mode = request.args.get('mode', 'page')
        year = request.args.get('year', type=int)
        month = request.args.get('month', type=int)
        page = request.args.get('page', default=1, type=int)
        PAGE_SIZE = 10

        # 构建基础查询 - 只获取协会直接发布的动态
        query = Moment.query.filter(Moment.ref_club_ID == club_id)

        # 时间过滤
        if mode == 'month' and year and month:
            start_date = datetime(year, month, 1)
            end_date = datetime(year, month+1, 1) if month < 12 else datetime(year+1, 1, 1)
            query = query.filter(
                and_(
                    Moment.createDate >= start_date,
                    Moment.createDate < end_date
                )
            )

        # 排序 - 按创建时间倒序
        query = query.order_by(Moment.createDate.desc())

        # 分页处理
        if mode == 'page':
            pagination = query.paginate(page=page, per_page=PAGE_SIZE, error_out=False)
            moments = pagination.items
            total_pages = pagination.pages
            total_records = pagination.total
        else:
            moments = query.all()
            total_pages = 1
            total_records = len(moments)

        # 转换为字典格式
        moment_list = []
        for moment_show in moments:
            moment_dict = moment_show.to_dict()
            moment_dict['liked_users'] = moment_show.get_liked_users()
            moment_dict['is_liked'] = moment_show.is_liked_by_user(current_user.userID)
            moment_dict['is_my_moment'] = moment_show.creatorID == current_user.userID
            moment_list.append(moment_dict)

        # 返回结果
        return jsonify({
            'Flag': 4000,
            'message': '获取协会动态列表成功',
            'data': {
                'moments': moment_list,
                'pagination': {
                    'total_pages': total_pages,
                    'current_page': page,
                    'page_size': PAGE_SIZE,
                    'total_records': total_records
                },
                'club_info': {
                    'club_id': club.clubID,
                    'club_name': club.clubName,
                    'club_description': club.description,
                    'club_cover_url': club.cover.fileUrl if club.cover else None
                }
            }
        }), 200

    except Exception as e:
        return jsonify({'Flag': 5000, 'message': f'获取协会动态列表失败: {str(e)}'}), 500