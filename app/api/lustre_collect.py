#!/usr/bin/env python3
"""
Lustre 节点数据采集核心。

纯函数：在本机执行只读 Lustre/Linux 命令，产出结构化报告 dict。
后端（本机自采）和远程 agent（lustre_agent.py）都复用本模块。

不写数据库、不读环境，只负责「采集 + 解析」。
"""

import os
import re
import json
import socket
import subprocess
from datetime import datetime

# 容器（DaemonSet）模式下通过 nsenter 进入宿主机命名空间执行命令：
#   需要 hostPID + privileged + hostPath /proc /sys /dev /run
_NSENTER = os.environ.get('LUSTRE_NSENTER', '').lower() in ('1', 'true', 'yes')
_NSENTER_TARGET = os.environ.get('LUSTRE_NSENTER_TARGET', '1')


def _wrap(cmd):
    if _NSENTER:
        return f"nsenter -t {_NSENTER_TARGET} -m -u -i -n -p -- sh -c {json.dumps(cmd)}"
    return cmd


def run(cmd, timeout=15):
    try:
        p = subprocess.run(
            _wrap(cmd), shell=True, capture_output=True, text=True,
            timeout=timeout, env={**os.environ, 'LC_ALL': 'C'},
        )
        return p.stdout or '', p.stderr or '', p.returncode
    except Exception as e:
        return '', str(e), 127


def read_file(path, timeout=10):
    """读取宿主机文件（容器模式下经 nsenter）。"""
    out, _, rc = run(f'cat {path} 2>/dev/null', timeout=timeout)
    return out if rc == 0 else ''


def _first_ip():
    """主 IP：优先默认路由出口 IP。"""
    out, _, _ = run("ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}'")
    ip = (out or '').strip()
    if ip:
        return ip
    try:
        return socket.gethostbyname(socket.gethostname())
    except Exception:
        return ''


def _nids():
    out, _, _ = run("lctl list_nids 2>/dev/null")
    return [n.strip() for n in (out or '').splitlines() if n.strip()]


def _lustre_version():
    out, _, _ = run("lctl get_param -n version 2>/dev/null || cat /sys/module/lustre/version 2>/dev/null")
    return (out or '').strip()


def _kernel_version():
    out, _, _ = run("uname -r")
    return (out or '').strip()


def detect_role(target_mounts):
    """按挂载的 target 判定节点角色。"""
    roles = set()
    text = ' '.join(target_mounts).lower()
    if 'mgt' in text:
        roles.add('mgs')
    if 'mdt' in text:
        roles.add('mds')
    if 'ost' in text:
        roles.add('oss')
    if not roles:
        return 'client'
    if len(roles) == 1:
        return next(iter(roles))
    return 'mixed'


def _target_mounts():
    out, _, _ = run("findmnt -t lustre -o TARGET,SOURCE,OPTIONS -n 2>/dev/null")
    lines = [l.strip() for l in (out or '').splitlines() if l.strip()]
    return lines


def _services(role):
    """采集本节点 Lustre 相关服务/进程状态。"""
    svcs = []
    checks = [
        ('lnet', "lsmod | grep -q '^lnet' && echo up || echo down"),
        ('lustre', "lsmod | grep -q '^lustre' && echo up || echo down"),
        ('ko2iblnd', "lsmod | grep -q '^ko2iblnd' && echo up || echo down"),
    ]
    for name, cmd in checks:
        out, _, _ = run(cmd)
        svcs.append({'name': name, 'status': 'running' if 'up' in (out or '') else 'stopped'})
    return svcs


def _parse_size_to_bytes(s):
    """把 lfs df 的 '1.5T' 之类转成字节。"""
    s = (s or '').strip()
    m = re.match(r'^([\d.]+)\s*([KMGTP]?)$', s, re.I)
    if not m:
        return 0
    val = float(m.group(1))
    unit = m.group(2).upper()
    mult = {'': 1, 'K': 1024, 'M': 1024**2, 'G': 1024**3, 'T': 1024**4, 'P': 1024**5}[unit]
    return int(val * mult)


def collect_osts(limit_fs=None):
    """解析 `lfs df` 为 OST/MDT 记录列表。"""
    out, _, _ = run("lfs df 2>/dev/null")
    items = []
    if not out:
        return items
    fn_re = re.compile(r'^(\S+)_UUID\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)%\s+(\S+)')
    for line in out.splitlines():
        line = line.strip()
        m = fn_re.match(line)
        if not m:
            continue
        uuid, total, used, avail, pct, mount = m.groups()
        # 去掉挂载点后缀 [MDT:0] 之类
        mount_clean = re.sub(r'\[.*?\]', '', mount)
        if '_UUID' not in line:
            continue
        base = uuid  # 形如 lustrefs-OST0000
        if 'MDT' in base:
            typ = 'MDT'
        elif 'OST' in base:
            typ = 'OST'
        elif 'MGT' in base:
            typ = 'MGT'
        else:
            typ = 'SUMMARY'
        items.append({
            'name': base,
            'uuid': base + '_UUID',
            'type': typ,
            'total_bytes': _parse_size_to_bytes(total),
            'used_bytes': _parse_size_to_bytes(used),
            'available_bytes': _parse_size_to_bytes(avail),
            'usage_percent': float(pct),
            'mount': mount_clean,
            'fs_name': base.split('-')[0] if '-' in base else 'lustre',
        })
    return items


