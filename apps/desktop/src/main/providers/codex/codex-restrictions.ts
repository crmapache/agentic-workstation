/**
 * Встроенные инструменты Codex, которые выключаются, когда разговору нельзя ни команд, ни
 * файлов (разовый вопрос служебной работы, разговор о коннекторе): песочница «только чтение»
 * запрещает запись, но читать с её разрешения можно весь диск, а веб-поиск унёс бы прочитанное
 * наружу. Остаются ответ модели, веб-поиск (если дан) и инструменты шлюза поимённо
 * (`enabled_tools`). Имена - из `codex features list` (Codex 0.163).
 */
const BUILT_IN_TOOLS = [
  'shell_tool',
  'unified_exec',
  'apps',
  'multi_agent',
  'browser_use',
  'browser_use_external',
  'computer_use',
  'in_app_browser',
  'image_generation',
  'view_image',
  'plugins',
  'hooks',
]

/** Флаги `-c` процесса Codex без встроенных инструментов. */
export const noBuiltInToolsArgs = (): string[] =>
  BUILT_IN_TOOLS.flatMap((feature) => ['-c', `features.${feature}=false`])
