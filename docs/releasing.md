# Выпуск версии

Релиз делает скилл `/release` (`.claude/skills/release/SKILL.md`): поднимает версию,
собирает и подписывает, проверяет подпись, пишет манифест и публикует. Здесь - что
должно быть готово заранее и как это устроено.

## Один раз перед первым релизом

1. **Сертификат подписи** - [code-signing.md](code-signing.md). Создан 2026-11-10,
   копия - `agentic-workstation-code-signing.p12` в корне репозитория.
2. **Публичный репозиторий релизов** `crmapache/agentic-workstation-releases`, создан
   2026-10-16 как `amazing-ide-releases`, переименован 2026-11-10 (имя задано в
   `apps/desktop/package.json`, поле `agenticWorkstation.releasesRepo`). Отдельный от кода,
   потому что качать обновления приложение должно без токена:

   ```
   gh repo create crmapache/agentic-workstation-releases --public \
     --description "Agentic Workstation builds"
   ```

## Что лежит в релизе

Тег `v<версия>`, три файла с фиксированными именами:

| Файл                                | Для кого                                               |
| ----------------------------------- | ------------------------------------------------------ |
| `agentic-workstation-mac-arm64.dmg` | человек, первая установка                              |
| `agentic-workstation-mac-arm64.zip` | установленная IDE, самообновление                      |
| `latest.json`                       | установленная IDE: какая версия последняя и где её zip |

Приложение читает `https://github.com/<repo>/releases/latest/download/latest.json` -
GitHub сам ведёт `latest` на новейший релиз. Адрес zip внутри манифеста - на
конкретный тег, чтобы выход следующего релиза во время загрузки ничего не сломал.

Ссылка для первой установки не меняется между версиями:

```
https://github.com/crmapache/agentic-workstation-releases/releases/latest/download/agentic-workstation-mac-arm64.dmg
```

## Первая установка у человека

1. Скачать dmg, перетащить Agentic Workstation в «Программы».
2. Один раз снять карантин: `xattr -cr "/Applications/Agentic Workstation.app"`.

Дальше обновления приходят уведомлением в самой IDE.

## Проверить обновление без релиза

```
pnpm --filter @agentic-workstation/desktop update:e2e
```

Собирает две версии, подписывает их одноразовым сертификатом во временной связке
ключей, поднимает манифест на `127.0.0.1:5317` и прогоняет два сценария: подделка
отвергнута, честное обновление встало и перезапустилось. Около двух минут, за собой
убирает всё. Обязателен после правок в `src/main/updates`, `electron-builder.yml` и
`scripts/write-update-manifest.mjs`.

Вручную то же самое: запустить собранную IDE с
`AGENTIC_WORKSTATION_UPDATE_FEED=http://127.0.0.1:5317/latest.json` и
`AGENTIC_WORKSTATION_PROFILE_DIR=<папка>` (отдельный профиль, чтобы не задеть установленную
IDE). Журнал подмены - `<профиль>/logs/update.log`, без профиля -
`~/Library/Logs/Agentic Workstation/update.log`.
