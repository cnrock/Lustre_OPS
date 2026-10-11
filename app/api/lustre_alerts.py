#!/usr/bin/env python3
"""
Lustre OPS 告警规则引擎。

- 规则存 SQLite 表 alert_rules，可由前端增删改查
- 每次采集后调用 evaluate(report)，对照规则产生 alerts（去重、可闭环）
- 支持飞书 webhook 推送（渠道配置存 notification_channels 表）

仅标准库。
"""

import os
import json
import time
import sqlite3
import urllib.request
import urllib.error

DB_PATH = os.environ.get('LUSTRE_DB', '/opt/lustre-data/lustre.db')


DEFAULT_RULES = [
    {'id': 'rule-ost-usage-warn', 'name': 'OST 使用率 > 80%', 'metric': 'ost_usage_percent',
     'condition': '>', 'threshold': '80', 'severity': 'warning', 'enabled': 1, 'duration': '0'},
    {'id': 'rule-ost-usage-crit', 'name': 'OST 使用率 > 90%', 'metric': 'ost_usage_percent',
     'condition': '>', 'threshold': '90', 'severity': 'critical', 'enabled': 1, 'duration': '0'},
    {'id': 'rule-node-offline', 'name': '节点掉线', 'metric': 'node_online',
     'condition': '==', 'threshold': '0', 'severity': 'critical', 'enabled': 1, 'duration': '0'},
    {'id': 'rule-service-down', 'name': 'Lustre 服务未加载', 'metric': 'service_down',
     'condition': '>', 'threshold': '0', 'severity': 'critical', 'enabled': 1, 'duration': '0'},
    # 客户端连接故障：lfs check 报错（transport shutdown / I/O error / not responding 等）
    {'id': 'rule-lfs-check-error', 'name': '客户端 Lustre 连接异常 (lfs check)', 'metric': 'lfs_check_error',
     'condition': '>', 'threshold': '0', 'severity': 'critical', 'enabled': 1, 'duration': '0'},
    # 内核日志严重错误签名
    {'id': 'rule-kernel-error', 'name': '内核 Lustre/LNet 错误', 'metric': 'kernel_error',
     'condition': '>', 'threshold': '0', 'severity': 'critical', 'enabled': 1, 'duration': '0'},
]

# 告警处理指引：按 rule_id 给出定位步骤与解决建议
REMEDIATION_HINTS = {
    'rule-lfs-check-error': {
        'summary': '客户端与某个 OST/MDT 的连接中断，常见于服务端 target 故障、LNet 网络异常或客户端被 evict。',
        'locate': [
            '在受影响客户端执行 `lfs check all`，记录报错的 target 名（如 lustrefs-OST0005）。',
            '查看内核日志：`dmesg -T | egrep -i "lustre|lnet" | tail -50`。',
            '确认 LNet：`lctl list_nids`、`lnetctl net show`、`lnetctl ping <服务端NID>`。',
            '到对应服务端（OST/MDT 所在节点）检查该 target 是否 active：`lctl dl`、`lfs df`。',
        ],
        'fix': [
            '若为网络抖动/链路故障：检查 IB/RoCE 交换机端口与链路，恢复后 LNet 会自动重连。',
            '若服务端 target 异常：在该服务端按变更流程重启对应 target（`lctl --device <dev> activate`）。',
            '若客户端被 evict：确认服务端可达后，卸载重挂载客户端（`umount`/`mount`）。',
            '禁止直接批量重启全部节点；先定位是单 target、单链路还是全集群。',
        ],
    },
    'rule-kernel-error': {
        'summary': '内核日志命中 Lustre/LNet 严重错误签名（如 transport endpoint shutdown、I/O error、not responding）。',
        'locate': [
            '抓取完整上下文：`journalctl -k --since "-1 hour" | egrep -i "lustre|lnet|osc|ldlm"`。',
            '确认是哪个 target/NID：关注日志中的 OST/MDT 名与 NID。',
            '检查该节点 LNet 与 IB/RoCE 网卡状态：`ip -brief addr`、`ibstat`。',
        ],
        'fix': [
            '优先恢复网络/服务端 target；LNet 通常能自愈并进入 recovery。',
            '观察 recovery 是否完成：`lctl get_param -n mdc.*.import | head`。',
            '持续 recovery failed 时按变更窗口处理服务端，避免扩大影响。',
        ],
    },
    'rule-ost-usage-crit': {
        'summary': 'OST 容量告急，写入可能因 ENOSPC 失败。',
        'locate': ['确认高水位 OST：`lfs df`。', '定位增长最快目录：按目录统计 sizes。'],
        'fix': ['清理/迁移热点数据，或扩容对应 OST；避免业务高峰操作。'],
    },
    'rule-service-down': {
        'summary': '本节点 Lustre/LNet 内核模块未加载或已卸载。',
        'locate': ['`lsmod | egrep "lustre|lnet"`。', '`lctl list_nids` 是否为空。'],
        'fix': ['按标准流程重新加载 Lustre/LNet 模块；确认 /etc/lnet.conf 与 fstab。'],
    },
}


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init_alert_tables():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    c = _conn()
    try:
        cur = c.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS alert_rules (
                id TEXT PRIMARY KEY, name TEXT, metric TEXT, condition TEXT,
                threshold TEXT, severity TEXT, enabled INTEGER DEFAULT 1,
                duration TEXT, channels TEXT, created_at TEXT
            )""")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS notification_channels (
                type TEXT PRIMARY KEY, enabled INTEGER, config_json TEXT
            )""")
        # 告警统一写入 alerts 表（现有 /api/alerts/* 直接读它）；补 rule_id 列
        cur.execute("""
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT, level TEXT,
                title TEXT, message TEXT, source TEXT,
                resolved INTEGER NOT NULL DEFAULT 0, resolved_at TEXT, rule_id TEXT
            )""")
        acols = {r[1] for r in cur.execute('PRAGMA table_info(alerts)').fetchall()}
        if 'rule_id' not in acols:
            cur.execute('ALTER TABLE alerts ADD COLUMN rule_id TEXT')
        c.commit()
        # 初始化默认规则（仅当空）
        n = cur.execute('SELECT COUNT(*) AS c FROM alert_rules').fetchone()['c']
        if n == 0:
            now = time.strftime('%Y-%m-%d %H:%M:%S')
            for r in DEFAULT_RULES:
                cur.execute(
                    'INSERT INTO alert_rules (id,name,metric,condition,threshold,severity,enabled,duration,channels,created_at)'
                    ' VALUES (?,?,?,?,?,?,?,?,?,?)',
                    (r['id'], r['name'], r['metric'], r['condition'], r['threshold'],
                     r['severity'], r['enabled'], r['duration'], '[]', now))
            c.commit()
    finally:
        c.close()


