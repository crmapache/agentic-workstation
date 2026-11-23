---
paths:
  - 'apps/desktop/src/main/calendar/**'
  - 'apps/desktop/src/main/connectors/calendar-access.ts'
  - 'apps/desktop/src/main/connectors/gateway/granted.ts'
  - 'apps/desktop/src/main/connectors/kinds/workstation/calendar-tools.ts'
  - 'apps/desktop/src/main/ipc/calendar-handlers.ts'
  - 'apps/desktop/src/shared/calendar*.ts'
  - 'apps/desktop/src/shared/zone-time.ts'
  - 'apps/desktop/src/shared/ipc/calendar.contract.ts'
  - 'apps/desktop/src/renderer/src/features/calendar/**'
  - 'apps/desktop/src/renderer/src/state/calendar.queries.ts'
---

# Календарь звонков

Почему так - ADR 0114, карта - раздел «Календарь звонков» в `docs/architecture.md`.

- **Календарь общий на IDE, не проектный.** Источники, снимки и настройки - в главном процессе
  (`CalendarService`), окно берёт состояние и события запросом за период; ревизия в состоянии
  перечитывает период. Коннектор источника - по id из источника, мимо доступности по проектам.
- **Накладки и дубли - одна функция** `shared/calendar-overlaps.ts` на окно, главный процесс
  (счётчик, уведомление) и инструменты ИИ. Своих правил накладки в фиче не писать: счётчик на
  кнопке и сетка разошлись бы.
- **Время событий - мс UTC, весь день - датами** (`allDay.from`, `to` не включён). Местное время
  страницы - только через `wallTimeToUtc` с поясом страницы; время без пояса в ICS - на часах этого
  компьютера, пояс Windows без VTIMEZONE - таблицей `windows-zones.constants.ts`.
- **Снимок источника заменяется только внутри прочитанного окна** (`replaceCovered`): ИИ читает
  две недели - прошлое и дальнее не теряются. Пустой ответ ИИ там, где были события, - принят с
  пометкой, а не молча.
- **Чтение ИИ - только через допуск шлюза** (`GatewayHost.openGranted`, `LaunchGrant`): один
  выбранный коннектор, инструменты поимённо, профиль Chrome и сайт закреплены. Новый инструмент в
  наборе чтения - только тот, что не пишет и не уносит данные (набор текста, `evaluate`, `upload`,
  `take`, `tabs` - нет). Ответ ИИ - данные: проверка `calendar-ai-parse.ts`, а не доверие.
- **Провайдер читает календарь, только если прошёл живую проверку** (`CALENDAR_AI_PROVIDERS`,
  сквозной тест на учебной странице). Новый провайдер - сначала проверка, потом список.
- **ИИ-источники - только по просьбе** (кнопка, `calendar_sync` с `include_ai`), по одному;
  чтение по экрану - только с вида Calendar: оно забирает мышь. Таймер, вид и пробуждение читают
  только прямые источники.
- **Ссылка ICS - секрет:** полная - в `calendar.vault`, в состоянии и на диске - маска хоста; в
  журнал не пишется.
- **Вкладки чтения закрываются сразу** (`launch.end()` до `release()`): иначе сессия браузера
  ждёт следующий процесс десять минут.
- **Окно:** места блоков на сетке - доли суток через переменные (`WeekGrid.utils.ts`), цвет
  источника - миксин `_calendar-tones.scss` и токены `--color-calendar-N`. Соседние фичи не
  импортировать: меню и подобное - композицией из `packages/ui`.
- Проверять вживую - копия окна (`/dev`) со своим профилем; чтение ИИ - сквозным тестом под
  `AGENTIC_WORKSTATION_BROWSER_E2E=1`, не на календарях человека.
