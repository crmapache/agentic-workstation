import workletUrl from './mic-worklet.ts?worker&url'

/** Микрофон звонка в окне: остановить или заглушить, не кладя трубку. */
export type MicCapture = { stop: () => void; setMuted: (muted: boolean) => void }

/**
 * Микрофон в кадры PCM16 16 кГц по 80 мс. Эхоподавление Chromium - включено (агент говорит из
 * тех же динамиков), шумоподавление - выключено: Deepgram советует проверять без него, иначе
 * теряются тихие и короткие слова (spec, «Защита от ложных срабатываний»). Заглушённый микрофон
 * шлёт тишину: Flux держит соединение, а минуты считает за всю длину звонка всё равно.
 */
export const startMicCapture = async (onFrame: (pcm: Uint8Array) => void): Promise<MicCapture> => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: true,
      channelCount: 1,
    },
  })
  const context = new AudioContext()

  await context.audioWorklet.addModule(workletUrl)

  const source = context.createMediaStreamSource(stream)
  const frames = new AudioWorkletNode(context, 'mic-frames')
  // Ворклет считает, только если граф доходит до выхода: выход - беззвучный.
  const silent = context.createGain()
  let muted = false

  silent.gain.value = 0
  frames.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    const pcm = new Uint8Array(event.data)

    onFrame(muted ? new Uint8Array(pcm.byteLength) : pcm)
  }
  source.connect(frames)
  frames.connect(silent)
  silent.connect(context.destination)

  return {
    stop: () => {
      frames.port.onmessage = null
      for (const track of stream.getTracks()) track.stop()
      void context.close()
    },
    setMuted: (next) => {
      muted = next
    },
  }
}
