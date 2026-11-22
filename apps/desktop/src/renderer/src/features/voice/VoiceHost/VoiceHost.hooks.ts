import { useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { AnswerPlayer } from '@agentic-workstation/voice-audio/answer-player'
import type { MicCapture } from '@agentic-workstation/voice-audio/mic-capture'
import { startMicCapture } from '@agentic-workstation/voice-audio/mic-capture'
import { ReadingPlayer } from '@agentic-workstation/voice-audio/reading-player'

import { invoke } from '../../../lib/ipc'
import { useIpcEvent } from '../../../lib/ipc.hooks'
import { useActionNoticeStore } from '../../../state/action-notice.store'
import { useReadAloudStore } from '../../../state/read-aloud.store'
import { useVoice } from '../../../state/voice.queries'
import { ENDED_NOTICES } from './VoiceHost.constants'

/** Тон «соединено»: звонок готов слушать (spec, «Соединено»). */
const CONNECTED_TONE_HZ = 880

/**
 * Звук звонка из панели, пока он идёт: микрофон - кадрами в главный процесс, ответ - в динамик,
 * сигналы звонка - приглушить, сбросить, тон. Звонок с телефона окно не озвучивает: его звук
 * на телефоне. Микрофон не дался - трубка кладётся, а не висит немой.
 */
export const useDesktopCallAudio = () => {
  const { t } = useTranslation()
  const showNotice = useActionNoticeStore((state) => state.show)
  const call = useVoice()?.call
  const callId = call?.origin === 'desktop' ? call.id : null
  const muted = call?.muted ?? false
  const player = useRef<AnswerPlayer | null>(null)
  const mic = useRef<MicCapture | null>(null)
  const mutedNow = useRef(muted)

  useEffect(() => {
    mutedNow.current = muted
    mic.current?.setMuted(muted)
  }, [muted])

  useEffect(() => {
    if (!callId) return

    let ended = false
    const answers = new AnswerPlayer(
      (epoch, ms) => void invoke('voice:played', { callId, epoch, ms }),
    )

    player.current = answers
    answers.tone(CONNECTED_TONE_HZ)
    startMicCapture((pcm) => void invoke('voice:mic', { callId, pcm }))
      .then((capture) => {
        if (ended) return capture.stop()

        capture.setMuted(mutedNow.current)
        mic.current = capture
      })
      .catch((error: unknown) => {
        console.warn('Voice: no microphone', error)
        void invoke('voice:end', { callId })
      })

    return () => {
      ended = true
      mic.current?.stop()
      mic.current = null
      answers.close()
      player.current = null
    }
  }, [callId])

  useIpcEvent('voice:audio', ({ epoch, pcm }) => player.current?.play(epoch, pcm))
  useIpcEvent('voice:cue', (cue) => {
    if (cue.kind === 'duck') player.current?.duck(cue.level)
    else if (cue.kind === 'stopPlayback') player.current?.stop(cue.epoch)
    else if (cue.kind === 'tone') player.current?.tone()
    else if (cue.kind === 'ended') {
      const notice = ENDED_NOTICES[cue.reason]

      if (notice) showNotice({ tone: 'danger', title: t(notice) })
    }
  })
}

/**
 * Звук «Прочитать вслух» (ADR 0106): куски чтения окна - в динамик, пока это чтение то, что идёт
 * в сторе. Стоп или новое чтение - прежний звук молкнет; сорвался синтез - строка в углу окна,
 * а то, что успело прийти, дозвучит.
 */
export const useReadAloudAudio = () => {
  const { t } = useTranslation()
  const showNotice = useActionNoticeStore((state) => state.show)
  const readingId = useReadAloudStore((state) => state.current?.readingId ?? null)
  const player = useRef<{ readingId: string; player: ReadingPlayer } | null>(null)

  useEffect(() => {
    if (player.current?.readingId === readingId) return

    player.current?.player.stop()
    player.current = null
  }, [readingId])

  useEffect(() => () => player.current?.player.stop(), [])

  useIpcEvent('voice:reading', (event) => {
    const { current, playing, finish } = useReadAloudStore.getState()
    const id = event.readingId

    if (current?.readingId !== id) return

    if (event.kind === 'audio') {
      player.current ??= { readingId: id, player: new ReadingPlayer(() => finish(id)) }
      player.current.player.push(event.pcm)
      playing(id)

      return
    }

    if (event.outcome === 'failed') showNotice({ tone: 'danger', title: t('voice.read.failed') })

    if (event.outcome !== 'stopped' && player.current) player.current.player.finish()
    else finish(id)
  })
}
