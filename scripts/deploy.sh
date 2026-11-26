#!/usr/bin/env bash
#
# 部署 IM 平台小游戏：本地构建镜像 → docker save | ssh | docker load → 备份数据
# → 生成服务器 .env、同步 compose（prod 另渲染 nginx 配置）→ up -d → 验收 → 清理旧镜像。
# prod 的 nginx 两种模式（deploy.conf 的 PROD_NGINX_MODE）：
#   shared   系统 nginx 监听 80，各游戏一个 server 块片段在 /etc/nginx/conf.d/<项目>.conf，按 server_name 分流
#   instance 每个游戏一个独立实例（完整主配置，-p ~/<项目>），监听 PROD_NGINX_PORT；老生产服的做法，不设时默认
# test 默认容器直连、无 nginx；deploy.conf 写 TEST_NGINX_MODE=shared 时测试服也走共享系统 nginx :80（前面挂 CDN），
# 片段按 TEST_ROOT_DOMAIN 渲染，容器端口仍对外发布在 0.0.0.0:TEST_PORT（直连照常可用）。
# 镜像不经过仓库，服务器上不构建；工作区干净时只用已提交的文件构建（git archive）。
# 分支约定：main 开发、test 从哪个分支都能发；prod 只从 deploy.conf 的 PROD_BRANCH（release）发，且必须已推送。
#
#   ./scripts/deploy.sh test
#   ./scripts/deploy.sh prod -t v1.0.0
#   ./scripts/deploy.sh prod -r 0d58269     # 回滚：用服务器上已有的旧镜像
#
# 项目参数（镜像名、服务器、端口、默认私钥）在 deploy.conf，进仓库。
# 密钥和 IM 平台地址只在部署机上：shell 环境变量优先，其次是 .env.<环境>（模板 .env.<环境>.example）。
# 服务器上的 ~/<PROJECT>/.env 每次部署由脚本生成，不要手改。见 DEPLOY.md。
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
# 下面几个开关只认 deploy.conf（及它 source 的 deploy.local.conf）：老项目不写它们，shell 里残留的同名变量不能漏进来
unset USE_QINGLIAO_KEYS ROOT_DOMAIN TEST_NGINX_MODE TEST_ROOT_DOMAIN PROD_REMOTE_BASE
# shellcheck source=../deploy.conf
. "$ROOT/deploy.conf"
CONTAINER=$PROJECT-$SERVICE-1
PROD_NGINX_MODE=${PROD_NGINX_MODE:-instance}
case "$PROD_NGINX_MODE" in shared) PROD_NGINX_PORT=80 ;; instance) ;; *) echo "deploy.conf 的 PROD_NGINX_MODE 只能是 shared 或 instance: $PROD_NGINX_MODE" >&2; exit 1 ;; esac
# 生产服上的部署目录：deploy.conf 写了 PROD_REMOTE_BASE（绝对路径，新项目是数据盘 /data/minigame）就是 $PROD_REMOTE_BASE/$PROJECT；
# 没写就是 ~/$PROJECT，老项目照旧。测试服没有数据盘，一律 ~/$PROJECT。下面选环境时定 REMOTE_DIR / REMOTE_PATH
PROD_REMOTE_BASE=${PROD_REMOTE_BASE-}
if [ -n "$PROD_REMOTE_BASE" ]; then
	[[ $PROD_REMOTE_BASE =~ ^(/[A-Za-z0-9._-]+)+$ ]] || { echo "deploy.conf 的 PROD_REMOTE_BASE 要是绝对路径，只能有字母、数字、. _ -，结尾不带 /: $PROD_REMOTE_BASE" >&2; exit 1; }
	[ "$PROD_NGINX_MODE" = shared ] || { echo "PROD_REMOTE_BASE 只支持 PROD_NGINX_MODE=shared（instance 模式的 nginx 实例按 ~/$PROJECT 起，不迁）" >&2; exit 1; }
fi
# 可选开关（不写就是老行为）：
#   USE_QINGLIAO_KEYS=0  服务端不走 IM 平台登录：QINGLIAO_* 不进服务器 .env，也不要求 QINGLIAO_SECRET
#   ROOT_DOMAIN=<域名>    片段里的 __ROOT_DOMAIN__ 换成它、__ROOT_DOMAIN_RE__ 换成点转义的正则写法；
#                         prod 检查服务器时 api.<域名>、admin.<域名> 也不能出现在别的片段的 server_name 里
#   TEST_NGINX_MODE=shared  测试服也装 nginx 片段（共享系统 nginx :80），见文件开头
#   TEST_ROOT_DOMAIN=<域名>  test 用的根域名，作用同 ROOT_DOMAIN（下面选环境时 test 的 ROOT_DOMAIN 换成它）
USE_QINGLIAO_KEYS=${USE_QINGLIAO_KEYS:-1}
case "$USE_QINGLIAO_KEYS" in 0 | 1) ;; *) echo "deploy.conf 的 USE_QINGLIAO_KEYS 只能是 0 或 1: $USE_QINGLIAO_KEYS" >&2; exit 1 ;; esac
ROOT_DOMAIN=${ROOT_DOMAIN-}
TEST_NGINX_MODE=${TEST_NGINX_MODE-}
case "$TEST_NGINX_MODE" in "" | shared) ;; *) echo "deploy.conf 的 TEST_NGINX_MODE 只能是 shared 或留空: $TEST_NGINX_MODE" >&2; exit 1 ;; esac
TEST_ROOT_DOMAIN=${TEST_ROOT_DOMAIN-}

# 部署配置里认的键：前几个原样写进服务器 .env 给容器用，DEPLOY_* 只给本脚本用
if [ "$USE_QINGLIAO_KEYS" = 1 ]; then
	APP_KEYS="QINGLIAO_PF_CODE QINGLIAO_SECRET QINGLIAO_LOGIN_API QINGLIAO_RES_BASE QINGLIAO_AVATAR_HOSTS PUBLIC_ORIGIN${EXTRA_APP_KEYS:+ $EXTRA_APP_KEYS}"
