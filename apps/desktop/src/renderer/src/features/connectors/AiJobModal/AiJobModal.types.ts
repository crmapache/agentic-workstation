import type { AiJob, AiProposal } from '@shared/connector-spec'

import type { OnAdded } from '../ConnectorsView/ConnectorsView.types'

/** Окно работы ИИ: сама работа - из состояния коннекторов, свежая на каждое событие. */
export type AiJobModalProps = { job: AiJob }

/** Часть окна, которой нужна только работа: журнал, поле, кнопки шапки. */
export type AiJobPartProps = { job: AiJob }

/** Правая колонка: просьба и то, что ИИ предлагает; onAdded - коннектор добавлен. */
export type AiJobSideProps = { job: AiJob; onAdded: OnAdded }

/** Предложение MCP-сервера по адресу на проверке. */
export type AiMcpReviewProps = {
  proposal: Extract<AiProposal, { kind: 'mcp' }>
  job: AiJob
  onAdded: OnAdded
}

/** Предложение перенести сервер из Claude Code. */
export type AiExistingReviewProps = {
  proposal: Extract<AiProposal, { kind: 'existing' }>
  onAdded: OnAdded
}
