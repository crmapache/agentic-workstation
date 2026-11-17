# Сайт Agentic Workstation

https://agentic-workstation.mzpizote.com - одна страница по-английски: что за IDE, ссылки на
установщики и шаги установки для мака и Windows. Почему так устроено - ADR 0068.

## Команды

Из корня репозитория:

| Команда                                                        | Что                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| `pnpm --filter @agentic-workstation/site dev`                  | страница на http://localhost:3026 с перезагрузкой            |
| `pnpm --filter @agentic-workstation/site build`                | статика в `apps/site/dist`                                   |
| `pnpm --filter @agentic-workstation/site preview`              | собранная статика на том же порту                            |
| `pnpm --filter @agentic-workstation/site check:layout [адрес]` | Chromium и WebKit, 8 экранов, снимки в `.screenshots/site`   |
| `pnpm --filter @agentic-workstation/site og`                   | картинка превью ссылки `public/og.png`                       |
| `bash apps/site/scripts/site-deploy.sh`                        | выкладка на сервер, ждёт, пока снаружи не ответит эта сборка |

`check:layout` по умолчанию смотрит preview (`http://localhost:3026`), с адресом - боевой сайт.
Предупреждает о горизонтальной прокрутке, незагрузившихся картинках и ошибках в консоли и
пишет снимки всей страницы. Запущенный preview после проверки погасить.

## Как устроено

- `index.html` - вся разметка и тексты главной. `privacy/index.html` - политика
  конфиденциальности IDE и сайта, `404.html` - страница для чужих адресов.
- `src/styles` - SCSS по разделам. Значения - только токены: общие из
  `packages/ui/src/styles/tokens.css`, крупные кегли и ритм страницы - `site-tokens.css`.
  stylelint держит те же правила, что у окна IDE.
- `src/release.ts` - номер версии и размеры установщиков с `/release.json`. В бою это ответ
  API GitHub в кеше nginx (`nginx.conf`), в dev и preview - прокси Vite.
- Главная кнопка скачивания - под систему посетителя: скрипт в `<head>` ставит
  `data-platform` у `html` до первой отрисовки, стили читают его.
- Ссылки на установщики постоянные (`/releases/latest/download/<имя>`): новый выпуск IDE сайт
  не трогает. Поменялись имена файлов в `electron-builder.yml` - поправить ссылки в
  `index.html` и `ASSETS` в `src/release.ts`.

## Снимки окна

Картинки на странице - настоящая IDE, а не макет. Интерфейс заметно поменялся - переснять.
Снимают копию окна агента (`apps/desktop/scripts/agent-window.sh`), не dev и не установленную
IDE: в них личные проекты.

1. Демо-проекты в домашней папке (не в `/tmp`): `pulse` - маленький монитор доступности на
   TypeScript с тестами на `node --test`, рядом `atlas-api` и `field-notes`, у всех git. В
   `pulse/.claude/settings.json` - `"language": "English"`, иначе разговор пойдёт по-русски
   (язык из настроек пользователя).
2. `bash apps/desktop/scripts/agent-window.sh start ~/aw-demo/pulse ~/aw-demo/atlas-api ~/aw-demo/field-notes`.
   Для настоящего хода Claude в копию нужен аккаунт: погасить только процесс Electron копии,
   скопировать `claude-accounts.json` из профиля dev и поднять Electron снова (как в памяти
   проекта про аккаунт копии).
3. Сцены, по снимку на каждую, `node apps/site/scripts/capture-shot.mjs 1600 1000 <файл>`:
   - `window.png` - дерево, `http-check.ts` в редакторе, разговор в панели Claude Code
     (запрос про повторы HTTP-проверки, лента прокручена к началу);
   - `changes.png` - панель Changes и разница `http-check.ts`, вид Unified;
   - `connectors.png` - вид Connectors с каталогом;
   - `terminal.png` - терминал под панелью с `npm test`, приглашение без имени машины
     (`PROMPT='%B%F{blue}%1~%f%b %# '`).
4. `bash apps/site/scripts/make-shots.sh <папка со снимками>` - кадры и WebP в
   `src/assets/shots`, затем `pnpm --filter @agentic-workstation/site og`.
5. Погасить копию (`agent-window.sh stop`) и убрать демо-проекты вместе с их разговорами.

Перед выкладкой - глазами по снимкам: ни личных проектов, ни почты, ни имени машины.

## Сервер

Проект и приложение Coolify `aw-site` (uuid приложения - в `scripts/site-deploy.sh`), образ
`127.0.0.1:5000/aw-site:local` (nginx), порт 3026, проверка здоровья `/version.txt`. Исходники
на сервере - `/root/apps/aw-site`, их кладёт скрипт выкладки. Запись
`agentic-workstation.mzpizote.com` в Cloudflare - без проксирования.