else
	APP_KEYS="PUBLIC_ORIGIN${EXTRA_APP_KEYS:+ $EXTRA_APP_KEYS}"
fi
CONFIG_KEYS="$APP_KEYS DEPLOY_HOST DEPLOY_SSH_KEY"

usage() {
	cat <<EOF
用法: scripts/deploy.sh <环境> [选项]

环境:
$(if [ "$TEST_NGINX_MODE" = shared ]; then
	printf '  test   %-16s https://<CDN 域名> → nginx:80（shared）→ 0.0.0.0:%s（直连也可用）' "$TEST_HOST" "$TEST_PORT"
else
	printf '  test   %-16s http://%s:%s 容器直连，无 nginx' "$TEST_HOST" "$TEST_HOST" "$TEST_PORT"
fi)
$(printf '  prod   %-16s https://<CDN 域名> → nginx:%s（%s）→ 127.0.0.1:%s' "$PROD_HOST" "$PROD_NGINX_PORT" "$PROD_NGINX_MODE" "$PROD_APP_PORT")${PROD_BRANCH:+
         只从 ${PROD_BRANCH} 分支发，并且要和 origin/${PROD_BRANCH} 一致}

选项:
  -e <文件>   部署配置文件，默认 .env.<环境>；同名环境变量优先于文件
  -t <标签>   镜像标签，默认当前 HEAD 短 SHA
  -r <标签>   回滚：不构建不传输，直接用服务器上已有的这个标签的镜像
  -k <私钥>   覆盖 SSH 私钥（也可用 DEPLOY_SSH_KEY）
  -y          跳过确认
  -n          只检查配置、连通性和服务器，不构建不部署
  -h          显示本帮助

配置项（环境变量或配置文件）:
  QINGLIAO_SECRET        必填，IM 平台后台里 $PF_CODE 平台的通讯密钥
  QINGLIAO_LOGIN_API     IM平台登录服务地址
  QINGLIAO_RES_BASE      头像相对路径前缀
  QINGLIAO_AVATAR_HOSTS  头像额外放行的域名，逗号分隔
  QINGLIAO_PF_CODE       默认 $PF_CODE
  PUBLIC_ORIGIN          prod 必填，CDN 的 https 地址；test 默认 http://<IP>:<端口>（TEST_NGINX_MODE=shared 时同 prod，必填）
  DEPLOY_HOST            覆盖服务器地址（默认见上）
  DEPLOY_SSH_KEY         SSH 私钥，默认 test $TEST_SSH_KEY / prod $PROD_SSH_KEY
$(for k in ${EXTRA_APP_KEYS-}; do printf '  %-22s 项目自己的配置（deploy.conf 的 EXTRA_APP_KEYS）%s\n' "$k" "$([ "$k" = "${DEBUG_KEY-}" ] && echo '，只允许 test')"; done)
EOF
}

die() { printf '\033[31m错误: %s\033[0m\n' "$1" >&2; exit 1; }
warn() { printf '\033[33m! %s\033[0m\n' "$1" >&2; }
step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
has_word() { case " $1 " in *" $2 "*) return 0 ;; esac; return 1; }

[ $# -ge 1 ] || { usage; exit 1; }
case "$1" in -h | --help) usage; exit 0 ;; esac
ENV_NAME=$1
shift

# BIND_IP / APP_PORT 是容器发布到宿主机的地址；prod 的两个端口由脚本渲染进 nginx 配置，只在 deploy.conf 改。
# NGINX_MODE 是本次部署的 nginx 模式（test 不用 nginx 时不起作用）；ROOT_DOMAIN 换成本环境的根域名，钩子里也按它用
NGINX_MODE=$PROD_NGINX_MODE
case "$ENV_NAME" in
test)
	DEFAULT_HOST=$TEST_HOST; DEFAULT_KEY=$TEST_SSH_KEY
	BIND_IP=0.0.0.0; APP_PORT=$TEST_PORT; ROOT_DOMAIN=$TEST_ROOT_DOMAIN; ROOT_DOMAIN_KEY=TEST_ROOT_DOMAIN
	if [ "$TEST_NGINX_MODE" = shared ]; then USE_NGINX=1; NGINX_MODE=shared; NGINX_PORT=80; else USE_NGINX=0; fi
	;;
prod)
	DEFAULT_HOST=$PROD_HOST; DEFAULT_KEY=$PROD_SSH_KEY; ROOT_DOMAIN_KEY=ROOT_DOMAIN
	USE_NGINX=1; BIND_IP=127.0.0.1; APP_PORT=$PROD_APP_PORT; NGINX_PORT=$PROD_NGINX_PORT
	;;
*) usage; die "未知环境: $ENV_NAME" ;;
esac
# 本次部署的目录。REMOTE_BASE 是后加的（老项目加上 PROD_REMOTE_BASE）时，第一次部署会把 ~/$PROJECT 整个迁过去（见「迁移部署目录」）。
#   REMOTE_DIR   传给服务器脚本的写法：绝对路径，或 home 下的目录名（脚本里拼成 ~/$dir）
#   REMOTE_PATH  拼进服务器命令行的写法：绝对路径，或 ~/<项目>（由服务器上的 shell 展开）
REMOTE_BASE=
[ "$ENV_NAME" != prod ] || REMOTE_BASE=$PROD_REMOTE_BASE
#   DEPLOY_DIR   绝对路径，渲染进 nginx 片段的 __DEPLOY_DIR__（片段要读宿主机目录时用）
if [ -n "$REMOTE_BASE" ]; then
	REMOTE_DIR=$REMOTE_BASE/$PROJECT
	REMOTE_PATH=$REMOTE_DIR
	DEPLOY_DIR=$REMOTE_DIR
else
	REMOTE_DIR=$PROJECT
	REMOTE_PATH="~/$PROJECT"
	DEPLOY_DIR=/home/$SSH_USER/$PROJECT
fi