def list_rules():
    c = _conn()
    try:
        return [dict(r) for r in c.execute('SELECT * FROM alert_rules ORDER BY id')]
    finally:
        c.close()


def upsert_rule(rule):
    c = _conn()
    try:
        c.execute("""
            INSERT INTO alert_rules (id,name,metric,condition,threshold,severity,enabled,duration,channels,created_at)
            VALUES (:id,:name,:metric,:condition,:threshold,:severity,:enabled,:duration,:channels,:created_at)
            ON CONFLICT(id) DO UPDATE SET
              name=excluded.name, metric=excluded.metric, condition=excluded.condition,
              threshold=excluded.threshold, severity=excluded.severity, enabled=excluded.enabled,
              duration=excluded.duration, channels=excluded.channels
        """, {
            'id': rule.get('id'), 'name': rule.get('name'), 'metric': rule.get('metric'),
            'condition': rule.get('condition'), 'threshold': str(rule.get('threshold')),
            'severity': rule.get('severity') or 'warning',
            'enabled': 1 if rule.get('enabled', True) else 0,
            'duration': str(rule.get('duration') or '0'),
            'channels': json.dumps(rule.get('channels') or [], ensure_ascii=False),
            'created_at': time.strftime('%Y-%m-%d %H:%M:%S'),
        })
        c.commit()
    finally:
        c.close()


def delete_rule(rule_id):
    c = _conn()
    try:
        c.execute('DELETE FROM alert_rules WHERE id = ?', (rule_id,))
        c.commit()
    finally:
        c.close()


def get_channels():
    c = _conn()
    try:
        out = {}
        for r in c.execute('SELECT * FROM notification_channels'):
            try:
                out[r['type']] = {'enabled': bool(r['enabled']), **(json.loads(r['config_json'] or '{}'))}
            except Exception:
                out[r['type']] = {'enabled': bool(r['enabled'])}
        return out
    finally:
        c.close()


def set_channel(channel_type, enabled, config):
    c = _conn()
    try:
        c.execute("""
            INSERT INTO notification_channels (type, enabled, config_json)
            VALUES (?, ?, ?)
            ON CONFLICT(type) DO UPDATE SET enabled=excluded.enabled, config_json=excluded.config_json
        """, (channel_type, 1 if enabled else 0, json.dumps(config or {}, ensure_ascii=False)))
        c.commit()
    finally:
        c.close()


# ------------------------------------------------------------------ evaluate
def _cmp(value, op, threshold):
    try:
        v = float(value)
        t = float(threshold)
    except (TypeError, ValueError):
        return False
    return {'>': v > t, '>=': v >= t, '<': v < t, '<=': v <= t, '==': v == t, '!=': v != t}.get(op, False)


