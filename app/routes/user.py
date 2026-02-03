from flask import Blueprint, jsonify, request, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..models import User, ClubMember, Club, Department
from .. import db, TEST_MODE
from sqlalchemy import or_, func
from app.permission import check_permission, user
import requests
import json
import threading
import time

bp = Blueprint('user', __name__, url_prefix='/api/v1/user')

# 获取所有用户个人信息（增强版）
# 获取所有部门列表
@bp.route('/departments', methods=['GET'])
@jwt_required()
def get_departments():
    # 权限检查
    has_permission, message = check_permission(user.get_departments.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    # 读取部门结构（支持多层级）
    dept_map = Department.build_id_map()
    if not dept_map:
        return jsonify({'Flag': '4000', 'message': '调用成功', 'data': {'departments': []}})

    children_map = Department.build_children_map(dept_map)

    # 统计每个部门的直属人数
    direct_counts = dict(
        db.session.query(User.departmentID, func.count(User.userID))
        .filter(User.departmentID.isnot(None), User.departmentID != 0)
        .group_by(User.departmentID)
        .all()
    )

    # 递归计算：包含子部门的总人数
    total_cache = {}

    def total_count(dept_id, depth=0):
        if dept_id in total_cache:
            return total_cache[dept_id]
        if depth > 64:
            return direct_counts.get(dept_id, 0)
        total = direct_counts.get(dept_id, 0)
        for cid in children_map.get(dept_id, []):
            total += total_count(cid, depth + 1)
        total_cache[dept_id] = total
        return total

    # 仅返回“最高级部门”：parent_id 为空/0 或 parent_id 不在 dept_map 中
    top_departments = []
    for dept_id, d in dept_map.items():
        pid = d.parentID
        is_root = (pid is None) or (pid == 0) or (pid not in dept_map)
        if not is_root:
            continue
        top_departments.append({
            'department_id': dept_id,
            'parent_id': pid,
            'department_name': d.department_name,
            'user_count_total': total_count(dept_id),
            'has_children': bool(children_map.get(dept_id)),
        })

    top_departments.sort(key=lambda x: (x.get('department_name') or ''))

    return jsonify({
        'Flag': '4000',
        'message': '调用成功',
        'data': {
            'departments': top_departments
        }
    })


@bp.route('/departments/<int:dept_id>/expand', methods=['GET'])
@jwt_required()
def expand_department(dept_id):
    """
    通讯录展开接口：
    - 若有子部门：返回 type=children + children(含各自 user_count_total)
    - 若无子部门：返回 type=users + users(该部门人员列表)
    """
    # 权限检查
    has_permission, message = check_permission(user.get_department_users.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    dept_map = Department.build_id_map()
    if dept_id not in dept_map:
        return jsonify({'Flag': '4000', 'message': '调用成功', 'data': {'type': 'children', 'departments': []}})

    children_map = Department.build_children_map(dept_map)
    # 直接从数据库查询子部门（避免 children_map/缓存异常导致漏子部门）
    child_depts = Department.query.filter_by(parentID=dept_id).all()
    child_ids = [d.departmentID for d in child_depts if d]

    # 统计直属人数
    direct_counts = dict(
        db.session.query(User.departmentID, func.count(User.userID))
        .filter(User.departmentID.isnot(None), User.departmentID != 0)
        .group_by(User.departmentID)
        .all()
    )

    total_cache = {}

    def total_count(did, depth=0):
        if did in total_cache:
            return total_cache[did]
        if depth > 64:
            return direct_counts.get(did, 0)
        total = direct_counts.get(did, 0)
        for cid in children_map.get(did, []):
            total += total_count(cid, depth + 1)
        total_cache[did] = total
        return total

    # 有子部门：返回子部门列表
    if child_ids:
        children = []
        for d in child_depts:
            if not d:
                continue
            cid = d.departmentID
            children.append({
                'department_id': cid,
                'parent_id': d.parentID,
                'department_name': d.department_name,
                'user_count_total': total_count(cid),
                'has_children': bool(children_map.get(cid)),
            })
        children.sort(key=lambda x: (x.get('department_name') or ''))
        return jsonify({'Flag': '4000', 'message': '调用成功', 'data': {'type': 'children', 'departments': children}})

    # 无子部门：返回人员列表（复用现有 users 接口逻辑，但只保留必要字段）
    users = User.query.filter_by(departmentID=dept_id).all()
    result = []
    for u in users:
        result.append({
            'user_id': u.userID,
            'user_name': u.userName,
            'phone': u.phone or '',
            'department': Department.build_path(u.departmentID, dept_map=dept_map)[0],
            'department_id': u.departmentID,
            'position': u.position or '',
            'avatar': u.avatar.fileUrl if u.avatar else None,
            'is_super_user': u.isSuperUser,
        })
    return jsonify({'Flag': '4000', 'message': '调用成功', 'data': {'type': 'users', 'users': result}})

# 获取指定部门的用户列表
@bp.route('/departments/<int:dept_id>/users', methods=['GET'])
@jwt_required()
def get_department_users(dept_id):
    # 权限检查
    print(dept_id)
    has_permission, message = check_permission(user.get_department_users.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    # 获取指定部门的用户
    users = User.query.filter_by(departmentID=dept_id).all()

    if not users:
        return jsonify({
            'Flag': '4000',
            'message': '调用成功',
            'data': {
                'users': []
            }
        })

    # 构建用户列表（模仿/wecom/list格式）
    dept_map = Department.build_id_map()
    all_users_flat = []

    for user_show in users:
        # 获取用户的角色信息生成标签
        tag = "普通用户"  # 默认标签

        if user_show.isSuperUser:
            tag = "超级用户"
        else:
            # 检查用户是否有社团角色
            user_clubs = ClubMember.query.filter_by(userID=user_show.userID).limit(2).all()
            if user_clubs:
                club_names = []
                for membership in user_clubs:
                    club = None
                    if membership.role in ['president', 'vice_president', 'director'] and membership.club_as_manager:
                        club = membership.club_as_manager
                    elif membership.role == 'member' and membership.club_as_member:
                        club = membership.club_as_member

                    if club and not getattr(club, 'isDelete', False):
                        role_name = {
                            'president': '会长',
                            'vice_president': '副会长',
                            'director': '理事',
                            'member': '会员'
                        }.get(membership.role, '成员')
                        club_names.append(f"{club.clubName}{role_name}")

                if club_names:
                    tag = ', '.join(club_names[:2])

        # 获取部门链式路径
        department_path, department_chain = Department.build_path(user_show.departmentID, dept_map=dept_map)
        if not department_path:
            department_path = f"部门{user_show.departmentID or ''}".strip()

        user_info = {
            'user_id': user_show.userID,
            'user_name': user_show.userName,
            'phone': user_show.phone or '',
            'department': department_path,
            'department_id': user_show.departmentID,
            'department_chain': department_chain,
            'position': user_show.position or '',
            'avatar': user_show.avatar.fileUrl if user_show.avatar else None,
            'is_super_user': user_show.isSuperUser,
            'tag': tag
        }
        all_users_flat.append(user_info)

    return jsonify({
        'Flag': '4000',
        'message': '调用成功',
        'data': {
            'users': all_users_flat
        }
    })

@bp.route('/list_weak', methods=['GET'])
def get_user_list_weak():

    users = User.query.all()
    
    user_list = []

    def roles_list(user):
        roles = []
        
        # 超级用户角色
        if user.isSuperUser:
            roles.append("超级用户")
        
        # 处理管理员角色（根据club.py第24-44行关系定义）
        for cm in user.clubmembers:
            # 根据角色类型选择正确的反向引用
            club = None
            if cm.role in ['president', 'vice_president', 'director']:
                club = getattr(cm, 'club_as_manager', None)  # 对应managers关系
            elif cm.role == 'member':
                club = getattr(cm, 'club_as_member', None)  # 对应members关系
            
            # 安全获取协会信息
            if club and not getattr(club, 'isDelete', False):
                role_name = {
                    'president': '会长',
                    'vice_president': '副会长',
                    'director': '理事',
                    'member': '会员'
                }.get(cm.role, '成员')
                roles.append(f"{club.clubName}{role_name}")

        # 去重处理
        roles = list(set(roles))
        
        # 默认角色
        if not roles and not user.isSuperUser:
            roles.append("普通用户")
            
        return roles

    for user in users:

        roles = roles_list(user)        

        user_info = {
            'id': user.userID,
            'wecomUserID': user.wecomUserID,
            'name': user.userName,
            'phone': user.phone,
            'gender': user.gender,
            'email': user.email,
            'isSuperUser': user.isSuperUser,
            'avatar': user.avatar.fileUrl if user.avatar else None,
            'roles': roles
        }
        user_list.append(user_info)
    
    return jsonify({
        'Flag': '4000',
        'message': '调用成功',
        'user_num': len(users),
        'data': user_list
    })


# 获取单个用户个人信息
@bp.route('/<int:user_id>', methods=['GET'])
@jwt_required()
def get_user(user_id):
    # 权限检查
    has_permission, message = check_permission(user.get_user.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    user_show = User.query.filter_by(userID=user_id).first()
    if user_show:
        dept_map = Department.build_id_map()
        department_path, department_chain = Department.build_path(getattr(user_show, 'departmentID', None), dept_map=dept_map)
        return jsonify({
            'Flag':'4000',
            'message': '调用成功',
            'data':{
                'id': user_show.userID,
                'username': user_show.userName,
                'phone': user_show.phone,
                'gender': user_show.gender,
                'email': user_show.email,
                'isSuperUser': user_show.isSuperUser,
                'avatar': user_show.avatar.fileUrl if user_show.avatar else None,
                'roles': user_show.get_user_roles,
                'department': department_path or '',
                'departmentID': getattr(user_show, 'departmentID', None),
                'department_chain': department_chain,
                'position': user_show.position
            }})
    else:
        return jsonify({'Flag':'4001','message': '该用户不存在'}), 404

# 更新用户个人信息
@bp.route('/<int:user_id>/update', methods=['POST'])
@jwt_required()
def update_user(user_id):
    # 权限检查
    has_permission, message = check_permission(user.update_user.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    current_user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=current_user_id).first()

    update_user = User.query.filter_by(userID=user_id).first()
    if update_user:
        update_user.userName = request.json.get('name', update_user.userName)
        update_user.gender = request.json.get('gender', update_user.gender)
        update_user.email = request.json.get('email', update_user.email)
        update_user.phone = request.json.get('phone', update_user.phone)
        # 新版以 departmentID 为准（department 字段后续将删除）
        new_dept_id = request.json.get('departmentID', request.json.get('department_id', None))
        if new_dept_id is not None:
            try:
                update_user.departmentID = int(new_dept_id)
            except Exception:
                pass
        update_user.position = request.json.get('position', update_user.position)
        db.session.commit()
        return jsonify({'Flag':'4000','message': '调用成功'})
    else:
        return jsonify({'Flag':'4001','message': '该用户不存在'}), 404

# 删除用户
@bp.route('/<int:user_id>/delete', methods=['DELETE'])
@jwt_required()
def delete_user(user_id):
    # 权限检查
    has_permission, message = check_permission(user.delete_user.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    current_user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=current_user_id).first()

    user = User.query.filter_by(userID=user_id).first()
    if user:
        user.isDelete = True
        db.session.commit()
        return jsonify({'Flag':'4000','message': '调用成功'})
    else:
        return jsonify({'Flag':'4001','message': '该用户不存在'}), 404



def sync_wecom_users_to_db():
    """从企业微信同步用户数据到数据库"""
    try:
        print("开始同步企业微信用户数据...")

        # 获取企业微信配置
        corpid = current_app.config.get('WECOM_CORP_ID', 'wwf6bdecdbde4495c5')
        corpsecret = current_app.config.get('WECOM_SECRET', '7mqD-yj2BbLWxw7egrWa8ELKb5-SyI5CO7lgH_ZQ70k')

        if not corpid or not corpsecret:
            print("企业微信配置不完整")
            return False

        # 优先使用已缓存的token，否则重新获取
        access_token = current_app.config.get('WECOM_TOKEN')
        if not access_token:
            # 1. 获取 access_token
            token_url = f'https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid={corpid}&corpsecret={corpsecret}'
            token_response = requests.get(token_url)
            token_data = token_response.json()

            if token_data.get('errcode') != 0:
                print(f'获取access_token失败: {token_data.get("errmsg", "未知错误")}')
                return False

            access_token = token_data.get('access_token')
            if not access_token:
                print('access_token为空')
                return False

            # 缓存token到配置中
            current_app.config['WECOM_TOKEN'] = access_token
        # 2. 获取所有部门列表
        dept_url = f'https://qyapi.weixin.qq.com/cgi-bin/department/list?access_token={access_token}'
        dept_response = requests.get(dept_url)
        dept_data = dept_response.json()
        print(dept_data)
        if dept_data.get('errcode') != 0:
            print(f'获取部门列表失败: {dept_data.get("errmsg", "未知错误")}')
            return False

        departments = dept_data.get('department', [])
        if not departments:
            print("没有部门数据")
            return True

        # 2.1 upsert 部门表（department）
        try:
            for d in departments:
                dept_id = d.get('id')
                if dept_id is None:
                    continue
                dept_id = int(dept_id)
                parent_id = d.get('parentid')
                parent_id = int(parent_id) if parent_id is not None else None
                name = d.get('name') or ''
                leader_ids = d.get('department_leader') or []
                leader_id = None
                if isinstance(leader_ids, list) and leader_ids:
                    try:
                        leader_id = int(leader_ids[0])
                    except Exception:
                        leader_id = None

                existing_dept = Department.query.filter_by(departmentID=dept_id).first()
                if existing_dept:
                    changed = False
                    if name and existing_dept.department_name != name:
                        existing_dept.department_name = name
                        changed = True
                    if existing_dept.parentID != parent_id:
                        existing_dept.parentID = parent_id
                        changed = True
                    if leader_id and existing_dept.department_leaderID != leader_id:
                        existing_dept.department_leaderID = leader_id
                        changed = True
                    if changed:
                        print(f"更新部门: {dept_id} {name}")
                else:
                    db.session.add(Department(
                        departmentID=dept_id,
                        parentID=parent_id,
                        department_name=name or str(dept_id),
                        department_leaderID=leader_id
                    ))
                    print(f"新增部门: {dept_id} {name}")
            db.session.commit()
        except Exception as e:
            print(f"部门表 upsert 失败: {e}")
            db.session.rollback()

        # 参考 auth.py 的方法，构建部门ID到部门名称的映射
        id_to_name = {d.get('id'): d.get('name') for d in departments}
        # 3. 遍历所有部门，获取用户列表
        sync_count = {'updated': 0, 'inserted': 0}

        for dept in departments:
            dept_id = dept.get('id')
            if not dept_id:
                continue

            # 获取该部门的用户列表
            user_list_url = f'https://qyapi.weixin.qq.com/cgi-bin/user/list?access_token={access_token}&department_id={dept_id}'
            user_response = requests.get(user_list_url)
            user_data = user_response.json()

            if user_data.get('errcode') != 0:
                print(f'获取部门{dept_id}用户列表失败: {user_data.get("errmsg", "未知错误")}')
                continue

            dept_users = user_data.get('userlist', [])

            for user_info in dept_users:
                # 检查用户是否已存在（通过wecomUserID）
                existing_user = User.query.filter_by(wecomUserID=user_info.get('userid')).first()

                # 参考 auth.py 的方法，将部门ID转换为部门名称
                dept_ids = user_info.get('department', [])
                department_names = [id_to_name.get(int(i), str(i)) for i in dept_ids]

                # 获取主部门ID（第一个部门，如果有的话）
                primary_dept_id = int(dept_ids[0]) if dept_ids else None

                user_data = {
                    'wecomUserID': user_info.get('userid'),
                    'userName': user_info.get('name'),
                    'department': ','.join(department_names),
                    'departmentID': primary_dept_id,
                    'position': user_info.get('position', ''),
                    'phone': user_info.get('mobile', ''),
                    'gender': user_info.get('gender', 0)
                }

                if existing_user:
                    # 更新现有用户（只更新有值的字段）
                    updated = False
                    for field, value in user_data.items():
                        if value and getattr(existing_user, field) != value:
                            setattr(existing_user, field, value)
                            updated = True

                    if updated:
                        sync_count['updated'] += 1
                        print(f"更新用户: {user_info.get('name')} ({user_info.get('userid')})")
                else:
                    # 插入新用户 - 复用上面的部门名称和ID转换逻辑
                    dept_ids = user_info.get('department', [])
                    department_names = [id_to_name.get(int(i), str(i)) for i in dept_ids]
                    primary_dept_id = int(dept_ids[0]) if dept_ids else None

                    new_user = User(
                        wecomUserID=user_info.get('userid'),
                        userName=user_info.get('name'),
                        department=','.join(department_names),
                        departmentID=primary_dept_id,
                        position=user_info.get('position', ''),
                        phone=user_info.get('mobile', ''),
                        gender=user_info.get('gender', 0),
                        isSuperUser=False
                    )
                    db.session.add(new_user)
                    sync_count['inserted'] += 1
                    print(f"新增用户: {user_info.get('name')} ({user_info.get('userid')})")

        # 提交所有更改
        db.session.commit()
        print(f"用户同步完成: 更新{sync_count['updated']}个, 新增{sync_count['inserted']}个")
        return True

    except requests.RequestException as e:
        print(f'网络请求失败: {str(e)}')
        db.session.rollback()
        return False
    except Exception as e:
        print(f'同步用户数据出错: {str(e)}')
        db.session.rollback()
        return False


def user_sync_worker(app):
    """用户同步后台工作线程，每60分钟执行一次"""
    while True:
        try:
            with app.app_context():
                print("开始执行用户同步任务...")
                success = sync_wecom_users_to_db()
                if success:
                    print("用户同步任务执行成功")
                else:
                    print("用户同步任务执行失败")
        except Exception as e:
            print(f"用户同步工作线程出错: {e}")

        # 等待60分钟（3600秒）
        time.sleep(3600)


def start_user_sync_automation(app):
    """启动用户同步自动化机制"""
    if not hasattr(app, '_user_sync_thread_started'):
        app._user_sync_thread_started = True
        thread = threading.Thread(target=user_sync_worker, args=(app,), daemon=True)
        thread.start()
        print("用户同步自动化机制已启动，每60分钟执行一次")



