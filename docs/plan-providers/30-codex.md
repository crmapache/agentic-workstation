# Этап 3. Панель Codex

Решения - ADR 0083 (своя панель на общем ядре). Справочник - `../amazing-codex` (плагин
владельца для JetBrains, Kotlin `src/main/kotlin/io/github/crmapache/amazingcodex/codex/`):
поведение и протокол берём оттуда, код не копируем и сам проект не трогаем. Установлен
Codex 0.163.0 (`/opt/homebrew/bin/codex`).

## Протокол (факты из amazing-codex и `codex --help`, 2026-11-18)

**Транспорт.** `codex app-server` через stdin/stdout, JSON-RPC построчно без поля
`jsonrpc`. Рукопожатие: `initialize {clientInfo:{name,title,version},
capabilities:{experimentalApi:true}}` и уведомление `initialized` (без experimentalApi план и
`requestUserInput` молча не работают); запросы до рукопожатия - в очередь. Запрос сервера -
сообщение с `method` и `id`; незнакомому - ошибка `-32601`. Таймауты: 30 с на запрос, 60 с
на рукопожатие. Остановка: закрыть stdin, через 3 с SIGTERM (SIGKILL оставляет процесс,
который держит замок писателя разговора). Аргумент запуска - только
`-c model_context_window=<N>` (и наши `-c` для коннекторов); остальное - запросами.
Процессы у плагина: один на разговор, один общий «каталог» (история, настройки, гаснет через 2
минуты простоя), разовые. Типы протокола: `codex app-server generate-ts --out <dir>` (747
файлов, 3 МБ) и `generate-json-schema`.

**Запросы.** Разговоры: `thread/start`, `thread/resume`, `thread/fork`, `thread/revert`
(0.160+), `thread/list`, `thread/turns/list`, `thread/name/set`, `thread/inject_items`,
`thread/compact/start`, `thread/unsubscribe`. Ходы: `turn/start`, `turn/steer`
(`expectedTurnId`), `turn/interrupt {threadId, turnId}`, `review/start`. Модели и аккаунт:
`model/list {includeHidden:false}`, `account/read {refreshToken:false}`,
`account/rateLimits/read`. Настройки: `config/read`, `config/batchWrite`,
`configRequirements/read`. MCP: `mcpServerStatus/list`, `mcpServer/oauth/login`,
`config/mcpServer/reload`; навыки - `skills/extraRoots/set`.

**`turn/start`.** `threadId`, `input[]` (`{type:"text",text}`, `{type:"image",url:"data:..."}`,
`{type:"skill",name,path}`), `approvalPolicy`, `sandboxPolicy`, `model?`, `effort` (null -
сброс), `serviceTier?`, `summary:"auto"`, `collaborationMode:{mode:"plan"|"default",
settings:{model, reasoning_effort, developer_instructions}}`. Модель на `turn/start` липнет к
следующим ходам: возврат к «по умолчанию» - модель по умолчанию явно, один раз.

**Уведомления.** `turn/started`, `turn/completed` (`completed`/`interrupted`/`failed`,
`error.codexErrorInfo`), `thread/started` (`parentThreadId` - субагент), `item/started`,
`item/completed`, `item/agentMessage/delta`, `item/reasoning/summaryTextDelta`,
`item/reasoning/textDelta`, `item/reasoning/summaryPartAdded`, `turn/plan/updated` (шаги
`pending`/`inProgress`/`completed`), `thread/tokenUsage/updated` (`tokenUsage.last`,
`modelContextWindow`), `account/rateLimits/updated` (частями - сливать), `error` (`willRetry` -
карточка повтора), `thread/compacted`, `model/rerouted`, `thread/name/updated`,
`serverRequest/resolved` (снять показанный вопрос), `mcpServer/startupStatus/updated`,
`warning`/`configWarning`/`deprecationNotice`. Вывод команды по ходу не шлётся - только
`aggregatedOutput` в конце.

