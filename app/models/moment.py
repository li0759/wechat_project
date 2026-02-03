from app import db
from datetime import datetime
from sqlalchemy.dialects.mysql import JSON  # 添加MySQL的JSON支持

class Moment(db.Model):
    __tablename__ = 'moment'

    momentID = db.Column(db.Integer, primary_key=True, autoincrement=True)
    description = db.Column(db.Text, nullable=True)  # 动态描述
    imageIDs = db.Column(JSON)  # 图片ID数组，使用JSON格式存储
    createDate = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)  # 创建时间
    likeIDs = db.Column(JSON)  # 点赞用户ID数组，使用JSON格式存储
    creatorID = db.Column(db.Integer, db.ForeignKey('user.userID'), nullable=False)  # 创建者ID
    ref_event_ID = db.Column(db.Integer, db.ForeignKey('event.eventID'), nullable=True)
    ref_club_ID = db.Column(db.Integer, db.ForeignKey('club.clubID'), nullable=True)
    ref_event = db.relationship('Event', 
                             foreign_keys=[ref_event_ID],
                             backref=db.backref('moments'), 
                             lazy=True, 
                             uselist=False)
    ref_club = db.relationship('Club',  
                             foreign_keys=[ref_club_ID],
                             backref=db.backref('moments'), 
                             lazy=True, 
                             uselist=False)
    # 关系定义
    # 与 User 的关系 - 每个动态对应一个创建者
    creator = db.relationship('User', 
                             foreign_keys=[creatorID],
                             backref=db.backref('created_moments'), 
                             lazy=True, 
                             uselist=False)
    
    # 与 File 的关系 - 通过imageIDs关联多个文件
    # 使用属性方法来获取图片文件，返回JSON对象
    @property
    def image_files(self):
        """获取动态相关的图片文件信息，返回JSON对象"""
        if not self.imageIDs:
            return []
        
        from app.models.file import File
        files = File.query.filter(File.fileID.in_(self.imageIDs)).all()
        return [file for file in files]


    def get_image_files(self):
        """获取动态相关的图片文件信息 - 直接返回JSON对象"""
        return self.image_files

    def get_liked_users(self):
        """获取点赞用户信息"""
        if not self.likeIDs:
            return []
        
        from app.models.user import User
        users = User.query.filter(User.userID.in_(self.likeIDs)).all()
        return [{
            'userID': user.userID,
            'userName': user.userName,
            'avatar': user.avatar.fileUrl if user.avatar else None
        } for user in users]


    def is_liked_by_user(self, user_id):
        """检查用户是否已点赞"""
        if self.likeIDs:
            return user_id in self.likeIDs 
        return False

    def to_dict(self):
        """转换为字典格式"""
        return {
            'momentID': self.momentID,
            'description': self.description,
            'imageIDs': self.imageIDs,
            'createDate': self.createDate.isoformat() if self.createDate else None,
            'likeIDs': self.likeIDs,
            'creatorID': self.creatorID,
            'ref_event_ID': self.ref_event_ID,
            'ref_club_ID': self.ref_club_ID,
            'creator': {
                'userID': self.creator.userID,
                'userName': self.creator.userName,
                'avatar': self.creator.avatar.fileUrl if self.creator.avatar else None
            } if self.creator else None,
            'ref_event': {
                'eventID': self.ref_event.eventID,
                'title': self.ref_event.title
            } if self.ref_event else None,
            'ref_club': {
                'clubID': self.ref_club.clubID,
                'clubName': self.ref_club.clubName
            } if self.ref_club else None,
            'image_files': [
                {
                    'fileID': file.fileID,
                    'originalName': file.originalName,
                    'fileUrl': file.fileUrl,
                    'fileSize': file.fileSize,
                    'fileType': file.fileType
                } for file in self.image_files
            ] if self.image_files else []
        }
    
