import { join } from 'node:path'

import type { ServiceAi } from '@shared/service-ai'
import { parseServiceAi } from '@shared/service-ai'

import { broadcast } from '../ipc/broadcast'
import { JsonFile } from '../storage/json-file'

/**
 * Провайдер служебной работы IDE (Settings → AI): владелец настройки - здесь, на диске - свой
 * файл, окну - событием после каждой правки. Служебные работы спрашивают его в момент работы:
 * смена провайдера действует со следующего вопроса, без перезапуска.
 */
export class ServiceAiService {
  /** Записи по очереди: две подряд писали бы один временный файл разом. */
  private writing: Promise<void> = Promise.resolve()

  private constructor(
    private current: ServiceAi,
    private readonly file: JsonFile<ServiceAi>,
    private readonly onChange: (value: ServiceAi) => void,
  ) {}

  /** Своя настройка с диска; файла нет - умолчание (Claude Code, как было до настройки). */
  static async load(
    file: JsonFile<ServiceAi>,
    onChange: (value: ServiceAi) => void,
  ): Promise<ServiceAiService> {
    return new ServiceAiService(parseServiceAi(await file.read()), file, onChange)
  }

  /** Файл настройки в данных IDE; каждая правка - окну событием. */
  static open(userData: string): Promise<ServiceAiService> {
    return ServiceAiService.load(
      new JsonFile<ServiceAi>(join(userData, 'service-ai.json')),
      (value) => broadcast('serviceAi:changed', value),
    )
  }

  get value(): ServiceAi {
    return this.current
  }

  /**
   * Настройка из окна целиком; негодное в ней отбрасывается, а не пишется. В работу встаёт
   * только записанное: не записалось - служебная работа идёт на прежнем, окно видит ошибку.
   */
  async set(value: unknown): Promise<ServiceAi> {
    const next = parseServiceAi(value)

    this.writing = this.writing.catch(() => undefined).then(() => this.file.write(next))
    await this.writing
    this.current = next
    this.onChange(next)

    return next
  }
}
