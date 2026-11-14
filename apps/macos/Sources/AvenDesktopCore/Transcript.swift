import Foundation

public struct TokenTotals: Decodable, Equatable, Sendable {
    public var inputTokens: Int
    public var outputTokens: Int
    public var cacheWriteTokens: Int
    public var cacheReadTokens: Int
}

public struct ContextUse: Decodable, Equatable, Sendable {
    public var usedTokens: Int
    public var contextWindow: Int?
}

public struct RunUsage: Decodable, Equatable, Sendable {
    public var totals: TokenTotals
    public var context: ContextUse?
}

public enum RunEvent: Equatable, Sendable {
    case snapshot(messages: [ChatMessage], running: Bool, hidden: Int, error: String?, usage: RunUsage?)
    case runStart(prompt: String)
    case text(String)
    case reasoning(String)
    case toolStart(ToolCall)
    case toolEnd(id: String, status: String, output: String?)
    case runResume
    case done
    case error(String)
    case ignored
}

extension RunEvent: Decodable {
    private enum CodingKeys: String, CodingKey {
        case type, messages, running, hidden, error, prompt, delta, tool, id, status, output, message, usage
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .type) {
        case "snapshot":
            self = .snapshot(
                messages: container.optional(.messages, default: []),
                running: container.optional(.running, default: false),
                hidden: container.optional(.hidden, default: 0),
                error: try container.decodeIfPresent(String.self, forKey: .error),
                usage: try container.decodeIfPresent(RunUsage.self, forKey: .usage)
            )
        case "run_start":
            self = .runStart(prompt: container.optional(.prompt, default: ""))
        case "text":
            self = .text(container.optional(.delta, default: ""))
        case "reasoning":
            self = .reasoning(container.optional(.delta, default: ""))
        case "tool_start":
            if let tool = try? container.decode(ToolCall.self, forKey: .tool) {
                self = .toolStart(tool)
            } else {
                self = .ignored
            }
        case "tool_end":
            self = .toolEnd(
                id: container.optional(.id, default: ""),
                status: container.optional(.status, default: "done"),
                output: try container.decodeIfPresent(String.self, forKey: .output)
            )
        case "run_resume":
            self = .runResume
        case "done":
            self = .done
        case "error":
            self = .error(container.optional(.message, default: "The run failed"))
        default:
            self = .ignored
        }
    }
}

/// The thread transcript. The same reductions as the native client contract: unknown events are ignored.
public struct Transcript: Equatable, Sendable {
    public var messages: [ChatMessage] = []
    public var running = false
    public var hidden = 0
    public var error: String?
    public var usage: RunUsage?

    public init() {}

    public mutating func apply(_ event: RunEvent) {
        switch event {
        case .snapshot(let messages, let running, let hidden, let error, let usage):
            self.messages = messages
            self.running = running
            self.hidden = hidden
            self.error = error
            self.usage = usage
        case .runStart(let prompt):
            running = true
            error = nil
            let count = messages.count
            messages.append(ChatMessage(id: "m-\(count)", role: "user", parts: [.text(prompt)]))
            messages.append(ChatMessage(id: "m-\(count + 1)", role: "assistant", parts: []))
        case .text(let delta):
            append(delta, kind: .text)
        case .reasoning(let delta):
            append(delta, kind: .reasoning)
        case .toolStart(let tool):
            guard var message = lastAssistant else { return }
            message.parts.append(.tool(tool))
            replaceLast(message)
        case .toolEnd(let id, let status, let output):
            guard var message = lastAssistant else { return }
            message.parts = message.parts.map { part in
                guard case .tool(var tool) = part, tool.id == id else { return part }
                tool.status = status
                if let output { tool.output = output }
                return .tool(tool)
            }
            replaceLast(message)
        case .runResume:
            running = true
        case .done:
            running = false
        case .error(let message):
            running = false
            error = message
        case .ignored:
            break
        }
    }

    public var waitingQuestion: ToolCall? {
        guard !running, let part = messages.last?.parts.last, case .tool(let tool) = part else { return nil }
        guard tool.name == "ask_user", tool.status == "running", let questions = tool.questions, !questions.isEmpty else {
            return nil
        }
        return tool
    }

    private enum TextKind { case text, reasoning }

    private var lastAssistant: ChatMessage? {
        guard let message = messages.last, message.role == "assistant" else { return nil }
        return message
    }

    private mutating func replaceLast(_ message: ChatMessage) {
        guard !messages.isEmpty else { return }
        messages[messages.count - 1] = message
    }

    private mutating func append(_ delta: String, kind: TextKind) {
        guard var message = lastAssistant else { return }
        switch (kind, message.parts.last) {
        case (.text, .text(let existing)?):
            message.parts[message.parts.count - 1] = .text(existing + delta)
        case (.reasoning, .reasoning(let existing)?):
            message.parts[message.parts.count - 1] = .reasoning(existing + delta)
        case (.text, _):
            message.parts.append(.text(delta))
        case (.reasoning, _):
            message.parts.append(.reasoning(delta))
        }
        replaceLast(message)
    }
}

public enum BotStreamEvent: Equatable, Sendable {
    case snapshot(messages: [BotMessage], typing: Bool, activity: String?)
    case message(BotMessage)
    case reaction(messageId: String, emoji: String)
    case typing(Bool)
    case activity(String?)
    case error(String)
    case ignored
}

extension BotStreamEvent: Decodable {
    private enum CodingKeys: String, CodingKey {
        case type, messages, typing, activity, message, label, messageId, emoji
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .type) {
        case "snapshot":
            self = .snapshot(
                messages: container.optional(.messages, default: []),
                typing: container.optional(.typing, default: false),
                activity: try container.decodeIfPresent(String.self, forKey: .activity)
            )
        case "message":
            if let message = try? container.decode(BotMessage.self, forKey: .message) {
                self = .message(message)
            } else {
                self = .ignored
            }
        case "reaction":
            self = .reaction(
                messageId: container.optional(.messageId, default: ""),
                emoji: container.optional(.emoji, default: "")
            )
        case "typing":
            self = .typing(container.optional(.typing, default: false))
        case "activity":
            self = .activity(try container.decodeIfPresent(String.self, forKey: .label))
        case "error":
            let text = try container.decodeIfPresent(String.self, forKey: .message) ?? "The bot failed"
            self = .error(text)
        default:
            self = .ignored
        }
    }
}

public struct BotChat: Equatable, Sendable {
    public var messages: [BotMessage] = []
    public var typing = false
    public var activity: String?
    public var error: String?

    public init() {}

    public mutating func apply(_ event: BotStreamEvent) {
        switch event {
        case .snapshot(let messages, let typing, let activity):
            self.messages = messages
            self.typing = typing
            self.activity = activity
            error = nil
        case .message(let message):
            if let index = messages.firstIndex(where: { $0.id == message.id }) {
                messages[index] = message
            } else {
                messages.append(message)
            }
        case .reaction(let messageId, let emoji):
            guard let index = messages.firstIndex(where: { $0.id == messageId }) else { return }
            if !messages[index].reactions.contains(emoji) {
                messages[index].reactions.append(emoji)
            }
        case .typing(let typing):
            self.typing = typing
        case .activity(let label):
            activity = label
        case .error(let message):
            error = message
            typing = false
        case .ignored:
            break
        }
    }
}
