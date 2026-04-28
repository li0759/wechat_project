from flask import Blueprint, jsonify, request, current_app
import os
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..models import ClubFee, Event, User, ClubMember, EventJoin, Club, PayGroup, PayPersonal 
from .. import db, TEST_MODE
from datetime import datetime, timedelta
from sqlalchemy import and_
from app.permission import check_permission, money



bp = Blueprint('money', __name__, url_prefix='/api/v1/money')

# 获取某协会支出列表，从开始日期到结束日期的记录
@bp.route('/clubfee/<int:club_id>/list/<string:start_date>/<string:end_date>', methods=['GET'])
@jwt_required()
def get_clubfee_list(club_id, start_date, end_date):
    # 权限检查
    has_permission, message = check_permission(money.get_clubfee_list.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    
    club = Club.query.filter(Club.clubID == club_id).first()
    if not club:
        return jsonify({'Flag':'4001','message': '协会不存在'}), 200
    
    try:
        # 将字符串日期转换为datetime对象
        start_date_dt = datetime.fromisoformat(start_date)
        end_date_dt = datetime.fromisoformat(end_date)
    except ValueError:
        return jsonify({'Flag':'4001','message': '日期格式错误，请使用ISO格式(YYYY-MM-DD)'}), 200

    # 收集所有支出记录
    expense_list = []
    
    # 1. 获取ClubFee记录
    filtered_fees = ClubFee.query.filter(
        ClubFee.clubID == club_id,
        ClubFee.createDate >= start_date_dt,
        ClubFee.createDate <= end_date_dt
    ).all()
    
    for clubfee in filtered_fees:
        expense_list.append({
            'type': 'club_fee',
            'id': clubfee.feeID,
            'feement': clubfee.feement,        
            'description': clubfee.description,
            'create_date': clubfee.createDate.isoformat()
        })
    
    # 2. 获取活动的real_cost记录
    filtered_events = Event.query.filter(
        Event.clubID == club_id
    ).all()
    
    for event in filtered_events:
        # 使用活动的实际开始时间或预计开始时间作为日期判断
        event_date = event.actual_startTime if event.actual_startTime else event.pre_startTime
        if event_date and start_date_dt <= event_date <= end_date_dt:
            expense_list.append({
                'type': 'event_real_cost',
                'id': event.eventID,
                'feement': float(event.real_cost) if event.real_cost else 0.0,
                'description': f"活动实际花费: {event.title}",
                'create_date': event_date.isoformat(),
                'event_title': event.title
            })
    
    # 按创建日期排序（降序）
    expense_list.sort(key=lambda x: x['create_date'], reverse=True)
    
    return jsonify({
        'Flag':'4000',
        'message': '调用成功',
        'data':{
            'expense_list': expense_list,
            'total_records': len(expense_list)
        }
    }), 200

# 创建协会支出
@bp.route('/clubfee/<int:club_id>/create', methods=['PUT'])
@jwt_required()
def create_fee(club_id):
    # 权限检查
    has_permission, message = check_permission(money.create_fee.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    data = request.get_json()
    feement = data.get('feement')
    description = data.get('description')
    eventID = data.get('event_id')
    # 获取用户提供的日期时间，如果没有则使用当前时间
    create_date_str = data.get('createDate')

    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()
    club = Club.query.filter(Club.clubID == club_id).first()
    if not club:
        return jsonify({'Flag':'4001','message': '协会不存在'}), 200

    # 处理日期时间
    if create_date_str:
        create_date = datetime.fromisoformat(create_date_str)
    else:
        # 没有提供日期时间，使用当前时间
        create_date = datetime.utcnow()

    fee = ClubFee(
        clubID=club_id, 
        feement=feement, 
        description=description, 
        createDate=create_date)
    db.session.add(fee)
    db.session.flush()
    db.session.commit()
    return jsonify({
        'Flag':'4000',
        'message': '创建花费成功',
        'club_id': club_id,
        'description': fee.description,
    })

# 删除协会支出
@bp.route('/clubfee/<int:fee_id>/delete', methods=['GET'])
@jwt_required()
def delete_fee(fee_id):
    # 权限检查
    has_permission, message = check_permission(money.delete_fee.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    # 获取当前用户
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 查询要删除的支出记录
    fee = ClubFee.query.filter(ClubFee.feeID == fee_id).first()
    if not fee:
        return jsonify({'Flag':'4001','message': '支出记录不存在'}), 200

    # 获取协会信息
    club = Club.query.filter(Club.clubID == fee.clubID).first()
    if not club:
        return jsonify({'Flag':'4001','message': '协会不存在'}), 200

    # 删除记录
    db.session.delete(fee)
    db.session.commit()

    return jsonify({
        'Flag':'4000',
        'message': '删除支出成功'
    })

# 修改协会支出
@bp.route('/clubfee/<int:fee_id>/update', methods=['POST'])
@jwt_required()
def update_fee(fee_id):
    # 权限检查
    has_permission, message = check_permission(money.update_fee.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    data = request.get_json()
    feement = data.get('feement')
    description = data.get('description')
    
    # 参数验证
    if feement is None or description is None:
        return jsonify({'Flag':'4001','message': '缺少必要参数feement或description'}), 200
    
    if feement <= 0:
        return jsonify({'Flag':'4001','message': '金额必须大于0'}), 200

    # 获取当前用户
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 查询要修改的支出记录
    fee = ClubFee.query.filter(ClubFee.feeID == fee_id).first()
    if not fee:
        return jsonify({'Flag':'4001','message': '支出记录不存在'}), 200

    # 获取协会信息
    club = Club.query.filter(Club.clubID == fee.clubID).first()
    if not club:
        return jsonify({'Flag':'4001','message': '协会不存在'}), 200

    # 更新记录
    fee.feement = feement
    fee.description = description
    db.session.commit()

    return jsonify({
        'Flag':'4000',
        'message': '修改支出成功',
        'data': {
            'fee_id': fee_id,
            'feement': fee.feement,
            'description': fee.description
        }
    }), 200

#创建一个群收款，并让整个协会的人员分摊
@bp.route('/paygroup/create/for_club/<int:clubID>', methods=['PUT'])
@jwt_required()
def create_pay_for_club(clubID):
    # 权限检查
    has_permission, message = check_permission(money.create_pay_for_club.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    data = request.get_json()
    total_fee = data.get('total_fee')
    description = data.get('description', '')
    # 获取用户提供的日期时间，如果没有则使用当前时间
    create_date_str = data.get('createDate')

    # 获取当前用户
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # 参数验证
    if not total_fee or total_fee <= 0:
        return jsonify({'Flag':'4004','message': '金额必须大于0'}), 200

    # 获取协会信息
    club = Club.query.get(clubID)
    if not club:
        return jsonify({'Flag':'4001','message': '协会不存在'}), 200

    # 通过关系获取协会成员（替换原来的ClubMember查询）
    members = club.members  # 使用club对象的members关系属性
    
    if not members:
        return jsonify({'Flag':'4003','message': '协会没有成员'}), 200

    # 计算人均费用
    member_count = len(members)
    per_payment = round(total_fee / member_count, 2)

    # 处理日期时间
    if create_date_str:
        create_date = datetime.fromisoformat(create_date_str)
    else:
        # 没有提供日期时间，使用当前时间
        create_date = datetime.utcnow()

    # 创建群收款记录
    pay_group = PayGroup(
        totalpayment = total_fee,
        createDate = create_date,
        creatorID = cur_user.userID,
        clubID = clubID,
        description = description or f"{club.clubName}协会群收款"
    )
    db.session.add(pay_group)
    db.session.flush()  # 获取groupID

    # 为每个成员创建个人收款记录
    for member in members:
        pay_personal = PayPersonal(
            payment = per_payment,
            createDate = create_date,  # 使用相同的创建时间
            payorID =member.userID,
            groupID=pay_group.groupID,
            description =description or f"{club.clubName}协会群收款"
        )
        db.session.add(pay_personal)

    db.session.commit()
    return jsonify({
        'Flag':'4000',
        'message': '创建群收款记录成功',
        'data': {
            'description': pay_group.description,
            'per_payment': per_payment,
            'total_fee': total_fee
        }
    }), 200









#获取某个协会的收支时间线，包括支出、活动、群收款，并按时间排序，每次返回指定月份的记录
@bp.route('/timeline_for_club/<int:club_id>/list', methods=['GET'])
@jwt_required()
def get_club_timeline(club_id):
    # 权限检查
    has_permission, message = check_permission(money.get_club_timeline.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    # 获取当前用户
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()
        
    # 获取协会信息
    club = Club.query.get(club_id)
    if not club:
        return jsonify({'Flag':'4001','message': '协会不存在'}), 200

    # 获取查询参数
    mode = request.args.get('mode', 'by_month')  # 默认按月查询
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    page = request.args.get('page', type=int)
    PAGE_SIZE = 10

    # 收集所有记录（公共逻辑）
    filtered_items = []
    # 1. 活动记录
    for event in club.events:
        real_cost = float(event.real_cost) if event.real_cost else 0.0
        start_time = event.actual_startTime if event.actual_startTime else event.pre_startTime
        filtered_items.append({
            'type': 'event_real_cost',
            'id': event.eventID,
            'cover': event.cover.fileUrl if event.cover else None,
            'title': event.title,
            'real_cost': real_cost,
            'create_date': start_time.isoformat(),
            'is_ended': event.actual_endTime is not None
        })
    # 2. 费用记录
    for clubfee in club.clubfees:
        filtered_items.append({
            'type': 'club_fee',
            'id': clubfee.feeID,
            'description': clubfee.description,
            'feement': clubfee.feement,
            'create_date': clubfee.createDate.isoformat()
        })
    # 3. 群收款记录
    for paygroup in club.paygroups:
        paid = sum(p.payment for p in paygroup.paypersonals if p.payDate)
        filtered_items.append({
            'type': 'pay_group',
            'id': paygroup.groupID,
            'description': paygroup.description,
            'paid': paid,
            'unpaid': paygroup.totalpayment - paid,
            'create_date': paygroup.createDate.isoformat(),
            'is_ended': all(p.payDate for p in paygroup.paypersonals)
        })
    # 按创建日期排序（降序）
    filtered_items.sort(key=lambda x: x['create_date'], reverse=True)
    
    # 处理不同模式
    if mode == 'by_month':
        # 参数验证
        if not year or not month:
            return jsonify({'Flag':'4001','message': '缺少年份或月份参数'}), 200
        if not (1 <= month <= 12):
            return jsonify({'Flag':'4001','message': '月份参数无效（1-12）'}), 200
        if year < 2000 or year > 2100:
            return jsonify({'Flag':'4001','message': '年份参数无效（2000-2100）'}), 200

        # 构造时间范围
        try:
            start_date = datetime(year, month, 1)
            end_date = datetime(year, month+1, 1) if month < 12 else datetime(year+1, 1, 1)
        except ValueError as e:
            return jsonify({'Flag':'4001','message': f'日期参数错误：{str(e)}'}), 200

        # 过滤时间范围内的记录
        time_filtered = [item for item in filtered_items 
                       if start_date <= datetime.fromisoformat(item['create_date']) < end_date]

        return jsonify({
            'Flag': '4000',
            'message': '获取成功',
            'data': {
                'records': time_filtered,
                'year': year,
                'month': month,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            }
        }), 200

    elif mode == 'by_page':
        if not page:
            return jsonify({'Flag':'4001','message': '缺少页码参数'}), 200

        # 计算分页参数（修正缩进）
        total_records = len(filtered_items)
        total_pages = (total_records + PAGE_SIZE - 1) // PAGE_SIZE
        
        if page < 1 or page > total_pages:
            return jsonify({'Flag':'4003','message': '无效的页码'}), 200

        start_index = (page - 1) * PAGE_SIZE
        end_index = start_index + PAGE_SIZE
        records = filtered_items[start_index:end_index]
        
        return jsonify({
            'Flag': '4000',
            'message': '获取成功',
            'data': {
                'records': records,
                'total_pages': total_pages,
                    'current_page': page,
                    'page_size': PAGE_SIZE
            }
        }), 200

    else:
        return jsonify({'Flag':'4001','message': '无效的模式参数'}), 200




@bp.route('/paygroup/user_created/list/<string:show>', methods=['GET'])
@jwt_required()
def get_user_created_paygroups(show):
    # 权限检查
    has_permission, message = check_permission(money.get_user_created_paygroups.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    mode = request.args.get('mode', 'page')
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    page = request.args.get('page', default=1, type=int)
    PAGE_SIZE = 10

    # 参数验证
    if show not in ['all', 'unfinished', 'finished']:
        return jsonify({'Flag':'4001','message': 'show参数必须是all/unfinished/finished'}), 200

    # 获取当前用户
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # Count模式处理
    if mode == 'count':
        pay_groups = PayGroup.query.filter_by(creatorID=cur_user.userID).all()
        
        going_count = sum(1 for g in pay_groups if sum(p.payment for p in g.paypersonals if p.payDate) < g.totalpayment)
        ended_count = len(pay_groups) - going_count
        
        if show == 'unfinished':
            return jsonify({
                'Flag': '4000',
                'message': '获取成功',
                'data': {'count': going_count}
            })
        elif show == 'finished':
            return jsonify({
                'Flag': '4000',
                'message': '获取成功',
                'data': {'count': ended_count}
            })
        else:  # all
            return jsonify({
                'Flag': '4000',
                'message': '获取成功',
                'data': {
                    'unfinished_count': going_count,
                    'finished_count': ended_count,
                    'total_count': len(pay_groups)
                }
            })

    # 时间过滤逻辑
    time_filter = None
    if mode == 'month':
        if not year or not month:
            return jsonify({'Flag':'4001','message': '需要year和month参数'}), 200
        try:
            start_date = datetime(year, month, 1)
            end_date = datetime(year, month+1, 1) if month < 12 else datetime(year+1, 1, 1)
            time_filter = (start_date, end_date)
        except ValueError as e:
            return jsonify({'Flag':'4001','message': f'日期参数错误：{str(e)}'}), 200

    # 基础查询
    query = PayGroup.query.filter_by(creatorID=cur_user.userID)
    
    # 应用时间过滤
    if mode == 'month' and time_filter:
        query = query.filter(PayGroup.createDate >= time_filter[0], 
                           PayGroup.createDate < time_filter[1])

    # 分页处理
    if mode == 'page':
        total = query.count()
        total_pages = (total + PAGE_SIZE - 1) // PAGE_SIZE
        
        if page < 1 or page > total_pages:
            return jsonify({'Flag':'4003','message': '无效的页码'}), 200

        pay_groups = query.order_by(PayGroup.createDate.desc())\
                         .offset((page-1)*PAGE_SIZE)\
                         .limit(PAGE_SIZE)\
                         .all()

        # 应用show过滤
        filtered_groups = []
        for g in pay_groups:
            paid = sum(p.payment for p in g.paypersonals if p.payDate)
            if show == 'unfinished' and paid < g.totalpayment:
                filtered_groups.append(g)
            elif show == 'finished' and paid >= g.totalpayment:
                filtered_groups.append(g)
            elif show == 'all':
                filtered_groups.append(g)

        result = [{
            'group_id': g.groupID,
            'total_payment': g.totalpayment,
            'created_date': g.createDate.isoformat(),
            'description': g.description,
            'club_id': g.clubID,
            'club_name': g.club.clubName if g.club else None,
            'paid_total': sum(p.payment for p in g.paypersonals if p.payDate),
            'unpaid': g.totalpayment - sum(p.payment for p in g.paypersonals if p.payDate),
            'status': 'finished' if sum(p.payment for p in g.paypersonals if p.payDate) >= g.totalpayment else 'unfinished'
        } for g in filtered_groups]

        return jsonify({
            'Flag': '4000',
            'message': '获取成功',
            'data': {
                'records': result,
                'pagination': {
                    'total_pages': total_pages,
                    'current_page': page,
                    'page_size': PAGE_SIZE,
                    'total_records': total
                }
            }
        })

    # 按月查询
    elif mode == 'month':
        pay_groups = query.order_by(PayGroup.createDate.desc()).all()
        
        result = []
        for group in pay_groups:
            paid = sum(p.payment for p in group.paypersonals if p.payDate)
            # 应用show过滤
            if show == 'unfinished' and paid < group.totalpayment:
                pass
            elif show == 'finished' and paid >= group.totalpayment:
                pass
            else:
                result.append({
                    'group_id': group.groupID,
                    'total_payment': group.totalpayment,
                    'created_date': group.createDate.isoformat(),
                    'description': group.description,
                    'club_id': group.clubID,
                    'club_name': group.club.clubName if group.club else None,
                    'paid_total': paid,
                    'unpaid': group.totalpayment - paid,
                    'status': 'finished' if paid >= group.totalpayment else 'unfinished',
                    'details': [{
                        'payor': {
                            'user_id': p.payor.userID,
                            'name': p.payor.userName,
                            'avatar': p.payor.avatar
                        },
                        'personal_payment': p.payment,
                        'pay_status': 'paid' if p.payDate else 'unpaid',
                        'pay_date': p.payDate.isoformat() if p.payDate else None
                    } for p in group.paypersonals]
                })
        
        return jsonify({
            'Flag': '4000',
            'message': '获取成功',
            'data': {
                'records': result,
                'year': year,
                'month': month,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            }
        })

    return jsonify({'Flag':'4001','message': '无效的mode参数'}), 200



@bp.route('/paypersonal/user_payable/list/<string:show>', methods=['GET'])
@jwt_required()
def get_user_payable(show):
    # 权限检查
    has_permission, message = check_permission(money.get_user_payable.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    mode = request.args.get('mode', 'page')
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    page = request.args.get('page', default=1, type=int)
    PAGE_SIZE = 10

    # 参数验证
    if show not in ['all', 'paid', 'unpaid']:
        return jsonify({'Flag':'4001','message': 'show参数必须是all/paid/unpaid'}), 200

    # 获取当前用户
    user_id = get_jwt_identity()
    cur_user = User.query.filter_by(userID=user_id).first()

    # Count模式处理
    if mode == 'count':
        base_query = PayPersonal.query.filter_by(payorID=cur_user.userID)
        
        if show == 'unpaid':
            count = base_query.filter_by(payDate=None).count()
            return jsonify({'Flag':'4000','data': {'count': count}})
        elif show == 'paid':
            count = base_query.filter(PayPersonal.payDate.isnot(None)).count()
            return jsonify({'Flag':'4000','data': {'count': count}})
        else:  # all
            total = base_query.count()
            unpaid = base_query.filter_by(payDate=None).count()
            return jsonify({
                'Flag':'4000',
                'data': {
                    'total_count': total,
                    'unpaid_count': unpaid,
                    'paid_count': total - unpaid
                }
            })

    # 构建基础查询
    query = PayPersonal.query.filter_by(payorID=cur_user.userID)
    
    # 应用show过滤
    if show == 'unpaid':
        query = query.filter_by(payDate=None)
    elif show == 'paid':
        query = query.filter(PayPersonal.payDate.isnot(None))

    # 按月模式处理
    if mode == 'month':
        if not year or not month:
            return jsonify({'Flag':'4001','message': '需要year和month参数'}), 200
        try:
            start_date = datetime(year, month, 1)
            end_date = datetime(year, month+1, 1) if month < 12 else datetime(year+1, 1, 1)
            query = query.filter(PayPersonal.createDate >= start_date, 
                               PayPersonal.createDate < end_date)
        except ValueError as e:
            return jsonify({'Flag':'4001','message': f'日期参数错误：{str(e)}'}), 200

        records = query.order_by(PayPersonal.createDate.desc()).all()
        
        result = [{
            'pay_id': r.payID,
            'create_date': r.createDate.isoformat(),
            'description': r.description,
            'payment': r.payment,
            'pay_date': r.payDate.isoformat() if r.payDate else None,
            'pay_status': 'paid' if r.payDate else 'unpaid',
            'group_info': {
                'group_id': r.paygroup.groupID,
                'club_name': r.paygroup.club.clubName if r.paygroup and r.paygroup.club else None
            } if r.paygroup else None
        } for r in records]

        return jsonify({
            'Flag': '4000',
            'data': {
                'records': result,
                'time_range': {
                    'year': year,
                    'month': month,
                    'start': start_date.isoformat(),
                    'end': end_date.isoformat()
                }
            }
        })

    # 分页模式处理
    elif mode == 'page':
        total = query.count()
        total_pages = (total + PAGE_SIZE - 1) // PAGE_SIZE

        paged_records = query.order_by(PayPersonal.createDate.desc())\
                            .offset((page-1)*PAGE_SIZE)\
                            .limit(PAGE_SIZE)\
                            .all()

        result = [{
            'pay_id': r.payID,
            'create_date': r.createDate.isoformat(),
            'description': r.description,
            'payment': r.payment,
            'pay_date': r.payDate.isoformat() if r.payDate else None,
            'pay_status': 'paid' if r.payDate else 'unpaid',
            'group_info': {
                'group_id': r.paygroup.groupID,
                'club_name': r.paygroup.club.clubName if r.paygroup and r.paygroup.club else None
            } if r.paygroup else None
        } for r in paged_records]

        return jsonify({
            'Flag': '4000',
            'data': {
                'records': result,
                'pagination': {
                    'total_pages': total_pages,
                    'current_page': page,
                    'page_size': PAGE_SIZE,
                    'total_records': total
                }
            }
        })

    return jsonify({'Flag':'4001','message': '无效的mode参数'}), 200


