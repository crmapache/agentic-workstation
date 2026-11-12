import type { ChangeEvent, CSSProperties } from 'react'
import { useId } from 'react'

import { useChangeEnd } from './Slider.hooks'
import styles from './Slider.module.scss'
import type { SliderProps } from './Slider.types'
import { sliderFraction } from './Slider.utils'

/**
 * Ползунок числа: стрелки, Home и End, скринридер и сам жест - от нативного
 * `<input type="range">`, а рисунок свой. Тонкая шкала, заливка акцента до ручки и светлая
 * ручка с ореолом под курсором. Заливка - отдельный слой под ручкой: градиента в стиле нет
 * (ADR 0006), а у Chromium своей заливки шкалы нет.
 */
export const Slider = ({
  label,
  hideLabel = false,
  value,
  min,
  max,
  step = 1,
  valueText,
  disabled = false,
  onChange,
  onChangeEnd,
}: SliderProps) => {
  const id = useId()
  const gestureEnd = useChangeEnd(onChangeEnd)
  const fill = { '--slider-fill': sliderFraction(value, min, max) } as CSSProperties

  const handleChange = (event: ChangeEvent<HTMLInputElement>) =>
    onChange(Number(event.currentTarget.value))

  return (
    <div className={styles.slider}>
      {!hideLabel && (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      )}
      <div className={styles.row}>
        {/* eslint-disable-next-line no-restricted-syntax -- доля заливки идёт за пальцем */}
        <div className={styles.track} style={fill}>
          <span className={styles.rail} aria-hidden />
          <span className={styles.fill} aria-hidden />
          <input
            id={id}
            type="range"
            className={styles.input}
            aria-label={hideLabel ? label : undefined}
            aria-valuetext={valueText}
            value={value}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onChange={handleChange}
            onPointerDown={gestureEnd.onPointerDown}
            onKeyUp={gestureEnd.onKeyUp}
          />
        </div>
        {valueText && <span className={styles.value}>{valueText}</span>}
      </div>
    </div>
  )
}
