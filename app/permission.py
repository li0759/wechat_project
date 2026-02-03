import inspect
from flask import request
from flask_jwt_extended import get_jwt_identity
from app.models.user import User
from app.models.club import Club, ClubMember, ClubApplication
from app.models.event import Event
from app.models.schedule import Schedule
from app.models.money import PayGroup, ClubFee
from app.models.file import File
from app.models.moment import Moment
from app import db, TEST_MODE

def get_current_user():
    """获取当前用户"""
    if TEST_MODE:
        user_id = get_jwt_identity()
        print('get_current_userid: '+user_id)
        return User.query.filter_by(userID=user_id).first()
    else:
        user_id = get_jwt_identity()
        return User.query.filter_by(userID=user_id).first()

def get_route_params():
    """自动获取当前路由的所有参数"""
    frame = inspect.currentframe()
    try:
        # 向上查找，找到路由函数的frame
        for _ in range(10):
            frame = frame.f_back
            if frame is None:
                break
            
            # 检查是否是路由函数
            local_vars = frame.f_locals
            if any(key in local_vars for key in ['club_id', 'event_id', 'user_id', 'schedule_id', 'application_id', 'member_id', 'fee_id', 'message_id', 'group_id', 'pay_id', 'moment_id']):
                return local_vars
        
        return {}
    finally:
        del frame

def get_admin_roles():
    """获取所有管理员角色列表"""
    return ['president', 'vice_president', 'director']

def is_super_user(user):
    """检查是否为超级用户"""
    return user.isSuperUser

def is_club_manager(user, club_id):
    """检查是否为协会管理员（会长、副会长、理事）"""    
    club = Club.query.get(club_id)
    # 检查是否为协会的管理员（会长、副会长、理事）
    # 假设club.managers是一个关系，返回管理员列表
    return any(manager.userID == user.userID for manager in club.managers)

def is_club_president(user, club_id):
    """检查是否为协会会长"""    
    club = Club.query.get(club_id)
    # 检查是否为协会的会长
    # 假设club.managers是一个关系，返回管理员列表
    return any(president.userID == user.userID for president in club.president)

def is_club_member(user, club_id):
    """检查是否为协会成员"""
    club = Club.query.get(club_id)
    return any(member.userID == user.userID for member in club.members)

def is_club_admin(user, club_id):
    """检查是否为协会管理员（会长、副会长、理事）"""
    return is_club_manager(user, club_id)

def is_event_creator_or_club_admin(user, event_id):
    """检查是否为活动创建者或活动所属协会管理员"""
    if not user:
        return False
    if user.isSuperUser:
        return True
    
    event = Event.query.get(event_id)
    if not event:
        return False
    
    if event.authorID == user.userID:
        return True
    
    return is_club_admin(user, event.clubID)

def check_permission(permission_func):
    """辅助函数：检查权限并返回结果"""
    try:
        current_user = get_current_user()
    except RuntimeError:
        # 如果没有JWT token（比如登录接口），current_user为None
        current_user = None
    
    route_params = get_route_params()
    
    if permission_func(current_user, route_params):
        return True, "权限检查通过"
    else:
        return False, "用户权限不足"

# ========== 认证路由权限 ==========
class auth:
    class wxlogin:
        # 微信登录：无需权限验证，任何人都可以访问
        permission_judge = lambda user, params: True
    
    class login:
        # 普通登录：无需权限验证，任何人都可以访问
        permission_judge = lambda user, params: True
    
    class login_weak:
        # 弱登录：无需权限验证，任何人都可以访问
        permission_judge = lambda user, params: True

