# Lustre OPS 一体化镜像：Flask API + 前端静态资源，单容器同时提供 /api 与 /。
# 后端节点自采集需要读宿主机 Lustre：容器以 hostPID/privileged 运行并使用 nsenter。
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        util-linux procps iproute2 iputils-ping \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/api
COPY app/api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app/api/ ./
# 前端构建产物
COPY app/dist /app/static

ENV PYTHONUNBUFFERED=1 \
    LUSTRE_OPS_STATIC_DIR=/app/static \
    LUSTRE_SELF_COLLECT=1 \
    LUSTRE_NSENTER=1 \
    LUSTRE_NSENTER_TARGET=1 \
    LUSTRE_DB=/data/lustre.db

EXPOSE 3006
VOLUME ["/data"]

CMD ["python3", "lustre_api.py"]
