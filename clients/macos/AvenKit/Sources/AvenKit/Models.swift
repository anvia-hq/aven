import Foundation

// The wire types, mirroring packages/protocol/src/events.ts.

public struct DiffLine: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case add, del, ctx }
    public var type: Kind
    public var text: String
}

public struct QuestionChoice: Codable, Equatable, Sendable, Hashable {
    public var label: String
    public var value: String

    public init(label: String, value: String) {
        self.label = label
        self.value = value
    }
}

public struct Question: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var text: String
    public var choices: [QuestionChoice]?
    public var allowCustom: Bool?

    public init(id: String, text: String, choices: [QuestionChoice]? = nil, allowCustom: Bool? = nil) {
        self.id = id
        self.text = text
        self.choices = choices
        self.allowCustom = allowCustom
    }
}

public struct QuestionAnswer: Codable, Equatable, Sendable {
    public var questionId: String
    public var value: String

    public init(questionId: String, value: String) {
        self.questionId = questionId
        self.value = value
    }
}

public struct ToolArtifact: Codable, Equatable, Sendable {
    public var name: String
    public var mediaType: String
    public var caption: String?
    public var title: String?
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
    public var questions: [Question]?
    public var artifacts: [ToolArtifact]?
}

public enum Part: Equatable, Sendable, Codable {
    case text(String)
    /// The model's reasoning on its way to what follows it (decision 0115).
    case reasoning(String)
    case tool(Tool)

    private enum CodingKeys: String, CodingKey { case type, text, tool }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .type) {
        case "text": self = .text(try container.decode(String.self, forKey: .text))
        case "reasoning": self = .reasoning(try container.decode(String.self, forKey: .text))
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
        case .reasoning(let text):
            try container.encode("reasoning", forKey: .type)
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
    case runResume
    case text(delta: String)
    case reasoning(delta: String)
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
        case "run_resume": self = .runResume
        case "text": self = .text(delta: try c.decode(String.self, forKey: .delta))
        case "reasoning": self = .reasoning(delta: try c.decode(String.self, forKey: .delta))
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

public struct SessionUser: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var email: String
    public var image: String?
}

public struct SessionRecord: Codable, Equatable, Sendable {
    public var id: String
    public var activeOrganizationId: String?
}

public struct SessionInfo: Codable, Equatable, Sendable {
    public var user: SessionUser
    public var session: SessionRecord
}

public struct Project: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    /// The runner that hosts the project's sandboxes; nil only on a project from before sandboxes.
    public var runtimeId: String?
}

public struct ThreadSummary: Codable, Equatable, Sendable, Identifiable, Hashable {
    public var id: String
    public var projectId: String
    public var title: String
    /// Absent on a thread that was just created, which cannot be running yet.
    public var running: Bool
    public var updatedAt: String
    public var state: String
    public var visibility: String
    public var pinnedAt: String?
    public var runtimeId: String?
    public var createdBy: String?
    public var createdByName: String?
    public var awaitingAnswer: Bool

    public var isPinned: Bool { pinnedAt != nil }
    public var isArchived: Bool { state == "archived" }
    public var isShared: Bool { visibility == "workspace" }

    private enum CodingKeys: String, CodingKey {
        case id, projectId, title, running, updatedAt, state, visibility, pinnedAt, runtimeId
        case createdBy, createdByName, awaitingAnswer
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        projectId = try c.decode(String.self, forKey: .projectId)
        title = try c.decode(String.self, forKey: .title)
        running = try c.decodeIfPresent(Bool.self, forKey: .running) ?? false
        updatedAt = try c.decode(String.self, forKey: .updatedAt)
        state = try c.decodeIfPresent(String.self, forKey: .state) ?? "open"
        visibility = try c.decodeIfPresent(String.self, forKey: .visibility) ?? "private"
        pinnedAt = try c.decodeIfPresent(String.self, forKey: .pinnedAt)
        runtimeId = try c.decodeIfPresent(String.self, forKey: .runtimeId)
        createdBy = try c.decodeIfPresent(String.self, forKey: .createdBy)
        createdByName = try c.decodeIfPresent(String.self, forKey: .createdByName)
        awaitingAnswer = try c.decodeIfPresent(Bool.self, forKey: .awaitingAnswer) ?? false
    }
}

public struct ThreadDetail: Codable, Equatable, Sendable {
    public var id: String
    public var projectId: String
    public var title: String
    public var state: String
    public var visibility: String
    public var running: Bool
    public var awaitingAnswer: Bool
    public var messages: [Message]
    public var hidden: Int
    public var createdBy: String?
    public var createdByName: String?

    private enum CodingKeys: String, CodingKey {
        case id, projectId, title, state, visibility, running, awaitingAnswer
        case messages, hidden, createdBy, createdByName
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        projectId = try c.decode(String.self, forKey: .projectId)
        title = try c.decode(String.self, forKey: .title)
        state = try c.decodeIfPresent(String.self, forKey: .state) ?? "open"
        visibility = try c.decodeIfPresent(String.self, forKey: .visibility) ?? "private"
        running = try c.decodeIfPresent(Bool.self, forKey: .running) ?? false
        awaitingAnswer = try c.decodeIfPresent(Bool.self, forKey: .awaitingAnswer) ?? false
        messages = try c.decodeIfPresent([Message].self, forKey: .messages) ?? []
        hidden = try c.decodeIfPresent(Int.self, forKey: .hidden) ?? 0
        createdBy = try c.decodeIfPresent(String.self, forKey: .createdBy)
        createdByName = try c.decodeIfPresent(String.self, forKey: .createdByName)
    }
}

public struct ThreadMessagesPage: Codable, Equatable, Sendable {
    public var messages: [Message]
    public var hidden: Int
}

public struct Runtime: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var online: Bool
}

public struct ProviderSummary: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var kind: String
    public var name: String
    public var modelId: String?
    public var isDefault: Bool

    private enum CodingKeys: String, CodingKey {
        case id, kind, name, modelId, isDefault
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = try c.decode(String.self, forKey: .kind)
        name = try c.decode(String.self, forKey: .name)
        modelId = try c.decodeIfPresent(String.self, forKey: .modelId)
        isDefault = try c.decodeIfPresent(Bool.self, forKey: .isDefault) ?? false
    }
}

public struct ProviderModels: Codable, Equatable, Sendable {
    public var models: [String]
    public var labels: [String: String]?
    public var efforts: [String: [String]]?
}
