/** Папка обёртки zsh в userData: ZDOTDIR оболочки терминала на время её запуска. */
export const ZSH_INTEGRATION_DIR = 'terminal-zsh'

/** Где человек держит свои файлы zsh (его ZDOTDIR); пусто - в домашней папке. */
export const USER_ZDOTDIR_ENV = 'AGENTIC_WORKSTATION_USER_ZDOTDIR'

/**
 * Обёртка над файлами zsh человека (ADR 0037), как у терминала VS Code. ZDOTDIR смотрит в
 * папку обёртки только пока оболочка запускается: каждый файл человека читается из его
 * папки как обычно, с его ZDOTDIR, а в конце ZDOTDIR возвращается человеку - вложенный zsh
 * обёртки не видит. Сверху добавлено одно: приглашение zsh по умолчанию (из /etc/zshrc) -
 * в цвет. Своё приглашение человека (oh-my-zsh, starship) не трогается.
 */
const ZSHENV = `# Agentic Workstation: обёртка над файлами zsh человека. Его файлы читаются как обычно.
_agentic_workstation_dir=$ZDOTDIR
_agentic_workstation_user=\${${USER_ZDOTDIR_ENV}:-$HOME}
_agentic_workstation_had_zdotdir=\${${USER_ZDOTDIR_ENV}:+1}
unset ${USER_ZDOTDIR_ENV}

# Файл человека - из его папки и с его ZDOTDIR. Файл мог сам сменить ZDOTDIR: дальше его
# файлы ищутся там.
_agentic_workstation_source() {
  [[ -f $_agentic_workstation_user/$1 ]] || return 0
  ZDOTDIR=$_agentic_workstation_user
  . "$_agentic_workstation_user/$1"
  _agentic_workstation_user=$ZDOTDIR
  ZDOTDIR=$_agentic_workstation_dir
}

# Запуск кончился: ZDOTDIR - снова человека, следов обёртки в оболочке нет.
_agentic_workstation_done() {
  if [[ -n $_agentic_workstation_had_zdotdir || $_agentic_workstation_user != $HOME ]]; then
    ZDOTDIR=$_agentic_workstation_user
  else
    unset ZDOTDIR
  fi
  unset -f _agentic_workstation_source _agentic_workstation_done
  unset _agentic_workstation_dir _agentic_workstation_user _agentic_workstation_had_zdotdir
}

_agentic_workstation_source .zshenv
`

const ZPROFILE = `_agentic_workstation_source .zprofile
`

const ZSHRC = `# /etc/zshrc кладёт историю в ZDOTDIR, а сейчас это обёртка: история - в папке человека.
[[ $HISTFILE == $_agentic_workstation_dir/.zsh_history ]] && HISTFILE=$_agentic_workstation_user/.zsh_history

_agentic_workstation_source .zshrc

# Приглашение по умолчанию - в цвет: машина тише, папка и ветка git ярче, знак зелёный после
# удачной команды и красный после ошибки. Так команды видно среди вывода.
if [[ $PROMPT == '%n@%m %1~ %# ' ]]; then
  autoload -Uz vcs_info
  zstyle ':vcs_info:*' enable git
  zstyle ':vcs_info:git:*' formats ' %F{magenta}%b%f'
  zstyle ':vcs_info:git:*' actionformats ' %F{magenta}%b%f %F{yellow}%a%f'
  precmd_functions+=(vcs_info)
  setopt prompt_subst
  PROMPT='%F{8}%n@%m%f %B%F{blue}%1~%f%b\${vcs_info_msg_0_} %(?.%F{green}.%F{red})%#%f '
fi

[[ -o login ]] || _agentic_workstation_done
`

const ZLOGIN = `_agentic_workstation_source .zlogin
_agentic_workstation_done
`

/** Файлы обёртки по именам, как их ищет zsh в ZDOTDIR. */
export const ZSH_FILES: Readonly<Record<string, string>> = {
  '.zshenv': ZSHENV,
  '.zprofile': ZPROFILE,
  '.zshrc': ZSHRC,
  '.zlogin': ZLOGIN,
}
