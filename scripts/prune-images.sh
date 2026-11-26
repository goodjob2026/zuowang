#!/usr/bin/env bash
#
# 清理服务器上的历史镜像：每个仓库只留最近 N 个，被容器（包括已停止的）用着的一律保留。
# 默认只预览，加 -y 才删。只用 docker rmi（不带 -f），删不掉的报错跳过、不影响其它。
# deploy.sh 部署完会用它清本项目的镜像；服务器、私钥、保留个数的默认值来自 deploy.conf（测试服）。
#
#   ./scripts/prune-images.sh                       # 预览测试服所有仓库，每个留 3 个
#   ./scripts/prune-images.sh -n 5 wuzhu-game       # 只看 wuzhu-game，留 5 个
#   ./scripts/prune-images.sh -n 5 -y wuzhu-game    # 真删
#
# 测试服是多个项目共用的，删别人仓库的镜像前先和负责人说好：删了就不能用 -r 回滚到那些版本。
set -euo pipefail

usage() {
	cat <<'EOF'
用法: scripts/prune-images.sh [选项] [仓库 ...]

不写仓库 = 服务器上所有有名字的仓库（<none> 无标签镜像不管，用 docker image prune 清）

选项:
  -n <个数>   每个仓库保留最近几个镜像，默认 3（至少 1）
  -y          真的删除；不加只预览
  -H <地址>   服务器，默认测试服（deploy.conf 的 TEST_HOST）
  -k <私钥>   SSH 私钥，默认 deploy.conf 的 TEST_SSH_KEY
  -u <用户>   SSH 用户，默认 deploy.conf 的 SSH_USER，没有就是 ec2-user
  -h          显示本帮助
EOF
}

die() { printf '\033[31m错误: %s\033[0m\n' "$1" >&2; exit 1; }

CONF=$(cd "$(dirname "$0")/.." && pwd)/deploy.conf
# shellcheck source=../deploy.conf
[ ! -f "$CONF" ] || . "$CONF"
KEEP=${KEEP_IMAGES:-3}
[ "$KEEP" -gt 0 ] 2>/dev/null || KEEP=3
APPLY=0
HOST=${TEST_HOST-}
KEY=${TEST_SSH_KEY-}
USER_=${SSH_USER:-ec2-user}
while getopts 'n:yH:k:u:h' opt; do
	case "$opt" in
	n) KEEP=$OPTARG ;;
	y) APPLY=1 ;;
	H) HOST=$OPTARG ;;
	k) KEY=$OPTARG ;;
	u) USER_=$OPTARG ;;
	h) usage; exit 0 ;;
	*) usage; exit 1 ;;
	esac
done
shift $((OPTIND - 1))

[[ $KEEP =~ ^[1-9][0-9]*$ ]] || die "-n 要是正整数: $KEEP"
for r in "$@"; do
	[[ $r =~ ^[a-z0-9][a-z0-9._/-]*$ ]] || die "仓库名不对（不要带 :标签）: $r"
done
[ -n "$HOST" ] || die "没有服务器地址：用 -H 指定，或在 deploy.conf 里配 TEST_HOST"
[ -n "$KEY" ] || die "没有私钥：用 -k 指定，或在 deploy.conf 里配 TEST_SSH_KEY"
[[ $KEY == \~/* ]] && KEY=$HOME/${KEY:2}
[ -f "$KEY" ] || die "私钥不存在: $KEY"

printf '服务器 %s@%s  每个仓库保留 %s 个  %s\n' "$USER_" "$HOST" "$KEEP" "$([ "$APPLY" = 1 ] && echo '【删除】' || echo '（预览，加 -y 才删）')"

# 引号包住的 heredoc 原样发到服务器，参数按位置传进去
ssh -i "$KEY" -o ConnectTimeout=10 -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$USER_@$HOST" \
	bash -s -- "$KEEP" "$APPLY" "$@" <<'EOF'
set -euo pipefail
keep=$1 apply=$2
shift 2

sudo docker system df | sed -n '1,2p'

# 容器用的镜像按完整 ID 记，容器是按标签还是按 ID 起的都能认出来
inuse=$(sudo docker ps -aq | xargs -r sudo docker inspect -f '{{.Image}}' | sort -u)
if [ $# -gt 0 ]; then repos=("$@")
else mapfile -t repos < <(sudo docker images --format '{{.Repository}}' | grep -vx '<none>' | sort -u)
fi

targets=()
for repo in "${repos[@]}"; do
	# docker images 按创建时间从新到旧排；同一个 ID 打了多个标签只算一个
	plan=$(sudo docker images --no-trunc "$repo" --format '{{.ID}}\t{{.Tag}}\t{{.CreatedSince}}\t{{.Size}}' |
		awk -F'\t' -v keep="$keep" '
		NR == FNR { used[$1] = 1; next }
		$2 == "<none>" { next }
		{
			if (!($1 in rank)) rank[$1] = ++n
			if (rank[$1] <= keep) act = "keep"; else if ($1 in used) act = "used"; else act = "del"
			print act "\t" $2 "\t" $3 "\t" $4
		}' <(printf '%s\n' "$inuse") -)
	if [ -z "$plan" ]; then echo "$repo: 服务器上没有"; continue; fi
	total=$(grep -c . <<<"$plan")
	dels=$(grep -c '^del' <<<"$plan" || true)
	printf '\n%s: 共 %s 个，删 %s 个\n' "$repo" "$total" "$dels"
	while IFS=$'\t' read -r act tag since size; do
		case "$act" in
		keep) printf '  保留  %-28s %-16s %s\n' "$tag" "$since" "$size" ;;
		used) printf '  保留  %-28s %-16s %s（有容器在用）\n' "$tag" "$since" "$size" ;;
		del) printf '  删除  %-28s %-16s %s\n' "$tag" "$since" "$size"; targets+=("$repo:$tag") ;;
		esac
	done <<<"$plan"
done

printf '\n合计要删 %s 个\n' "${#targets[@]}"
[ "${#targets[@]}" -gt 0 ] || exit 0
[ "$apply" = 1 ] || { echo '（预览，没删任何东西；确认后加 -y 再跑一次）'; exit 0; }

failed=0
for t in "${targets[@]}"; do
	sudo docker rmi "$t" >/dev/null && echo "已删 $t" || { echo "! 删不掉 $t" >&2; failed=$((failed + 1)); }
done
printf '\n删除完成，失败 %s 个\n' "$failed"
sudo docker system df | sed -n '1,2p'
df -h / | awk 'NR==2{print "磁盘: 已用 "$5"，剩余 "$4}'
EOF
