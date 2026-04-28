from app import db
from datetime import datetime
from sqlalchemy.dialects.mysql import JSON  # 添加MySQL的JSON支持

class Event(db.Model):
    __tablename__ = 'event'

    eventID = db.Column(db.Integer, primary_key=True, autoincrement=True, nullable=False)
    clubID = db.Column(db.Integer, db.ForeignKey('club.clubID'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    coverID = db.Column(db.Integer, db.ForeignKey('file.fileID'))
    cover = db.relationship('File', 
                              foreign_keys=[coverID],
                              backref='cover_ref_event', 
                              lazy=True, 
                              uselist=False)
    message = db.Column(db.Text)
    location = db.Column(db.String(200))
    location_latitude = db.Column(db.Float)
    location_longitude = db.Column(db.Float)
    location_name = db.Column(db.String(200))
    location_address = db.Column(db.String(500))
    authorID = db.Column(db.Integer, db.ForeignKey('user.userID'), nullable=False)
    pre_startTime = db.Column(db.DateTime)
    pre_endTime = db.Column(db.DateTime)
    actual_startTime = db.Column(db.DateTime) 
    actual_endTime = db.Column(db.DateTime)
    createDate = db.Column(db.DateTime, default=datetime.utcnow)
    budget = db.Column(db.Float)
    real_cost = db.Column(db.Float)
    approveDate = db.Column(db.DateTime)
    scheduleID = db.Column(db.Integer, db.ForeignKey('schedule.scheduleID'), nullable=True)
    is_cancelled = db.Column(db.Boolean, default=False, nullable=False)
    # 关系
    # 定义与EventJoin模型的关系，backref参数用于在Event模型中创建一个eventjoin属性，lazy参数用于指定加载方式
    eventjoins = db.relationship('EventJoin', cascade='all, delete', backref='event', lazy=True)



class EventJoin(db.Model):
    __tablename__ = 'event_join'

    joinID = db.Column(db.Integer, primary_key=True, autoincrement=True, nullable=False)
    eventID = db.Column(db.Integer, db.ForeignKey('event.eventID'), nullable=False)
    userID = db.Column(db.Integer, db.ForeignKey('user.userID'))
    joinDate = db.Column(db.DateTime, default=datetime.utcnow)
    clockinDate = db.Column(db.DateTime)
    evaluate = db.Column(db.Text)
    rate = db.Column(db.Integer)
    user = db.relationship('User', backref='eventjoins', lazy=True)
        # 添加唯一约束确保用户在同一活动中只能有一条记录
    __table_args__ = (
        db.UniqueConstraint('userID', 'joinID', name='unique_user_event'),
    ) 