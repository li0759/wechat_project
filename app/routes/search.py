from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..models import User, ClubMember, Club, Event, EventJoin
from .. import db, TEST_MODE
from sqlalchemy import or_, and_
from pypinyin import lazy_pinyin, Style
from app.permission import check_permission, search

bp = Blueprint('search', __name__, url_prefix='/api/v1/search')

def get_pinyin_combinations(text):
    """
    获取文本的拼音组合，包括全拼和首字母
    """
    if not text:
        return []
    
    # 获取全拼
    full_pinyin = ''.join(lazy_pinyin(text, style=Style.NORMAL))
    # 获取首字母
    initials = ''.join(lazy_pinyin(text, style=Style.FIRST_LETTER))
    
    combinations = [full_pinyin, initials]
    
    # 也包含带空格的全拼
    spaced_pinyin = ' '.join(lazy_pinyin(text, style=Style.NORMAL))
    combinations.append(spaced_pinyin)
    
    return list(set(combinations))  # 去重

def search_users_with_pinyin(keyword, base_query):
    """
    支持拼音搜索的用户查询
    支持多条件搜索，关键词以空格分隔，每个条件可以匹配userName、phone、department
    例如：'气象 134' 会搜索部门包含气象且手机包含134的用户
    """
    # 将关键词按空格分割成多个条件
    conditions = [cond.strip() for cond in keyword.split() if cond.strip()]
    
    if not conditions:
        return base_query.filter(False)  # 如果没有有效条件，返回空结果
    
    # 为每个条件构建匹配条件
    all_condition_groups = []
    
    for condition in conditions:
        condition_pattern = f'%{condition}%'
        condition_requirements = []
        
        # 基础文本匹配条件
        condition_requirements.extend([
            User.userName.like(condition_pattern),
            User.phone.like(condition_pattern),
            User.department.like(condition_pattern)
        ])
        
        # 如果条件是纯数字，也搜索userID
        if condition.isdigit():
            condition_requirements.append(User.userID == int(condition))
        
        # 如果条件包含中文或字母，进行拼音搜索
        if any('\u4e00' <= char <= '\u9fff' for char in condition) or condition.isalpha():
            # 获取所有用户进行拼音匹配
            all_users = base_query.all()
            pinyin_matched_ids = []
            
            for user in all_users:
                condition_lower = condition.lower()
                matched = False
                
                # 检查用户名拼音
                if user.userName:
                    pinyin_combinations = get_pinyin_combinations(user.userName)
                    for pinyin in pinyin_combinations:
                        if condition_lower in pinyin.lower():
                            pinyin_matched_ids.append(user.userID)
                            matched = True
                            break
                
                # 检查部门拼音
                if not matched and user.department:
                    pinyin_combinations = get_pinyin_combinations(user.department)
                    for pinyin in pinyin_combinations:
                        if condition_lower in pinyin.lower():
                            pinyin_matched_ids.append(user.userID)
                            matched = True
                            break
            
            # 添加拼音匹配的条件
            if pinyin_matched_ids:
                condition_requirements.append(User.userID.in_(pinyin_matched_ids))
        
        # 每个条件必须满足（OR逻辑）：用户名匹配 OR 手机匹配 OR 部门匹配 OR 拼音匹配
        all_condition_groups.append(or_(*condition_requirements))
    
    # 所有条件都必须满足（AND逻辑）
    return base_query.filter(and_(*all_condition_groups))

