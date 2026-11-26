# 部署

本仓库只有服务端（接口），页面由 IM 平台托管。服务端怎么配、各环境变量什么意思见 [README.md](README.md)；
这里记的是我们自己的部署方式：通用部署脚本 `scripts/deploy.sh` + `deploy.conf`。

## 环境

| 环境 | 地址 | 容器端口 | 部署目录 | 数据 |
| --- | --- | --- | --- | --- |
| 测试 | `http://<测试服>:8187`（容器直连，只写进配置，还没部署过） | 0.0.0.0:8187 | `~/zuowang` | 卷 `zuowang-data` |
| 生产 | `https://<服务端域名>` → CDN → 共享 nginx :80 → 容器 | 127.0.0.1:8905 | `/data/minigame/zuowang` | 卷 `zuowang-data` |

- 容器里监听 8080（compose 里 `PORT=8080` 覆盖镜像默认的 8787），健康检查 `GET /api/health`
- 认人只靠 IM 平台会话公钥（`MG_PUBLIC_KEYS`），不需要 IM 平台密钥（`USE_QINGLIAO_KEYS=0`）
- 必填：`MG_PUBLIC_KEYS`、`CORS_ORIGIN`。`CORS_ORIGIN` 不能留空串：服务端看到这个变量就不用默认值，空串直接拒绝启动
- 存档是 `/data/zuowang.db`（SQLite）。服务端每天自己备份到卷里的 `/data/backups/zuowang-<日期>.db`（留 14 份）；
  部署前 `hook_backup` 再做一次 `VACUUM INTO`，挪到服务器数据盘 `/data/backups/zuowang/`（留 10 份）
- 只能跑一个实例（单进程写 SQLite）

## 分支

`main` 开发（服务端交付方也往 `main` 推新版本），`release` 发布。生产只从 `release` 发，并且要已推送。

## 首次准备（部署机）

```bash
cp deploy.local.conf.example deploy.local.conf      # 填服务器地址、私钥路径
cp .env.prod.example .env.prod && chmod 600 .env.prod  # 填服务端域名、会话公钥、游戏站点
```

## 常用命令

```bash
git switch release && git merge --ff-only main && git push origin release
./scripts/deploy.sh prod -n            # 只检查
./scripts/deploy.sh prod -t v1.0.0     # 部署
./scripts/deploy.sh prod -r <标签>     # 回滚；改了 .env.prod（比如换公钥）只重建容器也用它，标签写当前的
```

会话公钥作废 / 轮换：在 `.env.prod` 的 `MG_PUBLIC_KEYS` 里删掉作废的、加上后台新列出的，`./scripts/deploy.sh prod -r <当前标签>`。

## 注意

- `Dockerfile`（根目录）是 `deploy/Dockerfile` 的副本，部署脚本只认根目录这份。交付方改了 `deploy/Dockerfile` 要照着同步
- nginx 片段 `nginx-zuowang.conf` 不加 `Access-Control-*` 头（服务端自己带，重复了浏览器会拒绝）；请求体上限 64k 和服务端一致
- 交付方没有带测试，`TEST_CMD` 留空
