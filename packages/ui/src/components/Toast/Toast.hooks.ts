import {
  useRef,
  useState,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useSyncExternalStore,
} from 'react'
import type { FocusEvent } from 'react'

import { FOLD_SLACK_PX, COUNTDOWN_LENGTH } from './Toast.constants'

const subscribeToWindowFocus = (onChange: () => void) => {
  window.addEventListener('focus', onChange)
  window.addEventListener('blur', onChange)

  return () => {
    window.removeEventListener('focus', onChange)
    window.removeEventListener('blur', onChange)
  }
}

const isWindowFocused = () => document.hasFocus()

/**
 * Отсчёт до самозакрытия карточки (ToastClose.autoCloseMs). Часы - сама анимация дуги кольца
 * (Web Animations): у кольца и таймера одна пауза, и они не расходятся. Стоит, пока над карточкой
 * мышь, внутри фокус с клавиатуры или окно не в фокусе: человек читает или его нет рядом, а
 * прочесть он должен успеть. Нет autoCloseMs - отсчёта нет, крестик просто закрывает.
 */
export const useCountdown = (ms: number | undefined, onDone: () => void) => {
  const arcRef = useRef<SVGCircleElement>(null)
  const animationRef = useRef<Animation | null>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const isWindowActive = useSyncExternalStore(subscribeToWindowFocus, isWindowFocused)
  const finish = useEffectEvent(onDone)
  const isHeld = isHovered || isFocused || !isWindowActive

  useEffect(() => {
    const arc = arcRef.current

    if (ms === undefined || !arc) return

    // Дуга уходит по часовой стрелке от двенадцати: пустое место растёт, как за стрелкой часов.
    const animation = arc.animate(
      [{ strokeDashoffset: 0 }, { strokeDashoffset: -COUNTDOWN_LENGTH }],
      { duration: ms, easing: 'linear', fill: 'forwards' },
    )

    animation.onfinish = () => finish()
    animationRef.current = animation

    return () => {
      animation.cancel()
      animationRef.current = null
    }
  }, [ms])

  useEffect(() => {
    const animation = animationRef.current

    // Кончившийся отсчёт не перезапускать: play() после конца начал бы его заново.
    if (!animation || animation.playState === 'finished') return

    if (isHeld) animation.pause()
    else animation.play()
  }, [isHeld, ms])

  const handleFocus = (event: FocusEvent<HTMLElement>) =>
    // Держит только фокус с клавиатуры: кнопка, нажатая мышью, тоже получает фокус, и карточка
    // висела бы, пока не щёлкнут где-то ещё.
    setIsFocused(event.target.matches(':focus-visible'))

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setIsFocused(false)
  }

  return {
    arcRef,
    holdProps: {
      onPointerEnter: () => setIsHovered(true),
      onPointerLeave: () => setIsHovered(false),
      onFocus: handleFocus,
      onBlur: handleBlur,
    },
  }
}

/**
 * Свёрнутое длинное пояснение карточки (ToastProps.more). Обрезано ли оно, видно только у
 * свёрнутого: у раскрытого нет потолка строк, и пока карточка раскрыта, ответ держится прежним.
 * Мерит ResizeObserver: его первый ответ приходит после раскладки, до отрисовки, так что стрелка
 * встаёт в том же кадре. Наблюдение заводится заново на каждый новый текст: у обрезанного блока
 * высота не меняется, когда текста становится ещё больше, а ширину и размер текста он ловит сам.
 */
export const useFold = (text: string | undefined, isEnabled: boolean) => {
  const textRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isCut, setIsCut] = useState(false)
  const canFold = isEnabled && Boolean(text) && isCut
  // Пояснение пропало или сворачивать его больше не просят - и раскрытого больше нет.
  const isExpanded = isOpen && canFold

  useLayoutEffect(() => {
    const node = textRef.current

    if (!node || !isEnabled || isExpanded) return

    const observer = new ResizeObserver(() =>
      setIsCut(node.scrollHeight - node.clientHeight > FOLD_SLACK_PX),
    )

    observer.observe(node)

    return () => observer.disconnect()
  }, [text, isEnabled, isExpanded])

  const toggle = () => {
    // Свёрнутое показывает первые строки: прокрутка раскрытого иначе осталась бы в обрезанном
    // блоке, и под многоточием стояла бы середина текста.
    if (isExpanded && textRef.current) textRef.current.scrollTop = 0

    setIsOpen(!isExpanded)
  }

  return { textRef, isExpanded, canFold, toggle }
}