ENV_FILE=
TAG=
KEY_OPT=
ROLLBACK=0
ASSUME_YES=0
CHECK_ONLY=0
while getopts 'e:t:r:k:ynh' opt; do
	case "$opt" in
	e) ENV_FILE=$OPTARG ;;
	t) TAG=$OPTARG ;;
	r) TAG=$OPTARG; ROLLBACK=1 ;;
	k) KEY_OPT=$OPTARG ;;
	y) ASSUME_YES=1 ;;
	n) CHECK_ONLY=1 ;;
	h) usage; exit 0 ;;
	*) usage; exit 1 ;;
	esac
done

# -e 给的相对路径按调用时的目录算，下面 cd 之前先转成绝对路径
[ -z "$ENV_FILE" ] || case "$ENV_FILE" in /*) ;; *) ENV_FILE=$PWD/$ENV_FILE ;; esac
cd "$ROOT"
[ -n "$ENV_FILE" ] || ENV_FILE=$PWD/.env.$ENV_NAME

# ---- 读部署配置 ----
# 只按 KEY=VALUE 解析、不执行文件内容；已在环境里设置的键不被文件覆盖。
# 记下每个键的来源，打印摘要时只说来源、不打印值。
SOURCES=
CONFLICTS=
for k in $CONFIG_KEYS; do
	if [ -n "${!k+x}" ]; then SOURCES="$SOURCES $k=环境变量"; fi
done
if [ -f "$ENV_FILE" ]; then
	lineno=0
	while IFS= read -r line || [ -n "$line" ]; do
		lineno=$((lineno + 1))
		line=${line%$'\r'}
		line=${line#"${line%%[![:space:]]*}"}
		case "$line" in '' | '#'*) continue ;; esac
		line=${line#export }
		k=${line%%=*}
		v=${line#*=}
		[ "$k" != "$line" ] && [[ $k =~ ^[A-Z_][A-Z0-9_]*$ ]] || die "$ENV_FILE 第 $lineno 行看不懂（要 KEY=VALUE）"
		has_word "$CONFIG_KEYS" "$k" || { warn "$ENV_FILE 第 $lineno 行：不认识的键 ${k}，忽略"; continue; }
		case "$v" in \"*\" | \'*\') v=${v:1:${#v}-2} ;; esac
		if [ -z "${!k+x}" ]; then
			printf -v "$k" '%s' "$v"
			SOURCES="$SOURCES $k=${ENV_FILE##*/}"
		elif [ "${!k}" != "$v" ] && [ "${!k}" != "$HOME/${v#\~/}" ]; then   # 文件里写 ~/x、环境变量里是展开后的路径，算同一个
			CONFLICTS="$CONFLICTS $k"
		fi
	done <"$ENV_FILE"
elif [ "$USE_QINGLIAO_KEYS" = 0 ]; then
	die "找不到部署配置 ${ENV_FILE}。先 cp .env.$ENV_NAME.example .env.$ENV_NAME 再填"
elif [ -z "${QINGLIAO_SECRET+x}" ]; then
	die "找不到部署配置 ${ENV_FILE}，也没有 QINGLIAO_SECRET 环境变量。先 cp .env.$ENV_NAME.example .env.$ENV_NAME 再填"
fi
source_of() { local s; for s in $SOURCES; do [ "${s%%=*}" = "$1" ] && { echo "${s#*=}"; return; }; done; echo 默认; }

# shell 里残留的变量（比如测 test 时 export 的密钥、DEPLOY_HOST）会悄悄盖掉文件里的值：生产直接拒绝，测试服提醒
if [ -n "$CONFLICTS" ]; then
	msg="这些配置环境变量和 ${ENV_FILE##*/} 里的不一样，用的是环境变量：$CONFLICTS"
	[ "$ENV_NAME" = prod ] && die "${msg}。生产以文件为准，先 unset 再部署"
	warn "$msg"
fi

