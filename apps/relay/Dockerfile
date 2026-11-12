# syntax=docker/dockerfile:1
#
# Релей Remote Control и телефонный клиент - один маленький образ: процесс Node, ни базы, ни
# тома. Контекст сборки - корень репозитория (клиенту нужны пакеты workspace):
#
#   docker build -f apps/relay/Dockerfile -t aw-relay:local .
#
# Что попадает в контекст - apps/relay/Dockerfile.dockerignore (BuildKit берёт его рядом с
# Dockerfile): без node_modules, git, ключей подписи и исходников IDE.

FROM node:24-alpine AS build
WORKDIR /repo
# pnpm той же версии, что packageManager в корневом package.json: lock-файл читается ею.
RUN npm install -g pnpm@11.5.0
COPY . .
# Телефонный клиент (apps/phone, пакет @agentic-workstation/phone, сборка в apps/phone/dist)
# собирается в папку раздачи релея. Его ещё нет - остаётся заглушка apps/relay/public.
# Рантайм релея - его зависимости (ws, web-push и то, что тянет web-push) без dev и без
# workspace: pnpm deploy кладёт их в /out/node_modules рядом с исходниками. --legacy - потому
# что пакеты workspace не впрыскиваются (inject-workspace-packages), а релею они в рантайме и
# не нужны: протокол он не импортирует.
RUN set -eu; \
  if [ -f apps/phone/package.json ]; then \
    pnpm install --frozen-lockfile --filter "@agentic-workstation/phone..." --filter "@agentic-workstation/relay"; \
    pnpm --filter @agentic-workstation/phone build; \
    rm -rf apps/relay/public; \
    cp -R apps/phone/dist apps/relay/public; \
  else \
    pnpm install --frozen-lockfile --prod --filter "@agentic-workstation/relay"; \
  fi; \
  pnpm --filter @agentic-workstation/relay deploy --prod --legacy /deploy; \
  mkdir -p /out; \
  cp -a /deploy/node_modules /out/node_modules; \
  cp -R /deploy/src /deploy/package.json /out/; \
  cp -R apps/relay/public /out/public; \
  rm -f /out/src/*.test.ts

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4460
# Образ живёт за Traefik Coolify: тот приходит в контейнер из докер-сети (частный адрес) и
# дописывает X-Forwarded-For. Релей верит заголовку только такому ближнему собеседнику
# (src/callers.ts), поэтому порт, открытый наружу мимо прокси, назваться кем угодно не даст.
ENV RELAY_TRUST_PROXY=1
# Метка сборки от скрипта выкладки (apps/relay/scripts/relay-deploy.sh): её отдаёт /v1/info.
ARG BUILD_ID=dev
ENV RELAY_BUILD=$BUILD_ID
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4460
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O - http://127.0.0.1:4460/healthz || exit 1
# Node 24 снимает типы сам: исходники TypeScript запускаются без сборки (их проверяет тест
# src/index.test.ts тем же способом).
CMD ["node", "src/index.ts"]
