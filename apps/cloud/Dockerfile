# syntax=docker/dockerfile:1
#
# Облако Agentic Workstation (ADR 0102): процесс Node и база SQLite в томе /data. В базе - только
# шифр записей: ключа к нему у сервера нет. Контекст сборки - корень репозитория (облаку нужен
# пакет протокола):
#
#   docker build -f apps/cloud/Dockerfile -t aw-cloud:local .

FROM node:24-alpine AS build
WORKDIR /repo
RUN npm install -g pnpm@11.5.0
COPY . .
# Рантайм - зависимости облака без dev. Пакет протокола - исходники TypeScript: Node снимает
# типы сам, но не у файлов внутри node_modules, поэтому протокол лежит рядом папкой, а в
# node_modules - ссылка на неё (настоящий путь файла - вне node_modules).
RUN set -eu; \
  pnpm install --frozen-lockfile --prod --filter "@agentic-workstation/cloud"; \
  pnpm --filter @agentic-workstation/cloud deploy --prod --legacy /deploy; \
  mkdir -p /out; \
  cp -a /deploy/node_modules /out/node_modules; \
  rm -rf /out/node_modules/@agentic-workstation/cloud-protocol; \
  mkdir -p /out/protocol; \
  cp -R packages/cloud-protocol/src packages/cloud-protocol/package.json /out/protocol/; \
  ln -s ../../protocol /out/node_modules/@agentic-workstation/cloud-protocol; \
  cp -R /deploy/src /deploy/package.json /out/; \
  rm -f /out/src/*.test.ts /out/protocol/src/*.test.ts

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4464
ENV CLOUD_DATA_DIR=/data
# За Traefik Coolify: X-Forwarded-For верится только ближнему собеседнику из частной сети.
ENV CLOUD_TRUST_PROXY=1
# Метка сборки от скрипта выкладки (apps/cloud/scripts/cloud-deploy.sh): её отдаёт /v1/info.
ARG BUILD_ID=dev
ENV CLOUD_BUILD=$BUILD_ID
COPY --from=build --chown=node:node /out ./
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node
EXPOSE 4464
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O - http://127.0.0.1:4464/healthz || exit 1
CMD ["node", "src/index.ts"]
