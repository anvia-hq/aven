import Foundation

/// The transcript a client renders and whether a run is live. The reducer must behave exactly like
/// `applyEvent` / `isRunning` in packages/protocol/src/events.ts; the shared fixtures in
/// packages/protocol/fixtures check that from both sides.
public struct Transcript: Equatable, Sendable {
    public var messages: [Message] = []
    public var running = false

    public init(messages: [Message] = [], running: Bool = false) {
        self.messages = messages
        self.running = running
    }

    public mutating func apply(_ event: RunEvent) {
        switch event {
        case .snapshot(let messages, let running):
            self.messages = messages
            self.running = running
        case .runStart(let prompt):
            running = true
            let n = messages.count
            messages.append(Message(id: "m-\(n)", role: .user, parts: [.text(prompt)]))
            messages.append(Message(id: "m-\(n + 1)", role: .assistant, parts: []))
        case .text(let delta):
            changeLastAssistant { parts in
                if case .text(let existing)? = parts.last {
                    parts[parts.count - 1] = .text(existing + delta)
                } else {
                    parts.append(.text(delta))
                }
            }
        case .toolStart(let tool):
            changeLastAssistant { $0.append(.tool(tool)) }
        case .toolEnd(let id, let status, let output):
            changeLastAssistant { parts in
                for index in parts.indices {
                    if case .tool(var tool) = parts[index], tool.id == id {
                        tool.status = status
                        tool.output = output
                        parts[index] = .tool(tool)
                    }
                }
            }
        case .done, .error:
            running = false
        case .unknown:
            break
        }
    }

    private mutating func changeLastAssistant(_ change: (inout [Part]) -> Void) {
        guard let index = messages.lastIndex(where: { $0.role == .assistant }) else { return }
        change(&messages[index].parts)
    }
}
