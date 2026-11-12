import { IS_WINDOWS } from '../../platform'

/**
 * Забор головы (HeadFence в ACC): у главного потока нет Write и Edit, и это код, а не фраза в
 * промпте. Список разрешённых первых слов, а не запрещённых: запрещающий - догадка обо всех
 * способах шелла писать на диск, а у шелла всегда есть ещё один. Каждый кусок цепочки судится
 * отдельно: `ls && rm -rf .` начинается с разрешённого слова.
 */

export type FenceVerdict = { ok: boolean; why: string }

const ALLOWED = new Set(
  (
    'ls cat head tail wc stat file du df pwd which whereis type echo printf date basename dirname ' +
    'realpath readlink grep egrep fgrep rg ag find fd sort uniq cut tr column diff jq yq awk sed ' +
    'git gh hg svn node npm pnpm yarn npx python python3 pip pip3 uv poetry go cargo rustc java ' +
    'javac gradle ./gradlew gradlew mvn make dotnet ruby bundle rake php composer swift kotlinc ' +
    'tsc eslint prettier pytest jest vitest ctest docker kubectl curl true'
  ).split(' '),
)

const words = (list: string): ReadonlySet<string> => new Set(list.split(' '))

/** Подкоманды, которые что-то меняют, у разрешённых программ. */
const REFUSED_SUBCOMMANDS: Record<string, ReadonlySet<string>> = {
  git: words(
    'commit push merge rebase reset checkout switch restore clean add rm mv apply am cherry-pick ' +
      'revert stash tag branch pull fetch clone init gc prune filter-branch worktree submodule config remote',
  ),
  gh: words('pr issue release repo api workflow gist secret auth'),
  npm: words('install i ci publish link uninstall update version'),
  pnpm: words('install i add remove publish link update'),
  yarn: words('install add remove publish link upgrade'),
  docker: words('run exec build rm rmi push compose cp load commit'),
  kubectl: words('apply delete create patch edit exec scale rollout'),
  pip: words('install uninstall download wheel'),
  pip3: words('install uninstall download wheel'),
  uv: words('add remove sync lock install venv pip'),
  poetry: words('add remove install update lock publish build'),
  bundle: words('install add remove update'),
  composer: words('install require remove update dump-autoload'),
  cargo: words('install publish add remove new init fix clean'),
  go: words('install get mod work generate clean'),
  dotnet: words('add remove new publish pack clean nuget'),
}

/** Флаги со значением до подкоманды: `git -C /repo commit` - это commit. */
const VALUE_OPTIONS: Record<string, ReadonlySet<string>> = {
  git: words('-C -c --git-dir --work-tree --namespace --exec-path --super-prefix --config-env'),
  gh: words('-R --repo'),
  npm: words(
    '-C --prefix -w --workspace --userconfig --globalconfig --registry --cache --loglevel',
  ),
  pnpm: words('-C --dir -F --filter --store-dir --registry --loglevel --config'),
  yarn: words('--cwd --registry --cache-folder --modules-folder'),
  docker: words('-H --host -c --context --config -l --log-level --tlscacert --tlscert --tlskey'),
  kubectl: words('-n --namespace --context --cluster --user --kubeconfig -s --server --token --as'),
  poetry: words('-C --directory -P --project'),
  composer: words('-d --working-dir'),
  cargo: words('-Z --config --color --manifest-path'),
  go: words('-C'),
}

type Flags = { short: string; long: ReadonlySet<string> }

/** Флаги, с которыми безобидная программа пишет, запускает или скачивает. */
const REFUSED_FLAGS: Record<string, Flags> = {
  sed: { short: 'i', long: words('--in-place') },
  yq: { short: 'i', long: words('--inplace --in-place') },
  find: { short: '', long: words('-delete -exec -execdir -ok -okdir -fprint -fprintf -fls') },
  fd: { short: 'xX', long: words('--exec --exec-batch') },
  curl: {
    short: 'oOTD',
    long: words(
      '--output --output-dir --remote-name --remote-name-all --create-dirs --upload-file ' +
        '--dump-header --trace --trace-ascii --config',
    ),
  },
  node: { short: 'ep', long: words('--eval --print --input-type') },
  python: { short: 'c', long: new Set() },
  python3: { short: 'c', long: new Set() },
  ruby: { short: 'e', long: new Set() },
  php: { short: 'r', long: new Set() },
}

const INTERPRETERS = words('node python python3 ruby php')
const ASKING = words('--version -v -V --help -h')
const WRITING = ['>', '>>', '$(', '`', '<<']
const SPLIT = /&&|\|\||;|&|\||\n/

