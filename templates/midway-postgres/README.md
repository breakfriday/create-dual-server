# __APP_NAME__

MidwayJS 4 + TypeORM + PostgreSQL 服务，包含 `/health` 和 `/api/notes` 示例接口。仅安装 pg 驱动，不安装 better-sqlite3。

## 开发

需要 Node.js 22.9+（22.x）或 24.x，以及 Docker Compose。首次执行：

```sh
npm install
npm run dev:db
npm run dev
```

`dev:db` 使用官方 PostgreSQL 17 镜像，只启动数据库并等待就绪；`dev` 在本机运行 Midway，支持代码修改后重启。两个命令首次运行时都会从 `dev.env.example` 复制出可见配置文件 **`dev.env`**，已有文件不会被覆盖。

修改项目根目录 `dev.env` 即可配置：

| 配置 | 默认值 | 用途 |
| --- | --- | --- |
| PGHOST | 127.0.0.1 | 本机服务连接数据库的地址 |
| PGPORT | 5432 | 数据库映射到本机的端口 |
| PGUSER | __APP_NAME__ | 数据库用户 |
| PGDATABASE | __APP_NAME__ | 数据库名 |
| PGPASSWORD | __APP_NAME__-dev-password | 本地开发数据库密码 |
| SERVER_HTTP_PORT | __HTTP_PORT__ | Midway HTTP 端口 |
| DEV_POSTGRES_CONTAINER_NAME | __APP_NAME__-PostgreSQL-dev | 开发数据库容器名 |
| DEV_POSTGRES_DATA_PATH | ./data/postgres-dev | 相对项目根目录的数据路径 |

服务连接路径为：`Midway → 127.0.0.1:PGPORT → PostgreSQL 容器的 5432`。数据库只绑定本机地址，不对外网开放。若 5432 已占用，将 dev.env 中 PGPORT 改成 15432，再执行 `npm run dev:db` 和 `npm run dev`。已有终端环境变量优先于文件；之前 export 过 PG* 时请取消旧值或使用新终端。

修改 dev.env 后重新启动应用；端口修改需再次运行 `npm run dev:db`。POSTGRES 初始化只在空数据目录执行：已有数据库的密码、用户名和库名不会随 dev.env 自动修改，应先在数据库中修改后再同步配置。连接外部数据库时填写对应 PG*，跳过 `dev:db`。

```sh
npm run dev:db:status  # 查看状态
npm run dev:db:logs    # 跟踪日志，Ctrl+C 退出
npm run dev:db:stop    # 停止数据库，保留数据
npm run dev:db         # 再次启动
```

默认访问 `http://localhost:__HTTP_PORT__/health`。应用以 Ctrl+C 停止；数据库独立运行。开发环境自动同步表结构；生产环境通过迁移管理结构。

`dev.env` 已加入 Git 忽略，模板文件 dev.env.example 可提交。开发配置不随 Docker 镜像打包，生产启动不自动加载 dev.env，也没有开发默认密码回退。

`npm run check` 检查类型，`npm test` 检查部署配置。`npm run test:production` 仍使用显式环境变量连接 PostgreSQL，并创建、删除随机测试数据库；测试账户需要 CREATEDB 权限。

## Docker 离线交付

```sh
npm run build:docker
```

构建时自行启动临时 PostgreSQL，完成检查后清理，不需要提前准备数据库。输出包含应用和 PostgreSQL 两个镜像的 tar、Compose、随机密码 pro.env，以及 data/postgres、data/uploads、data/logs 三个目录。数据库容器默认名为 `__APP_NAME__-PostgreSQL`。

详见 [Docker 部署手册](deploy/docker/README.md)。上传目录通过 SERVER_UPLOAD_DIR 提供给业务代码，模板未实现上传接口。

## Windows 服务

`npm run build:winserver` 仍可打包 Windows 应用，但数据库需单独部署。构建只检查生产配置和驱动；运行服务的账户需设置 PGHOST、PGPORT、PGUSER、PGDATABASE、PGPASSWORD。Windows 包不包含 PostgreSQL。具体说明见 [Windows 部署](deploy/windows/README.md)。
