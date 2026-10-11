#!/usr/bin/env python3
"""
Lustre OPS 节点采集 Agent。

两种运行方式：
  1) 一次性推送（systemd timer / cron）：
       python3 lustre_agent.py
  2) 常驻循环（DaemonSet / 长驻容器）：
       LUSTRE_AGENT_LOOP=1 LUSTRE_AGENT_INTERVAL=60 python3 lustre_agent.py

环境变量：
    LUSTRE_OPS_URL            后端地址（默认 http://127.0.0.1:3006）
    LUSTRE_OPS_INGEST_TOKEN   采集令牌（需与后端 LUSTRE_INGEST_TOKEN 一致）
    LUSTRE_OPS_NODE_ROLE      可选，覆盖自动判定的角色（mgs/mds/oss/client/mixed）
    LUSTRE_AGENT_LOOP         1 表示常驻循环
    LUSTRE_AGENT_INTERVAL     循环间隔秒（默认 60）
"""

import os
import sys
import time
import json
import urllib.request
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lustre_collect  # noqa: E402


def push_once():
    base_url = os.environ.get('LUSTRE_OPS_URL', 'http://127.0.0.1:3006').rstrip('/')
    token = os.getenv('LUSTRE_OPS_INGEST_TOKEN', '')
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
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.status, resp.read().decode('utf-8', 'replace')


def main():
    loop = os.environ.get('LUSTRE_AGENT_LOOP', '').lower() in ('1', 'true', 'yes')
    interval = int(os.environ.get('LUSTRE_AGENT_INTERVAL', '60'))

    if not loop:
        try:
            status, body = push_once()
            print(f'[agent] {status} {body[:200]}')
        except urllib.error.HTTPError as e:
            print(f'[agent] HTTP {e.code}: {e.read().decode("utf-8", "replace")[:300]}', file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            print(f'[agent] 推送失败: {e}', file=sys.stderr)
            sys.exit(1)
        return

    print(f'[agent] 常驻循环启动，间隔 {interval}s，后端 {os.environ.get("LUSTRE_OPS_URL")}')
    while True:
        try:
            status, body = push_once()
            print(f'[agent] {time.strftime("%H:%M:%S")} {status} {body[:160]}')
        except urllib.error.HTTPError as e:
            print(f'[agent] {time.strftime("%H:%M:%S")} HTTP {e.code}: {e.read().decode("utf-8", "replace")[:200]}', file=sys.stderr)
        except Exception as e:
            print(f'[agent] {time.strftime("%H:%M:%S")} 推送失败: {e}', file=sys.stderr)
        time.sleep(interval)


if __name__ == '__main__':
    main()
