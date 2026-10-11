#!/usr/bin/env python3
"""
Lustre OPS API v2 - Database-backed + Real-time fallback
Serves frontend with historical data from SQLite, with real-time fallback for current state.
"""

import os
os.environ["PATH"] = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

import sqlite3
import subprocess
import json
import re
import time
import queue
import threading
import uuid
import hashlib
import hmac
import math
import shutil
from urllib import request as urllib_request
from urllib import error as urllib_error
from datetime import datetime, timedelta
from flask import Flask, Response, jsonify, request, stream_with_context, g, send_from_directory
from flask_cors import CORS

import auth as auth_mod
import lustre_alerts as alert_engine
import lustre_collect

app = Flask(__name__)
CORS(app, supports_credentials=True)

# 鉴权与用户管理表初始化（空库时自动建默认管理员）
auth_mod.init_auth_db()


def ensure_metrics_tables():
    """创建巡检/指标所需的表（上游默认不建，导致 "no such table" 与无巡检历史）。

    字段与 lustre_api.py 中的查询保持一致；采集器（如有）可向其写数据。
    """
    try:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS ost_metrics (
                timestamp TEXT NOT NULL, name TEXT, uuid TEXT, type TEXT,
                total_bytes INTEGER, used_bytes INTEGER, available_bytes INTEGER,
                usage_percent REAL, mount TEXT, fs_name TEXT
            )""")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_ost_metrics_ts ON ost_metrics(timestamp)")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS perf_rates (
                timestamp TEXT NOT NULL, ost_name TEXT, read_mbps REAL, write_mbps REAL,
                read_iops REAL, write_iops REAL
            )""")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_perf_rates_ts ON perf_rates(timestamp, ost_name)")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS node_metrics (
                timestamp TEXT NOT NULL, node_id TEXT, nid TEXT, status TEXT, role TEXT
            )""")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_node_metrics_ts ON node_metrics(timestamp)")
        # 节点注册表：多节点采集后每个节点的角色/服务/版本/心跳
        cur.execute("""
            CREATE TABLE IF NOT EXISTS lustre_nodes (
                node_id TEXT PRIMARY KEY, hostname TEXT, ip TEXT, role TEXT, nid TEXT,
                lustre_version TEXT, kernel_version TEXT, services_json TEXT,
                target_mounts_json TEXT, last_heartbeat TEXT, status TEXT DEFAULT 'online'
            )""")
        # 服务端深度探针快照（recovery / IB / 磁盘 / ldlm / DDN 脚本）
        cur.execute("""
            CREATE TABLE IF NOT EXISTS server_probes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL, node_id TEXT, role TEXT, probe_json TEXT
            )""")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_server_probes_ts ON server_probes(timestamp, node_id)")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT, level TEXT,
                title TEXT, message TEXT, source TEXT,
                resolved INTEGER NOT NULL DEFAULT 0, resolved_at TEXT
            )""")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS health_checks (
                timestamp TEXT NOT NULL, healthy INTEGER, servers_output TEXT,
                mounted INTEGER, score INTEGER, client_mount TEXT
            )""")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_health_checks_ts ON health_checks(timestamp)")
        # 完整巡检快照（含 findings/steps/日志），供「巡检历史」查看
        cur.execute("""
            CREATE TABLE IF NOT EXISTS health_check_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                score INTEGER,
                checks_passed INTEGER,
                checks_failed INTEGER,
                checks_warned INTEGER,
                finding_count INTEGER,
                client_mount TEXT,
                payload_json TEXT
            )""")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_hcr_ts ON health_check_runs(timestamp)")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS sys_stats (
                timestamp TEXT NOT NULL, load1 REAL, load5 REAL, load15 REAL,
                cpu_percent REAL, mem_percent REAL
            )""")
        conn.commit()
        conn.close()
    except Exception as e:
        print(f'[SCHEMA ERROR] {e}')


@app.before_request
def _enforce_auth():
    """全局登录守卫：除白名单外，所有 /api/* 均需有效会话。"""
    path = request.path or ''
    if request.method == 'OPTIONS':
        return None
    if not path.startswith('/api/'):
        return None
    if auth_mod.is_public_path(path):
        return None
    user = auth_mod.user_for_token(auth_mod.token_from_request())
    if not user:
        return jsonify({'error': '未登录或登录已过期'}), 401
    g.current_user = user
    return None


def require_role(min_role):
    return auth_mod.require_auth(min_role)

DB_PATH = os.environ.get('LUSTRE_DB', '/opt/lustre-data/lustre.db')
# 客户端挂载点可通过环境变量 LUSTRE_CLIENT_MOUNT 配置（默认 /lustre/client）。
# 部署时按实际挂载点设置，例如本环境为 /lustre。
LUSTRE_CLIENT = os.environ.get('LUSTRE_CLIENT_MOUNT', '/lustre/client')


def detect_lustre_mount(preferred=None):
    """返回生效的 Lustre 客户端挂载点。

    优先使用配置的挂载点（LUSTRE_CLIENT_MOUNT）；若其未挂载，
    则用 `findmnt -t lustre` 自动探测真实挂载点，避免因默认值
    `/lustre/client` 与实际 `/lustre` 不一致而误判“未挂载”。
    """
    preferred = preferred or LUSTRE_CLIENT
    if os.path.ismount(preferred):
        return preferred
    out, _, rc = run_cmd("findmnt -t lustre -n -o TARGET 2>/dev/null | head -1", timeout=8)
    if rc == 0 and out.strip():
        return out.strip().splitlines()[0].strip()
    return preferred


def lustre_mounted(preferred=None):
    """客户端是否已挂载（以自动探测后的挂载点判定）。"""
    mp = detect_lustre_mount(preferred)
    return bool(mp) and os.path.ismount(mp)
AI_SETTINGS_PATH = '/opt/lustre-data/ai_model_settings.json'
LOG_STATE_PATH = '/opt/lustre-data/log_analysis_state.json'

# 巡检/指标所需表（必须在 DB_PATH 定义之后调用）
ensure_metrics_tables()
# 告警规则/渠道/事件表 + 默认规则
alert_engine.init_alert_tables()
AGENT_ID = 'lustre-log-analyzer'
AGENT_MEMORY_DIR = f'/opt/lustre-data/agent-memory/{AGENT_ID}'
AGENT_SESSIONS_DIR = os.path.join(AGENT_MEMORY_DIR, 'sessions')
AGENT_SESSION_INDEX_PATH = os.path.join(AGENT_SESSIONS_DIR, 'index.json')
AGENT_CONFIG_PATH = os.path.join(AGENT_MEMORY_DIR, 'agent-config.json')
KNOWLEDGE_DIR = f'/opt/lustre-data/agent-memory/{AGENT_ID}/knowledge'
KNOWLEDGE_DOCS_DIR = os.path.join(KNOWLEDGE_DIR, 'documents')
KNOWLEDGE_VECTOR_INDEX_PATH = os.path.join(KNOWLEDGE_DIR, 'vector-index.json')
KNOWLEDGE_EMBEDDING_DIM = 256
KNOWLEDGE_MAX_UPLOAD_BYTES = 5 * 1024 * 1024
KNOWLEDGE_ALLOWED_EXTENSIONS = {'.md', '.markdown', '.txt', '.log', '.conf'}

DEFAULT_AGENT_SYSTEM_PROMPT = """你是 LustreOps AI 日志诊断助手，专门帮助运维人员分析 Lustre 文件系统、HPC 存储集群、Linux 服务器、Slurm 作业环境中的日志和异常。

你的角色：
1. 你是一个严谨、专业、偏运维实战的日志诊断智能体。
2. 你需要优先帮助用户定位异常原因、影响范围、风险等级和下一步排查动作。
3. 你不能凭空编造日志中不存在的信息。
4. 当证据不足时，你必须明确说明“当前日志证据不足”，并列出还需要补充哪些日志、命令输出或节点信息。
5. 你输出的建议应该可执行、可验证、可回滚。
6. 你应尽量使用中文回复，除非用户明确要求英文。

你分析日志时的优先级：
1. FATAL、PANIC、kernel crash、filesystem corruption、MDS/OSS 不可用等高危异常。
2. ERROR、I/O error、timeout、eviction、recovery failed、OST/MDT unavailable、LNet 网络异常。
3. WARN、degraded、retry、slow request、RPC timeout、quota、空间不足等潜在风险。
4. INFO 级别日志只作为上下文，不应默认视为故障。

你的诊断步骤：
1. 先判断日志中是否存在明确异常。
2. 提取关键字段：时间、节点、服务角色、组件、日志级别、错误码、关键错误文本。
3. 判断影响范围：单节点、单个 OST/MDT、多个服务节点、客户端访问异常、全局文件系统风险。
4. 推断可能原因，但必须区分“日志直接证明”和“需要进一步验证”。
5. 给出排查命令建议，例如 lctl dl、lctl ping、lctl get_param、lfs df -h、lfs osts、dmesg -T、journalctl、systemctl status、ss/ip/ethtool、Slurm 作业相关命令。
6. 给出处理建议：立即处理项、可观察项、后续优化项。
7. 给出风险等级：正常、低风险、中风险、高风险、紧急。
8. 最后给出一句简洁结论。

回复长度规则：
1. 问候、确认能力或简单闲聊：直接回答，最多 2 句话，不输出诊断模板。
2. 当前没有 WARN / ERROR / FATAL，且用户只是询问是否异常：最多 2 句话，只说明当前采集范围和结论，不主动给排查命令。
3. 只有发现异常，或用户明确要求详细、深入、全面分析时，才使用下面的完整诊断结构。
4. 不要为了显得专业而重复日志计数、罗列无关风险或提供用户没有要求的操作步骤。

异常或深度分析的标准回复格式：
【结论】
用 1-3 句话说明当前是否发现异常、主要问题是什么、影响范围是什么。

【风险等级】
正常 / 低风险 / 中风险 / 高风险 / 紧急，并说明理由。

【关键证据】
列出日志中支持判断的关键证据。不要编造不存在的日志。

【可能原因】
区分：
1. 日志直接支持的原因
2. 需要进一步验证的原因

【建议排查步骤】
给出按优先级排列的排查步骤，每一步尽量包含具体命令或检查对象。

【建议处理动作】
说明可以立即执行的处理、需要谨慎执行的处理、以及需要人工确认的处理。

【还需要补充的信息】
如果证据不足，请列出需要用户补充的日志、节点、时间范围、命令输出。

【简短总结】
用一句话总结当前诊断结果。

当当前没有 WARN / ERROR / FATAL 日志时：
1. 不要强行分析不存在的异常。
2. 简洁说明“当前已采集范围内未发现异常”，不能扩大为“整个集群完全正常”。
3. 除非用户明确要求详细检查，否则不要输出可能原因、排查步骤、处理动作或补充信息。
4. 回复控制在 2 句话以内。

当用户询问历史问题时：
1. 优先参考当前会话上下文。
2. 可以参考长期记忆中的相关经验。
3. 如果使用了长期记忆，请说明这是基于历史会话经验的辅助判断。"""


