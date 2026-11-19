# syntax=docker/dockerfile:1
#
# Магазин расширений Agentic Workstation (ADR 0091): процесс Node и база SQLite в томе /data.
# Контекст сборки - корень репозитория (магазину нужен пакет протокола):
#
#   docker build -f apps/store/Dockerfile -t aw-store:local .

FROM node:24-alpine AS build
WORKDIR /repo
RUN npm install -g pnpm@11.5.0
COPY . .
# Рантайм - зависимости магазина без dev. Пакет протокола - исходники TypeScript: Node снимает
# типы сам, но не у файлов внутри node_modules, поэтому протокол лежит рядом папкой, а в
# node_modules - ссылка на неё (настоящий путь файла - вне node_modules).
RUN set -eu; \
  pnpm install --frozen-lockfile --prod --filter "@agentic-workstation/store"; \
  pnpm --filter @agentic-workstation/store deploy --prod --legacy /deploy; \
  mkdir -p /out; \
  cp -a /deploy/node_modules /out/node_modules; \
  rm -rf /out/node_modules/@agentic-workstation/store-protocol; \
  mkdir -p /out/protocol; \
  cp -R packages/store-protocol/src packages/store-protocol/package.json /out/protocol/; \
  ln -s ../../protocol /out/node_modules/@agentic-workstation/store-protocol; \
  cp -R /deploy/src /deploy/package.json /out/; \
  rm -f /out/src/*.test.ts /out/protocol/src/*.test.ts

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4463
ENV STORE_DATA_DIR=/data
# За Traefik Coolify: X-Forwarded-For верится только ближнему собеседнику из частной сети.
ENV STORE_TRUST_PROXY=1
COPY --from=build --chown=node:node /out ./
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node
EXPOSE 4463
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O - http://127.0.0.1:4463/healthz || exit 1
CMD ["node", "src/index.ts"]
