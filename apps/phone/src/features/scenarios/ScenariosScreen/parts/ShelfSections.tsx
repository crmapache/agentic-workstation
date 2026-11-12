import { useTranslation } from 'react-i18next'

import type { ShelfScenarioWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Section } from '@agentic-workstation/ui/Section'

import { SHELF_SCOPES } from '../ScenariosScreen.constants'
import styles from '../ScenariosScreen.module.scss'
import type { RouteOf } from '../../../../lib/route.types'
import { useRouter } from '../../../../lib/router.store'
import { ListGroup } from '../../../../shell/ListGroup/ListGroup'
import { ListRow } from '../../../../shell/ListRow/ListRow'

/** Сценарии полками - проекта и личные, как в окне сценариев IDE; нажатие открывает сценарий. */
export const ShelfSections = ({
  route,
  scenarios,
}: {
  route: RouteOf<'scenarios'>
  scenarios: ShelfScenarioWire[]
}) => {
  const { t } = useTranslation()
  const navigate = useRouter((state) => state.navigate)

  if (scenarios.length === 0) return <p className={styles.note}>{t('scenarios.noScenarios')}</p>

  return (
    <>
      {SHELF_SCOPES.map((scope) => {
        const shelf = scenarios.filter((scenario) => scenario.scope === scope)

        if (shelf.length === 0) return null

        return (
          <Section key={scope} size="sm" title={t(`start.shelf.${scope}`)} count={shelf.length}>
            <ListGroup label={t(`start.shelf.${scope}`)}>
              {shelf.map((scenario) => (
                <ListRow
                  key={scenario.id}
                  title={scenario.name}
                  description={
                    scenario.inputs.length > 0
                      ? t('scenarios.questions', { count: scenario.inputs.length })
                      : undefined
                  }
                  onClick={() =>
                    navigate({
                      name: 'scenario',
                      agentId: route.agentId,
                      projectKey: route.projectKey,
                      scope,
                      scenarioId: scenario.id,
                    })
                  }
                />
              ))}
            </ListGroup>
          </Section>
        )
      })}
    </>
  )
}