def ensure_log_knowledge_table():
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS log_knowledge_base (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                problem TEXT NOT NULL,
                solution TEXT NOT NULL,
                extra_steps TEXT DEFAULT '',
                tags TEXT DEFAULT '',
                source_question TEXT DEFAULT '',
                source_answer TEXT DEFAULT '',
                source_logs TEXT DEFAULT '',
                feedback_score INTEGER DEFAULT 0,
                hit_count INTEGER DEFAULT 0,
                embedding_status TEXT DEFAULT 'pending',
                vector_id TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS knowledge_documents (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                filename TEXT NOT NULL,
                source_type TEXT DEFAULT 'markdown',
                latest_version_id TEXT DEFAULT '',
                version_count INTEGER DEFAULT 0,
                chunk_count INTEGER DEFAULT 0,
                status TEXT DEFAULT 'ready',
                error_message TEXT DEFAULT '',
                tags TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS knowledge_document_versions (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                version_number INTEGER NOT NULL,
                filename TEXT NOT NULL,
                size_bytes INTEGER DEFAULT 0,
                content_sha256 TEXT DEFAULT '',
                chunk_count INTEGER DEFAULT 0,
                parser TEXT DEFAULT 'markdown-text',
                status TEXT DEFAULT 'ready',
                error_message TEXT DEFAULT '',
                created_at TEXT NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS knowledge_chunks (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                version_id TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                title TEXT NOT NULL,
                heading TEXT DEFAULT '',
                content TEXT NOT NULL,
                tags TEXT DEFAULT '',
                feedback_score INTEGER DEFAULT 0,
                hit_count INTEGER DEFAULT 0,
                embedding_status TEXT DEFAULT 'ready',
                vector_id TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.commit()
        conn.close()
    except Exception as e:
        print(f'[KNOWLEDGE TABLE ERROR] {e}')


def knowledge_row_to_dict(row):
    data = dict(row)
    data['tags'] = [item.strip() for item in (data.get('tags') or '').split(',') if item.strip()]
    return data


def db_query(sql, params=()):
    """Helper: query SQLite and return list of dicts"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(sql, params)
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows
    except Exception as e:
        print(f'[DB ERROR] {e}')
        return []


def load_json_file(path, default_value):
    try:
        if not os.path.exists(path):
            return default_value
        with open(path, 'r', encoding='utf-8') as fh:
            return json.load(fh)
    except Exception as e:
        print(f'[JSON LOAD ERROR] {path}: {e}')
        return default_value


def save_json_file(path, data):
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    tmp_path = f'{path}.tmp-{os.getpid()}-{threading.get_ident()}'
    with open(tmp_path, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    os.replace(tmp_path, path)


def ensure_knowledge_dirs():
    os.makedirs(KNOWLEDGE_DIR, exist_ok=True)
    os.makedirs(KNOWLEDGE_DOCS_DIR, exist_ok=True)


def sanitize_filename(name):
    name = os.path.basename(name or 'document.md')
    name = re.sub(r'[^A-Za-z0-9._\-\u4e00-\u9fff]+', '_', name).strip('._')
    return name or 'document.md'


def tags_to_text(tags):
    if isinstance(tags, list):
        return ','.join([str(item).strip() for item in tags if str(item).strip()])
    return str(tags or '').strip()


def parse_tags_text(text):
    return [item.strip() for item in (text or '').split(',') if item.strip()]


def knowledge_doc_to_dict(row):
    data = dict(row)
    data['tags'] = parse_tags_text(data.get('tags'))
    return data


def knowledge_chunk_to_dict(row):
    data = dict(row)
    data['tags'] = parse_tags_text(data.get('tags'))
    return data


def normalize_text_for_embedding(text):
    text = (text or '').lower()
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def tokenize_for_embedding(text):
    text = normalize_text_for_embedding(text)
    tokens = re.findall(r'[a-z0-9_./:-]{2,}|[\u4e00-\u9fff]{1,}', text)
    expanded = []
    for token in tokens:
        expanded.append(token)
        if re.match(r'^[\u4e00-\u9fff]+$', token) and len(token) > 1:
            for size in (2, 3):
                for index in range(0, max(len(token) - size + 1, 0)):
                    expanded.append(token[index:index + size])
    return expanded


def local_embedding(text, dim=KNOWLEDGE_EMBEDDING_DIM):
    vector = [0.0] * dim
    for token in tokenize_for_embedding(text):
        digest = hashlib.sha256(token.encode('utf-8')).hexdigest()
        slot = int(digest[:8], 16) % dim
        sign = 1.0 if int(digest[8:10], 16) % 2 == 0 else -1.0
        weight = 1.0 + min(len(token), 12) / 16.0
        vector[slot] += sign * weight
    norm = math.sqrt(sum(item * item for item in vector)) or 1.0
    return [round(item / norm, 6) for item in vector]


def cosine_similarity(vec_a, vec_b):
    if not vec_a or not vec_b:
        return 0.0
    limit = min(len(vec_a), len(vec_b))
    return sum(float(vec_a[index]) * float(vec_b[index]) for index in range(limit))


def load_vector_index():
    ensure_knowledge_dirs()
    default_value = {
        'version': 1,
        'embedding': 'local-hash-v1',
        'dimension': KNOWLEDGE_EMBEDDING_DIM,
        'updatedAt': '',
        'vectors': [],
    }
    index = load_json_file(KNOWLEDGE_VECTOR_INDEX_PATH, default_value)
    if not isinstance(index, dict):
        return default_value
    if not isinstance(index.get('vectors'), list):
        index['vectors'] = []
    return index


def save_vector_index(index):
    ensure_knowledge_dirs()
    index['version'] = 1
    index['embedding'] = 'local-hash-v1'
    index['dimension'] = KNOWLEDGE_EMBEDDING_DIM
    index['updatedAt'] = now_iso()
    save_json_file(KNOWLEDGE_VECTOR_INDEX_PATH, index)


def build_case_vector_record(row):
    item = knowledge_row_to_dict(row)
    text = '\n'.join([
        item.get('title') or '',
        item.get('problem') or '',
        item.get('solution') or '',
        item.get('extra_steps') or '',
        ','.join(item.get('tags') or []),
    ])
    return {
        'id': f"case:{item.get('id')}",
        'kind': 'case',
        'sourceId': item.get('id'),
        'title': item.get('title') or '故障处理经验',
        'content': text[:6000],
        'tags': item.get('tags') or [],
        'feedbackScore': int(item.get('feedback_score') or 0),
        'hitCount': int(item.get('hit_count') or 0),
        'updatedAt': item.get('updated_at') or '',
        'vector': local_embedding(text),
    }


def build_chunk_vector_record(row):
    item = knowledge_chunk_to_dict(row)
    text = '\n'.join([
        item.get('title') or '',
        item.get('heading') or '',
        item.get('content') or '',
        ','.join(item.get('tags') or []),
    ])
    return {
        'id': f"chunk:{item.get('id')}",
        'kind': 'doc_chunk',
        'sourceId': item.get('id'),
        'documentId': item.get('document_id'),
        'versionId': item.get('version_id'),
        'chunkIndex': item.get('chunk_index'),
        'title': item.get('title') or '文档片段',
        'heading': item.get('heading') or '',
        'content': (item.get('content') or '')[:6000],
        'tags': item.get('tags') or [],
        'feedbackScore': int(item.get('feedback_score') or 0),
        'hitCount': int(item.get('hit_count') or 0),
        'updatedAt': item.get('updated_at') or '',
        'vector': local_embedding(text),
    }


def rebuild_knowledge_vector_index():
    ensure_log_knowledge_table()
    rows = []
    for row in db_query("SELECT * FROM log_knowledge_base"):
        rows.append(build_case_vector_record(row))
    for row in db_query("SELECT * FROM knowledge_chunks WHERE embedding_status = 'ready'"):
        rows.append(build_chunk_vector_record(row))
    index = {'vectors': rows}
    save_vector_index(index)
    return index


def upsert_vector_records(records):
    index = load_vector_index()
    next_vectors = [item for item in index.get('vectors', []) if item.get('id') not in {record.get('id') for record in records}]
    next_vectors.extend(records)
    index['vectors'] = next_vectors
    save_vector_index(index)


def remove_vectors_by_prefix(prefixes):
    index = load_vector_index()
    index['vectors'] = [
        item for item in index.get('vectors', [])
        if not any(str(item.get('id') or '').startswith(prefix) for prefix in prefixes)
    ]
    save_vector_index(index)


def decode_uploaded_text(raw):
    for encoding in ('utf-8', 'utf-8-sig', 'gb18030', 'latin-1'):
        try:
            return raw.decode(encoding)
        except Exception:
            continue
    return raw.decode('utf-8', errors='ignore')


def strip_markdown_noise(text):
    text = (text or '').replace('\r\n', '\n').replace('\r', '\n')
    text = re.sub(r'^---\n.*?\n---\n', '', text, flags=re.S)
    return text.strip()


def split_document_chunks(text, title, max_chars=1400, overlap=160):
    text = strip_markdown_noise(text)
    if not text:
        return []
    sections = []
    current_heading = title or '文档'
    current_lines = []
    for line in text.split('\n'):
        heading_match = re.match(r'^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$', line)
        if heading_match and current_lines:
            sections.append((current_heading, '\n'.join(current_lines).strip()))
            current_heading = heading_match.group(2).strip()
            current_lines = []
        elif heading_match:
            current_heading = heading_match.group(2).strip()
        current_lines.append(line)
    if current_lines:
        sections.append((current_heading, '\n'.join(current_lines).strip()))

    chunks = []
    for heading, section_text in sections:
        section_text = section_text.strip()
        if not section_text:
            continue
        start = 0
        while start < len(section_text):
            chunk_text = section_text[start:start + max_chars].strip()
            if chunk_text:
                chunks.append({'heading': heading or title or '文档片段', 'content': chunk_text})
            if start + max_chars >= len(section_text):
                break
            start = max(start + max_chars - overlap, start + 1)
    return chunks


def create_document_version(title, filename, raw_bytes, tags=None, document_id=None):
    ensure_log_knowledge_table()
    ensure_knowledge_dirs()
    safe_name = sanitize_filename(filename)
    ext = os.path.splitext(safe_name)[1].lower()
    if ext not in KNOWLEDGE_ALLOWED_EXTENSIONS:
        raise ValueError('仅支持 Markdown、txt、log、conf 文本文件')
    if len(raw_bytes) > KNOWLEDGE_MAX_UPLOAD_BYTES:
        raise ValueError('文件超过 5MB，请拆分后上传')
    content_text = decode_uploaded_text(raw_bytes)
    title = (title or os.path.splitext(safe_name)[0] or '未命名文档').strip()
    tags_text = tags_to_text(tags)
    content_sha = hashlib.sha256(raw_bytes).hexdigest()
    now = now_iso()
    if not document_id:
        document_id = uuid.uuid4().hex
    version_id = uuid.uuid4().hex
    existing = db_query("SELECT * FROM knowledge_documents WHERE id = ?", (document_id,))
    version_number = 1
    if existing:
        version_rows = db_query(
            "SELECT MAX(version_number) AS max_version FROM knowledge_document_versions WHERE document_id = ?",
            (document_id,),
        )
        version_number = int((version_rows[0].get('max_version') if version_rows else 0) or 0) + 1
    chunks = split_document_chunks(content_text, title)
    if not chunks:
        raise ValueError('文档解析后没有可索引内容')
    doc_dir = os.path.join(KNOWLEDGE_DOCS_DIR, document_id)
    os.makedirs(doc_dir, exist_ok=True)
    stored_path = os.path.join(doc_dir, f'v{version_number}-{safe_name}')
    with open(stored_path, 'wb') as fh:
        fh.write(raw_bytes)
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    if existing:
        cur.execute("""
            UPDATE knowledge_documents
            SET title = ?, filename = ?, latest_version_id = ?, version_count = version_count + 1,
                chunk_count = ?, status = 'ready', error_message = '', tags = ?, updated_at = ?
            WHERE id = ?
        """, (title, safe_name, version_id, len(chunks), tags_text, now, document_id))
    else:
        cur.execute("""
            INSERT INTO knowledge_documents (
                id, title, filename, source_type, latest_version_id, version_count,
                chunk_count, status, error_message, tags, created_at, updated_at
            )
            VALUES (?, ?, ?, 'markdown', ?, 1, ?, 'ready', '', ?, ?, ?)
        """, (document_id, title, safe_name, version_id, len(chunks), tags_text, now, now))
    cur.execute("""
        INSERT INTO knowledge_document_versions (
            id, document_id, version_number, filename, size_bytes, content_sha256,
            chunk_count, parser, status, error_message, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'markdown-text', 'ready', '', ?)
    """, (version_id, document_id, version_number, safe_name, len(raw_bytes), content_sha, len(chunks), now))
    cur.execute("DELETE FROM knowledge_chunks WHERE document_id = ?", (document_id,))
    vector_records = []
    for index, chunk in enumerate(chunks):
        chunk_id = uuid.uuid4().hex
        chunk_title = f"{title} / {chunk.get('heading') or '片段'}"
        cur.execute("""
            INSERT INTO knowledge_chunks (
                id, document_id, version_id, chunk_index, title, heading, content, tags,
                feedback_score, hit_count, embedding_status, vector_id, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'ready', ?, ?, ?)
        """, (
            chunk_id,
            document_id,
            version_id,
            index + 1,
            chunk_title[:300],
            (chunk.get('heading') or '')[:300],
            chunk.get('content') or '',
            tags_text,
            f'chunk:{chunk_id}',
            now,
            now,
        ))
        vector_records.append(build_chunk_vector_record({
            'id': chunk_id,
            'document_id': document_id,
            'version_id': version_id,
            'chunk_index': index + 1,
            'title': chunk_title[:300],
            'heading': (chunk.get('heading') or '')[:300],
            'content': chunk.get('content') or '',
            'tags': tags_text,
            'feedback_score': 0,
            'hit_count': 0,
            'updated_at': now,
        }))
    conn.commit()
    conn.close()
    remove_vectors_by_prefix([f'chunk:'])
    # Rebuild to keep document replacements and case records consistent.
    rebuild_knowledge_vector_index()
    doc = db_query("SELECT * FROM knowledge_documents WHERE id = ?", (document_id,))[0]
    version = db_query("SELECT * FROM knowledge_document_versions WHERE id = ?", (version_id,))[0]
    return knowledge_doc_to_dict(doc), dict(version)


def ensure_agent_memory_dirs():
    os.makedirs(AGENT_SESSIONS_DIR, exist_ok=True)


def default_agent_config():
    return {
        'agentId': AGENT_ID,
        'agentName': 'LustreOps AI 日志诊断助手',
        'model': '',
        'systemPrompt': DEFAULT_AGENT_SYSTEM_PROMPT,
        'updatedAt': now_iso(),
    }


def load_agent_config():
    ensure_agent_memory_dirs()
    config = load_json_file(AGENT_CONFIG_PATH, default_agent_config())
    default_config = default_agent_config()
    changed = False
    for key, value in default_config.items():
        if key not in config:
            config[key] = value
            changed = True
    if changed or not os.path.exists(AGENT_CONFIG_PATH):
        save_json_file(AGENT_CONFIG_PATH, config)
    return config


def save_agent_config(config):
    ensure_agent_memory_dirs()
    config['agentId'] = AGENT_ID
    config['updatedAt'] = now_iso()
    save_json_file(AGENT_CONFIG_PATH, config)
    return config


def session_path(session_id):
    safe_id = re.sub(r'[^a-zA-Z0-9_-]', '', session_id or '')
    if not safe_id:
        raise ValueError('invalid session id')
    return os.path.join(AGENT_SESSIONS_DIR, f'{safe_id}.json')


def default_session(title='新会话'):
    now = now_iso()
    session_id = uuid.uuid4().hex
    return {
        'sessionId': session_id,
        'title': title or '新会话',
        'createdAt': now,
        'updatedAt': now,
        'messages': [],
        'relatedLogSnapshotIds': [],
        'summary': '',
        'memoryNotes': [],
    }


def compact_session_for_index(session):
    messages = session.get('messages') or []
    last_message = ''
    for item in reversed(messages):
        content = (item.get('content') or '').strip()
        if content:
            last_message = content[:120]
            break
    return {
        'sessionId': session.get('sessionId'),
        'title': session.get('title') or '新会话',
        'createdAt': session.get('createdAt'),
        'updatedAt': session.get('updatedAt'),
        'summary': session.get('summary') or '',
        'lastMessage': last_message,
        'messageCount': len(messages),
    }


def load_session_index():
    ensure_agent_memory_dirs()
    index = load_json_file(AGENT_SESSION_INDEX_PATH, {'sessions': []})
    sessions = index.get('sessions') if isinstance(index, dict) else []
    if not isinstance(sessions, list):
        sessions = []
    sessions = sorted(sessions, key=lambda item: item.get('updatedAt') or '', reverse=True)
    return {'sessions': sessions}


def save_session_index_from_sessions(sessions):
    ensure_agent_memory_dirs()
    index = {'sessions': [compact_session_for_index(item) for item in sessions]}
    index['sessions'] = sorted(index['sessions'], key=lambda item: item.get('updatedAt') or '', reverse=True)
    save_json_file(AGENT_SESSION_INDEX_PATH, index)
    return index


def rebuild_session_index():
    ensure_agent_memory_dirs()
    sessions = []
    for name in os.listdir(AGENT_SESSIONS_DIR):
        if not name.endswith('.json') or name == 'index.json':
            continue
        session = load_json_file(os.path.join(AGENT_SESSIONS_DIR, name), None)
        if isinstance(session, dict) and session.get('sessionId'):
            sessions.append(session)
    return save_session_index_from_sessions(sessions)


def save_session(session):
    ensure_agent_memory_dirs()
    session['updatedAt'] = now_iso()
    save_json_file(session_path(session.get('sessionId')), session)
    index = load_session_index()
    sessions = []
    found = False
    for item in index.get('sessions', []):
        if item.get('sessionId') == session.get('sessionId'):
            sessions.append(session)
            found = True
        else:
            loaded = load_agent_session(item.get('sessionId'))
            if loaded:
                sessions.append(loaded)
    if not found:
        sessions.append(session)
    save_session_index_from_sessions(sessions)
    return session


def load_agent_session(session_id):
    try:
        path = session_path(session_id)
    except ValueError:
        return None
    session = load_json_file(path, None)
    if not isinstance(session, dict) or not session.get('sessionId'):
        return None
    session.setdefault('messages', [])
    session.setdefault('relatedLogSnapshotIds', [])
    session.setdefault('summary', '')
    session.setdefault('memoryNotes', [])
    return session


def create_agent_session(title='新会话'):
    session = default_session(title)
    return save_session(session)


def delete_agent_session(session_id):
    try:
        path = session_path(session_id)
    except ValueError:
        return False
    if not os.path.exists(path):
        return False
    os.remove(path)
    index = load_session_index()
    remaining = []
    for item in index.get('sessions', []):
        if item.get('sessionId') != session_id:
            loaded = load_agent_session(item.get('sessionId'))
            if loaded:
                remaining.append(loaded)
    save_session_index_from_sessions(remaining)
    return True


def append_session_message(session, role, content, metadata=None):
    message = {
        'id': f'msg-{uuid.uuid4().hex[:12]}',
        'role': role,
        'content': content,
        'createdAt': now_iso(),
        'metadata': metadata or {},
    }
    session.setdefault('messages', []).append(message)
    return message


def generate_session_title(question):
    title = re.sub(r'\s+', ' ', (question or '').strip())
    if not title:
        return '新会话'
    return title[:28] + ('...' if len(title) > 28 else '')


def update_session_memory(session, question, answer):
    question_text = re.sub(r'\s+', ' ', question or '').strip()
    answer_text = re.sub(r'\s+', ' ', answer or '').strip()
    if question_text:
        session['summary'] = f'最近问题：{question_text[:160]}；最近结论：{answer_text[:220]}'
    notes = session.setdefault('memoryNotes', [])
    combined = f'{question_text} {answer_text}'
    if any(keyword in combined for keyword in ('已解决', '确认', '有效', '处理办法', '经验', '修复')):
        note = f'{datetime.now().strftime("%Y-%m-%d %H:%M")} 经验：{question_text[:120]} -> {answer_text[:180]}'
        if note not in notes:
            notes.append(note)
    session['memoryNotes'] = notes[-20:]
    return session


def compact_session_context(session, recent_limit=8):
    if not session:
        return '暂无当前会话上下文。'
    messages = session.get('messages') or []
    recent = messages[-recent_limit:]
    lines = []
    if session.get('summary'):
        lines.append(f"会话摘要: {session.get('summary')}")
    if session.get('memoryNotes'):
        lines.append('长期记忆:')
        for note in session.get('memoryNotes')[-8:]:
            lines.append(f'- {note}')
    if recent:
        lines.append('最近对话:')
        for item in recent:
            role = '用户' if item.get('role') == 'user' else '助手'
            content = re.sub(r'\s+', ' ', item.get('content') or '').strip()[:600]
            lines.append(f'{role}: {content}')
    return '\n'.join(lines)[:6000] if lines else '暂无当前会话上下文。'


# ─── REAL-TIME FALLBACKS (keep existing) ─────────────────────

def run_cmd(cmd, timeout=10):
    try:
        result = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                universal_newlines=True, timeout=timeout)
        return result.stdout.strip(), result.stderr.strip(), result.returncode
    except Exception as e:
        return '', str(e), 1


def make_health_event(status, text, phase=None, command=None, output=None, exit_code=None):
    event = {
        'time': datetime.now().strftime('%H:%M:%S'),
        'status': status,
        'text': text,
    }
    if phase:
        event['phase'] = phase
    if command:
        event['command'] = command
    if output:
        event['output'] = output[:2000]
    if exit_code is not None:
        event['exitCode'] = exit_code
    return event


def emit_health_event(event_logger, status, text, phase=None, command=None, output=None, exit_code=None):
    if callable(event_logger):
        event_logger(make_health_event(status, text, phase, command, output, exit_code))


def parse_iso(ts):
    for fmt in ('%Y-%m-%dT%H:%M:%S.%f', '%Y-%m-%dT%H:%M:%S'):
        try:
            return datetime.strptime(ts, fmt)
        except Exception:
            continue
    return None


def now_iso():
    return datetime.now().isoformat()


def boot_datetime():
    try:
        with open('/proc/uptime', 'r') as fh:
            uptime_seconds = float((fh.read().split() or ['0'])[0])
        return datetime.now() - timedelta(seconds=uptime_seconds)
    except Exception:
        return datetime.now()


def safe_gb(value):
    return round((value or 0) / 1024 / 1024 / 1024, 2)


def latest_ost_rows():
    return db_query("""
        SELECT timestamp, name, uuid, type, total_bytes, used_bytes, available_bytes, usage_percent, mount, fs_name
        FROM ost_metrics
        WHERE timestamp = (SELECT MAX(timestamp) FROM ost_metrics)
        ORDER BY type, name
    """)


def latest_node_rows():
    rows = db_query("""
        SELECT DISTINCT node_id, nid, status, role
        FROM node_metrics
        WHERE timestamp = (SELECT MAX(timestamp) FROM node_metrics)
        ORDER BY role, node_id
    """)
    seen = {}
    for row in rows:
        if row['node_id'] not in seen:
            seen[row['node_id']] = row
    return list(seen.values())


def latest_perf_snapshot():
    latest = db_query("""
        SELECT SUM(read_mbps) as read_bw, SUM(write_mbps) as write_bw,
               SUM(read_iops) as read_iops, SUM(write_iops) as write_iops
        FROM perf_rates p1
        WHERE p1.timestamp > datetime('now', '-10 minutes')
          AND p1.timestamp = (
              SELECT MAX(timestamp) FROM perf_rates p2 WHERE p2.ost_name = p1.ost_name
          )
    """)
    return latest[0] if latest else {}


def active_alert_rows(limit=5):
    return db_query("""
        SELECT id, timestamp, level, title, message, source
        FROM alerts
        WHERE resolved = 0
        ORDER BY CASE level WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, timestamp DESC
        LIMIT ?
    """, (limit,))


def default_ai_settings():
    return {
        'provider': 'openai',
        'baseUrl': 'https://api.openai.com/v1',
        'apiKey': '',
        'modelId': 'gpt-4o-mini',
        'updatedAt': None,
    }


def normalize_ai_settings(data, existing=None):
    defaults = default_ai_settings()
    merged = dict(defaults)
    existing = existing or {}
    incoming_key = (data or {}).get('apiKey')
    if (data or {}).get('clearApiKey'):
        api_key = ''
    elif incoming_key:
        api_key = incoming_key
    else:
        api_key = existing.get('apiKey') or ''
    merged.update({
        'provider': (data or {}).get('provider') or defaults['provider'],
        'baseUrl': ((data or {}).get('baseUrl') or defaults['baseUrl']).rstrip('/'),
        'apiKey': api_key,
        'modelId': (data or {}).get('modelId') or defaults['modelId'],
        'updatedAt': now_iso(),
    })
    return merged


def public_ai_settings(data):
    settings = dict(data)
    api_key = settings.get('apiKey') or ''
    if api_key:
        settings['apiKeyMasked'] = ('*' * max(len(api_key) - 6, 0)) + api_key[-6:]
    else:
        settings['apiKeyMasked'] = ''
    settings['apiKeyConfigured'] = bool(api_key)
    settings['apiKey'] = ''
    return settings


def latest_component_nodes():
    rows = latest_node_rows()
    names = []
    for row in rows:
        node_id = row.get('node_id') or ''
        if not node_id:
            continue
        canonical = node_id
        component_match = re.match(r'^(lustrefs-(?:OST|MDT)\d{4})', node_id)
        mgc_match = re.match(r'^(MGC[^\s]+)', node_id)
        if component_match:
            canonical = component_match.group(1)
        elif mgc_match:
            canonical = mgc_match.group(1)
        if canonical not in names:
            names.append(canonical)
    return names


def parse_log_timestamp(raw):
    raw = raw.strip()
    now = datetime.now()
    bracket_seconds = re.match(r'^\[(\d+(?:\.\d+)?)\]$', raw)
    if bracket_seconds:
        seconds_since_boot = float(bracket_seconds.group(1))
        parsed = boot_datetime() + timedelta(seconds=seconds_since_boot)
        return parsed.strftime('%Y-%m-%d %H:%M:%S')
    for fmt in ('%Y-%m-%d %H:%M:%S', '%b %d %H:%M:%S'):
        try:
            parsed = datetime.strptime(raw, fmt)
            if fmt == '%b %d %H:%M:%S':
                parsed = parsed.replace(year=now.year)
            return parsed.strftime('%Y-%m-%d %H:%M:%S')
        except Exception:
            continue
    return now.strftime('%Y-%m-%d %H:%M:%S')


def infer_level(line):
    upper = line.upper()
    if 'FATAL' in upper:
        return 'FATAL'
    if 'ERROR' in upper or 'FAILED' in upper:
        return 'ERROR'
    if 'WARN' in upper or 'RECOVERY' in upper or 'SKIPPED' in upper:
        return 'WARN'
    if 'DEBUG' in upper:
        return 'DEBUG'
    return 'INFO'


def is_attention_log(item):
    return (item.get('level') or '').upper() in ('WARN', 'ERROR', 'FATAL')


def infer_node(line):
    component_match = re.search(r'(lustrefs-(?:OST|MDT)\d{4}(?:-[\w-]+)?)', line)
    if component_match:
        return component_match.group(1)
    if 'MGC' in line:
        mgc_match = re.search(r'(MGC[^\s]+)', line)
        if mgc_match:
            return mgc_match.group(1)
    hostname_match = re.match(r'^[A-Z][a-z]{2}\s+\d+\s+\d+:\d+:\d+\s+([^\s]+)', line)
    if hostname_match:
        return hostname_match.group(1)
    return 'lustre-node'


def collect_real_logs(limit=300):
    command = r"""
        (
          journalctl --no-pager -k -n 800 2>/dev/null || true
          journalctl --no-pager -n 800 2>/dev/null || true
          tail -n 800 /var/log/messages 2>/dev/null || true
          dmesg 2>/dev/null || true
        ) \
        | egrep -i 'lustre:|lustrefs-(ost|mdt)|lnet|obdfilter|\bmdt\b|\bost\b|mgc|mgs|\bosc\b|\blov\b|ptlrpc|llite|not a lustre filesystem|cannot find mounted lustre' \
        | egrep -vi '/opt/lustre-data|/opt/Lustre_OPS|/api/|CROND.*collector.py|npm\[' \
        | tail -n 600
    """
    stdout, _, _ = run_cmd(command, timeout=20)
    rows = []
    seen = set()
    lines = stdout.splitlines() if stdout else []
    for index, line in enumerate(reversed(lines)):
        clean = line.strip()
        if not clean:
            continue
        key = clean[-180:]
        if key in seen:
            continue
        seen.add(key)
        timestamp_match = re.match(r'^([A-Z][a-z]{2}\s+\d+\s+\d+:\d+:\d+)', clean)
        bracket_match = re.match(r'^(\[\d+(?:\.\d+)?\])', clean)
        if timestamp_match:
            timestamp = parse_log_timestamp(timestamp_match.group(1))
        elif bracket_match:
            timestamp = parse_log_timestamp(bracket_match.group(1))
        else:
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        level = infer_level(clean)
        node = infer_node(clean)
        source = 'kernel' if 'kernel:' in clean.lower() else 'lustre'
        message = clean
        if 'kernel:' in clean:
            message = clean.split('kernel:', 1)[1].strip()
        rows.append({
            'id': f'log-{int(datetime.now().timestamp())}-{index}',
            'node': node,
            'level': level,
            'message': message,
            'timestamp': timestamp,
            'source': source,
        })
        if len(rows) >= limit:
            break
    rows.reverse()

    node_names = latest_component_nodes()
    unique_nodes = sorted(set(item['node'] for item in rows))
    collection_status = []
    target_nodes = node_names if node_names else unique_nodes
    for node in target_nodes:
        matched = [item for item in rows if item['node'] == node]
        latest_time = matched[-1]['timestamp'] if matched else None
        collection_status.append({
            'node': node,
            'collecting': bool(matched),
            'lastSync': latest_time or '无日志',
            'logSize': f'{len(matched)} 条',
        })

    attention_logs = [item for item in rows if is_attention_log(item)]
    warning_count = len(attention_logs)
    normal_count = len(rows) - warning_count
    total_size_bytes = len('\n'.join(item['message'] for item in rows).encode('utf-8'))
    ai_settings = load_json_file(AI_SETTINGS_PATH, default_ai_settings())
    summary = {
        'collectedAt': now_iso(),
        'totalLogs': len(rows),
        'warningCount': warning_count,
        'normalCount': normal_count,
        'nodeCount': len(target_nodes),
        'coveredNodes': len([item for item in collection_status if item['collecting']]),
        'totalSizeBytes': total_size_bytes,
        'totalSizeLabel': f'{round(total_size_bytes / 1024 / 1024, 2)} MB',
        'todayDeltaLabel': f'+{round(total_size_bytes / 1024 / 1024, 2)} MB',
        'engineStatus': '已配置' if ai_settings.get('apiKey') else '未配置',
        'engineModel': ai_settings.get('modelId') or '未设置',
        'collectionScope': '当前部署节点本机日志与数据库已知节点对象；未主动 SSH 拉取所有 server/client 节点日志',
        'defaultView': 'attention',
    }
    payload = {
        'summary': summary,
        'logs': rows,
        'collectionStatus': collection_status,
    }
    save_json_file(LOG_STATE_PATH, payload)
    return payload


def latest_logs_payload():
    payload = load_json_file(LOG_STATE_PATH, {})
    if payload and payload.get('logs'):
        return payload
    return collect_real_logs()


def test_ai_connection(settings):
    base_url = (settings.get('baseUrl') or '').rstrip('/')
    api_key = settings.get('apiKey') or ''
    if not base_url or not api_key:
        return {'ok': False, 'message': 'URL 和 API Key 不能为空'}
    url = f'{base_url}/models'
    req = urllib_request.Request(url, method='GET')
    req.add_header('Authorization', f'Bearer {api_key}')
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib_request.urlopen(req, timeout=12) as resp:
            body = resp.read().decode('utf-8')
            parsed = json.loads(body) if body else {}
            model_ids = [item.get('id') for item in parsed.get('data', []) if item.get('id')]
            desired = settings.get('modelId') or ''
            if desired and model_ids and desired not in model_ids:
                return {
                    'ok': True,
                    'message': '连接成功，但模型 ID 不在返回列表中',
                    'availableModels': model_ids[:20],
                }
            return {
                'ok': True,
                'message': '连接成功',
                'availableModels': model_ids[:20],
            }
    except urllib_error.HTTPError as e:
        return {'ok': False, 'message': f'HTTP {e.code}'}
    except Exception as e:
        return {'ok': False, 'message': str(e)}


def compact_logs_for_ai(logs, limit=80):
    attention = [item for item in logs if is_attention_log(item)]
    if attention:
        selected = attention[-limit:]
    else:
        selected = logs[-min(limit, 30):] if logs else []
    lines = []
    for item in selected:
        timestamp = item.get('timestamp') or ''
        node = item.get('node') or 'unknown-node'
        level = item.get('level') or 'INFO'
        source = item.get('source') or 'log'
        message = (item.get('message') or '').replace('\n', ' ')[:500]
        lines.append(f'[{timestamp}] [{source}] {node} {level}: {message}')
    return '\n'.join(lines)


def retrieve_log_knowledge(question, logs=None, limit=4):
    ensure_log_knowledge_table()
    query_parts = [question or '']
    for item in (logs or [])[-24:]:
        query_parts.append(item.get('message') or '')
        query_parts.append(item.get('node') or '')
        query_parts.append(item.get('level') or '')
    query_text = '\n'.join(query_parts)
    query_vector = local_embedding(query_text)
    terms = set(re.findall(r'[\w\u4e00-\u9fff-]{2,}', query_text.lower()))
    index = load_vector_index()
    if not index.get('vectors'):
        index = rebuild_knowledge_vector_index()
    scored = []
    for record in index.get('vectors', []):
        haystack = ' '.join([
            record.get('title') or '',
            record.get('heading') or '',
            record.get('content') or '',
            ','.join(record.get('tags') or []),
        ]).lower()
        vector_score = cosine_similarity(query_vector, record.get('vector') or [])
        score = sum(1 for term in terms if term and term in haystack)
        hybrid_score = (vector_score * 8.0) + min(score, 8) * 0.8
        hybrid_score += min(int(record.get('feedbackScore') or 0), 20) * 0.15
        hybrid_score += min(int(record.get('hitCount') or 0), 20) * 0.05
        if hybrid_score > 0.1:
            scored.append((hybrid_score, record))
    scored.sort(key=lambda item: item[0], reverse=True)
    selected = []
    for score, record in scored[:limit]:
        if record.get('kind') == 'case':
            rows = db_query("SELECT * FROM log_knowledge_base WHERE id = ?", (record.get('sourceId'),))
            if not rows:
                continue
            item = knowledge_row_to_dict(rows[0])
            item['kind'] = 'case'
            item['matchId'] = record.get('id')
            item['score'] = round(score, 4)
            selected.append(item)
        else:
            rows = db_query("SELECT * FROM knowledge_chunks WHERE id = ?", (record.get('sourceId'),))
            if not rows:
                continue
            chunk = knowledge_chunk_to_dict(rows[0])
            chunk['kind'] = 'doc_chunk'
            chunk['matchId'] = record.get('id')
            chunk['score'] = round(score, 4)
            selected.append(chunk)
    if selected:
        try:
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            for item in selected:
                if item.get('kind') == 'case':
                    cur.execute(
                        "UPDATE log_knowledge_base SET hit_count = hit_count + 1, updated_at = ? WHERE id = ?",
                        (now_iso(), item.get('id')),
                    )
                elif item.get('kind') == 'doc_chunk':
                    cur.execute(
                        "UPDATE knowledge_chunks SET hit_count = hit_count + 1, updated_at = ? WHERE id = ?",
                        (now_iso(), item.get('id')),
                    )
            conn.commit()
            conn.close()
        except Exception as e:
            print(f'[KNOWLEDGE HIT UPDATE ERROR] {e}')
    return selected


def compact_knowledge_for_ai(items):
    if not items:
        return '暂无命中的本地知识库经验。'
    lines = []
    for item in items:
        kind_label = '故障经验' if item.get('kind') == 'case' else '文档片段'
        lines.append(f"## [{kind_label}] {item.get('title')}")
        if item.get('kind') == 'case':
            lines.append(f"问题: {(item.get('problem') or '')[:500]}")
            lines.append(f"处理办法: {(item.get('solution') or '')[:900]}")
            if item.get('extra_steps'):
                lines.append(f"补充步骤: {item.get('extra_steps')[:700]}")
        else:
            if item.get('heading'):
                lines.append(f"章节: {item.get('heading')}")
            lines.append(f"内容: {(item.get('content') or '')[:1200]}")
        if item.get('tags'):
            lines.append(f"标签: {', '.join(item.get('tags'))}")
        lines.append(f"召回分: {item.get('score', 0)} / 质量分: {item.get('feedback_score', 0)} / 命中次数: {item.get('hit_count', 0)}")
        lines.append('')
    return '\n'.join(lines)[:5000]


def classify_ai_response_mode(question, summary):
    raw = (question or '').strip().lower()
    compact = re.sub(r'[\s\W_]+', '', raw, flags=re.UNICODE)
    warning_count = int((summary or {}).get('warningCount') or 0)

    greetings = {
        'hi', 'hello', 'hey', '你好', '您好', '嗨', '哈喽', '在吗',
        '早上好', '下午好', '晚上好',
    }
    if compact in greetings:
        return 'greeting'

    deep_markers = (
        '详细', '深入', '全面', '完整分析', '逐条分析', '根因分析',
        '排查步骤', '处理步骤', '诊断报告', '命令建议',
    )
    if any(marker in raw for marker in deep_markers):
        return 'deep_analysis'

    if warning_count > 0:
        return 'diagnosis'

    status_markers = (
        '异常', '告警', '错误', '正常', '状态', '日志', '问题',
        '风险', '健康', 'warn', 'error', 'fatal',
    )
    if any(marker in raw for marker in status_markers):
        return 'normal_summary'

    return 'general'


def build_concise_log_reply(mode, summary):
    warning_count = int((summary or {}).get('warningCount') or 0)
    total_logs = int((summary or {}).get('totalLogs') or 0)
    normal_count = int((summary or {}).get('normalCount') or max(total_logs - warning_count, 0))
    covered_nodes = int((summary or {}).get('coveredNodes') or 0)
    node_count = int((summary or {}).get('nodeCount') or 0)

    if mode == 'greeting':
        if warning_count:
            return f'你好，我可以帮你分析 Lustre 日志。当前已采集范围内有 {warning_count} 条日志需要关注。'
        return '你好，我可以帮你分析 Lustre 日志。当前已采集范围内未发现需关注的异常日志。'

    coverage = f'{covered_nodes}/{node_count} 个已采集节点对象' if node_count else '当前已采集数据'
    return (
        f'当前已采集范围内未发现 WARN、ERROR 或 FATAL 日志，共 {normal_count} 条普通日志。'
        f'该结论仅覆盖 {coverage}。'
    )


def response_policy_for_mode(mode):
    if mode in ('diagnosis', 'deep_analysis'):
        return (
            '本条响应策略优先于其他格式要求：这是异常或用户明确要求的深度分析，'
            '可以使用完整诊断结构，但只保留有实际内容的章节，禁止用常识性建议凑篇幅。'
        )
    return (
        '本条响应策略优先于其他格式要求：直接回答用户当前问题，默认使用 1-5 句话；'
        '不要输出结论、风险等级、可能原因、排查步骤等整套诊断模板，除非用户明确要求。'
    )


def call_ai_chat(settings, question, payload, session_context=None, agent_config=None):
    summary = payload.get('summary') or {}
    response_mode = classify_ai_response_mode(question, summary)
    if response_mode in ('greeting', 'normal_summary'):
        return {
            'ok': True,
            'answer': build_concise_log_reply(response_mode, summary),
            'model': '',
            'provider': 'local-policy',
            'knowledgeMatches': [],
            'usage': {},
            'responseMode': response_mode,
        }

    base_url = (settings.get('baseUrl') or '').rstrip('/')
    api_key = settings.get('apiKey') or ''
    model_id = settings.get('modelId') or ''
    if not base_url or not api_key or not model_id:
        return {'ok': False, 'message': 'AI 模型未配置完整，请先保存 Base URL、API Key 和 Model ID'}

    logs_text = compact_logs_for_ai(payload.get('logs') or [], limit=90)
    knowledge_items = retrieve_log_knowledge(question, payload.get('logs') or [], limit=4)
    knowledge_text = compact_knowledge_for_ai(knowledge_items)
    agent_config = agent_config or load_agent_config()
    session_text = compact_session_context(session_context) if session_context else '暂无当前会话上下文。'
    analysis_scope = '异常/告警/错误日志' if summary.get('warningCount') else '最近普通日志摘要'
    system_prompt = agent_config.get('systemPrompt') or DEFAULT_AGENT_SYSTEM_PROMPT
    user_prompt = f"""用户问题:
{question}

当前会话长期记忆与上下文:
{session_text}

当前日志采集摘要:
- 覆盖节点对象: {summary.get('coveredNodes')}/{summary.get('nodeCount')}
- 日志总数: {summary.get('totalLogs')}
- 告警/错误数: {summary.get('warningCount')}
- 普通日志数: {summary.get('normalCount')}
- 当前分析范围: {analysis_scope}
- 采集范围说明: {summary.get('collectionScope')}
- 最近采集时间: {summary.get('collectedAt')}
- 模型配置状态: {summary.get('engineStatus')} / {summary.get('engineModel')}

最近{analysis_scope}上下文:
{logs_text or '暂无日志'}

本地知识库命中经验:
{knowledge_text}
"""

    body = {
        'model': model_id,
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {
                'role': 'system',
                'content': response_policy_for_mode(response_mode) + (
                    '必须严格使用本次提示中的日志总数、告警数、普通日志数和日志内容；'
                    '如果告警/错误数为 0，不要编造异常；涉及重启、挂载、删除数据、修改网络或配置时，'
                    '只能给出人工确认步骤。'
                ),
            },
            {'role': 'user', 'content': user_prompt},
        ],
        'temperature': 0.2,
        'max_tokens': 1600,
    }
    req = urllib_request.Request(
        f'{base_url}/chat/completions',
        data=json.dumps(body).encode('utf-8'),
        method='POST',
    )
    req.add_header('Authorization', f'Bearer {api_key}')
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib_request.urlopen(req, timeout=45) as resp:
            raw = resp.read().decode('utf-8')
            parsed = json.loads(raw) if raw else {}
            content = ''
            choices = parsed.get('choices') or []
            if choices:
                message = choices[0].get('message') or {}
                content = message.get('content') or choices[0].get('text') or ''
            if not content:
                return {'ok': False, 'message': '模型接口返回为空，未获取到可展示的回答'}
            return {
                'ok': True,
                'answer': content.strip(),
                'model': model_id,
                'provider': settings.get('provider') or 'custom',
                'knowledgeMatches': knowledge_items,
                'usage': parsed.get('usage') or {},
                'responseMode': response_mode,
            }
    except urllib_error.HTTPError as e:
        detail = ''
        try:
            detail = e.read().decode('utf-8')[:500]
        except Exception:
            detail = ''
        return {'ok': False, 'message': f'模型接口 HTTP {e.code}: {detail or e.reason}'}
    except Exception as e:
        return {'ok': False, 'message': f'模型接口调用失败: {e}'}


def health_status_label(score):
    if score >= 90:
        return 'passed'
    if score >= 70:
        return 'warning'
    return 'failed'


def build_ai_diagnosis(findings, cluster, timestamp):
    if not findings:
        return '\n'.join([
            f'本次巡检时间: {timestamp}',
            f'集群 {cluster} 当前未发现明显异常。',
            '建议继续保持现有监控频率，并定期复核容量增长与性能趋势。',
        ])

    lines = [
        f'本次巡检时间: {timestamp}',
        f'集群 {cluster} 共发现 {len(findings)} 项需要关注的实际问题。',
        '',
        '优先处理建议:',
    ]
    for index, finding in enumerate(findings[:3], start=1):
        lines.append(f'{index}. {finding["title"]} - {finding["recommendation"]}')
    lines.extend([
        '',
        '处置顺序建议:',
        '① 先处理紧急和容量类问题，避免影响业务写入。',
        '② 再检查网络与性能项，确认是否存在连锁影响。',
        '③ 最后复核配置和日志，确保问题没有持续扩大。',
    ])
    return '\n'.join(lines)


REMEDIATION_ACTIONS = {
    'cluster-status': {
        'actionId': 'lustre-service-precheck',
        'title': 'Lustre 服务状态修复预检',
        'risk': 'high',
        'canAutoFix': False,
        'summary': '该问题可能涉及 MGS/MDS/OSS 服务、客户端挂载或底层网络。系统会先执行只读检查，真正重启或挂载需管理员确认后手动执行。',
        'safeCommands': [
            {'label': '检查 Lustre 服务状态', 'command': 'lfs check servers', 'timeout': 20},
            {'label': '检查客户端挂载点', 'command': f'mountpoint {LUSTRE_CLIENT} && findmnt {LUSTRE_CLIENT} || true', 'timeout': 10},
            {'label': '检查内核 Lustre 日志', 'command': "journalctl --no-pager -k -n 120 | egrep -i 'lustre|lnet|mgs|mds|oss|ost' | tail -60 || true", 'timeout': 15},
        ],
        'manualSteps': [
            '确认 MGS、MDS、OSS 节点是否在线，优先检查管理节点和元数据服务。',
            '在受影响节点执行 `lfs check servers`，确认失败组件名称和返回错误。',
            f'检查 `{LUSTRE_CLIENT}` 是否已挂载；未挂载时先确认网络、MGS NID 和挂载参数。',
            '如确认为单个服务异常，按变更窗口执行服务重启或挂载恢复，不要直接批量重启全部节点。',
            '恢复后重新执行巡检，并观察 10-15 分钟告警是否继续出现。',
        ],
        'validationSteps': [
            '`lfs check servers` 返回正常。',
            f'`mountpoint {LUSTRE_CLIENT}` 返回成功。',
            '巡检页集群状态由失败恢复为通过或警告。',
        ],
    },
    'network-nids': {
        'actionId': 'lnet-nid-precheck',
        'title': 'LNet/NID 修复预检',
        'risk': 'high',
        'canAutoFix': False,
        'summary': 'NID 丢失通常与 LNet 配置、网卡、驱动或网络链路有关。系统只做只读检查，不自动修改 LNet 配置。',
        'safeCommands': [
            {'label': '查看本机 NID', 'command': 'lctl list_nids 2>/dev/null || true', 'timeout': 10},
            {'label': '查看 LNet 网络', 'command': 'lnetctl net show 2>/dev/null || true', 'timeout': 10},
            {'label': '查看网络设备状态', 'command': "ip -brief link | egrep -i 'ib|en|eth|bond|roce' || true", 'timeout': 10},
        ],
        'manualSteps': [
            '确认 IB/RoCE/TCP 网络设备是否 UP，检查交换机端口和链路灯状态。',
            '核对 `/etc/modprobe.d`、`/etc/lnet.conf` 或系统实际 LNet 配置是否符合集群规划。',
            '必要时在维护窗口重新加载 LNet 或重启相关网络服务，避免业务高峰操作。',
            '确认 MGS、客户端和 OSS 的 NID 路由一致，避免只恢复单端。',
        ],
        'validationSteps': [
            '`lctl list_nids` 能返回有效 NID。',
            '`lnetctl net show` 能看到预期网络。',
            '巡检页网络健康恢复为通过。',
        ],
    },
    'config-single-node': {
        'actionId': 'collector-coverage-precheck',
        'title': '采集覆盖修复预检',
        'risk': 'medium',
        'canAutoFix': False,
        'summary': '当前只检测到单节点指标，常见原因是采集脚本未部署到全部节点或数据库未写入。系统先检查本机采集数据和服务状态。',
        'safeCommands': [
            {'label': '统计节点指标数量', 'command': "sqlite3 /opt/lustre-data/lustre.db \"select count(distinct node_id) from node_metrics;\" 2>/dev/null || true", 'timeout': 10},
            {'label': '查看采集相关进程', 'command': "ps -ef | egrep -i 'lustre|collect|metric' | grep -v grep || true", 'timeout': 10},
        ],
        'manualSteps': [
            '确认采集脚本是否已在所有 MDS/OSS/客户端节点部署。',
            '检查各节点到数据库或采集网关的网络连通性。',
            '对缺失节点重启采集服务或重新部署采集任务。',
            '等待至少一个采集周期后重新巡检。',
        ],
        'validationSteps': [
            '数据库中 `node_metrics` 出现多个不同节点。',
            '配置一致性检查可执行跨节点比对。',
        ],
    },
    'alert': {
        'actionId': 'alert-context-precheck',
        'title': '告警上下文收集',
        'risk': 'medium',
        'canAutoFix': False,
        'summary': '活跃告警需要先确认上下文，系统会收集最近日志和告警记录，避免直接静默或误确认。',
        'safeCommands': [
            {'label': '查看最近 Lustre 日志', 'command': "journalctl --no-pager -k -n 160 | egrep -i 'lustre|lnet|error|failed|timeout|recovery' | tail -80 || true", 'timeout': 15},
            {'label': '查看活跃告警数量', 'command': "sqlite3 /opt/lustre-data/lustre.db \"select level, count(*) from alerts where resolved=0 group by level;\" 2>/dev/null || true", 'timeout': 10},
        ],
        'manualSteps': [
            '先按严重级别和持续时间确认是否影响业务。',
            '查看告警对象的最近日志，确认是否为同一根因反复触发。',
            '处理根因后再确认告警；不要在根因未处理前直接静默。',
            '如果告警来自误报，调整阈值或采集规则，并记录变更原因。',
        ],
        'validationSteps': [
            '相关告警不再持续新增。',
            '日志中无新的同类 ERROR/FATAL。',
            '重新巡检后日志异常评分提升。',
        ],
    },
    'ost-capacity': {
        'actionId': 'ost-capacity-precheck',
        'title': 'OST 容量修复预检',
        'risk': 'high',
        'canAutoFix': False,
        'summary': '容量修复可能涉及删除、迁移或扩容，系统只做容量画像和热点确认，不自动删除数据。',
        'safeCommands': [
            {'label': '查看 Lustre 容量', 'command': f'lfs df -h {LUSTRE_CLIENT} 2>/dev/null || lfs df -h 2>/dev/null || true', 'timeout': 15},
            {'label': '查看 inode 使用', 'command': f'lfs df -i {LUSTRE_CLIENT} 2>/dev/null || true', 'timeout': 15},
        ],
        'manualSteps': [
            '确认高水位 OST 名称和业务影响范围。',
            '查找近期增长最快目录，优先和业务方确认可清理数据。',
            '如需要迁移热点目录，先制定回滚方案并避开高峰期。',
            '容量超过 90% 时优先扩容或迁移，不建议只依赖临时清理。',
        ],
        'validationSteps': [
            '目标 OST 使用率低于告警阈值。',
            '写入业务无 ENOSPC 或高延迟错误。',
            '容量趋势恢复到可接受增长范围。',
        ],
    },
}


def remediation_key_for_finding(finding_id):
    if finding_id == 'cluster-status':
        return 'cluster-status'
    if finding_id == 'network-nids':
        return 'network-nids'
    if finding_id == 'config-single-node':
        return 'config-single-node'
    if finding_id.startswith('alert-'):
        return 'alert'
    if finding_id.startswith('ost-'):
        return 'ost-capacity'
    return 'alert'


def build_remediation_for_finding(finding):
    key = remediation_key_for_finding(finding.get('id') or '')
    plan = dict(REMEDIATION_ACTIONS.get(key) or REMEDIATION_ACTIONS['alert'])
    plan['findingId'] = finding.get('id')
    plan['affectedNodes'] = finding.get('affectedNodes') or []
    plan['commands'] = [{'label': c['label'], 'command': c['command'], 'danger': False} for c in plan.get('safeCommands', [])]
    plan.pop('safeCommands', None)
    return plan


def run_remediation_precheck(plan):
    results = []
    for command in plan.get('safeCommands', []):
        stdout, stderr, rc = run_cmd(command['command'], timeout=command.get('timeout', 10))
        output = stdout if stdout else stderr
        results.append({
            'label': command['label'],
            'command': command['command'],
            'exitCode': rc,
            'ok': rc == 0,
            'output': (output or '').strip()[:3000],
        })
    return results


def run_health_probe(event_logger, phase, label, command, timeout=10, require_output=False, error_on_rc=False):
    emit_health_event(
        event_logger,
        'running',
        f'执行 {label}: {command}',
        phase=phase,
        command=command,
    )
    stdout, stderr, rc = run_cmd(command, timeout=timeout)
    output = stdout if stdout else stderr
    output_ok = bool((output or '').strip()) if require_output else True
    ok = rc == 0 and output_ok
    status = 'done' if ok else 'error' if error_on_rc else 'warning'
    if ok:
        text = f'{label}完成'
    elif rc != 0:
        text = f'{label}返回异常'
    else:
        text = f'{label}未返回有效输出'
    emit_health_event(
        event_logger,
        status,
        text,
        phase=phase,
        command=command,
        output=output,
        exit_code=rc,
    )
    return {
        'label': label,
        'command': command,
        'output': (output or '').strip(),
        'exit_code': rc,
        'ok': ok,
        'status': status,
    }


def build_health_check_payload(run_live=True, event_logger=None):
    started = datetime.now()
    timestamp = now_iso()
    emit_health_event(event_logger, 'running', '开始执行 Lustre 集群健康巡检', phase='start')
    probe_results = {}

    if run_live:
        probe_results['servers'] = run_health_probe(
            event_logger,
            'cluster',
            'Lustre 服务状态检查',
            'lfs check servers',
            timeout=20,
            require_output=True,
            error_on_rc=True,
        )
        server_text = probe_results['servers']['output']
        server_rc = probe_results['servers']['exit_code']

        active_mount = detect_lustre_mount()
        probe_results['mount'] = run_health_probe(
            event_logger,
            'cluster',
            f'客户端挂载点检查 {active_mount}',
            f'mountpoint {active_mount} && findmnt {active_mount}',
            timeout=10,
            require_output=True,
            error_on_rc=True,
        )
        mounted = lustre_mounted() and probe_results['mount']['exit_code'] == 0
        healthy = server_rc == 0 and mounted

        probe_results['client_df'] = run_health_probe(
            event_logger,
            'cluster',
            '客户端文件系统可访问性检查',
            f'lfs df -h {active_mount} 2>&1',
            timeout=15,
            require_output=True,
            error_on_rc=True,
        )
        probe_results['lustre_version'] = run_health_probe(
            event_logger,
            'cluster',
            'Lustre 内核模块版本检查',
            "lctl get_param -n version 2>/dev/null || cat /sys/module/lustre/version 2>/dev/null || true",
            timeout=10,
            require_output=True,
        )
        probe_results['modules'] = run_health_probe(
            event_logger,
            'cluster',
            'Lustre/LNet 模块加载检查',
            "lsmod | egrep 'lustre|lnet|obdclass|ptlrpc|ksocklnd|ko2iblnd' || true",
            timeout=10,
            require_output=True,
        )

        probe_results['nids'] = run_health_probe(
            event_logger,
            'network',
            'LNet NID 检查',
            'lctl list_nids 2>/dev/null || true',
            timeout=10,
            require_output=True,
            error_on_rc=True,
        )
        nids_output = probe_results['nids']['output']
        probe_results['lnet'] = run_health_probe(
            event_logger,
            'network',
            'LNet 网络详情检查',
            'lnetctl net show 2>/dev/null || true',
            timeout=10,
            require_output=True,
        )
        probe_results['ip_link'] = run_health_probe(
            event_logger,
            'network',
            '网络接口状态检查',
            "ip -brief addr | egrep -i 'ib|en|eth|bond|roce|tcp' || true",
            timeout=10,
            require_output=True,
        )
    else:
        emit_health_event(event_logger, 'running', '读取最近一次已保存巡检结果', phase='start')
        latest = db_query("""
            SELECT healthy, servers_output, mounted, score, client_mount, timestamp
            FROM health_checks
            ORDER BY timestamp DESC LIMIT 1
        """)
        if latest:
            latest_row = latest[0]
            healthy = bool(latest_row['healthy'])
            mounted = bool(latest_row['mounted'])
            server_text = latest_row['servers_output'] or ''
            timestamp = latest_row['timestamp']
        else:
            emit_health_event(event_logger, 'running', '无历史巡检记录，执行实时 Lustre 服务检查', phase='cluster', command='lfs check servers')
            server_text, _, server_rc = run_cmd('lfs check servers', timeout=20)
            mounted = lustre_mounted()
            healthy = server_rc == 0 and mounted
        emit_health_event(event_logger, 'running', '读取 LNet NID: lctl list_nids', phase='network', command='lctl list_nids 2>/dev/null || true')
        nids_output, _, _ = run_cmd('lctl list_nids 2>/dev/null || true', timeout=10)

    emit_health_event(event_logger, 'running', '读取 OST 容量快照', phase='storage')
    ost_rows = latest_ost_rows()
    summary_row = next((row for row in ost_rows if row['type'] == 'SUMMARY'), None)
    ost_only = [row for row in ost_rows if row['type'] == 'OST']
    emit_health_event(event_logger, 'done', f'容量快照读取完成，发现 {len(ost_only)} 个 OST 指标', phase='storage')
    emit_health_event(
        event_logger,
        'running',
        f'执行 inode 使用率检查: lfs df -i {LUSTRE_CLIENT}',
        phase='storage',
        command=f'lfs df -i {LUSTRE_CLIENT} 2>/dev/null || true',
    )
    inode_stdout, _, _ = run_cmd(f'lfs df -i {LUSTRE_CLIENT} 2>/dev/null || true', timeout=10)
    emit_health_event(event_logger, 'done' if inode_stdout else 'warning', 'inode 使用率检查完成' if inode_stdout else 'inode 命令未返回有效输出', phase='storage', output=inode_stdout)

    if run_live:
        probe_results['osts'] = run_health_probe(
            event_logger,
            'storage',
            'OST 列表检查',
            f'lfs osts {LUSTRE_CLIENT} 2>/dev/null || true',
            timeout=10,
            require_output=True,
        )
        probe_results['stripe'] = run_health_probe(
            event_logger,
            'storage',
            '默认条带策略检查',
            f'lfs getstripe -d {LUSTRE_CLIENT} 2>/dev/null || true',
            timeout=10,
            require_output=True,
        )
        probe_results['target_mounts'] = run_health_probe(
            event_logger,
            'storage',
            '本机 Lustre target 挂载检查',
            "findmnt -t lustre -o TARGET,SOURCE,FSTYPE,OPTIONS 2>/dev/null || true",
            timeout=10,
            require_output=True,
        )

        probe_results['fstab'] = run_health_probe(
            event_logger,
            'config',
            'fstab Lustre 配置检查',
            f"grep -nE 'lustre|{LUSTRE_CLIENT}|mgt_pool|mdt_pool|ost[0-9]_pool' /etc/fstab 2>/dev/null || true",
            timeout=10,
            require_output=True,
        )
        probe_results['lnet_conf'] = run_health_probe(
            event_logger,
            'config',
            'LNet 持久化配置检查',
            "test -f /etc/lnet.conf && sed -n '1,120p' /etc/lnet.conf || echo '未发现 /etc/lnet.conf'",
            timeout=10,
            require_output=True,
        )
        probe_results['collector_process'] = run_health_probe(
            event_logger,
            'config',
            '采集与 Lustre 相关进程检查',
            "ps -eo pid,comm,args | egrep -i 'lustre|collect|metric|python|node' | grep -v egrep | head -80 || true",
            timeout=10,
            require_output=True,
        )

        probe_results['kernel_lustre_logs'] = run_health_probe(
            event_logger,
            'logs',
            '最近 2 小时 Lustre/LNet 内核日志检查',
            "journalctl --no-pager -k --since '-2 hours' | egrep -i 'lustre|lnet|mgs|mdt|ost|error|failed|timeout|recovery|evict' | tail -120 || true",
            timeout=15,
            require_output=False,
        )
        probe_results['system_warnings'] = run_health_probe(
            event_logger,
            'logs',
            '最近 2 小时系统警告检查',
            "journalctl --no-pager -p warning --since '-2 hours' | tail -80 || true",
            timeout=15,
            require_output=False,
        )

    emit_health_event(event_logger, 'running', '读取最近性能快照', phase='performance')
    perf = latest_perf_snapshot()
    emit_health_event(event_logger, 'done', f'性能快照读取完成，读 {round(perf.get("read_bw") or 0, 2)} MB/s，写 {round(perf.get("write_bw") or 0, 2)} MB/s', phase='performance')
    emit_health_event(event_logger, 'running', '读取节点指标和活跃告警', phase='logs')
    nodes = latest_node_rows()
    alerts = active_alert_rows()
    emit_health_event(event_logger, 'done' if not alerts else 'warning', f'读取到 {len(nodes)} 个节点指标，{len(alerts)} 条活跃告警', phase='logs')

    findings = []
    execution_logs = []

    if healthy:
        execution_logs.append({'time': timestamp[11:19], 'status': 'done', 'text': 'Lustre 服务检查通过'})
    else:
        execution_logs.append({'time': timestamp[11:19], 'status': 'error', 'text': 'Lustre 服务检查失败'})
        findings.append({
            'id': 'cluster-status',
            'category': '集群状态',
            'severity': 'critical',
            'title': 'Lustre 服务状态异常',
            'description': server_text or 'lfs check servers 返回异常',
            'affectedNodes': ['lustre-cluster'],
            'recommendation': '先检查 MGS/MDS/OSS 服务状态和客户端挂载状态。',
        })

    max_ost = max(ost_only, key=lambda row: row.get('usage_percent') or 0) if ost_only else None
    if max_ost and (max_ost.get('usage_percent') or 0) >= 80:
        findings.append({
            'id': f'ost-{max_ost["name"]}',
            'category': '存储容量',
            'severity': 'warning' if (max_ost.get('usage_percent') or 0) < 90 else 'critical',
            'title': f'{max_ost["name"]} 使用率 {round(max_ost.get("usage_percent") or 0, 1)}%',
            'description': f'当前 OST {max_ost["name"]} 使用率较高，可能影响后续写入和容量余量。',
            'affectedNodes': [max_ost['name']],
            'recommendation': '建议清理旧数据或尽快扩容对应 OST。',
        })
        execution_logs.append({'time': timestamp[11:19], 'status': 'warning', 'text': f'{max_ost["name"]} 使用率偏高'})
    elif max_ost:
        execution_logs.append({'time': timestamp[11:19], 'status': 'done', 'text': f'OST 最大使用率 {round(max_ost.get("usage_percent") or 0, 1)}%'})

    total_bw = round((perf.get('read_bw') or 0) + (perf.get('write_bw') or 0), 2)
    execution_logs.append({'time': timestamp[11:19], 'status': 'info', 'text': f'最近 10 分钟总带宽 {total_bw} MB/s'})

    if not nids_output.strip():
        findings.append({
            'id': 'network-nids',
            'category': '网络健康',
            'severity': 'critical',
            'title': '未获取到有效 NID',
            'description': 'lctl list_nids 未返回有效结果，LNet 网络状态异常或未配置。',
            'affectedNodes': ['lnet'],
            'recommendation': '请检查 LNet 配置与网络链路状态。',
        })
        execution_logs.append({'time': timestamp[11:19], 'status': 'error', 'text': '未检测到有效 NID'})
    else:
        execution_logs.append({'time': timestamp[11:19], 'status': 'done', 'text': f'检测到 NID: {nids_output.splitlines()[0]}'})

    for index, alert in enumerate(alerts):
        severity = 'warning'
        if alert['level'] == 'critical':
            severity = 'critical'
        elif alert['level'] not in ('critical', 'warning'):
            severity = 'info'
        findings.append({
            'id': f'alert-{alert["id"]}',
            'category': '日志异常',
            'severity': severity,
            'title': alert['title'],
            'description': alert['message'] or alert['title'],
            'affectedNodes': [alert.get('source') or 'alerts'],
            'recommendation': '建议优先处理当前活跃告警，并复核相关日志上下文。',
        })
        if index < 3:
            execution_logs.append({'time': alert['timestamp'][11:19] if alert.get('timestamp') else timestamp[11:19], 'status': 'warning', 'text': f'发现活跃告警: {alert["title"]}'})

    if len(nodes) <= 1:
        findings.append({
            'id': 'config-single-node',
            'category': '配置一致性',
            'severity': 'info',
            'title': '当前仅检测到单节点指标',
            'description': '数据库中仅发现 1 个节点的最新指标，无法执行跨节点一致性比对。',
            'affectedNodes': [nodes[0]['node_id'] if nodes else 'node_metrics'],
            'recommendation': '如集群应有多节点，请确认采集脚本是否已覆盖全部节点。',
        })

    if run_live:
        if not probe_results.get('client_df', {}).get('ok', True):
            findings.append({
                'id': 'cluster-client-access',
                'category': '集群状态',
                'severity': 'critical',
                'title': '客户端文件系统访问异常',
                'description': probe_results.get('client_df', {}).get('output') or 'lfs df 未返回有效输出',
                'affectedNodes': [LUSTRE_CLIENT],
                'recommendation': '先确认客户端挂载、MGS NID、LNet 网络和服务端 target 状态，禁止直接批量重启。',
            })

        if not probe_results.get('lnet', {}).get('ok', True):
            findings.append({
                'id': 'network-lnet-detail',
                'category': '网络健康',
                'severity': 'warning',
                'title': 'LNet 网络详情不完整',
                'description': probe_results.get('lnet', {}).get('output') or 'lnetctl net show 未返回有效输出',
                'affectedNodes': ['lnet'],
                'recommendation': '人工核对 LNet 配置、网卡状态和节点间 NID 规划。',
            })

        target_output = (probe_results.get('target_mounts', {}).get('output') or '').lower()
        if target_output and not any(token in target_output for token in ('mgt_pool', 'mdt_pool', 'ost', 'lustre-targets')):
            findings.append({
                'id': 'storage-target-mounts',
                'category': '存储容量',
                'severity': 'warning',
                'title': '未识别到预期 Lustre target 挂载',
                'description': probe_results.get('target_mounts', {}).get('output') or 'findmnt 未返回 target 信息',
                'affectedNodes': ['mds-oss-targets'],
                'recommendation': '确认 MGT/MDT/OST target 是否在预期节点挂载，避免只看客户端挂载状态。',
            })

        fstab_output = probe_results.get('fstab', {}).get('output') or ''
        if LUSTRE_CLIENT not in fstab_output:
            findings.append({
                'id': 'config-fstab-client',
                'category': '配置一致性',
                'severity': 'warning',
                'title': 'fstab 中未发现客户端挂载项',
                'description': '巡检未在 /etc/fstab 中识别到当前客户端挂载点配置。',
                'affectedNodes': [LUSTRE_CLIENT],
                'recommendation': '人工确认客户端自动挂载策略；如不依赖 fstab，请记录实际 systemd/autofs 挂载方式。',
            })

        lnet_conf_output = probe_results.get('lnet_conf', {}).get('output') or ''
        if '未发现 /etc/lnet.conf' in lnet_conf_output:
            findings.append({
                'id': 'config-lnet-persistence',
                'category': '配置一致性',
                'severity': 'warning',
                'title': '未发现 LNet 持久化配置文件',
                'description': '巡检未发现 /etc/lnet.conf，节点重启后 LNet 配置可能依赖其他机制恢复。',
                'affectedNodes': ['lnet'],
                'recommendation': '人工确认 LNet 持久化方式，确保重启后 NID 和网络类型符合规划。',
            })

        recent_lustre_logs = (probe_results.get('kernel_lustre_logs', {}).get('output') or '').lower()
        if any(token in recent_lustre_logs for token in ('error', 'failed', 'timeout', 'evict')):
            findings.append({
                'id': 'logs-recent-lustre-kernel',
                'category': '日志异常',
                'severity': 'warning',
                'title': '最近 Lustre/LNet 内核日志存在异常关键字',
                'description': (probe_results.get('kernel_lustre_logs', {}).get('output') or '')[:1000],
                'affectedNodes': ['kernel-log'],
                'recommendation': '进入日志中心按节点、时间和级别筛选最近异常，确认是否为已恢复事件或持续问题。',
            })

    for finding in findings:
        finding['remediation'] = build_remediation_for_finding(finding)

    probe_bad = lambda name: run_live and not probe_results.get(name, {}).get('ok', True)
    kernel_warning_present = run_live and any(
        token in (probe_results.get('kernel_lustre_logs', {}).get('output') or '').lower()
        for token in ('error', 'failed', 'timeout', 'evict')
    )

    cluster_checks = 5
    cluster_failed = int(not healthy) + int(probe_bad('client_df'))
    cluster_warnings = int(probe_bad('lustre_version')) + int(probe_bad('modules'))
    cluster_failed = min(cluster_failed, cluster_checks)
    cluster_warnings = min(cluster_warnings, max(0, cluster_checks - cluster_failed))
    cluster_passed = max(0, cluster_checks - cluster_failed - cluster_warnings)
    cluster_score = max(35, 100 - cluster_failed * 28 - cluster_warnings * 8)

    perf_checks = 3
    perf_warnings = 0 if total_bw > 0 else 1
    perf_failed = 0
    perf_passed = perf_checks - perf_warnings - perf_failed
    perf_score = 95 if total_bw > 100 else 88 if total_bw > 0 else 72

    storage_checks = 6
    storage_warning = int(bool(max_ost and (max_ost.get('usage_percent') or 0) >= 80)) + int(probe_bad('osts')) + int(probe_bad('stripe')) + int(probe_bad('target_mounts'))
    storage_failed = 1 if max_ost and (max_ost.get('usage_percent') or 0) >= 90 else 0
    storage_failed = min(storage_failed, storage_checks)
    storage_warning = min(storage_warning, max(0, storage_checks - storage_failed))
    storage_passed = max(0, storage_checks - storage_warning - storage_failed)
    storage_score = max(45, 96 - storage_warning * 6 - storage_failed * 25)

    network_checks = 3
    network_failed = 0 if nids_output.strip() else 1
    network_warning = int(probe_bad('lnet')) + int(probe_bad('ip_link'))
    network_failed = min(network_failed, network_checks)
    network_warning = min(network_warning, max(0, network_checks - network_failed))
    network_passed = max(0, network_checks - network_failed - network_warning)
    network_score = max(35, 96 - network_failed * 45 - network_warning * 8)

    config_checks = 4
    config_warning = int(len(nodes) <= 1) + int(probe_bad('fstab')) + int('未发现 /etc/lnet.conf' in (probe_results.get('lnet_conf', {}).get('output') or ''))
    config_failed = 0
    config_warning = min(config_warning, config_checks)
    config_passed = max(0, config_checks - config_warning)
    config_score = max(60, 92 - config_warning * 8)

    log_checks = 3
    critical_alerts = len([alert for alert in alerts if alert['level'] == 'critical'])
    log_warning = int(bool(alerts)) + int(kernel_warning_present)
    log_failed = 1 if critical_alerts else 0
    log_failed = min(log_failed, log_checks)
    log_warning = min(log_warning, max(0, log_checks - log_failed))
    log_passed = max(0, log_checks - log_warning - log_failed)
    log_score = max(50, 95 - log_warning * 12 - log_failed * 25)

    categories = [
        {'name': '集群状态', 'score': cluster_score, 'status': health_status_label(cluster_score), 'checks': cluster_checks, 'passed': cluster_passed, 'warnings': cluster_warnings, 'failed': cluster_failed},
        {'name': '性能指标', 'score': perf_score, 'status': health_status_label(perf_score), 'checks': perf_checks, 'passed': perf_passed, 'warnings': perf_warnings, 'failed': perf_failed},
        {'name': '存储容量', 'score': storage_score, 'status': health_status_label(storage_score), 'checks': storage_checks, 'passed': storage_passed, 'warnings': storage_warning, 'failed': storage_failed},
        {'name': '网络健康', 'score': network_score, 'status': health_status_label(network_score), 'checks': network_checks, 'passed': network_passed, 'warnings': network_warning, 'failed': network_failed},
        {'name': '配置一致性', 'score': config_score, 'status': health_status_label(config_score), 'checks': config_checks, 'passed': config_passed, 'warnings': config_warning, 'failed': config_failed},
        {'name': '日志异常', 'score': log_score, 'status': health_status_label(log_score), 'checks': log_checks, 'passed': log_passed, 'warnings': log_warning, 'failed': log_failed},
    ]

    overall_score = round(sum(category['score'] for category in categories) / len(categories))
    checks_passed = sum(category['passed'] for category in categories)
    checks_failed = sum(category['failed'] for category in categories)
    checks_warned = sum(category['warnings'] for category in categories)

    steps = []
    step_defs = [
        ('集群状态', cluster_checks),
        ('性能指标', perf_checks),
        ('存储容量', storage_checks),
        ('网络健康', network_checks),
        ('配置一致性', config_checks),
        ('日志异常', log_checks),
    ]
    for index, category in enumerate(categories):
        step_name, total_checks = step_defs[index]
        status = 'done'
        if category['failed'] > 0:
            status = 'error'
        elif category['warnings'] > 0:
            status = 'warning'
        steps.append({
            'id': f'step-{index + 1}',
            'name': step_name,
            'status': status,
            'progress': 100,
            'totalChecks': total_checks,
            'completedChecks': total_checks,
        })

    ai_diagnosis = build_ai_diagnosis(findings, 'lustre-cluster-01', timestamp)
    emit_health_event(event_logger, 'done' if not findings else 'warning', f'巡检分析完成，生成 {len(findings[:8])} 条详细发现', phase='summary')

    if run_live:
        try:
            emit_health_event(event_logger, 'running', '写入 health_checks 巡检历史表', phase='database')
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO health_checks (timestamp, healthy, servers_output, mounted, score, client_mount)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (timestamp, 1 if healthy else 0, server_text, 1 if mounted else 0, overall_score, LUSTRE_CLIENT))
            conn.commit()
            conn.close()
            emit_health_event(event_logger, 'done', '巡检历史写入完成', phase='database')
        except Exception as e:
            print(f'[HEALTH INSERT ERROR] {e}')
            emit_health_event(event_logger, 'error', f'巡检历史写入失败: {e}', phase='database')

    duration_sec = max(1, int((datetime.now() - started).total_seconds()))
    emit_health_event(event_logger, 'done', f'巡检任务完成，耗时 {duration_sec} 秒', phase='summary')
    payload = {
        'timestamp': timestamp,
        'duration_sec': duration_sec,
        'cluster': 'lustre-cluster-01',
        'overallScore': overall_score,
        'checksPassed': checks_passed,
        'checksFailed': checks_failed,
        'checksWarned': checks_warned,
        'categories': categories,
        'findings': findings[:8],
        'steps': steps,
        'aiDiagnosisText': ai_diagnosis,
        'executionLogs': execution_logs[:12],
        'summary': {
            'healthy': healthy,
            'mounted': mounted,
            'node_count': len(nodes),
            'ost_count': len(ost_only),
            'max_ost_usage_percent': round(max_ost.get('usage_percent') or 0, 1) if max_ost else None,
            'total_capacity_gb': safe_gb(summary_row['total_bytes']) if summary_row else None,
            'used_capacity_gb': safe_gb(summary_row['used_bytes']) if summary_row else None,
            'inode_output': inode_stdout,
            'read_bw': round(perf.get('read_bw') or 0, 2),
            'write_bw': round(perf.get('write_bw') or 0, 2),
            'nids': nids_output.splitlines(),
        }
    }

    # 保存完整快照，供「巡检历史」查看（仅实时巡检时）
    if run_live:
        try:
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute(
                """INSERT INTO health_check_runs
                   (timestamp, score, checks_passed, checks_failed, checks_warned,
                    finding_count, client_mount, payload_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (timestamp, overall_score, checks_passed, checks_failed, checks_warned,
                 len(findings), LUSTRE_CLIENT, json.dumps(payload, ensure_ascii=False)),
            )
            conn.commit()
            conn.close()
        except Exception as e:
            print(f'[HEALTH SNAPSHOT ERROR] {e}')

    return payload


@app.route('/')
def index():
    # 一体化容器：若存在前端静态目录，则直接返回前端首页
    static_dir = os.environ.get('LUSTRE_OPS_STATIC_DIR', '')
    if static_dir and os.path.exists(os.path.join(static_dir, 'index.html')):
        return send_from_directory(static_dir, 'index.html')
    return jsonify({
        'service': 'lustre-ops-api-v2',
        'status': 'running',
        'database': DB_PATH,
        'endpoints': [
            # Real-time
            {'path': '/api/health', 'desc': '服务健康'},
            {'path': '/api/lustre/status', 'desc': '实时集群状态'},
            {'path': '/api/lustre/osts', 'desc': '实时OST容量'},
            {'path': '/api/lustre/capacity', 'desc': '实时容量详情'},
            {'path': '/api/lustre/network', 'desc': '实时LNET'},
            {'path': '/api/lustre/performance', 'desc': '实时性能'},
            {'path': '/api/lustre/client-info', 'desc': '客户端挂载'},
            # Historical (from DB)
            {'path': '/api/metrics/osts/latest', 'desc': '最新OST指标（数据库）'},
            {'path': '/api/metrics/osts/history?hours=24', 'desc': 'OST历史趋势'},
            {'path': '/api/metrics/health/latest', 'desc': '最新健康检查'},
            {'path': '/api/metrics/health/history?hours=24', 'desc': '健康历史'},
            {'path': '/api/metrics/nodes', 'desc': '节点列表'},
            {'path': '/api/metrics/capacity/summary', 'desc': '容量汇总'},
            {'path': '/api/alerts/active', 'desc': '活跃告警'},
            {'path': '/api/alerts/history?limit=100', 'desc': '历史告警'},
        ]
    })


def _serve_spa(path_prefix=''):
    """SPA 静态托管：找不到文件时退回 index.html（支持前端路由）。

    兼容构建 base=/lustre-ops/：同时服务 / 与 /lustre-ops/ 前缀。
    """
    static_dir = os.environ.get('LUSTRE_OPS_STATIC_DIR', '')
    if not static_dir or not os.path.isdir(static_dir):
        return jsonify({'error': 'not found'}), 404
    rel = request.path
    if path_prefix and rel.startswith(path_prefix):
        rel = rel[len(path_prefix):]
    rel = rel.lstrip('/')
    if rel and os.path.isfile(os.path.join(static_dir, rel)):
        return send_from_directory(static_dir, rel)
    return send_from_directory(static_dir, 'index.html')


@app.route('/lustre-ops/')
@app.route('/lustre-ops/<path:subpath>')
def spa_lustre_ops(subpath=None):
    return _serve_spa('/lustre-ops')


@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    body = request.get_json(silent=True) or {}
    identifier = body.get('username') or body.get('email') or body.get('identifier')
    token, user, err = auth_mod.login(identifier, body.get('password'))
    if err:
        return jsonify({'ok': False, 'error': err}), 401
    resp = jsonify({'ok': True, 'token': token, 'user': user})
    resp.set_cookie('lustre_token', token, httponly=True, samesite='Lax', max_age=auth_mod.SESSION_TTL)
    return resp


@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    auth_mod.logout(auth_mod.token_from_request())
    resp = jsonify({'ok': True})
    resp.delete_cookie('lustre_token')
    return resp


@app.route('/api/auth/me')
def auth_me():
    return jsonify({'ok': True, 'user': g.current_user})


@app.route('/api/users', methods=['GET'])
def users_list():
    return jsonify({'ok': True, 'users': auth_mod.list_users()})


@app.route('/api/users', methods=['POST'])
@require_role('admin')
def users_create():
    body = request.get_json(silent=True) or {}
    user, err = auth_mod.create_user(
        body.get('username') or body.get('name'),
        body.get('email'),
        body.get('password'),
        body.get('role') or 'readonly',
        body.get('status') or 'active',
    )
    if err:
        return jsonify({'ok': False, 'error': err}), 400
    return jsonify({'ok': True, 'user': user})


@app.route('/api/users/<int:user_id>', methods=['PATCH', 'PUT'])
@require_role('admin')
def users_update(user_id):
    body = request.get_json(silent=True) or {}
    user, err = auth_mod.update_user(user_id, body)
    if err:
        return jsonify({'ok': False, 'error': err}), 400
    return jsonify({'ok': True, 'user': user})


@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@require_role('admin')
def users_delete(user_id):
    ok, err = auth_mod.delete_user(user_id)
    if not ok:
        return jsonify({'ok': False, 'error': err}), 400
    return jsonify({'ok': True})


@app.route('/api/health')
def health():
    return jsonify({'status': 'ok', 'service': 'lustre-ops-api-v2', 'db': os.path.exists(DB_PATH)})


@app.route('/api/logs/latest')
def logs_latest():
    return jsonify(latest_logs_payload())


@app.route('/api/logs/collect', methods=['POST'])
def logs_collect():
    return jsonify(collect_real_logs())


@app.route('/api/ai/settings', methods=['GET'])
def ai_settings_get():
    settings = load_json_file(AI_SETTINGS_PATH, default_ai_settings())
    return jsonify(public_ai_settings(settings))


@app.route('/api/ai/settings', methods=['POST'])
def ai_settings_save():
    body = request.get_json(silent=True) or {}
    existing = load_json_file(AI_SETTINGS_PATH, default_ai_settings())
    settings = normalize_ai_settings(body, existing)
    save_json_file(AI_SETTINGS_PATH, settings)
    return jsonify({'ok': True, 'settings': public_ai_settings(settings)})


@app.route('/api/ai/settings/test', methods=['POST'])
def ai_settings_test():
    body = request.get_json(silent=True) or {}
    existing = load_json_file(AI_SETTINGS_PATH, default_ai_settings())
    settings = normalize_ai_settings(body, existing)
    result = test_ai_connection(settings)
    return jsonify(result), (200 if result.get('ok') else 400)


@app.route('/api/ai/logs/chat', methods=['POST'])
def ai_logs_chat():
    body = request.get_json(silent=True) or {}
    question = (body.get('question') or '').strip()
    if not question:
        return jsonify({'ok': False, 'message': '请输入要分析的问题'}), 400
    if len(question) > 2000:
        return jsonify({'ok': False, 'message': '问题过长，请控制在 2000 字以内'}), 400

    settings = load_json_file(AI_SETTINGS_PATH, default_ai_settings())
    payload = latest_logs_payload()
    result = call_ai_chat(settings, question, payload, agent_config=load_agent_config())
    if not result.get('ok'):
        return jsonify(result), 502
    return jsonify(result)


@app.route('/api/ai/logs/agent/config', methods=['GET'])
def ai_logs_agent_config_get():
    config = load_agent_config()
    settings = load_json_file(AI_SETTINGS_PATH, default_ai_settings())
    config['model'] = config.get('model') or settings.get('modelId') or ''
    return jsonify({'ok': True, 'config': config})


@app.route('/api/ai/logs/agent/config', methods=['POST'])
def ai_logs_agent_config_save():
    body = request.get_json(silent=True) or {}
    agent_name = (body.get('agentName') or '').strip() or 'LustreOps AI 日志诊断助手'
    system_prompt = (body.get('systemPrompt') or '').strip()
    model = (body.get('model') or '').strip()
    if not system_prompt:
        return jsonify({'ok': False, 'message': '系统提示词不能为空'}), 400
    if len(system_prompt) > 30000:
        return jsonify({'ok': False, 'message': '系统提示词过长，请控制在 30000 字以内'}), 400
    config = load_agent_config()
    config.update({
        'agentName': agent_name,
        'model': model,
        'systemPrompt': system_prompt,
    })
    try:
        config = save_agent_config(config)
        return jsonify({'ok': True, 'message': '智能体设置已保存', 'config': config})
    except Exception as e:
        return jsonify({'ok': False, 'message': f'智能体设置保存失败: {e}'}), 500


@app.route('/api/ai/logs/agent/config/reset', methods=['POST'])
def ai_logs_agent_config_reset():
    try:
        config = save_agent_config(default_agent_config())
        return jsonify({'ok': True, 'message': '已恢复默认系统提示词', 'config': config})
    except Exception as e:
        return jsonify({'ok': False, 'message': f'恢复默认失败: {e}'}), 500


@app.route('/api/ai/logs/sessions', methods=['GET'])
def ai_logs_sessions_list():
    index = load_session_index()
    if not os.path.exists(AGENT_SESSION_INDEX_PATH):
        index = rebuild_session_index()
    return jsonify({'ok': True, 'sessions': index.get('sessions', [])})


@app.route('/api/ai/logs/sessions', methods=['POST'])
def ai_logs_sessions_create():
    body = request.get_json(silent=True) or {}
    title = (body.get('title') or '新会话').strip() or '新会话'
    try:
        session = create_agent_session(title)
        return jsonify({'ok': True, 'session': session})
    except Exception as e:
        return jsonify({'ok': False, 'message': f'创建会话失败: {e}'}), 500


@app.route('/api/ai/logs/sessions/<session_id>', methods=['GET'])
def ai_logs_session_get(session_id):
    session = load_agent_session(session_id)
    if not session:
        return jsonify({'ok': False, 'message': '会话不存在'}), 404
    return jsonify({'ok': True, 'session': session})


@app.route('/api/ai/logs/sessions/<session_id>', methods=['PATCH'])
def ai_logs_session_update(session_id):
    session = load_agent_session(session_id)
    if not session:
        return jsonify({'ok': False, 'message': '会话不存在'}), 404
    body = request.get_json(silent=True) or {}
    title = (body.get('title') or '').strip()
    summary = body.get('summary')
    memory_notes = body.get('memoryNotes')
    if title:
        session['title'] = title[:80]
    if isinstance(summary, str):
        session['summary'] = summary[:2000]
    if isinstance(memory_notes, list):
        session['memoryNotes'] = [str(item)[:500] for item in memory_notes][-20:]
    try:
        session = save_session(session)
        return jsonify({'ok': True, 'message': '会话已更新', 'session': session})
    except Exception as e:
        return jsonify({'ok': False, 'message': f'会话更新失败: {e}'}), 500


@app.route('/api/ai/logs/sessions/<session_id>', methods=['DELETE'])
def ai_logs_session_delete(session_id):
    if not delete_agent_session(session_id):
        return jsonify({'ok': False, 'message': '会话不存在'}), 404
    return jsonify({'ok': True, 'message': '会话已删除'})


@app.route('/api/ai/logs/sessions/<session_id>/chat', methods=['POST'])
def ai_logs_session_chat(session_id):
    session = load_agent_session(session_id)
    if not session:
        return jsonify({'ok': False, 'message': '会话不存在'}), 404
    body = request.get_json(silent=True) or {}
    question = (body.get('question') or '').strip()
    if not question:
        return jsonify({'ok': False, 'message': '请输入要分析的问题'}), 400
    if len(question) > 2000:
        return jsonify({'ok': False, 'message': '问题过长，请控制在 2000 字以内'}), 400

    settings = load_json_file(AI_SETTINGS_PATH, default_ai_settings())
    agent_config = load_agent_config()
    payload = latest_logs_payload()
    user_message = append_session_message(session, 'user', question, {
        'logCollectedAt': (payload.get('summary') or {}).get('collectedAt'),
        'warningCount': (payload.get('summary') or {}).get('warningCount'),
    })
    if (session.get('title') or '新会话') == '新会话':
        session['title'] = generate_session_title(question)
    result = call_ai_chat(settings, question, payload, session_context=session, agent_config=agent_config)
    if not result.get('ok'):
        session.get('messages', []).pop()
        save_session(session)
        return jsonify(result), 502
    assistant_message = append_session_message(session, 'assistant', result.get('answer') or '', {
        'model': result.get('model'),
        'provider': result.get('provider'),
        'knowledgeMatches': result.get('knowledgeMatches') or [],
        'usage': result.get('usage') or {},
    })
    update_session_memory(session, question, result.get('answer') or '')
    try:
        session = save_session(session)
    except Exception as e:
        return jsonify({'ok': False, 'message': f'会话保存失败: {e}'}), 500
    return jsonify({
        'ok': True,
        'answer': result.get('answer'),
        'model': result.get('model'),
        'provider': result.get('provider'),
        'knowledgeMatches': result.get('knowledgeMatches') or [],
        'usage': result.get('usage') or {},
        'session': session,
        'userMessage': user_message,
        'assistantMessage': assistant_message,
    })


@app.route('/api/knowledge/logs', methods=['GET'])
def log_knowledge_list():
    ensure_log_knowledge_table()
    limit = request.args.get('limit', 50, type=int)
    rows = db_query("""
        SELECT *
        FROM log_knowledge_base
        ORDER BY feedback_score DESC, hit_count DESC, updated_at DESC
        LIMIT ?
    """, (min(max(limit, 1), 200),))
    return jsonify({'ok': True, 'items': [knowledge_row_to_dict(row) for row in rows], 'count': len(rows)})


@app.route('/api/knowledge/overview', methods=['GET'])
def knowledge_overview():
    ensure_log_knowledge_table()
    case_limit = min(max(request.args.get('caseLimit', 200, type=int), 1), 500)
    document_limit = min(max(request.args.get('documentLimit', 300, type=int), 1), 500)
    cases = db_query("""
        SELECT *
        FROM log_knowledge_base
        ORDER BY feedback_score DESC, hit_count DESC, updated_at DESC
        LIMIT ?
    """, (case_limit,))
    documents = db_query("""
        SELECT *
        FROM knowledge_documents
        ORDER BY updated_at DESC
        LIMIT ?
    """, (document_limit,))
    case_count_rows = db_query("SELECT COUNT(*) AS count FROM log_knowledge_base")
    document_stats_rows = db_query("""
        SELECT COUNT(*) AS count, COALESCE(SUM(chunk_count), 0) AS chunk_count
        FROM knowledge_documents
    """)
    index = load_vector_index()
    indexed_case_ids = {
        str(item.get('sourceId'))
        for item in index.get('vectors') or []
        if item.get('kind') == 'case' and item.get('sourceId') is not None
    }
    case_items = [knowledge_row_to_dict(row) for row in cases]
    for item in case_items:
        if str(item.get('id')) in indexed_case_ids:
            item['embedding_status'] = 'ready'
            item['vector_id'] = f"case:{item.get('id')}"
    document_stats = document_stats_rows[0] if document_stats_rows else {}
    return jsonify({
        'ok': True,
        'cases': case_items,
        'documents': [knowledge_doc_to_dict(row) for row in documents],
        'stats': {
            'caseCount': int((case_count_rows[0] if case_count_rows else {}).get('count') or 0),
            'documentCount': int(document_stats.get('count') or 0),
            'chunkCount': int(document_stats.get('chunk_count') or 0),
            'vectorCount': len(index.get('vectors') or []),
            'vectorUpdatedAt': index.get('updatedAt') or '',
            'embedding': index.get('embedding') or '',
        },
    })


@app.route('/api/knowledge/logs', methods=['POST'])
def log_knowledge_create():
    ensure_log_knowledge_table()
    body = request.get_json(silent=True) or {}
    title = (body.get('title') or '').strip()
    problem = (body.get('problem') or '').strip()
    solution = (body.get('solution') or '').strip()
    extra_steps = (body.get('extraSteps') or body.get('extra_steps') or '').strip()
    tags = body.get('tags') or []
    if isinstance(tags, list):
        tags_text = ','.join([str(item).strip() for item in tags if str(item).strip()])
    else:
        tags_text = str(tags).strip()
    if not title or not problem or not solution:
        return jsonify({'ok': False, 'message': '标题、问题现象和处理建议不能为空'}), 400
    if len(solution) > 12000 or len(problem) > 6000:
        return jsonify({'ok': False, 'message': '知识条目过长，请先压缩内容后再录入'}), 400
    now = now_iso()
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO log_knowledge_base (
                title, problem, solution, extra_steps, tags,
                source_question, source_answer, source_logs,
                feedback_score, hit_count, embedding_status, vector_id,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 'pending', '', ?, ?)
        """, (
            title,
            problem,
            solution,
            extra_steps,
            tags_text,
            (body.get('sourceQuestion') or '').strip(),
            (body.get('sourceAnswer') or '').strip(),
            (body.get('sourceLogs') or '').strip()[:12000],
            now,
            now,
        ))
        item_id = cur.lastrowid
        conn.commit()
        conn.close()
        item = db_query("SELECT * FROM log_knowledge_base WHERE id = ?", (item_id,))
        if item:
            upsert_vector_records([build_case_vector_record(item[0])])
        return jsonify({'ok': True, 'message': '已录入本地知识库并完成向量索引', 'item': knowledge_row_to_dict(item[0]) if item else None})
    except Exception as e:
        return jsonify({'ok': False, 'message': f'知识库写入失败: {e}'}), 500


@app.route('/api/knowledge/logs/<int:item_id>/feedback', methods=['POST'])
def log_knowledge_feedback(item_id):
    ensure_log_knowledge_table()
    body = request.get_json(silent=True) or {}
    helpful = bool(body.get('helpful', True))
    delta = 1 if helpful else -1
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("""
            UPDATE log_knowledge_base
            SET feedback_score = feedback_score + ?, updated_at = ?
            WHERE id = ?
        """, (delta, now_iso(), item_id))
        conn.commit()
        changed = cur.rowcount
        conn.close()
        if not changed:
            return jsonify({'ok': False, 'message': '知识条目不存在'}), 404
        item = db_query("SELECT * FROM log_knowledge_base WHERE id = ?", (item_id,))
        if item:
            upsert_vector_records([build_case_vector_record(item[0])])
        return jsonify({'ok': True, 'message': '反馈已记录'})
    except Exception as e:
        return jsonify({'ok': False, 'message': f'反馈写入失败: {e}'}), 500


@app.route('/api/knowledge/documents', methods=['GET'])
def knowledge_documents_list():
    ensure_log_knowledge_table()
    limit = request.args.get('limit', 100, type=int)
    rows = db_query("""
        SELECT *
        FROM knowledge_documents
        ORDER BY updated_at DESC
        LIMIT ?
    """, (min(max(limit, 1), 300),))
    return jsonify({'ok': True, 'documents': [knowledge_doc_to_dict(row) for row in rows], 'count': len(rows)})


@app.route('/api/knowledge/documents/<document_id>', methods=['GET'])
def knowledge_document_detail(document_id):
    ensure_log_knowledge_table()
    docs = db_query("SELECT * FROM knowledge_documents WHERE id = ?", (document_id,))
    if not docs:
        return jsonify({'ok': False, 'message': '文档不存在'}), 404
    versions = db_query("""
        SELECT *
        FROM knowledge_document_versions
        WHERE document_id = ?
        ORDER BY version_number DESC
    """, (document_id,))
    chunks = db_query("""
        SELECT *
        FROM knowledge_chunks
        WHERE document_id = ?
        ORDER BY chunk_index ASC
        LIMIT 200
    """, (document_id,))
    return jsonify({
        'ok': True,
        'document': knowledge_doc_to_dict(docs[0]),
        'versions': [dict(row) for row in versions],
        'chunks': [knowledge_chunk_to_dict(row) for row in chunks],
    })


@app.route('/api/knowledge/documents/<document_id>', methods=['DELETE'])
def knowledge_document_delete(document_id):
    ensure_log_knowledge_table()
    docs = db_query("SELECT * FROM knowledge_documents WHERE id = ?", (document_id,))
    if not docs:
        return jsonify({'ok': False, 'message': '文档不存在'}), 404
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("DELETE FROM knowledge_chunks WHERE document_id = ?", (document_id,))
        cur.execute("DELETE FROM knowledge_document_versions WHERE document_id = ?", (document_id,))
        cur.execute("DELETE FROM knowledge_documents WHERE id = ?", (document_id,))
        conn.commit()
        conn.close()
        doc_dir = os.path.join(KNOWLEDGE_DOCS_DIR, document_id)
        if os.path.isdir(doc_dir):
            shutil.rmtree(doc_dir)
        rebuild_knowledge_vector_index()
        return jsonify({'ok': True, 'message': '文档及其版本、向量片段已删除'})
    except Exception as e:
        return jsonify({'ok': False, 'message': f'文档删除失败: {e}'}), 500


@app.route('/api/knowledge/documents/upload', methods=['POST'])
def knowledge_document_upload():
    file_obj = request.files.get('file')
    if not file_obj:
        return jsonify({'ok': False, 'message': '请上传 Markdown 或文本文件'}), 400
    raw = file_obj.read()
    title = (request.form.get('title') or '').strip()
    tags = (request.form.get('tags') or '').strip()
    document_id = (request.form.get('documentId') or '').strip() or None
    try:
        doc, version = create_document_version(title, file_obj.filename, raw, tags=tags, document_id=document_id)
        return jsonify({'ok': True, 'message': '文档已解析并完成向量索引', 'document': doc, 'version': version})
    except ValueError as e:
        return jsonify({'ok': False, 'message': str(e)}), 400
    except Exception as e:
        return jsonify({'ok': False, 'message': f'文档上传失败: {e}'}), 500


@app.route('/api/knowledge/documents/<document_id>/versions/upload', methods=['POST'])
def knowledge_document_version_upload(document_id):
    file_obj = request.files.get('file')
    if not file_obj:
        return jsonify({'ok': False, 'message': '请上传新版本文件'}), 400
    docs = db_query("SELECT * FROM knowledge_documents WHERE id = ?", (document_id,))
    if not docs:
        return jsonify({'ok': False, 'message': '文档不存在'}), 404
    raw = file_obj.read()
    title = (request.form.get('title') or docs[0].get('title') or '').strip()
    tags = (request.form.get('tags') or docs[0].get('tags') or '').strip()
    try:
        doc, version = create_document_version(title, file_obj.filename, raw, tags=tags, document_id=document_id)
        return jsonify({'ok': True, 'message': '新版本已解析并完成向量索引', 'document': doc, 'version': version})
    except ValueError as e:
        return jsonify({'ok': False, 'message': str(e)}), 400
    except Exception as e:
        return jsonify({'ok': False, 'message': f'版本上传失败: {e}'}), 500


@app.route('/api/knowledge/reindex', methods=['POST'])
def knowledge_reindex():
    try:
        index = rebuild_knowledge_vector_index()
        return jsonify({
            'ok': True,
            'message': '知识库向量索引已重建',
            'vectorCount': len(index.get('vectors') or []),
            'updatedAt': index.get('updatedAt'),
        })
    except Exception as e:
        return jsonify({'ok': False, 'message': f'重建索引失败: {e}'}), 500


@app.route('/api/knowledge/search', methods=['POST'])
def knowledge_search():
    body = request.get_json(silent=True) or {}
    query = (body.get('query') or '').strip()
    logs = body.get('logs') or []
    limit = int(body.get('limit') or 6)
    if not query:
        return jsonify({'ok': False, 'message': '请输入检索问题'}), 400
    matches = retrieve_log_knowledge(query, logs=logs, limit=min(max(limit, 1), 12))
    return jsonify({'ok': True, 'matches': matches, 'count': len(matches)})


@app.route('/api/knowledge/chunks/<chunk_id>/feedback', methods=['POST'])
def knowledge_chunk_feedback(chunk_id):
    ensure_log_knowledge_table()
    body = request.get_json(silent=True) or {}
    helpful = bool(body.get('helpful', True))
    delta = 1 if helpful else -1
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("""
            UPDATE knowledge_chunks
            SET feedback_score = feedback_score + ?, updated_at = ?
            WHERE id = ?
        """, (delta, now_iso(), chunk_id))
        conn.commit()
        changed = cur.rowcount
        conn.close()
        if not changed:
            return jsonify({'ok': False, 'message': '文档片段不存在'}), 404
        rows = db_query("SELECT * FROM knowledge_chunks WHERE id = ?", (chunk_id,))
        if rows:
            upsert_vector_records([build_chunk_vector_record(rows[0])])
        return jsonify({'ok': True, 'message': '文档片段反馈已记录'})
    except Exception as e:
        return jsonify({'ok': False, 'message': f'反馈写入失败: {e}'}), 500


def cluster_server_version():
    """确定集群服务端（MGS/MDS/OSS）Lustre 版本。

    优先级：
      1) 已上报的服务端 agent 的 lustre_version（真实服务端值）；
      2) 清单中显式声明的 serverVersion；
      3) 客户端本地探针（少数环境可从 mgs 参数读到）。
    返回 (version, source)。客户端部署（无服务端 agent）时通常返回清单声明值。
    """
    rows = db_query(
        "SELECT node_id, lustre_version FROM lustre_nodes "
        "WHERE role IN ('mgs','mds','oss','mixed') AND lustre_version IS NOT NULL AND lustre_version != '' "
        "ORDER BY last_heartbeat DESC"
    )
    for r in rows:
        if r.get('lustre_version'):
            return r['lustre_version'], f"agent:{r.get('node_id')}"
    inv = load_inventory() or {}
    declared = inv.get('serverVersion')
    if declared:
        return declared, 'inventory'
    try:
        info = lustre_collect.collect_versions()
        if info.get('server'):
            return info['server'], 'client-probe'
    except Exception:
        pass
    return '', ''


@app.route('/api/lustre/status')
def lustre_status():
    stdout, stderr, rc = run_cmd('lfs check servers')
    is_healthy = rc == 0
    mount = detect_lustre_mount()
    vinfo = collect_versions()
    server_ver, server_src = cluster_server_version()
    return jsonify({
        'healthy': is_healthy,
        'servers_output': stdout if stdout else stderr,
        'client_mount': mount,
        'mounted': os.path.ismount(mount),
        'lustre_version': vinfo.get('client') or '',
        'client_version': vinfo.get('client') or '',
        'server_version': server_ver or '',
        'server_version_source': server_src or '',
    })


@app.route('/api/lustre/osts')
def lustre_osts():
    stdout, _, rc = run_cmd('lfs df -h')
    lines = stdout.splitlines() if stdout else []
    osts = []
    for line in lines:
        if line.strip() and not line.startswith('UUID'):
            parts = line.split()
            if len(parts) >= 6:
                osts.append({
                    'uuid': parts[0], 'space': parts[1], 'used': parts[2],
                    'available': parts[3], 'usage_percent': parts[4],
                    'mount': ' '.join(parts[5:])
                })
    return jsonify({'osts': osts, 'raw': stdout})


@app.route('/api/lustre/capacity')
def lustre_capacity():
    stdout, _, rc = run_cmd('lfs df -h')
    return jsonify({'df_output': stdout})


@app.route('/api/lustre/network')
def lustre_network():
    stdout, _, rc = run_cmd('lnetctl net show 2>/dev/null || echo LNETCTL_NOT_AVAILABLE')
    nids, _, _ = run_cmd('lctl list_nids 2>/dev/null || echo ""')
    return jsonify({'lnet': stdout, 'nids': nids})


@app.route('/api/lustre/performance')
def lustre_performance():
    brw, _, _ = run_cmd('lctl get_param osc.*.brw_stats 2>/dev/null | head -50 || echo ""')
    stats, _, _ = run_cmd('lctl get_param obdfilter.*.stats 2>/dev/null | head -50 || echo ""')
    return jsonify({'brw_stats': brw, 'stats': stats})


@app.route('/api/lustre/client-info')
def lustre_client_info():
    mount_info, _, _ = run_cmd('mount | grep lustre')
    df_info, _, _ = run_cmd(f'df -h {LUSTRE_CLIENT}')
    return jsonify({'mount_info': mount_info, 'df_client': df_info})


# ─── HISTORICAL API (from SQLite DB) ──────────────────────────

@app.route('/api/metrics/osts/latest')
def ost_latest():
    """Return latest OST metrics from database"""
    rows = db_query("""
        SELECT timestamp, name, uuid, type, total_bytes, used_bytes, available_bytes, usage_percent, mount, fs_name
        FROM ost_metrics
        WHERE timestamp = (SELECT MAX(timestamp) FROM ost_metrics)
        ORDER BY type, name
    """)
    return jsonify({'timestamp': rows[0]['timestamp'] if rows else None, 'osts': rows})


@app.route('/api/metrics/osts/history')
def ost_history():
    """Return OST usage history for charting"""
    hours = request.args.get('hours', 24, type=int)
    since = (datetime.now() - timedelta(hours=hours)).isoformat()
    rows = db_query("""
        SELECT timestamp, name, usage_percent, used_bytes, total_bytes
        FROM ost_metrics
        WHERE timestamp > ? AND type = 'OST'
        ORDER BY timestamp ASC
    """, (since,))
    return jsonify({'hours': hours, 'count': len(rows), 'data': rows})


@app.route('/api/metrics/health/latest')
def health_latest():
    """Return latest health status from database"""
    rows = db_query("""
        SELECT healthy, servers_output, mounted, score, client_mount, timestamp
        FROM health_checks
        ORDER BY timestamp DESC LIMIT 1
    """)
    if rows:
        r = rows[0]
        return jsonify({
            'healthy': bool(r['healthy']),
            'score': r['score'],
            'mounted': bool(r['mounted']),
            'servers_output': r['servers_output'],
            'client_mount': r['client_mount'],
            'timestamp': r['timestamp']
        })
    return jsonify({'healthy': False, 'error': 'no data'})


@app.route('/api/metrics/health/history')
def health_history():
    hours = request.args.get('hours', 24, type=int)
    since = (datetime.now() - timedelta(hours=hours)).isoformat()
    rows = db_query("""
        SELECT timestamp, healthy, score, mounted
        FROM health_checks
        WHERE timestamp > ?
        ORDER BY timestamp ASC
    """, (since,))
    return jsonify({'hours': hours, 'count': len(rows), 'data': rows})


@app.route('/api/health-check/latest')
def health_check_latest():
    return jsonify(build_health_check_payload(run_live=False))


@app.route('/api/health-check/history')
def health_check_history():
    """巡检历史列表（不含完整 payload，用于列表展示）。"""
    limit = request.args.get('limit', 50, type=int)
    limit = max(1, min(limit, 200))
    rows = db_query("""
        SELECT id, timestamp, score, checks_passed, checks_failed, checks_warned,
               finding_count, client_mount
        FROM health_check_runs
        ORDER BY id DESC
        LIMIT ?
    """, (limit,))
    return jsonify({'count': len(rows), 'runs': rows})


@app.route('/api/health-check/history/<int:run_id>')
def health_check_history_detail(run_id):
    """某次巡检的完整快照。"""
    rows = db_query('SELECT * FROM health_check_runs WHERE id = ?', (run_id,))
    if not rows:
        return jsonify({'error': '巡检记录不存在'}), 404
    row = rows[0]
    try:
        payload = json.loads(row.get('payload_json') or '{}')
    except Exception:
        payload = {}
    return jsonify({'id': row['id'], 'timestamp': row['timestamp'], 'payload': payload})


@app.route('/api/health-check/history/<int:run_id>', methods=['DELETE'])
def health_check_history_delete(run_id):
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute('DELETE FROM health_check_runs WHERE id = ?', (run_id,))
        conn.commit()
        conn.close()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


@app.route('/api/health-check/run', methods=['POST'])
def health_check_run():
    return jsonify(build_health_check_payload(run_live=True))


@app.route('/api/health-check/run-stream', methods=['POST'])
def health_check_run_stream():
    def generate():
        event_queue = queue.Queue()
        sentinel = object()

        def logger(event):
            item = dict(event)
            item['type'] = 'log'
            event_queue.put(item)

        def worker():
            try:
                payload = build_health_check_payload(run_live=True, event_logger=logger)
                event_queue.put({'type': 'result', 'payload': payload})
            except Exception as e:
                event_queue.put({'type': 'error', 'message': str(e)})
            finally:
                event_queue.put(sentinel)

        thread = threading.Thread(target=worker)
        thread.daemon = True
        thread.start()

        while True:
            item = event_queue.get()
            if item is sentinel:
                break
            yield json.dumps(item, ensure_ascii=False) + '\n'

    return Response(stream_with_context(generate()), mimetype='application/x-ndjson')


@app.route('/api/health-check/remediate', methods=['POST'])
def health_check_remediate():
    body = request.get_json(silent=True) or {}
    finding_id = (body.get('findingId') or '').strip()
    execute = bool(body.get('execute'))
    if not finding_id:
        return jsonify({'ok': False, 'message': '缺少 findingId'}), 400

    key = remediation_key_for_finding(finding_id)
    plan = REMEDIATION_ACTIONS.get(key) or REMEDIATION_ACTIONS['alert']
    if execute and not plan.get('canAutoFix'):
        return jsonify({
            'ok': False,
            'message': '该修复动作涉及生产风险，当前只允许执行安全预检，请按手动步骤处理。',
            'requiresManualApproval': True,
            'plan': build_remediation_for_finding({'id': finding_id, 'affectedNodes': body.get('affectedNodes') or []}),
        }), 409

    started = now_iso()
    results = run_remediation_precheck(plan)
    return jsonify({
        'ok': True,
        'mode': 'precheck',
        'findingId': finding_id,
        'actionId': plan.get('actionId'),
        'startedAt': started,
        'finishedAt': now_iso(),
        'message': '安全预检已完成，未执行重启、挂载、删除或配置修改。',
        'results': results,
        'nextStep': '请管理员根据预检结果和手动修复步骤执行变更；完成后重新巡检。',
    })


@app.route('/api/metrics/capacity/summary')
def capacity_summary():
    """Return latest capacity summary from DB, aggregated by type"""
    rows = db_query("""
        SELECT timestamp, name, type, total_bytes, used_bytes, available_bytes, usage_percent
        FROM ost_metrics
        WHERE timestamp = (SELECT MAX(timestamp) FROM ost_metrics)
        ORDER BY type DESC, name
    """)
    if not rows:
        return jsonify({'timestamp': None, 'summary': {}})

    # Aggregate by type
    agg = {}
    for r in rows:
        t = r['type']
        if t not in agg:
            agg[t] = {'count': 0, 'total_bytes': 0, 'used_bytes': 0, 'available_bytes': 0}
        agg[t]['count'] += 1
        agg[t]['total_bytes'] += r['total_bytes'] or 0
        agg[t]['used_bytes'] += r['used_bytes'] or 0
        agg[t]['available_bytes'] += r['available_bytes'] or 0

    # Build summary with computed percentages
    summary = {}
    for t, v in agg.items():
        summary[t] = {
            'count': v['count'],
            'total_bytes': v['total_bytes'],
            'used_bytes': v['used_bytes'],
            'available_bytes': v['available_bytes'],
            'usage_percent': round((v['used_bytes'] / v['total_bytes']) * 100, 1) if v['total_bytes'] > 0 else 0,
        }

    return jsonify({'timestamp': rows[0]['timestamp'], 'summary': summary})


@app.route('/api/metrics/storage/forecast')
def storage_forecast():
    hours = request.args.get('hours', 24, type=int)
    days = request.args.get('days', 7, type=int)
    since = (datetime.now() - timedelta(hours=hours)).isoformat()
    rows = db_query("""
        SELECT timestamp, used_bytes, total_bytes
        FROM ost_metrics
        WHERE name = 'SUMMARY' AND timestamp > ?
        ORDER BY timestamp ASC
    """, (since,))

    history = []
    for r in rows:
        used_gb = round((r['used_bytes'] or 0) / 1024 / 1024 / 1024, 2)
        history.append({
            'timestamp': r['timestamp'],
            'label': r['timestamp'][5:16].replace('T', ' '),
            'used_gb': used_gb,
            'total_gb': round((r['total_bytes'] or 0) / 1024 / 1024 / 1024, 2),
        })

    growth_per_day_gb = 0
    forecast = []
    thresholds = {}
    if len(rows) >= 2:
        first = rows[0]
        last = rows[-1]
        first_ts = parse_iso(first['timestamp'])
        last_ts = parse_iso(last['timestamp'])
        if first_ts and last_ts and last_ts > first_ts:
            delta_days = (last_ts - first_ts).total_seconds() / 86400
            growth_per_day_gb = round((((last['used_bytes'] or 0) - (first['used_bytes'] or 0)) / 1024 / 1024 / 1024) / delta_days, 3)

        last_used = round((last['used_bytes'] or 0) / 1024 / 1024 / 1024, 2)
        total_gb = round((last['total_bytes'] or 0) / 1024 / 1024 / 1024, 2)
        for i in range(1, days + 1):
            ts = datetime.now() + timedelta(days=i)
            predicted = round(last_used + growth_per_day_gb * i, 2)
            forecast.append({
                'timestamp': ts.isoformat(),
                'label': ts.strftime('%m-%d'),
                'predicted_gb': predicted,
                'upper_gb': round(predicted * 1.05, 2),
                'lower_gb': round(max(predicted * 0.95, 0), 2),
            })

        if growth_per_day_gb > 0 and total_gb > 0:
            for pct in (80, 90, 100):
                threshold_gb = total_gb * pct / 100
                remaining = threshold_gb - last_used
                if remaining <= 0:
                    thresholds[str(pct)] = {'days': 0, 'date': datetime.now().strftime('%Y-%m-%d')}
                else:
                    days_to = int(round(remaining / growth_per_day_gb))
                    thresholds[str(pct)] = {
                        'days': days_to,
                        'date': (datetime.now() + timedelta(days=days_to)).strftime('%Y-%m-%d')
                    }

    return jsonify({
        'hours': hours,
        'growth_per_day_gb': growth_per_day_gb,
        'history': history,
        'forecast': forecast,
        'thresholds': thresholds,
    })


@app.route('/api/metrics/storage/inodes')
def storage_inodes():
    stdout, stderr, rc = run_cmd(f'lfs df -i {LUSTRE_CLIENT}')
    lines = stdout.splitlines() if stdout else []
    items = []
    for line in lines[1:]:
        parts = line.split()
        if len(parts) < 6:
            continue
        name = parts[0].replace('_UUID', '')
        try:
            total = int(parts[1])
            used = int(parts[2])
            free = int(parts[3])
            percent = int(parts[4].replace('%', ''))
        except Exception:
            continue
        items.append({
            'id': name,
            'name': name,
            'total': total,
            'used': used,
            'available': free,
            'percent': percent,
            'growth_rate': 0,
            'days_to_exhaust': None,
            'mount': parts[5],
        })
    return jsonify({'items': items, 'raw': stdout if stdout else stderr})
def capacity_summary():
    """Return latest capacity summary from DB"""
    rows = db_query("""
        SELECT timestamp, name, type, total_bytes, used_bytes, available_bytes, usage_percent
        FROM ost_metrics
        WHERE timestamp = (SELECT MAX(timestamp) FROM ost_metrics)
        ORDER BY type DESC, name
    """)
    summary = {r['type']: {
        'name': r['name'],
        'total_bytes': r['total_bytes'],
        'used_bytes': r['used_bytes'],
        'available_bytes': r['available_bytes'],
        'usage_percent': r['usage_percent']
    } for r in rows}
    return jsonify({'timestamp': rows[0]['timestamp'] if rows else None, 'summary': summary})


@app.route('/api/ingest/report', methods=['POST'])
def ingest_report():
    """接收节点采集 agent 上报（用 X-Ingest-Token 校验，不走登录会话）。"""
    expected = os.environ.get('LUSTRE_INGEST_TOKEN', '')
    if expected:
        got = request.headers.get('X-Ingest-Token') or ''
        if not hmac.compare_digest(got, expected):
            return jsonify({'ok': False, 'error': '采集令牌无效'}), 401
    report = request.get_json(silent=True) or {}
    if not report.get('node_id'):
        return jsonify({'ok': False, 'error': '缺少 node_id'}), 400
    ok, err = store_report(report)
    if not ok:
        return jsonify({'ok': False, 'error': err}), 500
    fired = []
    try:
        fired = alert_engine.evaluate(report)
    except Exception as e:
        print(f'[ALERT ENGINE ERROR] {e}')
    return jsonify({'ok': True, 'node_id': report.get('node_id'), 'alerts_fired': len(fired)})


def store_report(report):
    """把一个采集报告写入各指标表（供 ingest 路由与本机自采集线程复用）。"""
    ts = report.get('timestamp') or datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO node_metrics (timestamp, node_id, nid, status, role) VALUES (?,?,?,?,?)',
            (ts, report.get('node_id'), report.get('nid') or '', 'online', report.get('role') or 'client'))
        for o in report.get('osts', []):
            cur.execute(
                """INSERT INTO ost_metrics
                   (timestamp,name,uuid,type,total_bytes,used_bytes,available_bytes,usage_percent,mount,fs_name)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (ts, o.get('name'), o.get('uuid'), o.get('type'), o.get('total_bytes'),
                 o.get('used_bytes'), o.get('available_bytes'), o.get('usage_percent'),
                 o.get('mount'), o.get('fs_name')))
        for p in report.get('perf', []):
            cur.execute(
                'INSERT INTO perf_rates (timestamp, ost_name, read_mbps, write_mbps, read_iops, write_iops)'
                ' VALUES (?,?,?,?,?,?)',
                (ts, f"{report.get('node_id')}:{p.get('ost_name')}",
                 p.get('read_bytes_total'), p.get('write_bytes_total'), 0, 0))
        cur.execute(
            """INSERT INTO lustre_nodes
               (node_id, hostname, ip, role, nid, lustre_version, kernel_version,
                services_json, target_mounts_json, last_heartbeat, status)
               VALUES (?,?,?,?,?,?,?,?,?,?, 'online')
               ON CONFLICT(node_id) DO UPDATE SET
                 hostname=excluded.hostname, ip=excluded.ip, role=excluded.role, nid=excluded.nid,
                 lustre_version=excluded.lustre_version, kernel_version=excluded.kernel_version,
                 services_json=excluded.services_json, target_mounts_json=excluded.target_mounts_json,
                 last_heartbeat=excluded.last_heartbeat, status='online'""",
            (report.get('node_id'), report.get('hostname'), report.get('ip'), report.get('role'),
             report.get('nid') or '', report.get('lustre_version') or '',
             report.get('kernel_version') or '',
             json.dumps(report.get('services') or [], ensure_ascii=False),
             json.dumps(report.get('target_mounts') or [], ensure_ascii=False), ts))
        # 服务端深度探针快照
        if report.get('server_probe'):
            cur.execute(
                'INSERT INTO server_probes (timestamp, node_id, role, probe_json) VALUES (?,?,?,?)',
                (ts, report.get('node_id'), report.get('role'),
                 json.dumps(report.get('server_probe'), ensure_ascii=False)))
        conn.commit()
        conn.close()
        return True, None
    except Exception as e:
        print(f'[INGEST ERROR] {e}')
        return False, str(e)


