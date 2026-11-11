---
name: release
description: Выпустить новую версию Agentic Workstation - поднять версию, прогнать проверки и сквозной тест обновления, собрать и подписать сертификатом проекта, проверить подпись, написать манифест обновлений и опубликовать dmg, zip и latest.json в публичный репозиторий релизов. Установленные копии увидят уведомление об обновлении. Использовать ТОЛЬКО по явной команде /release - это сборка и публичная заливка.
disable-model-invocation: true
argument-hint: '[patch|minor|major] [что нового - текст для уведомления]'
allowed-tools: Bash(pnpm *) Bash(npm --prefix *) Bash(node *) Bash(gh *) Bash(git status *) Bash(git add *) Bash(git commit *) Bash(git log *) Bash(security find-identity *) Bash(codesign *) Bash(plutil *) Bash(curl *) Bash(jq *) Bash(ls *) Bash(rm -rf apps/desktop/dist/mac-arm64)
---

# Release

Устройство релиза - `docs/releasing.md`, подпись - `docs/code-signing.md`, почему
так - `docs/adr/0004-self-update.md`. Все команды - из корня репозитория, без `cd`.

## Аргументы

`$ARGUMENTS`: первое слово - `patch` (по умолчанию), `minor` или `major`; остальное -
что нового, одной-двумя фразами. Это текст, который увидят в уведомлении. Не задан -
составь сам из `git log` с прошлого релиза, по-английски, коротко и по делу.

## 0. Предусловия - любое не выполнено, остановись и скажи, что сделать

```
security find-identity -p codesigning | grep "Agentic Workstation Code Signing"
gh auth status
node -p "require('./apps/desktop/package.json').agenticWorkstation.releasesRepo"
gh repo view <репозиторий релизов> --json visibility -q .visibility
git status --porcelain
```

- Нет сертификата - `docs/code-signing.md`: сначала поискать копию
  `agentic-workstation-code-signing.p12` в корне и импортировать её. **Не создавать новый**,
  если пользователь не подтвердил, что сертификата ещё никогда не было: новый
  сертификат отключит обновления у всех установленных копий. Пометка
  `CSSMERR_TP_NOT_TRUSTED` - норма, доверие не нужно.
- Репозитория нет - создать его можно только с согласия пользователя
  (`docs/releasing.md`), это публичное действие. Создан 2026-10-16, переименован 2026-11-10.
- Репозиторий должен быть `PUBLIC`: приложение качает обновления без токена.
- Незакоммиченные правки - не мешают сборке, но шаг 7 тогда ничего не коммитит.

## 1. Версия

```
npm --prefix apps/desktop version ${тип:-patch} --no-git-tag-version
node -p "require('./apps/desktop/package.json').version"
```

Версию дальше каждый раз перечитывай этой же командой: shell-переменные между
вызовами не живут.

## 2. Проверки

```
pnpm check
pnpm --filter @agentic-workstation/desktop update:e2e
```

Оба должны пройти. Упало - откатить версию в `apps/desktop/package.json` и
остановиться с отчётом.

## 3. Сборка с подписью

```
AGENTIC_WORKSTATION_KEEP_UNPACKED=1 pnpm dist
```

## 4. Подпись и версия внутри - проверить до публикации

```
codesign -d -r- "apps/desktop/dist/mac-arm64/Agentic Workstation.app"
codesign --verify --deep --strict "apps/desktop/dist/mac-arm64/Agentic Workstation.app"
plutil -extract CFBundleShortVersionString raw -o - "apps/desktop/dist/mac-arm64/Agentic Workstation.app/Contents/Info.plist"
```

- В правиле подписи должно быть `certificate leaf`. `cdhash` - сборка ушла с подписью
  ad-hoc: **не публиковать**, установленные копии её не примут.
- Версия в Info.plist - новая.

Потом убрать распакованное (Spotlight видит его как второе приложение):

```
rm -rf apps/desktop/dist/mac-arm64
```

## 5. Манифест

```
node apps/desktop/scripts/write-update-manifest.mjs \
  --zip apps/desktop/dist/agentic-workstation-mac-arm64.zip \
  --version <версия> \
  --base-url https://github.com/<репозиторий релизов>/releases/download/v<версия> \
  --notes "<что нового>"
```

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
  apps/desktop/dist/latest.json
```

Проверить, что установленные копии увидят именно его:

```
curl -sL https://github.com/<репозиторий релизов>/releases/latest/download/latest.json | jq -r .version
```

## 7. Версия в git

```
git status --porcelain
```

Ровно одна строка про `apps/desktop/package.json` - закоммитить:

```
git add apps/desktop/package.json
git commit -m "chore(desktop): release <версия>"
```

Есть что-то ещё - ничего не коммитить, рядом чужая работа. В любом случае **не
пушить**: push делает пользователь.

## 8. Отчёт

По скиллу `human-output`, коротко: версия, ссылка на релиз, постоянная ссылка на dmg
(`https://github.com/<репозиторий релизов>/releases/latest/download/agentic-workstation-mac-arm64.dmg`),
что стало с версией в git (закоммичена или оставлена и почему).
