# Lustre OPS 容器化部署（K8s）

两种形态，**都不需要在节点上装任何宿主机软件**：

| 组件 | 形态 | 作用 |
|---|---|---|
| `agent/` | **DaemonSet** | 每个节点一个 Pod，采集本节点真实数据 |
| `server/` | **Deployment** | 一体化：Flask API + 前端页面 + 后端节点自采集 |

## 一、为什么用 nsenter 而不是挂载 lustre

容器内没有 Lustre 内核模块，但**宿主有**。agent 容器以 `hostPID + privileged` 运行，
用 `nsenter -t 1 -m -u -i -n -p` 进入宿主命名空间执行 `lfs/lctl/lsmod/journalctl`，
读到的就是**宿主真实数据**。无需在容器/宿主机额外安装。

## 二、构建镜像

```bash
cd Lustre_OPS

# 1) 前端构建（产出 app/dist，用于一体化后端镜像）
cd app && npm ci && npm run build && cd ..

# 2) agent 镜像
docker build -t <registry>/lustre-ops-agent:latest -f deploy/agent/Dockerfile app/api

# 3) 后端一体化镜像（含前端 dist）
docker build -t <registry>/lustre-ops:latest -f deploy/server/Dockerfile .

docker push <registry>/lustre-ops-agent:latest
docker push <registry>/lustre-ops:latest
```

> 若集群用 containerd，可直接 `docker save` 后 `ctr -n k8s.io images import` 到各节点。

## 三、部署

```bash
# 1) 改清单里的 REPLACE_WITH_* （镜像、token、密码、nodeSelector）
vi deploy/server/deployment.yaml
vi deploy/agent/daemonset.yaml

# 2) 先部署后端
kubectl apply -f deploy/server/deployment.yaml

# 3) 再部署采集 DaemonSet（覆盖所有节点）
kubectl apply -f deploy/agent/daemonset.yaml

# 4) 验证
kubectl get pods -l app=lustre-ops-agent -o wide       # 每节点一个
kubectl logs -l app=lustre-ops-agent --tail=5          # 应看到 200
curl http://<任一节点IP>:32396/api/health
```

浏览器打开 `http://203.0.113.10:32396/`（或 `/lustre-ops/`）。

## 四、关键点

- **ingest token 必须一致**：后端 `LUSTRE_INGEST_TOKEN` == agent `LUSTRE_OPS_INGEST_TOKEN`。
  留空则后端不校验（仅建议内网调试）。
- **DaemonSet `tolerations: operator: Exists`**：保证被 cordon / GPU 污点的节点也被采集。
  若只想采 Lustre 节点，可加 `nodeSelector`（如 `lustre=client`）。
- **服务端节点**（MGS/MDS/OSS）同样被 DaemonSet 覆盖，会出现在拓扑里。
  可显式设 `LUSTRE_OPS_NODE_ROLE=mgs|mds|oss`，否则自动按挂载判定。
- **后端单副本**：SQLite 单写，`strategy: Recreate`。多节点采集不受影响（agent 汇总到后端）。
- **持久化**：`/data/lustre.db` 用 PVC；PV 不可用时可用 hostPath（把 `volumes` 改回 hostPath）。

## 五、精简：只采集、不要后端

若你已有原 nginx + Flask 后端，只想加"多节点采集"：

```bash
# 只部署 DaemonSet，把 LUSTRE_OPS_URL 指向你现有后端
kubectl apply -f deploy/agent/daemonset.yaml
```
（需你现有后端已包含本仓库新版的 `/api/ingest/report`。）

## 六、排查

```bash
# agent 是否在采集宿主机数据
kubectl exec ds/lustre-ops-agent -- nsenter -t 1 -m -p -- lfs df

# agent 推送日志
kubectl logs -l app=lustre-ops-agent --tail=20

# 后端收到哪些节点
curl -H "Authorization: Bearer <token>" http://<ip>:32396/api/nodes
```
