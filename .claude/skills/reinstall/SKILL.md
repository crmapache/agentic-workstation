---
name: reinstall
description: Переустановить Agentic Workstation на этом Mac из последнего релиза - закрыть установленную IDE, взять свежий dmg, поставить заново, снять карантин Gatekeeper и открыть с чистым окружением. Данные IDE (проекты, разговоры, локальная история, настройки) сохраняются; `clean` - чистый лист, удаляет и их. Только macOS: Windows-версию ставит её установщик. Использовать ТОЛЬКО по явной команде /reinstall - это удаление установленного приложения.
disable-model-invocation: true
argument-hint: '[clean]'
allowed-tools: Bash
---

# Reinstall

Ставит заново на этом Mac последний опубликованный релиз (его выкладывает `/build`). dmg лежит в
публичном репозитории релизов под постоянным именем, ключи не нужны:

```
https://github.com/<репозиторий релизов>/releases/latest/download/agentic-workstation-mac-arm64.dmg
```

Только macOS, как и в callmate. Windows-версию человек ставит её установщиком
(`docs/releasing.md`), дальше она обновляется сама.

Репозиторий - `node -p "require('./apps/desktop/package.json').agenticWorkstation.releasesRepo"`.

## Аргументы

`$ARGUMENTS`: `clean` - чистый лист: удалить и данные IDE. Без `clean` данные остаются -
переустановка не должна стирать работу.

## Чего не трогать никогда

- **dev человека и его профиль** - «Agentic Workstation Dev» в Application Support: это `pnpm dev`,
  не установленная IDE. Ни закрывать, ни удалять, даже с `clean`.
- **Копию окна агента** (`~/.agentic-workstation-agent`) - она своя у скилла `/dev`.
- **Мост браузера** `~/.agentic-workstation` и папку расширения `~/Agentic Workstation`: расширение
  загружено в Chrome человека, пропавшая папка выглядела бы поломкой браузера.
- **Сертификат подписи и ключ обновлений** в корне репозитория.
- **Разрешения macOS** (TCC): bundle id и сертификат между версиями не меняются, система их
  помнит сама.

Bundle id - `io.github.crmapache.agenticworkstation`, приложение - `/Applications/Agentic Workstation.app`.

1. **Закрыть установленную IDE** - вежливо, чтобы сохранила своё, потом насильно. Путь процесса -
   только тот, что в /Applications: dev и копия агента идут из других мест.

   ```
   APP_BIN="/Applications/Agentic Workstation.app/Contents/MacOS/Agentic Workstation"
   if pgrep -f "$APP_BIN" >/dev/null; then
     osascript -e 'tell application id "io.github.crmapache.agenticworkstation" to quit'
     sleep 3
     pkill -f "$APP_BIN"
   fi
   ```

   Только если она запущена: `tell application` незапущенную сначала открыл бы.

2. **Взять установщик - до удаления.** Не скачался - остановиться: старая версия цела.

   ```
   STAGE=$(mktemp -d)
   curl -fL -o "$STAGE/aw.dmg" https://github.com/<репозиторий релизов>/releases/latest/download/agentic-workstation-mac-arm64.dmg
   ```

3. **Удалить приложение**, а с `clean` - и данные. Каждый путь - отдельной проверкой на
   существование:

   ```
   rm -rf "/Applications/Agentic Workstation.app" && echo "удалено: приложение"
   ```

   Только с `clean`:

   ```
   ID=io.github.crmapache.agenticworkstation
   for p in "$HOME/Library/Application Support/Agentic Workstation" \
            "$HOME/Library/Logs/Agentic Workstation" \
            "$HOME/Library/Caches/$ID" \
            "$HOME/Library/Preferences/$ID.plist" \
            "$HOME/Library/Saved Application State/$ID.savedState" \
            "$HOME/Library/HTTPStorages/$ID"; do
     [ -e "$p" ] && rm -rf "$p" && echo "удалено: $p"
   done
   ```

   `Application Support/Agentic Workstation` - это проекты, вкладки и разговоры, локальная история
   файлов, настройки, входы коннекторов и добавленные аккаунты Claude. После `clean` их
   добавляют заново - сказать об этом в отчёте. Ключ шифрования IDE в связке ключей
   («Agentic Workstation Safe Storage») не трогать: без данных он ничего не открывает, а новая
   установка возьмёт его же.

4. **Поставить из dmg:**

   ```
   MOUNT_DIR=$(hdiutil attach "$STAGE/aw.dmg" -nobrowse -readonly | grep '/Volumes/' | tail -1 | awk -F'\t' '{print $NF}')
   cp -R "$MOUNT_DIR/Agentic Workstation.app" /Applications/
   hdiutil detach "$MOUNT_DIR" -quiet
   ```

5. **Снять карантин** - без Developer ID macOS иначе пишет «приложение повреждено»:

   ```
   xattr -cr "/Applications/Agentic Workstation.app"
   ```

6. **Запустить с чистым окружением и прибрать.** Голый `open` из сессии агента передал бы IDE
   окружение агента - его переменные Claude, и панель ходила бы в чужой аккаунт:

   ```
   env -i HOME="$HOME" USER="$USER" LOGNAME="$LOGNAME" PATH=/usr/bin:/bin:/usr/sbin:/sbin \
     /usr/bin/open "/Applications/Agentic Workstation.app"
   rm -rf "$STAGE"
   ```

7. **Версия** для отчёта:

   ```
   plutil -extract CFBundleShortVersionString raw -o - "/Applications/Agentic Workstation.app/Contents/Info.plist"
   ```

## Отчёт

По скиллу `human-output`, коротко: версия, остались ли данные
или удалены (что именно), запущена ли IDE. После `clean` - что войти в аккаунты Claude и
коннекторы придётся заново.
