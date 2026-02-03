from flask import Blueprint, jsonify, request, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..models import User, ClubMember, Club, Event, EventJoin,  Message
from .. import db, TEST_MODE
from datetime import datetime
from app.permission import check_permission, message
import bleach  # 新增安全过滤库
import requests

bp = Blueprint('message', __name__, url_prefix='/api/v1/message')

# 企业微信推送函数
def send_wecom_message(user_ids, text, media=None, url=None):
    """
    发送企业微信消息（个人消息）
    """
    if not user_ids:
        return False, "没有接收用户"
    
    # 获取企业access_token
    access_token = current_app.config.get('WECOM_TOKEN')
    corpid = current_app.config.get('WECOM_CORP_ID')
    corpsecret = current_app.config.get('WECOM_SECRET')
    agentid = current_app.config.get('WECOM_AGENT_ID')
    
    if not access_token:
        # 1. 获取 access_token
        token_url = f'https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid={corpid}&corpsecret={corpsecret}'
        token_response = requests.get(token_url)
        token_data = token_response.json()

        if token_data.get('errcode') != 0:
            print(f'获取access_token失败: {token_data.get("errmsg", "未知错误")}')
            return False, f'获取access_token失败: {token_data.get("errmsg", "未知错误")}'

        access_token = token_data.get('access_token')
        if not access_token:
            print('access_token为空')
            return False, 'access_token为空'

        # 缓存token到配置中
        current_app.config['WECOM_TOKEN'] = access_token
    
    try:
        # 获取wecomUserID列表
        users = User.query.filter(User.userID.in_(user_ids)).all()
        wecom_ids = [user.wecomUserID for user in users if user.wecomUserID]
        
        if not wecom_ids:
            return False, "没有有效的企业微信用户"
        
        # 发送消息
        send_url = f'https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token={access_token}'
        if not media:
            message_data = {
                "touser": "|".join(wecom_ids),
                "msgtype": "text",
                "agentid": int(agentid),
                "text": {
                    "content": text
                }
            }
        else:
            message_data = {
                "touser": "|".join(wecom_ids),
                "msgtype": "template_card",
                "agentid": int(agentid),
                "template_card": {
                    "card_type": "news_notice",
                    "main_title": {
                        "title": "文体协会通知",
                        "desc": text
                    },
                    "source": {
                        "icon_url": "https://www.vhhg.top/api/v1/assets/logo.png",
                        "desc": "文体协会通知",
                        "desc_color": 1
                    },
                    "card_image": {
                        "url": media
                    },
                    "card_action": {
                        "type": 2,
                        "appid": "wxdd0c019563891a72",
                        "pagepath": url
                    }
                }
            }
        
        response = requests.post(send_url, json=message_data)
        print(response.json())
        result = response.json()
        
        if result.get('errcode', 0) == 0:
            return True, "发送成功"
        else:
            return False, f"发送失败: {result.get('errmsg')}"
            
    except Exception as e:
        return False, f"发送异常: {str(e)}"

# 获取用户消息列表
@bp.route('/user_get/list', methods=['GET'])
@jwt_required()
def get_user_messages():
    # 权限检查
    has_permission, message_text = check_permission(message.get_user_messages.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message_text}), 200

    user_id = get_jwt_identity()
    messages = Message.query.filter_by(booker_id=user_id).order_by(Message.createDate.desc()).all()
    return jsonify({
        'Flag':'4000',
        'message': '调用成功',
        'data':[{
            'message_id': message.message_id,
            'operation': message.operation,
            'url': message.url,
            'text': message.text,
            'media': message.media,
            'createDate': message.createDate.isoformat(),
			'readDate': message.readDate,
            'booker_id': message.booker_id,
            }for message in messages
        ]})