def _local_collect_loop(interval):
    """本机自采集后台线程：定时采集并写库 + 评估告警 + 节点存活检查。"""
    # 存活看门狗周期（默认 60s），独立于采集间隔
    watchdog_every = int(os.environ.get('LUSTRE_WATCHDOG_INTERVAL', '60'))
    max_age = int(os.environ.get('LUSTRE_NODE_STALE_SECONDS', '300'))
    last_watchdog = 0.0
    while True:
        try:
            report = lustre_collect.collect_report()
            ok, err = store_report(report)
            if ok:
                try:
                    fired = alert_engine.evaluate(report)
                    if fired:
                        print(f'[SELF-COLLECT] {report.get("node_id")} 触发 {len(fired)} 条告警')
                except Exception as e:
                    print(f'[SELF-COLLECT ALERT ERROR] {e}')
        except Exception as e:
            print(f'[SELF-COLLECT ERROR] {e}')

        # 周期执行节点存活看门狗
        now = time.time()
        if now - last_watchdog >= watchdog_every:
            last_watchdog = now
            try:
                inv = load_inventory()
                expected = [(s.get('name'), s.get('role')) for s in (inv or {}).get('servers', [])]
                # server_mode: client-only 表示服务端未部署 agent（经客户端间接监控）
                smode = (os.environ.get('LUSTRE_SERVER_MODE')
                         or (inv or {}).get('serverMode') or 'agent')
                n = alert_engine.check_node_liveness(
                    max_age_seconds=max_age, expected_servers=expected, server_mode=smode)
                if n:
                    print(f'[WATCHDOG] 触发 {n} 条节点存活告警')
            except Exception as e:
                print(f'[WATCHDOG ERROR] {e}')
        time.sleep(interval)


