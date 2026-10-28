# __APP_NAME__

基于 MidwayJS 4、TypeScript 和 Koa 的服务端应用，使用 TypeORM + better-sqlite3 管理 SQLite 数据库，支持打包为自带 Node.js 运行时的 Windows 服务或 Docker 离线部署包。

## 快速开始

使用 **Node.js 22 或 24** 和 **npm**，在项目根目录执行：

```sh
npm install
npm run dev
```

服务默认运行于 `http://localhost:__HTTP_PORT__`。访问 `http://localhost:__HTTP_PORT__/health`，应返回：

```json
{"status":"ok"}
```

首次安装后提交 `package-lock.json`，后续安装使用 `npm ci`。Windows 打包也依赖该锁文件。

## 项目结构

```text
__APP_NAME__/
├── src/
│   ├── config/config.default.ts   HTTP、日志与数据库配置
│   ├── controller/                路由、请求处理与参数校验
│   ├── service/                   业务逻辑与数据库读写
│   ├── entity/                    TypeORM 实体
│   ├── migration/                 数据库迁移
│   ├── utils/deployment-config.ts 数据库路径与端口读取
│   └── configuration.ts           Midway 组件注册
├── deploy/windows/               Windows 配置及服务管理脚本模板
├── scripts/
│   ├── build-winserver.cjs        Windows 发布包构建
│   ├── smoke-production.cjs       生产数据库与 HTTP 冒烟测试
│   └── test/                     部署配置测试
├── bootstrap.js                  生产启动入口
├── deployment.cjs                生产配置加载与校验
├── package.json                  依赖与常用命令
└── tsconfig.json                 TypeScript 编译配置
```

开发库 `dev.sqlite`、编译目录 `dist/` 和发布目录 `release/` 在运行或构建时生成。

## 配置说明

### 开发与生产的区别

应用配置入口为 [src/config/config.default.ts](src/config/config.default.ts)。

| 配置行为 | 开发环境 | 生产环境 |
| --- | --- | --- |
| 启动命令 | `npm run dev` | `npm start` 或 Windows 启动脚本 |
| 数据库 | 项目根目录 `dev.sqlite` | 数据目录下 `server.sqlite` |
| 表结构更新 | 自动同步实体定义 | 执行尚未应用的迁移 |
| 部署配置 | 不加载生产 `server.json` | 启动前加载指定的 `server.json` |

默认 HTTP 端口为 `__HTTP_PORT__`，开发和生产均可通过 `SERVER_HTTP_PORT` 覆盖。

### 生产配置文件

Windows 发布包会生成 `config/server.json`；从源码部署时需自行创建。配置示例：

```json
{
  "dataDir": "../data",
  "logDir": "../logs",
  "httpPort": __HTTP_PORT__,
  "cookieKeys": "替换为独立随机密钥"
}
```

| 配置项 | 环境变量 | 说明 |
| --- | --- | --- |
| `dataDir` | `SERVER_DATA_DIR` | 生产数据目录，必须提供 |
| `logDir` | `SERVER_LOG_DIR` | 应用日志目录，默认是数据目录同级的 `logs/` |
| `httpPort` | `SERVER_HTTP_PORT` | HTTP 端口，默认 `__HTTP_PORT__`，范围 `1–65535` |
| `cookieKeys` | `COOKIE_KEYS` | Cookie 签名密钥，生产环境必须提供 |

配置优先级为 **环境变量 → JSON 配置 → 默认值**。JSON 内的相对路径以配置文件所在目录为基准；环境变量中的目录路径必须为绝对路径。

`SERVER_CONFIG_FILE` 指定配置文件的绝对路径。Windows 启动脚本会自动设置它；源码部署时需自行指定。生产配置缺失或无效时启动会报错，不会回退到开发数据库。

Windows 打包会自动生成随机 `cookieKeys`。手动配置时，可运行以下命令生成密钥，并填入 JSON；实际密钥不要提交到仓库：

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## 开发指南

### 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动开发服务并监听代码变更 |
| `npm run check` | TypeScript 类型检查 |
| `npm run build` | 编译到 `dist/` |
| `npm start` | 启动编译后的服务，默认使用生产环境，需要生产配置 |
| `npm test` | 验证部署配置解析与校验 |
| `npm run test:production` | 编译并验证生产迁移、持久化和 HTTP 接口 |
| `npm run build:winserver` | 构建 Windows 发布包 |

### 示例接口

项目包含 Note 实体、服务与控制器，可作为新增业务的参考。

| 接口 | 用途 |
| --- | --- |
| `GET /` | 查看项目信息 |
| `GET /health` | 检查服务与数据库连接 |
| `GET /api/notes` | 查询最近 100 条记录 |
| `POST /api/notes` | 使用 JSON `{"content":"hello"}` 创建记录 |

