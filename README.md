# create-dual-server

**基于 MidwayJS 4 和 TypeScript 的轻量服务端脚手架，内置 SQLite + TypeORM，支持 Windows 一键打包、解压部署。**

create-dual-server 将服务开发、数据库管理和 Windows 部署整合到一个项目模板中。开发时使用 Node.js 运行和调试；交付时将应用、生产依赖、Node.js 运行时与 WinSW 一起打包，目标机器无需安装 Node.js、npm 或独立数据库服务。

适用于内部工具、局域网 API、桌面应用配套服务，以及需要在 Windows 上独立交付的轻量后端。

## 核心特点

- **开箱即用**：基于 MidwayJS 4、TypeScript 和 Koa，包含控制器、服务、实体、示例接口及健康检查。
- **内置 SQLite**：通过 better-sqlite3 和 TypeORM 读写数据库，无需单独部署数据库服务。
- **数据库迁移**：开发环境自动同步表结构，生产环境通过迁移创建和更新数据库。
- **一键打包**：在 Windows x64 构建机上，将编译产物、生产依赖、当前 Node 运行时和 WinSW 打成 ZIP。
- **Windows 服务管理**：支持前台运行、服务安装与卸载、开机自启动、异常重启和日志轮转。
- **便于升级**：程序、运行时、配置、数据与日志分目录保存，升级时可保留原有数据和配置。

脚手架 CLI 本身无运行依赖，npm 包名为 `@break_happy/create-dual-server`。

## 快速开始

### 环境准备

| 场景 | 要求 |
| --- | --- |
| 开发与运行生成的项目 | Node.js 22 或 24、npm |
| 构建 Windows 发布包 | Windows x64、Node.js 22 或 24、npm、本地 WinSW 可执行文件 |
| 运行 Windows 发布包 | 与捆绑 Node/WinSW 兼容的 Windows x64 系统；无需另装 Node/npm |

WinSW 自身的运行环境要求以所选发行版本为准。

### 创建项目

在本脚手架仓库目录执行：

```sh
node bin/create-dual-server.mjs ../my-server
cd ../my-server
npm install
npm run dev
```

默认服务地址为 `http://localhost:7001`，访问 `/health` 应返回 `{"status":"ok"}`。

首次安装后，将生成的 `package-lock.json` 提交到项目仓库；后续安装使用 `npm ci`，Windows 打包也使用该锁文件安装生产依赖。

包发布到 npm 后，可通过以下命令创建项目：

```sh
npm create @break_happy/dual-server@latest my-server
```

### 创建参数

```sh
node bin/create-dual-server.mjs ../my-server --name my-server --port 7100 --install
```

| 参数 | 说明 |
| --- | --- |
| `[directory]` | 目标目录，默认 `dual-server-app`；支持在空目录中使用 `.` |
| `--name <name>` | 项目包名及初始 Windows 服务名，默认根据目录名生成 |
| `--port <port>` | 默认 HTTP 端口，默认 `7001`，范围 `1–65535` |
| `--install` | 创建完成后执行 `npm install` |
| `--yes` / `-y` | 使用默认值；CLI 本身已是非交互模式 |
| `--help` / `-h` | 查看帮助 |
| `--version` / `-v` | 查看版本 |

目标目录必须不存在或为空。项目名仅接受字母开头的小写字母、数字和连字符，长度为 1–64 个字符。默认只生成文件，不自动安装依赖。

## 项目配置

### 应用与数据库

应用配置位于 `src/config/config.default.ts`，用于设置 HTTP 服务、日志和 TypeORM 数据源。

| 配置行为 | 开发环境 | 生产环境 |
| --- | --- | --- |
| 数据库位置 | 项目根目录 `dev.sqlite` | 配置的数据目录下 `server.sqlite` |
| 表结构更新 | 自动同步实体定义 | 执行尚未应用的迁移 |
| 部署配置加载 | 不加载生产 `server.json` | 启动前加载指定的 `server.json` |

实体位于 `src/entity/`，迁移位于 `src/migration/`。修改实体后，应添加新的 TypeORM migration，并加入应用配置的 `migrations` 数组。生产环境关闭 `synchronize`，同时启用 `migrationsRun` 和 `allowExecuteMigrations`；已发布的迁移保持不变。

### 生产部署配置

Windows 发布包的配置文件位于 `config/server.json`：

```json
{
  "dataDir": "../data",
  "logDir": "../logs",
  "httpPort": 7001,
  "cookieKeys": "替换为独立随机密钥"
}
```

Windows 打包时会自动生成随机 `cookieKeys`，无需手动填写。自行部署源码时，可以使用以下命令生成密钥：

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

