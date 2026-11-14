/**
 * Числа CoreGraphics для событий ввода (CGEventTypes.h, CGRemoteOperation.h). Значения - из
 * заголовков SDK macOS: они часть двоичного интерфейса и между версиями не меняются.
 */

/** ApplicationServices несёт и CoreGraphics (события), и HIServices. */
export const APPLICATION_SERVICES_PATH =
  '/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices'

export const CORE_FOUNDATION_PATH =
  '/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation'

/** CGEventType. */
export const EVENT = {
  leftDown: 1,
  leftUp: 2,
  rightDown: 3,
  rightUp: 4,
  moved: 5,
  leftDragged: 6,
  rightDragged: 7,
  keyDown: 10,
  keyUp: 11,
  otherDown: 25,
  otherUp: 26,
  otherDragged: 27,
} as const

/** CGMouseButton. */
export const MOUSE_BUTTON = { left: 0, right: 1, middle: 2 } as const

/** kCGHIDEventTap: событие входит в систему там же, где входят события настоящей мыши. */
export const HID_EVENT_TAP = 0

/** kCGEventSourceStateHIDSystemState: что сейчас зажато на настоящих устройствах. */
export const HID_SYSTEM_STATE = 1

/** CGEventField: номер нажатия в серии (двойной клик - 2) и метка источника. */
export const FIELD_CLICK_STATE = 1

/** kCGScrollEventUnitPixel. */
export const SCROLL_UNIT_PIXEL = 0

/** CGEventFlags модификаторов. */
export const FLAG = {
  shift: 0x20000,
  control: 0x40000,
  option: 0x80000,
  command: 0x100000,
  fn: 0x800000,
} as const

/** Все флаги модификаторов разом: держит ли человек хоть один. */
export const MODIFIER_FLAGS = FLAG.shift | FLAG.control | FLAG.option | FLAG.command

/**
 * Сколько UTF-16 знаков macOS берёт в одно событие клавиатуры (CGEventKeyboardSetUnicodeString
 * молча режет длиннее).
 */
export const UNICODE_CHUNK = 20
