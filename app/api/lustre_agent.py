#!/usr/bin/env python3
"""
Lustre OPS 节点采集 Agent。

部署到**每一个** Lustre 节点（客户端 + 服务端 MGS/MDS/OSS），
定时在本机执行只读命令，把结构化报告 POST 到后端。

只需标准库；用 systemd timer 或 cron 定时调用：

    # 每 60 秒推送一次
    LUSTRE_OPS_URL=http://203.0.113.34:3006 LUSTRE_OPS_INGEST_TOKEN=xxx \\
        python3 lustre_agent.py

环境变量：
    LUSTRE_OPS_URL            后端地址（默认 http://127.0.0.1:3006）
    LUSTRE_OPS_INGEST_TOKEN   采集令牌（需与后端 LUSTRE_INGEST_TOKEN 一致）
    LUSTRE_OPS_NODE_ROLE      可选，覆盖自动判定的角色（mgs/mds/oss/client/mixed）
"""

import os
import sys
import json
import urllib.request
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lustre_collect  # noqa: E402


def main():
    base_url = os.environ.get('LUSTRE_OPS_URL', 'http://127.0.0.1:3006').rstrip('/')
    token = os.environ.get('LUSTRE_OPS_INGEST_TOKEN', '')
    report = lustre_collect.collect_report()
    override_role = os.environ.get('LUSTRE_OPS_NODE_ROLE')
    if override_role:
        report['role'] = override_role

    data = json.dumps(report, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(
        f'{base_url}/api/ingest/report',
        data=data,
        headers={'Content-Type': 'application/json', 'X-Ingest-Token': token},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode('utf-8', 'replace')
            print(f'[agent] {resp.status} {body[:200]}')
    except urllib.error.HTTPError as e:
        print(f'[agent] HTTP {e.code}: {e.read().decode("utf-8", "replace")[:300]}', file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f'[agent] 推送失败: {e}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