def search_events_with_pinyin(keyword, base_query):
    """
    支持拼音搜索的活动查询
    搜索：活动名称、活动地点、活动简介、发起活动的协会的会长名称
    """
    search_pattern = f'%{keyword}%'
    search_conditions = [
        Event.title.like(search_pattern),
        Event.location.like(search_pattern),
        Event.location_name.like(search_pattern),
        Event.location_address.like(search_pattern),
        Event.message.like(search_pattern)
    ]
    
    # 如果关键词包含中文或者可能是拼音，进行拼音搜索
    if any('\u4e00' <= char <= '\u9fff' for char in keyword) or keyword.isalpha():
        # 获取所有活动及其相关信息
        all_events = base_query.join(Club).join(
            ClubMember, and_(Club.clubID == ClubMember.clubID, ClubMember.role.in_(['president', 'vice_president', 'director']))
        ).join(User, ClubMember.userID == User.userID).all()
        
        pinyin_matched_ids = []
        keyword_lower = keyword.lower()
        
        for event in all_events:
            # 检查活动标题
            if event.title:
                pinyin_combinations = get_pinyin_combinations(event.title)
                for pinyin in pinyin_combinations:
                    if keyword_lower in pinyin.lower():
                        pinyin_matched_ids.append(event.eventID)
                        break
            
            # 检查活动地点
            if event.location:
                pinyin_combinations = get_pinyin_combinations(event.location)
                for pinyin in pinyin_combinations:
                    if keyword_lower in pinyin.lower():
                        pinyin_matched_ids.append(event.eventID)
                        break
            
            # 检查活动简介
            if event.message:
                pinyin_combinations = get_pinyin_combinations(event.message)
                for pinyin in pinyin_combinations:
                    if keyword_lower in pinyin.lower():
                        pinyin_matched_ids.append(event.eventID)
                        break
        
        # 检查会长名称 - 需要单独查询
        club_leaders = db.session.query(User, ClubMember, Club, Event).join(
            ClubMember, User.userID == ClubMember.userID
        ).join(
            Club, ClubMember.clubID == Club.clubID
        ).join(
            Event, Club.clubID == Event.clubID
        ).filter(ClubMember.role.in_(['president', 'vice_president', 'director'])).all()
        
        for user, member, club, event in club_leaders:
            if user.userName:
                pinyin_combinations = get_pinyin_combinations(user.userName)
                for pinyin in pinyin_combinations:
                    if keyword_lower in pinyin.lower():
                        pinyin_matched_ids.append(event.eventID)
                        break
        
        # 添加拼音匹配的条件
        if pinyin_matched_ids:
            search_conditions.append(Event.eventID.in_(pinyin_matched_ids))
    
    return base_query.filter(or_(*search_conditions))

def search_clubs_with_pinyin(keyword, base_query):
    """
    支持拼音搜索的协会查询
    搜索：协会名称、协会简介、协会会长名称
    """
    search_pattern = f'%{keyword}%'
    search_conditions = [
        Club.clubName.like(search_pattern),
        Club.description.like(search_pattern),
        Club.charter.like(search_pattern)
    ]
    
    # 如果关键词包含中文或者可能是拼音，进行拼音搜索
    if any('\u4e00' <= char <= '\u9fff' for char in keyword) or keyword.isalpha():
        # 获取所有协会
        all_clubs = base_query.all()
        pinyin_matched_ids = []
        keyword_lower = keyword.lower()
        
        for club in all_clubs:
            # 检查协会名称
            if club.clubName:
                pinyin_combinations = get_pinyin_combinations(club.clubName)
                for pinyin in pinyin_combinations:
                    if keyword_lower in pinyin.lower():
                        pinyin_matched_ids.append(club.clubID)
                        break
            
            # 检查协会简介
            if club.description:
                pinyin_combinations = get_pinyin_combinations(club.description)
                for pinyin in pinyin_combinations:
                    if keyword_lower in pinyin.lower():
                        pinyin_matched_ids.append(club.clubID)
                        break
        
        # 检查会长名称 - 需要单独查询
        club_leaders = db.session.query(User, ClubMember, Club).join(
            ClubMember, User.userID == ClubMember.userID
        ).join(
            Club, ClubMember.clubID == Club.clubID
        ).filter(ClubMember.role.in_(['president', 'vice_president', 'director'])).all()
        
        for user, member, club in club_leaders:
            if user.userName:
                pinyin_combinations = get_pinyin_combinations(user.userName)
                for pinyin in pinyin_combinations:
                    if keyword_lower in pinyin.lower():
                        pinyin_matched_ids.append(club.clubID)
                        break
        
        # 添加拼音匹配的条件
        if pinyin_matched_ids:
            search_conditions.append(Club.clubID.in_(pinyin_matched_ids))
    
    return base_query.filter(or_(*search_conditions))

