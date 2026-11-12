# Выпуск версии

Релиз делает скилл `/build` (`.claude/skills/build/SKILL.md`): поднимает версию, собирает мак
и Windows на этом Mac, подписывает и проверяет подписи, пишет манифест и публикует.
Переустановить последний релиз на этом Mac - скилл `/reinstall`.
Здесь - что должно быть готово заранее и как это устроено.

## Один раз перед первым релизом

1. **Сертификат подписи мака** - [code-signing.md](code-signing.md). Создан 2026-11-10,
   копия - `agentic-workstation-code-signing.p12` в корне репозитория.
2. **Ключ подписи обновлений Windows** - там же, раздел про Windows. Создан 2026-11-11,
   `agentic-workstation-update-signing.pem` в корне репозитория.
3. **Публичный репозиторий релизов** `crmapache/agentic-workstation-releases`, создан
   2026-10-16 как `amazing-ide-releases`, переименован 2026-11-10 (имя задано в
   `apps/desktop/package.json`, поле `agenticWorkstation.releasesRepo`). Отдельный от кода,
   потому что качать обновления приложение должно без токена:

   ```
   gh repo create crmapache/agentic-workstation-releases --public \
     --description "Agentic Workstation builds"
   ```

## Что лежит в релизе

Тег `v<версия>`, четыре файла с фиксированными именами:

| Файл                                | Для кого                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| `agentic-workstation-mac-arm64.dmg` | человек на маке, первая установка                                                     |
| `agentic-workstation-mac-arm64.zip` | установленная IDE на маке, самообновление                                             |
| `agentic-workstation-win-x64.exe`   | Windows: и первая установка, и самообновление (тихий запуск)                          |
| `latest.json`                       | установленная IDE: какая версия последняя, где её сборка, подпись установщика Windows |

Приложение читает `https://github.com/<repo>/releases/latest/download/latest.json` -
GitHub сам ведёт `latest` на новейший релиз. Адрес zip внутри манифеста - на
конкретный тег, чтобы выход следующего релиза во время загрузки ничего не сломал.

Ссылка для первой установки не меняется между версиями:

```
https://github.com/crmapache/agentic-workstation-releases/releases/latest/download/agentic-workstation-mac-arm64.dmg
```

## Первая установка у человека

Мак:

1. Скачать dmg, перетащить Agentic Workstation в «Программы».
2. Один раз снять карантин: `xattr -cr "/Applications/Agentic Workstation.app"`.

Windows (ADR 0048):

1. Скачать и запустить `agentic-workstation-win-x64.exe`:
   `https://github.com/crmapache/agentic-workstation-releases/releases/latest/download/agentic-workstation-win-x64.exe`.
2. SmartScreen предупредит о неизвестном издателе: «Подробнее» → «Выполнить в любом случае».
   Установка - в папку человека, без прав администратора; ярлык - на рабочем столе и в «Пуске».
3. Claude Code на Windows - родной установщик (`claude.exe` в `%USERPROFILE%\.local\bin`); его
   Bash просит Git для Windows.

Дальше обновления приходят уведомлением в самой IDE на обеих системах.

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
