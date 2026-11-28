---
paths:
  - 'apps/desktop/src/main/voice/**'
  - 'apps/desktop/src/main/remote/voice/**'
  - 'apps/desktop/src/main/agents/conversation/voice-note.ts'
  - 'apps/desktop/src/renderer/src/features/voice/**'
  - 'apps/phone/src/features/voice-call/**'
  - 'apps/phone/src/features/read-aloud/**'
  - 'apps/desktop/src/renderer/src/features/agent-panel/ReadAloudButton/**'
  - 'apps/desktop/src/renderer/src/state/read-aloud.store.ts'
  - 'packages/voice-audio/**'
  - 'packages/remote-protocol/src/audio-frame.ts'
---

# Голосовой режим (ADR 0104)

Карта - раздел «Голосовой режим» в `docs/architecture.md`, план и журнал - `docs/plan-voice/`.

- **Ключ Deepgram - только в главном процессе.** Он лежит в `voice.vault`, окну уходит лишь
  хвост из четырёх знаков, телефону и релею - ничего, в журнал - никогда. В Deepgram ходит
  только `main/voice/deepgram/`; окно и телефон - конечные точки звонка, а не клиенты Deepgram.
- **Голосовые правила агенту - скрытой пометкой к реплике** (`voice-note.ts`), а не системным
  промптом: CLI читает промпт только при запуске. Новый провайдер - пометка в его отправке и
  разбор в повторе журнала, как у заметки редактора.
- **Flux TTS (замер 2026-11-21):** ответ агента - один ход (фразы `Speak` по мере появления,
  `Flush` - конец ответа), звук идёт до `Flush`. `Interrupt` берёт место от начала сессии,
  снимает и ходы в очереди, после него сессия считается от места обрыва; звук, что ещё летит, -
  выкинуть до `SpeechInterrupted`. Конец звука хода - `SpeechMetadata`, не `Flushed`.
- **Эпоха ответа:** перебили - новая эпоха (`stopPlayback`); конечная точка выкидывает
  непроигранное и кадры прежних эпох и считает проигранное заново. Без этого место обрыва врёт.
- **Звук телефона - телом внутри SEALED** (`audio-frame.ts`), никогда в очереди: линии нет -
  кадр пропадает (`RemoteAgent.stream`). Кнопки и отчёт о проигранном - словом `voice`.
- **Голос - по языку текста, который он читает** (ADR 0106, `speech/text-language.ts`), не по
  ярлыку Flux: на смешанной речи Flux назвал русскую реплику `pt`. Цитата в кавычках язык не
  меняет; пока ответ пишется и улик мало, фразы ждут.
- **«Стоп» замолкает у конечной точки сразу** (`AnswerPlayer.hush`), IDE на «Стоп» всегда
  начинает новую эпоху: путь до IDE и обратно - не повод звучать дальше.
- **«Прочитать вслух»** - тот же фильтр фраз и тот же ключ кэша (`voice-samples`), что у ответа
  звонка: тогда сказанное звонком целиком кнопка играет с диска. Оборванное на диск не идёт.
- **Safari:** динамик и микрофон телефона готовятся прямо в нажатии кнопки
  (`PhoneCallEngine.prepare`), иначе звук не заведётся. Страница скрыта - звонок на паузе,
  Deepgram закрыт, минуты не идут.
- **Показ Walkthrough (ADR 0134) - тот же звонок** режима `walkthrough` в выбранном разговоре
  панели, а не новый в Home. Всё, что должно идти после слов модели, а не раньше (метка, действие
  Computer Use), ждёт `VoiceCall.speechSoFar`: сначала лента показывает идущий инструмент (текст
  перед ним уже во рту), потом `CallMouth.drained` - прозвучали ли ответы, которые рот держит
  сейчас. Ответы, начатые после, не ждутся: модель пишет следующую фразу, пока звучит текущая.
  Реплику, пока агент ждёт шага человека, забирает ожидание (`intercept`), а не чат.
- **Голос инструментов показа** (ADR 0135, `call-show.ts`): фразу подсветки и вопрос модель отдаёт
  инструментом, и звучат они `VoiceCall.say` - своим ходом синтеза, сразу за тем, что уже во рту.
  Вопрос отдельным ходом и со знаком вопроса синтез произносит вопросом (замер
  `bench/tts-intonation`). Реплика в показе - сразу короткий отклик звонка, без рода говорящего.
  Пока показ ждёт ответа или шага, звонок слушает (`VoiceCall.listen`): уши не считают агента
  занятым - иначе «да» выброшено как поддакивание, - и тихий сигнал молчит.
- **Новый внешний путь данных голоса** - сначала `apps/site/privacy/index.html` (правило
  главного процесса).
- **Проверка:** живой звонок на Deepgram - `AGENTIC_WORKSTATION_VOICE_E2E=1` с
  `DEEPGRAM_API_KEY` (`main/voice/voice-live.e2e.test.ts`). Окно - копия с микрофоном из WAV:
  `AGENTIC_WORKSTATION_AGENT_ARGS="--disable-features=AudioServiceSandbox
--use-fake-ui-for-media-stream --use-fake-device-for-media-stream
--use-file-for-fake-audio-capture=<файл.wav>%noloop"` (без снятия песочницы звука Chromium
  файл не прочтёт). Телефон - `pnpm --filter @agentic-workstation/phone e2e`
  (`e2e/voice.browser.test.ts`, `e2e/voice-buttons.browser.test.ts` - «Стоп» и «Read aloud»)
  и `e2e/voice-interop.test.ts` через настоящий релей.