创建记录时设置 `Content-Type: application/json`。`content` 去除首尾空白后长度应为 1–2000 个字符；创建成功返回 HTTP 201，参数无效返回 HTTP 400。示例接口未配置认证，接入业务时按需添加认证与权限。

### 数据库变更

1. 在 `src/entity/` 中添加或修改实体，将新增实体加入应用配置的 `entities` 数组。
2. 开发环境通过 `synchronize` 自动同步 `dev.sqlite`，用于本地开发。
3. 在 `src/migration/` 中添加带时间戳的新迁移类，并加入配置的 `migrations` 数组。已发布的迁移保持不变。
4. 执行 `npm run test:production`；涉及已有业务数据时，还需对历史数据库副本验证迁移。

生产配置为 `synchronize: false`、`migrationsRun: true`、`allowExecuteMigrations: true`，启动时只执行未应用的迁移。不要将开发库直接作为生产初始库。

生产冒烟测试使用独立临时数据库，检查空库迁移、实体读写、重启持久化、HTTP 参数校验和跨工作目录启动，不使用开发库或实际部署数据。调整示例实体或接口后，也需同步更新 `scripts/smoke-production.cjs` 中对应的检查。

## 生产部署

### Windows 打包部署

**构建前提：Windows x64、Node.js 22 或 24，以及已生成的 npm 锁文件。**

1. 在构建机的项目根目录执行 `npm ci`。
2. 从 [WinSW v2.12.0 发布页](https://github.com/winsw/winsw/releases/tag/v2.12.0) 下载 `WinSW-x64.exe`，放入 `scripts/`；也可以通过 `WINSW_EXE` 指定本地文件路径。构建脚本不会自动下载 WinSW。
3. 执行打包：

```sh
npm run build:winserver
```

输出为 `release/winserver/<build-id>/__APP_NAME__.zip`。构建会编译应用、按锁文件安装生产依赖、捆绑当前 Node 运行时、执行生产冒烟测试并生成随机 Cookie 签名密钥。每次使用独立构建目录，不清理旧发布包。

better-sqlite3 是原生模块，必须匹配操作系统、架构与 Node ABI，因此不能将 Linux/macOS 的 `node_modules` 复制进 Windows 包。

解压后的目录用途：

| 目录 | 内容 |
| --- | --- |
| `app/` | 编译代码、启动入口与生产依赖 |
| `runtime/` | 构建时使用的 Node.js 运行时 |
| `config/` | 部署配置与签名密钥 |
| `data/` | 首次启动时创建的生产数据库 |
| `logs/` | 应用与 WinSW 日志 |

将发布包解压到固定目录，按需修改 `config/server.json`，运行 `start.cmd` 并通过 `/health` 检查启动结果。结束前台进程后，以管理员身份运行 `install-service.cmd` 注册服务。

目标机器无需安装 Node/npm；WinSW 自身运行环境要求以所选版本为准。服务管理、多实例部署与卸载操作见 [Windows 部署说明](deploy/windows/README.md)。

### 从源码启动生产服务

在目标平台安装依赖并编译：

```sh
npm ci
npm run build
```

按前文的配置示例创建部署文件并填入实际密钥。例如在 Linux/macOS 中，将其保存为 `/srv/__APP_NAME__/config/server.json`，然后启动：

```sh
SERVER_CONFIG_FILE=/srv/__APP_NAME__/config/server.json npm start
```

Windows PowerShell 示例（先在对应路径创建配置文件）：

```powershell
$env:SERVER_CONFIG_FILE = 'D:\__APP_NAME__\config\server.json'
npm start
```

以上命令均在项目根目录执行；`bootstrap.js` 默认使用生产环境。

### 更新与备份

1. 停止服务，备份 `config/` 和整个 `data/`，包括可能存在的 SQLite 辅助文件。
2. Windows 发布包更新时，将新包的 `app/` 和 `runtime/` 成套替换；保留原有配置、数据、日志和服务定义。
3. 启动服务，等待迁移完成，并通过 `/health` 和业务接口确认运行正常。

保留原有 `cookieKeys`，不要用新包密钥覆盖。迁移后的回滚应恢复匹配的程序和数据库备份；Windows 卸载脚本只注销服务，不删除配置和数据。

## Docker 打包与离线部署

生成的应用内置 `deploy/docker/Dockerfile`、Compose 配置和 `scripts/build-docker.cjs`。在应用根目录执行：

```sh
npm install
npm run build:docker
```

构建需要 Docker Linux 容器以及可下载基础镜像和依赖的网络。应用在镜像内编译并进行生产 SQLite/HTTP 检查，默认输出 `release/docker/<名称>_<版本>_<构建标识>/`，包含镜像 tar、`compose.yaml`、随机密钥 `pro.env` 和部署说明。使用 `-- --no-export` 可跳过 tar 导出。

目标机器导入镜像后，通过 Compose 离线启动；数据和日志挂载到宿主机，支持版本升级及备份恢复。

详细操作见 [Docker 部署手册](deploy/docker/README.md)。
