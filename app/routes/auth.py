from flask import Flask, Blueprint, request, jsonify, current_app, redirect, url_for
from flask_jwt_extended import create_access_token, JWTManager, jwt_required, get_jwt_identity, verify_jwt_in_request, get_jwt
from werkzeug.security import generate_password_hash, check_password_hash
from ..models import User, ClubMember, Club, File
from .. import db
from datetime import timedelta, datetime
import requests, json
from app.permission import check_permission, auth
from app.utils.wxdatacrypt import wxdatacrypt
import os
import threading
import time


bp = Blueprint('auth', __name__, url_prefix='/api/v1/auth')


@bp.route('/verify_token', methods=['POST'])
def verify_token():
    """验证token是否有效，返回token状态和用户信息"""
    try:
        # 验证JWT token
        verify_jwt_in_request()
        
        # 获取token信息
        current_user_id = get_jwt_identity()
        jwt_data = get_jwt()
        
        # 获取用户信息
        user = User.query.filter_by(userID=current_user_id).first()
        if not user:
            return jsonify({
                'valid': False,
                'message': '用户不存在',
                'code': 'USER_NOT_FOUND'
            }), 404
        
        # 计算token剩余时间
        exp_timestamp = jwt_data.get('exp')
        current_timestamp = datetime.utcnow().timestamp()
        remaining_time = exp_timestamp - current_timestamp if exp_timestamp else 0
        # 构建用户信息
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

        user_info = {
            'id': user.userID,
            'username': user.userName,
            'department': getattr(user, 'department', ''),
            'position': getattr(user, 'position', ''),
            'avatar': user.avatar.fileUrl if getattr(user, 'avatar', None) else None,
            'phone': getattr(user, 'phone', ''),
            'email': getattr(user, 'email', ''),
            'roles': roles_list(user),
            'isSuperUser': user.isSuperUser
        }
        
        # 生成新的token给用户续期
        new_token = create_access_token(identity=str(user.userID))
        
        return jsonify({
            'valid': True,
            'message': 'Token有效',
            'user': user_info,
            'new_token': new_token,  # 新增续期token
            'token_info': {
                'expires_at': exp_timestamp,
                'remaining_seconds': int(remaining_time),
                'remaining_hours': round(remaining_time / 3600, 2) if remaining_time > 0 else 0
            }
        })
        
    except Exception as e:
        # Token无效或过期
        return jsonify({
            'valid': False,
            'message': 'Token无效或已过期',
            'code': 'TOKEN_INVALID',
            'error': str(e)
        }), 401



@bp.route('/loginweak', methods=['POST'])
def login_weak():
    """开发者工具模式下，直接使用userId签发token并返回用户信息"""
    data = request.get_json(silent=True) or {}
    user_id = data.get('userId')
    if not user_id:
        return jsonify({'message': 'userId required'}), 400

    user = User.query.filter_by(userID=user_id).first()
    if not user:
        return jsonify({'message': 'user not found'}), 404

    token = create_access_token(identity=str(user.userID))

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

    user_info = {
        'id': user.userID,
        'username': user.userName,
        'department': getattr(user, 'department', ''),
        'position': getattr(user, 'position', ''),
        'avatar': user.avatar.fileUrl if getattr(user, 'avatar', None) else None,
        'phone': getattr(user, 'phone', ''),
        'email': getattr(user, 'email', ''),
        'roles': roles_list(user),
        'isSuperUser': user.isSuperUser
        
    }
    return jsonify({'token': token, 'user': user_info})



@bp.route('/qy/code2session', methods=['POST'])
def qy_code2session():
    data = request.get_json(silent=True) or {}
    code = data.get('code')
    
    if not code:
        return jsonify({'message': 'code required'}), 400

    corpid = current_app.config.get('WECOM_CORP_ID')
    corpsecret = current_app.config.get('WECOM_SECRET')

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

    # 使用 access_token 调用企业微信小程序的 jscode2session
    sess_url = (
        'https://qyapi.weixin.qq.com/cgi-bin/miniprogram/jscode2session'
        f'?access_token={access_token}&js_code={code}&grant_type=authorization_code'
    )
    sess = requests.get(sess_url).json()
    wecom_userid = sess.get('userid')
    print(sess)
    user = User.query.filter_by(wecomUserID=wecom_userid).first()
    if not user:
        return jsonify({'message': 'user not in database'}), 400

    # 保存session信息
    session_key = sess.get('session_key')
    sess_ttl = sess.get('expires_in') or 7200
    sess_expires = datetime.utcnow() + timedelta(seconds=int(sess_ttl))

    # 更新sessionKey及过期时间
    user.wecom_sess = session_key
    user.wecom_sess_expires = sess_expires

    db.session.commit()

    token = create_access_token(identity=str(user.userID))
    user_info = {
        'id': user.userID,
        'username': user.userName,
        'department': user.department,
        'position': user.position,
        'avatar': user.avatar.fileUrl if getattr(user, 'avatar', None) else None,
        'phone': user.phone,
        'email': user.email,
        'roles': user.get_user_roles,
        'isSuperUser': user.isSuperUser
    }
    return jsonify({'token': token, 'user': user_info})





