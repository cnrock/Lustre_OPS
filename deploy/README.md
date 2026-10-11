# Lustre OPS 部署指南

面向两种场景，**都不需要在节点上安装任何宿主机软件**：

| 场景 | 用哪些镜像 | 说明 |
|---|---|---|
| **A. 客户端部署（推荐，约束最小）** | `lustre-ops` + `lustre-ops-agent` | 只在**能挂载 Lustre 的客户端节点**跑。服务端不装 agent，target 状态由客户端间接判定。 |
| **B. 全量部署** | 同上 | 客户端 + 服务端节点都跑 agent，可拿到 IB/磁盘/HA 等硬件层指标。 |

---

## 0. 一分钟快速部署（用官方镜像）

镜像已发布到 Docker Hub，**无需自行构建**：

```
cnrock/lustre-ops:1.9.0          # 后端一体化（API + 前端 + 自采集）
cnrock/lustre-ops-agent:1.9.0    # 节点采集 Agent（DaemonSet）
```

```bash
# 1) 取清单
git clone https://github.com/cnrock/Lustre_OPS.git && cd Lustre_OPS

# 2) 改两个清单里的占位（token / 密码 / nodeSelector）
vi deploy/server/deployment.yaml
vi deploy/agent/daemonset.yaml

# 3) 部署
kubectl apply -f deploy/server/inventory-configmap.yaml   # 可选：集群清单对账
kubectl apply -f deploy/server/deployment.yaml            # 后端（1 副本周）
kubectl apply -f deploy/agent/daemonset.yaml              # 采集（每节点一个）

# 4) 验证
kubectl get pods -o wide | grep lustre-ops
curl http://<节点IP>:32396/api/health
```

浏览器打开 `http://<节点IP>:32396/lustre-ops/`，用 `LUSTRE_ADMIN_USER/PASS` 登录。

---

## 一、组件与交互（数据是怎么来的）

```
┌──────────────────────────────────────────────────────────────────┐
│ 节点（客户端 / 服务器）                                           │
│                                                                  │
│  lustre-ops-agent (DaemonSet, 每节点1个)                          │
│    └─ nsenter 进宿主机命名空间                                    │
│       执行 lfs df / lctl / lfs check / check_servers.pl /         │
│            ibstat / lsscsi / journalctl …（只读）                 │
│    └─ HTTP POST /api/ingest/report  ──────────────┐              │
└───────────────────────────────────────────────────│──────────────┘
                                                    ▼
                                   ┌──────────────────────────────┐
                                   │ lustre-ops (Deployment, 1副本)│
                                   │  Flask API + 前端静态资源     │
                                   │  + 节点自采集 + 告警引擎      │
                                   │  + SQLite 指标库              │
                                   └──────────────┬───────────────┘
                                                  ▼
                                        浏览器访问 /lustre-ops/
```

- **agent 只读采集**：所有命令都是只读（`lfs`/`lctl`/`lfs check`/`ibstat`/`lsscsi`/`journalctl`），不改动集群。
- **nsenter 而非挂目录**：容器内无 Lustre 内核模块，宿主有；容器以 `hostPID + privileged` 运行，
  `nsenter -t 1 -m -u -i -n -p` 进宿主命名空间，读到的就是**宿主真实数据**。
- **推送式**：agent 每 60s 把报告 POST 给后端；后端落 SQLite 并评估告警规则。
- **token 校验**：`X-Ingest-Token` 必须与后端 `LUSTRE_INGEST_TOKEN` 一致（留空则后端不校验，仅限内网调试）。

### 客户端部署下能真实拿到什么

| 数据 | 命令 | 客户端可得 |
|---|---|---|
| OST/MDT 容量、inode | `lfs df -h/-i` | ✅ |
| MDT/OST OK/DOWN | `check_servers.pl -v` | ✅（手册明确：可在 Client 上执行）|
| 连接故障 | `lfs check all` | ✅ |
| Recovery 状态 | `lfs check` / recovery_status | ✅ |
| Quota | `lfs quota` | ✅ |
| LDLM 锁 | `lctl get_param ldlm...lock_count` | ✅ |
| Lustre **客户端版本** | `lctl get_param -n version` | ✅ 真实 |
| LNet NID/对端 | `lctl list_nids` | ✅ |
| IB HCA / DDN 磁盘数 / Pacemaker HA | `ibstat`/`lsscsi`/`rg_control` | ❌ 仅服务端 |
| Lustre **服务端版本** | 服务端 `lctl get_param -n version` | ⚠️ 由服务端 agent 回填，或清单 `serverVersion` 声明 |

