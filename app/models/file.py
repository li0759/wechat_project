from app import db
from datetime import datetime

class File(db.Model):
    __tablename__ = 'file'

    fileID = db.Column(db.Integer, primary_key=True, autoincrement=True, nullable=False)
    uploaderID = db.Column(db.Integer, db.ForeignKey('user.userID'), nullable=False)  # 上传者
    originalName = db.Column(db.String(200), nullable=False)  # 原始文件名
    fileUrl = db.Column(db.String(1000), nullable=False)  # 完整的访问URL
    fileSize = db.Column(db.Integer, nullable=False)  # 文件大小（字节）
    fileType = db.Column(db.String(50), nullable=False)  # 文件类型/扩展名
    uploadTime = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)  # 上传时间
    
    # 关系定义，明确指定foreign_keys参数来避免歧义
    uploader = db.relationship('User', 
                              foreign_keys=[uploaderID],
                              backref=db.backref('uploaded_files'), 
                              lazy=True, 
                              uselist=False)
    


    def to_dict(self):
        """转换为字典格式"""
        return {
            'file_id': self.fileID,
            'uploader_id': self.uploaderID,
            'original_name': self.originalName,
            'file_url': self.fileUrl,
            'file_size': self.fileSize,
            'file_type': self.fileType,
            'upload_time': self.uploadTime.isoformat() if self.uploadTime else None,
        }

