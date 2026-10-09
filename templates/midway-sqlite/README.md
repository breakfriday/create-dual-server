# __APP_NAME__

MidwayJS 4 + Koa + TypeORM + better-sqlite3。开发时自动同步本地数据库，生产时执行迁移；Windows 发布包附带 Node、生产依赖和 WinSW。

## 开发

使用 Node.js 22 或 24、npm：

```sh
npm install
npm run dev
```

提交生成的 `package-lock.json`。后续安装使用 `npm ci`；Windows 发布构建依赖此锁文件。开发库为项目根目录 `dev.sqlite`。

- `GET /`：项目信息。
- `GET /health`：数据库连接健康检查。
- `GET /api/notes`：最近 100 条记录。
- `POST /api/notes`：JSON `{"content":"hello"}`，创建一条记录。

默认端口 __HTTP_PORT__，可通过 `SERVER_HTTP_PORT` 覆盖。示例 notes API 未配置认证，业务接入时按需增加认证和权限。

```sh
npm run check
npm test
npm run test:production
```

生产冒烟测试使用独立临时数据库，检查迁移、实体读写、重启持久化、HTTP、非法输入以及从其他工作目录启动，不使用开发或部署数据库。

## Windows 发布

在 Windows x64 构建机上执行 `npm ci`。从 [WinSW Releases](https://github.com/winsw/winsw/releases/tag/v2.12.0) 下载 v2 `WinSW-x64.exe`，放入 `scripts/`，或用环境变量 `WINSW_EXE` 指定本地文件，然后：

```sh
npm run build:winserver
```

输出 `release/winserver/<唯一构建号>/__APP_NAME__.zip`。每次创建新目录，不清理已有发布包。构建会编译应用、使用锁文件安装生产依赖、复制当前 Node 运行时、执行生产冒烟测试、生成随机 cookie 签名密钥、打包 ZIP。

部署端解压后运行 `start.cmd`，或以管理员身份运行 `install-service.cmd`。完整操作见 [Windows 部署说明](deploy/windows/README.md)。目标机器无需安装 Node/npm；WinSW 自身运行环境要求以选用版本为准。

不能把 Linux/macOS 的 node_modules 放入 Windows 包：better-sqlite3 是原生模块，必须与操作系统、架构、Node ABI 匹配。脚本固定支持 Windows x64 + Node 22/24，并将构建用 Node 一并带走。

## 其他平台生产启动

```sh
npm run build
```

创建部署配置（不要提交实际密钥），例如 `/srv/__APP_NAME__/config/server.json`：

```json
{
  "dataDir": "../data",
  "logDir": "../logs",
  "httpPort": __HTTP_PORT__,
  "cookieKeys": "替换为独立随机密钥"
}
```

可用 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` 生成密钥。

```sh
SERVER_CONFIG_FILE=/srv/__APP_NAME__/config/server.json npm start
```

`bootstrap.js` 默认使用 production。配置路径必须绝对；JSON 内目录路径相对于 JSON 文件解析。环境变量 `SERVER_DATA_DIR`、`SERVER_LOG_DIR`、`SERVER_HTTP_PORT`、`COOKIE_KEYS` 优先于 JSON，目录环境变量必须是绝对路径。生产库为 `data/server.sqlite`，缺少配置直接报错，不回退到开发库。日志默认为数据目录同级 `logs/`。

## 数据库变更

实体在 `src/entity`，服务在 `src/service`，迁移在 `src/migration`，入口配置在 `src/config/config.default.ts`。

修改实体后，开发环境的 `synchronize` 会同步 `dev.sqlite`；同时必须添加新的带时间戳 TypeORM migration，并将类加入配置的 `migrations` 数组。已发布的迁移保持不变。生产设置 `synchronize: false`、`migrationsRun: true` 和 `allowExecuteMigrations: true`，只执行未应用的迁移。

开发库不作为生产初始库。发布前执行 `npm run test:production`，并对有真实历史数据的数据库副本验证新增迁移。更新前停止服务并备份完整数据目录；回滚恢复匹配的应用和数据库备份。