**Элементы (`ThreadItem.type`).** `userMessage`, `agentMessage` (`phase: final_answer`),
`reasoning` (`summary[]`, `content[]`), `commandExecution` (`command`, `cwd`, `status`,
`commandActions`, `aggregatedOutput`, `exitCode`, `durationMs`), `fileChange` (`changes[]`:
`{path, kind: add|delete|update(move_path), diff}`, `status`), `mcpToolCall` (`server`,
`tool`, `arguments`, `result`, `error`), `dynamicToolCall`, `webSearch`, `imageView`,
`imageGeneration`, `collabAgentToolCall` (субагент), `plan`, `contextCompaction`,
`enteredReviewMode`/`exitedReviewMode`, `hookPrompt`, `functionCallOutput`.

**Вопросы сервера и ответы.**
`item/commandExecution/requestApproval` (`command`, `reason`, `itemId`,
`proposedExecpolicyAmendment`) → `{decision: accept|acceptForSession|decline}` или
`{decision:{acceptWithExecpolicyAmendment:{execpolicy_amendment}}}`;
`item/fileChange/requestApproval` → `{decision: accept|acceptForSession|decline}`;
`item/tool/requestUserInput` (`questions[]`) → `{answers:{<qid>:{answers:[...]}}}`;
`item/permissions/requestApproval` (`permissions.network`, `permissions.fileSystem`) →
`{permissions, scope: turn|session}`; `mcpServer/elicitation/request` (только `mode:url`) →
`{action: accept|decline, content:null, _meta:null}`. Без таймаутов. id вопроса в окне -
`codex-<эпоха>-<rpc id>`: id запросов RPC начинаются заново в каждом процессе.

**Режимы.** manual - `untrusted` + `workspace-write`; acceptEdits - `on-request` +
`workspace-write`; readOnly - `on-request` + `read-only`; plan - `on-request` + `read-only` +
`collaborationMode: plan`; bypass - `never` + `danger-full-access` (вопрос, пришедший в
bypass, - принять). `thread/start`/`resume` берут короткие имена песочницы, `turn/start` -
объект `sandboxPolicy` (`workspaceWrite` с `writableRoots`, `networkAccess`... из раздела
`[sandbox_workspace_write]` конфига человека). Режим, модель и усилие едут на каждом
`turn/start` - смена посреди разговора без перезапуска. План: ход кончается элементом `plan`,
`turn/completed` придерживается до решения человека, потом acceptEdits и «Implement the plan.».

**История.** Журналы - `~/.codex/sessions/YYYY/MM/DD/rollout-<время>-<uuid>.jsonl`, имена -
`~/.codex/session_index.jsonl`. Список - `thread/list {limit, sortKey:"updated_at",
cwd:[paths], cursor}`; страница - `thread/turns/list {threadId, limit:10,
sortDirection:"desc", itemsView:"full", cursor}` (вопросов с вариантами в ответе нет - их
читают из файла журнала). Продолжить - `thread/resume {threadId, cwd, model,
approvalPolicy, sandbox, excludeTurns:true}`. Один писатель на разговор. Форк -
`thread/fork {threadId, lastTurnId, excludeTurns:true}` (с 0.163 файл форка ссылается на
источник). Откат - `thread/revert {threadId, beforeTurnId}`; копий файлов Codex не держит -
код возвращается обратными патчами `fileChange`. Побочный вопрос - эфемерный `thread/fork`
(`ephemeral:true`) с выключенными субагентами, приложениями, плагинами и MCP.

