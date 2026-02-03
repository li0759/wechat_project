from app import db
from datetime import datetime

class User(db.Model):
    __tablename__ = 'user'
    
    userID = db.Column(db.Integer, primary_key=True, autoincrement=True)
    userName = db.Column(db.String(80), nullable=False)
    gender = db.Column(db.Integer, nullable=False)
    phone = db.Column(db.String(20), unique=True)
    email = db.Column(db.String(120), unique=True)
    passwordHash = db.Column(db.String(128), nullable=True)
    wecomUserID = db.Column(db.String(64), nullable=True)
    isSuperUser = db.Column(db.Boolean, nullable=False, default=False)
    createDate = db.Column(db.DateTime, default=datetime.utcnow)
    updateDate = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    department = db.Column(db.String(255))
    departmentID = db.Column(db.Integer)
    avatarID = db.Column(db.Integer, db.ForeignKey('file.fileID'))
    avatar = db.relationship('File', foreign_keys=[avatarID], backref='user')
    wecom_sess = db.Column(db.String(255), nullable=True)
    wecom_sess_expires = db.Column(db.DateTime, nullable=True)
    # OAuth相关字段
    position = db.Column(db.String(128))

    @property
    def get_user_roles(self):
        """获取用户角色列表"""
        roles = []
        
        # 超级用户角色
        if self.isSuperUser:
            roles.append("超级用户")
        
        # 处理管理员角色
        for cm in self.clubmembers:
            club = None
            if cm.role in ['president', 'vice_president', 'director']:
                club = getattr(cm, 'club_as_manager', None)
            elif cm.role == 'member':
                club = getattr(cm, 'club_as_member', None)
            
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
        if not roles and not self.isSuperUser:
            roles.append("普通用户")
            
        return roles
    
    def __repr__(self):
        return f'<User {self.userName}>' 