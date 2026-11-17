import { useRef, useState, useEffect, useLayoutEffect } from 'react'
import type { RefObject, SyntheticEvent } from 'react'

import type { ImageFile } from '../image-file.queries'
import { watchOutsideFiles } from '../outside-watch'
import { useSelectionStore } from '../../../state/selection.store'
import type { Size, ImageZoom, ZoomAnchor, ScreenPoint } from './ImageView.types'
import { anchorOf, fitScale, zoomStep, wheelScale, contentSize } from './ImageView.utils'

/**
 * Картинка вне проекта на виду - под слежением, как открытый текст вне проекта: агент
 * перезаписал скриншот - вкладка показывает новый. Картинку проекта видит слежение проекта.
 */
export const useWatchOutsideImage = (projectId: string, path: string) => {
  useEffect(() => {
    watchOutsideFiles('image', [{ projectId, path }])

    return () => watchOutsideFiles('image', [])
  }, [projectId, path])
}

/**
 * Картинку, которую показывали, удалили на диске - вкладка закрывается сама, как у текста
 * без своих правок (WebStorm так же). Открыли то, чего уже нет, - вкладка остаётся и
 * говорит, что файла нет.
 */
export const useCloseWhenGone = (projectId: string, path: string, image: ImageFile | undefined) => {
  const closeTabs = useSelectionStore((state) => state.closeTabs)
  const wasShown = useRef(false)

  useEffect(() => {
    if (image?.kind === 'image') wasShown.current = true
    else if (image?.kind === 'missing' && wasShown.current) closeTabs(projectId, [path])
  }, [closeTabs, projectId, path, image])
}

/**
 * Место под картинку - без полей. Первый замер - сразу, до кадра: иначе картинка успела бы
 * нарисоваться не вписанной. Спрятанный вид (размер ноль) прежнее место не теряет.
 */
const useRoom = (ref: RefObject<HTMLElement | null>): Size | null => {
  const [room, setRoom] = useState<Size | null>(null)

  useLayoutEffect(() => {
    const element = ref.current

    if (!element) return

    const keep = ({ width, height }: Size) => {
      if (width > 0 && height > 0) setRoom({ width, height })
    }
    const observer = new ResizeObserver(([entry]) => entry && keep(entry.contentRect))

    keep(contentSize(element))
    observer.observe(element)

    return () => observer.disconnect()
  }, [ref])

  return room
}

/**
 * Масштаб картинки: сначала вписана, дальше - кнопки, щипок тачпада и колесо с ⌘ (Ctrl на
 * Windows), двойной щелчок - «свой размер» и обратно. Масштаб держится за точку под
 * курсором, у кнопок - за середину места: что разглядывали, то и остаётся перед глазами.
 */
export const useImageZoom = () => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [zoom, setZoom] = useState<ImageZoom>('fit')
  const [natural, setNatural] = useState<Size | null>(null)
  // Рамка картинки с обеих сторон: она снаружи размера и вписываться должна вместе с ним.
  const [frame, setFrame] = useState(0)
  const room = useRoom(scrollRef)
  const anchor = useRef<ZoomAnchor | null>(null)
  const scale =
    zoom === 'fit'
      ? natural && room
        ? fitScale(natural, { width: room.width - frame, height: room.height - frame })
        : 1
      : zoom
  const scaleRef = useRef(scale)

  useLayoutEffect(() => {
    scaleRef.current = scale
  }, [scale])

  // Новый масштаб уже нарисован: прокрутить так, чтобы та же точка картинки стояла под тем же
  // местом экрана. Картинка меньше места стоит по центру - прокручивать нечего.
  useLayoutEffect(() => {
    const point = anchor.current
    const image = imageRef.current
    const scroll = scrollRef.current

    anchor.current = null
    if (!point || !image || !scroll) return

    const box = image.getBoundingClientRect()

    scroll.scrollLeft += box.left + point.partX * box.width - point.x
    scroll.scrollTop += box.top + point.partY * box.height - point.y
  }, [scale])

  // Щипок тачпада приходит колесом с ctrlKey. Слушатель не пассивный: иначе не отменить
  // прокрутку, и вместе с масштабом ехал бы лист.
  useEffect(() => {
    const scroll = scrollRef.current

    if (!scroll) return

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return

      const next = wheelScale(scaleRef.current, event.deltaY)

      event.preventDefault()
      if (next === scaleRef.current) return

      // Щипок шлёт события чаще кадров: следующее считает от этого, а не от нарисованного.
      anchor.current = anchorOf(imageRef.current, scroll, event)
      scaleRef.current = next
      setZoom(next)
    }

    scroll.addEventListener('wheel', handleWheel, { passive: false })

    return () => scroll.removeEventListener('wheel', handleWheel)
  }, [])

  const zoomTo = (next: number, at?: ScreenPoint) => {
    if (next !== scale) anchor.current = anchorOf(imageRef.current, scrollRef.current, at)

    setZoom(next)
  }

  const handleLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight, offsetWidth, clientWidth } = event.currentTarget

    setNatural({ width: naturalWidth, height: naturalHeight })
    setFrame(offsetWidth - clientWidth)
  }

  const handleDoubleClick = (event: ScreenPoint) =>
    zoom === 'fit' ? zoomTo(1, event) : setZoom('fit')

  const handleZoom = (direction: 1 | -1) => zoomTo(zoomStep(scale, direction))

  const handleFit = () => setZoom('fit')

  const handleActualSize = () => zoomTo(1)

  return {
    scrollRef,
    imageRef,
    zoom,
    scale,
    natural,
    // Размер картинки и место уже известны: можно показывать, не мигнув чужим размером.
    isMeasured: natural !== null && room !== null,
    handleLoad,
    handleDoubleClick,
    handleZoom,
    handleFit,
    handleActualSize,
  }
}