**Модели и усилие.** `model/list`: `model|id`, `displayName`, `description`, `isDefault`,
`hidden`, `supportedReasoningEfforts[].reasoningEffort`, `defaultReasoningEffort`,
`serviceTiers`. Уровни: `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, `ultra` - у каждой
модели свои, неподдержанный Codex молча игнорирует. Быстрый режим - `serviceTier`
`priority`/`default` на каждом ходе. Окна контекста - `~/.codex/models_cache.json`.

**Аккаунты и лимиты.** Вход - `codex login` (или `--with-api-key`) в терминале IDE. Статус -
`account/read` → `{type: chatgpt|apiKey, email, planType}`. Несколько аккаунтов - свой
`CODEX_HOME` на аккаунт (свой `auth.json`, остальное из `~/.codex` ссылками),
`CODEX_SQLITE_HOME` - `~/.codex`; `OPENAI_API_KEY`, `CODEX_API_KEY`, `CODEX_ACCESS_TOKEN` -
пустыми, а не удалёнными. Лимиты - `account/rateLimits/read`: `rateLimitsByLimitId`
(`codex` - главный), `primary`/`secondary {usedPercent, windowDurationMins, resetsAt}`.

**MCP.** amazing-codex правит конфиг человека (`codex mcp add`) - нам так нельзя (ADR 0029:
только коннекторы IDE). Наш путь - `-c mcp_servers.<имя>.url=...` и
`-c mcp_servers.<имя>.bearer_token_env_var=...` на запуске (ключи есть в 0.163), токен - в
окружении процесса; свои серверы человека из конфига Codex - `-c
mcp_servers.<имя>.enabled=false` (список - `codex mcp list --json`).

**Навыки, промпты, команды.** Навык - элемент ввода `{type:"skill"}`; папки `.codex/skills`,
`.agents/skills`, `.claude/skills`, `~/.codex/skills`, `~/.agents/skills`. `/prompts:<имя>` -
`~/.codex/prompts/<имя>.md` (`$1..$9`, `$ARGUMENTS`) раскрывает панель. Команды `/` app-server
не знает: `/compact` → `thread/compact/start`, `/clear` и `/new` → новый разговор, `/review` →
`review/start`, `/rename` → `thread/name/set`, остальное - команды панели. Текст посреди хода -
`turn/steer`.

## Как ложится на ядро (ADR 0083)

- `main/codex/` - драйвер: клиент app-server (JSON-RPC), поиск CLI, сессия `CodexSession`
  (AgentSession), перевод элементов в общую ленту (вид действия `command`, `edit`/`write` из
  `fileChange` с ханками из `diff`, `mcp`, `web`, `agent`, `plan`, `question`), вопросы
  разрешения, режимы, модели, история через процесс-каталог, аккаунты, лимиты, коннекторы.
- `CodexService extends AgentPanel` - своё состояние на диске (`codex.json`), `PanelDriver`
  (история - `thread/list`, имя - из списка, форк - `thread/fork`, переименование -
  `thread/name/set`), `ConversationOps` (откат файлов - обратные патчи силами ядра, откат
  разговора - `thread/revert`, картинки - из журнала, задач нет).
- Реестр панелей - `panels.add('codex', codex)`; события `agent:*` с провайдером `codex`.
- Окно: вид `codex` в полосе с иконкой Codex, `CodexPanel` = провайдер `codex` + `PanelFrame`;
  хранилища интерфейса, экраны меню, режимы и усилие - по провайдеру (шаг 2.5в).
- id сессии: у Claude его выбираем мы, у Codex - `threadId` от сервера. В ядре - пусто до
  первого `thread/start`, потом id потока; продолжение - `thread/resume`.

## Шаги

- [x] 3.1 Клиент app-server: процесс, построчный JSON-RPC, рукопожатие, запросы с
      таймаутом, уведомления, запросы сервера, остановка без сирот (группа процессов IDE).
      Типы нужного подмножества протокола - руками в `main/codex/protocol/`, тест сверяет
      их с `generate-json-schema` установленного Codex (нет Codex - тест пропускается).
- [x] 3.2 Поиск CLI (путь из настроек, PATH login shell, обычные папки), версия, процесс-каталог
      (модели, аккаунт, лимиты, список разговоров), гаснет после простоя.
- [x] 3.3 Сессия и лента: `codex/conversation/` - `CodexSession` (поток `thread/start` или
      `resume`, `turn/start` с `clientUserMessageId`, `turn/steer`, `turn/interrupt`),
      `codex-router.ts` (ход, элементы и куски, план, контекст, повтор, имя потока, снятый
      вопрос), `codex-requests.ts` и `codex-modes.ts`, `codex-feed.ts` (лента для ядра),
      `codexDriver`. Общие кирпичи вынесены в ядро: учёт ходов, конец хода
      (`settleTurn`), команды `!` (`agents/shell/shell-runs.ts`). Проверено: разговор на
      поддельном сервере (ход, вопрос разрешения) и живой ход на Codex 0.163 (ответ «OK»).
      Отложено: история ходов при продолжении (3.6), заметка редактора и картинки из журнала
      (3.9), `PanelDriver.newSessionId` (3.5).
- [x] 3.4 Вопросы: команда, правка, права, вопрос с вариантами, MCP по ссылке; режимы и план.
      План: ход режима плана, предложивший план (элемент `plan`), кончается вопросом панели
      (`codex-plan.ts`), очередь ждёт; одобрение - режим «Авто» и «Implement the plan.»,
      отказ с замечанием - замечание следующим ходом. `collaborationMode` едет на каждом ходе:
      Codex держит его на следующие ходы, и без явного `default` после одобрения он планировал
      бы дальше (поймано в живой проверке). Режим «Read only» (`readOnly` в общем перечне
      режимов, у Claude его нет). Вопрос с вариантами: без вариантов - сразу поле, без «Other»
      где Codex его не принимает, секретный ответ скрыт, ответ одним куском. «Разрешить и
      дальше» у Codex - «Allow for this chat». Выбор модели, усилия и режима проверяется по
      возможностям провайдера (раньше «Ultra» у Codex отклонялся). Stop при вопросе после хода
      снимает вопрос. Проверено в копии окна: план, одобрение, работа в «Авто».
- [x] 3.5 `CodexService` и окно: реестр, вид `codex` с иконкой, хранилища и экраны по
      провайдеру (2.5в), модели и усилие из каталога Codex, режимы Codex в меню MODE.
      Сверх плана: слова панели по провайдеру, режимы под именами Codex, новая вкладка в
      «Auto»; модель и усилие «по умолчанию» уходят явно - из настроек Codex для проекта
      (`config/read`), иначе из каталога, потому что Codex держит выбор на следующие ходы;
      заметка о редакторе словами терминала Codex (часть 3.9); размышления без разметки;
      правки Codex видит локальная история. Проверено в копии окна: ход с вопросом
      разрешения и правкой, ход с открытым файлом, меню и экраны Codex, раздельные меню
      панелей, панель Claude без изменений.
- [x] 3.6 История, продолжение, имя, форк, откат разговора.
      Прошлые ходы - из журнала (`thread/turns/list`, по 10, свежие первыми) тем же сборщиком
      ленты: последняя страница при открытии, ранние - «раньше» и прыжком к закреплённому;
      сообщение человека - под id панели (`clientId`), команды «!» карточками, заметка о
      редакторе - строкой. Журнал ходов (`codex-turn-log.ts`) переводит сообщение в ход для
      форка и отката. Форк - `thread/fork` сессией самой вкладки при первом запуске (у потока
      один писатель: поток, созданный процессом-каталогом, вкладка не продолжала - «already has
      an active writer», `thread/unsubscribe` не отпускает), до того вкладка показывает
      источник до точки со швом. Откат - `thread/revert` сессией разговора (поднимается, если её
      нет). В ядре `PanelDriver.forkOrigin` стал `forkSession` (id сессии и откуда ответвлён).
      Проверено в копии окна: два хода, форк с унаследованным разговором, ход в форке, откат -
      Codex забыл откатанный ход.
- [x] 3.6б Откат кода у Codex: копий файлов он не держит - обратные патчи `fileChange` после
      сообщения, только если файл с тех пор не трогали; иначе - отказ с причиной.
      `codex-reverse-patch.ts` (кусок - по номеру строки или единственному совпадению),
      `codex-code-rewind.ts` (сухой прогон всех правок с последней, запись только если сошлось
      всё; созданный агентом файл уходит, удалённый возвращается). Новое состояние
      предпросмотра `changedSince` - и в окне, и в протоколе телефона. Проверено в копии окна:
      правка Codex, откат «Both» - файл вернулся, разговор откатился.
- [x] 3.7а Вход и лимиты: вход через сам Codex, без терминала - `account/login/start`
      (ссылка в браузер, возврат ловит Codex, `account/login/completed`), отмена, выход
      (`account/logout`); каталог не гаснет, пока вход идёт. Общие каналы `agent:signIn`,
      `cancelSignIn`, `checkSignIn`, `signOut` у обоих провайдеров; старые каналы входа Claude
      убраны. Экран входа и экран аккаунтов - общие, слова провайдера; «кто вошёл»: сбой ответа -
      неизвестно, а не «не вошёл»; без входа OpenAI (свой ключ) - вошёл. Лимиты по ходу работы -
      `account/rateLimits/updated` у процесса разговора и каталога. Проверено: экран входа на
      пустой папке Codex в копии окна, живой тест начала и отмены входа (выход на настоящем
      аккаунте не проверялся - он разлогинил бы Codex человека).
- [x] 3.7б Несколько аккаунтов Codex: свой `CODEX_HOME` на аккаунт (свой `auth.json`,
      остальное - ссылками на `~/.codex`), выбор, имя, забыть, лимиты каждого.
      `account/codex-accounts.ts` (список в `codex-accounts.json`, папки в userData,
      `CODEX_SQLITE_HOME` - общий, ключи из окружения пустые), `account/codex-account-desk.ts`
      (вход в текущий - его каталогом, в новый и прочие - своим каталогом с его CODEX_HOME;
      дубль по почте не встаёт; лимиты не текущих - разовым каталогом). Действия с аккаунтами -
      общими каналами `agent:addAccount`, `selectAccount`, `renameAccount`, `forgetAccount`
      у обоих провайдеров; экран аккаунтов общий (Claude Design и импорт из ACC - только у
      Claude). Окна лимитов Codex - общими именами (`session`, `weekly`). Проверено: экран
      аккаунта Codex в копии окна (обычный вход, почта, тариф, лимиты); добавление и выход
      вживую не нажимались - открыли бы браузер и разлогинили бы Codex человека, это
      проверено тестами на поддельных каталогах.
- [x] 3.8 Коннекторы IDE через `-c mcp_servers`, свои серверы человека выключены.
      Шлюз выдаёт процессу ключ и список серверов (`McpLaunch.servers`, `token`); Codex
      получает каждый сервер целиком встроенной таблицей
      `-c mcp_servers.<имя>={url=..., bearer_token_env_var="AGENTIC_WORKSTATION_GATEWAY_TOKEN"}`,
      ключ - в окружении процесса. Свои серверы человека (`codex mcp list --json`) -
      `{<транспорт>, enabled=false}`: флаг пути внутри сервера заменяет его таблицу, и Codex
      отвергал сервер без транспорта («invalid transport», поймано вживую). Мост
      `codex-connectors-bridge.ts`: новый или удалённый коннектор перезапускает процессы
      проекта, перемена внутри сервера - `config/mcpServer/reload`. Проверено в копии окна:
      Codex вызвал `list_notifications` коннектора IDE через шлюз.
- [x] 3.9 Навыки, свои промпты, команды `/`.
      Навыки проекта - `skills/list` (каталогом при открытии вкладки, сессией при старте) -
      командами «/» проекта; «/навык слова» уходит элементом ввода `skill`. Встроенные команды
      провайдера - список в возможностях (`commands`): у Codex `/compact`
      (`thread/compact/start`, сжатие подписано ручным) и `/review [что смотреть]`
      (`review/start`, inline). Картинки сообщений целиком - из памяти разговора, живого и
      подгруженного. Пустое сообщение Codex (бывает в ревью) в ленту не встаёт. Свои промпты
      (`~/.codex/prompts`) Codex раскрывает только в своём терминале, в протоколе их нет -
      не делаются; их место заняли навыки. Проверено в копии окна: подсказка «/», `/review`
      нашёл подменённое сложение, `/compact` сжал разговор.
- [x] 3.10 Ревью этапа; живая проверка после правок - шагом 3.12.
      Четыре ревьюера (архитектура окна, граница процессов, радиус поражения, прослеживание
      сценариев) - 25 находок, исправлены все. Главное: - аккаунты: выход - из аккаунта своей строки (не текущего) его каталогом; действия с
      аккаунтами идут по очереди, «забыть» посреди входа сначала снимает вход, чужой id -
      ничего; лимиты не текущих - не чаще минуты на аккаунт; дубль сверяется с живой почтой
      аккаунта в работе, а кто вошёл в него, запоминается, только если поменялось; - вход: отмена, пока Codex ещё выдаёт ссылку, снимает вход у Codex; ссылка - только сайт
      через общий путь наружу; устаревший запуск каталога после смены аккаунта не встаёт; - процесс Codex: общая папка `~/.codex` - из окружения запуска Codex (CODEX_HOME из
      профиля оболочки), на Windows файлы - жёсткими ссылками, копия - только без ключей и
      освежается; ключ шлюза у Codex - только в памяти и окружении процесса, без файла
      (`GatewayLaunch` против `McpLaunch` с путём у Claude); список своих серверов MCP не
      прочёлся - предупреждение в журнал; - лента и ход: навык после перезапуска снова «/имя», команды «!» перед навыком не
      теряются; «Авто» и «Спрашивать» берут свои папки для записи и сеть человека из
      `[sandbox_workspace_write]` (`config/read`), как терминал; - откат кода: удаление и перенос файла, только внутри проекта, сверка перед записью и
      возврат записанного при сбое; - окно: ⌘W, фокус и кусок «Send to Chat» - только видной панели, спокойные шкалы -
      только выбранной; точки зова и знак работы на вкладках проектов - по разговорам всех
      панелей; `/effort` снова от меньшего к большему; экран «CLI не найден» не читает
      поиск Claude в панели Codex; запрет режима без вопросов слоями настроек - признаком
      `settingsLayers` и одним хуком; иконки и тона режимов - одни на окно
      (`lib/permission-modes.constants.ts`); общий каркас панели - `PanelFrame/`.
      Чего список своих серверов не ловит: серверы приложения Codex (`codex_apps`) в
      `codex mcp list` не видны, процессы IDE их не выключают.
- [x] 3.11 Быстрый режим Codex - уровень обслуживания `priority` («Fast» в каталоге), как в
      amazing-codex. Найдено при сверке плана: в шагах 3.1-3.10 его не было. Просьба
      трёхзначная и живёт с разговором (`Conversation.fastMode`: нет - как в конфиге Codex,
      true - `priority`, false - `default`; «выключено» теперь хранится и наследуется форком).
      Уровень едет с открытием потока и каждым ходом (`codex-fast.ts`, `tierField`): Codex
      держит его на следующие ходы, но только в этом процессе. Правду говорит Codex -
      `serviceTier` ответа на открытие потока и `thread/settings/updated`; ответ сверяется в
      конце хода (`fastReportOf`): `pending` - просьба ещё не уехала, `model_not_allowed` - у
      модели нет быстрого уровня по каталогу, `not_served` - Codex ответил другим уровнем;
      отказ - строкой FAST в ленте, раз на причину. Каталог - `serviceTiers` у `model/list`
      (`ModelInfo.fast`). Модель без уровня снимает просьбу панели. Общее окну: режим из
      настроек CLI показывается включённым «из настроек» (`fromSettings`), переключатель и
      `/fast` идут от показанного (`isFastModeChecked`), «по умолчанию» без своей строки в
      каталоге - модель каталога по умолчанию. Слова Codex - «лимиты уходят быстрее», без
      обещания множителя.
- [x] 3.12 Живая проверка в копии окна после ревью и быстрого режима: GPT-6.1 Terra, «Fast
      mode» включён - Codex подтвердил быстрый уровень, знак ↯ горит, строка меню «On»;
      коннектор IDE с ключом шлюза только в памяти - Codex вызвал `list_notifications`;
      панель Claude рядом не задета.
- [x] 3.13 Вливание в `main` - по команде владельца (2026-11-18, вместе с этапами 4 и 5).