@bp.route('/update_phone', methods=['POST'])
@jwt_required()
def update_phone():
    """更新用户手机号"""
    try:
        current_user_id = get_jwt_identity()
        print(current_user_id)
        data = request.get_json(silent=True) or {}
        encrypted_data = data.get('encryptedData')
        iv = data.get('iv')
        print(data)
        if not encrypted_data or not iv:
            return jsonify({'message': 'encryptedData and iv required', 'success': False}), 400
        
        user = User.query.filter_by(userID=current_user_id).first()
        if not user:
            return jsonify({'message': 'user not found', 'success': False}), 404
        
        # 检查sessionKey是否存在且未过期
        if not getattr(user, 'wecom_sess', None) or not getattr(user, 'wecom_sess_expires', None):
            return jsonify({'message': 'sessionKey missing, please login again', 'success': False}), 400
        if datetime.utcnow() >= user.wecom_sess_expires:
            return jsonify({'message': 'sessionKey expired, please login again', 'success': False}), 400
        
        try:
            app_id = current_app.config.get('WECOM_CORP_ID', '')
            if not app_id:
                return jsonify({'message': 'appid not configured', 'success': False}), 500
            
            crypt = wxdatacrypt(app_id, user.wecom_sess)
            decrypted_data = crypt.decrypt(encrypted_data, iv)
            phone = decrypted_data.get('mobile', '')
            if not phone:
                return jsonify({'message': 'no phone number in decrypted data', 'success': False}), 400
        except Exception as e:
            print(f"解密手机号失败: {str(e)}")
            return jsonify({'message': 'decrypt failed', 'success': False}), 400
        
        user.phone = phone
        db.session.commit()
        
        return jsonify({'message': 'mobile updated successfully', 'success': True})
        
    except Exception as e:
        db.session.rollback()
        print(f"更新手机号失败: {str(e)}")
        return jsonify({'message': 'update failed', 'success': False}), 500


@bp.route('/update_avatar', methods=['POST'])
@jwt_required()
def update_avatar():
    """更新用户头像"""
    try:
        current_user_id = get_jwt_identity()
        data = request.get_json(silent=True) or {}
        file_id = data.get('fileID')
        
        if not file_id:
            return jsonify({'message': 'fileID required', 'success': False}), 400
        
        user = User.query.filter_by(userID=current_user_id).first()
        if not user:
            return jsonify({'message': 'user not found', 'success': False}), 404
        
        # 验证文件是否存在且属于当前用户
        from app.models import File
        file_record = File.query.filter_by(fileID=file_id, uploaderID=current_user_id).first()
        if not file_record:
            return jsonify({'message': 'file not found or not authorized', 'success': False}), 404
        
        # 更新用户头像ID
        user.avatarID = file_id
        db.session.commit()
        
        return jsonify({'message': 'avatar updated successfully', 'success': True})
        
    except Exception as e:
        db.session.rollback()
        print(f"更新头像失败: {str(e)}")
        return jsonify({'message': 'update failed', 'success': False}), 500


def get_wecom_access_token():
    """获取企业微信access_token"""
    try:
        corpid = current_app.config.get('WECOM_CORP_ID')
        corpsecret = current_app.config.get('WECOM_SECRET')

        if not corpid or not corpsecret:
            print("企业微信配置不完整")
            return None

        # 获取 access_token
        token_url = f'https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid={corpid}&corpsecret={corpsecret}'
        token_response = requests.get(token_url)
        token_data = token_response.json()

        if token_data.get('errcode') != 0:
            print(f'获取access_token失败: {token_data.get("errmsg", "未知错误")}')
            return None

        access_token = token_data.get('access_token')
        if not access_token:
            print('access_token为空')
            return None
        current_app.config['WECOM_TOKEN'] = access_token
        print(f"企业微信access_token已更新: {access_token}")
        return access_token

    except requests.RequestException as e:
        print(f'获取access_token网络请求失败: {str(e)}')
        return None
    except Exception as e:
        print(f'获取access_token出错: {str(e)}')
        return None


def token_refresh_worker(app):
    """token刷新后台工作线程，每小时执行一次"""
    while True:
        try:
            with app.app_context():
                # 刷新企业微信 token
                wecom_success = get_wecom_access_token()
                if wecom_success:
                    print("企业微信token刷新任务执行成功")
                else:
                    print("企业微信token刷新任务执行失败")
        except Exception as e:
            print(f"token刷新工作线程出错: {e}")

        # 等待1小时（3600秒）
        time.sleep(3600)


def start_token_refresh_automation(app):
    """启动token刷新自动化机制"""
    if not hasattr(app, '_token_refresh_thread_started'):
        app._token_refresh_thread_started = True
        thread = threading.Thread(target=token_refresh_worker, args=(app,), daemon=True)
        thread.start()
        print("token刷新自动化机制已启动，每60分钟执行一次")