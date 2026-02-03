from app import db
from datetime import datetime
from app.models.club import Club  # 导入Club模型，因为ClubFee引用了Club.clubID
from app.models.user import User  # 导入User模型，因为PayGroup和PayPersonnal引用了User.userID


class ClubFee(db.Model):
    __tablename__ = 'clubfee'

    feeID = db.Column(db.Integer, primary_key=True, autoincrement=True, nullable=False)
    clubID = db.Column(db.Integer, db.ForeignKey('club.clubID'), nullable=False)
    feement = db.Column(db.Float, nullable=False)
    createDate = db.Column(db.DateTime)
    description = db.Column(db.Text)
    # 关系
    # 定义与Club模型的关系，backref参数用于在Club模型中创建一个clubfee属性，lazy参数用于指定加载方式	
    club = db.relationship('Club', backref='clubfees', lazy=True)

class PayGroup(db.Model):
    __tablename__ = 'pay_group'

    groupID = db.Column(db.Integer, primary_key=True, autoincrement=True, nullable=False)
    totalpayment = db.Column(db.Float, nullable=False)
    createDate = db.Column(db.DateTime)
    payDate = db.Column(db.DateTime)
    creatorID = db.Column(db.Integer, db.ForeignKey('user.userID'))
    clubID = db.Column(db.Integer, db.ForeignKey('club.clubID'))
    eventID = db.Column(db.Integer, db.ForeignKey('event.eventID'))
    feeID = db.Column(db.Integer, db.ForeignKey('clubfee.feeID'))
    description = db.Column(db.Text)
    # 关系
    # 定义与PayPersonal模型的关系，backref参数用于在Fee模型中创建一个pay属性，lazy参数用于指定加载方式
    paypersonals = db.relationship('PayPersonal', backref=db.backref('paygroup', lazy=True))
    # 明确指定外键关系并添加反向引用
    paygroup_creator = db.relationship('User',  backref=db.backref('created_paygroups', lazy=True))
    # 添加俱乐部关系
    club = db.relationship('Club', backref=db.backref('paygroups', lazy=True))
    # 添加事件关系（假设Event模型存在）
    event = db.relationship('Event', backref=db.backref('paygroups', lazy=True))   
    # 添加会费关系
    club_fee = db.relationship('ClubFee', backref=db.backref('paygroups', lazy=True))

class PayPersonal(db.Model):
    __tablename__ = 'pay_personal'

    payID = db.Column(db.Integer, primary_key=True, autoincrement=True, nullable=False)
    payment = db.Column(db.Float, nullable=False)
    createDate = db.Column(db.DateTime)
    payDate = db.Column(db.DateTime)
    payorID = db.Column(db.Integer, db.ForeignKey('user.userID'), nullable=False)
    groupID = db.Column(db.Integer, db.ForeignKey('pay_group.groupID'), nullable=False)
    description = db.Column(db.Text)
    # 关系
    # 定义与User模型的关系，backref参数用于在User模型中创建一个paypersonal属性，lazy参数用于指定加载方式
    payor = db.relationship('User', backref=db.backref('paypersonal', lazy=True))

# 添加 Pay 模型（原 Pay_group 可能命名需要调整）
class Pay(db.Model):
    __tablename__ = 'pay'

    payID = db.Column(db.Integer, primary_key=True, autoincrement=True, nullable=False)
    totalpayment = db.Column(db.Float, nullable=False)
    createDate = db.Column(db.DateTime)
    payDate = db.Column(db.DateTime)
    creatorID = db.Column(db.Integer, db.ForeignKey('user.userID'), nullable=False)
    description = db.Column(db.Text)
    # 需要根据实际业务需求补充其他字段