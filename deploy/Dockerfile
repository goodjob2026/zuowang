# 《坐忘》服务端（给轻聊小游戏用的自有后端）。只有接口，不带页面——页面由轻聊平台托管。
# 构建：在仓库根目录（有 package.json、packages/ 的那一层）执行  docker build -f deploy/Dockerfile -t zuowang-server .
FROM node:24-slim
WORKDIR /app
COPY package.json ./
COPY packages/rules/package.json packages/rules/package.json
COPY packages/server/package.json packages/server/package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY packages packages
ENV NODE_ENV=production PORT=8787 DB_PATH=/data/zuowang.db
# 不用 root 跑：换成镜像自带的 node 用户，数据目录归它
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "packages/server/src/main.ts"]