def start_self_collector():
    """启动本机自采集（可用 LUSTRE_SELF_COLLECT=0 关闭，LUSTRE_COLLECT_INTERVAL 秒控制周期）。"""
    if os.environ.get('LUSTRE_SELF_COLLECT', '1') == '0':
        print('[SELF-COLLECT] 已关闭')
        return
    interval = int(os.environ.get('LUSTRE_COLLECT_INTERVAL', '60'))
    t = threading.Thread(target=_local_collect_loop, args=(interval,), daemon=True)
    t.start()
    print(f'[SELF-COLLECT] 已启动，间隔 {interval}s')


@app.route('/api/nodes', methods=['GET'])
def nodes_registry():
    """所有已注册节点（客户端+服务端），供配置页/拓扑展示。"""
    rows = db_query('SELECT * FROM lustre_nodes ORDER BY role, node_id')
    out = []
    for r in rows:
        try:
            services = json.loads(r.get('services_json') or '[]')
        except Exception:
            services = []
        try:
            mounts = json.loads(r.get('target_mounts_json') or '[]')
        except Exception:
            mounts = []
        out.append({
            'id': r['node_id'], 'name': r['node_id'], 'hostname': r['hostname'],
            'ip': r['ip'], 'role': r['role'], 'nid': r['nid'],
            'lustreVersion': r['lustre_version'], 'kernelVersion': r['kernel_version'],
            'services': services, 'targetMounts': mounts,
            'lastHeartbeat': r['last_heartbeat'], 'status': r['status'],
        })
    return jsonify({'count': len(out), 'nodes': out})


