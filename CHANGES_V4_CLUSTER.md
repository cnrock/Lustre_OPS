# Lustre OPS 全集群真实监控改造（v4）

在上游 v1.0.0 基础上，把平台从"部分 demo"改造成**可监控真实多节点 Lustre 集群**。

## 一、架构：推送式多节点采集

```
每个 Lustre 节点（客户端 + 服务端 MGS/MDS/OSS）
   └─ lustre_agent.py（systemd timer 定时，默认 60s）
         │ 本机执行只读命令（lfs/lctl/lsmod/journalctl）
         ▼ POST /api/ingest/report  (X-Ingest-Token)
后端 lustre_api.py
   ├─ 落库：ost_metrics / perf_rates / node_metrics / lustre_nodes
   ├─ 告警引擎：对照 alert_rules 触发 alerts（去重、自动闭环）
   └─ 飞书 webhook 推送
前端（React）
   └─ 总览/容量/网络/告警/配置 全部读真实后端
```

**无需后端 SSH 到各节点**：每个节点自己上报，客户端与服务端一视同仁。

后端节点默认**自动自采集**（`LUSTRE_SELF_COLLECT=1`），因此至少总有一份真实数据。

## 二、新增后端接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/ingest/report` | 节点采集上报（`X-Ingest-Token` 校验） |
| GET | `/api/nodes` | 所有已注册节点（角色/NID/服务/版本/心跳） |
| GET | `/api/cluster/config` | 实时文件系统配置（默认条带、可调参数） |
| GET | `/api/alert-rules` | 告警规则列表 |
| POST | `/api/alert-rules` | 新增/更新规则（admin） |
| DELETE | `/api/alert-rules/<id>` | 删除规则（admin） |
| GET | `/api/notification-channels` | 通知渠道（脱敏） |
| POST | `/api/notification-channels/<type>` | 配置渠道（admin） |
| POST | `/api/notify/test` | 发送测试通知 |

## 三、告警能力（含客户端性能下降/连接故障）

默认规则：
- OST 使用率 > 80% / > 90%
- 节点掉线
- Lustre 服务未加载
- **客户端 Lustre 连接异常（`lfs check`）** ← 新增
- **内核 Lustre/LNet 错误签名** ← 新增

**`lfs check` 错误检测**：解析如下报错并按 target 单独告警：
```
lfs check: error: check 'lustrefs-OST0005-osc-XXX': Cannot send after transport endpoint shutdown (108)
lfs check: error: check 'lustrefs-OST000c-osc-XXX': Input/output error (5)
```

**内核错误签名**（命中即 critical）：transport endpoint shutdown、input/output error、
not responding、evicted、recovery failed、timed out 等。

每条告警都带 **可能原因 + 定位步骤 + 处理建议**，例如客户端连接异常：

> 可能原因：客户端与某个 OST/MDT 连接中断，常见于服务端 target 故障、LNet 网络异常或客户端被 evict。
> 定位步骤：`lfs check all` → `dmesg -T | egrep -i "lustre|lnet"` → `lctl list_nids`/`lnetctl net show`/`lnetctl ping` → 到服务端 `lctl dl`。
> 处理建议：网络抖动→查交换机/链路；服务端 target 异常→按变更流程 `lctl --device <dev> activate`；被 evict→卸载重挂载。

告警**自动闭环**：下次采集值恢复正常，对应告警自动标记 resolved。

## 四、部署

### 1. 后端（203.0.113.34）

```bash
cd /opt/Lustre_OPS/app/api
pip install -r requirements.txt

export LUSTRE_CLIENT_MOUNT=/lustre          # 客户端挂载点
export LUSTRE_INGEST_TOKEN='<强随机串>'      # 各 agent 须一致
export LUSTRE_ADMIN_PASS='<强密码>'
export LUSTRE_SELF_COLLECT=1                # 后端节点自采集（默认开）
export LUSTRE_COLLECT_INTERVAL=60
python lustre_api.py
```

systemd 里把这些写入 `Environment=`。

### 2. 每个 Lustre 节点（客户端 + 服务端）

```bash
# 把 app/api 下的 lustre_collect.py / lustre_agent.py / install_agent.sh 拷到节点
chmod +x install_agent.sh
sudo ./install_agent.sh http://203.0.113.34:3006 '<同一个TOKEN>' [角色] [间隔]
```

服务端节点可选指定角色：`mgs`/`mds`/`oss`；不填则自动判定。

### 3. 前端

```bash
cd /opt/Lustre_OPS/app && npm ci && npm run build
kubectl rollout restart deploy/nginx-lustre-ops
```

### 4. 配置飞书告警

在「告警管理 → 通知设置」填入飞书 Webhook 并启用；或用 API：
```bash
curl -X POST http://203.0.113.34:3006/api/notification-channels/feishu \
  -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' \
  -d '{"enabled":true,"webhookUrl":"https://open.feishu.cn/open-apis/bot/v2/hook/xxx"}'
```

## 五、前端改动

- **告警管理页**：活跃/历史告警、告警规则、通知渠道全部接真实后端（不再 mock）；30s 自动刷新。
- **集群配置页**：拓扑、节点、文件系统参数改为实时数据（来自 `/api/nodes`、`/api/cluster/config`）。
- 巡检历史（v3 已加）。

## 六、验证

```bash
# 节点是否上报
curl -H "Authorization: Bearer <token>" http://203.0.113.34:3006/api/nodes

# 手动模拟一条客户端连接故障告警
curl -X POST http://203.0.113.34:3006/api/ingest/report \
  -H 'Content-Type: application/json' -H 'X-Ingest-Token: <token>' \
  -d '{"node_id":"r3n5","role":"client","services":[{"name":"lnet","status":"running"}],
       "lfs_check":{"errors":[{"target":"lustrefs-OST0005-osc-x","message":"Input/output error","code":"5"}]},
       "lustre_errors":{"signatures":["input/output error"]}}'
# 之后查活跃告警
curl -H "Authorization: Bearer <token>" http://203.0.113.34:3006/api/alerts/active
```

## 七、环境变量汇总

| 变量 | 默认 | 说明 |
|---|---|---|
| `LUSTRE_CLIENT_MOUNT` | `/lustre/client` | 客户端挂载点（本环境应为 `/lustre`） |
| `LUSTRE_DB` | `/opt/lustre-data/lustre.db` | SQLite 路径 |
| `LUSTRE_INGEST_TOKEN` | 空 | 采集上报令牌；留空则不校验 |
| `LUSTRE_SELF_COLLECT` | `1` | 后端节点是否自采集 |
| `LUSTRE_COLLECT_INTERVAL` | `60` | 自采集间隔秒 |
| `LUSTRE_ADMIN_USER/PASS/EMAIL` | admin/admin123/... | 初始管理员 |
| `LUSTRE_SESSION_TTL` | 43200 | 会话有效期秒 |

## 八、仍为演示的部分（后续可继续）

- **报表管理**：仍偏前端本地生成（可改为后端持久化）。
- **邮件通知**：未接入，建议用飞书渠道。
- 若集群节点很多，建议把 agent 采集间隔调大（如 120s）以降低后端压力。
