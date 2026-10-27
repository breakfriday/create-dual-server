# PostgreSQL 应用的 Windows 服务部署

此包仅包含应用和 Node.js/WinSW，不包含 PostgreSQL。先在外部部署数据库，并给服务运行账户配置 PGHOST、PGPORT、PGUSER、PGDATABASE、PGPASSWORD 环境变量。修改环境变量后重新启动服务，确保服务进程能读取。

编辑 config/server.json，设置 uploadDir、logDir、httpPort、cookieKeys；相对路径以配置文件目录为基准。默认上传目录为 data/uploads。应用账户需能写入上传和日志目录。

先运行 start.cmd 验证 /health 和 /api/notes，再以管理员身份执行 install-service.cmd。uninstall-service.cmd 卸载服务但保留数据。

生产启动执行 PostgreSQL 迁移，不自动同步表结构。升级前备份数据库、上传目录和配置；保留 cookieKeys 和数据库连接信息。构建时仅检查 PostgreSQL 驱动及配置，实际连接在部署后验证。
