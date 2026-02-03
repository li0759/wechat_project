from datetime import datetime
from .. import db

class Message(db.Model):
    __tablename__ = 'message'
    message_id = db.Column(db.Integer, primary_key=True, autoincrement=True, nullable=False)
    operation = db.Column(db.String(200), nullable=True)
    booker_id = db.Column(db.Integer, db.ForeignKey('user.userID'), nullable=False)
    text = db.Column(db.String(200), nullable=True)
    media = db.Column(db.String(200), nullable=True)
    url = db.Column(db.String(200), nullable=True)
    createDate = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    readDate = db.Column(db.DateTime)

    # 关系
    # 定义与User模型的关系，backref参数用于在User模型中创建一个notice属性，lazy参数用于指定加载方式
    booker = db.relationship('User', backref=db.backref('message', lazy=True))

    def __repr__(self):
        # 返回Notice模型的字符串表示，格式为<Message title>
        return f'<Message {self.title}>' 