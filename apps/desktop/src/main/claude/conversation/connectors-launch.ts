/**
 * Конфиг коннекторов IDE для одного процесса разговора (ADR 0029): файл для
 * `--mcp-config`; own - чей это процесс (разговор и его папка), release - процесс кончился
 * (ключ шлюза и процессы команд гаснут, сессия браузера ждёт следующий процесс разговора),
 * idle - работа разговора встала (курсор агента в Chrome и капсула Computer уходят), end -
 * разговор закрыт насовсем (вкладки браузера закрываются сразу).
 */
export type ConnectorsLaunch = {
  path: string
  own: (owner: { conversationId: string; workDir: string }) => void
  release: () => void
  idle: () => void
  end: () => void
}
