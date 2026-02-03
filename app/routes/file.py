from flask import Blueprint, request, jsonify, current_app, send_file, Response
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request
from werkzeug.utils import secure_filename
import os
import uuid
import time
from datetime import datetime, timedelta
from minio import Minio
from minio.error import S3Error
import io
import hashlib
import re
from PIL import Image
from app.permission import check_permission, file, event, club
from app import db
from app.models import Event, User, ClubMember, EventJoin, Club, Schedule, File

bp = Blueprint('file', __name__, url_prefix='/api/v1/file')

# 允许的文件扩展名（添加Excel文件支持）
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'xlsx', 'xls', 'csv'}

def allowed_file(filename):
    """检查文件类型是否允许"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def generate_safe_filename(original_filename):
    """生成安全的文件名，包含完整的存储路径"""
    # 获取文件扩展名
    ext = ''
    if '.' in original_filename:
        ext = '.' + original_filename.rsplit('.', 1)[1].lower()
    
    # 生成安全文件名：日期目录 + 时间戳 + UUID + 扩展名
    date_path = datetime.now().strftime('%Y/%m/%d')
    timestamp = str(int(time.time()))
    unique_id = str(uuid.uuid4())[:8]
    return f"{date_path}/{timestamp}_{unique_id}{ext}"

def get_minio_client():
    """获取MinIO客户端"""
    try:
        return Minio(
            current_app.config['MINIO_ENDPOINT'],
            access_key=current_app.config['MINIO_ACCESS_KEY'],
            secret_key=current_app.config['MINIO_SECRET_KEY'],
            secure=current_app.config['MINIO_SECURE']
        )
    except Exception as e:
        current_app.logger.error(f"MinIO客户端初始化失败: {str(e)}")
        raise


def ensure_bucket_exists(client, bucket_name):
    """确保bucket存在"""
    try:
        if not client.bucket_exists(bucket_name):
            client.make_bucket(bucket_name)
            current_app.logger.info(f"创建bucket: {bucket_name}")
    except S3Error as e:
        current_app.logger.error(f"创建bucket失败: {str(e)}")
        raise

@bp.route('/upload_file', methods=['POST'])
@jwt_required()
def upload_file():
    """
    文件上传接口
    
    流程：
    1. 前端上传文件到Flask
    2. Flask验证文件并生成安全文件名
    3. 上传到MinIO并返回完整访问URL
    4. 记录文件上传信息（新增）
    """
    # 权限检查
    has_permission, message = check_permission(file.upload_file.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    try:
        # 获取当前用户ID
        user_id = get_jwt_identity()

        # 检查是否有文件
        if 'file' not in request.files:
            return jsonify({
                'Flag': 4001,
                'message': '没有文件被上传'
            }), 400
        
        file_upload = request.files['file']
        
        # 检查文件名
        if file_upload.filename == '':
            return jsonify({
                'Flag': 4001,
                'message': '没有选择文件'
            }), 400
        
        # 检查文件类型
        if not allowed_file(file_upload.filename):
            return jsonify({
                'Flag': 4001,
                'message': f'不支持的文件类型，仅支持: {", ".join(ALLOWED_EXTENSIONS)}'
            }), 400
        
        # 检查文件大小（默认限制16MB）
        file_upload.seek(0, os.SEEK_END)
        file_size = file_upload.tell()
        file_upload.seek(0)  # 重置文件指针
        
        max_size = current_app.config.get('MAX_CONTENT_LENGTH', 16 * 1024 * 1024)
        if file_size > max_size:
            return jsonify({
                'Flag': 4001,
                'message': f'文件大小超过限制（最大{max_size // (1024*1024)}MB）'
            }), 400
        
        # 生成安全的文件名
        original_filename = secure_filename(file_upload.filename)
        safe_filename = generate_safe_filename(original_filename)
        
        # 获取MinIO客户端
        minio_client = get_minio_client()
        bucket_name = current_app.config.get('MINIO_BUCKET', 'manage-mate')
        
        # 确保bucket存在
        ensure_bucket_exists(minio_client, bucket_name)
        
        # 上传到MinIO
        file_data = io.BytesIO(file_upload.read())
        file_data.seek(0)
        
        # 设置content type
        file_extension = safe_filename.split('.')[-1].lower()
        content_type = "application/octet-stream"  # 默认二进制流类型
        
        # 图片类型
        if file_extension in ['jpg', 'jpeg']:
            content_type = "image/jpeg"
        elif file_extension == 'png':
            content_type = "image/png"
        elif file_extension == 'gif':
            content_type = "image/gif"
        elif file_extension == 'bmp':
            content_type = "image/bmp"
        elif file_extension == 'webp':
            content_type = "image/webp"
        # Office 文档类型
        elif file_extension == 'xlsx':
            content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        elif file_extension == 'xls':
            content_type = 'application/vnd.ms-excel'
        elif file_extension == 'csv':
            content_type = 'text/csv'
        elif file_extension == 'pdf':
            content_type = 'application/pdf'
        elif file_extension == 'docx':
            content_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        elif file_extension == 'doc':
            content_type = 'application/msword'
        elif file_extension == 'pptx':
            content_type = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        elif file_extension == 'ppt':
            content_type = 'application/vnd.ms-powerpoint'
        # 文本类型
        elif file_extension == 'txt':
            content_type = 'text/plain'
        elif file_extension == 'json':
            content_type = 'application/json'
        elif file_extension == 'xml':
            content_type = 'application/xml'
        # 压缩文件
        elif file_extension == 'zip':
            content_type = 'application/zip'
        elif file_extension == 'rar':
            content_type = 'application/x-rar-compressed'
        elif file_extension == '7z':
            content_type = 'application/x-7z-compressed'
        # 音视频
        elif file_extension == 'mp4':
            content_type = 'video/mp4'
        elif file_extension == 'avi':
            content_type = 'video/x-msvideo'
        elif file_extension == 'mov':
            content_type = 'video/quicktime'
        elif file_extension == 'mp3':
            content_type = 'audio/mpeg'
        elif file_extension == 'wav':
            content_type = 'audio/wav'
        
        minio_client.put_object(
            bucket_name,
            safe_filename,
            file_data,
            length=file_size,
            content_type=content_type
        )
        
        # 生成完整的访问URL
        # 格式：https://www.vhhg.top/api/v1/file/download/年/月/日/时间戳_uuid.ext
        base_url = current_app.config.get('BASE_URL', 'https://www.vhhg.top')
        file_url = f"{base_url}/api/v1/file/download/{safe_filename}"
        
        # 设置content type
        file_extension = safe_filename.split('.')[-1].lower()
        fileType = f"image/{file_extension}"
        if file_extension in ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']:
            fileType = "image"
        elif file_extension in {'xlsx', 'xls'}:
            fileType = 'excel'
        elif file_extension == 'csv':
            fileType = 'csv'
        elif file_extension == 'pdf':
            fileType = 'pdf'
        elif file_extension in ['docx', 'doc']:
            fileType = 'word'
        elif file_extension in ['pptx', 'ppt']:
            fileType = 'ppt'
        elif file_extension in ['txt', 'md']:
            fileType = 'txt'
        elif file_extension in ['zip', 'rar', '7z']:
            fileType = 'zip'
        elif file_extension in ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mp3', 'wav', 'm4a', 'ogg', 'aac']:
            fileType = 'video'

        # 记录文件上传信息到数据库
        upload_record = File(
            uploaderID=user_id,
            originalName=original_filename,
            fileUrl=file_url,
            fileSize=file_size,
            fileType=fileType,
        )
        db.session.add(upload_record)
        db.session.commit()
        
        # 记录上传信息
        current_app.logger.info(f"文件上传成功: {safe_filename}, 大小: {file_size}字节, 上传者: {user_id}")
        
        return jsonify({
            'Flag': 4000,
            'message': '文件上传成功',
            'data': {
                'file_url': file_url,  # 返回访问URL
                'original_name': original_filename,
                'size': file_size,
                'upload_time': datetime.now().isoformat(),
                'file_id': upload_record.fileID,  # 返回记录ID，用于后续管理
                'uploader_id': upload_record.uploaderID,
                'uploader_name': upload_record.uploader.userName,
                'uploader_avatar': upload_record.uploader.avatar.fileUrl if upload_record.uploader.avatar else None
            }
        })
        
    except S3Error as e:
        current_app.logger.error(f"MinIO上传失败: {str(e)}")
        return jsonify({
            'Flag': 4002,
            'message': f'存储服务错误: {str(e)}'
        }), 500
    except Exception as e:
        current_app.logger.error(f"文件上传失败: {str(e)}")
        return jsonify({
            'Flag': 4002,
            'message': f'文件上传失败: {str(e)}'
        }), 500


@bp.route('/create_by_url', methods=['POST'])
@jwt_required()
def create_by_url():
    """
    通过URL直接创建文件记录

    请求体(JSON):
    {
        "url": "必填，文件可访问URL",
        "original_name": "可选，覆盖推断的文件名",
        "file_size": 12345  可选，单位字节
    }
    """
    # 权限检查：沿用上传权限
    has_permission, message = check_permission(file.upload_file.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    try:
        user_id = get_jwt_identity()
        payload = request.get_json(silent=True) or {}

        file_url = payload.get('url', '').strip()
        if not file_url:
            return jsonify({'Flag': 4001, 'message': '缺少url参数'}), 400

        # 简单校验URL格式
        if not re.match(r'^https?://', file_url):
            return jsonify({'Flag': 4001, 'message': 'url必须为http或https链接'}), 400

        # 提取文件名与扩展名
        url_path = file_url.split('?')[0]
        filename_from_url = url_path.rstrip('/').split('/')[-1] if '/' in url_path else ''
        original_name = payload.get('original_name') or filename_from_url or f"file_{uuid.uuid4().hex[:8]}"

        ext = ''
        if '.' in original_name:
            ext = original_name.rsplit('.', 1)[1].lower()

        # 检查扩展名是否允许（与上传保持一致）
        if ext and ext not in ALLOWED_EXTENSIONS:
            return jsonify({'Flag': 4001, 'message': f'不支持的文件类型，仅支持: {", ".join(ALLOWED_EXTENSIONS)}'}), 400

        # 推断文件类型（与上传逻辑对齐）
        fileType = f"image/{ext}" if ext else 'file'
        if ext in ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']:
            fileType = 'image'
        elif ext in {'xlsx', 'xls'}:
            fileType = 'excel'
        elif ext == 'csv':
            fileType = 'csv'
        elif ext == 'pdf':
            fileType = 'pdf'
        elif ext in ['docx', 'doc']:
            fileType = 'word'
        elif ext in ['pptx', 'ppt']:
            fileType = 'ppt'
        elif ext in ['txt', 'md']:
            fileType = 'txt'
        elif ext in ['zip', 'rar', '7z']:
            fileType = 'zip'
        elif ext in ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mp3', 'wav', 'm4a', 'ogg', 'aac']:
            fileType = 'video'

        # 文件大小（可选）
        file_size = payload.get('file_size')
        try:
            file_size = int(file_size) if file_size is not None else 0
            if file_size < 0:
                file_size = 0
        except Exception:
            file_size = 0

        # 创建数据库记录
        record = File(
            uploaderID=user_id,
            originalName=original_name,
            fileUrl=file_url,
            fileSize=file_size,
            fileType=fileType,
        )
        db.session.add(record)
        db.session.commit()

        return jsonify({
            'Flag': 4000,
            'message': '创建文件记录成功',
            'data': {
                'file_url': record.fileUrl,
                'original_name': record.originalName,
                'size': record.fileSize,
                'upload_time': datetime.now().isoformat(),
                'file_id': record.fileID,
                'uploader_id': record.uploaderID,
                'uploader_name': record.uploader.userName if getattr(record, 'uploader', None) else None,
                'uploader_avatar': record.uploader.avatar.fileUrl if getattr(record, 'uploader', None) and getattr(record.uploader, 'avatar', None) else None
            }
        })
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"创建URL文件记录失败: {str(e)}")
        return jsonify({'Flag': 4002, 'message': f'创建文件记录失败: {str(e)}'}), 500


# 通用文件删除接口
def delete_file_inside(file_id):
    """
    根据文件ID删除文件的函数版本
    供其他路由文件调用，返回删除结果字典
    """
    try:
        # 查找文件记录
        file_record = File.query.filter_by(fileID=file_id).first()
        if not file_record:
            return {'success': False, 'message': '文件不存在'}
        
        # 从fileUrl中提取文件路径
        file_path = None
        if file_record.fileUrl and '/api/v1/file/download/' in file_record.fileUrl:
            file_path = file_record.fileUrl.split('/api/v1/file/download/')[-1]
        
        # 获取MinIO客户端并删除文件
        if file_path:
            try:
                minio_client = get_minio_client()
                bucket_name = current_app.config.get('MINIO_BUCKET', 'manage-mate')
                minio_client.remove_object(bucket_name, file_path)
            except Exception as e:
                current_app.logger.warning(f"从MinIO删除文件失败: {file_path}, 错误: {str(e)}")
        
        # 从数据库中删除记录
        db.session.delete(file_record)
        db.session.commit()
        
        return {'success': True, 'message': '文件删除成功'}
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"文件删除失败: fileID={file_id}, 错误: {str(e)}")
        return {'success': False, 'message': f'文件删除失败: {str(e)}'}

@bp.route('/delete_file/<int:file_id>', methods=['GET'])
@jwt_required()
def delete_file(file_id):
    """
    根据文件ID删除文件
    同时从数据库和MinIO中删除文件
    """
    # 权限检查
    has_permission, message = check_permission(file.delete_file.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    try:
        # 查找文件记录
        file_record = File.query.filter_by(fileID=file_id).first()
        if not file_record:
            return jsonify({
                'Flag': 4001,
                'message': '文件不存在'
            }), 404
        
        # 从fileUrl中提取文件路径
        file_path = None
        if file_record.fileUrl and '/api/v1/file/download/' in file_record.fileUrl:
            file_path = file_record.fileUrl.split('/api/v1/file/download/')[-1]
        
        # 获取MinIO客户端
        minio_client = get_minio_client()
        bucket_name = current_app.config.get('MINIO_BUCKET', 'manage-mate')
        
        # 从MinIO删除文件
        if file_path:
            try:
                minio_client.remove_object(bucket_name, file_path)
                current_app.logger.info(f"从MinIO删除文件: {file_path}")
            except Exception as e:
                current_app.logger.warning(f"从MinIO删除文件失败: {file_path}, 错误: {str(e)}")
                # 即使MinIO删除失败，也继续删除数据库记录
        
        # 从数据库中删除记录
        db.session.delete(file_record)
        db.session.commit()
        
        current_app.logger.info(f"文件删除成功: fileID={file_id}, 文件名={file_record.originalName}")
        
        return jsonify({
            'Flag': 4000,
            'message': '文件删除成功',
            'data': {
                'file_id': file_id,
                'original_name': file_record.originalName,
                'file_url': file_record.fileUrl,
                'deleted_from_minio': file_path is not None
            }
        })
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"文件删除失败: fileID={file_id}, 错误: {str(e)}")
        return jsonify({
            'Flag': 4002,
            'message': f'文件删除失败: {str(e)}'
        }), 500








@bp.route('/download/tmp/<path:file_path>', methods=['GET'])
def download_tmp_file(file_path):
    """
    临时文件下载接口（下载后自动删除）
    
    用于所有需要下载后自动清理的临时文件
    下载完成后会自动从MinIO中删除文件
    """
    try:
        # 检查文件扩展名
        file_extension = file_path.split('.')[-1].lower() if '.' in file_path else ''
        is_allowed = file_extension in ALLOWED_EXTENSIONS
        
        if not is_allowed:
            return jsonify({'error': '不支持的文件类型'}), 400
        
        # 判断是否为图片文件（图片允许公开访问，保持与 /download 一致）
        image_extensions = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'}
        is_image_file = file_extension in image_extensions

        # 对非图片文件进行JWT验证
        if not is_image_file:
            try:
                # 验证JWT token
                verify_jwt_in_request()
                user_id = get_jwt_identity()
                
                # 权限检查：检查是否有下载文件的权限
                has_permission, message = check_permission(file.download_file.permission_judge)
                
                if not has_permission:
                    return jsonify({'error': message}), 403
                    
            except Exception as e:
                current_app.logger.error(f"JWT验证失败: {str(e)}")
                return jsonify({'error': '身份验证失败'}), 401
        
        # 获取MinIO客户端
        minio_client = get_minio_client()
        bucket_name = current_app.config.get('MINIO_BUCKET', 'manage-mate')
        
        # 检查文件是否存在
        try:
            file_info = minio_client.stat_object(bucket_name, file_path)
            file_size = file_info.size
            # 设置正确的content_type
            if file_extension in {'xlsx', 'xls'}:
                content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            elif file_extension == 'csv':
                content_type = 'text/csv'
            else:
                content_type = file_info.content_type or 'application/octet-stream'
        except S3Error as e:
            if e.code == 'NoSuchKey':
                current_app.logger.error(f"临时文件不存在: bucket={bucket_name}, path={file_path}")
                return jsonify({'error': '文件不存在'}), 404
            current_app.logger.error(f"MinIO错误: {str(e)}, bucket={bucket_name}, path={file_path}")
            return jsonify({'error': '存储服务错误'}), 500
        
        # 提取文件名并设置Content-Disposition
        filename = file_path.split('/')[-1]
        disposition = f'attachment; filename="{filename}"'

        # 获取完整文件
        try:
            file_data = minio_client.get_object(bucket_name, file_path)
            
            # 保存MinIO配置，用于后续清理操作
            minio_config = {
                'endpoint': current_app.config['MINIO_ENDPOINT'],
                'access_key': current_app.config['MINIO_ACCESS_KEY'],
                'secret_key': current_app.config['MINIO_SECRET_KEY'],
                'secure': current_app.config['MINIO_SECURE'],
                'bucket': bucket_name
            }
            
            def generate():
                try:
                    for chunk in file_data:
                        yield chunk
                finally:
                    file_data.close()
                    # 下载完成后自动清理临时文件
                    try:
                        cleanup_minio_client = Minio(
                            minio_config['endpoint'],
                            access_key=minio_config['access_key'],
                            secret_key=minio_config['secret_key'],
                            secure=minio_config['secure']
                        )
                        cleanup_minio_client.remove_object(minio_config['bucket'], file_path)
                    except Exception as cleanup_error:
                        print(f"清理临时文件失败: {file_path}, 错误: {str(cleanup_error)}")
            
            response = Response(
                generate(),
                200,
                mimetype=content_type,
                headers={
                    'Content-Length': str(file_size),
                    'Accept-Ranges': 'bytes',
                    'Content-Disposition': disposition
                }
            )
            
            return response
        except Exception as e:
            return jsonify({'error': 'Failed to get file'}), 500
            
    except Exception as e:
        current_app.logger.error(f"临时文件下载失败: {str(e)}")
        return jsonify({'error': 'Download failed'}), 500

@bp.route('/download/<path:file_path>', methods=['GET'])
def download_file(file_path):
    """
    文件下载接口
    
    流程：
    1. 检查文件类型
    2. 对于图片文件：公开访问
    3. 对于其他文件：需要JWT验证
    4. 代理下载（支持Range请求）
    """
    try:
        # 检查文件扩展名
        file_extension = file_path.split('.')[-1].lower() if '.' in file_path else ''
        is_allowed = file_extension in ALLOWED_EXTENSIONS
        
        if not is_allowed:
            return jsonify({'error': '不支持的文件类型'}), 400
        
        # 判断是否为图片文件
        image_extensions = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'}
        is_image_file = file_extension in image_extensions
        
        # 对非图片文件进行JWT验证
        if not is_image_file:
            try:
                # 验证JWT token
                verify_jwt_in_request()
                user_id = get_jwt_identity()
                
                # 权限检查：检查是否有下载文件的权限
                # 所有文件都使用通用下载权限
                has_permission, message = check_permission(file.download_file.permission_judge)
                
                if not has_permission:
                    return jsonify({'error': message}), 403
                    
            except Exception as e:
                current_app.logger.error(f"JWT验证失败: {str(e)}")
                return jsonify({'error': '身份验证失败'}), 401
        
        # 获取MinIO客户端
        minio_client = get_minio_client()
        bucket_name = current_app.config.get('MINIO_BUCKET', 'manage-mate')
        
        try:
            file_info = minio_client.stat_object(bucket_name, file_path)
            file_size = file_info.size
            # 设置正确的content_type
            if file_extension in {'xlsx', 'xls'}:
                content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            elif file_extension == 'csv':
                content_type = 'text/csv'
            else:
                content_type = file_info.content_type or 'application/octet-stream'
        except S3Error as e:
            if e.code == 'NoSuchKey':
                return jsonify({'error': '文件不存在'}), 404
            current_app.logger.error(f"MinIO错误: {str(e)}, bucket={bucket_name}, path={file_path}")
            return jsonify({'error': '存储服务错误'}), 500
        
        # 提取文件名并设置Content-Disposition
        filename = file_path.split('/')[-1]
        disposition = f'attachment; filename="{filename}"'

        # 获取完整文件
        try:
            file_data = minio_client.get_object(bucket_name, file_path)
            
            def generate():
                try:
                    for chunk in file_data:
                        yield chunk
                finally:
                    file_data.close()
            
            response = Response(
                generate(),
                200,
                mimetype=content_type,
                headers={
                    'Content-Length': str(file_size),
                    'Accept-Ranges': 'bytes',
                    'Content-Disposition': disposition
                }
            )
            
            # 记录下载日志
            if not is_image_file:
                user_info = f", 用户: {get_jwt_identity()}" if not is_image_file else ""
            
            return response
        except Exception as e:
            return jsonify({'error': 'Failed to get file'}), 500
            
    except Exception as e:
        return jsonify({'error': 'Download failed'}), 500


@bp.route('/download/thumbnail/<path:file_path>', methods=['GET'])
def download_thumbnail(file_path):
    """
    缩略图下载接口

    流程：
    1. 检查文件是否为图片类型
    2. 获取minlength参数
    3. 从MinIO获取图片文件
    4. 计算缩略图尺寸（保持宽高比，最小边等于minlength）
    5. 生成缩略图并返回
    """
    try:
        # 检查文件扩展名
        file_extension = file_path.split('.')[-1].lower() if '.' in file_path else ''

        # 只允许图片文件
        image_extensions = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'}
        if file_extension not in image_extensions:
            return jsonify({'error': '只支持图片文件'}), 400

        # 获取minlength参数
        minlength = request.args.get('minlength', type=int)
        if not minlength or minlength <= 0:
            return jsonify({'error': 'minlength参数必须为正整数'}), 400

        # 获取MinIO客户端
        minio_client = get_minio_client()
        bucket_name = current_app.config.get('MINIO_BUCKET', 'manage-mate')

        try:
            # 获取文件信息
            file_info = minio_client.stat_object(bucket_name, file_path)
        except S3Error as e:
            if e.code == 'NoSuchKey':
                return jsonify({'error': '文件不存在'}), 404
            current_app.logger.error(f"MinIO错误: {str(e)}, bucket={bucket_name}, path={file_path}")
            return jsonify({'error': '存储服务错误'}), 500

        # 下载原图数据
        try:
            file_data = minio_client.get_object(bucket_name, file_path)
            image_data = io.BytesIO(file_data.read())
            file_data.close()
        except Exception as e:
            return jsonify({'error': '获取文件失败'}), 500

        # 打开图片并获取尺寸
        try:
            with Image.open(image_data) as img:
                width, height = img.size
                aspect_ratio = width / height

                # 判断图片形状并设置目标尺寸
                if 0.8 <= aspect_ratio <= 1.25:  # 接近正方形
                    # 正方形目标尺寸
                    target_width = minlength
                    target_height = minlength
                elif width > height:  # 横向长方形
                    target_width = 2 * minlength
                    target_height = minlength
                else:  # 竖向长方形
                    target_width = minlength
                    target_height = 2 * minlength

                # 使用aspect fill模式：保持比例，填充整个目标尺寸，超出部分裁剪
                # 计算缩放比例，使图片能完全覆盖目标尺寸
                scale_x = target_width / width
                scale_y = target_height / height
                scale = max(scale_x, scale_y)  # 选择较大的缩放比例，确保完全覆盖

                # 先缩放到能覆盖目标尺寸的大小
                scaled_width = int(width * scale)
                scaled_height = int(height * scale)

                # 缩放图片
                scaled_img = img.resize((scaled_width, scaled_height), Image.Resampling.LANCZOS)

                # 计算裁剪区域，使其居中
                left = (scaled_width - target_width) // 2
                top = (scaled_height - target_height) // 2
                right = left + target_width
                bottom = top + target_height

                # 裁剪图片
                thumbnail = scaled_img.crop((left, top, right, bottom))

                # 设置最终尺寸
                new_width = target_width
                new_height = target_height

                # 将缩略图转换为字节流
                thumbnail_buffer = io.BytesIO()
                # 根据原图格式保存缩略图
                if img.format == 'JPEG':
                    thumbnail.save(thumbnail_buffer, format='JPEG', quality=85)
                elif img.format == 'PNG':
                    thumbnail.save(thumbnail_buffer, format='PNG')
                elif img.format == 'GIF':
                    thumbnail.save(thumbnail_buffer, format='GIF')
                else:
                    # 其他格式转换为JPEG
                    thumbnail = thumbnail.convert('RGB')
                    thumbnail.save(thumbnail_buffer, format='JPEG', quality=85)

                thumbnail_buffer.seek(0)

                # 设置响应头
                content_type = f'image/{file_extension if file_extension != "jpg" else "jpeg"}'

                response = Response(
                    thumbnail_buffer.getvalue(),
                    mimetype=content_type,
                    headers={
                        'Content-Length': str(len(thumbnail_buffer.getvalue())),
                        'Cache-Control': 'public, max-age=3600',  # 缓存1小时
                        'X-Thumbnail-Generated': 'true'
                    }
                )

                return response

        except Exception as e:
            current_app.logger.error(f"图片处理失败: {str(e)}")
            return jsonify({'error': '图片处理失败'}), 500

    except Exception as e:
        current_app.logger.error(f"缩略图生成失败: {str(e)}")
        return jsonify({'error': '缩略图生成失败'}), 500


@bp.route('/list_files', methods=['GET'])
@jwt_required()
def list_files():
    """列出数据库中的所有文件记录"""
    # 权限检查
    has_permission, message = check_permission(file.list_files.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    try:
        # 获取查询参数
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        file_type = request.args.get('file_type', '')
        user_id = request.args.get('user_id', type=int)
        
        # 构建查询
        query = File.query
        
        # 按条件筛选
        if file_type:
            query = query.filter(File.fileType.like(f'%{file_type}%'))
            
        if user_id:
            query = query.filter(File.userID == user_id)
        
        # 按上传时间倒序排列
        query = query.order_by(File.uploadTime.desc())
        
        # 分页
        pagination = query.paginate(page=page, per_page=per_page, error_out=False)
        records = pagination.items
        
        # 统计信息
        total_files = File.query.count()
        
        return jsonify({
            'Flag': 4000,
            'message': '获取文件列表成功',
            'data': {
                'files': [record.to_dict() for record in records],
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total': pagination.total,
                    'pages': pagination.pages,
                    'has_prev': pagination.has_prev,
                    'has_next': pagination.has_next
                },
                'statistics': {
                    'total_files': total_files
                }
            }
        })
        
    except Exception as e:
        return jsonify({
            'Flag': 4002,
            'message': f'获取文件列表失败: {str(e)}'
        }), 500


@bp.route('/for_user/<int:user_id>', methods=['GET'])
@jwt_required()
def get_files_for_user(user_id):
    """
    获取指定用户的文件上传记录
    """
    # 权限检查
    has_permission, message = check_permission(file.get_files_for_user.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200


    records = File.query.filter_by(
        refUserID=user_id
    ).order_by(File.uploadTime.desc()).all()
    
    username = User.query.filter_by(userID=user_id).first().username

    return jsonify({
        'Flag': 4000,
        'message': '获取用户文件记录成功',
        'data': {
            'user_id': user_id,
            'username': username,
            'records': [record.to_dict() for record in records]
        }
    })


@bp.route('/for_club/<int:club_id>/<string:show>', methods=['GET'])
@jwt_required()
def get_files_for_club(club_id, show):
    """
    获取指定协会的文件上传记录
    show参数:
    - self_upload: 只显示本人上传的文件
    - all: 显示所有相关文件
    """
    # 权限检查
    has_permission, message = check_permission(file.get_files_for_club.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    # 获取当前用户ID
    current_user_id = get_jwt_identity()
    
    # 构建查询条件
    query = File.query.filter_by(
        refClubID=club_id
    )
    
    # 根据show参数决定是否过滤用户
    if show == 'self_upload':
        query = query.filter_by(userID=current_user_id)
    
    records = query.order_by(File.uploadTime.desc()).all()
    
    club_name = Club.query.filter_by(clubID=club_id).first().clubName
    user_name = User.query.filter_by(userID=current_user_id).first().username
    return jsonify({
        'Flag': 4000,
        'message': f'获取协会文件记录成功 ({show})',
        'data': {
            'club_id': club_id,
            'club_name': club_name,
            'show_type': show,
            'current_user_id': current_user_id if show == 'self_upload' else None,
            'current_user_name': user_name if show == 'self_upload' else None,
            'total_files': len(records),
            'records': [record.to_dict() for record in records]
        }
    })


@bp.route('/for_event/<int:event_id>/<string:show>', methods=['GET'])
@jwt_required()
def get_files_for_event(event_id, show):
    """
    获取指定活动的文件上传记录
    show参数:
    - self_upload: 只显示本人上传的文件
    - all: 显示所有相关文件
    """
    # 权限检查
    has_permission, message = check_permission(file.get_files_for_event.permission_judge)
    if not has_permission:
        return jsonify({'Flag': '4002', 'message': message}), 200

    # 获取当前用户ID
    current_user_id = get_jwt_identity()
    
    # 构建查询条件
    query = File.query.filter_by(
        refEventID=event_id
    )
    
    # 根据show参数决定是否过滤用户
    if show == 'self_upload':
        query = query.filter_by(userID=current_user_id)
    
    records = query.order_by(File.uploadTime.desc()).all()
    
    event_name = Event.query.filter_by(eventID=event_id).first().eventName
    user_name = User.query.filter_by(userID=current_user_id).first().username
    return jsonify({
        'Flag': 4000,
        'message': f'获取协会文件记录成功 ({show})',
        'data': {
            'event_id': event_id,
            'event_name': event_name,
            'show_type': show,
            'current_user_id': current_user_id if show == 'self_upload' else None,
            'current_user_name': user_name if show == 'self_upload' else None,
            'total_files': len(records),
            'records': [record.to_dict() for record in records]
        }
    })

