import { useRef, useState, useEffect, useEffectEvent, useSyncExternalStore } from 'react'
import type { FocusEvent } from 'react'

import { COUNTDOWN_LENGTH } from './Toast.constants'

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