# ========== 协会路由权限 ==========
class club:
    class get_club_list:
        # 获取社团列表：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class get_club_detail:
        # 获取社团详情：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class applicated_club:
        # 申请加入社团：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class delete_application:
        # 删除申请：超级用户或申请者本人可以删除
        permission_judge = lambda user, params: (
            user and (
                is_super_user(user) or
                (params.get('application_id') and 
                 ClubApplication.query.get(params['application_id']) and 
                 ClubApplication.query.get(params['application_id']).userID == user.userID)
            )
        )
        
    class quit_club:
        # 退出社团：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class process_application:
        # 处理申请：超级用户或社团管理员可以处理申请
        permission_judge = lambda user, params: (
            user and (
                is_super_user(user) or
                (params.get('application_id') and 
                 ClubApplication.query.get(params['application_id']) and 
                 is_club_manager(user, ClubApplication.query.get(params['application_id']).clubID))
            )
        )
    
    class get_application_for_club_pending:
        # 获取社团待处理申请：需要是该社团的管理员
        permission_judge = lambda user, params: (
            params.get('club_id') and is_club_manager(user, params['club_id'])
        )
    
    class get_all_applications_for_club:
        # 获取社团所有申请：需要是该社团的管理员
        permission_judge = lambda user, params: (
            params.get('club_id') and is_club_manager(user, params['club_id'])
        )
    
    class add_member:
        # 添加成员：需要是该社团的管理员
        permission_judge = lambda user, params: (
            params.get('club_id') and is_club_manager(user, params['club_id'])
        )
    
    class add_member_batch:
        # 批量添加成员：需要是该社团的管理员或超级用户
        permission_judge = lambda user, params: (
            params.get('club_id') and (is_club_manager(user, params['club_id']) or is_super_user(user))
        )
    
    class delete_member:
        # 删除成员：需要是该社团的管理员或超级用户
        permission_judge = lambda user, params: (
            params.get('club_id') and (is_club_manager(user, params['club_id']) or is_super_user(user))
        )
    
    class update_member:
        # 更新成员信息：超级用户或目标成员所在社团的管理员
        permission_judge = lambda user, params: (
            user and (
                is_super_user(user) or
                (params.get('member_id') and 
                 ClubMember.query.get(params['member_id']) and 
                 is_club_manager(user, ClubMember.query.get(params['member_id']).clubID))
            )
        )
    
    class revoke_club:
        # 撤销社团：仅超级用户可以操作
        permission_judge = lambda user, params: is_super_user(user)
    
    class delete_club:
        # 删除社团（级联软删除）：会长或超级用户可以操作
        permission_judge = lambda user, params: (
            user and (
                is_super_user(user) or
                (params.get('club_id') and is_club_president(user, params['club_id']))
            )
        )
    
    class get_club_members:
        # 获取社团成员列表：需要用户已登录
        permission_judge = lambda user, params: user is not None

    class change_role:
        # 切换用户身份：超级用户或目标成员所在社团的管理员
        permission_judge = lambda user, params: (
            user and (
                is_super_user(user) or
                (params.get('member_id') and 
                 ClubMember.query.get(params['member_id']) and 
                 is_club_manager(user, ClubMember.query.get(params['member_id']).clubID))
            )
        )
    
    class create_club:
        # 创建社团：仅超级用户可以操作
        permission_judge = lambda user, params: is_super_user(user)
    
    class edit_club_description:
        # 编辑社团描述：需要是该社团的管理员
        permission_judge = lambda user, params: (
            params.get('club_id') and is_club_manager(user, params['club_id'])
        )
    
    class update_cover:
        # 更新社团封面：需要是该社团的管理员
        permission_judge = lambda user, params: (
            params.get('club_id') and is_club_manager(user, params['club_id'])
        )
    
    class get_club_charter:
        # 获取社团章程：需要是该社团的成员
        permission_judge = lambda user, params: (
            params.get('club_id') and is_club_member(user, params['club_id'])
        )
    
    class upload_club_charter:
        # 上传社团章程：需要是该社团的管理员
        permission_judge = lambda user, params: (
            params.get('club_id') and is_club_manager(user, params['club_id'])
        )
    
    class get_user_joined_club:
        # 获取用户加入的社团：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class get_user_applicated_application:
        # 获取用户的申请记录：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class get_user_managed_club:
        # 获取用户管理的社团：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class get_hot_clubs:
        # 获取热门社团：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class update_club_images:
        # 更新社团图片：需要是该社团的管理员
        permission_judge = lambda user, params: (
            params.get('club_id') and is_club_manager(user, params['club_id'])
        )
    
    class permanent_delete_club:
        # 永久删除社团：仅超级用户可以操作
        permission_judge = lambda user, params: is_super_user(user)
    
    class permanent_delete_member:
        # 永久删除成员：超级用户或目标成员所在社团的管理员
        permission_judge = lambda user, params: (
            user and (
                is_super_user(user) or
                (params.get('member_id') and 
                 ClubMember.query.get(params['member_id']) and 
                 is_club_manager(user, ClubMember.query.get(params['member_id']).clubID))
            )
        )

