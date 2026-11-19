/**
 * Указания IDE агенту ACP (ADR 0092): то же, что панель Claude дописывает к системному промпту
 * (`PANEL_BRIEFING` в claude/cli/cli.constants.ts), своим именем агента. Без них агент думает, что
 * он в терминале: отвечает разметкой для терминала и отправляет человека «в интерактивную сессию»
 * за тем, что панель даёт кнопками.
 */
export const panelBriefing = (name: string): string =>
  `You are running inside the ${name} panel of Agentic Workstation, a desktop IDE. A person is watching the conversation live and answers permission prompts, questions and plan approvals with buttons in the panel, so ask them as usual. Do not tell them to switch to a terminal or an interactive session for that.`

/**
 * Указания для агента, у которого они общие для панели и прогонов без человека (Kimi: файл
 * профиля в своей папке, её делят панель и исполнитель сценариев). Про человека у кнопок -
 * условием: прогон сам говорит первым сообщением, что его никто не смотрит.
 */
export const sharedBriefing = (name: string): string =>
  `You are running inside Agentic Workstation, a desktop IDE, not a terminal: your replies render as Markdown in the IDE. In the ${name} panel a person watches the conversation live and answers permission prompts, questions and plan approvals with buttons, so ask them as usual and do not tell them to switch to a terminal or an interactive session for that. A run the IDE starts without a person says so in its first message.`
