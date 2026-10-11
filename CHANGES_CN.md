# Lustre OPS 改造说明（适配你的环境 + 用户管理/鉴权）

本次改造基于上游 `jiaguangqi/Lustre_OPS` v1.0.0，**未改动你的集群**，只改了平台自身代码。

## 一、修了你环境巡检崩溃 + 数据为空的问题

### 1) 巡检崩溃 `int(None)`（已修）
文件：`app/api/lustre_api.py` 第 2039 行
```python
storage_warning = int(bool(max_ost and (max_ost.get('usage_percent') or 0) >= 80)) + ...
```
原因：无 OST 数据时 `max_ost` 为 `None`，`int(None)` 抛错 → 「巡检执行失败」。

### 2) 挂载点写死 `/lustre/client`（已改为可配置）
你的实际挂载点是 **`/lustre`**（见 `findmnt` 输出），而代码里 25 处硬编码
`/lustre/client`，导致挂载检查、`lfs df` 全部失败。

现在通过环境变量配置：
```bash
export LUSTRE_CLIENT_MOUNT=/lustre
```

### 3) 缺表导致「no such table」+ 没有巡检历史（已修）
上游默认**不建** `ost_metrics` / `perf_rates` / `node_metrics` / `alerts` / `health_checks` 表，
导致日志刷 `[DB ERROR] no such table`，且巡检结果无法落库（**没有巡检历史**）。

现启动时自动创建这些表（`ensure_metrics_tables()`），并新增 `health_check_runs` 表保存
每次巡检的**完整快照**。巡检完成后即可在「巡检历史」中回看。

### 4) 巡检页不再自动跑 + 新增巡检历史（已改）
- 进入巡检页原本会**自动触发**一次巡检；现改为：加载「最近一次结果」+「历史列表」，
  需手动点「开始健康检查」才执行。
- 新增「巡检历史」抽屉：列出历次巡检（时间/评分/通过/警告/失败/发现数），
  可**查看**某次的完整结果，或**删除**记录。
- 新增接口：`GET /api/health-check/history`、`GET /api/health-check/history/<id>`、
  `DELETE /api/health-check/history/<id>`。

### 5) 数据仍为空？需要指标采集器
容量/性能/节点/告警页面读的是 `/opt/lustre-data/lustre.db`。
上游仓库**不含**采集器，README 写明「可选：由指标采集程序维护」。若 db 为空，
这些页面会显示空。**巡检本身**已可直接跑（用 `lfs`/`lctl` 实时命令），不受影响。

## 二、新增：访问鉴权（登录）

之前平台**无任何鉴权**，任何人访问端口即可查看数据、触发巡检。

- 新增 `app/api/auth.py`：用户表 + 会话表（PBKDF2 密码哈希，仅标准库）
- 全局守卫：除 `/api/auth/login`、`/api/health` 外，所有 `/api/*` 需登录
- 前端新增登录页 `app/src/pages/Login.tsx`，未登录无法进入控制台
- 所有请求自动带 `Authorization: Bearer <token>`

**首次启动自动创建管理员**（users 表为空时）：
```
用户名: admin
密码:   admin123        ← 请登录后立即修改
```
可用环境变量覆盖：`LUSTRE_ADMIN_USER` / `LUSTRE_ADMIN_PASS` / `LUSTRE_ADMIN_EMAIL`

## 三、新增：用户管理（增删改查 + 角色）

设置页「用户管理」面板已从 mock 数据改为**真实后端**：
- 添加用户（用户名/邮箱/密码/角色/状态）
- 编辑邮箱、重置密码、启用/停用、删除
- 角色：`admin`（管理员，全部权限）/ `engineer`（运维）/ `readonly`（只读）
- 仅 `admin` 可见「用户管理」；非管理员调用用户接口返回 403

API：
```
POST   /api/auth/login      {username,password}
POST   /api/auth/logout
GET    /api/auth/me
GET    /api/users                     列出
POST   /api/users                     创建（admin）
PATCH  /api/users/<id>                更新（admin）
DELETE /api/users/<id>                删除（admin）
```

## 四、部署步骤

```bash
# 1) 覆盖代码后重新构建前端
cd app
npm ci
npm run build

# 2) 重启后端（systemd 或用你的方式）
cd api
pip install -r requirements.txt      # Flask / flask-cors
export LUSTRE_CLIENT_MOUNT=/lustre   # 关键：按实际挂载点
export LUSTRE_ADMIN_PASS='你的强密码'  # 首次启动用它建管理员
python lustre_api.py                 # 监听 0.0.0.0:3006
```

若用 systemd，请在 unit 的 `Environment=` 里加上 `LUSTRE_CLIENT_MOUNT=/lustre`。

## 五、安全提醒
- 默认管理员密码务必修改；生产环境请用强密码 + HTTPS + 反向代理限制来源
- 会话有效期默认 12 小时，可用 `LUSTRE_SESSION_TTL` 调整
- `/api/health` 保持公开（探活用）；其余全部需登录

## 六、改动文件清单
新增：`app/api/auth.py`、`app/src/lib/auth.ts`、`app/src/lib/users.ts`、`app/src/pages/Login.tsx`
修改：`app/api/lustre_api.py`、`app/src/App.tsx`、`app/src/lib/lustre-api.ts`、
      `app/src/pages/Settings.tsx`、`app/src/pages/HealthCheck.tsx`、`app/src/pages/LogAnalysis.tsx`