# ========== 活动路由权限 ==========
class event:
    class get_eventlist:
        # 获取活动列表：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class create_event:
        # 创建活动：需要活动所属社团管理员
        permission_judge = lambda user, params: (
            params.get('club_id') and is_club_manager(user, params['club_id'])
        )
    
    class event_begin:
        # 开始活动：需要活动所属社团管理员
        permission_judge = lambda user, params: (
            params.get('event_id') and is_club_manager(user, Event.query.get(params['event_id']).clubID)
        )
    
    class update_pre_starttime:
        # 更新预计开始和结束时间：需要事件所属社团管理员
        permission_judge = lambda user, params: (
            params.get('event_id') and is_club_manager(user, Event.query.get(params['event_id']).clubID)
        )
    
    class update_pre_endtime:
        # 更新预计结束时间：需要事件所属社团管理员
        permission_judge = lambda user, params: (
            params.get('event_id') and is_club_manager(user, Event.query.get(params['event_id']).clubID)
        )
    
    class event_end:
        # 结束活动：需要是活动创建者或活动所属社团管理员
        permission_judge = lambda user, params: (
            params.get('event_id') and is_club_manager(user, Event.query.get(params['event_id']).clubID)
        )
    
    class update_cover:
        # 更新活动封面：需要是活动创建者或活动所属社团管理员
        permission_judge = lambda user, params: (
            params.get('event_id') and is_club_manager(user, Event.query.get(params['event_id']).clubID)
        )
    
    class update_real_cost:
        # 更新实际费用：需要是活动所属社团管理员
        permission_judge = lambda user, params: (
            params.get('event_id') and is_club_manager(user, Event.query.get(params['event_id']).clubID)
        )
    
    class update_location:
        # 更新活动地点：需要是活动所属社团管理员
        permission_judge = lambda user, params: (
            params.get('event_id') and is_club_manager(user, Event.query.get(params['event_id']).clubID)
        )
    
    class update_message:
        # 更新活动消息：需要是活动所属社团管理员
        permission_judge = lambda user, params: (
            params.get('event_id') and is_club_manager(user, Event.query.get(params['event_id']).clubID)
        )
    
    class clockin:
        # 活动签到：需要是活动参与人员
        permission_judge = lambda user, params: (
            params.get('event_id') and Event.query.get(params['event_id']) and 
            any(join.userID == user.userID for join in Event.query.get(params['event_id']).eventjoins)
        )
    
    class delete_event:
        # 删除活动：需要是活动所属社团管理员
        permission_judge = lambda user, params: (
            params.get('event_id') and is_club_manager(user, Event.query.get(params['event_id']).clubID)
        )
    
    class get_event:
        # 获取活动详情：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class get_event_members:
        # 获取活动成员：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class join_event:
        # 加入活动：需要是活动所属社团的成员，但不能是社团管理员
        permission_judge = lambda user, params: (
            params.get('event_id') and Event.query.get(params['event_id']) and 
            is_club_member(user, Event.query.get(params['event_id']).clubID) and
            not is_club_manager(user, Event.query.get(params['event_id']).clubID)
        )
    
    class add_event_member:
        # 邀请参加活动：需要是活动所属社团管理员
        permission_judge = lambda user, params: (
            params.get('event_id') and is_club_manager(user, Event.query.get(params['event_id']).clubID)
        )
    
    class quit_event:
        # 退出活动：需要是活动参与人员
        permission_judge = lambda user, params: (
            params.get('event_id') and Event.query.get(params['event_id']) and 
            any(join.userID == user.userID for join in Event.query.get(params['event_id']).eventjoins)
        )
    
    class remove_member:
        # 移除活动成员：需要是活动所属社团管理员
        permission_judge = lambda user, params: (
            params.get('event_id') and is_club_manager(user, Event.query.get(params['event_id']).clubID)
        )
    
    class get_user_joined_eventlist:
        # 获取用户已加入的活动列表：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class get_user_can_join_eventlist:
        # 获取用户可加入的活动列表：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class get_user_manage_eventlist:
        # 获取用户管理的活动列表：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class get_club_public_eventlist:
        # 获取社团公开活动列表：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class get_hot_events:
        # 获取热门活动：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class cancel_event:
        # 取消活动：需要是活动所属社团管理员
        permission_judge = lambda user, params: (
            params.get('event_id') and is_club_manager(user, Event.query.get(params['event_id']).clubID)
        )

