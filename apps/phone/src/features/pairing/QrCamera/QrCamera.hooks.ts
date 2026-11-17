import { useRef, useState, useEffect, useEffectEvent } from 'react'
import type jsQR from 'jsqr'

import { FRAME_MAX, SCAN_INTERVAL_MS, CAMERA_CONSTRAINTS } from './QrCamera.constants'
import type { CameraState } from './QrCamera.types'
import { frameSize, cameraProblemOf } from './QrCamera.utils'

type Decode = typeof jsQR

const stopStream = (stream: MediaStream | null) => {
  for (const track of stream?.getTracks() ?? []) track.stop()
}

/** Текст QR в текущем кадре видео или null: кадр ужат до FRAME_MAX и разобран jsQR. */
const readFrame = (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  decode: Decode,
): string | null => {
  if (!video.videoWidth || !video.videoHeight) return null

  const { width, height } = frameSize(video.videoWidth, video.videoHeight, FRAME_MAX)
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) return null

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }

  context.drawImage(video, 0, 0, width, height)

  const { data } = context.getImageData(0, 0, width, height)

  // QR пары IDE рисует тёмным по светлому (RemoteModal.utils): без попытки инверсии разбор вдвое быстрее.
  return decode(data, width, height, { inversionAttempts: 'dontInvert' })?.data ?? null
}

/**
 * Камера для QR: поток задней камеры в видео и разбор кадра раз в SCAN_INTERVAL_MS; разборщик
 * грузится только здесь, остальным экранам он не нужен. Страница ушла в фон - камера гаснет (iOS
 * всё равно её глушит), вернулась - включается снова: так подхватывается и разрешение, выданное
 * в настройках, без перезагрузки.
 */
export const useQrCamera = (onText: (text: string) => void) => {
  const supported = typeof navigator.mediaDevices?.getUserMedia === 'function'
  const videoRef = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<CameraState>(() =>
    supported ? { kind: 'starting' } : { kind: 'problem', problem: 'unsupported' },
  )
  const [attempt, setAttempt] = useState(0)
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden')
  const handleText = useEffectEvent(onText)

  useEffect(() => {
    if (!supported) return

    const handleVisibility = () => {
      const nowHidden = document.visibilityState === 'hidden'

      setHidden(nowHidden)

      if (!nowHidden) setState({ kind: 'starting' })
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [supported])

  useEffect(() => {
    const video = videoRef.current

    if (!supported || hidden || !video) return

    const canvas = document.createElement('canvas')
    let alive = true
    let stream: MediaStream | null = null
    let timer = 0
    // Тот же код в кадре держится секундами: экрану он нужен один раз, а не пять раз в секунду.
    let last: string | null = null

    const scan = (decode: Decode) => {
      const text = readFrame(video, canvas, decode)

      if (text && text !== last) {
        last = text
        handleText(text)
      }

      if (alive) timer = window.setTimeout(() => scan(decode), SCAN_INTERVAL_MS)
    }

    const start = async () => {
      const got = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS)

      if (!alive) {
        stopStream(got)

        return
      }

      stream = got
      video.srcObject = got

      const [{ default: decode }] = await Promise.all([import('jsqr'), video.play()])

      if (!alive) return

      setState({ kind: 'live' })
      scan(decode)
    }

    void start().catch((error: unknown) => {
      if (!alive) return

      // Камеру дали, а дальше не вышло (видео, разборщик): поток не должен остаться гореть.
      stopStream(stream)
      stream = null
      setState({ kind: 'problem', problem: cameraProblemOf(error) })
    })

    return () => {
      alive = false
      window.clearTimeout(timer)
      stopStream(stream)
      video.srcObject = null
    }
  }, [supported, hidden, attempt])

  const retry = () => {
    setState({ kind: 'starting' })
    setAttempt((count) => count + 1)
  }

  return { videoRef, state, retry }
}
