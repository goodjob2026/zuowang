# 《坐忘》服务端 · 接手说明

《坐忘》是轻聊小游戏，平台码 `zuowang`。页面由轻聊平台托管（`https://zuowang.mg.superstringtech.com`），
这里是游戏自己的后端：一个 Node 进程 + 一个 SQLite 文件，几十人同时玩足够。

## 要您做的三件事

1. 把它跑起来（下面两种办法任选），前面挂一层 **https**（页面是 https，后端也必须是 https）。
2. 把后台「我的游戏 → zuowang」详情里的**会话公钥**配进环境变量 `MG_PUBLIC_KEYS`（列出几把配几把）。
3. 把后端的 **https 网址**告诉我们（例如 `https://zuowang-api.example.com`），我们把它打进页面再上传。

## 环境变量

| 名字 | 必填 | 说明 |
|---|---|---|
| `NODE_ENV` | 是 | 写 `production`（Docker 镜像里已经写好）。写了以后：没配公钥、或者带了开发测试用的开关，一律拒绝启动 |
| `MG_PUBLIC_KEYS` | 是 | 会话公钥，JSON：`{"zuowang.1":"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n"}`。公钥不是秘密。平台通知作废某一把时，把它删掉重启 |
| `PORT` | 否 | 监听端口，默认 `8787` |
| `DB_PATH` | 否 | 存档文件的位置，默认 `./zuowang.db`（Docker 镜像里默认 `/data/zuowang.db`）。**这个文件就是全部玩家的存档，所在目录要挂持久盘** |
| `MG_PF_CODE` | 否 | 平台码，默认 `zuowang` |
| `CORS_ORIGIN` | 否 | 允许跨域的页面来源，默认 `https://zuowang.mg.superstringtech.com`，一般不用改 |

不要设 `DEV_LOGIN`、`TEST_MODE`、`BOTS`、`PAY_OPEN`（开发、测试用的；充值眼下封着）。前两项和 `NODE_ENV=production` 一起出现时服务会直接拒绝启动，并在日志里说明原因。

配置写错（公钥格式不对、`CORS_ORIGIN` 带了斜杠或路径等）同样是**拒绝启动并打印一行 `Error: …`**，不会带着错的配置跑起来。

## 办法一：Docker

```bash
docker build -f deploy/Dockerfile -t zuowang-server .
docker run -d --name zuowang --restart unless-stopped \
  -p 8787:8787 -v zuowang-data:/data \
  -e MG_PUBLIC_KEYS='{"zuowang.1":"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n"}' \
  zuowang-server
```

容器里用的是非 root 用户（`node`，uid 1000）。上面用的是 Docker 的命名卷，权限自动就对；要是改成挂宿主机目录（`-v /srv/zuowang-data:/data`），先 `chown 1000:1000 /srv/zuowang-data`。

## 办法二：直接用 Node（要 Node 24 以上，不用编译）

```bash
npm install --omit=dev
NODE_ENV=production DB_PATH=/srv/zuowang-data/zuowang.db \
MG_PUBLIC_KEYS='{"zuowang.1":"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n"}' \
node --disable-warning=ExperimentalWarning packages/server/src/main.ts
```

## 怎么算跑起来了

- `curl https://<后端网址>/api/health` 返回 `{"ok":true,"now":...}`；
- 启动日志里没有 `Error:`（没配公钥会打印一行 `Error: 没有配 MG_PUBLIC_KEYS…` 然后退出）。

## 反向代理要注意的

- 只转发就行，**不要**在代理上另加 `Access-Control-*` 头（后端自己带了，重复会让浏览器拒绝）；
- 要放行 `OPTIONS` 请求，要透传 `Authorization`、`Idempotency-Key` 这两个请求头；
- 建议在代理上加请求频率限制（例如每个 IP 每秒 20 次）和请求体大小上限（后端自己限的是 64KB）；
- 服务器要在国内网络下打得开（玩家在轻聊手机 App 里直连它）。

## 数据和备份

- 只有一个进程在写这个存档文件，**不要起多个副本**（不能横向扩成多实例）；
- 进程自己每天把存档备份到 `DB_PATH` 旁边的 `backups/`，留最近 14 份；最好再把整个数据目录做一份异地备份；
- 升级：换新包重启即可，存档格式向后兼容；重启会让玩家的会话失效，页面会自动重新登录，玩家无感；
- 平台通知「某把会话公钥紧急作废」时：从 `MG_PUBLIC_KEYS` 里删掉那一把、加上后台新列出的，重启。重启后用旧钥匙登录的会话全部作废。

## 以后怎么更新

- 我们改了服务端，会往这个仓库的 `main` 推新的提交，并打一个版本标签（`v1.0`、`v1.1`……），同时在下面「版本记录」里写一行改了什么、要不要动配置。
- 您这边：`git pull`（或检出新标签）→ 重新构建镜像 / 重启进程。存档格式向后兼容，不用迁移；重启时玩家会自动重新登录。
- 只改画面的更新不经过这里（页面由我们直接传到轻聊平台），不用您动。

## 版本记录

| 版本 | 日期 | 改了什么 | 部署要注意 |
|---|---|---|---|
| v1.0 | 2026-11-26 | 首个版本：按轻聊会话凭证认人、签到、善人榜恶人榜 | 首次部署，照本文做 |

## 这个后端做什么、不做什么

- 认人：页面带来轻聊的会话凭证（`mg.getToken()`），后端用上面的公钥验签名、平台码、有效期，玩家编号用凭证里的 `sub`；
- 不调用轻聊平台的任何接口，不需要 key_id / secret，不收钱。
