# Lustre OPS 应用

本目录包含 Lustre OPS 的 React 前端和 Flask API。项目功能、架构和发布说明请阅读[根目录 README](../README.md)。

## 前端开发

```bash
npm ci
cp .env.example .env
npm run dev
```

- 开发地址：`http://127.0.0.1:3005/lustre-ops/`
- API 代理：通过 `VITE_API_TARGET` 配置，默认 `http://127.0.0.1:3006`
- 生产构建：`npm run build`
- 构建目录：`dist/`

## 后端开发

```bash
cd api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python lustre_api.py
```

API 默认监听 `3006` 端口，运行主机需要具备对应的 Lustre 命令和监控数据库。生产使用前请阅读[安全说明](../SECURITY.md)。
