# Lustre OPS 节点采集 Agent 镜像
# DaemonSet 用：每个节点一个 Pod，nsenter 进宿主机命名空间采集真实 Lustre 数据。
FROM python:3.12-slim

# nsenter 来自 util-linux；lustre 客户端命令（lfs/lctl）由宿主机提供，无需在镜像内安装
RUN apt-get update && apt-get install -y --no-install-recommends util-linux curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY lustre_collect.py lustre_agent.py lustre_server_probe.py ./

ENV LUSTRE_NSENTER=1 \
    LUSTRE_NSENTER_TARGET=1 \
    PYTHONUNBUFFERED=1

# 由 DaemonSet 的 command 决定是「常驻循环」还是「一次性推送」
CMD ["python3", "lustre_agent.py"]
