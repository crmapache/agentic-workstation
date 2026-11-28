import type { Spoken, ShowCue } from '../voice/call/call-show'
import type { Timer } from '../voice/call/utterances'

/**
 * Звонок показа в разговоре, каким его видит показ (ADR 0134, 0135): id (по нему метка узнаёт, что
 * звонок тот же, - обёртку каждый раз дают новую), такт голоса (VoiceCall.speechSoFar), фразы
 * инструментов своим ходом голоса, ожидание человека и конец.
 */
export type WalkthroughCall = {
  id: string
  speechSoFar: () => Promise<Spoken>
  /** Фраза модели из инструмента: встаёт во рот сразу за словами, что там уже есть. */
  say: (text: string) => Spoken
  /** Фраза звонка о молчании человека на вопрос. */
  cue: (cue: ShowCue) => Spoken
  /** Показ ждёт ответа или шага человека: для ушей агент не занят, тихий сигнал молчит. */
  listen: (on: boolean) => void
  /** Человек сейчас говорит. */
  hearing: () => boolean
  /** Положить трубку: модель договорила (hangup) или человек молчит на важный вопрос (silence). */
  end: (reason?: 'hangup' | 'silence') => void
}

/**
 * Дольше этого голос не ждём: синтез завис или конечная точка молчит о проигранном - метка и
 * действие идут, а не висят вечно. Самая длинная фраза показа звучит заметно меньше.
 */
export const SPEECH_WAIT_MAX_MS = 45_000

/** Прозвучит ли фраза - но не дольше SPEECH_WAIT_MAX_MS: тогда «да». */
export const boundedSpeech = (spoken: Promise<boolean>, timer: Timer): Promise<boolean> => {
  let cancel = (): void => undefined
  const late = new Promise<boolean>((resolve) => {
    cancel = timer(() => resolve(true), SPEECH_WAIT_MAX_MS)
  })

  return Promise.race([spoken, late]).finally(cancel)
}
