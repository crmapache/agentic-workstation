import { ProviderPanel } from '../ProviderPanel/ProviderPanel'

/**
 * Правая панель Google Antigravity (ADR 0092): `agy acp` со своими вкладками и режимами. Только
 * чат человека: фоновой работы на личном входе Google у неё нет (ADR 0094).
 */
export const AntigravityPanel = () => <ProviderPanel provider="antigravity" />