def _active_alert_exists(rule_id, source):
    c = _conn()
    try:
        row = c.execute(
            'SELECT 1 FROM alerts WHERE rule_id = ? AND source = ? AND resolved = 0 LIMIT 1',
            (rule_id, source)).fetchone()
        return bool(row)
    finally:
        c.close()


def _create_alert(rule, source, title, message):
    c = _conn()
    try:
        c.execute(
            "INSERT INTO alerts (timestamp, level, title, message, source, resolved, rule_id)"
            " VALUES (?,?,?,?,?,0,?)",
            (time.strftime('%Y-%m-%d %H:%M:%S'), rule['severity'], title, message, source, rule['id']))
        c.commit()
    finally:
        c.close()


def _auto_resolve(rule_id, source):
    c = _conn()
    try:
        cur = c.execute(
            "UPDATE alerts SET resolved = 1, resolved_at = ?"
            " WHERE rule_id = ? AND source = ? AND resolved = 0",
            (time.strftime('%Y-%m-%d %H:%M:%S'), rule_id, source))
        c.commit()
        return cur.rowcount
    finally:
        c.close()


def _notify(level, title, message):
    """向已启用的渠道推送告警。目前支持飞书 webhook。"""
    channels = get_channels()
    feishu = channels.get('feishu') or {}
    if not feishu.get('enabled'):
        return False
    url = feishu.get('webhookUrl') or feishu.get('webhook_url') or ''
    if not url:
        return False
    emoji = {'critical': '🔴', 'warning': '🟠', 'info': '🔵'}.get(level, '⚪')
    text = f"{emoji} [Lustre OPS] {title}\n{message}"
    payload = json.dumps({'msg_type': 'text', 'content': {'text': text}}, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            return 200 <= resp.status < 300
    except urllib.error.HTTPError as e:
        print(f'[NOTIFY ERROR] HTTP {e.code}: {e.read().decode("utf-8", "replace")[:200]}')
    except Exception as e:
        print(f'[NOTIFY ERROR] {e}')
    return False


def evaluate(report):
    """对一次节点采集报告执行所有启用的规则，返回新触发的告警列表。"""
    rules = [r for r in list_rules() if r.get('enabled')]
    node_id = report.get('node_id') or report.get('hostname') or 'unknown'
    fired = []

    # 构建 (metric -> [(source, value, label)]) 观测集
    observations = []
    for ost in report.get('osts', []):
        observations.append(('ost_usage_percent', ost.get('name'), ost.get('usage_percent'), ost.get('name')))
    observations.append(('node_online', node_id, 1, f'节点 {node_id} 在线'))
    down = sum(1 for s in report.get('services', []) if s.get('status') != 'running')
    observations.append(('service_down', node_id, down, f'节点 {node_id} 服务异常数'))

    # lfs check 错误：按 target 单独跟踪
    lfs_check = report.get('lfs_check') or {}
    for err in lfs_check.get('errors', []):
        src = err.get('target') or node_id
        observations.append(('lfs_check_error', src, 1, f"{src} {err.get('message')} ({err.get('code')})"))
    # 无错误时：给出 0 值让规则可自动闭环（按节点粒度）
    if not lfs_check.get('errors'):
        observations.append(('lfs_check_error', f'node:{node_id}', 0, f'节点 {node_id} 连接正常'))

    # 内核错误签名：按签名单独跟踪
    errs = report.get('lustre_errors') or {}
    sig_list = errs.get('signatures') or []
    for sig in sig_list:
        observations.append(('kernel_error', f'{node_id}:{sig}', 1, f'{node_id} 命中错误签名：{sig}'))
    if not sig_list:
        observations.append(('kernel_error', f'node:{node_id}', 0, f'节点 {node_id} 无严重错误签名'))

    for rule in rules:
        metric = rule['metric']
        matched = [(src, val, label) for (m, src, val, label) in observations if m == metric]
        if not matched:
            continue
        for src, val, label in matched:
            if _cmp(val, rule['condition'], rule['threshold']):
                if not _active_alert_exists(rule['id'], src):
                    title = rule['name']
                    msg = f"[{node_id}] {label}"
                    detail = _build_detail(rule, src, label)
                    _create_alert(rule, src, title, detail)
                    _notify(rule['severity'], title, detail)
                    fired.append({'rule': rule['id'], 'source': src, 'value': val})
            else:
                _auto_resolve(rule['id'], src)
    return fired


def _build_detail(rule, source, label):
    """组装告警正文：现象 + 定位步骤 + 解决建议。"""
    hint = REMEDIATION_HINTS.get(rule['id'])
    lines = [label]
    if hint:
        lines.append('')
        lines.append(f"可能原因：{hint['summary']}")
        lines.append('定位步骤：')
        lines.extend(f'  {i+1}. {s}' for i, s in enumerate(hint['locate']))
        lines.append('处理建议：')
        lines.extend(f'  {i+1}. {s}' for i, s in enumerate(hint['fix']))
    return '\n'.join(lines)
