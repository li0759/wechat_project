from app import db
from datetime import datetime
from sqlalchemy.dialects.mysql import JSON  # 添加MySQL的JSON支持
from app.models.event import Event  # 导入Event模型

class Club(db.Model):
    __tablename__ = 'club'

    clubID = db.Column(db.Integer, primary_key=True, autoincrement=True, nullable=False)
    clubName = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.Text)
    charter = db.Column(db.Text)  # 协会章程
    isDelete = db.Column(db.Boolean, default=False)
    createDate = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updateDate = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    coverID = db.Column(db.Integer, db.ForeignKey('file.fileID'))
    cover = db.relationship('File', 
                              foreign_keys=[coverID],
                              backref='cover_ref_club', 
                              lazy=True, 
                              uselist=False)
    events = db.relationship('Event', backref='club', lazy=True)
    event_can_join = db.relationship('Event', primaryjoin="and_(Club.clubID==Event.clubID, Event.is_cancelled==False, Event.actual_endTime==None)", lazy=True, overlaps="club,events")
    clubApplications = db.relationship('ClubApplication', backref='club', lazy=True)
    members = db.relationship(
        'ClubMember',
        backref='club_as_member', 
        primaryjoin="and_(Club.clubID==ClubMember.clubID, ClubMember.role=='member', ClubMember.isDelete==False)",
        lazy=True
    )
    managers = db.relationship(
        'ClubMember',
        primaryjoin="and_(Club.clubID==ClubMember.clubID, ClubMember.role.in_(['president', 'vice_president', 'director']), ClubMember.isDelete==False)",
        backref=db.backref('club_as_manager', overlaps="club_as_member,members,club_as_president,president"),
        lazy=True,
        uselist=True,
        overlaps="club_as_member,members,club_as_president,president"
    )
    president = db.relationship(
        'ClubMember',
        primaryjoin="and_(Club.clubID==ClubMember.clubID, ClubMember.role=='president', ClubMember.isDelete==False)",
        backref=db.backref('club_as_president', overlaps="club_as_member,members,club_as_manager,managers"),
        lazy=True,
        uselist=False,
        overlaps="club_as_member,members,club_as_manager,managers"
    )
    
        
    
    def __repr__(self):
        return f'<Club {self.clubID}>' 

class ClubApplication(db.Model):
    __tablename__ = 'club_application'

    applicationID = db.Column(db.Integer, primary_key=True, autoincrement=True, nullable=False)
    clubID = db.Column(db.Integer, db.ForeignKey('club.clubID'), nullable=False)
    userID = db.Column(db.Integer, db.ForeignKey('user.userID'), nullable=False)
    approved = db.Column(db.Boolean)
    processedDate = db.Column(db.DateTime)# 审核时间
    applicatedDate = db.Column(db.DateTime, default=datetime.utcnow) # 申请时间
    processedBy = db.Column(db.Integer, db.ForeignKey('user.userID'), nullable=True)  # 审核人，允许为空
    opinion = db.Column(db.String(100))
    appliced_user = db.relationship('User', foreign_keys=[userID], backref='appliced_clubApplications', lazy=True)
    processed_user = db.relationship('User', foreign_keys=[processedBy], backref='processed_clubApplications', lazy=True)

class ClubMember(db.Model):
    __tablename__ = 'club_member'
    memberID = db.Column(db.Integer, primary_key=True, autoincrement=True, nullable=False)
    clubID = db.Column(db.Integer, db.ForeignKey('club.clubID'), nullable=False)
    userID = db.Column(db.Integer, db.ForeignKey('user.userID'), nullable=False)
    role = db.Column(db.String(80), default='member')  # member, admin
    joinDate = db.Column(db.DateTime, default=datetime.utcnow)  # 入会时间
    isDelete = db.Column(db.Boolean, nullable=False, default=False)
    user = db.relationship('User', backref='clubmembers', lazy=True)
    # 添加唯一约束确保用户在同一协会中只能有一条记录
    __table_args__ = (
        db.UniqueConstraint('userID', 'clubID', name='unique_user_club'),
    ) 