# ========== 文件路由权限 ==========
class file:
    class upload_file:
        # 上传文件：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class create_by_url:
        # 通过URL创建文件：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class download_file:
        # 下载文件：无需权限验证，任何人都可以访问
        permission_judge = lambda user, params: True  # 文件下载通常不需要特殊权限
        
    class download_tmp_file:
        # 下载临时文件：无需权限验证，任何人都可以访问
        permission_judge = lambda user, params: True  # 文件下载通常不需要特殊权限
    
    class delete_file:
        # 删除文件：需要是文件上传者或相关管理员
        permission_judge = lambda user, params: (
            user is not None and (
                # 文件上传者可以删除自己的文件
                (params.get('file_id') and 
                 File.query.get(params['file_id']) and 
                 File.query.get(params['file_id']).userID == user.userID) or
                # 超级用户可以删除任何文件
                user.isSuperUser or
                # 协会管理员可以删除协会相关文件
                (params.get('file_id') and 
                 File.query.get(params['file_id']) and 
                 File.query.get(params['file_id']).refClubID and
                 is_club_manager(user, File.query.get(params['file_id']).refClubID)) or
                # 活动创建者可以删除活动相关文件
                (params.get('file_id') and 
                 File.query.get(params['file_id']) and 
                 File.query.get(params['file_id']).refEventID and
                 is_event_creator_or_club_admin(user, File.query.get(params['file_id']).refEventID))
            )
        )

# ========== 消息路由权限 ==========
class message:
    class get_user_messages:
        # 获取用户消息：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class create_message:
        # 创建消息：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class create_message_for_club:
        # 为社团创建消息：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class create_message_for_event:
        # 为活动创建消息：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class read_message:
        # 阅读消息：需要用户已登录
        permission_judge = lambda user, params: user is not None

# ========== 财务路由权限 ==========
class money:
    class get_clubfee_list:
        # 获取社团费用列表：需要是该社团的管理员
        permission_judge = lambda user, params: (
            params.get('club_id') and is_club_manager(user, params['club_id'])
        )
    
    class create_fee:
        # 创建费用：需要是该社团的管理员
        permission_judge = lambda user, params: (
            params.get('club_id') and is_club_manager(user, params['club_id'])
        )
    
    class delete_fee:
        # 删除费用：需要是费用所属社团的管理员
        permission_judge = lambda user, params: (
            params.get('fee_id') and is_club_manager(user, ClubFee.query.get(params['fee_id']).clubID)
        )
    
    class update_fee:
        # 更新费用：需要是费用所属社团的管理员
        permission_judge = lambda user, params: (
            params.get('fee_id') and is_club_manager(user, ClubFee.query.get(params['fee_id']).clubID)
        )
    
    class create_pay_for_club:
        # 为社团创建支付：需要是该社团的管理员
        permission_judge = lambda user, params: (
            params.get('clubID') and is_club_manager(user, params['clubID'])
        )
    
    class get_club_timeline:
        # 获取社团时间线：需要是该社团的管理员
        permission_judge = lambda user, params: (
            params.get('club_id') and is_club_manager(user, params['club_id'])
        )
    
    class get_user_created_paygroups:
        # 获取用户创建的付费组：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class get_user_payable:
        # 获取用户应付费用：需要用户已登录
        permission_judge = lambda user, params: user is not None