HOST=${DEPLOY_HOST:-$DEFAULT_HOST}
# 环境和机器绑死：test 的配置（调试登录、0.0.0.0 端口、test 密钥）不能落到生产机上，反过来也一样。
# 服务器上还有 $REMOTE_PATH/.deploy-env 标记，下面检查服务器时核对
case "$ENV_NAME:$HOST" in
test:"$PROD_HOST") die "test 不能部署到生产机 ${HOST}（DEPLOY_HOST 来源: $(source_of DEPLOY_HOST)）" ;;
prod:"$TEST_HOST") die "prod 不能部署到测试机 ${HOST}（DEPLOY_HOST 来源: $(source_of DEPLOY_HOST)）" ;;
esac
KEY=${KEY_OPT:-${DEPLOY_SSH_KEY:-$DEFAULT_KEY}}
[[ $KEY == \~/* ]] && KEY=$HOME/${KEY:2}   # 配置文件里写的 ~/ 不会被 shell 展开
[ "$USE_QINGLIAO_KEYS" = 0 ] || QINGLIAO_PF_CODE=${QINGLIAO_PF_CODE:-$PF_CODE}
if [ "$USE_NGINX" = 0 ]; then
	PUBLIC_ORIGIN=${PUBLIC_ORIGIN:-http://$HOST:$APP_PORT}
fi
PUBLIC_ORIGIN=${PUBLIC_ORIGIN%/}
DEBUG_VAL=
[ -z "${DEBUG_KEY-}" ] || DEBUG_VAL=${!DEBUG_KEY-}

# ---- 校验 ----
for k in $APP_KEYS; do
	case "${!k-}" in
	*"'"* | *$'\n'*) die "$k 不能含单引号或换行" ;;
	*'<'*'>'*) die "$k 还是 <占位符>（$(source_of "$k")），填上真实的值" ;;
	esac
done
for k in ${REQUIRED_KEYS-}; do
	has_word "$APP_KEYS" "$k" || die "deploy.conf 的 REQUIRED_KEYS 里的 $k 不在 EXTRA_APP_KEYS 里"
	[ -n "${!k-}" ] || die "$k 必填（deploy.conf 的 REQUIRED_KEYS），现在为空（$(source_of "$k")）"
done
if [ "$USE_QINGLIAO_KEYS" = 1 ]; then
	case "${QINGLIAO_SECRET-}" in "" | "<"*) die "QINGLIAO_SECRET 为空或仍是占位符（$(source_of QINGLIAO_SECRET)），登录接口会 501" ;; esac
	[ "${#QINGLIAO_SECRET}" -ge 16 ] || warn "QINGLIAO_SECRET 只有 ${#QINGLIAO_SECRET} 位，太短"
	[ -n "${QINGLIAO_LOGIN_API-}" ] || warn "没配 QINGLIAO_LOGIN_API：昵称用回退值、好友榜为空"
	[ -n "${QINGLIAO_RES_BASE-}" ] || warn "没配 QINGLIAO_RES_BASE：头像都是首字占位"
fi
# 只许合法域名（每段字母数字开头结尾、中间可有横线，至少两段）：渲染片段时它进 sed 的替换串，& / \ 会被 sed 解释
DOMAIN_LABEL='[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?'
DOMAIN_RE="^$DOMAIN_LABEL(\.$DOMAIN_LABEL)+\$"
[ -z "$ROOT_DOMAIN" ] || [[ $ROOT_DOMAIN =~ $DOMAIN_RE ]] || die "deploy.conf 的 $ROOT_DOMAIN_KEY 只能是域名（字母、数字、点、横线，至少两段，不带协议和端口）: $ROOT_DOMAIN"
if [ -n "$DEBUG_VAL" ] && [ "${#DEBUG_VAL}" -lt 16 ]; then warn "$DEBUG_KEY 不足 16 位，调试登录不会开启"; fi
if [ "$USE_NGINX" = 1 ]; then
	case "$PUBLIC_ORIGIN" in https://*) ;; *) die "$ENV_NAME 的 PUBLIC_ORIGIN 必须是 CDN 的 https 地址（现在: ${PUBLIC_ORIGIN:-空}），否则所有 POST 都会 403" ;; esac
	PUBLIC_HOST=${PUBLIC_ORIGIN#https://}
	case "$PUBLIC_HOST" in "" | *[!A-Za-z0-9.-]*) die "PUBLIC_ORIGIN 只能是 https://<域名>，不带路径和端口: $PUBLIC_ORIGIN" ;; esac
	[ "$USE_QINGLIAO_KEYS" = 0 ] || case "${QINGLIAO_RES_BASE-}" in "" | https://*) ;; *) warn "$ENV_NAME 的 QINGLIAO_RES_BASE 应该是 https 地址（页面是 https，http 头像会被浏览器拦）" ;; esac
fi
if [ "$ENV_NAME" = prod ]; then
	[ -z "$DEBUG_VAL" ] || die "prod 不能配 ${DEBUG_KEY}（调试登录可冒充任何人），来源: $(source_of "$DEBUG_KEY")"
fi

# compose.yml 要和 deploy.conf 对得上，不然容器名、镜像、端口、健康检查要到服务器上才出错
COMPOSE_PROBLEMS=
compose_problem() { COMPOSE_PROBLEMS="$COMPOSE_PROBLEMS"$'\n'"  - $1"; }
[ -f compose.yml ] || die "没有 compose.yml"
grep -qE "^name: *$PROJECT *$" compose.yml || compose_problem "顶层要有 name: $PROJECT"
grep -qE "^  $SERVICE: *$" compose.yml || compose_problem "services 下的服务名要是 ${SERVICE}（容器名 ${CONTAINER}）"
grep -qF "image: $IMAGE:\${TAG" compose.yml || compose_problem "镜像要写成 image: $IMAGE:\${TAG:-latest}"
! grep -qE '^ +build:' compose.yml || compose_problem "不能有 build:（服务器上没有源码，镜像是从本机传过去的）"
{ grep -qF '${BIND_IP' compose.yml && grep -qF '${APP_PORT' compose.yml; } || compose_problem "端口要写成 \"\${BIND_IP:-127.0.0.1}:\${APP_PORT:-8080}:8080\""
{ grep -qE '^ +healthcheck:' compose.yml && grep -qF "$HEALTH_PATH" compose.yml; } || compose_problem "要有 healthcheck，并且请求 ${HEALTH_PATH}（部署时等它变 healthy）"
for k in $APP_KEYS; do
	grep -qF "\${$k" compose.yml || compose_problem "environment 里没有 ${k}，加一行 $k: \"\${$k:-}\""
done
[ -z "$COMPOSE_PROBLEMS" ] || die "compose.yml 和 deploy.conf 对不上：$COMPOSE_PROBLEMS"

# 工作区有未提交的改动（包括别人正在改、还没提交的）：生产不发；测试服照发，标签带 -dirty，不顶掉同一提交的干净镜像
DIRTY=0
if [ "$ROLLBACK" = 0 ] && [ -n "$(git status --porcelain -- .)" ]; then DIRTY=1; fi
if [ "$DIRTY" = 1 ] && [ "$ENV_NAME" = prod ]; then
	git status --short -- . >&2
	die "工作区有未提交的改动（见上）：生产只发已提交的代码。先提交，或 git stash -u 之后再部署"
fi
# 生产只从发布分支发（deploy.conf 的 PROD_BRANCH，一般是 release；没设就不查），并且要和远端一致：
# 线上跑的必须是大家在 origin 上看得到的那个提交。回滚用服务器上已有的镜像，不查
BRANCH=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)
if [ "$ENV_NAME" = prod ] && [ "$ROLLBACK" = 0 ] && [ -n "${PROD_BRANCH-}" ]; then
	[ "${BRANCH}" = "${PROD_BRANCH}" ] || die "生产只从 ${PROD_BRANCH} 分支发，现在在 ${BRANCH:-游离的 HEAD}。先把要发的提交合进 ${PROD_BRANCH}、推上去，再 git switch ${PROD_BRANCH}"
	if git rev-parse --verify --quiet "refs/remotes/origin/${PROD_BRANCH}" >/dev/null; then
		git fetch --quiet origin "${PROD_BRANCH}" 2>/dev/null || warn "git fetch origin ${PROD_BRANCH} 失败，按本地记录的远端比对"
		[ "$(git rev-parse HEAD)" = "$(git rev-parse "refs/remotes/origin/${PROD_BRANCH}")" ] ||
			die "本地 ${PROD_BRANCH} 和 origin/${PROD_BRANCH} 不在同一个提交：先 git push / git pull，生产只发已推送的提交"
	else
		warn "远端没有 origin/${PROD_BRANCH}，没法核对这个提交是否已推送"
	fi
fi
# 别写成 TAG=$(…)$([ … ] && echo -dirty)：工作区干净时那条赋值的退出码是 1，set -e 会让脚本一声不吭地退出
if [ -z "$TAG" ]; then
	TAG=$(git rev-parse --short HEAD)
	[ "$DIRTY" = 0 ] || TAG=$TAG-dirty
fi
case "$TAG" in "" | *[!A-Za-z0-9_.-]*) die "标签含不支持的字符: $TAG" ;; esac
[ -f "$KEY" ] || die "私钥不存在: $KEY"

TARGET=$SSH_USER@$HOST
SSH_OPTS=(-i "$KEY" -o ConnectTimeout=10 -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
remote() { ssh "${SSH_OPTS[@]}" "$TARGET" "$@"; }
# 把标准输入的脚本交给服务器上的 bash 执行，参数按位置传进去：remote_bash <参数…> <<'EOF'
# ssh 会把参数用空格拼成一个字符串、由服务器上的 shell 重新切分，空参数会消失、后面的参数整体前移，
# 带空格的会被拆开。所以每个参数先用 printf %q 转义（普通的非空字符串转义后不变，空串变成 ''）
remote_bash() {
	local a q=
	for a in "$@"; do q="$q $(printf %q "$a")"; done
	remote "bash -s --$q"
}

# 有的机器只有独立版 docker-compose（在 /usr/local/bin，sudo 的 PATH 里没有），
# 有的是 docker compose 插件，按机器探测后用绝对路径。
REMOTE_COMPOSE='
if sudo docker compose version >/dev/null 2>&1; then compose="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then compose=$(command -v docker-compose)
else echo "服务器上找不到 docker compose 或 docker-compose" >&2; exit 1
fi'

# 服务器上的 .env：容器配置 + 端口拓扑。端口和代理开关由脚本按环境决定，保证容器端口和
# nginx 的 upstream 对得上。单引号让 compose 原样取值、不做 $ 替换。
if [ "$USE_NGINX" = 1 ]; then PROXIED=true; else PROXIED=false; fi
server_env() {
	echo "# 由 scripts/deploy.sh $ENV_NAME 生成，下次部署会被覆盖；要改请改部署机上的 .env.$ENV_NAME 或环境变量"
	for k in $APP_KEYS; do printf "%s='%s'\n" "$k" "${!k-}"; done
	printf "%s='%s'\n" TAG "$TAG" BIND_IP "$BIND_IP" APP_PORT "$APP_PORT" TRUST_PROXY "$PROXIED" COOKIE_SECURE "$PROXIED"
}

cat <<EOF

  环境       $ENV_NAME
  服务器     $TARGET
  私钥       ${KEY}（$([ -n "$KEY_OPT" ] && echo '-k' || source_of DEPLOY_SSH_KEY)）
  分支       ${BRANCH:-（游离的 HEAD）}$([ "$ENV_NAME" = prod ] && [ -n "${PROD_BRANCH-}" ] && echo "（生产只发 ${PROD_BRANCH}）")
  镜像       $IMAGE:$TAG$([ "$ROLLBACK" = 1 ] && echo '（回滚，用服务器上已有镜像）')
  部署目录   $REMOTE_PATH
  端口       $([ "$USE_NGINX" = 1 ] && echo "nginx :$NGINX_PORT → 容器 $BIND_IP:$APP_PORT" || echo "容器直连 $BIND_IP:$APP_PORT")
  站点       $PUBLIC_ORIGIN
  配置来源   $([ "$USE_QINGLIAO_KEYS" = 1 ] && echo "密钥: $(source_of QINGLIAO_SECRET)  登录服务: $(source_of QINGLIAO_LOGIN_API)  头像: $(source_of QINGLIAO_RES_BASE)" || echo "站点: $(source_of PUBLIC_ORIGIN)（不用 IM 平台密钥）")$([ -n "$DEBUG_VAL" ] && echo "  调试登录: 开（$(source_of "$DEBUG_KEY")）")
EOF
if [ "$DIRTY" = 1 ]; then
	warn "工作区有未提交改动，镜像按当前工作区构建（标签 ${TAG}）"
fi

step "检查服务器"
# 不用 IM 平台登录的项目不查登录服务：shell 里残留的 QINGLIAO_LOGIN_API 不能被拿去 curl
LOGIN_API_CHECK=
[ "$USE_QINGLIAO_KEYS" = 0 ] || LOGIN_API_CHECK=${QINGLIAO_LOGIN_API:-}
# 引号包住的 heredoc 原样发到服务器，参数按位置传进去
remote_bash "$APP_PORT" "${NGINX_PORT:-0}" "$CONTAINER" "$REMOTE_DIR" "$LOGIN_API_CHECK" "$ENV_NAME" "$NGINX_MODE" "${PUBLIC_HOST-}" "$PROJECT" <<'EOF'
set -e
app_port=$1 nginx_port=$2 container=$3 dir=$4 api=$5 env_name=$6 nginx_mode=$7 public_host=$8 project=$9
old=~/$project
case "$dir" in /*) ;; *) dir=~/$dir ;; esac
marker=$dir/.deploy-env
if [ "$dir" != "$old" ] && [ -d "$old" ] && [ ! -L "$old" ]; then
	# 部署目录换到了 PROD_REMOTE_BASE 下，老目录还在：这次部署会迁过去，环境标记先按老目录的核对
	[ ! -e "$dir" ] || { echo "$old 和 $dir 都在，不知道用哪个：确认后把不用的那个改名" >&2; exit 1; }
	marker=$old/.deploy-env
	echo "部署目录: 这次部署会把 $old 迁到 ${dir}（停容器 → 复制 → 老目录改名保留 → 照常启动）"
fi
if [ -f "$marker" ] && [ "$(cat "$marker")" != "$env_name" ]; then
	echo "这台服务器是 $(cat "$marker") 环境（${marker}），不能部署 $env_name" >&2; exit 1
fi
if sudo docker compose version >/dev/null 2>&1; then echo "compose: docker compose"
elif command -v docker-compose >/dev/null 2>&1; then echo "compose: $(command -v docker-compose)"
else echo "服务器上找不到 docker compose 或 docker-compose" >&2; exit 1
fi
if [ "$nginx_port" != 0 ]; then
	command -v nginx >/dev/null || { echo '服务器没装 nginx，先执行: sudo dnf install -y nginx' >&2; exit 1; }
fi

# 端口被别的服务占了就停：容器端口只能是我们自己的容器，nginx 端口只能是我们自己的实例
listening() { [ -n "$(sudo ss -ltnH "sport = :$1")" ]; }
if listening "$app_port"; then
	owner=$(sudo docker ps --filter "publish=$app_port" --format '{{.Names}}')
	[ "$owner" = "$container" ] || { echo "端口 $app_port 已被占用（${owner:-非 docker 进程}）" >&2; exit 1; }
fi
if [ "$nginx_port" != 0 ] && [ "$nginx_mode" = shared ]; then
	# 共享模式：80 归系统 nginx；同一个 CDN 域名不能出现在别的游戏的片段里，不然请求会串到别的游戏
	systemctl is-active --quiet nginx || { echo '系统 nginx 没在跑：先装好主配置（skill 的 templates/server/nginx.conf）再 sudo systemctl enable --now nginx' >&2; exit 1; }
	sudo grep -qE 'listen +80 +default_server' /etc/nginx/nginx.conf || echo '! /etc/nginx/nginx.conf 没有 80 的 default_server：Host 对不上的请求会落到 conf.d 里排第一的游戏' >&2
	other=$(sudo grep -lE "server_name[^;]*[[:space:]]${public_host//./\\.}([[:space:];]|\$)" /etc/nginx/conf.d/*.conf 2>/dev/null | grep -vxF "/etc/nginx/conf.d/$project.conf" || true)
	[ -z "$other" ] || { echo "server_name $public_host 已经在 $other 里，两个游戏不能用同一个 CDN 域名" >&2; exit 1; }
	echo "nginx: 系统 nginx（共享，:80）"
elif [ "$nginx_port" != 0 ] && listening "$nginx_port"; then
	pidfile=$dir/logs/nginx.pid
	{ [ -f "$pidfile" ] && sudo kill -0 "$(cat "$pidfile")" 2>/dev/null; } || { echo "端口 $nginx_port 已被别的进程占用" >&2; exit 1; }
fi

api=${api//host.docker.internal/127.0.0.1}
if [ -n "$api" ]; then
	code=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "$api/" || true)
	[ "$code" != 000 ] && echo "登录服务: $api 可连通（HTTP ${code}）" || echo "! 登录服务: 从服务器连不上 $api" >&2
fi
df -h / | awk 'NR==2{print "磁盘: 已用 "$5"，剩余 "$4}'
free -m | awk '/^Mem/{print "内存: 可用 "$7" MB"; if ($7 < 250) print "! 可用内存不足 250MB" > "/dev/stderr"}'
EOF

# ROOT_DOMAIN 下的 api. / admin. 两个主机名也归本项目：和上面查 CDN 域名一样，不能已经在别的游戏的片段里
if [ "$USE_NGINX" = 1 ] && [ "$NGINX_MODE" = shared ] && [ -n "$ROOT_DOMAIN" ]; then
	remote_bash "$PROJECT" "api.$ROOT_DOMAIN" "admin.$ROOT_DOMAIN" <<'EOF'
set -e
project=$1; shift
for host in "$@"; do
	other=$(sudo grep -lE "server_name[^;]*[[:space:]]${host//./\\.}([[:space:];]|\$)" /etc/nginx/conf.d/*.conf 2>/dev/null | grep -vxF "/etc/nginx/conf.d/$project.conf" || true)
	[ -z "$other" ] || { echo "server_name $host 已经在 $other 里，两个项目不能用同一个域名" >&2; exit 1; }
done
echo "nginx: $* 没有被别的项目的片段占用"
EOF
fi

if [ "$ROLLBACK" = 1 ]; then
	remote "sudo docker image inspect $IMAGE:$TAG >/dev/null 2>&1" || die "服务器上没有镜像 $IMAGE:${TAG}，可用的: $(remote "sudo docker images $IMAGE --format '{{.Tag}}' | tr '\n' ' '")"
fi

if [ "$CHECK_ONLY" = 1 ]; then
	printf '\n（-n 只检查，未部署）\n'
	exit 0
fi

if [ "$ASSUME_YES" != 1 ]; then
	printf '\n部署到 %s (%s)? [y/N] ' "$ENV_NAME" "$HOST"
	read -r reply
	case "$reply" in y | Y) ;; *) echo '已取消'; exit 0 ;; esac
fi

if [ "$ROLLBACK" = 0 ]; then
	if [ -n "${TEST_CMD-}" ]; then
		step "测试"
		TEST_LOG=$(mktemp)
		if ! eval "$TEST_CMD" >"$TEST_LOG" 2>&1; then
			tail -n 30 "$TEST_LOG" >&2
			die "$TEST_CMD 没过（最后 30 行见上），先修好再部署"
		fi
		rm -f "$TEST_LOG"
		echo '通过'
	fi

	step "构建 $IMAGE:$TAG"
	# 工作区干净时用 git archive 当构建上下文：镜像里只有已提交的文件，被 gitignore 的本地数据库、
	# .env.*、构建残留就算 .dockerignore 漏写也进不去。项目在仓库子目录里时只取这个子目录。
	# 测试服带 -dirty 的部署照旧用工作区。
	if [ "$DIRTY" = 0 ]; then
		BUILD_CTX=$(mktemp -d)
		trap 'rm -rf "$BUILD_CTX"' EXIT
		# 必须在仓库根目录执行：在子目录里 git archive 会再按当前目录过滤一次，打出来是空的
		git -C "$(git rev-parse --show-toplevel)" archive "HEAD:$(git rev-parse --show-prefix)" | tar -x -C "$BUILD_CTX"
		[ -f "$BUILD_CTX/Dockerfile" ] || die "git archive 出来的构建上下文里没有 Dockerfile（Dockerfile 没提交？）"
	else
		BUILD_CTX=.
	fi
	docker buildx build --platform linux/amd64 -t "$IMAGE:$TAG" --load "$BUILD_CTX"

	step "传镜像到 $HOST"
	docker save "$IMAGE:$TAG" | gzip | remote 'gzip -d | sudo docker load'
fi

if declare -F hook_backup >/dev/null; then
	step "备份数据"
	hook_backup
fi

# 迁移部署目录：PROD_REMOTE_BASE 是后加的、~/$PROJECT 还在（不是软链接）时，在备份之后、同步配置之前把它整个搬过去。
# 停容器（down 不带 -v，数据卷不动）→ cp -a 复制（保留属主、权限、软链接）→ 老目录改名保留 → 下面照常同步配置、启动。
# 老目录和新目录都在就停下，不猜用哪个。compose.yml 里挂宿主机目录要写相对路径（./xxx），迁移后才跟着走
if [ -n "$REMOTE_BASE" ]; then
	remote "
set -e
old=~/$PROJECT new=$REMOTE_PATH
if [ -d \"\$old\" ] && [ ! -L \"\$old\" ]; then
	[ ! -e \"\$new\" ] || { echo \"\$old 和 \$new 都在，不知道用哪个：确认后把不用的那个改名\" >&2; exit 1; }
	echo \"迁移部署目录 \$old → \$new\"
	$REMOTE_COMPOSE
	if [ -f \"\$old/compose.yml\" ]; then (cd \"\$old\" && sudo \$compose -p $PROJECT -f compose.yml down); fi
	sudo install -d -m 755 -o $SSH_USER -g $SSH_USER $REMOTE_BASE
	sudo cp -a \"\$old\" \"\$new\"
	sudo mv \"\$old\" \"\$old.migrated-\$(date +%Y%m%d-%H%M%S)\"
	echo \"老目录已改名保留，确认新目录没问题后可以删掉\"
fi
" || die "迁移部署目录失败（见上）。容器如果已经停了，到老目录 sudo docker compose -p $PROJECT -f compose.yml up -d 拉起来"
fi

step "同步配置"
# 部署目录不存在就建：PROD_REMOTE_BASE 下的目录（/data 归 root）用 sudo 建好再交给 $SSH_USER，项目目录 711（nginx 要能穿过去读宿主机目录）
MKDIR_CMD="mkdir -p $REMOTE_PATH"
[ -z "$REMOTE_BASE" ] || MKDIR_CMD="sudo install -d -m 755 -o $SSH_USER -g $SSH_USER $REMOTE_BASE && { [ -d $REMOTE_PATH ] || install -d -m 711 $REMOTE_PATH; }"
# .env 走 ssh 标准输入，本机不落临时文件；先写 .env.new 再改名，写一半断了不会留下残缺的 .env
server_env | remote "umask 077 && $MKDIR_CMD && cat > $REMOTE_PATH/.env.new && chmod 600 $REMOTE_PATH/.env.new && mv -f $REMOTE_PATH/.env.new $REMOTE_PATH/.env && echo $ENV_NAME > $REMOTE_PATH/.deploy-env"
FILES=(compose.yml)
if [ "$USE_NGINX" = 1 ]; then
	RENDERED=$(mktemp -d)/$NGINX_CONF
	SED_ARGS=(-e "s/__PUBLIC_HOST__/$PUBLIC_HOST/g" -e "s/__NGINX_PORT__/$NGINX_PORT/g" -e "s/__APP_PORT__/$APP_PORT/g" -e "s#__DEPLOY_DIR__#$DEPLOY_DIR#g")
	if [ -n "$ROOT_DOMAIN" ]; then
		# 正则写法要的是 mg\.example\.com；sed 替换串里的反斜杠要写两个，所以先把每个 . 换成 \\.
		# （ROOT_DOMAIN 前面已限定只有字母、数字、点、横线，没有别的字符会被 sed 解释）
		root_re=$(printf '%s\n' "$ROOT_DOMAIN" | sed 's/\./\\\\./g')
		SED_ARGS+=(-e "s/__ROOT_DOMAIN_RE__/$root_re/g" -e "s/__ROOT_DOMAIN__/$ROOT_DOMAIN/g")
	fi
	sed "${SED_ARGS[@]}" "$NGINX_CONF" >"$RENDERED"
	! grep -n '__[A-Z_]*__' "$RENDERED" >&2 || die "$NGINX_CONF 里还有没替换的占位符（见上）"
	FILES+=("$RENDERED")
fi
scp -q "${SSH_OPTS[@]}" "${FILES[@]}" "$TARGET:$REMOTE_PATH/"
echo ".env ${FILES[*]##*/} → $REMOTE_PATH/"

# 项目自己的准备工作（建宿主机目录、改属主……）：配置已同步、容器还没 up。回滚 -r 也会走到这里，钩子要能重复执行
if declare -F hook_prepare >/dev/null; then
	step "准备"
	hook_prepare
fi

# 记下现在在跑的镜像标签：新版本起不来时自动退回去
PREV_TAG=$(remote "sudo docker inspect -f '{{.Config.Image}}' $CONTAINER 2>/dev/null" | sed 's/.*://' || true)

step "启动容器"
remote "
set -e
$REMOTE_COMPOSE
cd $REMOTE_PATH
sudo \$compose -p $PROJECT -f compose.yml up -d
"

if [ "$USE_NGINX" = 1 ] && [ "$NGINX_MODE" = shared ]; then
	step "nginx（共享 :80，/etc/nginx/conf.d/$PROJECT.conf）"
	# 片段装进 conf.d 后用 -t 验整份配置；没过就把原片段放回去再退出，正在跑的 nginx 和别的游戏都不受影响
	remote_bash "$PROJECT" "$REMOTE_DIR/$NGINX_CONF" <<'EOF'
set -e
dst=/etc/nginx/conf.d/$1.conf src=$2
case "$src" in /*) ;; *) src=~/$src ;; esac
had=0
if [ -f "$dst" ]; then sudo cp -p "$dst" "$dst.bak"; had=1; fi
sudo install -m 644 -o root -g root "$src" "$dst"
if ! sudo nginx -t; then
	if [ "$had" = 1 ]; then sudo mv -f "$dst.bak" "$dst"; else sudo rm -f "$dst"; fi
	echo "nginx -t 没过（见上），已恢复原来的 $dst，线上不受影响" >&2
	exit 1
fi
sudo rm -f "$dst.bak"
sudo systemctl reload nginx && echo '已 reload'
EOF
elif [ "$USE_NGINX" = 1 ]; then
	step "nginx（:${NGINX_PORT}）"
	# 先 -t 验语法，失败就停在这里，正在跑的 nginx 不受影响
	remote "
set -e
cd $REMOTE_PATH
mkdir -p logs temp
sudo nginx -p \"\$PWD\" -c $NGINX_CONF -t
if [ -f logs/nginx.pid ] && sudo kill -0 \$(cat logs/nginx.pid) 2>/dev/null; then
	sudo nginx -p \"\$PWD\" -c $NGINX_CONF -s reload && echo '已 reload'
else
	sudo nginx -p \"\$PWD\" -c $NGINX_CONF && echo '已启动'
fi
"
fi

step "验收"
printf '等待容器 healthy'
healthy=0
for _ in $(seq 1 30); do
	case "$(remote "sudo docker ps --filter name=^$CONTAINER\$ --format '{{.Status}}'" 2>/dev/null || true)" in
	*'(healthy)'*) healthy=1; break ;;
	esac
	printf '.'
	sleep 3
done
echo
if [ "$healthy" != 1 ]; then
	remote "sudo docker logs $CONTAINER --tail 30" || true
	[ -n "$PREV_TAG" ] && [ "$PREV_TAG" != "$TAG" ] || die "90 秒内未 healthy（日志见上）。没有可退回的旧版本"
	warn "90 秒内未 healthy（日志见上），自动退回 $IMAGE:${PREV_TAG}"
	remote "
set -e
$REMOTE_COMPOSE
cd $REMOTE_PATH
sed -i \"s/^TAG=.*/TAG='$PREV_TAG'/\" .env
sudo \$compose -p $PROJECT -f compose.yml up -d
"
	die "新版本 $IMAGE:$TAG 起不来，已退回 ${PREV_TAG}。修好后重新部署；确认旧版本也起来了: ssh -i $KEY $TARGET 'sudo docker ps'"
fi
remote "sudo docker ps --filter name=^$CONTAINER\$ --format '{{.Image}}  {{.Ports}}  {{.Status}}'"

if [ "$USE_NGINX" = 1 ] && [ "$NGINX_MODE" = shared ]; then
	# 共享 nginx 按 Host 分流，不带 CDN 域名会落到 default_server 被断开
	LOCAL=http://127.0.0.1; LABEL="经 nginx"; HOST_HDR="-H 'Host: $PUBLIC_HOST'"
elif [ "$USE_NGINX" = 1 ]; then
	LOCAL=http://127.0.0.1:$NGINX_PORT; LABEL="经 nginx"; HOST_HDR=
else
	# 直连时服务端拿 Host 和 Origin 比，在服务器上请求要冒充成玩家看到的地址
	LOCAL=http://127.0.0.1:$APP_PORT; LABEL="直连"; HOST_HDR="-H 'Host: ${PUBLIC_ORIGIN#http://}'"
fi
remote "curl -fsS -o /dev/null -w '$LABEL  GET $HEALTH_PATH %{http_code}\n' $HOST_HDR $LOCAL$HEALTH_PATH"

PUBLIC_OK=0
if curl -fsS -o /dev/null -m 15 -w "公网  GET $PUBLIC_ORIGIN$HEALTH_PATH %{http_code}\n" "$PUBLIC_ORIGIN$HEALTH_PATH"; then
	PUBLIC_OK=1
elif [ "$USE_NGINX" = 1 ]; then
	warn "从本机访问 $PUBLIC_ORIGIN 失败（CDN 源站 / 安全组 $NGINX_PORT 还没配好？$([ "$NGINX_MODE" = shared ] && echo '共享 nginx 还要求 CDN 源请求策略是 AllViewer')）"
else
	warn "从本机访问 $PUBLIC_ORIGIN 失败（安全组没放行入站 TCP ${APP_PORT}？）"
fi
if declare -F hook_verify >/dev/null; then hook_verify; fi

# 只清本项目的镜像：测试服是多个项目共用的，别的仓库不碰
if [ "${KEEP_IMAGES:-0}" -gt 0 ]; then
	step "清理旧镜像（$IMAGE 留最近 $KEEP_IMAGES 个）"
	"$ROOT/scripts/prune-images.sh" -n "$KEEP_IMAGES" -y -H "$HOST" -k "$KEY" -u "$SSH_USER" "$IMAGE" ||
		warn "清理旧镜像失败，不影响本次部署；之后手动跑 scripts/prune-images.sh -H $HOST $IMAGE"
fi

printf '\n\033[32m✓ %s 部署完成：%s  →  %s\033[0m\n' "$ENV_NAME" "$IMAGE:$TAG" "$PUBLIC_ORIGIN"
