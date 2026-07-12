# Lustre OPS

Lustre OPS 是面向 Lustre 并行文件系统运维团队的中文图形化监控与诊断控制台。项目将文件系统状态、性能与容量指标、LNet 网络、告警、集群巡检、日志分析和知识库集中在一个 Web 工作台中，降低日常巡检和故障定位的操作成本。

> 当前版本：`v1.0.0`。这是首个可部署、可验证的公开版本，适合测试环境、实验集群和二次开发。生产环境部署前请先阅读[安全说明](SECURITY.md)和[部署指南](docs/deployment.md)。

![Lustre OPS 云控制台总览](app/product-audit/cloud-console-dashboard-final.png)

## 产品目标

- 用统一视图呈现 MGS/MDS/OSS/客户端、MDT/OST、挂载点和 LNet 的运行态势。
- 把常用 Lustre 命令、数据库指标和告警证据转换成可读、可追踪的运维信息。
- 通过固定、可审计的巡检脚本发现问题，通过大模型辅助分析原因并给出人工操作建议。
- 沉淀已确认的故障案例和官方运维文档，为后续诊断提供本地知识召回。
- 保持存储操作的人工控制边界：AI 负责分析和建议，管理员负责审核及执行高风险变更。

## 核心功能

### 监控态势

- **总览**：文件系统连接状态、健康评分、容量水位、吞吐、IOPS、活跃告警和关键组件状态。
- **指标中心**：读写带宽、IOPS、延迟、系统负载和历史趋势。
- **容量管理**：OST/MDT 容量、使用率、inode、容量预测和对象分布。
- **网络质量**：LNet NID、网络状态、吞吐、延迟和节点关系。

### 运维诊断

- **告警管理**：活跃告警、历史告警、详情证据、处置步骤和 AI 智能分析。
- **集群巡检**：执行真实 Lustre/Linux 只读检查命令，流式展示阶段、命令、输出、退出码和检查结论。
- **报告管理**：巡检结果和运行数据的汇总展示与导出入口。
- **配置视图**：文件系统、节点、服务和关键参数的集中查看。

### AI 日志分析与知识库

- 采集并筛选 Lustre、内核和系统日志，默认聚焦 `WARN`、`ERROR`、`FATAL` 等异常信号。
- 通过服务端代理调用 DeepSeek 或 OpenAI-compatible Chat Completions API，避免将模型密钥打包到前端。
- 支持多轮诊断会话、分析历史、知识命中展示和简洁回复策略。
- 支持 Markdown、文本、日志和配置文档上传、分块解析、版本管理、本地向量索引、召回测试和命中反馈。
- 可将人工确认有效的故障现象、分析结论和处理步骤录入本地经验库。

## 页面导航

| 页面 | 路径 | 主要用途 |
| --- | --- | --- |
| 总览 | `/dashboard` | 集群态势和快速处置入口 |
| 文件系统 | `/config` | 文件系统拓扑、节点和参数 |
| 指标中心 | `/performance` | 性能指标与趋势 |
| 容量管理 | `/capacity` | OST/MDT 容量和预测 |
| 网络质量 | `/network` | LNet 与网络指标 |
| 告警管理 | `/alerts` | 告警队列、历史和详情 |
| 巡检管理 | `/health-check` | 真实巡检任务和执行日志 |
| 日志中心 | `/logs` | AI 日志诊断与知识库 |
| 报表管理 | `/reports` | 报告汇总和导出 |
| 设置 | `/settings` | 展示偏好、通知和系统配置入口 |

## 技术架构

```text
React 19 + TypeScript + Vite + Tailwind CSS
                    |
                    | /api
                    v
Flask API + Lustre/Linux commands + SQLite metrics
                    |
        +-----------+-----------+
        |                       |
   Lustre host              AI provider
 lfs/lctl/journalctl    OpenAI-compatible API
        |
 Local knowledge documents and vector index
```

- 前端：React 19、TypeScript、Vite、Tailwind CSS、Radix UI、Recharts。
- 后端：Python 3、Flask、SQLite，调用 `lfs`、`lctl`、`journalctl` 等只读诊断命令。
- AI：服务端保存模型配置并代理请求；前端不会构建模型 API Key。
- 数据：默认读取 `/opt/lustre-data/lustre.db`，知识库和模型配置保存在 `/opt/lustre-data/` 下。

## 快速开始

### 环境要求

- Node.js 20+
- Python 3.8+
- 可选：已安装 Lustre 客户端工具的 Linux 主机
- 可选：由指标采集程序维护的 `/opt/lustre-data/lustre.db`

### 启动后端

```bash
cd app/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python lustre_api.py
```

API 默认监听 `0.0.0.0:3006`。请仅在受控管理网络中使用，并通过反向代理配置鉴权、TLS 和访问控制。

### 启动前端

```bash
cd app
npm ci
cp .env.example .env
npm run dev
```

开发服务默认访问 `http://127.0.0.1:3005/lustre-ops/`，`/api` 请求代理到 `VITE_API_TARGET`。

### 构建前端

```bash
cd app
npm run build
```

构建产物位于 `app/dist/`，应用基础路径为 `/lustre-ops/`。完整的 systemd 与 Apache 部署示例见[部署指南](docs/deployment.md)。

## 测试

```bash
cd app
npm run build
npm run lint
python -m unittest api.test_knowledge_overview api.test_ai_response_policy -v
```

`npm run lint` 当前仍会以警告形式报告部分动态 API 数据的类型宽松问题；发布门禁以 TypeScript 构建、后端单元测试、API smoke test 和测试服务器浏览器验收为主，后续版本会逐步用显式接口类型替换这些 `any`。

## 当前边界

- `v1.0.0` 后端直接在部署节点执行巡检和采集，尚未包含面向全部服务端与客户端的分布式 Agent 管理面。
- 当前知识检索使用本地文档分块和轻量向量索引；生产级 embedding 服务和独立向量数据库仍在路线图中。
- 部分设置、配置展示和演示趋势仍包含本地状态或示例数据，部署时需按实际采集链路接入。
- 当前 Flask 服务适合受控测试环境；生产部署还需补充登录鉴权、RBAC、审计持久化、WSGI、TLS 和 API 限流。
- 任何影响挂载、服务或数据的命令都应由管理员审核后人工执行，不应直接依据模型输出自动操作。

## 路线图

- 全部 MGS/MDS/OSS/客户端节点 Agent，支持注册、心跳、任务下发、超时和断点续传。
- 系统管理员/只读审计员登录、失败锁定和完整操作审计。
- PostgreSQL + pgvector 或独立向量数据库，接入真实 embedding 与知识质量权重。
- 巡检模板版本化、节点角色编排、调度策略和基线对比。
- 告警聚合、通知渠道、工单联动和高可用部署。
- Gunicorn/uwsgi、反向代理、TLS、密钥托管和最小权限运行。

## 许可证

本项目采用 [GNU General Public License v3.0](LICENSE)。
