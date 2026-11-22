import { createHash } from 'node:crypto'
import { rm, stat, mkdir, rename, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { VoiceLanguage } from '@shared/voice'

/**
 * Сколько живёт образец на диске: голос Deepgram за месяц не меняется, а запрос стоит секунд
 * ожидания и денег ключа.
 */
export const SAMPLE_KEEP_MS = 30 * 24 * 60 * 60 * 1000

/** Всё, от чего зависит звук образца: голос, язык, скорость и сама фраза. */
export type SampleRequest = { language: VoiceLanguage; voice: string; speed: number; text: string }

const sampleId = (request: SampleRequest): string =>
  createHash('sha256')
    .update(JSON.stringify([request.voice, request.language, request.speed, request.text]))
    .digest('hex')
    .slice(0, 32)

/**
 * Образцы голосов для «Прослушать» на диске: каждый синтезируется раз в месяц, повторное нажатие
 * играет сразу и в Deepgram не идёт. Два нажатия на один образец ждут одного синтеза, разные -
 * каждый свой. Образец старше месяца синтезируется заново, а при запуске IDE удаляется. Там же
 * живёт звук «Прочитать вслух» (ADR 0106): ключ тот же - голос, язык, скорость и текст.
 */
export class VoiceSamples {
  private readonly pending = new Map<string, Promise<Uint8Array | null>>()

  constructor(
    private readonly dir: string,
    private readonly now: () => number = Date.now,
  ) {}

  /** Образец с диска или от synthesize (он и сохраняется); null - синтез не удался. */
  get(
    request: SampleRequest,
    synthesize: () => Promise<Uint8Array | null>,
  ): Promise<Uint8Array | null> {
    const id = sampleId(request)
    const running = this.pending.get(id)

    if (running) return running

    const next = this.load(join(this.dir, `${id}.pcm`), synthesize).finally(() => {
      this.pending.delete(id)
    })

    this.pending.set(id, next)

    return next
  }

  /**
   * Звук с диска без синтеза; нет или старше месяца - null. Для чтения вслух, которое играет
   * синтез по кускам, пока он идёт, и кладёт целое в keep (ADR 0106).
   */
  peek(request: SampleRequest): Promise<Uint8Array | null> {
    return this.read(join(this.dir, `${sampleId(request)}.pcm`))
  }

  /** Положить готовый звук: чтение вслух дозвучало, звонок сказал ответ целиком. */
  keep(request: SampleRequest, pcm: Uint8Array): Promise<void> {
    return this.write(join(this.dir, `${sampleId(request)}.pcm`), pcm)
  }

  /** Удалить образцы старше месяца: голоса, которые больше не слушают, не копятся. */
  async prune(): Promise<void> {
    const names = await readdir(this.dir).catch(() => [])

    await Promise.all(
      names.map(async (name) => {
        const path = join(this.dir, name)
        const info = await stat(path).catch(() => null)

        if (info && this.isStale(info.mtimeMs)) await rm(path, { force: true })
      }),
    )
  }

  private isStale(writtenAt: number): boolean {
    return this.now() - writtenAt > SAMPLE_KEEP_MS
  }

  private async load(
    path: string,
    synthesize: () => Promise<Uint8Array | null>,
  ): Promise<Uint8Array | null> {
    const kept = await this.read(path)

    if (kept) return kept

    const pcm = await synthesize()

    if (pcm) await this.write(path, pcm)

    return pcm
  }

  private async read(path: string): Promise<Uint8Array | null> {
    const info = await stat(path).catch(() => null)

    if (!info || info.size === 0 || this.isStale(info.mtimeMs)) return null

    const data = await readFile(path).catch(() => null)

    return data ? new Uint8Array(data) : null
  }

  /** Через временный файл: оборванная запись не оставит половину образца под его именем. */
  private async write(path: string, pcm: Uint8Array): Promise<void> {
    const temp = `${path}.${process.pid}.tmp`

    try {
      await mkdir(this.dir, { recursive: true })
      await writeFile(temp, pcm)
      await rename(temp, path)
    } catch (error) {
      // Образец уже есть - он сыграет; не сохранился - синтезируется в следующий раз.
      console.warn('Voice: the voice sample was not saved', error)
      await rm(temp, { force: true })
    }
  }
}