@app.route('/api/server-probes', methods=['GET'])
def server_probes_list():
    """最新一次各服务端节点的深度探针快照。"""
    rows = db_query("""
        SELECT node_id, role, timestamp, probe_json
        FROM server_probes
        WHERE id IN (SELECT MAX(id) FROM server_probes GROUP BY node_id)
        ORDER BY node_id
    """)
    out = []
    for r in rows:
        try:
            probe = json.loads(r.get('probe_json') or '{}')
        except Exception:
            probe = {}
        out.append({'nodeId': r['node_id'], 'role': r['role'],
                    'timestamp': r['timestamp'], 'probe': probe})
    return jsonify({'count': len(out), 'probes': out})


@app.route('/api/server-probes/<node_id>', methods=['GET'])
def server_probe_detail(node_id):
    rows = db_query(
        'SELECT node_id, role, timestamp, probe_json FROM server_probes'
        ' WHERE node_id = ? ORDER BY id DESC LIMIT 1', (node_id,))
    if not rows:
        return jsonify({'error': '该节点无服务端探针数据'}), 404
    r = rows[0]
    try:
        probe = json.loads(r.get('probe_json') or '{}')
    except Exception:
        probe = {}
    return jsonify({'nodeId': r['node_id'], 'role': r['role'],
                    'timestamp': r['timestamp'], 'probe': probe})


