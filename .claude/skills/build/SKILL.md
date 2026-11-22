---
name: build
description: Быстро выпустить новую версию Agentic Workstation для macOS и Windows - поднять версию, собрать обе сборки одним скриптом (мак подписан сертификатом проекта, Windows - установщик NSIS прямо на этом Mac), подписать установщик Windows ключом выпуска, написать манифест обновлений и опубликовать в публичный репозиторий релизов, а релей Remote Control с телефонным клиентом выложить, если их код поменялся. Установленные копии увидят уведомление об обновлении. Использовать ТОЛЬКО по явной команде /build - это сборка и публичная заливка.
disable-model-invocation: true
argument-hint: '[patch|minor|major] [что нового - текст для уведомления]'
allowed-tools: Bash(bash apps/desktop/scripts/build-release.sh) Bash(bash apps/relay/scripts/relay-deploy.sh --yes --if-changed) Bash(npm --prefix *) Bash(node *) Bash(gh *) Bash(git status *) Bash(git add *) Bash(git commit *) Bash(git push *) Bash(git log *) Bash(security find-identity *) Bash(curl *) Bash(jq *) Bash(test *)
---

# Build

Выпуск должен быть **быстрым**: продуктом пользуется один человек, владелец. Поэтому здесь нет
ни `pnpm check`, ни `update:e2e` - они при разработке. Не добавляй их и не запускай «на всякий
случай». Остаются только мгновенные проверки, без которых сломаются обновления: подпись мака
сертификатом проекта и подпись установщика Windows ключом выпуска.

Выпуск - это и телефон: его клиент раздаёт релей, и без выкладки релея правки телефона и
протокола до него не доходят. Поэтому в конце релей выкладывается сам, если его код или код
телефона поменялся (шаг 5).

Устройство выпуска - `docs/releasing.md`, подписи - `docs/code-signing.md`. Все команды - из корня
репозитория, без `cd`. Репозиторий релизов - `crmapache/agentic-workstation-releases`
(`agenticWorkstation.releasesRepo` в `apps/desktop/package.json`).

## Аргументы

`$ARGUMENTS`: первое слово - `patch` (по умолчанию), `minor` или `major`; остальное - что нового,
одной фразой. Это текст уведомления. Не задан - одна короткая фраза по-английски из `git log` с
прошлого релиза.

## 1. Предусловия и версия - одной командой

```
security find-identity -p codesigning | grep -c "Agentic Workstation Code Signing" && test -f agentic-workstation-update-signing.pem && npm --prefix apps/desktop version ${тип:-patch} --no-git-tag-version && node -p "require('./apps/desktop/package.json').version"
```

- Нет сертификата мака - `docs/code-signing.md`: импортировать копию
  `agentic-workstation-code-signing.p12` из корня. **Новый не создавать**: он отключит обновления
  у всех установленных копий.
- Нет ключа `agentic-workstation-update-signing.pem` - остановиться. **Новый не создавать**:
  открытый ключ вшит в копии на Windows.

## 2. Сборка

```
bash apps/desktop/scripts/build-release.sh
```

Код собирается один раз, мак и Windows упаковываются параллельно (около минуты). Скрипт сам
проверяет, что мак подписан сертификатом проекта, и убирает распакованное. Упал - показать хвост
журнала, который он напечатал, и остановиться.

## 3. Манифест и публикация - одной командой

```
V=$(node -p "require('./apps/desktop/package.json').version") && R=crmapache/agentic-workstation-releases && NOTES="<что нового>" && \
node apps/desktop/scripts/write-update-manifest.mjs --zip apps/desktop/dist/agentic-workstation-mac-arm64.zip --win apps/desktop/dist/agentic-workstation-win-x64.exe --version $V --base-url https://github.com/$R/releases/download/v$V --notes "$NOTES" && \
test "$(jq -r '.assets["win-x64"].signature | length' apps/desktop/dist/latest.json)" -gt 0 && \
gh release create v$V --repo $R --title "Agentic Workstation $V" --notes "$NOTES" apps/desktop/dist/agentic-workstation-mac-arm64.dmg apps/desktop/dist/agentic-workstation-mac-arm64.zip apps/desktop/dist/agentic-workstation-win-x64.exe apps/desktop/dist/latest.json && \
curl -sL https://github.com/$R/releases/latest/download/latest.json | jq -r '.version + " " + (.assets | keys | join(" "))'
```

В конце - новая версия и `mac-arm64 win-x64`. Релиз с таким тегом уже есть - `gh` откажет;
молча не перезаписывать, сказать.

## 4. Коммит и пуш всего

Выпуск собран из рабочей копии как есть, поэтому в git уходит всё, что в него вошло, а не
только версия. Сначала взгляд на изменения:

```
git status --porcelain --untracked-files=all
```

Секретов (`.pem`, `.p12`, `.env`) и артефактов сборки (`.dmg`, `.zip`, `.exe`, журналы) там быть
не должно; есть - остановиться и сказать. Иначе закоммитить всё и запушить, не спрашивая.
Сообщение - что нового в выпуске и его номер; поменялась одна версия - `chore(desktop): release
<версия>`:

```
git add -A && git commit -m "feat: <что нового>, release <версия>" && git push
```

## 5. Релей и телефон - после пуша

```
bash apps/relay/scripts/relay-deploy.sh --yes --if-changed
```

Запускать в фоне (`run_in_background`): образ собирается на сервере несколько минут, а выпуск
IDE к этому моменту уже готов. После коммита, а не раньше: метка выкладки - коммит, и только
так следующий выпуск узнает, что на сервере тот же код. Скрипт сам сверяет релей, телефон, общие
пакеты и lock-файл с выложенной сборкой: ничего не поменялось - сервер не трогает и говорит
«уже на этом коде». Выкладка на секунду рвёт сокеты, IDE и телефоны переподключаются сами.
Упала - хвост журнала в отчёт; выпуск IDE это не отменяет.

## 6. Отчёт

Коротко: версия, ссылка на релиз, коммит и пуш, релей - выложен, не нужен или упал (итог - когда
фоновая выкладка кончится). Ссылки на установщики постоянные:

```
https://github.com/crmapache/agentic-workstation-releases/releases/latest/download/agentic-workstation-mac-arm64.dmg
https://github.com/crmapache/agentic-workstation-releases/releases/latest/download/agentic-workstation-win-x64.exe
```
