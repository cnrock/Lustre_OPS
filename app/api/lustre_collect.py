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


def _parse_lctl_version(text):
    """解析 `lctl get_param -n version` 的多行输出为 dict。

    典型（DDN）输出：
        lustre: 2.14.0_ddn262
        kernel: patchless_client
        build:  v2_14_0_ddn262-g...
    """
    info = {}
    for line in (text or '').splitlines():
        if ':' in line:
            k, v = line.split(':', 1)
            k, v = k.strip().lower(), v.strip()
            if k and v and k not in info:
                info[k] = v
    return info


def _lustre_version():
    """客户端 Lustre 版本（真实探测，不再使用硬编码）。"""
    out, _, _ = run("lctl get_param -n version 2>/dev/null || cat /sys/module/lustre/version 2>/dev/null")
    raw = (out or '').strip()
    info = _parse_lctl_version(raw)
    return info.get('lustre') or info.get('build') or raw


def collect_versions():
    """采集 Lustre 版本信息。

    - client: 本机客户端模块版本（`lctl get_param -n version`），客户端部署下始终可得。
    - server: 服务端（MGS/MDS/OSS）版本。客户端部署环境下通常不可直接读取，
      由后端用服务端 agent 上报的 lustre_version 回填；此处尽力尝试直接读取。
    返回 {'client': str, 'clientDetail': dict, 'server': str|None}。
    """
    raw, _, _ = run("lctl get_param -n version 2>/dev/null || cat /sys/module/lustre/version 2>/dev/null")
    raw = (raw or '').strip()
    detail = _parse_lctl_version(raw)
    client = detail.get('lustre') or detail.get('build') or raw
    # 少数环境可从客户端读到 MGS 版本参数；读不到则为 None（由后端回填）
    srv_out, _, _ = run("lctl get_param -n mgs.MGS.*.version 2>/dev/null", timeout=8)
    server = (srv_out or '').strip().splitlines()[0].strip() if (srv_out or '').strip() else None
    return {'client': client, 'clientDetail': detail, 'server': server}


def collect_check_servers():
    """在客户端执行 DDN `check_servers.pl`（手册：可在挂载 Lustre 的 Client 上执行）。

    在无服务端 agent 时，用它判定 MDT/OST 的 OK/DOWN，从而覆盖
    “服务端 target 是否挂掉”这一最关键的判断。
    返回 {'available', 'down_count', 'ok_count', 'downs': [...], 'raw'}。
    """
    candidates = [
        'check_servers.pl -v',
        '/opt/ddn/bin/check_servers.pl -v',
        '/work/os_config/opt/ddn/bin/check_servers.pl -v',
    ]
    out = ''
    for cmd in candidates:
        stdout, _, rc = run(cmd, timeout=30)
        if (stdout or '').strip():
            out = stdout
            break
    if not out.strip():
        return {'available': False, 'down_count': 0, 'ok_count': 0, 'downs': [], 'raw': ''}
    downs = []
    for line in out.splitlines():
        if re.search(r'\bDOWN\b', line, re.I):
            downs.append(line.strip()[:200])
    down_count = len(re.findall(r'\bDOWN\b', out, re.I))
    ok_count = len(re.findall(r'\bOK\b', out, re.I))
    return {'available': True, 'down_count': down_count, 'ok_count': ok_count,
            'downs': downs[:50], 'raw': out[-2000:]}


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
    versions = collect_versions()
    # check_servers.pl 在客户端可执行，用于无服务端 agent 时判定 target DOWN
    check_servers = collect_check_servers() if role == 'client' else None
    # 服务端深度探针（MDS/OSS 才有意义）
    try:
        import lustre_server_probe
        server_probe = lustre_server_probe.collect_server_probe(role)
    except Exception as e:
        server_probe = None
        print(f'[PROBE ERROR] {e}')
    # 容器模式下用宿主节点名（DaemonSet 注入 LUSTRE_NODE_NAME），否则用本机主机名
    node_id = os.environ.get('LUSTRE_NODE_NAME') or socket.gethostname()
    return {
        'node_id': node_id,
        'hostname': node_id,
        'ip': _first_ip(),
        'role': role,
        'nid': nids[0] if nids else '',
        'nids': nids,
        'lustre_version': versions.get('client') or _lustre_version(),
        'kernel_version': _kernel_version(),
        'versions': versions,
        'check_servers': check_servers,
        'services': _services(role),
        'target_mounts': target_mounts,
        'osts': osts,
        'perf': perf,
        'lfs_check': lfs_check,
        'lustre_errors': lustre_errors,
        'server_probe': server_probe,
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
    }


if __name__ == '__main__':
    print(json.dumps(collect_report(), ensure_ascii=False, indent=2))
