import os
import secrets
from pathlib import Path
from dotenv import load_dotenv

# 获取项目根目录
basedir = Path(__file__).parent.parent

# 加载.env文件
load_dotenv(basedir / '.env')

class Config:
 
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
    
    # Flask配置
    SECRET_KEY = os.environ.get('SECRET_KEY') or secrets.token_urlsafe(32)
    
    # 企业微信配置
    WECOM_CORP_ID = 'wwf6bdecdbde4495c5'
    WECOM_AGENT_ID = '1000002'
    WECOM_SECRET = '7mqD-yj2BbLWxw7egrWa8ELKb5-SyI5CO7lgH_ZQ70k'
    WECOM_TOKEN = None
    
    
    # JWT配置 - 使用环境变量或安全的随机密钥
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or secrets.token_urlsafe(32)
    JWT_ACCESS_TOKEN_EXPIRES = 60 * 20 # 20minutes 
    
    # 文件上传配置
    UPLOAD_FOLDER = basedir / 'uploaded'
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'rar'}
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB 上传限制 

    # 分块上传配置
    CHUNK_SIZE = 1024 * 1024  # 1MB
    MAX_CHUNKS = 100
    
    # MinIO配置
    MINIO_ENDPOINT = '127.0.0.1:9000'  # MinIO服务地址
    MINIO_ACCESS_KEY = 'admin'         # MinIO访问密钥
    MINIO_SECRET_KEY = 'ZJkgz@2025MinIO'  # MinIO秘密密钥
    MINIO_SECURE = False               # 是否使用HTTPS
    MINIO_BUCKET = 'manage-mate'       # 默认存储桶名称 
    
    # 基础URL配置（用于生成完整的文件访问URL）
    BASE_URL = 'https://www.vhhg.top' 
    
    # Geoapify 地图API配置
    GEOAPIFY_API_KEY = os.environ.get('GEOAPIFY_API_KEY') or 'b8568cb9afc64fad861a69edbddb2658' 
