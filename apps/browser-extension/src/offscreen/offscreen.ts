import type { OffscreenCopy } from '../common/messages'

/**
 * Offscreen-документ для буфера обмена: у сервис-воркера нет document. navigator.clipboard
 * требует фокуса, которого у offscreen-документа не бывает, поэтому - старый execCommand
 * через поле ввода, его Chrome разрешает с правом clipboardWrite.
 */
chrome.runtime.onMessage.addListener((message: OffscreenCopy, _sender, respond) => {
  if (message?.target !== 'offscreen' || message.type !== 'copy') return false

  const field = document.getElementById('clipboard')

  if (!(field instanceof HTMLTextAreaElement)) {
    respond(false)

    return false
  }

  field.value = message.text
  field.select()
  respond(document.execCommand('copy'))
  field.value = ''

  return false
})
