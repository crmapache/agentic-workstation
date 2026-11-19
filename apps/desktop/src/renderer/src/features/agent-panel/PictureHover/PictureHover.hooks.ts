import { useRef, useState, useEffect } from 'react'

import { ASK_AFTER_MS, LOADING_AFTER_MS } from '../picture.constants'
import { usePicture, usePictureKnown } from '../picture.queries'
import type { PictureSource } from '../picture.types'
import { useActiveProject } from '../../../state/workspace.queries'
import type { HoverShown } from './PictureHover.types'

/** Расшифровка не удалась: картинку не показать. */
const BROKEN = 'broken'

type Decoded = { url: string; width: number; height: number } | typeof BROKEN | null

/**
 * Превью картинки под курсором (как в ACC). Главный процесс спрашивается, только когда
 * курсор задержался на чипе, а то, что под рукой, - сразу. Показывается после расшифровки,
 * а не пустой рамкой; рамка ожидания - только если ответ идёт дольше LOADING_AFTER_MS.
 * Нажатие прячет превью: клик открывает картинку, и превью закрыло бы её.
 */
export const usePictureHover = (source: PictureSource) => {
  const projectId = useActiveProject()?.id ?? ''
  const isKnown = usePictureKnown()
  const anchorRef = useRef<HTMLSpanElement>(null)
  const popoverRef = useRef<HTMLSpanElement>(null)
  const askTimer = useRef<number | undefined>(undefined)
  const [isHovered, setIsHovered] = useState(false)
  const [isAsking, setIsAsking] = useState(false)
  const [isPatient, setIsPatient] = useState(false)
  const [decoded, setDecoded] = useState<Decoded>(null)
  const look = usePicture(projectId, source, isAsking, false)
  const readyUrl = isAsking && look.state === 'ready' ? look.url : null
  const readyWidth = look.state === 'ready' ? look.width : 0
  const readyHeight = look.state === 'ready' ? look.height : 0

  useEffect(() => {
    if (!readyUrl) return

    let isAlive = true
    const image = new Image()

    image.src = readyUrl
    image
      .decode()
      .then(() => {
        if (!isAlive) return
        // Свой размер у картинки, которую IDE не уменьшала и не мерила (SVG).
        const width = readyWidth || image.naturalWidth
        const height = readyHeight || image.naturalHeight

        setDecoded({ url: readyUrl, width, height })
      })
      .catch(() => isAlive && setDecoded(BROKEN))

    return () => {
      isAlive = false
    }
  }, [readyUrl, readyWidth, readyHeight])

  useEffect(() => {
    if (!isAsking) return

    const timer = window.setTimeout(() => setIsPatient(true), LOADING_AFTER_MS)

    return () => window.clearTimeout(timer)
  }, [isAsking])

  const shown: HoverShown = !isHovered
    ? null
    : decoded === BROKEN || (isAsking && look.state === 'missing')
      ? { state: 'missing' }
      : decoded
        ? { state: 'ready', ...decoded }
        : isPatient
          ? { state: 'loading' }
          : null

  useEffect(() => {
    const popover = popoverRef.current
    const anchor = anchorRef.current

    // Чип в поле ввода - узел поля, а не React: отправка убирает его со страницы раньше, чем
    // React снимет портал, а «курсор ушёл» удалённому узлу не приходит. Показ вне страницы
    // браузер отвергает исключением, и оно роняет всю панель. Снятое браузер прячет сам.
    if (!popover?.isConnected || !anchor) return

    const isOpen = popover.matches(':popover-open')

    if (shown && !isOpen) popover.showPopover({ source: anchor })
    else if (!shown && isOpen) popover.hidePopover()
  })

  const hide = () => {
    window.clearTimeout(askTimer.current)
    setIsHovered(false)
    setIsAsking(false)
    setIsPatient(false)
    setDecoded(null)
  }

  const handlePointerEnter = () => {
    // Экрану без наведения показывать превью не на чем, а касание не должно его вызывать.
    if (!window.matchMedia('(hover: hover)').matches) return

    setIsHovered(true)
    window.clearTimeout(askTimer.current)

    if (isKnown(projectId, source)) setIsAsking(true)
    else askTimer.current = window.setTimeout(() => setIsAsking(true), ASK_AFTER_MS)
  }

  return {
    anchorRef,
    popoverRef,
    shown,
    handlers: { onPointerEnter: handlePointerEnter, onPointerLeave: hide, onPointerDown: hide },
  }
}
