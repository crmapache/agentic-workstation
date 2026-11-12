import { useRef, useState, useEffect } from 'react'

import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'

import { windowsClipboardKeys } from '../terminal-clipboard'
import { unseenPart, listenOutput } from '../terminal-output'
import { terminalTheme, terminalTypography } from '../terminal-theme'
import { ACK_BATCH, SCROLLBACK_LINES } from '../terminal.constants'
import { useTerminalStore } from '../terminal.store'
import { invoke } from '../../../lib/ipc'
import { IS_MAC } from '../../../lib/platform'
import { onTextSizeApplied } from '../../../state/text-size.store'

/** Ссылка из вывода - в браузер: обработчик окна открывает только http и https. */
const openLink = (_event: MouseEvent, uri: string) => window.open(uri, '_blank', 'noopener')

/**
 * xterm.js одной сессии: подключается к живой оболочке хвостом её вывода (terminal:replay),
 * дальше рисует поток и шлёт нажатия. Дорисованное подтверждает пачками - иначе главный
 * процесс поставит оболочку на паузу. Размер в знаках - по листу: замер, когда лист виден.
 */
export const useXterm = (sessionId: string, isActive: boolean) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const [isOpened, setIsOpened] = useState(false)
  const focusPending = useTerminalStore((store) => store.focusPending)
  const focusTaken = useTerminalStore((store) => store.focusTaken)

  useEffect(() => {
    const host = hostRef.current

    if (!host) return

    let disposed = false
    let seen: number | null = null
    let unacked = 0
    const queued: Parameters<typeof unseenPart>[0][] = []
    const term = new Terminal({
      ...terminalTypography(),
      theme: terminalTheme(),
      allowTransparency: true,
      scrollback: SCROLLBACK_LINES,
      cursorBlink: true,
      macOptionIsMeta: true,
    })
    const fit = new FitAddon()
    const ack = (chars: number) => {
      unacked += chars
      if (unacked < ACK_BATCH) return

      void invoke('terminal:ack', { sessionId, chars: unacked })
      unacked = 0
    }
    const show = (data: string) => {
      if (data) term.write(data, () => ack(data.length))
    }
    const refit = () => {
      if (!disposed && host.offsetWidth > 0 && host.offsetHeight > 0) fit.fit()
    }
    const stopListening = listenOutput(sessionId, (output) => {
      if (seen === null) {
        queued.push(output)

        return
      }

      show(unseenPart(output, seen))
      seen = Math.max(seen, output.end)
    })
    const observer = new ResizeObserver(refit)
    const stopTextSize = onTextSizeApplied(() => {
      term.options.fontSize = terminalTypography().fontSize
      refit()
    })

    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon(openLink))
    if (!IS_MAC) term.attachCustomKeyEventHandler(windowsClipboardKeys(term))
    term.onData((data) => void invoke('terminal:write', { sessionId, data }))
    term.onResize(({ cols, rows }) => void invoke('terminal:resize', { sessionId, cols, rows }))
    termRef.current = term

    // Шрифт кода - веб-шрифт: xterm мерит ширину знака при открытии, и до загрузки шрифта
    // клетки вышли бы шириной запасного.
    void document.fonts
      .load(`${term.options.fontSize}px ${term.options.fontFamily}`)
      .catch(() => undefined)
      .then(async () => {
        if (disposed) return

        term.open(host)
        observer.observe(host)
        refit()
        setIsOpened(true)

        const replay = await invoke('terminal:replay', { sessionId })

        if (disposed) return

        term.write(replay?.data ?? '')
        seen = replay?.end ?? 0
        for (const output of queued.splice(0)) {
          show(unseenPart(output, seen))
          seen = Math.max(seen, output.end)
        }
      })

    return () => {
      disposed = true
      stopListening()
      stopTextSize()
      observer.disconnect()
      termRef.current = null
      term.dispose()
    }
  }, [sessionId])

  // Просьба о фокусе (кнопка терминала, ⌥F12, выбор вкладки) - выбранной вкладке, как только
  // её терминал открыт.
  useEffect(() => {
    if (!isActive || !focusPending || !isOpened) return

    termRef.current?.focus()
    focusTaken()
  }, [isActive, focusPending, isOpened, focusTaken])

  return hostRef
}