---

## 二、客户端部署模式（场景 A）

**服务端不跑 agent 时**，若清单里登记了服务端，看门狗默认会把它们判为"应报未报"。
用 `serverMode` 关闭该判定：

```yaml
# deploy/inventory.json
{
  "cluster": "lustrefs",
  "serverMode": "client-only",        # ← 服务端经客户端间接监控，不再报"应报未报"
  "serverVersion": "2.14.0_ddn262",   # ← 服务端版本（客户端读不到时用于展示）
  "servers": [ ... ]
}
```

或后端环境变量 `LUSTRE_SERVER_MODE=client-only`。

此时：
- **target DOWN / Recovery** 改由客户端 `check_servers.pl` + `lfs check` 判定（仍能覆盖最关键的故障）。
- 服务端探针页（IB/磁盘/HA）留空并给出说明，不报错。
- 服务端版本展示为清单声明值，客户端版本为真实探测值。

`nodeSelector` 限定 agent 只落在客户端：

```yaml
# deploy/agent/daemonset.yaml
spec:
  template:
    spec:
      nodeSelector:
        lustre-ops/role: client       # 给客户端节点打标签：kubectl label node <n> lustre-ops/role=client
```

---

## 三、全量部署模式（场景 B）

客户端 + 服务端都跑 agent，用 `tolerations: Exists` 覆盖所有节点（含 cordon/GPU 污点节点）。
此时服务端探针（Recovery/IB/DDN 磁盘/HA/LDLM）全部可得，`serverMode` 保持默认 `agent`。

---

## 四、自行构建镜像（可选）

官方镜像已发布，仅当你要改代码时才需自建：

```bash
cd Lustre_OPS

# 1) 前端
cd app && npm ci && npm run build && cd ..      # 产出 app/dist

# 2) 后端一体化镜像
docker build -t <your-registry>/lustre-ops:1.9.0 -f deploy/server/Dockerfile .

# 3) agent 镜像
docker build -t <your-registry>/lustre-ops-agent:1.9.0 -f deploy/agent/Dockerfile app/api

docker push <your-registry>/lustre-ops:1.9.0
docker push <your-registry>/lustre-ops-agent:1.9.0
```

> 集群用 containerd 时：`docker save <img> | ctr -n k8s.io images import -`

---

## 五、别人拿到后怎么在他们环境跑通

1. **改 3 处**：`inventory.json`（集群清单/版本/模式）、`deployment.yaml` 的 Secret、`daemonset.yaml` 的 `nodeSelector`。
2. **打节点标签**（客户端模式）：`kubectl label node <n> lustre-ops/role=client`。
3. **确认挂载点**：`LUSTRE_CLIENT_MOUNT` 默认 `/lustre`，按实际改。
4. **apply 三个清单**，看 `kubectl logs -l app=lustre-ops-agent` 是否出现 `200`。
5. 浏览器验收：总览能看到**真实** OST 容量、**真实**客户端/服务端版本、告警来自真实 `lfs check`/`check_servers.pl`。

**关键：token 两端一致，nodeSelector 覆盖到目标节点。**

---

## 六、排查

```bash
kubectl get pods -l app=lustre-ops-agent -o wide       # 每节点一个
kubectl logs -l app=lustre-ops-agent --tail=20         # 应看到 200
kubectl exec ds/lustre-ops-agent -- nsenter -t 1 -m -p -- lfs df
curl -H "Authorization: Bearer <token>" http://<ip>:32396/api/nodes
```

版本验证：
```bash
# 客户端版本（真实）
kubectl exec ds/lustre-ops-agent -- nsenter -t 1 -m -p -- lctl get_param -n version
```
