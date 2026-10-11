#!/usr/bin/env python3
"""
Lustre OPS 鉴权与用户管理模块。

- 用户表 users：用户名/邮箱/角色/状态/密码哈希（PBKDF2-HMAC-SHA256，仅标准库）
- 会话表 sessions：随机 token（仅存哈希），带过期时间
- 提供装饰器 require_auth / require_role，供 lustre_api.py 保护接口

不依赖任何第三方库，直接使用 sqlite3 + hashlib + secrets。
"""

import os
import re
import hmac
import time
import json
import hashlib
import secrets
import sqlite3
from functools import wraps
from flask import request, jsonify, g

DB_PATH = os.environ.get('LUSTRE_DB', '/opt/lustre-data/lustre.db')

# 会话有效期（秒）。默认 12 小时。
SESSION_TTL = int(os.environ.get('LUSTRE_SESSION_TTL', str(12 * 3600)))
# 首次启动时自动创建的管理员（仅当 users 表为空）。可通过环境变量覆盖。
DEFAULT_ADMIN_USER = os.environ.get('LUSTRE_ADMIN_USER', 'admin')
DEFAULT_ADMIN_PASS = os.environ.get('LUSTRE_ADMIN_PASS', 'admin123')
DEFAULT_ADMIN_EMAIL = os.environ.get('LUSTRE_ADMIN_EMAIL', 'admin@lustre.local')

VALID_ROLES = ('admin', 'engineer', 'readonly')
VALID_STATUS = ('active', 'inactive')


