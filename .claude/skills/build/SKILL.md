---
name: build
description: Выпустить новую версию Agentic Workstation для macOS и Windows - поднять версию, прогнать проверки и сквозной тест обновления, собрать мак (подпись сертификатом проекта) и Windows (установщик NSIS прямо на этом Mac, кросс-сборка), подписать установщик Windows ключом выпуска, написать манифест обновлений и опубликовать всё в публичный репозиторий релизов. Установленные копии на обеих системах увидят уведомление об обновлении. Использовать ТОЛЬКО по явной команде /build - это сборка и публичная заливка.
disable-model-invocation: true
argument-hint: '[patch|minor|major] [что нового - текст для уведомления]'
allowed-tools: Bash(pnpm *) Bash(npm --prefix *) Bash(node *) Bash(gh *) Bash(git status *) Bash(git add *) Bash(git commit *) Bash(git push *) Bash(git log *) Bash(security find-identity *) Bash(codesign *) Bash(plutil *) Bash(curl *) Bash(jq *) Bash(ls *) Bash(test *) Bash(rm -rf apps/desktop/dist/mac-arm64) Bash(rm -rf apps/desktop/dist/win-unpacked)
---

# Build

Устройство выпуска - `docs/releasing.md`, подписи - `docs/code-signing.md`, почему так -
`docs/adr/0004-self-update.md` (мак) и `docs/adr/0048-windows.md` (Windows). Все команды - из
корня репозитория, без `cd`: рабочая папка Bash сохраняется между вызовами, и `cd` молча
сдвинул бы её для всех следующих шагов.

Обе сборки делает этот Mac. Windows собирается без второго компьютера и без Wine: установщик
NSIS для Apple Silicon electron-builder качает сам (`toolsets.nsis` в `electron-builder.yml`).

## Аргументы

`$ARGUMENTS`: первое слово - `patch` (по умолчанию), `minor` или `major`; остальное - что
нового, одной-двумя фразами. Это текст, который увидят в уведомлении. Не задан - составь сам
из `git log` с прошлого релиза, по-английски, коротко и по делу.

## 0. Предусловия - любое не выполнено, остановись и скажи, что сделать

```
security find-identity -p codesigning | grep "Agentic Workstation Code Signing"
test -f agentic-workstation-update-signing.pem && echo "update key ok"
gh auth status
node -p "require('./apps/desktop/package.json').agenticWorkstation.releasesRepo"
gh repo view <репозиторий релизов> --json visibility -q .visibility
git status --porcelain
```

- **Нет сертификата мака** - `docs/code-signing.md`: сначала поискать копию
  `agentic-workstation-code-signing.p12` в корне и импортировать её. **Не создавать новый**,
  если пользователь не подтвердил, что сертификата ещё никогда не было: новый сертификат
  отключит обновления у всех установленных копий на маке. Пометка `CSSMERR_TP_NOT_TRUSTED` -
  норма, доверие не нужно.
- **Нет ключа подписи обновлений Windows** (`agentic-workstation-update-signing.pem` в корне) -
  остановиться. **Не создавать новый**: открытый ключ вшит в установленные копии на Windows,
  с другим ключом они обновление не примут. Ключ восстанавливается только из копии
  (`docs/code-signing.md`).
- Репозитория нет - создать его можно только с согласия пользователя (`docs/releasing.md`),
  это публичное действие.
- Репозиторий должен быть `PUBLIC`: приложение качает обновления без токена.
- Незакоммиченные правки сборке не мешают, но тогда шаг 8 ничего не коммитит.

## 1. Версия

```
npm --prefix apps/desktop version ${тип:-patch} --no-git-tag-version
node -p "require('./apps/desktop/package.json').version"
```

Версию дальше каждый раз перечитывай этой же командой: shell-переменные между вызовами не
живут.

## 2. Проверки

```
pnpm check
pnpm --filter @agentic-workstation/desktop update:e2e
```

Оба должны пройти. Упало - откатить версию в `apps/desktop/package.json` и остановиться с
отчётом.

