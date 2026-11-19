import { join } from 'node:path'

import type { ClaudeService } from '../claude-service'
import { locateClaudeCli } from '../cli/cli-locator'
import { broadcast } from '../../ipc/broadcast'
import type { WorkspaceService } from '../../workspace/workspace-service'
import { SearchDesk } from './search-desk'
import { SEARCH_DIR_NAME } from './search.constants'

/**
 * Поиск по разговорам панели - своим модулем: индекс по проекту, первая сборка - через 20 секунд
 * после открытия проекта, поиск модели - на аккаунте панели. projectsChanged - сказать ему, какие
 * проекты открыты сейчас.
 */
export const startConversationSearch = (setup: {
  userData: string
  claude: ClaudeService
  workspace: WorkspaceService
}) => {
  const search = new SearchDesk({
    dir: join(setup.userData, SEARCH_DIR_NAME),
    cli: async () => {
      const cli = await locateClaudeCli()

      return cli && { ...cli, env: setup.claude.accounts.envFor(cli.env) }
    },
    onStep: (step) => broadcast('claudeSearch:step', step),
  })

  return {
    search,
    projectsChanged: () =>
      search.projectsChanged(
        setup.workspace.getState().projects.map((project) => project.rootPath),
      ),
  }
}