# ---------------------------------------------------------------- db helpers
def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_auth_db():
    """建表并在空库时创建默认管理员。"""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = _conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL UNIQUE,
                role TEXT NOT NULL DEFAULT 'readonly',
                status TEXT NOT NULL DEFAULT 'active',
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_login TEXT
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                expires_at INTEGER NOT NULL
            )
            """
        )
        conn.commit()
        count = cur.execute('SELECT COUNT(*) AS c FROM users').fetchone()['c']
        if count == 0:
            _insert_user(
                conn,
                DEFAULT_ADMIN_USER,
                DEFAULT_ADMIN_EMAIL,
                DEFAULT_ADMIN_PASS,
                'admin',
                'active',
            )
            conn.commit()
            print(f'[AUTH] 已创建默认管理员: {DEFAULT_ADMIN_USER} / {DEFAULT_ADMIN_PASS}（请尽快修改）')
    finally:
        conn.close()


# ------------------------------------------------------------------ password
def _hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 120_000)
    return dk.hex(), salt


def _verify_password(password, stored_hash, salt):
    calc, _ = _hash_password(password, salt)
    return hmac.compare_digest(calc, stored_hash)


# --------------------------------------------------------------------- users
USERNAME_RE = re.compile(r'^[A-Za-z0-9_.\-]{3,32}$')
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def _insert_user(conn, username, email, password, role, status):
    pw_hash, salt = _hash_password(password)
    now = time.strftime('%Y-%m-%d %H:%M:%S')
    conn.execute(
        'INSERT INTO users (username, email, role, status, password_hash, password_salt, created_at)'
        ' VALUES (?, ?, ?, ?, ?, ?, ?)',
        (username, email, role, status, pw_hash, salt, now),
    )


def _public_user(row):
    return {
        'id': row['id'],
        'username': row['username'],
        'name': row['username'],
        'email': row['email'],
        'role': row['role'],
        'status': row['status'],
        'createdAt': row['created_at'],
        'lastLogin': row['last_login'] or '未登录',
    }


def list_users():
    conn = _conn()
    try:
        rows = conn.execute('SELECT * FROM users ORDER BY id').fetchall()
        return [_public_user(r) for r in rows]
    finally:
        conn.close()


def create_user(username, email, password, role='readonly', status='active'):
    username = (username or '').strip()
    email = (email or '').strip()
    if not USERNAME_RE.match(username):
        return None, '用户名需为 3-32 位字母/数字/._-'
    if not EMAIL_RE.match(email):
        return None, '邮箱格式不正确'
    if not password or len(password) < 6:
        return None, '密码至少 6 位'
    if role not in VALID_ROLES:
        return None, '角色不合法'
    if status not in VALID_STATUS:
        return None, '状态不合法'
    conn = _conn()
    try:
        if conn.execute('SELECT 1 FROM users WHERE username = ?', (username,)).fetchone():
            return None, '用户名已存在'
        if conn.execute('SELECT 1 FROM users WHERE email = ?', (email,)).fetchone():
            return None, '邮箱已存在'
        _insert_user(conn, username, email, password, role, status)
        conn.commit()
        row = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
        return _public_user(row), None
    finally:
        conn.close()


def update_user(user_id, fields):
    """更新用户。fields 可含 email/role/status/password。"""
    conn = _conn()
    try:
        row = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
        if not row:
            return None, '用户不存在'
        sets, vals = [], []
        if 'email' in fields:
            email = (fields['email'] or '').strip()
            if not EMAIL_RE.match(email):
                return None, '邮箱格式不正确'
            dup = conn.execute('SELECT 1 FROM users WHERE email = ? AND id != ?', (email, user_id)).fetchone()
            if dup:
                return None, '邮箱已被占用'
            sets.append('email = ?')
            vals.append(email)
        if 'role' in fields:
            if fields['role'] not in VALID_ROLES:
                return None, '角色不合法'
            sets.append('role = ?')
            vals.append(fields['role'])
        if 'status' in fields:
            if fields['status'] not in VALID_STATUS:
                return None, '状态不合法'
            sets.append('status = ?')
            vals.append(fields['status'])
        if fields.get('password'):
            if len(fields['password']) < 6:
                return None, '密码至少 6 位'
            pw_hash, salt = _hash_password(fields['password'])
            sets.append('password_hash = ?')
            vals.append(pw_hash)
            sets.append('password_salt = ?')
            vals.append(salt)
        if not sets:
            return _public_user(row), None
        vals.append(user_id)
        conn.execute(f'UPDATE users SET {", ".join(sets)} WHERE id = ?', vals)
        conn.commit()
        row = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
        return _public_user(row), None
    finally:
        conn.close()


def delete_user(user_id):
    conn = _conn()
    try:
        row = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
        if not row:
            return False, '用户不存在'
        admins = conn.execute("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").fetchone()['c']
        if row['role'] == 'admin' and admins <= 1:
            return False, '不能删除唯一的管理员'
        conn.execute('DELETE FROM sessions WHERE user_id = ?', (user_id,))
        conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
        conn.commit()
        return True, None
    finally:
        conn.close()


# ------------------------------------------------------------------ sessions
def _token_hash(token):
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def login(identifier, password):
    """identifier 可为用户名或邮箱。成功返回 (token, user)。"""
    ident = (identifier or '').strip()
    conn = _conn()
    try:
        row = conn.execute(
            'SELECT * FROM users WHERE username = ? OR email = ?', (ident, ident)
        ).fetchone()
        if not row or not _verify_password(password or '', row['password_hash'], row['password_salt']):
            return None, None, '用户名或密码错误'
        if row['status'] != 'active':
            return None, None, '账号已停用，请联系管理员'
        token = secrets.token_urlsafe(32)
        now = time.strftime('%Y-%m-%d %H:%M:%S')
        conn.execute(
            'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
            (_token_hash(token), row['id'], now, int(time.time()) + SESSION_TTL),
        )
        conn.execute('UPDATE users SET last_login = ? WHERE id = ?', (now, row['id']))
        conn.commit()
        return token, _public_user(row), None
    finally:
        conn.close()


def logout(token):
    if not token:
        return
    conn = _conn()
    try:
        conn.execute('DELETE FROM sessions WHERE token_hash = ?', (_token_hash(token),))
        conn.commit()
    finally:
        conn.close()


def user_for_token(token):
    if not token:
        return None
    conn = _conn()
    try:
        conn.execute('DELETE FROM sessions WHERE expires_at < ?', (int(time.time()),))
        conn.commit()
        row = conn.execute(
            'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id'
            ' WHERE s.token_hash = ? AND s.expires_at >= ?',
            (_token_hash(token), int(time.time())),
        ).fetchone()
        if not row or row['status'] != 'active':
            return None
        return _public_user(row)
    finally:
        conn.close()


def token_from_request():
    auth = request.headers.get('Authorization') or ''
    if auth.lower().startswith('bearer '):
        return auth[7:].strip()
    return request.headers.get('X-Auth-Token') or request.cookies.get('lustre_token')


# ---------------------------------------------------------------- decorators
ROLE_LEVEL = {'readonly': 1, 'engineer': 2, 'admin': 3}


def require_auth(min_role='readonly'):
    """要求已登录且角色不低于 min_role。"""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = user_for_token(token_from_request())
            if not user:
                return jsonify({'error': '未登录或登录已过期'}), 401
            if ROLE_LEVEL.get(user['role'], 0) < ROLE_LEVEL.get(min_role, 0):
                return jsonify({'error': '权限不足'}), 403
            g.current_user = user
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def is_public_path(path):
    """无需登录即可访问的路径白名单。"""
    public_prefixes = (
        '/api/auth/login',
        '/api/health',
        '/api/version',
    )
    return any(path == p or path.startswith(p + '/') for p in public_prefixes)
