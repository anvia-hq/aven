import Foundation

// The wire types, mirroring packages/protocol/src/events.ts.

public struct DiffLine: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case add, del, ctx }
    public var type: Kind
    public var text: String
}

public struct Tool: Codable, Equatable, Sendable, Identifiable {
    public enum Status: String, Codable, Sendable { case running, done, error }
    public var id: String
    public var name: String
    /// What the tool acted on: a path, command or query.
    public var target: String
    public var status: Status
    public var diff: [DiffLine]?
    public var output: String?
}

public enum Part: Equatable, Sendable, Codable {
    case text(String)
    case tool(Tool)

    private enum CodingKeys: String, CodingKey { case type, text, tool }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .type) {
        case "text": self = .text(try container.decode(String.self, forKey: .text))
        case "tool": self = .tool(try container.decode(Tool.self, forKey: .tool))
        case let other:
            throw DecodingError.dataCorruptedError(
                forKey: .type, in: container, debugDescription: "Unknown part type \(other)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .text(let text):
            try container.encode("text", forKey: .type)
            try container.encode(text, forKey: .text)
        case .tool(let tool):
            try container.encode("tool", forKey: .type)
            try container.encode(tool, forKey: .tool)
        }
    }
}

public struct Message: Codable, Equatable, Sendable, Identifiable {
    public enum Role: String, Codable, Sendable { case user, assistant }
    public var id: String
    public var role: Role
    public var parts: [Part]
}

/// One server-sent run event. Types this client does not know are `.unknown` and ignored, so the
/// server can add events without breaking older apps.
public enum RunEvent: Equatable, Sendable, Decodable {
    case snapshot(messages: [Message], running: Bool)
    case runStart(prompt: String)
    case text(delta: String)
    case toolStart(Tool)
    case toolEnd(id: String, status: Tool.Status, output: String?)
    case done
    case error(message: String)
    case unknown

    private enum CodingKeys: String, CodingKey {
        case type, messages, running, prompt, delta, tool, id, status, output, message
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(String.self, forKey: .type) {
        case "snapshot":
            self = .snapshot(
                messages: try c.decode([Message].self, forKey: .messages),
                running: try c.decode(Bool.self, forKey: .running))
        case "run_start": self = .runStart(prompt: try c.decode(String.self, forKey: .prompt))
        case "text": self = .text(delta: try c.decode(String.self, forKey: .delta))
        case "tool_start": self = .toolStart(try c.decode(Tool.self, forKey: .tool))
        case "tool_end":
            self = .toolEnd(
                id: try c.decode(String.self, forKey: .id),
                status: try c.decode(Tool.Status.self, forKey: .status),
                output: try c.decodeIfPresent(String.self, forKey: .output))
        case "done": self = .done
        case "error": self = .error(message: try c.decode(String.self, forKey: .message))
        default: self = .unknown
        }
    }
}

// Resources returned by the REST API.

public struct Project: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    /// The runner that hosts the project's sandboxes; nil only on a project from before sandboxes.
    public var runtimeId: String?
}

public struct ThreadSummary: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var projectId: String
    public var title: String
    /// Absent on a thread that was just created, which cannot be running yet.
    public var running: Bool
    public var updatedAt: String

    private enum CodingKeys: String, CodingKey {
        case id, projectId, title, running, updatedAt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        projectId = try c.decode(String.self, forKey: .projectId)
        title = try c.decode(String.self, forKey: .title)
        running = try c.decodeIfPresent(Bool.self, forKey: .running) ?? false
        updatedAt = try c.decode(String.self, forKey: .updatedAt)
    }
}

public struct Runtime: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var online: Bool
}
