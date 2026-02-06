import os
import secrets
from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv

# 获取项目根目录
basedir = Path(__file__).parent.parent

# 加载.env文件
load_dotenv(basedir / '.env')


class Config:
    """基础配置类"""
    
    # 环境配置
    ENV = os.environ.get('FLASK_ENV', 'development')
    DEBUG = os.environ.get('DEBUG', 'False').lower() == 'true'
    
    # MySQL 数据库配置 - 优先使用环境变量
    MYSQL_USER = os.environ.get('MYSQL_USER') or 'navicat'
    MYSQL_PASSWORD = os.environ.get('MYSQL_PASSWORD') or 'navicat_2024'
    MYSQL_HOST = os.environ.get('MYSQL_HOST') or 'localhost'
    MYSQL_PORT = os.environ.get('MYSQL_PORT') or '3306'
    MYSQL_DB = os.environ.get('MYSQL_DB') or 'manage_mate'
    
    # 构建数据库URI
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
        f'mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DB}?charset=utf8mb4'
    
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # 数据库连接池配置（生产环境优化）
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 10,
        'pool_recycle': 3600,
        'pool_pre_ping': True,
        'max_overflow': 20,
        'pool_timeout': 30
    }
    
    # Flask配置
    SECRET_KEY = os.environ.get('SECRET_KEY') or secrets.token_urlsafe(32)
    
    # 企业微信配置 - 生产环境必须从环境变量读取
    WECOM_CORP_ID = os.environ.get('WECOM_CORP_ID')
    WECOM_AGENT_ID = os.environ.get('WECOM_AGENT_ID')
    WECOM_SECRET = os.environ.get('WECOM_SECRET')
    WECOM_TOKEN = None
    
    # JWT配置 - 使用环境变量或安全的随机密钥
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or secrets.token_urlsafe(32)
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=int(os.environ.get('JWT_EXPIRES_MINUTES', 20)))
    
    # 文件上传配置
    UPLOAD_FOLDER = basedir / 'uploaded'
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'rar'}
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB 上传限制 

    # 分块上传配置
    CHUNK_SIZE = 1024 * 1024  # 1MB
    MAX_CHUNKS = 100
    
    # MinIO配置 - 生产环境必须从环境变量读取
    MINIO_ENDPOINT = os.environ.get('MINIO_ENDPOINT') or '127.0.0.1:9000'
    MINIO_ACCESS_KEY = os.environ.get('MINIO_ACCESS_KEY') or 'admin'
    MINIO_SECRET_KEY = os.environ.get('MINIO_SECRET_KEY') or 'ZJkgz@2025MinIO'
    MINIO_SECURE = os.environ.get('MINIO_SECURE', 'False').lower() == 'true'
    MINIO_BUCKET = os.environ.get('MINIO_BUCKET') or 'manage-mate'
    
    # 基础URL配置（用于生成完整的文件访问URL）
    BASE_URL = os.environ.get('BASE_URL') or 'https://www.vhhg.top'
    
    # Geoapify 地图API配置
    GEOAPIFY_API_KEY = os.environ.get('GEOAPIFY_API_KEY') or 'b8568cb9afc64fad861a69edbddb2658'
    
    @classmethod
    def init_app(cls, app):
        """初始化应用配置"""
        pass


class DevelopmentConfig(Config):
    """开发环境配置"""
    DEBUG = True
    ENV = 'development'
    
    # 开发环境JWT有效期更长，方便调试
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=7)
    
    # 开发环境企业微信配置为空（避免启动时的无效请求）
    # 如需测试企业微信功能，请在 .env 文件中设置实际值
    WECOM_CORP_ID = os.environ.get('WECOM_CORP_ID') or None
    WECOM_AGENT_ID = os.environ.get('WECOM_AGENT_ID') or None
    WECOM_SECRET = os.environ.get('WECOM_SECRET') or None


class ProductionConfig(Config):
    """生产环境配置"""
    DEBUG = False
    ENV = 'production'
    
    # 生产环境强制HTTPS
    MINIO_SECURE = True
    
    # 生产环境JWT有效期短
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    
    @classmethod
    def init_app(cls, app):
        """生产环境初始化 - 验证必需的环境变量"""
        Config.init_app(app)
        
        # 验证生产环境必需的敏感配置
        required_vars = [
            'SECRET_KEY',
            'JWT_SECRET_KEY',
            'WECOM_SECRET',
            'MINIO_SECRET_KEY'
        ]
        
        missing_vars = []
        for var in required_vars:
            if not os.environ.get(var):
                missing_vars.append(var)
        
        if missing_vars:
            import warnings
            warnings.warn(
                f"⚠️  生产环境警告: 以下环境变量未设置，正在使用默认值（不安全）: {', '.join(missing_vars)}\n"
                f"请在生产环境中设置这些环境变量以确保安全性。",
                UserWarning
            )


# 配置字典
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
} 