INVENTORY_PATH = os.environ.get('LUSTRE_INVENTORY', '/opt/lustre-data/inventory.json')


def load_inventory():
    """加载集群清单（应有节点），用于与实际采集到的节点对账。"""
    for p in (INVENTORY_PATH, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'deploy', 'inventory.json')):
        try:
            with open(p, encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            continue
    return None


@app.route('/api/inventory', methods=['GET'])
def inventory_view():
    """集群清单 + 与实采节点对账结果（发现漏报/掉线）。"""
    inv = load_inventory()
    if not inv:
        return jsonify({'ok': False, 'error': '未找到 inventory.json'}), 404

    rows = db_query('SELECT node_id, ip, role, nid, last_heartbeat, status FROM lustre_nodes')
    reported = {r['node_id']: r for r in rows}
    reported_ips = {r['ip'] for r in rows if r.get('ip')}

    def node_key(srv):
        # 采集上报的 node_id 可能是 hostname / spec.nodeName / 短名
        names = {srv.get('name')} | set(srv.get('hostnames') or [])
        for n in names:
            if n and n in reported:
                return n
        # 再按 LNET IP / 管理 IP 匹配
        for ip in (srv.get('lnet') or []) + [srv.get('mgmtIp')]:
            if ip in reported_ips:
                for nid, r in reported.items():
                    if r.get('ip') == ip:
                        return nid
        return None

    servers = []
    missing = []
    for srv in inv.get('servers', []):
        key = node_key(srv)
        rec = reported.get(key) if key else None
        item = {
            'name': srv['name'], 'role': srv['role'], 'mgmtIp': srv.get('mgmtIp'),
            'lnet': srv.get('lnet') or [],
            'reporting': bool(rec),
            'status': rec['status'] if rec else 'no-data',
            'lastHeartbeat': rec['last_heartbeat'] if rec else None,
        }
        servers.append(item)
        if not rec:
            missing.append(srv['name'])

    return jsonify({
        'ok': True,
        'cluster': inv.get('cluster'),
        'networks': inv.get('networks'),
        'servers': servers,
        'storageArrays': inv.get('storageArrays'),
        'clients': inv.get('clients'),
        'summary': {
            'expectedServers': len(inv.get('servers', [])),
            'reportingServers': sum(1 for s in servers if s['reporting']),
            'missingServers': missing,
            'totalReportedNodes': len(reported),
        },
    })


@app.route('/api/alert-rules', methods=['GET'])
def alert_rules_list():
    return jsonify({'rules': alert_engine.list_rules()})


@app.route('/api/alert-rules', methods=['POST'])
@require_role('admin')
def alert_rules_upsert():
    body = request.get_json(silent=True) or {}
    if not body.get('id'):
        body['id'] = f"rule-{uuid.uuid4().hex[:8]}"
    alert_engine.upsert_rule(body)
    return jsonify({'ok': True, 'rule': body})


@app.route('/api/alert-rules/<rule_id>', methods=['DELETE'])
@require_role('admin')
def alert_rules_delete(rule_id):
    alert_engine.delete_rule(rule_id)
    return jsonify({'ok': True})


@app.route('/api/notification-channels', methods=['GET'])
def notification_channels_get():
    ch = alert_engine.get_channels()
    # 不返回完整 webhook 地址（含密钥），只回是否已配置
    for t, cfg in ch.items():
        url = cfg.get('webhookUrl') or cfg.get('webhook_url') or ''
        cfg['webhookConfigured'] = bool(url)
        if url:
            cfg['webhookMasked'] = url[:38] + '...'
            cfg.pop('webhookUrl', None)
            cfg.pop('webhook_url', None)
    return jsonify({'channels': ch})


@app.route('/api/notification-channels/<channel_type>', methods=['POST'])
@require_role('admin')
def notification_channels_set(channel_type):
    body = request.get_json(silent=True) or {}
    enabled = bool(body.get('enabled'))
    config = {k: v for k, v in body.items() if k != 'enabled'}
    alert_engine.set_channel(channel_type, enabled, config)
    return jsonify({'ok': True})


@app.route('/api/notify/test', methods=['POST'])
@require_role('engineer')
def notify_test():
    """发送一条测试通知到指定渠道（默认飞书）。"""
    body = request.get_json(silent=True) or {}
    channel = body.get('channel') or 'feishu'
    if channel == 'feishu':
        ok = alert_engine._notify('info', '通知通道测试', request.remote_addr or '本机')
        return jsonify({'ok': ok, 'message': '已发送' if ok else '发送失败（未启用或 webhook 未配置）'})
    return jsonify({'ok': False, 'message': '不支持的渠道'}), 400


@app.route('/api/cluster/config')
def cluster_config():
    """实时文件系统配置（默认条带、挂载、关键参数），供配置页展示。"""
    stripe, _, _ = run_cmd(f'lfs getstripe -d {LUSTRE_CLIENT} 2>/dev/null || true', timeout=15)
    fsname, _, _ = run_cmd("lfs getname -n 2>/dev/null || true", timeout=10)
    version, _, _ = run_cmd('lctl get_param -n version 2>/dev/null', timeout=10)

    # 采集一批常用可调参数（真实值）
    param_keys = [
        'osc.*.max_rpcs_in_flight', 'mdc.max_rpcs_in_flight',
        'llite.*.max_read_ahead_mb', 'llite.*.max_cached_mb',
        'ldlm.namespaces.*.lru_size', 'mdc.*.timeouts',
    ]
    params = []
    for key in param_keys:
        val, _, _ = run_cmd(f'lctl get_param -n {key} 2>/dev/null | head -1', timeout=10)
        val = (val or '').strip()
        if val:
            params.append({'name': key, 'currentValue': val, 'source': 'live'})

    # 默认条带解析
    stripe_entries = []
    for line in (stripe or '').splitlines():
        line = line.strip()
        if not line:
            continue
        if ':' in line:
            k, v = line.split(':', 1)
            stripe_entries.append({'key': k.strip(), 'value': v.strip()})

    return jsonify({
        'mount': LUSTRE_CLIENT,
        'fsName': (fsname or '').strip() or 'lustre',
        'lustreVersion': ("lctl get_param version" if False else (version or '').strip()),
        'stripeRaw': stripe or '',
        'stripe': stripe_entries,
        'parameters': params,
    })


@app.route('/api/metrics/nodes')
def nodes_list():
    """Return latest unique nodes"""
    rows = db_query("""
        SELECT DISTINCT node_id, nid, status, role
        FROM node_metrics
        WHERE timestamp = (SELECT MAX(timestamp) FROM node_metrics)
        ORDER BY role, node_id
    """)
    # Deduplicate by node_id (keep latest)
    seen = {}
    for r in rows:
        if r['node_id'] not in seen:
            seen[r['node_id']] = r
    return jsonify({'nodes': list(seen.values()), 'count': len(seen)})


@app.route('/api/alerts/active')
def alerts_active():
    """Return unresolved alerts"""
    limit = min(max(request.args.get('limit', 50, type=int), 1), 200)
    rows = db_query("""
        SELECT id, timestamp, level, title, message, source
        FROM alerts
        WHERE resolved = 0
        ORDER BY CASE level WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, timestamp DESC
        LIMIT ?
    """, (limit,))
    return jsonify({'count': len(rows), 'alerts': rows})


@app.route('/api/alerts/history')
def alerts_history():
    limit = request.args.get('limit', 100, type=int)
    rows = db_query("""
        SELECT id, timestamp, level, title, message, source, resolved, resolved_at
        FROM alerts
        ORDER BY timestamp DESC
        LIMIT ?
    """, (limit,))
    return jsonify({'count': len(rows), 'alerts': rows})


@app.route('/api/alerts/<alert_id>')
def alert_detail(alert_id):
    rows = db_query("""
        SELECT id, timestamp, level, title, message, source, resolved, resolved_at
        FROM alerts
        WHERE CAST(id AS TEXT) = ?
        LIMIT 1
    """, (str(alert_id),))
    if not rows:
        return jsonify({'success': False, 'message': '告警不存在或已被清理', 'code': 'ALERT_NOT_FOUND'}), 404

    alert = rows[0]
    return jsonify({'success': True, 'alert': alert})


def load_alert_by_id(alert_id):
    rows = db_query("""
        SELECT id, timestamp, level, title, message, source, resolved, resolved_at
        FROM alerts
        WHERE CAST(id AS TEXT) = ?
        LIMIT 1
    """, (str(alert_id),))
    return rows[0] if rows else None


def alert_action_target_node(alert):
    source = alert.get('source') or '当前 API 节点'
    if source in ('health_check', 'client_mount', 'alerts'):
        return '当前 API 节点'
    return source


def build_alert_actions(alert):
    text = f"{alert.get('title') or ''} {alert.get('message') or ''} {alert.get('source') or ''}".lower()
    target = alert_action_target_node(alert)
    if 'mounted' in text or 'mount' in text or '未挂载' in text or 'no such device' in text:
        return [
            {
                'id': 'check-client-mount',
                'title': '检查客户端挂载点',
                'description': '确认当前节点是否已经挂载 Lustre，并查看 lfs df 是否可读。',
                'targetNode': target,
                'mode': 'diagnostic',
                'risk': 'low',
                'buttonLabel': '立即执行',
                'commandPreview': f'mount | grep -i lustre || lfs df -h {LUSTRE_CLIENT}',
                'commands': [
                    {'label': '检查 mount 挂载表', 'command': "mount | grep -i lustre || true", 'timeout': 10},
                    {'label': f'检查 {LUSTRE_CLIENT} 是否为挂载点', 'commandf': "mountpoint {LUSTRE_CLIENT} && findmnt {LUSTRE_CLIENT} || true", 'timeout': 10},
                    {'label': '尝试读取 Lustre 容量', 'commandf': "lfs df -h {LUSTRE_CLIENT} 2>&1 || true", 'timeout': 15},
                ],
                'nextStep': '如果没有任何 Lustre 挂载记录，请继续执行 LNet/MGS 检查和 fstab 检查。',
            },
            {
                'id': 'check-lnet-services',
                'title': '检查 LNet 与 Lustre 服务',
                'description': '确认本机 NID、LNet 网络和 Lustre servers 检查结果。',
                'targetNode': target,
                'mode': 'diagnostic',
                'risk': 'low',
                'buttonLabel': '立即执行',
                'commandPreview': 'lctl list_nids && lfs check servers',
                'commands': [
                    {'label': '查看本机 NID', 'command': "lctl list_nids 2>&1 || true", 'timeout': 10},
                    {'label': '检查 Lustre 服务', 'command': "lfs check servers 2>&1 || true", 'timeout': 20},
                    {'label': '查看 LNet 网络', 'command': "lnetctl net show 2>&1 || true", 'timeout': 10},
                ],
                'nextStep': '如果 NID 为空或 servers 检查失败，需要先恢复网络或 MGS/MDS/OSS 服务，再尝试挂载。',
            },
            {
                'id': 'check-fstab-mount-config',
                'title': '检查挂载配置',
                'description': f'查看 /etc/fstab 和常见挂载脚本中是否存在 {LUSTRE_CLIENT} 配置。',
                'targetNode': target,
                'mode': 'diagnostic',
                'risk': 'low',
                'buttonLabel': '立即执行',
                'commandPreview': f"grep -nE 'lustre|{LUSTRE_CLIENT}' /etc/fstab",
                'commands': [
                    {'label': '查看 fstab 中的 Lustre 配置', 'command': f"grep -nE 'lustre|{LUSTRE_CLIENT}' /etc/fstab 2>&1 || true", 'timeout': 10},
                    {'label': '查看常见挂载脚本', 'command': "find /etc /opt -maxdepth 3 -type f \\( -iname '*lustre*' -o -iname '*mount*' \\) 2>/dev/null | head -40 || true", 'timeout': 10},
                ],
                'nextStep': '如果没有挂载配置，系统不会自动挂载；请先补齐 MGS NID、文件系统名和挂载路径。',
            },
            {
                'id': 'try-client-mount',
                'title': '受控尝试重新挂载客户端',
                'description': f'仅当 /etc/fstab 已存在 {LUSTRE_CLIENT} 挂载项时执行 mount {LUSTRE_CLIENT}，并立即校验结果。',
                'targetNode': target,
                'mode': 'repair',
                'risk': 'medium',
                'buttonLabel': '立即执行',
                'commandPreview': f'mount {LUSTRE_CLIENT} && mountpoint {LUSTRE_CLIENT}',
                'commands': [
                    {
                        'label': f'受控挂载 {LUSTRE_CLIENT}',
                        'command': f"if mountpoint -q {LUSTRE_CLIENT}; then echo '{LUSTRE_CLIENT} 已经挂载'; exit 0; fi; if grep -Eq '[[:space:]]{LUSTRE_CLIENT}[[:space:]]' /etc/fstab; then mount {LUSTRE_CLIENT} && mountpoint {LUSTRE_CLIENT} && lfs df -h {LUSTRE_CLIENT} 2>/dev/null || true; else echo '未在 /etc/fstab 找到 {LUSTRE_CLIENT} 挂载项，未执行 mount'; exit 2; fi",
                        'timeout': 30,
                    },
                ],
                'nextStep': '执行后请刷新告警详情或重新巡检；如果仍失败，按输出中的错误检查 MGS NID、网络和服务状态。',
            },
        ]

    return [
        {
            'id': 'collect-alert-context',
            'title': '收集告警上下文',
            'description': '读取最近 Lustre/LNet 日志和活跃告警统计，辅助定位根因。',
            'targetNode': target,
            'mode': 'diagnostic',
            'risk': 'low',
            'buttonLabel': '立即执行',
            'commandPreview': 'journalctl -k | grep lustre && sqlite3 alerts count',
            'commands': [
                {'label': '查看最近 Lustre/LNet 日志', 'command': "journalctl --no-pager -k -n 160 | egrep -i 'lustre|lnet|error|failed|timeout|recovery' | tail -80 || true", 'timeout': 15},
                {'label': '查看活跃告警数量', 'command': "sqlite3 /opt/lustre-data/lustre.db \"select level, count(*) from alerts where resolved=0 group by level;\" 2>/dev/null || true", 'timeout': 10},
            ],
            'nextStep': '根据输出定位根因；确认修复后重新巡检，避免只静默告警。',
        },
    ]


def public_alert_action(action):
    return {
        'id': action['id'],
        'title': action['title'],
        'description': action['description'],
        'targetNode': action['targetNode'],
        'mode': action['mode'],
        'risk': action['risk'],
        'buttonLabel': action['buttonLabel'],
        'commandPreview': action['commandPreview'],
        'nextStep': action['nextStep'],
    }


@app.route('/api/alerts/<alert_id>/actions')
def alert_actions(alert_id):
    alert = load_alert_by_id(alert_id)
    if not alert:
        return jsonify({'success': False, 'message': '告警不存在或已被清理', 'code': 'ALERT_NOT_FOUND'}), 404
    actions = [public_alert_action(action) for action in build_alert_actions(alert)]
    return jsonify({'success': True, 'alertId': alert['id'], 'actions': actions})


@app.route('/api/alerts/<alert_id>/actions/<action_id>/run', methods=['POST'])
def run_alert_action(alert_id, action_id):
    alert = load_alert_by_id(alert_id)
    if not alert:
        return jsonify({'success': False, 'message': '告警不存在或已被清理', 'code': 'ALERT_NOT_FOUND'}), 404

    actions = build_alert_actions(alert)
    action = next((item for item in actions if item['id'] == action_id), None)
    if not action:
        return jsonify({'success': False, 'message': '该告警不支持此执行动作', 'code': 'ACTION_NOT_ALLOWED'}), 404

    started = now_iso()
    results = []
    for command in action.get('commands', []):
        stdout, stderr, rc = run_cmd(command['command'], timeout=command.get('timeout', 10))
        output = stdout if stdout else stderr
        results.append({
            'label': command['label'],
            'command': command['command'],
            'exitCode': rc,
            'ok': rc == 0,
            'output': (output or '').strip()[:5000],
        })

    ok = all(item['ok'] for item in results)
    return jsonify({
        'success': True,
        'ok': ok,
        'alertId': alert['id'],
        'action': public_alert_action(action),
        'startedAt': started,
        'finishedAt': now_iso(),
        'message': '执行完成，已返回命令输出。' if ok else '执行完成，但部分命令返回异常，请查看输出。',
        'results': results,
        'nextStep': action.get('nextStep') or '请根据输出继续处理，并在完成后重新巡检。',
    })


def collect_alert_analysis_context(alert):
    commands = [
        {'label': '当前 Lustre 状态', 'command': 'lfs check servers 2>&1 || true', 'timeout': 20},
        {'label': '客户端挂载状态', 'command': f'mountpoint {LUSTRE_CLIENT} 2>&1; lfs df -h {LUSTRE_CLIENT} 2>&1 || true', 'timeout': 15},
        {'label': 'LNet NID', 'command': 'lctl list_nids 2>&1 || true', 'timeout': 10},
        {'label': 'LNet 网络', 'command': 'lnetctl net show 2>&1 | head -120 || true', 'timeout': 10},
        {'label': '相关挂载记录', 'command': f"mount | egrep -i 'lustre|{LUSTRE_CLIENT}' || true", 'timeout': 10},
        {'label': 'fstab 相关配置', 'command': f"grep -nE 'lustre|{LUSTRE_CLIENT}|mgt_pool|mdt_pool|ost[0-9]_pool' /etc/fstab 2>&1 || true", 'timeout': 10},
        {'label': '最近内核日志', 'command': "journalctl --no-pager -k -n 180 | egrep -i 'lustre|lnet|mgs|mdt|ost|error|failed|timeout|recovery' | tail -80 || true", 'timeout': 15},
    ]
    results = []
    for item in commands:
        stdout, stderr, rc = run_cmd(item['command'], timeout=item.get('timeout', 10))
        output = stdout if stdout else stderr
        results.append({
            'label': item['label'],
            'command': item['command'],
            'exitCode': rc,
            'ok': rc == 0,
            'output': (output or '').strip()[:5000],
        })

    active_counts = db_query("""
        SELECT level, COUNT(*) AS count
        FROM alerts
        WHERE resolved = 0
        GROUP BY level
        ORDER BY level
    """)
    latest_related = db_query("""
        SELECT id, timestamp, level, title, message, source, resolved, resolved_at
        FROM alerts
        WHERE source = ? OR title = ? OR message = ?
        ORDER BY id DESC
        LIMIT 10
    """, (alert.get('source') or '', alert.get('title') or '', alert.get('message') or ''))

    return {
        'checkedAt': now_iso(),
        'host': run_cmd('hostname 2>/dev/null || true', timeout=5)[0],
        'activeAlertCounts': active_counts,
        'latestRelatedAlerts': latest_related,
        'checks': results,
    }


def compact_alert_context(context):
    lines = []
    lines.append(f"检查时间: {context.get('checkedAt')}")
    lines.append(f"主机: {context.get('host') or '未知'}")
    lines.append(f"活跃告警统计: {json.dumps(context.get('activeAlertCounts') or [], ensure_ascii=False)}")
    lines.append(f"最近相关告警: {json.dumps(context.get('latestRelatedAlerts') or [], ensure_ascii=False)[:2500]}")
    lines.append('')
    for item in context.get('checks') or []:
        lines.append(f"## {item.get('label')}")
        lines.append(f"命令: {item.get('command')}")
        lines.append(f"退出码: {item.get('exitCode')}")
        output = item.get('output') or '无输出'
        lines.append(output[:3500])
        lines.append('')
    return '\n'.join(lines)[:16000]


def local_alert_analysis(alert, context, ai_error=None):
    check_text = compact_alert_context(context).lower()
    resolved_hint = f'当前检查显示 `{LUSTRE_CLIENT}` 已挂载，`lfs check servers` 可用。' if 'active.' in check_text and 'not a mountpoint' not in check_text else '当前检查仍需管理员继续确认挂载、LNet 和服务端 target 状态。'
    sections = [
        '# 智能分析结果',
        '',
        '## 结论',
        f"- 告警标题：{alert.get('title') or '未命名告警'}",
        f"- 告警对象：{alert.get('source') or '未知'}",
        f"- 当前判断：{resolved_hint}",
        '',
        '## 证据',
    ]
    for item in (context.get('checks') or [])[:5]:
        output = (item.get('output') or '').strip().splitlines()
        first_line = output[0] if output else '无输出'
        sections.append(f"- {item.get('label')}：退出码 {item.get('exitCode')}，{first_line[:180]}")
    sections.extend([
        '',
        '## 建议继续检查',
        '1. 人工复核 `lctl list_nids` 是否包含生产规划中的 NID。',
        '2. 人工复核 `lfs check servers` 是否所有 MGC、MDT、OST 均为 active。',
        '3. 人工确认 `/etc/fstab` 中的 MGS NID、文件系统名和挂载点是否符合变更记录。',
        '4. 如果告警已经恢复，观察至少一个采集周期，确认 `/api/alerts/active` 不再出现同类告警。',
        '',
        '## 人工处理原则',
        '- 大模型和系统只提供诊断建议，不自动执行挂载、重启、删除、格式化或配置修改。',
        '- 涉及存储服务端 target、客户端挂载、网络配置变更时，必须由运维管理员确认后手工执行。',
    ])
    if ai_error:
        sections.extend(['', '## 模型调用状态', f'- 未使用模型输出：{ai_error}'])
    return '\n'.join(sections)


def has_high_risk_operation_text(answer):
    text = (answer or '').lower()
    risky_patterns = [
        'lctl set_param',
        'lctl conf_param',
        'lctl lfsck_start',
        'mkfs.lustre',
        'tunefs.lustre',
        'zpool import',
        'zpool export',
        'systemctl restart',
        'service restart',
        'modprobe -r',
        'umount ',
        'reboot',
        'shutdown',
        'rm -rf',
        'dd if=',
    ]
    return any(pattern in text for pattern in risky_patterns)


def call_alert_ai_analysis(settings, alert, context):
    base_url = (settings.get('baseUrl') or '').rstrip('/')
    api_key = settings.get('apiKey') or ''
    model_id = settings.get('modelId') or ''
    if not base_url or not api_key or not model_id:
        return {'ok': False, 'message': 'AI 模型未配置完整，请先保存 Base URL、API Key 和 Model ID'}

    system_prompt = (
        '你是 Lustre/HPC 存储运维专家。你只能基于输入中的真实告警、检查命令和输出做分析。'
        '禁止编造节点、NID、文件系统名、日志、命令输出或已经完成的动作。'
        '你不能直接执行命令，也不能要求系统自动执行修复。'
        '建议继续检查时，优先使用低风险只读命令，例如 lfs check servers、lfs df -h、lctl list_nids、'
        'lnetctl net show、mountpoint、mount、grep /etc/fstab、journalctl、dmesg、ping。'
        '不要建议不存在或不确定的命令；不要把 lfsck、lctl lfsck_start、tunefs.lustre、mkfs.lustre、'
        'zpool import/export、mount、umount、systemctl restart、修改 /etc/fstab 等写入或变更动作包装成普通检查步骤。'
        '涉及挂载、卸载、重启服务、写 fstab、修改 LNet、删除数据、格式化、导入/导出 zpool 等动作时，'
        '必须明确标注为“由运维管理员人工确认后执行”。'
        '如果必须提到高风险或写入类命令，只能放在“人工处理步骤”中，并说明执行前置条件、变更窗口、备份和回滚要求。'
        '回答必须使用中文，并按以下结构输出：结论、关键证据、可能原因、建议继续检查、人工处理步骤、风险提示。'
        '如果当前检查显示已经恢复，要说明恢复证据和后续观察建议。'
    )
    user_prompt = f"""告警信息:
{json.dumps(alert, ensure_ascii=False, indent=2)}

只读检查上下文:
{compact_alert_context(context)}
"""
    body = {
        'model': model_id,
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_prompt},
        ],
        'temperature': 0.15,
        'max_tokens': 1800,
    }
    req = urllib_request.Request(
        f'{base_url}/chat/completions',
        data=json.dumps(body).encode('utf-8'),
        method='POST',
    )
    req.add_header('Authorization', f'Bearer {api_key}')
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib_request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode('utf-8')
            parsed = json.loads(raw) if raw else {}
            choices = parsed.get('choices') or []
            content = ''
            if choices:
                message = choices[0].get('message') or {}
                content = message.get('content') or choices[0].get('text') or ''
            if not content:
                return {'ok': False, 'message': '模型接口返回为空，未获取到可展示的分析'}
            content = content.strip()
            if has_high_risk_operation_text(content):
                return {'ok': False, 'message': '模型输出包含高风险写入、调参、重启或格式化类命令，已切换为本地保守分析'}
            return {
                'ok': True,
                'answer': content,
                'model': model_id,
                'provider': settings.get('provider') or 'custom',
                'usage': parsed.get('usage') or {},
            }
    except urllib_error.HTTPError as e:
        detail = ''
        try:
            detail = e.read().decode('utf-8')[:500]
        except Exception:
            detail = ''
        return {'ok': False, 'message': f'模型接口 HTTP {e.code}: {detail or e.reason}'}
    except Exception as e:
        return {'ok': False, 'message': f'模型接口调用失败: {e}'}