## 3. Мак: сборка с подписью и проверка

```
AGENTIC_WORKSTATION_KEEP_UNPACKED=1 pnpm dist
codesign -d -r- "apps/desktop/dist/mac-arm64/Agentic Workstation.app"
codesign --verify --deep --strict "apps/desktop/dist/mac-arm64/Agentic Workstation.app"
plutil -extract CFBundleShortVersionString raw -o - "apps/desktop/dist/mac-arm64/Agentic Workstation.app/Contents/Info.plist"
```

- В правиле подписи должно быть `certificate leaf`. `cdhash` - сборка ушла с подписью ad-hoc:
  **не публиковать**, установленные копии её не примут.
- Версия в Info.plist - новая.

Потом убрать распакованное (Spotlight видит его как второе приложение):

```
rm -rf apps/desktop/dist/mac-arm64
```

## 4. Windows: сборка и проверка версии

```
AGENTIC_WORKSTATION_KEEP_UNPACKED=1 pnpm dist:win
node apps/desktop/scripts/asar-version.mjs apps/desktop/dist/win-unpacked/resources/app.asar
rm -rf apps/desktop/dist/win-unpacked
```

Версия внутри - новая. Итог - `apps/desktop/dist/agentic-workstation-win-x64.exe`, установщик
на одного человека, без прав администратора. Упало на `spawn ... -86` («Bad CPU type») - кто-то
убрал `toolsets.nsis` из `electron-builder.yml`.

## 5. Манифест

```
node apps/desktop/scripts/write-update-manifest.mjs \
  --zip apps/desktop/dist/agentic-workstation-mac-arm64.zip \
  --win apps/desktop/dist/agentic-workstation-win-x64.exe \
  --version <версия> \
  --base-url https://github.com/<репозиторий релизов>/releases/download/v<версия> \
  --notes "<что нового>"
```

Скрипт подписывает установщик Windows ключом выпуска. Проверить, что подпись есть:

```
jq -r '.assets["win-x64"].signature | length' apps/desktop/dist/latest.json
```

Ноль - **не публиковать**: копии на Windows обновление отвергнут.

## 6. Публикация

Тег одноразовый: если релиз уже есть - остановиться, молча не перезаписывать.

```
gh release view v<версия> --repo <репозиторий релизов>
```

«release not found» - норма, публикуем:

```
gh release create v<версия> --repo <репозиторий релизов> \
  --title "Agentic Workstation <версия>" --notes "<что нового>" \
  apps/desktop/dist/agentic-workstation-mac-arm64.dmg \
  apps/desktop/dist/agentic-workstation-mac-arm64.zip \
  apps/desktop/dist/agentic-workstation-win-x64.exe \
  apps/desktop/dist/latest.json
```

## 7. Установленные копии увидят именно его

```
curl -sL https://github.com/<репозиторий релизов>/releases/latest/download/latest.json | jq -r '.version, (.assets | keys | join(" "))'
```

Новая версия и обе сборки: `mac-arm64 win-x64`.

## 8. Версия в git - если она единственное, что изменилось

```
git status --porcelain
```

Ровно одна строка про `apps/desktop/package.json` - закоммитить и запушить, не спрашивая:
версия уже уехала в релиз, и оставлять её незакоммиченной вреднее.

```
git add apps/desktop/package.json
git commit -m "chore(desktop): release <версия>"
git push
```

Есть что-то ещё - **ничего не коммитить и не пушить**: рядом чужая незакоммиченная работа.
Сказать об этом в отчёте.

## 9. Отчёт

По скиллу `human-output`, коротко: версия, ссылка на релиз, постоянные ссылки на установщики,
что стало с версией в git (закоммичена и запушена либо оставлена и почему):

```
https://github.com/<репозиторий релизов>/releases/latest/download/agentic-workstation-mac-arm64.dmg
https://github.com/<репозиторий релизов>/releases/latest/download/agentic-workstation-win-x64.exe
```