# ========== 日程路由权限 ==========
class schedule:
    class trigger_automation:
        # 触发自动化：仅超级用户可以操作
        permission_judge = lambda user, params: user and user.isSuperUser
    
    class get_schedule_list:
        # 获取日程列表：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class create_schedule:
        # 创建日程：需要是原型活动所属社团管理员
        permission_judge = lambda user, params: (
            user and params.get('event_id') and 
            is_club_manager(user, Event.query.get(params['event_id']).clubID) 
        )
    
    class update_schedule:
        # 更新日程：需要是原型活动所属社团管理员
        permission_judge = lambda user, params: (
            user and params.get('schedule_id') and 
            is_club_manager(user, Schedule.query.get(params['schedule_id']).prototype_event.clubID)
        )
    
    class schedule_begin:
        # 开始日程：需要是原型活动所属社团管理员
        permission_judge = lambda user, params: (
            user and params.get('schedule_id') and 
            is_club_manager(user, Schedule.query.get(params['schedule_id']).prototype_event.clubID)
        )
    
    class schedule_end:
        # 结束日程：需要是原型活动所属社团管理员
        permission_judge = lambda user, params: (
            user and params.get('schedule_id') and 
            is_club_manager(user, Schedule.query.get(params['schedule_id']).prototype_event.clubID)
        )
    
    class get_schedule:
        # 获取日程详情：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class join_schedule:
        # 加入日程：需要用户已登录，日程未结束，且是原型活动所属社团成员
        permission_judge = lambda user, params: (
            user and params.get('schedule_id') and 
            Schedule.query.get(params['schedule_id']) and
            Schedule.query.get(params['schedule_id']).endTime is None and
            Schedule.query.get(params['schedule_id']).prototype_event and
            is_club_member(user, Schedule.query.get(params['schedule_id']).prototype_event.clubID)
        )
    
    class quit_schedule:
        # 退出日程：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class get_schedule_members:
        # 获取日程成员：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class delete_schedule:
        # 删除日程：需要是原型活动所属社团管理员
        permission_judge = lambda user, params: (
            user and params.get('schedule_id') and 
            is_club_manager(user, Schedule.query.get(params['schedule_id']).prototype_event.clubID)
        )
    
    class get_user_joined_schedule_list:
        # 获取用户已加入的日程列表：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class get_user_can_join_schedule_list:
        # 获取用户可加入的日程列表：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class get_user_manage_schedule_list:
        # 获取用户管理的日程列表：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class get_club_public_schedule_list:
        # 获取社团公开日程列表：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class get_hot_schedules:
        # 获取热门日程：需要用户已登录
        permission_judge = lambda user, params: user is not None

# ========== 搜索路由权限 ==========
class search:
    class get_composite_suggestions:
        # 获取综合搜索建议：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class composite_search:
        # 综合搜索：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class get_user_suggestions:
        # 获取用户搜索建议：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class search_users:
        # 搜索用户：需要用户已登录
        permission_judge = lambda user, params: user is not None

