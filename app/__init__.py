from flask import Flask, jsonify, request, send_from_directory, abort
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
import os
from .config import Config

# True用于本地测试, False用于微信开发测试
TEST_MODE = False

db = SQLAlchemy()

jwt = JWTManager()

# 自定义未认证或认证过期的错误响应
@jwt.unauthorized_loader
def custom_unauthorized_response(callback):
    return jsonify({'flag': 4001, 'message': '用户未认证或认证过期，须重新认证'}), 401

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    
    # 禁用访问日志
    import logging
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)

    # 初始化扩展
    db.init_app(app)
    jwt.init_app(app)

    CORS(app)

    # 注册CLI命令
    from .cli import register_commands
    register_commands(app)
    

    # 注册蓝图
    from .routes import auth, club, event, user, message, money, schedule, statistics, search, file, moment
    app.register_blueprint(auth.bp)
    app.register_blueprint(club.bp)
    app.register_blueprint(event.bp)
    app.register_blueprint(user.bp)
    app.register_blueprint(message.bp)
    app.register_blueprint(money.bp)
    app.register_blueprint(schedule.bp)
    app.register_blueprint(statistics.bp)
    app.register_blueprint(search.bp)
    app.register_blueprint(file.bp)
    app.register_blueprint(moment.bp)

    # 错误处理
    @app.errorhandler(404)
    def not_found_error(error):
        if request.path.startswith('/api/'):
            return jsonify({
                "error": "Not Found",
                "message": "The requested URL was not found on the server"
            }), 404
        try:
            return send_from_directory(os.path.join(app.static_folder, 'dist'), 'index.html')
        except:
            return jsonify({
                "error": "Not Found",
                "message": "Frontend files not found. Please run 'npm run build' first."
            }), 404

    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        return jsonify({
            "error": "Internal Server Error",
            "message": "An internal server error occurred"
        }), 500

    # 前端路由处理
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_frontend(path):
        """处理前端路由"""
        # 如果是API路由，返回404
        if path.startswith('api/'):
            abort(404)
        
        # 尝试服务静态文件
        dist_path = os.path.join(app.static_folder, 'dist', path)
        if os.path.exists(dist_path):
            return send_from_directory(os.path.join(app.static_folder, 'dist'), path)
        
        # 默认返回 index.html
        frontend_path = os.path.join(app.static_folder, 'dist', 'index.html')
        if os.path.exists(frontend_path):
            return send_from_directory(os.path.join(app.static_folder, 'dist'), 'index.html')
        
        # 如果前端文件不存在，返回404
        return jsonify({'error': 'Frontend files not found'}), 404

    # 启动自动化机制
    with app.app_context():
        from .routes.schedule import start_schedule_automation
        from .routes.user import start_user_sync_automation
        from .routes.auth import start_token_refresh_automation
        start_schedule_automation(app)
        start_user_sync_automation(app)
        start_token_refresh_automation(app)

    return app 