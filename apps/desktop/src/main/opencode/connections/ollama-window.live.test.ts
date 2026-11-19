import { it, expect, describe } from 'vitest'

import { loadOllamaModel, probeConnection } from './connection-probe'

const base = process.env['AGENTIC_WORKSTATION_OLLAMA_LIVE'] ?? ''
const model = process.env['AGENTIC_WORKSTATION_OLLAMA_MODEL'] ?? ''

/**
 * Настоящая Ollama: окно модели до загрузки - догадка, после - то, что сервер назвал в
 * `/api/ps`. Модель он на время теста выгружает. Только по переменным, лучше на своём сервере
 * со своей папкой моделей: `AGENTIC_WORKSTATION_OLLAMA_LIVE=http://127.0.0.1:11999
 * AGENTIC_WORKSTATION_OLLAMA_MODEL=qwen3:0.6b npx vitest run ollama-window.live`.
 */
describe.skipIf(!base || !model)('окно Ollama вживую', () => {
  it('загруженная модель называет окно, и проба отдаёт его, а не предел модели', async () => {
    await fetch(`${base}/api/generate`, {
      method: 'POST',
      body: JSON.stringify({ model, keep_alive: 0 }),
    })

    const target = { kind: 'ollama' as const, baseUrl: base, key: '' }
    const before = await probeConnection(target)

    expect(before.state).toBe('ok')
    expect(before.models.some((one) => one.id === model)).toBe(true)

    await loadOllamaModel(base, model)

    const after = await probeConnection(target, fetch, before.serverWindow)
    const ps = (await (await fetch(`${base}/api/ps`)).json()) as {
      models: { name: string; context_length: number }[]
    }
    const real = ps.models.find((one) => one.name === model)?.context_length

    expect(real).toBeGreaterThan(0)
    expect(after.models.find((one) => one.id === model)?.context).toBe(real)
    expect(after.unsure).not.toContain(model)
  }, 180_000)
})
