# 更新日志

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## v1.8.0 - 2026-10-11

### 新增

- 全模块界面统一：告警、告警详情、巡检、文件系统、日志、设置、报表、容量、性能、网络全部统一到 Apple 风格设计系统。
- 应用版本单一来源 `src/lib/version.ts`，侧边导航与登录页统一展示当前版本。

### 变更

- README 版本历史改为倒序（最新在上、v1.0.0 置底）；功能与接口不变。

详见 `docs/releases/v1.8.0.md`。

## v1.7.0 - 2026-10-11

### 新增

- 界面改版（参考 Apple 官网审美）：重构设计系统——Apple 式配色、大留白、精确字距、柔和多层阴影、毛玻璃导航。
- 登录页、侧边导航、顶栏、总览页统一新风格；卡片/按钮/表单圆角与层次统一。

### 变更

- 浅色为主、深色为精致对偶；功能与接口不变。

详见 `docs/releases/v1.7.0.md`。

## v1.6.0 - 2026-10-11

### 修复

- 客户端挂载点误判「未挂载」——后端挂载点与实际不一致时误判，导致容量/OST/性能无数据。改为自动探测真实挂载点（`findmnt -t lustre` 回退）。

### 变更

- 新增 `detect_lustre_mount()` / `lustre_mounted()`，状态接口/巡检/采集/容量接口统一使用探测后的挂载点。

详见 `docs/releases/v1.6.0.md`。

## v1.5.0 - 2026-10-10

### 新增

- 服务端深度探针（依据 DDN 手册）：Recovery 状态、check_servers.pl、get_ost.pl、IB HCA、DDN 磁盘数、LDLM、rg_control。
- 4 条服务端告警规则（Recovery/Target DOWN/IB/磁盘），含处理指引。
- `server_probes` 表 + `/api/server-probes` 接口 + 前端「服务端探针」标签页。

详见 `docs/releases/v1.5.0.md`。

## v1.4.0 - 2026-10-10

### 新增

- 集群清单 `deploy/inventory.json`（服务端/存储阵列/网段/客户端网段）。
- 清单对账接口 `/api/inventory`（应有 vs 实报）。
- 节点存活看门狗：心跳超时告警 + 应报未报告警。
- 前端「清单对账」标签页 + 清单 ConfigMap。

### 修复

- 修正客户端/服务端 LNET 地址段区分。

详见 `docs/releases/v1.4.0.md`。

## v1.3.0 - 2026-10-10

### 新增

- 采集 Agent DaemonSet（`nsenter` 进宿主机命名空间采集真实 Lustre 数据）。
- 一体化后端镜像（Flask API + 前端静态资源单容器）。
- K8s 清单：Deployment / DaemonSet / PVC / NodePort / ConfigMap。
- 后端 SPA 静态托管（兼容 `/` 与 `/lustre-ops/`）。
- agent 常驻循环模式与采集器 nsenter 支持。

详见 `docs/releases/v1.3.0.md`。

## v1.2.0 - 2026-10-10

### 新增

- 推送式多节点采集（`lustre_collect.py` + `lustre_agent.py`），覆盖客户端与服务端。
- 后端节点自采集线程。
- 告警规则引擎 + 飞书 webhook 推送 + 自动闭环。
- 客户端 `lfs check` 连接故障检测（transport shutdown / I/O error）。
- 内核 Lustre/LNet 错误签名检测。
- 每条告警附带处理指引（原因/定位/处理）。
- 新增 ingest / nodes / cluster-config / alert-rules / notification 接口。

### 变更

- 告警页、集群配置页接真实后端（移除 mock），告警页 30s 刷新。

详见 `docs/releases/v1.2.0.md`。

## v1.1.0 - 2026-10-10

### 修复

- 修复巡检因 `int(None)` 崩溃、挂载点硬编码 `/lustre/client`、缺表 `no such table`、巡检无历史四项问题。

### 新增

- 登录鉴权与会话令牌（角色 admin/engineer/viewer）。
- 前端登录页、请求自动带令牌。
- 用户管理（后端 CRUD + 前端对接）。
- 巡检历史（列表/查看/删除，含 `health_check_runs` 表与接口）。

### 变更

- 挂载点等参数改为环境变量可配置（`LUSTRE_CLIENT_MOUNT` 等）。

详见 `docs/releases/v1.1.0.md`。

