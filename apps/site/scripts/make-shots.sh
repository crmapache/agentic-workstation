#!/usr/bin/env bash
#
# Картинки сайта из снимков окна (capture-shot.mjs, 1600x1000 при 2x = 3200x2000 точек):
# кадрирует нужные куски и пишет WebP нескольких ширин в src/assets/shots.
#
#   bash apps/site/scripts/make-shots.sh <папка со снимками>
#
# В папке ждёт четыре снимка - сцены описаны в apps/site/README.md:
#   window.png      окно целиком: дерево, редактор, разговор с Claude Code
#   changes.png     панель Changes и разница файла в редакторе
#   connectors.png  вид Connectors с каталогом приложений
#   terminal.png    терминал под панелью Claude Code с прогоном тестов
#
# Снимки в git не кладутся (это мегабайты PNG), кладутся только WebP. Нужен cwebp
# (brew install webp).
set -euo pipefail

SRC="${1:?папка со снимками}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/src/assets/shots"
QUALITY=82
mkdir -p "$OUT"

# webp <снимок> <имя> <x> <y> <ширина> <высота> <ширины на выходе...>
# Координаты кадра - в точках снимка (2x). Каждая ширина на выходе - отдельный файл
# <имя>-<ширина>.webp, их перечисляет srcset в index.html.
webp() {
  local file="$SRC/$1" name="$2" x="$3" y="$4" w="$5" h="$6"
  shift 6
  for size in "$@"; do
    cwebp -quiet -q "$QUALITY" -m 6 -crop "$x" "$y" "$w" "$h" -resize "$size" 0 \
      "$file" -o "$OUT/$name-$size.webp"
  done
}

# Окно целиком - главная картинка страницы: до 1200 точек CSS в ширину, отсюда 2400 для 2x.
webp window.png window 0 0 3200 2000 1200 1800 2400
# Панель Claude Code: шапка с вкладкой, запрос, шаги, правка с разницей, итог прогона тестов.
webp window.png claude 2032 160 1064 1376 532 1064
# Панель Changes и разница файла в редакторе, без панели Claude Code справа.
webp changes.png changes 112 160 1920 1136 960 1920
# Она же для телефона: только разница файла. Целиком на узком экране она нечитаемо мелкая.
webp changes.png changes-diff 800 160 1232 1136 616 1232
# Каталог коннекторов, от «Add a connector» до Computer Use.
webp connectors.png connectors 792 440 1240 1160 620 1240
# Терминал с прогоном тестов.
webp terminal.png terminal 2032 1030 1064 874 532 1064

ls -1 "$OUT"
