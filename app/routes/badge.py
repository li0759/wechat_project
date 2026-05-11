"""用户角标：单表 user_badge.badges JSON；GET/POST 独立蓝图。"""
from copy import deepcopy

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.orm.attributes import flag_modified

from ..models import User, Club, Message, ClubApplication, PayPersonal, UserBadge
from .. import db

bp = Blueprint('badge', __name__, url_prefix='/api/v1/badge')

_BADGE_SCALAR_KEYS = frozenset({
    'notice', 'joined_clubs', 'pending_my_applications', 'unpaid_payments',
    'my_events_prego', 'my_events_going', 'my_events_ended', 'my_events_cancelled',
    'managed_events_prego', 'managed_events_going', 'managed_events_ended', 'managed_events_cancelled',
})


def _badge_row(uid):
    r = UserBadge.query.filter_by(userID=uid).first()
    if not r:
        r = UserBadge(userID=uid, badges={})
        db.session.add(r)
        db.session.commit()
    if r.badges is None:
        r.badges = {}
    return r


def _merge_count_seen(prev_ent, new_count):
    prev_ent = prev_ent if isinstance(prev_ent, dict) else {}
    old = int(prev_ent.get('count') or 0)
    seen = bool(prev_ent.get('seen', True))
    new = int(new_count)
    if new > old:
        seen = False
    return {'count': new, 'seen': seen}


def _joined_event_ctx(cur_user):
    join_by_event, order = {}, []
    for ej in cur_user.eventjoins:
        if ej.event is None:
            continue
        eid = ej.event.eventID
        if eid not in join_by_event:
            order.append(eid)
        join_by_event[eid] = ej
    joined = [join_by_event[eid].event for eid in order]
    return join_by_event, joined


def _joined_clubs_count_match_user_joined_list(cur_user):
    """
    与 GET /club/user_joined/list 的条数语义一致：
    Club.members 的 backref 仅含 role=='member'，会长/理事等行的 club_as_member 常为 None，不会进入列表。
    """
    if not cur_user:
        return 0
    clubmembers = [m for m in cur_user.clubmembers if not getattr(m, 'isDelete', False)]
    clubs = [m.club_as_member for m in clubmembers if m.club_as_member is not None]
    return len([c for c in clubs if c and not getattr(c, 'isDelete', False)])


