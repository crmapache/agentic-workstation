import type { AxNode, AxValue } from './ax-snapshot'
import { fullName, elementLabel, matchesExpect } from './expect-label'
import type { ElementRef } from './frame-refs'
import { targetOf } from './frame-refs'
import type { Point } from './page-nodes'

/**
 * Проверка клика во вкладке (ADR 0119): что под точкой в момент нажатия и то ли это, что
 * задумано. Чистые функции - держит тест; узлы приносит page-hit.ts, жмёт page-click.ts.
 */

/** Узел цепочки доступности, через который виден смысл попадания: его DOM-узел, роль, имя. */
export type HitStep = { node: number; role: string; name: string }

/** Попадание: узел под точкой, его сессия, iframe по пути и как его назвать. */
export type Hit = {
  node: number
  /** Сессия документа узла: id фрейма другого процесса, undefined - вкладка. */
  target: string | undefined
  /**
   * iframe, через которые попадание лежит в своём документе, - сам iframe и его предки в
   * документе родителя (path), в сессии этого документа.
   */
  owners: { target: string | undefined; path: number[] }[]
  role: string
  /** Имя целиком (fullName): сравнение с expect - по нему, ответ обрезает сам. */
  name: string
  /** Кнопка, ссылка, пункт меню, поле - то, что действует по нажатию. */
  isActionable: boolean
  /** Сам узел и backendDOMNodeId его предков в дереве доступности - внутри ли он ref. */
  path: number[]
  /** Живые узлы цепочки от попадания вверх: есть ли между попаданием и ref другая кнопка. */
  ancestry: HitStep[]
}

/** Узел ответа getPartialAXTree: у скрытого - причины, у подписи поля - само поле. */
export type HitAxNode = AxNode & {
  ignoredReasons?: { name: string; value?: { relatedNodes?: { backendDOMNodeId?: number }[] } }[]
}

/**
 * Роли, у которых нажатие что-то делает. Подпись поля Chrome в дереве прячет (labelFor), и
 * попадание в неё считается попаданием в её поле (labelledControl). Подпись без поля (LabelText)
 * по нажатию ничего не делает. Остальное - текст, картинки, холст, пустое место.
 */
const ACTIONABLE_ROLES = new Set([
  'button',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'checkbox',
  'radio',
  'switch',
  'tab',
  'option',
  'treeitem',
  'textbox',
  'searchbox',
  'combobox',
  'slider',
  'spinbutton',
  'PopUpButton',
  'ToggleButton',
  'DisclosureTriangle',
  'MenuListOption',
  'ColorWell',
  'Date',
  'DateTime',
  'InputTime',
])

/** Поля ввода: ссылка внутри редактора по нажатию ставит курсор, а не уходит по адресу. */
const EDITABLE_ROLES = new Set(['textbox', 'searchbox', 'combobox'])

/** Обёртки без смысла: ими попадание не называется, если есть что-то осмысленнее. */
const PLAIN_ROLES = new Set(['generic', 'none', 'presentation', 'InlineTextBox', 'LineBreak'])

const textOf = (value: AxValue | undefined): string =>
  typeof value?.value === 'string' || typeof value?.value === 'number' ? String(value.value) : ''

/** Поле, чья подпись под точкой: Chrome прячет такую подпись с причиной labelFor и полем в ней. */
export const labelledControl = (chain: readonly HitAxNode[]): number | null => {
  for (const item of chain) {
    const reason = item.ignoredReasons?.find((one) => one.name === 'labelFor')
    const control = reason?.value?.relatedNodes?.[0]?.backendDOMNodeId

    if (typeof control === 'number') return control
  }

  return null
}

const stepOf = (item: AxNode): HitStep[] =>
  typeof item.backendDOMNodeId === 'number'
    ? [{ node: item.backendDOMNodeId, role: textOf(item.role), name: fullName(textOf(item.name)) }]
    : []

/**
 * Роль и имя попадания по цепочке доступности от узла вверх: поле подписи под точкой, иначе
 * ближайший действующий предок (или сам узел), иначе - первый осмысленный узел. Цепочки нет -
 * узел без имени.
 */
export const describeAxChain = (
  node: number,
  chain: readonly AxNode[],
  control: AxNode | null = null,
): Pick<Hit, 'role' | 'name' | 'isActionable' | 'path' | 'ancestry'> => {
  const live = [...(control ? [control] : []), ...chain.filter((item) => !item.ignored)]
  const actionable = live.find((item) => ACTIONABLE_ROLES.has(textOf(item.role)))
  const shown = actionable ?? live.find((item) => !PLAIN_ROLES.has(textOf(item.role))) ?? live[0]
  const ids = [...(control ? [control] : []), ...chain].flatMap((item) =>
    typeof item.backendDOMNodeId === 'number' ? [item.backendDOMNodeId] : [],
  )

  return {
    role: textOf(shown?.role),
    name: fullName(textOf(shown?.name)),
    isActionable: actionable !== undefined,
    path: [node, ...ids],
    ancestry: live.flatMap(stepOf),
  }
}

