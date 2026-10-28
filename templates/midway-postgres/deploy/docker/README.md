# PostgreSQL 双容器离线部署

## 构建交付包

在应用根目录执行 `npm install`，提交 `package-lock.json`，再执行：

```sh
npm run build:docker
```

需要 Docker Linux 容器、Node.js 22/24，以及下载 npm 依赖和基础镜像的网络。构建机器与目标机器 CPU 架构应一致。

脚本构建应用镜像，拉取官方 `postgres:17-bookworm` 镜像，用临时 PostgreSQL 容器验证迁移、HTTP 和重连后数据，再将两个镜像一起导出到一个 tar。临时数据库和容器在检查后删除。`-- --no-export` 可跳过 tar 导出。

PostgreSQL 使用官方镜像，不需要单独维护数据库 Dockerfile。应用镜像标签读取 package.json 的名称和版本；可通过 SERVER_IMAGE 指定应用镜像标签。

交付目录为 `release/docker/<名称>_<版本>_<构建标识>/`：

```text
__APP_NAME___0.1.0.tar     # 同时包含应用和 PostgreSQL 镜像
compose.yaml
pro.env                     # 自动生成应用密钥和数据库密码
README.md
data/
├── postgres/            # PostgreSQL: /var/lib/postgresql/data
├── uploads/             # MidwayJS: /app/uploads
└── logs/                # MidwayJS: /app/logs
```

默认数据库容器名为 `__APP_NAME__-PostgreSQL`。Compose 项目名也包含应用名；同一台机器部署多套同名应用时，需分别设置 COMPOSE_PROJECT_NAME、POSTGRES_CONTAINER_NAME、HTTP 端口及数据目录。

## 首次部署

目标机器提前安装 Docker 和 Docker Compose。将整个交付目录（包括 pro.env）复制到固定部署目录，以下命令在该目录执行。

检查 `pro.env` 的 SERVER_UID/GID 与应用目录的普通用户一致（Linux 使用 `id -u`、`id -g` 查看）。只将 uploads/logs 赋予应用用户；PostgreSQL 数据目录由官方镜像初始化和管理，**不要对整个 data 递归修改为应用 UID**。

```sh
docker load -i __APP_NAME___0.1.0.tar
mkdir -p data/postgres data/uploads data/logs
# 如复制后的 uploads/logs 所有者不匹配，将 1000:1000 换成 SERVER_UID:GID
sudo chown -R 1000:1000 data/uploads data/logs
docker compose --env-file pro.env config --quiet
docker compose --env-file pro.env up -d --pull never
docker compose --env-file pro.env ps
```

数据库健康后应用才启动。访问 `http://localhost:__HTTP_PORT__/health`。SERVER_HTTP_PORT 控制宿主机端口；PostgreSQL 默认仅在 Compose 内网提供 5432，不暴露到宿主机。

上传功能可使用环境变量 SERVER_UPLOAD_DIR 指向的目录；模板仅预留上传存储目录，没有实现上传接口。

`pro.env` 的 POSTGRES_USER、POSTGRES_DB、POSTGRES_PASSWORD 用于首次初始化。已有数据库不会因修改这些变量而重设账号密码；升级保留原值。SERVER_UPLOAD_PATH、SERVER_LOG_PATH、POSTGRES_DATA_PATH 可改为宿主机绝对路径；相对路径以 compose.yaml 所在目录为基准。

## 日常管理

```sh
docker compose --env-file pro.env logs --tail 100 -f server
docker compose --env-file pro.env logs --tail 100 postgres
docker compose --env-file pro.env stop
docker compose --env-file pro.env start
docker compose --env-file pro.env ps -a
```

修改配置后执行 `docker compose --env-file pro.env up -d --pull never`。启动仅数据库可执行 `docker compose --env-file pro.env up -d --pull never postgres`。

## 升级、迁移和备份

新版本更新 package.json 和锁文件后重新打包。将新 tar 复制到原固定部署目录，导入后停服备份：

```sh
docker load -i __APP_NAME___0.1.1.tar
docker compose --env-file pro.env stop
# 两个容器均停止后再复制/归档 PostgreSQL 数据目录；默认路径示例
sudo tar -czf ../__APP_NAME__-backup.tar.gz data pro.env compose.yaml
```

每次备份使用新文件名。确认备份成功后，只更新原 pro.env 的 SERVER_IMAGE，保留密码、密钥和目录配置，再执行 `docker compose --env-file pro.env up -d --pull never`。仅备份时用 `docker compose --env-file pro.env start` 恢复服务。

迁移需停止两个容器并复制完整 data、pro.env 和 compose.yaml，保留目录所有者。恢复备份时使用空目标目录，避免混合数据。数据库迁移不兼容时，回退应用还需要恢复升级前的数据与配置。

本模板固定 PostgreSQL 17 的数据挂载方式。PostgreSQL 主版本升级需要 pg_dump/pg_restore 或 pg_upgrade 等迁移流程，不能直接换主版本标签复用原 data/postgres。官方镜像说明：https://hub.docker.com/_/postgres

生产配置使用可见文件 `pro.env`。Compose 不会自动加载此文件，管理命令都需带 `--env-file pro.env`，并在交付目录执行。

旧交付目录升级时，可先将原 `.env` 复制为 `pro.env`，保留原密码、密钥和数据路径，再按上述命令操作；不要用新包的配置覆盖旧值。
