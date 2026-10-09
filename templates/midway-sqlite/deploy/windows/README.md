# __APP_NAME__ Windows 部署

```text
__APP_NAME__/
  app/                    编译代码、bootstrap.js、deployment.cjs、生产依赖
  runtime/node.exe         构建时使用的 Node
  config/server.json       部署配置与随机 cookie 签名密钥
  data/                   首次启动创建 server.sqlite
  logs/                   应用和 WinSW 日志
  service.exe             WinSW v2
  service.xml             Windows 服务定义
  start.cmd               前台启动
  install-service.cmd     注册并启动服务
  uninstall-service.cmd   停止并注销服务，保留数据
```

## 首次部署

1. 解压到固定目录，例如 `D:\__APP_NAME__`，不能在 ZIP 内运行。
2. 编辑 `config/server.json`。`dataDir` 默认为 `../data`，`logDir` 为 `../logs`，HTTP 端口为 __HTTP_PORT__。相对路径以 JSON 所在目录为基准。
3. 运行 `start.cmd`，访问 `http://localhost:__HTTP_PORT__/health`，应返回 `{"status":"ok"}`。
4. 结束前台进程后，以管理员身份运行 `install-service.cmd`。不要同时运行前台与服务实例。

目标机器无需安装 Node、npm、Python 或编译工具。支持的 Windows 版本取决于捆绑的 Node 和 WinSW；WinSW 自身的 .NET 运行环境要求参见其发行说明。本模板使用 HTTP 入口。

首次启动自动执行迁移创建空库。包中不含开发数据库。复制同一发布包部署多个实例时，可为各实例重新生成 `cookieKeys`；同一主机多个服务需修改 `service.xml` 中 id/name、HTTP 端口并使用独立目录。

## 服务管理

在管理员终端进入部署目录：

```bat
service.exe status
service.exe stop
service.exe start
service.exe restart
```

服务开机自动启动，异常退出后等待 10 秒重启。注册成功不代表 HTTP 就绪，用 `/health` 和日志确认。服务账户必须能写入 data/logs，读取 app/runtime/config。WinSW 输出固定写入部署目录 logs；`logDir` 控制应用日志。

## 更新与卸载

1. 停止服务，备份 `config/` 和整个 `data/`（包括 SQLite 辅助文件）。
2. 使用新包的 `app/` 和 `runtime/` 成套替换旧版本；二者必须匹配。
3. 保留原有 `config/`、`data/`、`logs/` 和服务定义。不要用新包覆盖旧密钥。
4. 启动服务并检查 `/health`，尚未执行的迁移会自动运行。回滚恢复匹配的程序和数据库备份。

`uninstall-service.cmd` 只注销服务，保留数据。移动安装目录之前先卸载服务，移动后再注册。

环境变量覆盖 JSON：`SERVER_DATA_DIR`、`SERVER_LOG_DIR`（绝对路径）、`SERVER_HTTP_PORT`、`COOKIE_KEYS`。启动脚本设置 production 和绝对路径 `SERVER_CONFIG_FILE`。

## 构建前提

在 Windows x64、Node 22/24 上使用 npm 安装依赖并保存锁文件。手动准备 [WinSW v2.12.0 的 WinSW-x64.exe](https://github.com/winsw/winsw/releases/tag/v2.12.0)，放入源码 `scripts/` 或设置 `WINSW_EXE` 后运行 `npm run build:winserver`。脚本不会自动下载 WinSW，仅检查本地文件；来源和版本由构建者确认。
