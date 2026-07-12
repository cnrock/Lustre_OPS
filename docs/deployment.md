# 部署指南

本文给出 `v1.0.0` 的单节点测试部署方式。生产部署必须同时参考根目录的 `SECURITY.md`。

## 目录约定

```text
/opt/Lustre_OPS/app       项目代码
/opt/Lustre_OPS/app/dist  前端构建产物
/opt/lustre-data          SQLite 指标、AI 配置和知识库数据
```

## 安装依赖与构建

```bash
cd /opt/Lustre_OPS/app
npm ci
npm run build

cd api
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

## 后端服务

仓库提供 `app/api/lustre-ops-api.service` 作为基础模板。正式启用前应根据实际 Python 环境调整 `ExecStart`，并评估使用专用服务账号替代 `root`。

```bash
sudo cp app/api/lustre-ops-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lustre-ops-api.service
sudo systemctl status lustre-ops-api.service
curl --fail http://127.0.0.1:3006/api/health
```

## Apache 示例

```apache
Alias /lustre-ops/ /opt/Lustre_OPS/app/dist/

<Directory /opt/Lustre_OPS/app/dist>
    Options FollowSymLinks
    AllowOverride None
    Require all granted
    FallbackResource /lustre-ops/index.html
</Directory>

ProxyPass        /api/ http://127.0.0.1:3006/api/
ProxyPassReverse /api/ http://127.0.0.1:3006/api/
```

启用反向代理所需模块并重新加载 Apache。实际配置还应增加 TLS、身份认证、来源限制、安全响应头和访问日志脱敏。

## 验证

```bash
curl --fail http://127.0.0.1:3006/api/health
curl --fail http://127.0.0.1/lustre-ops/
curl --fail http://127.0.0.1/lustre-ops/visuals/lustre-logs-healthy.webp
```

浏览器验收至少覆盖：总览、性能、容量、网络、告警详情、巡检流式日志、AI 设置连接测试、日志对话、知识库上传/检索以及桌面/窄屏布局。

## 回滚

部署前保留当前 `dist`、后端源文件和 `/opt/lustre-data` 的一致性快照。前端可直接恢复旧 `dist`；后端恢复旧版本后重启服务。数据库或知识库变更需要连同对应数据快照一起回滚，避免代码与 schema 不匹配。
