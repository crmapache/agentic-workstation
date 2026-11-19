import type { UiNode } from '@shared/extension-ui'

import { ChartNode } from './ChartNode'
import { ButtonNode, SelectNode, SwitchNode, TextAreaNode, TextFieldNode } from './FieldNodes'
import { RowNode, CardNode, StackNode, DividerNode, SectionNode } from './LayoutNodes'
import { ListNode } from './ListNode'
import {
  CodeNode,
  TextNode,
  BadgeNode,
  EmptyNode,
  KeyValueNode,
  MarkdownNode,
  ProgressNode,
} from './TextNodes'

/** Узел дерева расширения - своим компонентом по виду. */
export const SurfaceNode = ({ node }: { node: UiNode }) => {
  switch (node.type) {
    case 'stack':
      return <StackNode node={node} />
    case 'row':
      return <RowNode node={node} />
    case 'section':
      return <SectionNode node={node} />
    case 'card':
      return <CardNode node={node} />
    case 'divider':
      return <DividerNode />
    case 'text':
      return <TextNode node={node} />
    case 'markdown':
      return <MarkdownNode node={node} />
    case 'code':
      return <CodeNode node={node} />
    case 'badge':
      return <BadgeNode node={node} />
    case 'keyValue':
      return <KeyValueNode node={node} />
    case 'progress':
      return <ProgressNode node={node} />
    case 'empty':
      return <EmptyNode node={node} />
    case 'button':
      return <ButtonNode node={node} />
    case 'textField':
      return <TextFieldNode node={node} />
    case 'textArea':
      return <TextAreaNode node={node} />
    case 'select':
      return <SelectNode node={node} />
    case 'switch':
      return <SwitchNode node={node} />
    case 'list':
      return <ListNode node={node} />
    case 'chart':
      return <ChartNode node={node} />
  }
}