| JSON 配置项 | 环境变量 | 说明 |
| --- | --- | --- |
| `dataDir` | `SERVER_DATA_DIR` | 生产数据目录，必须提供 |
| `logDir` | `SERVER_LOG_DIR` | 应用日志目录，默认使用数据目录同级的 `logs/` |
| `httpPort` | `SERVER_HTTP_PORT` | HTTP 端口，默认使用创建项目时指定的端口 |
| `cookieKeys` | `COOKIE_KEYS` | Cookie 签名密钥，生产环境必须提供 |

配置优先级为 **环境变量 → JSON 配置 → 默认值**。JSON 内的相对目录以配置文件所在目录为基准；通过环境变量指定目录时必须使用绝对路径。

`SERVER_CONFIG_FILE` 用于指定配置文件的绝对路径。Windows 启动脚本会自动设置该变量和 `NODE_ENV=production`；手动从源码启动生产服务时需自行设置，例如在 Linux/macOS shell 中：

```sh
npm run build
SERVER_CONFIG_FILE=/srv/my-server/config/server.json npm start
```

运行前需在指定位置创建配置文件，填入数据目录和实际密钥。

## 开发与使用

以下命令均在**生成的项目目录**执行：

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动开发服务，监听代码变更 |
| `npm run check` | TypeScript 类型检查 |
| `npm run build` | 编译到 `dist/` |
| `npm start` | 启动编译后的服务，默认使用生产环境，需要生产配置 |
| `npm test` | 验证部署配置解析与校验 |
| `npm run test:production` | 编译并验证生产迁移、持久化和 HTTP 接口 |
| `npm run build:winserver` | 构建 Windows 发布包 |

模板包含一组 Note 示例接口，展示控制器、服务与数据库的完整调用过程：

| 接口 | 用途 |
| --- | --- |
| `GET /` | 查看项目信息 |
| `GET /health` | 检查服务与数据库连接 |
| `GET /api/notes` | 查询最近 100 条记录 |
| `POST /api/notes` | 使用 JSON `{"content":"hello"}` 创建记录 |

示例接口未配置认证，接入业务时可按需添加认证与权限。生产冒烟测试使用临时数据库，不读写开发库或实际部署数据。

## Windows 打包与部署

### 1. 准备构建环境

在 Windows x64 构建机上进入生成的项目，执行 `npm ci`。从 [WinSW v2.12.0 发布页](https://github.com/winsw/winsw/releases/tag/v2.12.0) 下载 `WinSW-x64.exe`，放入项目的 `scripts/` 目录；也可以通过 `WINSW_EXE` 环境变量指定本地文件路径。

better-sqlite3 是原生模块，必须与操作系统、架构和 Node ABI 匹配，因此 Windows 包需要在 Windows 上构建。脚本会安装 Windows 生产依赖，并捆绑构建时使用的 Node 运行时。

### 2. 一键打包

```sh
npm run build:winserver
```

构建会编译应用、安装生产依赖、执行生产冒烟测试并生成 ZIP：

```text
release/winserver/<build-id>/my-server.zip
```

每次构建创建独立目录。解压后的结构如下：

```text
my-server/
├── app/                    编译代码与生产依赖
├── runtime/node.exe        Node.js 运行时
├── config/server.json      部署配置
├── data/                   首次启动时创建数据库
├── logs/                   应用与服务日志
├── service.exe             WinSW
├── service.xml             Windows 服务定义
├── start.cmd               前台启动
├── install-service.cmd     注册并启动服务
└── uninstall-service.cmd   停止并注销服务
```

### 3. 部署与启动

1. 将 ZIP 解压到固定目录，例如 `D:\my-server`。
2. 按需修改 `config/server.json` 中的端口和目录。
3. 运行 `start.cmd`，通过 `/health` 确认服务正常。
4. 结束前台进程后，以管理员身份运行 `install-service.cmd`，注册为开机自动启动的 Windows 服务。

不要同时运行前台进程与服务实例。在管理员终端中进入部署目录，可管理服务：

```bat
service.exe status
service.exe stop
service.exe start
service.exe restart
```

### 4. 更新与卸载

更新前停止服务，备份 `config/` 和整个 `data/`。将新包的 `app/` 与 `runtime/` 成套替换，保留原配置、数据、日志和服务定义，再启动服务并检查 `/health`。数据库迁移会自动执行；回滚时需恢复匹配的程序和数据库备份。

不要用新包的随机密钥覆盖原有 `cookieKeys`。运行 `uninstall-service.cmd` 只注销服务，配置和数据会保留。

更多操作细节见生成项目中的 `deploy/windows/README.md`，也可查看本仓库的 [Windows 部署说明模板](templates/midway-sqlite/deploy/windows/README.md)。

## 脚手架开发

维护脚手架本身时，在**本仓库目录**执行：

```sh
npm test
npm run check
npm run test:integration
npm run pack:check
```

集成测试从实际 npm 安装包生成项目，验证依赖安装、类型检查、编译、数据库迁移、持久化和仅生产依赖下的 HTTP 启动。Windows 上提供 `WINSW_EXE` 时，还会执行完整 ZIP 构建。
