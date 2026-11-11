// Настоящая мышь macOS в окне копии агента - для того, что CDP не видит: его события
// приходят прямо в страницу, а области перетаскивания окна, hover на их границах и
// «клик мимо» по шапке решает система.
//
//   swift apps/desktop/scripts/real-mouse.swift move 1300,20 1440,20 [ещё точки ...]
//   swift apps/desktop/scripts/real-mouse.swift click 800,20
//   swift apps/desktop/scripts/real-mouse.swift drag 800,20 900,60
//
// Точки - CSS-пиксели окна от левого верхнего угла. move ведёт курсор по ломаной шагом
// в 1px и печатает «время-мс x y» на каждый шаг: с ним сверяют журнал событий страницы
// (Date.now()). Окно копии на время поднимается вперёд, курсор и прежнее приложение
// потом возвращаются на место. drag тянет с зажатой кнопкой и печатает, на сколько
// сдвинулось окно. Нужно разрешение «Универсальный доступ» для терминала.

import AppKit
import ApplicationServices

let arguments = CommandLine.arguments.dropFirst()
guard let command = arguments.first, ["move", "click", "drag"].contains(command), arguments.count > 1 else {
  FileHandle.standardError.write("Команды: move x,y x,y ... | click x,y | drag x,y x,y\n".data(using: .utf8)!)
  exit(2)
}

let points: [CGPoint] = arguments.dropFirst().map {
  let xy = $0.split(separator: ",").compactMap { Double($0) }
  guard xy.count == 2 else { FileHandle.standardError.write("Точка - x,y: \($0)\n".data(using: .utf8)!); exit(2) }
  return CGPoint(x: xy[0], y: xy[1])
}

guard AXIsProcessTrusted() else {
  FileHandle.standardError.write("Нет разрешения «Универсальный доступ» для этого терминала\n".data(using: .utf8)!)
  exit(1)
}

func commandLine(of pid: pid_t) -> String {
  let task = Process()
  task.executableURL = URL(fileURLWithPath: "/bin/ps")
  task.arguments = ["-o", "command=", "-p", String(pid)]
  let pipe = Pipe()
  task.standardOutput = pipe
  try? task.run()
  task.waitUntilExit()
  return String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
}

// Только копия агента (её папка в аргументах Electron): ни dev, ни установленную IDE
// человека скрипт не трогает.
let agentOut = "\(NSHomeDirectory())/.agentic-workstation-agent/out"
let agentApp = NSWorkspace.shared.runningApplications.first {
  $0.executableURL?.lastPathComponent == "Electron" && commandLine(of: $0.processIdentifier).contains(agentOut)
}

guard let app = agentApp else {
  FileHandle.standardError.write("Копия окна не запущена: bash apps/desktop/scripts/agent-window.sh start\n".data(using: .utf8)!)
  exit(1)
}

let pid = app.processIdentifier
let previousApp = NSWorkspace.shared.frontmostApplication
let savedCursor = CGEvent(source: nil)!.location

// Фоновому процессу macOS не даёт активировать чужое приложение напрямую - только через
// доступность: поднять окно и сделать приложение передним.
let axApp = AXUIElementCreateApplication(pid)
var axWindows: CFTypeRef?
AXUIElementCopyAttributeValue(axApp, kAXWindowsAttribute as CFString, &axWindows)
if let window = (axWindows as? [AXUIElement])?.first {
  AXUIElementPerformAction(window, kAXRaiseAction as CFString)
}
AXUIElementSetAttributeValue(axApp, kAXFrontmostAttribute as CFString, kCFBooleanTrue)

func restore() {
  CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: savedCursor, mouseButton: .left)?
    .post(tap: .cghidEventTap)
  if let previous = previousApp, previous.processIdentifier != pid {
    AXUIElementSetAttributeValue(
      AXUIElementCreateApplication(previous.processIdentifier), kAXFrontmostAttribute as CFString, kCFBooleanTrue)
  }
}

// Окно может жить на другом рабочем столе: ждём, пока система на него переключится и
// оно станет передним - иначе клик уйдёт в чужое окно.
var bounds: CGRect? = nil
for _ in 0..<40 {
  usleep(100_000)
  let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
  let topmost = info.first { ($0[kCGWindowLayer as String] as? Int) == 0 }
  if (topmost?[kCGWindowOwnerPID as String] as? Int32) == pid,
     let rect = topmost?[kCGWindowBounds as String] as? [String: CGFloat] {
    bounds = CGRect(x: rect["X"]!, y: rect["Y"]!, width: rect["Width"]!, height: rect["Height"]!)
    break
  }
}

guard let window = bounds else {
  restore()
  FileHandle.standardError.write("Окно копии не стало передним - ничего не делаю\n".data(using: .utf8)!)
  exit(1)
}
usleep(400_000)

func screenPoint(_ point: CGPoint) -> CGPoint {
  CGPoint(x: window.minX + point.x, y: window.minY + point.y)
}

func post(_ type: CGEventType, _ point: CGPoint) {
  CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: screenPoint(point), mouseButton: .left)?
    .post(tap: .cghidEventTap)
}

if command == "click" {
  for point in points {
    post(.mouseMoved, point)
    usleep(150_000)
    post(.leftMouseDown, point)
    usleep(60_000)
    post(.leftMouseUp, point)
    print("\(Int(Date().timeIntervalSince1970 * 1000)) click \(Int(point.x)) \(Int(point.y))")
    usleep(400_000)
  }
} else {
  // Ломаная шагом в 1px. При drag кнопка зажата, и окно уезжает вместе с курсором:
  // точки считаются от исходного положения окна.
  var path = [points[0]]
  for (from, to) in zip(points, points.dropFirst()) {
    let steps = max(Int(max(abs(to.x - from.x), abs(to.y - from.y))), 1)
    for step in 1...steps {
      let t = CGFloat(step) / CGFloat(steps)
      path.append(CGPoint(x: (from.x + (to.x - from.x) * t).rounded(), y: (from.y + (to.y - from.y) * t).rounded()))
    }
  }
  if command == "drag" {
    post(.mouseMoved, path[0])
    usleep(150_000)
    post(.leftMouseDown, path[0])
    usleep(100_000)
  }
  for point in path.dropFirst(command == "drag" ? 1 : 0) {
    post(command == "drag" ? .leftMouseDragged : .mouseMoved, point)
    if command == "move" { print("\(Int(Date().timeIntervalSince1970 * 1000)) \(Int(point.x)) \(Int(point.y))") }
    usleep(12_000)
  }
  if command == "drag" {
    post(.leftMouseUp, path[path.count - 1])
    usleep(300_000)
    let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
    let moved = info.first { ($0[kCGWindowOwnerPID as String] as? Int32) == pid && ($0[kCGWindowLayer as String] as? Int) == 0 }
    if let rect = moved?[kCGWindowBounds as String] as? [String: CGFloat] {
      print("окно сдвинулось на \(Int(rect["X"]! - window.minX)),\(Int(rect["Y"]! - window.minY))")
    }
  }
  usleep(300_000)
}

restore()