# 综合搜索建议接口
@bp.route('/composite/suggestions', methods=['GET'])
@jwt_required()
def get_composite_suggestions():
    # 权限检查
    has_permission, message = check_permission(search.get_composite_suggestions.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    """
    综合搜索建议接口
    支持用户、活动、协会的快速搜索建议
    参数：
    - keyword: 搜索关键词（必需）
    - types: 搜索类型，用逗号分隔，可选值：user,event,club，默认为所有类型
    - limit: 建议数量限制，默认为12，最大30
    """
    # 获取当前用户
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    if not cur_user:
        return jsonify({'code': 4004, 'message': '用户不存在'}), 200

    # 获取搜索参数
    keyword = request.args.get('keyword', '').strip()
    types = request.args.get('types', 'user,event,club').strip()
    limit = min(request.args.get('limit', 12, type=int), 30)

    # 参数验证
    if not keyword:
        return jsonify({
            'code': 200,
            'message': 'success',
            'data': {'suggestions': []}
        })

    if len(keyword) < 1:
        return jsonify({
            'code': 200,
            'message': 'success',
            'data': {'suggestions': []}
        })

    # 解析搜索类型
    search_types = [t.strip() for t in types.split(',') if t.strip()]
    valid_types = ['user', 'event', 'club']
    search_types = [t for t in search_types if t in valid_types]
    
    if not search_types:
        search_types = valid_types

    suggestions = []
    
    # 每种类型分配的限制数量
    type_limit = max(1, limit // len(search_types))
    
    # 搜索用户
    if 'user' in search_types:
        user_query = User.query
        users = search_users_with_pinyin(keyword, user_query).with_entities(
            User.userID,
            User.userName,
            User.phone,
            User.isSuperUser
        ).order_by(User.userName).limit(type_limit).all()

        for user in users:
            # 获取完整的用户对象以访问avatar关系
            full_user = User.query.get(user.userID)
            avatar_url = full_user.avatar.fileUrl if full_user.avatar else None
            
            # 获取用户的社团信息
            user_clubs = ClubMember.query.filter_by(userID=user.userID, isDelete=False).limit(2).all()
            tag = "超级用户" if user.isSuperUser else "普通用户"
            
            if user_clubs:
                club_names = []
                for membership in user_clubs:
                    club = Club.query.filter_by(clubID=membership.clubID, isDelete=False).first()
                    
                    if club:
                        # 根据角色显示不同的文本
                        role_map = {
                            'president': '会长',
                            'vice_president': '副会长',
                            'director': '理事',
                            'member': '会员'
                        }
                        role_text = role_map.get(membership.role, '会员')
                        club_names.append(f"{club.clubName}({role_text})")
                
                if club_names:
                    tag = ', '.join(club_names[:2])

            suggestion = {
                'id': f"user_{user.userID}",
                'title': user.userName,
                'description': f"手机: {user.phone}" if user.phone else "暂无联系方式",
                'icon': 'manager-o' if user.isSuperUser else 'friends-o',
                'iconColor': '#ff6b9d' if user.isSuperUser else '#52c41a',
                'tag': tag,
                'extra': {
                    'type': 'user',
                    'userId': str(user.userID),
                    'phone': user.phone,
                    'avatar': avatar_url,
                    'isSuperUser': user.isSuperUser
                }
            }
            suggestions.append(suggestion)

    # 搜索活动
    if 'event' in search_types:
        event_query = Event.query.filter(Event.is_cancelled == False)
        events = search_events_with_pinyin(keyword, event_query).with_entities(
            Event.eventID,
            Event.title,
            Event.location,
            Event.location_name,
            Event.pre_startTime,
            Event.clubID
        ).order_by(Event.createDate.desc()).limit(type_limit).all()

        for event in events:
            # 获取活动所属协会信息
            club = Club.query.filter_by(clubID=event.clubID).first()
            club_name = club.clubName if club else "未知协会"
            
            # 格式化时间
            time_str = "暂无时间安排"
            if event.pre_startTime:
                time_str = event.pre_startTime.strftime('%Y-%m-%d %H:%M')
            
            # 格式化地点
            location_str = event.location_name or event.location or "暂无地点"

            suggestion = {
                'id': f"event_{event.eventID}",
                'title': event.title,
                'description': f"地点: {location_str} | 时间: {time_str}",
                'icon': 'calendar-o',
                'iconColor': '#1890ff',
                'tag': club_name,
                'extra': {
                    'type': 'event',
                    'eventId': str(event.eventID),
                    'clubId': str(event.clubID),
                    'location': location_str,
                    'startTime': time_str
                }
            }
            suggestions.append(suggestion)

    # 搜索协会
    if 'club' in search_types:
        club_query = Club.query.filter(Club.isDelete == False)
        clubs = search_clubs_with_pinyin(keyword, club_query).with_entities(
            Club.clubID,
            Club.clubName,
            Club.description,
            Club.createDate
        ).order_by(Club.clubName).limit(type_limit).all()

        for club in clubs:
            # 获取协会会长信息
            leader_member = ClubMember.query.filter_by(
                clubID=club.clubID, 
                role='admin'
            ).first()
            
            leader_name = "暂无会长"
            if leader_member and leader_member.user:
                leader_name = leader_member.user.userName

            # 获取协会成员数量
            member_count = ClubMember.query.filter_by(
                clubID=club.clubID,
                isDelete=False
            ).count()

            suggestion = {
                'id': f"club_{club.clubID}",
                'title': club.clubName,
                'description': f"会长: {leader_name} | 成员: {member_count}人",
                'icon': 'shop-o',
                'iconColor': '#722ed1',
                'tag': club.description[:20] + "..." if club.description and len(club.description) > 20 else (club.description or "暂无简介"),
                'extra': {
                    'type': 'club',
                    'clubId': str(club.clubID),
                    'leaderName': leader_name,
                    'memberCount': member_count,
                    'description': club.description
                }
            }
            suggestions.append(suggestion)

    return jsonify({
        'code': 200,
        'message': 'success',
        'data': {
            'suggestions': suggestions[:limit],
            'search_info': {
                'keyword': keyword,
                'types': search_types,
                'total_count': len(suggestions)
            }
        }
    })

# 综合搜索接口
@bp.route('/composite', methods=['GET'])
@jwt_required()
def composite_search():
    # 权限检查
    has_permission, message = check_permission(search.composite_search.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    """
    综合搜索接口
    支持用户、活动、协会的分页搜索
    参数：
    - q: 搜索关键词（必需）
    - types: 搜索类型，用逗号分隔，可选值：user,event,club，默认为所有类型
    - page: 页码，默认为1
    - per_page: 每页数量，默认为15，最大50
    """
    # 获取当前用户
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    if not cur_user:
        return jsonify({'Flag': '4004', 'message': '用户不存在'}), 200

    # 获取搜索参数
    search_query = request.args.get('q', '').strip()
    types = request.args.get('types', 'user,event,club').strip()
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 15, type=int), 50)

    # 参数验证
    if not search_query:
        return jsonify({'Flag': '4001', 'message': '搜索关键词不能为空'}), 200

    if page < 1:
        return jsonify({'Flag': '4001', 'message': '页码必须大于0'}), 200

    if per_page < 1:
        return jsonify({'Flag': '4001', 'message': '每页数量必须大于0'}), 200

    # 解析搜索类型
    search_types = [t.strip() for t in types.split(',') if t.strip()]
    valid_types = ['user', 'event', 'club']
    search_types = [t for t in search_types if t in valid_types]
    
    if not search_types:
        search_types = valid_types

    result_data = {
        'users': [],
        'events': [],
        'clubs': []
    }

    # 搜索用户
    if 'user' in search_types:
        user_query = User.query
        user_query = search_users_with_pinyin(search_query, user_query)
        
        try:
            user_pagination = user_query.paginate(
                page=page,
                per_page=per_page // len(search_types) if len(search_types) > 1 else per_page,
                error_out=False
            )
            
            for user in user_pagination.items:
                # 获取用户的社团信息
                user_clubs = ClubMember.query.filter_by(userID=user.userID, isDelete=False).limit(3).all()
                tag = "超级用户" if user.isSuperUser else "普通用户"
                
                if user_clubs:
                    club_names = []
                    for membership in user_clubs:
                        club = Club.query.filter_by(clubID=membership.clubID, isDelete=False).first()
                        
                        if club:
                            # 根据角色显示不同的文本
                            role_map = {
                                'president': '会长',
                                'vice_president': '副会长',
                                'director': '理事',
                                'member': '会员'
                            }
                            role_text = role_map.get(membership.role, '会员')
                            club_names.append(f"{club.clubName}({role_text})")
                    
                    if club_names:
                        if len(club_names) > 2:
                            tag = f"{', '.join(club_names[:2])}等"
                        else:
                            tag = ', '.join(club_names)

                user_info = {
                    'user_id': user.userID,
                    'user_name': user.userName,
                    'phone': user.phone,
                    'gender': user.gender,
                    'avatar': user.avatar.fileUrl if user.avatar else None,
                    'is_super_user': user.isSuperUser,
                    'tag': tag
                }
                result_data['users'].append(user_info)
        except Exception as e:
            # 用户搜索失败不影响其他类型搜索
            pass

    # 搜索活动
    if 'event' in search_types:
        event_query = Event.query.filter(Event.is_cancelled == False)
        event_query = search_events_with_pinyin(search_query, event_query)
        
        try:
            event_pagination = event_query.paginate(
                page=page,
                per_page=per_page // len(search_types) if len(search_types) > 1 else per_page,
                error_out=False
            )
            
            for event in event_pagination.items:
                # 获取活动所属协会信息
                club = Club.query.filter_by(clubID=event.clubID).first()
                club_name = club.clubName if club else "未知协会"
                
                # 获取活动创建者信息
                author = User.query.filter_by(userID=event.authorID).first()
                author_name = author.userName if author else "未知用户"
                
                # 获取参与人数
                join_count = EventJoin.query.filter_by(eventID=event.eventID).count()
                
                event_info = {
                    'event_id': event.eventID,
                    'title': event.title,
                    'message': event.message,
                    'location': event.location,
                    'location_name': event.location_name,
                    'location_address': event.location_address,
                    'pre_start_time': event.pre_startTime.isoformat() if event.pre_startTime else None,
                    'pre_end_time': event.pre_endTime.isoformat() if event.pre_endTime else None,
                    'create_date': event.createDate.isoformat() if event.createDate else None,
                    'club_id': event.clubID,
                    'club_name': club_name,
                    'author_id': event.authorID,
                    'author_name': author_name,
                    'join_count': join_count,
                    'budget': event.budget,
                    'is_cancelled': event.is_cancelled
                }
                result_data['events'].append(event_info)
        except Exception as e:
            # 活动搜索失败不影响其他类型搜索
            pass

    # 搜索协会
    if 'club' in search_types:
        club_query = Club.query.filter(Club.isDelete == False)
        club_query = search_clubs_with_pinyin(search_query, club_query)
        
        try:
            club_pagination = club_query.paginate(
                page=page,
                per_page=per_page // len(search_types) if len(search_types) > 1 else per_page,
                error_out=False
            )
            
            for club in club_pagination.items:
                # 获取协会会长信息
                leader_member = ClubMember.query.filter_by(
                    clubID=club.clubID, 
                    role='admin'
                ).first()
                
                leader_info = None
                if leader_member and leader_member.user:
                    leader_info = {
                        'user_id': leader_member.user.userID,
                        'user_name': leader_member.user.userName,
                        'phone': leader_member.user.phone,
                        'avatar': leader_member.user.avatar.fileUrl if leader_member.user.avatar else None
                    }

                # 获取协会成员数量
                member_count = ClubMember.query.filter_by(
                    clubID=club.clubID,
                    isDelete=False
                ).count()
                
                # 获取协会活动数量
                event_count = Event.query.filter_by(
                    clubID=club.clubID,
                    is_cancelled=False
                ).count()

                club_info = {
                    'club_id': club.clubID,
                    'club_name': club.clubName,
                    'description': club.description,
                    'charter': club.charter,
                    'create_date': club.createDate.isoformat() if club.createDate else None,
                    'update_date': club.updateDate.isoformat() if club.updateDate else None,
                    'images': club.images,
                    'leader': leader_info,
                    'member_count': member_count,
                    'event_count': event_count
                }
                result_data['clubs'].append(club_info)
        except Exception as e:
            # 协会搜索失败不影响其他类型搜索
            pass

    # 计算总结果数量
    total_results = len(result_data['users']) + len(result_data['events']) + len(result_data['clubs'])

    return jsonify({
        'Flag': '4000',
        'message': '搜索成功',
        'data': {
            'results': result_data,
            'search_info': {
                'query': search_query,
                'types': search_types,
                'page': page,
                'per_page': per_page,
                'total_results': total_results,
                'user_count': len(result_data['users']),
                'event_count': len(result_data['events']),
                'club_count': len(result_data['clubs'])
            }
        }
    })

# 用户搜索建议接口（为search_suggest组件专用）
@bp.route('/user/suggestions', methods=['GET'])
@jwt_required()
def get_user_suggestions():
    # 权限检查
    has_permission, message = check_permission(search.get_user_suggestions.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    """
    用户搜索建议接口
    专门为search_suggest组件提供快速的用户搜索建议
    参数：
    - keyword: 搜索关键词（必需）
    - limit: 建议数量限制，默认为8，最大20
    """
    # 获取当前用户
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    if not cur_user:
        return jsonify({'code': 4004, 'message': '用户不存在'}), 200

    # 获取搜索参数
    keyword = request.args.get('keyword', '').strip()
    limit = min(request.args.get('limit', 8, type=int), 20)  # 限制最大建议数量

    # 参数验证
    if not keyword:
        return jsonify({
            'code': 200,
            'message': 'success',
            'data': {'suggestions': []}
        })

    if len(keyword) < 1:  # 至少输入1个字符
        return jsonify({
            'code': 200,
            'message': 'success',
            'data': {'suggestions': []}
        })

    # 构建基础查询
    base_query = User.query
    
    # 使用支持拼音的搜索
    users = search_users_with_pinyin(keyword, base_query).order_by(
        User.userName
    ).limit(limit).all()

    # 构建建议数据
    suggestions = []
    for user in users:
        # 获取完整的用户对象以访问avatar关系
        avatar_url = user.avatar.fileUrl if user.avatar else None
        
        # 构建用户描述信息
        description_parts = []
        if user.phone:
            description_parts.append(f"手机: {user.phone}")
        
        description = " | ".join(description_parts) if description_parts else "暂无联系方式"
        
        # 确定用户标签
        tag = "超级用户" if user.isSuperUser else "普通用户"
        
        # 获取用户的社团信息（限制查询以提高性能）
        user_clubs = ClubMember.query.filter_by(
            userID=user.userID,
            isDelete=False
        ).limit(3).all()  # 只取前3个社团
        
        if user_clubs:
            club_names = []
            for membership in user_clubs:
                club = Club.query.filter_by(clubID=membership.clubID, isDelete=False).first()
                
                if club:
                    # 根据角色显示不同的文本
                    role_map = {
                        'president': '会长',
                        'vice_president': '副会长',
                        'director': '理事',
                        'member': '会员'
                    }
                    role_text = role_map.get(membership.role, '会员')
                    club_names.append(f"{club.clubName}({role_text})")
            
            if club_names:
                if len(club_names) > 2:
                    tag = f"{', '.join(club_names[:2])}等"
                else:
                    tag = ', '.join(club_names)

        suggestion = {
            'id': str(user.userID),
            'title': user.userName,
            'description': description,
            'icon': 'manager-o' if user.isSuperUser else 'friends-o',
            'iconColor': '#ff6b9d' if user.isSuperUser else '#52c41a',
            'tag': tag,
            'extra': {
                'type': 'user',
                'userId': str(user.userID),
                'phone': user.phone,
                'avatar': avatar_url,
                'isSuperUser': user.isSuperUser
            }
        }
        suggestions.append(suggestion)

    return jsonify({
        'code': 200,
        'message': 'success',
        'data': {
            'suggestions': suggestions
        }
    })

# 用户搜索接口
@bp.route('/user', methods=['GET'])
@jwt_required()
def search_users():
    # 权限检查
    has_permission, message = check_permission(search.search_users.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    """
    用户搜索接口
    支持按用户名、手机号、部门进行模糊搜索
    参数：
    - q: 搜索关键词（必需）
    - page: 页码，默认为1
    - per_page: 每页数量，默认为10，最大50
    - include_deleted: 是否包含已删除用户，默认为false（仅超级管理员可用）
    """
    # 获取当前用户
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    if not cur_user:
        return jsonify({'Flag':'4004','message': '用户不存在'}), 200

    # 获取搜索参数
    search_query = request.args.get('q', '').strip()
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 10, type=int), 50)  # 限制最大每页数量
    include_deleted = request.args.get('include_deleted', 'false').lower() == 'true'

    # 参数验证
    if not search_query:
        return jsonify({'Flag':'4001','message': '搜索关键词不能为空'}), 200

    if page < 1:
        return jsonify({'Flag':'4001','message': '页码必须大于0'}), 200

    if per_page < 1:
        return jsonify({'Flag':'4001','message': '每页数量必须大于0'}), 200

    # 构建基础查询
    query = User.query

    # 使用支持拼音的搜索
    query = search_users_with_pinyin(search_query, query)

    # 按用户名排序
    query = query.order_by(User.userName)

    # 执行分页查询
    try:
        pagination = query.paginate(
            page=page, 
            per_page=per_page, 
            error_out=False
        )
    except Exception as e:
        return jsonify({'Flag':'4001','message': f'查询错误：{str(e)}'}), 200

    users = pagination.items

    # 构建返回数据
    user_data = []
    for user in users:
        # 获取用户加入的社团信息
        # 确定用户标签
        tag = "超级用户" if user.isSuperUser else "普通用户"
        # 获取用户的社团信息（限制查询以提高性能）
        user_clubs = ClubMember.query.filter_by(
            userID=user.userID,
            isDelete=False
        ).limit(3).all()  # 只取前3个社团
        
        if user_clubs:
            club_names = []
            for membership in user_clubs:
                club = Club.query.filter_by(clubID=membership.clubID, isDelete=False).first()
                
                if club:
                    # 根据角色显示不同的文本
                    role_map = {
                        'president': '会长',
                        'vice_president': '副会长',
                        'director': '理事',
                        'member': '会员'
                    }
                    role_text = role_map.get(membership.role, '会员')
                    club_names.append(f"{club.clubName}({role_text})")
            
            if club_names:
                if len(club_names) > 2:
                    tag = f"{', '.join(club_names[:2])}等"
                else:
                    tag = ', '.join(club_names)

        user_info = {
            'user_id': user.userID,
            'user_name': user.userName,
            'phone': user.phone,
            'gender': user.gender,
            'department': user.department,
            'position': user.position,
            'avatar': user.avatar.fileUrl if user.avatar else None,
            'is_super_user': user.isSuperUser,
            'tag': tag
        }
        user_data.append(user_info)

    return jsonify({
        'Flag': '4000',
        'message': '搜索成功',
        'data': {
            'users': user_data,
            'pagination': {
                'current_page': pagination.page,
                'per_page': pagination.per_page,
                'total_pages': pagination.pages,
                'total_records': pagination.total,
                'has_next': pagination.has_next,
                'has_prev': pagination.has_prev
            },
            'search_info': {
                'query': search_query,
                'result_count': len(user_data),
                'include_deleted': include_deleted
            }
        }
    })