# 生成消息
@bp.route('/create/for_user/<int:booker_id>', methods=['POST'])
@jwt_required()
def create_message(booker_id):
    # 权限检查
    has_permission, message_text = check_permission(message.create_message.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message_text}), 200

    data = request.get_json()
    url = data.get('url')
    text = bleach.clean(data.get('text'), tags=['p','b','i','u','strong','em','br'],attributes={'*': ['style']})
    operation = bleach.clean(data.get('operation'), strip=True)
    media = data.get('media')

    message_created = Message(url=url, text=text, booker_id=booker_id, operation=operation)
    
    db.session.add(message_created)
    db.session.commit()

    # 发送企业微信通知

    success, msg = send_wecom_message([booker_id], text, media, url)
    wecom_result = f"，企业微信通知: {msg}"

    return jsonify({
        'Flag':'4000',
        'message': f'消息生成成功{wecom_result}！'
    })

# 为整个协会的人员生成消息
@bp.route('/create/for_club/<int:club_id>', methods=['POST'])
@jwt_required()
def create_message_for_club(club_id):
    # 权限检查
    has_permission, message_text = check_permission(message.create_message_for_club.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message_text}), 200

    data = request.get_json()
    url = bleach.clean(data.get('url'), strip=True)
    text = bleach.clean(data.get('text'), tags=['p','b','i','u','strong','em','br'],attributes={'*': ['style']})
    operation = bleach.clean(data.get('operation'), strip=True)
    club = Club.query.filter_by(clubID=club_id).first()
    media = data.get('media')
    # 双重校验：社团存在性和成员非空
    if not club:
        return jsonify({'Flag':'4001', 'message': '社团不存在'}), 200
    if not club.members:  # 直接使用club.members但增加空校验
        return jsonify({'Flag':'4002', 'message': '社团没有成员'}), 200    
    messages_created = [Message(url=url, text=text, booker_id=club_member.userID, operation=operation) for club_member in club.members]
    
    db.session.add_all(messages_created)
    db.session.commit()

    # 发送企业微信通知

    user_ids = [member.userID for member in club.members]
    success, msg = send_wecom_message(user_ids, text, media, url)
    wecom_result = f"，企业微信通知: {msg}"
    print(wecom_result)
    return jsonify({
        'Flag':'4000',
        'message': f'消息生成成功{wecom_result}！'
    })
	
# 为所有参加活动的人员生成消息
@bp.route('/create/for_event/<int:event_id>', methods=['POST'])
@jwt_required()
def create_message_for_event(event_id):
    # 权限检查
    has_permission, message_text = check_permission(message.create_message_for_event.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message_text}), 200

    data = request.get_json()
    text = bleach.clean(data.get('text'), 
        tags=['p','b','i','u','strong','em','br'],
        attributes={'*': ['style']})
    url = bleach.clean(data.get('url'), strip=True)
    operation = bleach.clean(data.get('operation'), strip=True)
    media = data.get('media')
    # 更新依赖文件
    event = Event.query.filter_by(eventID=event_id).first()
    if not event:
        return jsonify({'Flag': '4001', 'message': '活动不存在'})
    
    if not event.eventjoins:
        return jsonify({'Flag': '4002', 'message': '活动没有参与人员'})
    
    messages_created = [Message(url=url, text=text, booker_id=eventjoin.userID, operation=operation) for eventjoin in event.eventjoins]
    
    db.session.add_all(messages_created)
    db.session.commit()

    # 发送企业微信通知

    user_ids = [eventjoin.userID for eventjoin in event.eventjoins]
    success, msg = send_wecom_message(user_ids, text, media, url)
    wecom_result = f"，企业微信通知: {msg}"

    return jsonify({
        'Flag':'4000',
        'message': f'消息生成成功{wecom_result}！'
    })

# 阅读消息
@bp.route('/<int:message_id>/read', methods=['GET'])
@jwt_required()
def read_message(message_id):
    # 权限检查
    has_permission, message_text = check_permission(message.read_message.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message_text}), 200
    
    message_obj = Message.query.filter_by(message_id=message_id).first()

    if not message_obj:
        return jsonify({'Flag':'4001','message': '消息不存在！'}), 200
    
    message_obj.readDate = datetime.utcnow()
    db.session.commit()
    return jsonify({'Flag':'4000','message': '消息已阅！'}), 200

