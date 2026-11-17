# Сайт Agentic Workstation (ADR 0068): готовая статика за nginx. Страница собирается на Mac
# (pnpm --filter @agentic-workstation/site build), в образ едет только dist - сборщика и
# зависимостей в образе нет. Образ собирает scripts/site-deploy.sh на сервере.
FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/ /usr/share/nginx/html/
EXPOSE 3026