def _badge_payload(user_id):
    cur_user = User.query.filter_by(userID=user_id).first()
    if not cur_user:
        return {'badges': {}, 'counts_top': {'joined_clubs': 0, 'joined_events': 0, 'unpaid_payments': 0}}
    row = _badge_row(user_id)
    prev = deepcopy(row.badges) if isinstance(row.badges, dict) else {}
    unread = Message.query.filter_by(booker_id=user_id).filter(Message.readDate.is_(None)).count()
    jc = _joined_clubs_count_match_user_joined_list(cur_user)
    my_p = ClubApplication.query.filter_by(userID=user_id).filter(ClubApplication.processedDate.is_(None)).count()
    un = PayPersonal.query.filter_by(payorID=user_id).filter(PayPersonal.payDate.is_(None)).count()
    join_by_event, joined = _joined_event_ctx(cur_user)
    valid = [e for e in joined if e.club and not e.club.isDelete]

    def _ej_active(e):
        ej = join_by_event.get(e.eventID)
        return ej is not None and not getattr(ej, 'isDelete', False)

    prego = len([e for e in valid if _ej_active(e) and not e.actual_startTime and not e.is_cancelled])
    going = len([e for e in valid if _ej_active(e) and e.actual_startTime and not e.actual_endTime and not e.is_cancelled])
    ended = len([e for e in joined if e.actual_endTime])
    cancelled = len([
        e for e in joined
        if not e.actual_endTime and (
            e.is_cancelled or (join_by_event.get(e.eventID) and getattr(join_by_event[e.eventID], 'isDelete', False))
        )
    ])
    managed = []
    for m in cur_user.clubmembers:
        if m.role in ('president', 'vice_president', 'director'):
            c = Club.query.filter_by(clubID=m.clubID).first()
            if c and c.events:
                managed.extend(c.events)
    m_valid = [e for e in managed if e.club and not e.club.isDelete]
    m_prego = len([e for e in m_valid if not e.actual_startTime and not e.is_cancelled])
    m_going = len([e for e in m_valid if e.actual_startTime and not e.actual_endTime and not e.is_cancelled])
    m_ended = len([e for e in managed if e.actual_endTime])
    m_canc = len([e for e in managed if e.is_cancelled])
    admin_ids = [
        m.clubID for m in cur_user.clubmembers
        if not m.isDelete and m.role in ('president', 'vice_president', 'director')
    ]
    prev_nest = prev.get('club_pending_applications') if isinstance(prev.get('club_pending_applications'), dict) else {}
    nest = {}
    for cid in admin_ids:
        sid = str(int(cid))
        cnt = ClubApplication.query.filter_by(clubID=cid).filter(ClubApplication.processedDate.is_(None)).count()
        nest[sid] = _merge_count_seen(prev_nest.get(sid), cnt)
    b = {
        'notice': _merge_count_seen(prev.get('notice'), unread),
        'joined_clubs': _merge_count_seen(prev.get('joined_clubs'), jc),
        'pending_my_applications': _merge_count_seen(prev.get('pending_my_applications'), my_p),
        'unpaid_payments': _merge_count_seen(prev.get('unpaid_payments'), un),
        'my_events_prego': _merge_count_seen(prev.get('my_events_prego'), prego),
        'my_events_going': _merge_count_seen(prev.get('my_events_going'), going),
        'my_events_ended': _merge_count_seen(prev.get('my_events_ended'), ended),
        'my_events_cancelled': _merge_count_seen(prev.get('my_events_cancelled'), cancelled),
        'managed_events_prego': _merge_count_seen(prev.get('managed_events_prego'), m_prego),
        'managed_events_going': _merge_count_seen(prev.get('managed_events_going'), m_going),
        'managed_events_ended': _merge_count_seen(prev.get('managed_events_ended'), m_ended),
        'managed_events_cancelled': _merge_count_seen(prev.get('managed_events_cancelled'), m_canc),
        'club_pending_applications': nest,
    }
    row.badges = b
    flag_modified(row, 'badges')
    db.session.commit()
    return {'badges': b, 'counts_top': {'joined_clubs': jc, 'joined_events': going, 'unpaid_payments': un}}


def badge_mark_seen_impl():
    user_id = get_jwt_identity()
    body = request.get_json(silent=True) or {}
    keys = body.get('keys') or []
    club_ids = body.get('club_ids')
    if not isinstance(keys, list):
        return jsonify({'Flag': '4001', 'message': 'keys 须为数组'}), 200
    if club_ids is not None and not isinstance(club_ids, list):
        return jsonify({'Flag': '4001', 'message': 'club_ids 须为数组或省略'}), 200
    for k in keys:
        if k not in _BADGE_SCALAR_KEYS and k != 'club_pending_applications':
            return jsonify({'Flag': '4001', 'message': f'非法 key: {k}'}), 200
    row = _badge_row(user_id)
    b = deepcopy(row.badges) if isinstance(row.badges, dict) else {}
    for k in keys:
        if k == 'club_pending_applications':
            nest = b.get('club_pending_applications')
            if not isinstance(nest, dict):
                nest = {}
            if club_ids:
                for cid in club_ids:
                    sid = str(int(cid))
                    if sid in nest and isinstance(nest[sid], dict):
                        nest[sid]['seen'] = True
            else:
                for sid in nest:
                    if isinstance(nest[sid], dict):
                        nest[sid]['seen'] = True
            b['club_pending_applications'] = nest
        else:
            ent = b.get(k)
            if isinstance(ent, dict):
                ent['seen'] = True
                b[k] = ent
    row.badges = b
    flag_modified(row, 'badges')
    db.session.commit()
    return jsonify({'Flag': '4000', 'message': '调用成功', 'data': _badge_payload(user_id)})


@bp.route('', methods=['GET'])
@jwt_required()
def badge_get():
    return jsonify({'Flag': '4000', 'message': '调用成功', 'data': _badge_payload(get_jwt_identity())})


@bp.route('/seen', methods=['POST'])
@jwt_required()
def badge_seen():
    return badge_mark_seen_impl()
