import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Указания IDE для Kimi Code (ADR 0092). Полем сессии их не передать, `--agent-file` перед `acp`
 * молча не действует (замерено на 2.7.0), а `SYSTEM.md` заменил бы промпт Kimi целиком. Остаётся
 * профиль в своей папке IDE: `agents/agent.md` с `override: true` заменяет встроенный профиль
 * `agent` - его Kimi берёт для каждой сессии ACP, - а `${base_prompt}` первой строкой возвращает
 * промпт Kimi как есть: указания только дописываются. Замерено: действует и в режиме плана,
 * инструменты те же (без `tools` профиль наследует встроенные). Переименует Kimi встроенный
 * профиль - файл перестанет действовать молча, а Kimi работает как без него.
 */
const PROFILE = 'agent'

/** Подстановка Kimi: промпт встроенного профиля, на место которого встаёт этот. */
const BASE_PROMPT = ['$', '{base_prompt}'].join('')

export const kimiProfileText = (briefing: string): string =>
  [
    '---',
    `name: ${PROFILE}`,
    'description: Kimi Code inside Agentic Workstation.',
    'override: true',
    '---',
    BASE_PROMPT,
    '',
    briefing,
    '',
  ].join('\n')

/** Записать профиль в папку Kimi (`KIMI_CODE_HOME`) - заново на каждый запуск IDE. */
export const writeKimiProfile = async (home: string, briefing: string): Promise<void> => {
  const dir = join(home, 'agents')

  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `${PROFILE}.md`), kimiProfileText(briefing))
}
