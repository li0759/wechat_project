import click
from flask.cli import with_appcontext
from . import db


@click.command()
@with_appcontext
def init_db():
    """初始化数据库"""
    db.create_all()
    click.echo('数据库初始化完成')


@click.command()
@with_appcontext
def drop_db():
    """删除所有数据库表"""
    db.drop_all()
    click.echo('数据库表已删除')


@click.command()
@with_appcontext
def reset_db():
    """重置数据库"""
    db.drop_all()
    db.create_all()
    click.echo('数据库已重置')


def register_commands(app):
    """注册CLI命令"""
    app.cli.add_command(init_db)
    app.cli.add_command(drop_db)
    app.cli.add_command(reset_db) 