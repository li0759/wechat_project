from flask import Flask, jsonify, request, send_from_directory, abort
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import os
import logging
from .config import config

# True用于本地测试, False用于微信开发测试
TEST_MODE = False

db = SQLAlchemy()

jwt = JWTManager()

# 初始化限流器（延迟初始化）
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://"
)

# 自定义未认证或认证过期的错误响应
@jwt.unauthorized_loader
def custom_unauthorized_response(callback):
    return jsonify({'flag': 4001, 'message': '用户未认证或认证过期，须重新认证'}), 401

def create_app(config_name=None):
    app = Flask(__name__)
    
    # 根据环境变量选择配置
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'development')
    
    app.config.from_object(config[config_name])
    config[config_name].init_app(app)
    
    # 配置日志
    if app.config['ENV'] == 'production':
        # 生产环境：只记录错误
        logging.basicConfig(level=logging.ERROR)
        log = logging.getLogger('werkzeug')
        log.setLevel(logging.ERROR)
    else:
        # 开发环境：记录所有信息
        logging.basicConfig(level=logging.INFO)

    # 初始化扩展
    db.init_app(app)
    jwt.init_app(app)
    limiter.init_app(app)

    # CORS配置 - 根据环境区分
    if app.config['ENV'] == 'production':
        # 生产环境：限制来源
        allowed_origins = os.environ.get('ALLOWED_ORIGINS', 'https://www.vhhg.top').split(',')
        CORS(app, 
             origins=allowed_origins,
             supports_credentials=True,
             max_age=3600)
    else:
        # 开发环境：允许所有来源
        CORS(app)
    
    # 安全响应头中间件
    @app.after_request
    def add_security_headers(response):
        """添加安全响应头"""
        # 防止点击劫持
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        # 防止MIME类型嗅探
        response.headers['X-Content-Type-Options'] = 'nosniff'
        # XSS保护
        response.headers['X-XSS-Protection'] = '1; mode=block'
        # 仅在生产环境启用HSTS
        if app.config['ENV'] == 'production':
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        # CSP策略（根据需要调整）
        if app.config['ENV'] == 'production':
            response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
        return response

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
        # 生产环境不泄露详细错误信息
        if app.config['ENV'] == 'production':
            app.logger.error(f"Internal error: {str(error)}")
            return jsonify({
                "error": "Internal Server Error",
                "message": "An internal server error occurred"
            }), 500
        else:
            # 开发环境显示详细错误
            return jsonify({
                "error": "Internal Server Error",
                "message": str(error)
            }), 500
    
    @app.errorhandler(429)
    def ratelimit_handler(e):
        """限流错误处理"""
        return jsonify({
            "error": "Too Many Requests",
            "message": "请求过于频繁，请稍后再试"
        }), 429

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