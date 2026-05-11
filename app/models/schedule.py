from app import db
from datetime import datetime
from sqlalchemy.dialects.mysql import JSON  # 添加MySQL的JSON支持

class Schedule(db.Model):
    __tablename__ = 'schedule'

    scheduleID = db.Column(db.Integer, primary_key=True, autoincrement=True, nullable=False)
    prototype_eventID = db.Column(db.Integer, db.ForeignKey('event.eventID'), nullable=False)
    startTime = db.Column(db.DateTime, default=datetime.utcnow)
    endTime = db.Column(db.DateTime, nullable=True)  # 为空表示日程还在执行，有值表示已终止
    schedule_type = db.Column(db.String(10), nullable=False, default='daily')
    time_config = db.Column(JSON)  # MySQL使用JSON类型
    advance_hours = db.Column(db.Integer, nullable=False, default=0)
    next_check_time = db.Column(db.DateTime)  # 优化查询性能
    
    # 关系定义
    # 与 ScheduleJoin 的关系 - 一个计划可以有多个用户参与
    scheduleJoins = db.relationship('ScheduleJoin', cascade='all, delete', backref='schedule', lazy=True)
    
    # 与 Event 的关系 - 一个计划可以有多个活动，明确指定外键
    schedule_events = db.relationship('Event', foreign_keys='Event.scheduleID', backref='schedule', lazy=True)
    
    # 与原型事件的关系 - 每个计划基于一个原型事件
    prototype_event = db.relationship('Event', foreign_keys=[prototype_eventID], backref='schedules_based_on', lazy=True)


class ScheduleJoin(db.Model):
    __tablename__ = 'schedule_join'

    joinID = db.Column(db.Integer, primary_key=True, autoincrement=True, nullable=False)
    scheduleID = db.Column(db.Integer, db.ForeignKey('schedule.scheduleID'), nullable=False)
    userID = db.Column(db.Integer, db.ForeignKey('user.userID'), nullable=False)
    joinDate = db.Column(db.DateTime, default=datetime.utcnow)
    
    # 关系定义
    # 与 User 的关系 - 每个参与记录对应一个用户
    user = db.relationship('User', backref='schedule_joins', lazy=True)
    
    # 添加唯一约束确保用户在同一计划中只能有一条记录
    __table_args__ = (
        db.UniqueConstraint('userID', 'scheduleID', name='unique_user_schedule'),
    ) 