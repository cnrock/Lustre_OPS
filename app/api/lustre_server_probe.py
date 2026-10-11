#!/usr/bin/env python3
"""
Lustre **服务端**深度探针（依据 DDN LustreFS 操作手册 v0.3）。

只在 MGS/MDS/OSS 节点有意义，采集手册中记载的状态确认项：
  - MDT/OST Recovery Status（/proc/fs/lustre/{mdt,obdfilter}/*/recovery_status）
  - DDN 命令 check_servers.pl / get_ost.pl（存在才调用）
  - HA：rg_control status（Pacemaker 资源组/在线节点）
  - IB：ibstat（mlx5_* port ACTIVE/LinkUp、rate）
  - Disk：lsscsi | grep -c DDN（MDS/OSS=6，OSS=4）
  - LDLM：lctl get_param ldlm.namespaces.*.lock_count

纯函数，复用 lustre_collect.run（支持容器内 nsenter）。
"""

import re

import lustre_collect as lc


RECOVERY_PATHS_MDT = 'ls -d /proc/fs/lustre/mdt/*/recovery_status 2>/dev/null'
RECOVERY_PATHS_OST = 'ls -d /proc/fs/lustre/obdfilter/*/recovery_status 2>/dev/null'


def _parse_recovery(text):
    """解析 recovery_status 文件为 dict。"""
    out = {}
    for line in (text or '').splitlines():
        if ':' in line:
            k, v = line.split(':', 1)
            out[k.strip()] = v.strip()
    return out


def collect_recovery():
    """采集所有 MDT/OST 的 recovery 状态。"""
    results = []
    for label, cmd in (('MDT', RECOVERY_PATHS_MDT), ('OST', RECOVERY_PATHS_OST)):
        paths, _, _ = lc.run(cmd)
        for p in (paths or '').split():
            txt = lc.read_file(p)
            if not txt:
                continue
            d = _parse_recovery(txt)
            # 对象名：/proc/fs/lustre/mdt/lustrefs-MDT0000/recovery_status -> lustrefs-MDT0000
            name = p.rstrip('/').split('/')[-2]
            results.append({
                'type': label,
                'name': name,
                'status': d.get('status', ''),
                'time_remaining': d.get('time_remaining', ''),
                'connected_clients': d.get('connected_clients', ''),
                'recovery_duration': d.get('recovery_duration', ''),
                'path': p,
            })
    return results


def collect_ddn_scripts():
    """DDN 专有脚本（若存在）。check_servers.pl 输出 MDT/OST 的 OK/DOWN。"""
    out = {}
    for name, cmd in (
        ('check_servers', '/opt/ddn/bin/check_servers.pl -v 2>/dev/null || /work/os_config/opt/ddn/bin/check_servers.pl -v 2>/dev/null'),
        ('get_ost', 'get_ost.pl 2>/dev/null || /opt/ddn/bin/get_ost.pl 2>/dev/null'),
    ):
        stdout, _, rc = lc.run(cmd, timeout=30)
        if stdout.strip():
            down = len(re.findall(r'\bDOWN\b', stdout))
            ok = len(re.findall(r'\bOK\b', stdout))
            out[name] = {'available': True, 'down_count': down, 'ok_count': ok, 'raw': stdout[-2000:]}
        else:
            out[name] = {'available': False}
    return out


def collect_rg_control():
    """HA（Pacemaker）状态：在线节点 + 资源组。"""
    stdout, _, rc = lc.run('rg_control status 2>/dev/null', timeout=20)
    if not stdout.strip():
        return {'available': False}
    online = []
    groups = []
    m = re.search(r'Online:\s*\[([^\]]*)\]', stdout)
    if m:
        online = m.group(1).split()
    for g in re.findall(r'Resource Group:\s*\[([^\]]+)\]', stdout):
        groups.append(g.strip())
    return {'available': True, 'onlineNodes': online, 'resourceGroups': groups, 'raw': stdout[-1500:]}


def collect_ib():
    """IB HCA 状态：每 CA 的 port 是否 ACTIVE/LinkUp 及速率。"""
    stdout, _, rc = lc.run('ibstat 2>/dev/null', timeout=20)
    if not stdout.strip():
        return {'available': False, 'hcas': []}
    hcas = []
    cur = None
    for line in stdout.splitlines():
        line = line.strip()
        m = re.match(r"CA '([^']+)'", line)
        if m:
            cur = {'name': m.group(1), 'ports': []}
            hcas.append(cur)
            continue
        m = re.match(r'Port (\d+)', line)
        if m and cur is not None:
            cur['ports'].append({'port': m.group(1), 'state': '', 'rate': ''})
            continue
        if cur is not None and cur['ports']:
            p = cur['ports'][-1]
            if line.startswith('State:'):
                p['state'] = line.split(':', 1)[1].strip()
            elif line.startswith('Rate:'):
                p['rate'] = line.split(':', 1)[1].strip()
    return {'available': True, 'hcas': hcas}


def collect_disks():
    """lsscsi 中 DDN 磁盘数（手册：MDS/OSS=6，OSS=4）。"""
    stdout, _, rc = lc.run('lsscsi 2>/dev/null | grep -c DDN', timeout=15)
    try:
        return {'ddnDiskCount': int((stdout or '0').strip() or 0)}
    except ValueError:
        return {'ddnDiskCount': 0}


def collect_ldlm():
    """LDLM 锁数量（客户端/服务端均可）。"""
    stdout, _, rc = lc.run('lctl get_param ldlm.namespaces.*.lock_count 2>/dev/null', timeout=20)
    total = 0
    entries = []
    for line in (stdout or '').splitlines():
        if 'lock_count=' in line:
            ns, val = line.split('lock_count=', 1)
            try:
                v = int(val.strip())
            except ValueError:
                v = 0
            total += v
            entries.append({'ns': ns.strip(), 'lockCount': v})
    return {'totalLockCount': total, 'entries': entries[:50]}


def collect_server_probe(role):
    """服务端深度采集总入口；client 角色返回 None。"""
    if role not in ('mgs', 'mds', 'oss', 'mixed'):
        return None
    return {
        'recovery': collect_recovery(),
        'ddnScripts': collect_ddn_scripts(),
        'rgControl': collect_rg_control(),
        'ib': collect_ib(),
        'disks': collect_disks(),
        'ldlm': collect_ldlm(),
    }


if __name__ == '__main__':
    import json
    print(json.dumps(collect_server_probe('mds'), ensure_ascii=False, indent=2))
