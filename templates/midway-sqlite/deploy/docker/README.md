# Docker 离线部署

## 制作交付包（开发机器）

需要 Node.js 22 或 24、Docker（Linux 容器）。构建机器需能下载基础镜像和 npm 依赖，CPU 架构应与目标机器一致。

在生成项目的根目录运行：

```sh
npm install
npm run build:docker
```

首次安装后提交 `package-lock.json`。镜像内通过 `npm ci`、TypeScript 编译、裁剪开发依赖及生产 SQLite/HTTP 冒烟检查完成构建，不复用宿主机的原生模块。

镜像名称和版本读取 `package.json`，默认 `__APP_NAME__:0.1.0`。输出到 `release/docker/<应用名>_<版本>_<构建标识>/`：

```text
<应用名>_<版本>.tar
compose.yaml
.env
README.md
```

`.env` 自动生成随机 `COOKIE_KEYS`。`npm run build:docker -- --no-export` 只构建镜像和部署配置，不导出 tar。可通过环境变量 `SERVER_IMAGE` 指定完整镜像标签。每次发布更新版本，例如 `npm version 0.1.1 --no-git-tag-version`。

镜像以非 root 用户运行，应用位于 `/app`，数据库位于 `/app/data/server.sqlite`，日志位于 `/app/logs`。如应用增加静态资源等目录，需要同步调整 Dockerfile 和根目录 `.dockerignore` 的白名单。

## 首次部署

目标机器提前安装 Docker 和 Docker Compose。将整个交付目录（包括隐藏的 `.env`）复制到固定部署目录，例如 `/opt/__APP_NAME__`。以下操作均在该目录执行。

检查 `.env` 中的镜像名称与 tar 一致；Linux 使用 `id -u`、`id -g` 查看当前普通用户 ID，并设置 `SERVER_UID`、`SERVER_GID`。默认端口为 __HTTP_PORT__，可修改 `.env` 的 `SERVER_HTTP_PORT` 调整宿主机端口，容器端口保持不变。

```sh
# 文件名按实际版本替换
docker load -i __APP_NAME___0.1.0.tar
mkdir -p data logs
docker compose config --quiet
docker compose up -d --pull never
docker compose ps
```

访问 `http://localhost:__HTTP_PORT__/health`，应返回 `{"status":"ok"}`；容器稍后应显示 `healthy`。最终交付包导入和启动无需联网。

数据和日志使用宿主机目录持久化。`SERVER_DATA_PATH`、`SERVER_LOG_PATH` 支持绝对路径，默认相对 `compose.yaml` 所在目录。修改路径时，创建目录和备份命令也要使用对应路径。

若出现 `SQLITE_CANTOPEN` 或权限错误，停止服务，修复挂载目录权限再启动（Linux）：

```sh
docker compose stop server
# 1000:1000 替换为 .env 中的 SERVER_UID:SERVER_GID
sudo chown -R 1000:1000 data logs
docker compose up -d --pull never
```

## 管理服务

```sh
docker compose logs --tail 100 -f server
docker compose stop server
docker compose start server
docker compose restart server
docker compose ps -a
```

修改配置或镜像版本后执行 `docker compose up -d --pull never`；`restart` 不应用新配置。

## 升级、备份和回退

将新 tar 复制到原固定部署目录，导入新镜像，停止服务并备份：

```sh
docker load -i __APP_NAME___0.1.1.tar
docker compose stop server
tar -czf "../__APP_NAME__-backup-$(date +%Y%m%d-%H%M%S).tar.gz" data .env compose.yaml
```

确认备份成功后，只修改原 `.env` 的 `SERVER_IMAGE` 为新版本，保留密钥、数据路径和其他配置。不要用新交付包的 `.env` 覆盖旧配置。若新版本修改了 Compose 文件，更新后核对挂载路径。

```sh
docker compose config --quiet
docker compose up -d --pull never
docker compose ps
docker compose logs --tail 100 server
```

只做备份时，完成后用 `docker compose start server` 恢复。

迁移旧服务时先停服，复制整个 `data/`（包含 SQLite 辅助文件）到空目标目录，保留原 `COOKIE_KEYS` 并核对权限。建议先用相同应用版本验证迁移。

回退前停止服务并备份当前数据。确认旧版本兼容当前数据库后，导入旧镜像并修改 `SERVER_IMAGE`，再执行 `up`。若数据库迁移不兼容，需恢复升级前的整套数据与配置；恢复备份会回到备份时的数据状态。
