import '@agentic-workstation/ui/tokens.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import './styles/site-tokens.css'
import './styles/site.scss'

import { setupCopyButtons } from './copy-command'
import { showLatestRelease } from './release'

setupCopyButtons()
void showLatestRelease()