@app.route('/api/alerts/<alert_id>/analysis', methods=['POST'])
def alert_ai_analysis(alert_id):
    alert = load_alert_by_id(alert_id)
    if not alert:
        return jsonify({'success': False, 'message': '告警不存在或已被清理', 'code': 'ALERT_NOT_FOUND'}), 404

    context = collect_alert_analysis_context(alert)
    settings = load_json_file(AI_SETTINGS_PATH, default_ai_settings())
    ai_result = call_alert_ai_analysis(settings, alert, context)
    if ai_result.get('ok'):
        return jsonify({
            'success': True,
            'mode': 'ai',
            'answer': ai_result.get('answer'),
            'model': ai_result.get('model'),
            'provider': ai_result.get('provider'),
            'usage': ai_result.get('usage') or {},
            'context': context,
            'message': '智能分析已完成',
        })

    fallback = local_alert_analysis(alert, context, ai_result.get('message'))
    return jsonify({
        'success': True,
        'mode': 'local_fallback',
        'answer': fallback,
        'model': settings.get('modelId') or '',
        'provider': settings.get('provider') or '',
        'context': context,
        'message': ai_result.get('message') or '模型不可用，已返回本地保守分析',
    })


@app.route('/api/metrics/performance/history')
def perf_history():
    """Return performance deltas (MB/s rates) calculated from stats"""
    hours = request.args.get('hours', 1, type=int)
    since = (datetime.now() - timedelta(hours=hours)).isoformat()

    # Get earliest and latest perf stats per OST in window
    rows = db_query("""
        SELECT timestamp, ost_name,
               read_samples, read_sum_bytes,
               write_samples, write_sum_bytes
        FROM perf_stats
        WHERE timestamp > ?
        ORDER BY ost_name, timestamp ASC
    """, (since,))

    # Calculate rates
    results = []
    by_ost = {}
    for r in rows:
        name = r['ost_name']
        if name not in by_ost:
            by_ost[name] = {'first': r, 'last': r}
        else:
            by_ost[name]['last'] = r

    for name, data in by_ost.items():
        first = data['first']
        last = data['last']
        dt = datetime.strptime(last['timestamp'], '%Y-%m-%dT%H:%M:%S.%f') - datetime.strptime(first['timestamp'], '%Y-%m-%dT%H:%M:%S.%f')
        dt_sec = dt.total_seconds() if dt.total_seconds() > 0 else 3600

        read_mb = (last['read_sum_bytes'] - first['read_sum_bytes']) / 1024 / 1024 / dt_sec
        write_mb = (last['write_sum_bytes'] - first['write_sum_bytes']) / 1024 / 1024 / dt_sec
        read_iops = (last['read_samples'] - first['read_samples']) / dt_sec
        write_iops = (last['write_samples'] - first['write_samples']) / dt_sec

        results.append({
            'ost_name': name,
            'read_mbps': round(read_mb, 2),
            'write_mbps': round(write_mb, 2),
            'read_iops': round(read_iops, 1),
            'write_iops': round(write_iops, 1),
            'period_sec': round(dt_sec)
        })

    return jsonify({'hours': hours, 'osts': results})