const refuse = (why: string): FenceVerdict => ({ ok: false, why: `Refused: ${why}` })

const subcommandOf = (program: string, args: readonly string[]): string | null => {
  const carriers = VALUE_OPTIONS[program] ?? new Set<string>()

  for (let index = 0; index < args.length; index += 1) {
    const word = args[index] ?? ''

    if (!word.startsWith('-')) return word.toLowerCase()
    if (!word.includes('=') && carriers.has(word)) index += 1
  }

  return null
}

const writes = (word: string, flags: Flags): boolean => {
  if (!word.startsWith('-') || word === '-') return false
  if (word.startsWith('--')) return flags.long.has(word.split('=')[0] ?? word)
  if (flags.long.has(word)) return true

  const cluster = word.slice(1).split(/[.=]/)[0] ?? ''

  return [...cluster].some((letter) => flags.short.includes(letter))
}

const judgePiece = (piece: string): FenceVerdict | null => {
  const parts = piece.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]

  if (!first) return null

  // На маке «\» в слове - экранирование оболочки, а не черта: `x\git` запустил бы `xgit`.
  // На Windows - черта пути, как «/» (ADR 0048).
  if (!IS_WINDOWS && first.includes('\\')) {
    return refuse(`\`${first}\` is not a plain program name: the shell would read the backslash.`)
  }

  const separator = IS_WINDOWS
    ? Math.max(first.lastIndexOf('/'), first.lastIndexOf('\\'))
    : first.lastIndexOf('/')
  const program = first.slice(separator + 1) || first
  const head = program === 'gradlew' ? './gradlew' : program

  if (!ALLOWED.has(head) && !ALLOWED.has(program)) {
    return refuse(
      `\`${program}\` is not on the list of things the main thread of a run may run. You may read the project, ask git questions and run its tests and linters; anything that changes the project is a card's job.`,
    )
  }

  const args = parts.slice(1)
  const dashM = args.indexOf('-m')
  const moduleName = INTERPRETERS.has(program) && dashM >= 0 ? args[dashM + 1] : undefined
  const judged = moduleName?.split('.')[0]?.toLowerCase() || program
  const refused = REFUSED_SUBCOMMANDS[judged]
  const subcommand = refused
    ? subcommandOf(judged, moduleName ? args.slice(dashM + 2) : args)
    : null

  if (refused && subcommand && refused.has(subcommand)) {
    return refuse(
      `\`${judged} ${subcommand}\` changes something, and the main thread of a run does not. Ask a card to do it, or say so in your verdict.`,
    )
  }

  const flags = REFUSED_FLAGS[program]
  const flag = flags ? args.find((word) => writes(word, flags)) : undefined

  if (flag) {
    return refuse(
      `\`${program} ${flag}\` writes, runs or downloads something, and the main thread of a run does none of those. Ask a card to do it.`,
    )
  }

  const pointed = args.some((word) => (word !== '-' && !word.startsWith('-')) || ASKING.has(word))

  if (INTERPRETERS.has(program) && !pointed) {
    return refuse(
      `\`${program}\` with nothing to run reads its program from the pipe. Point it at one of the project's own files.`,
    )
  }

  if (program === 'awk' && args.some((word) => word.includes('system('))) {
    return refuse('`system(` in an awk program runs a command nobody judged.')
  }

  return null
}

/** Команда Bash головы: можно ли. */
export const judgeCommand = (command: string): FenceVerdict => {
  if (!command.trim()) return refuse('there is no command here to judge.')

  const mark = WRITING.find((one) => command.includes(one))

  if (mark) {
    return refuse(
      `\`${mark}\` in a command is a way to write or to run something unseen, and the main thread of a run does not write. Ask a card to do it.`,
    )
  }

  for (const piece of command.split(SPLIT)) {
    const verdict = judgePiece(piece)

    if (verdict) return verdict
  }

  return { ok: true, why: '' }
}

/** Вопрос разрешения головы: всё, кроме Bash, - не её (Read, Grep, Glob вопросов не задают). */
export const judgeHead = (toolName: string, input: Record<string, unknown>): FenceVerdict => {
  if (toolName !== 'Bash') {
    return {
      ok: false,
      why: `${toolName} is not yours to use: you are the main thread of this run, and doing the work is a card's job. Ask a card for it, or say so in your verdict.`,
    }
  }

  return judgeCommand(typeof input['command'] === 'string' ? input['command'] : '')
}
