#!/usr/bin/env bash
# Lustre OPS 节点采集 Agent 一键部署脚本。
#
# 在**每一个** Lustre 节点（客户端 + 服务端 MGS/MDS/OSS）上以 root 执行：
#   ./install_agent.sh http://203.0.113.34:3006 <INGEST_TOKEN> [ROLE] [INTERVAL]
#
# 参数：
#   $1  后端地址（含端口），如 http://203.0.113.34:3006
#   $2  采集令牌（须与后端 LUSTRE_INGEST_TOKEN 一致）
#   $3  可选：节点角色 mgs/mds/oss/client/mixed（默认自动判定）
#   $4  可选：采集间隔秒（默认 60）
set -euo pipefail

URL="${1:-}"
TOKEN="${2:-}"
ROLE="${3:-}"
INTERVAL="${4:-60}"

if [[ -z "$URL" || -z "$TOKEN" ]]; then
  echo "用法: $0 <后端URL> <INGEST_TOKEN> [ROLE] [INTERVAL]" >&2
  exit 1
fi

DEST=/opt/lustre-ops-agent
mkdir -p "$DEST"

# 拷贝采集脚本（与本脚本同目录）
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SRC_DIR/lustre_collect.py" "$DEST/"
cp "$SRC_DIR/lustre_agent.py" "$DEST/"

# 环境文件
cat > "$DEST/agent.env" <<EOF
LUSTRE_OPS_URL=$URL
LUSTRE_OPS_INGEST_TOKEN=$TOKEN
LUSTRE_OPS_NODE_ROLE=$ROLE
EOF
chmod 600 "$DEST/agent.env"

# 包装脚本（读取 env 后推送）
cat > "$DEST/run.sh" <<'EOF'
#!/usr/bin/env bash
set -a
source /opt/lustre-ops-agent/agent.env
set +a
exec /usr/bin/env python3 /opt/lustre-ops-agent/lustre_agent.py
EOF
chmod +x "$DEST/run.sh"

# systemd 服务 + 定时器
cat > /etc/systemd/system/lustre-ops-agent.service <<'EOF'
[Unit]
Description=Lustre OPS 节点采集 Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/lustre-ops-agent/run.sh
EOF

cat > /etc/systemd/system/lustre-ops-agent.timer <<EOF
[Unit]
Description=定时推送 Lustre 节点采集数据

[Timer]
OnBootSec=30s
OnUnitActiveSec=${INTERVAL}s
AccuracySec=5s

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now lustre-ops-agent.timer

echo "✅ 已部署。验证："
echo "   systemctl status lustre-ops-agent.timer"
echo "   journalctl -u lustre-ops-agent -n 20"
echo "   （也可手动执行）bash $DEST/run.sh"