# ========== 统计路由权限 ==========
class statistics:
    class export_all_club_users:
        # 导出所有社团用户：仅超级用户可以操作
        permission_judge = lambda user, params: user and user.isSuperUser
    
    class export_club_all_event_details:
        # 导出社团所有活动详情：需要是该社团的管理员
        permission_judge = lambda user, params: (
            params.get('club_id') and is_club_admin(user, params['club_id'])
        )
    
    class export_all_club_all_event_details:
        # 导出所有社团所有活动详情：仅超级用户可以操作
        permission_judge = lambda user, params: user and user.isSuperUser
    
    class export_event_details:
        # 导出活动详情：需要是活动创建者或活动所属社团管理员
        permission_judge = lambda user, params: (
            params.get('event_id') and is_event_creator_or_club_admin(user, params['event_id'])
        )
    
    class show_all_club_users:
        # 显示所有社团用户：仅超级用户可以操作
        permission_judge = lambda user, params: user and user.isSuperUser
    
    class show_club_all_event_details:
        # 显示社团所有活动详情：需要是该社团的管理员
        permission_judge = lambda user, params: (
            params.get('club_id') and is_club_admin(user, params['club_id'])
        )
    
    class show_all_club_all_event_details:
        # 显示所有社团所有活动详情：仅超级用户可以操作
        permission_judge = lambda user, params: user and user.isSuperUser
    
    class show_event_details:
        # 显示活动详情：需要是活动创建者或活动所属社团管理员
        permission_judge = lambda user, params: (
            params.get('event_id') and is_event_creator_or_club_admin(user, params['event_id'])
        )
    
    class show_club_financial_statistics:
        # 显示社团财务统计：需要是该社团的管理员
        permission_judge = lambda user, params: (
            params.get('club_id') and is_club_admin(user, params['club_id'])
        )
    
    class export_club_financial_statistics:
        # 导出社团财务统计：需要是该社团的管理员
        permission_judge = lambda user, params: (
            params.get('club_id') and is_club_admin(user, params['club_id'])
        )
    
    class test_image_support:
        # 测试图片支持：仅超级用户可以操作
        permission_judge = lambda user, params: user and user.isSuperUser

# ========== 用户路由权限 ==========
class user:
    class get_user_list_weak:
        # 获取用户列表（弱权限）：无需权限验证，任何人都可以访问
        permission_judge = lambda user, params: True  # 弱权限接口
    
    class get_departments:
        # 获取部门列表：仅超级用户可以操作
        permission_judge = lambda user, params: user and user.isSuperUser
    
    class get_department_users:
        # 获取部门用户列表：仅超级用户可以操作
        permission_judge = lambda user, params: user and user.isSuperUser
        
    class get_user_list:
        # 获取用户列表：仅超级用户可以操作
        permission_judge = lambda user, params: user and user.isSuperUser
    
    class get_user:
        # 获取用户信息：超级用户或用户本人可以访问
        permission_judge = lambda user, params: (
            user and (user.isSuperUser or user.userID == params.get('user_id'))
        )
    
    class update_user:
        # 更新用户信息：超级用户或用户本人可以修改
        permission_judge = lambda user, params: (
            user and (user.isSuperUser or user.userID == params.get('user_id'))
        )
    
    class delete_user:
        # 删除用户：仅超级用户可以操作
        permission_judge = lambda user, params: user and user.isSuperUser

# ========== 动态路由权限 ==========
class moment:
    class create_moment:
        # 创建动态：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class get_moment_list:
        # 获取动态列表：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class get_moment_detail:
        # 获取动态详情：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class like_moment:
        # 点赞动态：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class unlike_moment:
        # 取消点赞：需要用户已登录
        permission_judge = lambda user, params: user is not None
    
    class delete_moment:
        # 删除动态：需要是动态创建者或超级用户
        permission_judge = lambda user, params: (
            user and (
                is_super_user(user) or
                (params.get('moment_id') and 
                 Moment.query.get(params['moment_id']) and 
                 (
                    # 动态创建者
                    Moment.query.get(params['moment_id']).creatorID == user.userID or
                    # 动态所属社团管理员
                    (
                        Moment.query.get(params['moment_id']).ref_club_ID and 
                        is_club_manager(user, Moment.query.get(params['moment_id']).ref_club_ID)
                    ) or
                    # 动态所属活动的社团管理员（包含事件存在性判断）
                    (
                        Moment.query.get(params['moment_id']).ref_event_ID and 
                        Event.query.get(Moment.query.get(params['moment_id']).ref_event_ID) and 
                        is_club_manager(
                            user, 
                            Event.query.get(Moment.query.get(params['moment_id']).ref_event_ID).clubID
                        )
                    )
                 ))
            )
        )
    
    class get_user_moments:
        # 获取用户动态列表：需要用户已登录
        permission_judge = lambda user, params: user is not None 
    
    class get_event_moments:
        # 获取活动动态列表：需要用户已登录
        permission_judge = lambda user, params: user is not None 
    
    class get_club_moments:
        # 获取社团动态列表：需要用户已登录
        permission_judge = lambda user, params: user is not None 