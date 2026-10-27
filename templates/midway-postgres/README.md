# __APP_NAME__

MidwayJS 4 + TypeORM + PostgreSQL 服务，包含 `/health` 和 `/api/notes` 示例接口。仅安装 pg 驱动，不安装 better-sqlite3。

## 开发

准备可连接的 PostgreSQL，设置连接变量后运行（下面为 Bash 示例，密码替换为实际值）：

```sh
npm install
export PGHOST=127.0.0.1
export PGPORT=5432
export PGUSER=__APP_NAME__
export PGDATABASE=__APP_NAME__
export PGPASSWORD=your-password
npm run dev
```

服务默认端口 __HTTP_PORT__，通过 SERVER_HTTP_PORT 可覆盖。开发环境自动同步表结构；生产环境关闭 synchronize，执行 `src/migration/` 中的 PostgreSQL 迁移。

`npm run check` 检查类型，`npm test` 检查部署配置。`npm run test:production` 使用连接变量访问 PostgreSQL，并创建和删除随机测试数据库，验证迁移和 HTTP，因此测试账户需有 CREATEDB 权限；不要将生产账户用于测试。

## Docker 离线交付

```sh
npm run build:docker
```

构建时自行启动临时 PostgreSQL，完成检查后清理，不需要提前准备数据库。输出包含应用和 PostgreSQL 两个镜像的 tar、Compose、随机密码 .env，以及 data/postgres、data/uploads、data/logs 三个目录。数据库容器默认名为 `__APP_NAME__-PostgreSQL`。

详见 [Docker 部署手册](deploy/docker/README.md)。上传目录通过 SERVER_UPLOAD_DIR 提供给业务代码，模板未实现上传接口。

## Windows 服务

`npm run build:winserver` 仍可打包 Windows 应用，但数据库需单独部署。构建只检查生产配置和驱动；运行服务的账户需设置 PGHOST、PGPORT、PGUSER、PGDATABASE、PGPASSWORD。Windows 包不包含 PostgreSQL。具体说明见 [Windows 部署](deploy/windows/README.md)。