def collect_lfs_check():
    """采集 `lfs check all`/`servers` 结果，提取失败 target 与错误。

    典型错误（客户端常见）：
        lfs check: error: check 'lustrefs-OST0005-osc-XXX': Cannot send after transport endpoint shutdown (108)
        lfs check: error: check 'lustrefs-OST000c-osc-XXX': Input/output error (5)
    """
    out, _, _ = run("lfs check all 2>&1 || lfs check servers 2>&1", timeout=25)
    errors = []
    active = []
    err_re = re.compile(r"error:\s*check\s*'([^']+)':\s*(.+?)(?:\s*\((\d+)\))?\s*$")
    for line in (out or '').splitlines():
        line = line.strip()
        if not line:
            continue
        m = err_re.search(line)
        if m:
            target, msg, code = m.group(1), m.group(2).strip(), m.group(3)
            errors.append({'target': target, 'message': msg, 'code': code or ''})
        elif line.endswith('active.'):
            active.append(line.rsplit(' ', 1)[0])
    return {'raw': out or '', 'errors': errors, 'active': active,
            'error_count': len(errors), 'active_count': len(active)}


# 内核/客户端侧严重错误签名（命中即为故障，需立即告警）
LUSTRE_ERROR_SIGNATURES = [
    'cannot send after transport endpoint shutdown',
    'input/output error',
    'not responding',
    'connection reset',
    'evicted',
    'recovery failed',
    'ldlm cancel',
    'timed out',
    'ost lost',
    'mds lost',
    'lnet selftest',
    'aborting',
]


def collect_lustre_errors(hours=2):
    """从内核日志提取最近 Lustre/LNet 错误签名（本机 dmesg / journalctl）。"""
    out, _, _ = run(
        f"journalctl --no-pager -k --since '-{hours} hours' 2>/dev/null "
        "| egrep -i 'lustre|lnet|mgs|mdt|ost|ldlm|osc|ptlrpc' "
        "| egrep -i 'error|failed|timeout|shutdown|evict|not responding|i/o|recovery' "
        "| tail -120 || true",
        timeout=20,
    )
    lines = [l.strip() for l in (out or '').splitlines() if l.strip()]
    hits = []
    low = '\n'.join(lines).lower()
    for sig in LUSTRE_ERROR_SIGNATURES:
        if sig in low:
            hits.append(sig)
    return {'lines': lines[-40:], 'signatures': hits, 'matched_count': len(hits)}


def collect_perf():
    """从 /proc/fs/lustre/{ost,mdt}/*/stats 读取累计读写字节（供后端差分算速率）。

    容器模式下经 nsenter 读宿主机 /proc，保证数据真实。
    """
    out = []
    for kind in ('ost', 'mdt'):
        listing, _, rc = run(f'ls -1 /proc/fs/lustre/{kind} 2>/dev/null')
        if rc != 0 or not listing.strip():
            continue
        for name in listing.split():
            txt = read_file(f'/proc/fs/lustre/{kind}/{name}/stats')
            if not txt:
                continue
            read_bytes = write_bytes = 0
            for line in txt.splitlines():
                if line.startswith('read_bytes'):
                    parts = re.findall(r'\d+', line)
                    if len(parts) >= 6:
                        read_bytes = int(parts[-1])
                elif line.startswith('write_bytes'):
                    parts = re.findall(r'\d+', line)
                    if len(parts) >= 6:
                        write_bytes = int(parts[-1])
            out.append({'ost_name': name, 'read_bytes_total': read_bytes, 'write_bytes_total': write_bytes})
    return out


def collect_report():
    """产出本节点的完整采集报告（不写库）。"""
    target_mounts = _target_mounts()
    role = detect_role(target_mounts)
    nids = _nids()
    osts = collect_osts()
    perf = collect_perf()
    lfs_check = collect_lfs_check()
    lustre_errors = collect_lustre_errors()
    # 容器模式下用宿主节点名（DaemonSet 注入 LUSTRE_NODE_NAME），否则用本机主机名
    node_id = os.environ.get('LUSTRE_NODE_NAME') or socket.gethostname()
    return {
        'node_id': node_id,
        'hostname': node_id,
        'ip': _first_ip(),
        'role': role,
        'nid': nids[0] if nids else '',
        'nids': nids,
        'lustre_version': _lustre_version(),
        'kernel_version': _kernel_version(),
        'services': _services(role),
        'target_mounts': target_mounts,
        'osts': osts,
        'perf': perf,
        'lfs_check': lfs_check,
        'lustre_errors': lustre_errors,
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
    }


if __name__ == '__main__':
    print(json.dumps(collect_report(), ensure_ascii=False, indent=2))