/**
 * Внутри ли попадание элемента ref: сам он или его потомок в его документе - или в документе его
 * iframe (своего процесса или другого). backendNodeId уникален в процессе, поэтому сравниваем
 * только в одной сессии.
 */
export const isInsideRef = (hit: Hit, element: ElementRef): boolean => {
  const session = targetOf(element.frame)

  return (
    (hit.target === session && hit.path.includes(element.node)) ||
    hit.owners.some((owner) => owner.target === session && owner.path.includes(element.node))
  )
}

/**
 * Другая кнопка внутри ref под точкой: строка письма, а под мышью - её «Delete», что всплыла при
 * наведении. Нажатие ушло бы в неё, а не в ref. Внутри поля ввода - не считается: ссылка в
 * редакторе по нажатию ставит курсор.
 */
const nestedIn = (hit: Hit, element: ElementRef): HitStep | null => {
  if (hit.target !== targetOf(element.frame)) return null

  const index = hit.ancestry.findIndex((step) => step.node === element.node)
  const own = hit.ancestry[index]

  if (!own || EDITABLE_ROLES.has(own.role)) return null

  return (
    hit.ancestry
      .slice(0, index)
      .find((step) => ACTIONABLE_ROLES.has(step.role) && !EDITABLE_ROLES.has(step.role)) ?? null
  )
}

/** Попадание словами для ответа и отказа. */
export const hitLabel = (hit: Hit | null): string =>
  hit ? elementLabel(hit.role, hit.name) : 'nothing the page can name'

/** Что нажимаем: элемент снимка (и его подпись, если её знает модель) или точка. */
export type ClickAim = { ref: string; expect?: string } | { point: Point; expect?: string }

/**
 * Вердикт проверки: жать можно - или отказ: что под мышью (reason), что делать модели (next) и
 * можно ли прицелиться заново.
 */
export type Verdict = { ok: true } | { ok: false; reason: string; next: string; reaim: boolean }

const BY_REF = 'Take a new snapshot and click by ref.'

const at = ({ x, y }: Point) => `(${Math.round(x)}, ${Math.round(y)})`

/**
 * Можно ли жать в это попадание. По ref - только в сам элемент или его потомка, и не в другую
 * кнопку внутри него: не так - элемент сдвинулся или его закрыли, можно прицелиться заново. По x,y
 * с expect - имя попадания должно совпасть с ним. По x,y без expect - нельзя в действующий
 * элемент: список «опасных» подписей на всех языках не собрать, а одна строка expect закрывает
 * все случаи сразу.
 */
export const judge = (aim: ClickAim, hit: Hit | null, element: ElementRef | null): Verdict => {
  const under = hitLabel(hit)

  if ('ref' in aim) {
    if (!hit || !element || !isInsideRef(hit, element)) {
      return {
        ok: false,
        reaim: true,
        reason: `Element ${aim.ref} moved or is covered: under the pointer is ${under} now.`,
        next: 'Take a new snapshot and try again with its ref.',
      }
    }

    const nested = nestedIn(hit, element)

    if (nested) {
      return {
        ok: false,
        reaim: true,
        reason: `Under the pointer is ${elementLabel(nested.role, nested.name)} inside ${aim.ref}, not ${aim.ref} itself.`,
        next: 'Click it by its own ref if you mean it, or take a new snapshot and try again.',
      }
    }
  } else if (aim.expect === undefined && hit?.isActionable) {
    return {
      ok: false,
      reaim: false,
      reason: `Under ${at(aim.point)} is ${under}.`,
      next: 'Click it by ref from a fresh snapshot, or pass expect with the label you mean to click.',
    }
  }

  if (aim.expect === undefined) return { ok: true }

  if (!hit) {
    return {
      ok: false,
      reaim: false,
      reason: `Nothing the page can name is under the pointer, so "${aim.expect}" can't be checked.`,
      next: BY_REF,
    }
  }

  return matchesExpect(hit.name, aim.expect)
    ? { ok: true }
    : {
        ok: false,
        reaim: false,
        reason: `Under the pointer is ${under}, not "${aim.expect}".`,
        next: BY_REF,
      }
}
