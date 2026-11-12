import type { AxTreeResult } from '@agentic-workstation/browser-protocol/protocol'

import { formatAxSnapshot } from './ax-snapshot'
import type { AxNode, AxTree } from './ax-snapshot'
import { BrowserError } from './browser-error'
import { targetOf, MAIN_FRAME } from './frame-refs'
import type { ElementRef, SnapshotFrame } from './frame-refs'
import type { Page } from './page'

/**
 * Фреймы страницы для снимка и действий (ADR 0040). Дерево доступности Chrome отдаёт по одному
 * документу: у главного фрейма iframe - пустой узел. Документ фрейма своего процесса читается
 * той же сессией вкладки (`frameId`), фрейма другого процесса (cross-origin iframe) - его
 * сессией, к которой расширение подключилось само. Узлы фрейма другого процесса отвечают в
 * координатах его окна - к ним прибавляется место его элемента iframe на странице.
 */

/** Снимок большой страницы собирается секундами - с запасом. */
const SNAPSHOT_TIMEOUT_MS = 30_000

/** Фрейм, который не ответил за это время, снимок не держит: зависший виджет - не вся страница. */
const FRAME_TIMEOUT_MS = 10_000

/** Больше фреймов снимок не читает: на странице с рекламой их десятки, а модели нужны первые. */
export const MAX_FRAMES = 30

/** Глубже не читается: iframe в iframe в iframe… - столько уровней. */
const MAX_FRAME_DEPTH = 5

/** Снимок со всеми прочитанными фреймами: текст, ссылки элементов, обрезан ли. */
export type FramedSnapshot = { text: string; refs: Map<string, ElementRef>; truncated: boolean }

type Loaded = { frame: SnapshotFrame; tree: AxTree; truncated: boolean }

/** Отказ, после которого фрейм просто не читается: ушёл, не ответил, Chrome его не отдал. */
const isUnreadable = (error: unknown): boolean =>
  error instanceof BrowserError && ['cdp', 'no-frame', 'timeout'].includes(error.code)

/** Документы фреймов одной вкладки; список фреймов других процессов спрашивается один раз. */
class FrameReader {
  private targets: Promise<Set<string>> | null = null

  constructor(private readonly page: Page) {}

  /** Документ фрейма за элементом iframe owner документа parent; не прочесть - null. */
  async read(parent: SnapshotFrame, owner: number, id: string): Promise<Loaded | null> {
    try {
      const described = await this.page.cdp<{ node?: { frameId?: string } }>(
        'DOM.describeNode',
        { backendNodeId: owner },
        { frame: targetOf(parent), timeoutMs: FRAME_TIMEOUT_MS },
      )
      const frameId = described.node?.frameId

      if (!frameId) return null

      const own = (await this.targetIds()).has(frameId)
      const frame: SnapshotFrame = { id, target: own ? frameId : null, parent, owner }
      const tree = await this.page.cdp<AxTreeResult>(
        'Accessibility.getFullAXTree',
        own ? {} : { frameId },
        { frame: targetOf(frame), timeoutMs: FRAME_TIMEOUT_MS },
      )

      return {
        frame,
        tree: { id, nodes: tree.nodes as AxNode[], frames: new Map() },
        truncated: tree.truncated === true,
      }
    } catch (error) {
      if (isUnreadable(error)) return null

      throw error
    }
  }

  private targetIds(): Promise<Set<string>> {
    this.targets ??= this.page
      .frameTargets()
      .then((frames) => new Set(frames.map((frame) => frame.frameId)))

    return this.targets
  }
}

/**
 * Снимок вкладки с фреймами. Фреймы читаются уровнями: собрать снимок, прочесть iframe, которые
 * в него попали (pending), собрать снова. Так читаются только фреймы, которые модель увидит, -
 * всё, что за пределом объёма, не стоит ни одного запроса. Фреймы нумеруются по порядку чтения:
 * f1, f2… - номера живут до следующего снимка, как и ссылки.
 */
export const readSnapshot = async (page: Page): Promise<FramedSnapshot> => {
  const main = await page.cdp<AxTreeResult>(
    'Accessibility.getFullAXTree',
    {},
    { timeoutMs: SNAPSHOT_TIMEOUT_MS },
  )
  const root: AxTree = { id: '', nodes: main.nodes as AxNode[], frames: new Map() }
  const frames = new Map<string, SnapshotFrame>([['', MAIN_FRAME]])
  const reader = new FrameReader(page)
  let truncated = main.truncated === true
  let result = formatAxSnapshot(root)

  for (let depth = 0; depth < MAX_FRAME_DEPTH && result.pending.length > 0; depth += 1) {
    for (const { tree, owner } of result.pending) {
      const parent = frames.get(tree.id) ?? MAIN_FRAME
      const loaded =
        frames.size > MAX_FRAMES ? null : await reader.read(parent, owner, `f${frames.size}`)

      tree.frames.set(owner, loaded?.tree ?? null)

      if (!loaded) continue

      frames.set(loaded.frame.id, loaded.frame)
      truncated ||= loaded.truncated
    }

    result = formatAxSnapshot(root)
  }

  const refs = new Map<string, ElementRef>()

  for (const [ref, { frame, node }] of result.refs) {
    refs.set(ref, { node, frame: frames.get(frame) ?? MAIN_FRAME })
  }

  return { text: result.text, refs, truncated: truncated || result.truncated }
}

/** Фреймы другого процесса на пути от страницы к фрейму, от внешнего к внутреннему. */
const ownProcessChain = (frame: SnapshotFrame): SnapshotFrame[] => {
  const chain: SnapshotFrame[] = []

  for (let at: SnapshotFrame | null = frame; at?.parent; at = at.parent) {
    if (at.target !== null) chain.unshift(at)
  }

  return chain
}

type BoxModel = { model: { content: number[] } }

/**
 * Где начинается окно фрейма в окне страницы, в CSS-пикселях. Узлы фрейма процесса страницы
 * Chrome и так отдаёт в координатах страницы; фрейм другого процесса - в координатах своего
 * окна, его начало - левый верхний угол содержимого его элемента iframe (без рамки и полей),
 * и так до страницы через все фреймы других процессов.
 */
export const frameOffset = async (
  page: Page,
  frame: SnapshotFrame,
): Promise<{ x: number; y: number }> => {
  let x = 0
  let y = 0

  for (const at of ownProcessChain(frame)) {
    const parent = at.parent ?? MAIN_FRAME
    const { model } = await page.cdp<BoxModel>(
      'DOM.getBoxModel',
      { backendNodeId: at.owner },
      { frame: targetOf(parent) },
    )

    x += model.content[0] ?? 0
    y += model.content[1] ?? 0
  }

  return { x, y }
}

/**
 * Элементы iframe фреймов другого процесса - в видимую часть страницы, от внешнего к
 * внутреннему. Прокрутка элемента внутри такого фрейма доходит до страницы через другой
 * процесс, уже после ответа, и место фрейма читалось бы до неё. Не вышло (iframe пропал) -
 * следующий шаг скажет, что элемента нет.
 */
export const revealFrame = async (page: Page, frame: SnapshotFrame): Promise<void> => {
  for (const at of ownProcessChain(frame)) {
    await page
      .cdp(
        'DOM.scrollIntoViewIfNeeded',
        { backendNodeId: at.owner },
        { frame: targetOf(at.parent ?? MAIN_FRAME) },
      )
      .catch((error: unknown) => {
        if (!isUnreadable(error)) throw error
      })
  }
}