@app.route('/api/metrics/sys/stats')
def sys_stats():
    row = db_query("SELECT * FROM sys_stats ORDER BY timestamp DESC LIMIT 1")
    return jsonify({'data': row[0] if row else None})


@app.route('/api/metrics/performance/trend')
def perf_trend():
    hours = request.args.get('hours', 2, type=int)
    since = (datetime.now() - timedelta(hours=hours)).isoformat()
    rows = db_query("""
        SELECT timestamp,
               ROUND(SUM(read_mbps), 2) as read_mbps,
               ROUND(SUM(write_mbps), 2) as write_mbps,
               ROUND(SUM(read_iops), 2) as read_iops,
               ROUND(SUM(write_iops), 2) as write_iops
        FROM perf_rates p1
        WHERE timestamp > ?
          AND timestamp = (
              SELECT MAX(timestamp) FROM perf_rates p2
              WHERE p2.ost_name = p1.ost_name
              AND strftime('%Y-%m-%d %H:%M', p2.timestamp) = strftime('%Y-%m-%d %H:%M', p1.timestamp)
          )
        GROUP BY strftime('%Y-%m-%d %H:%M', timestamp)
        ORDER BY timestamp DESC
        LIMIT ?
    """, (since, hours * 20))
    # Reverse for chart order (oldest first)
    rows.reverse()
    return jsonify({'hours': hours, 'points': rows})


@app.route('/api/metrics/dashboard/performance')
def dashboard_perf():
    latest = db_query("""
        SELECT SUM(read_mbps) as read_bw, SUM(write_mbps) as write_bw,
               SUM(read_iops) as read_iops, SUM(write_iops) as write_iops
        FROM perf_rates p1
        WHERE p1.timestamp > datetime('now', '-10 minutes')
          AND p1.timestamp = (
              SELECT MAX(timestamp) FROM perf_rates p2 WHERE p2.ost_name = p1.ost_name
          )
    """)
    sys_row = db_query("SELECT * FROM sys_stats ORDER BY timestamp DESC LIMIT 1")
    p = latest[0] if latest else {}
    return jsonify({
        'bandwidth': {
            'readMB': round(p.get('read_bw') or 0, 2),
            'writeMB': round(p.get('write_bw') or 0, 2)
        },
        'iops': {
            'read': round(p.get('read_iops') or 0, 1),
            'write': round(p.get('write_iops') or 0, 1)
        },
        'latency': {'read_ms': 0.1, 'write_ms': 0.1},
        'sys_stats': sys_row[0] if sys_row else None
    })

# 启动本机自采集（WSGI/gunicorn 部署也能生效）；测试可用 LUSTRE_SELF_COLLECT=0 关闭
start_self_collector()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3006, debug=False)
