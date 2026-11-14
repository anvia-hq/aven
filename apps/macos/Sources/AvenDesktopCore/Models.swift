import Foundation

extension KeyedDecodingContainer {
    func optional<T: Decodable>(_ key: Key, default fallback: @autoclosure () -> T) -> T {
        (try? decodeIfPresent(T.self, forKey: key)) ?? fallback()
    }
}

public struct PlatformConfig: Codable, Equatable, Sendable {
    public var registrationEnabled: Bool
    public var githubLogin: Bool
    public var emailLogin: Bool
    public var isOwner: Bool
}

public struct Account: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var email: String
    public var image: String?
}

public struct AuthSession: Equatable, Sendable {
    public var user: Account
    public var activeOrganizationId: String?
}

extension AuthSession: Decodable {
    private enum CodingKeys: String, CodingKey { case session, user }
    private struct SessionBody: Decodable {
        var activeOrganizationId: String?
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        user = try container.decode(Account.self, forKey: .user)
        activeOrganizationId = try container.decodeIfPresent(SessionBody.self, forKey: .session)?
            .activeOrganizationId
    }
}

public struct Organization: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var slug: String?
}

public struct OrganizationMember: Identifiable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var email: String
    public var role: String
    public var image: String?
    public var status: String
}

public struct OrganizationInvitation: Decodable, Equatable, Sendable, Identifiable {
    public var id: String
    public var organizationName: String?
    public var inviterEmail: String?
    public var role: String
    public var email: String?
    public var status: String?
    public var organizationId: String?

    private enum CodingKeys: String, CodingKey {
        case id, organizationName, inviterEmail, role, email, status, organizationId
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        organizationName = try container.decodeIfPresent(String.self, forKey: .organizationName)
        inviterEmail = try container.decodeIfPresent(String.self, forKey: .inviterEmail)
        role = container.optional(.role, default: "member")
        email = try container.decodeIfPresent(String.self, forKey: .email)
        status = try container.decodeIfPresent(String.self, forKey: .status)
        organizationId = try container.decodeIfPresent(String.self, forKey: .organizationId)
    }
}

public struct FullOrganization: Decodable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var members: [OrganizationMember]
    public var invitations: [OrganizationInvitation]

    private struct RawMember: Decodable {
        var id: String
        var role: String
        var user: Account
    }

    private enum CodingKeys: String, CodingKey { case id, name, members, invitations }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = container.optional(.name, default: "Workspace")
        let raw: [RawMember] = container.optional(.members, default: [])
        members = raw.map {
            OrganizationMember(
                id: $0.id, name: $0.user.name, email: $0.user.email, role: $0.role,
                image: $0.user.image, status: "active")
        }
        invitations = container.optional(.invitations, default: []).filter { $0.status == "pending" }
    }
}

public struct Project: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var repoFullName: String?
    public var defaultBranch: String?
    public var directory: String?
    public var runtimeId: String
    public var createdBy: String
    public var createdAt: String
    public var updatedAt: String
}

public struct ThreadPerson: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var image: String?
}

public struct PullRequest: Codable, Equatable, Sendable, Identifiable {
    public var number: Int
    public var url: String
    public var branch: String
    public var title: String
    public var state: String
    public var id: Int { number }
}

public struct AvenThread: Identifiable, Equatable, Sendable {
    public var id: String
    public var projectId: String
    public var title: String
    public var agentBackend: String
    public var createdBy: String
    public var createdByName: String
    public var createdByImage: String?
    public var participants: [ThreadPerson]
    public var visibility: String
    public var drivingUntil: String?
    public var parentThreadId: String?
    public var runtimeId: String
    public var state: String
    public var running: Bool
    public var awaitingAnswer: Bool
    public var pullRequests: [PullRequest]
    public var createdAt: String
    public var updatedAt: String
    public var messages: [ChatMessage]
    public var hidden: Int
}

extension AvenThread: Decodable {
    private enum CodingKeys: String, CodingKey {
        case id, projectId, title, agentBackend, createdBy, createdByName, createdByImage
        case participants, visibility, drivingUntil, parentThreadId, runtimeId, state, running
        case awaitingAnswer, pullRequests, createdAt, updatedAt, messages, hidden
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        projectId = container.optional(.projectId, default: "")
        title = container.optional(.title, default: "Thread")
        agentBackend = container.optional(.agentBackend, default: "native")
        createdBy = container.optional(.createdBy, default: "")
        createdByName = container.optional(.createdByName, default: "")
        createdByImage = try container.decodeIfPresent(String.self, forKey: .createdByImage)
        participants = container.optional(.participants, default: [])
        visibility = container.optional(.visibility, default: "private")
        drivingUntil = try container.decodeIfPresent(String.self, forKey: .drivingUntil)
        parentThreadId = try container.decodeIfPresent(String.self, forKey: .parentThreadId)
        runtimeId = container.optional(.runtimeId, default: "")
        state = container.optional(.state, default: "open")
        running = container.optional(.running, default: false)
        awaitingAnswer = container.optional(.awaitingAnswer, default: false)
        pullRequests = container.optional(.pullRequests, default: [])
        createdAt = container.optional(.createdAt, default: "")
        updatedAt = container.optional(.updatedAt, default: "")
        messages = container.optional(.messages, default: [])
        hidden = container.optional(.hidden, default: 0)
    }
}

public struct CreatedID: Decodable, Equatable, Sendable {
    public var id: String
}

public struct QuestionChoice: Codable, Equatable, Sendable, Identifiable {
    public var label: String
    public var value: String
    public var id: String { value }
}

public struct QuestionPrompt: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var text: String
    public var choices: [QuestionChoice]?
    public var allowCustom: Bool?
}

public struct ToolCall: Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var target: String
    public var status: String
    public var output: String?
    public var questions: [QuestionPrompt]?

    public init(
        id: String, name: String, target: String, status: String, output: String? = nil,
        questions: [QuestionPrompt]? = nil
    ) {
        self.id = id
        self.name = name
        self.target = target
        self.status = status
        self.output = output
        self.questions = questions
    }
}

extension ToolCall: Decodable {
    private enum CodingKeys: String, CodingKey {
        case id, name, target, status, output, questions
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = container.optional(.id, default: UUID().uuidString)
        name = container.optional(.name, default: "tool")
        target = container.optional(.target, default: "")
        status = container.optional(.status, default: "running")
        output = try container.decodeIfPresent(String.self, forKey: .output)
        questions = try container.decodeIfPresent([QuestionPrompt].self, forKey: .questions)
    }
}

public enum MessagePart: Equatable, Sendable {
    case text(String)
    case reasoning(String)
    case tool(ToolCall)
    case ignored
}

extension MessagePart: Decodable {
    private enum CodingKeys: String, CodingKey { case type, text, tool }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .type) {
        case "text":
            self = .text(container.optional(.text, default: ""))
        case "reasoning":
            self = .reasoning(container.optional(.text, default: ""))
        case "tool":
            if let tool = try? container.decode(ToolCall.self, forKey: .tool) {
                self = .tool(tool)
            } else {
                self = .ignored
            }
        default:
            self = .ignored
        }
    }
}

public struct ChatMessage: Identifiable, Equatable, Sendable {
    public var id: String
    public var role: String
    public var parts: [MessagePart]
    public var senderId: String?

    public init(id: String, role: String, parts: [MessagePart], senderId: String? = nil) {
        self.id = id
        self.role = role
        self.parts = parts
        self.senderId = senderId
    }

    public var text: String {
        parts.compactMap { part in
            if case .text(let text) = part { return text }
            return nil
        }.joined()
    }
}

extension ChatMessage: Decodable {
    private enum CodingKeys: String, CodingKey { case id, role, parts, senderId }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = container.optional(.id, default: UUID().uuidString)
        role = container.optional(.role, default: "assistant")
        parts = container.optional(.parts, default: [])
        senderId = try container.decodeIfPresent(String.self, forKey: .senderId)
    }
}

public struct RuntimeStats: Decodable, Equatable, Sendable {
    public var cores: Int
    public var cpuPercent: Double?
    public var memoryUsedBytes: Double
    public var memoryTotalBytes: Double
    public var diskUsedBytes: Double
    public var diskTotalBytes: Double
    public var sandboxes: Int

    private enum CodingKeys: String, CodingKey {
        case cores, cpuPercent, memoryUsedBytes, memoryTotalBytes, diskUsedBytes, diskTotalBytes, sandboxes
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        cores = container.optional(.cores, default: 0)
        cpuPercent = try container.decodeIfPresent(Double.self, forKey: .cpuPercent)
        memoryUsedBytes = container.optional(.memoryUsedBytes, default: 0)
        memoryTotalBytes = container.optional(.memoryTotalBytes, default: 0)
        diskUsedBytes = container.optional(.diskUsedBytes, default: 0)
        diskTotalBytes = container.optional(.diskTotalBytes, default: 0)
        sandboxes = container.optional(.sandboxes, default: 0)
    }
}

public struct Runtime: Identifiable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var ownerId: String?
    public var host: Bool
    public var shared: Bool
    public var githubMode: String
    public var directories: [String]
    public var tokenHint: String
    public var online: Bool
    public var build: String?
    public var outdated: Bool
    public var updateTo: String?
    public var isControlPlane: Bool
    public var canUpdate: Bool
    public var stats: RuntimeStats?
    public var lastSeenAt: String?
    public var createdAt: String
}

extension Runtime: Decodable {
    private enum CodingKeys: String, CodingKey {
        case id, name, ownerId, host, shared, githubMode, directories, tokenHint, online, build
        case outdated, updateTo, isControlPlane, canUpdate, stats, lastSeenAt, createdAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = container.optional(.name, default: "Runtime")
        ownerId = try container.decodeIfPresent(String.self, forKey: .ownerId)
        host = container.optional(.host, default: false)
        shared = container.optional(.shared, default: false)
        githubMode = container.optional(.githubMode, default: "machine")
        directories = container.optional(.directories, default: [])
        tokenHint = container.optional(.tokenHint, default: "")
        online = container.optional(.online, default: false)
        build = try container.decodeIfPresent(String.self, forKey: .build)
        outdated = container.optional(.outdated, default: false)
        updateTo = try container.decodeIfPresent(String.self, forKey: .updateTo)
        isControlPlane = container.optional(.isControlPlane, default: false)
        canUpdate = container.optional(.canUpdate, default: false)
        stats = try container.decodeIfPresent(RuntimeStats.self, forKey: .stats)
        lastSeenAt = try container.decodeIfPresent(String.self, forKey: .lastSeenAt)
        createdAt = container.optional(.createdAt, default: "")
    }
}

public struct CreatedRuntime: Decodable, Equatable, Sendable {
    public var runtime: Runtime
    public var token: String
}

public struct Provider: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var kind: String
    public var name: String
    public var baseUrl: String?
    public var modelId: String?
    public var hasKey: Bool
    public var keyHint: String?
    public var isDefault: Bool
    public var createdAt: String
}

public struct ProviderModels: Decodable, Equatable, Sendable {
    public var models: [String]
    public var efforts: [String: EffortChoices]?

    public struct EffortChoices: Decodable, Equatable, Sendable {
        public var options: [String]
        public var defaultValue: String?
    }
}

public struct Bot: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var handle: String
    public var instruction: String
    public var description: String
    public var avatar: String
    public var providerId: String?
    public var modelId: String?
    public var reasoningEffort: String?
    public var compactAfterTokens: Int?
    public var runtimeId: String?
    public var isMain: Bool
    public var createdAt: String
    public var updatedAt: String
}

public struct BotMessage: Identifiable, Equatable, Sendable {
    public var id: String
    public var role: String
    public var text: String
    public var reactions: [String]
    public var peerName: String?

    public init(id: String, role: String, text: String, reactions: [String] = [], peerName: String? = nil) {
        self.id = id
        self.role = role
        self.text = text
        self.reactions = reactions
        self.peerName = peerName
    }
}

extension BotMessage: Decodable {
    private struct Peer: Decodable {
        var name: String?
        var handle: String?
    }
    private enum CodingKeys: String, CodingKey { case id, role, text, reactions, peer }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = container.optional(.id, default: UUID().uuidString)
        role = container.optional(.role, default: "bot")
        text = container.optional(.text, default: "")
        reactions = container.optional(.reactions, default: [])
        let peer = try container.decodeIfPresent(Peer.self, forKey: .peer)
        peerName = peer?.name ?? peer?.handle
    }
}

public struct InboxItem: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var body: String
    public var tags: [String]
    public var done: Bool
    public var createdAt: String
    public var updatedAt: String
}

public struct CockpitTask: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var number: Int
    public var title: String
    public var description: String
    public var status: String
    public var priority: String
    public var dueDate: String?
    public var tags: [String]
    public var position: Double
    public var createdAt: String
    public var updatedAt: String
}

public struct CockpitNote: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var body: String
    public var tags: [String]
    public var pinned: Bool
    public var createdAt: String
    public var updatedAt: String
}

public struct CockpitTag: Codable, Equatable, Sendable, Identifiable {
    public var name: String
    public var color: String?
    public var inbox: Int
    public var tasks: Int
    public var notes: Int
    public var id: String { name }
}

public struct Skill: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var description: String
    public var enabled: Bool
    public var createdAt: String
    public var updatedAt: String
}

public struct BuiltinSkill: Codable, Equatable, Sendable, Identifiable {
    public var name: String
    public var description: String
    public var id: String { name }
}

public struct McpServer: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var slug: String
    public var url: String
    public var headerNames: [String]
    public var target: String
    public var enabled: Bool
    public var allowLocal: Bool
    public var lastError: String?
    public var lastUsedAt: String?
    public var createdAt: String
    public var updatedAt: String
}

public struct AccessToken: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var hint: String
    public var permissions: [String]
    public var lastUsedAt: String?
    public var createdAt: String
}

public struct CreatedAccessToken: Codable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var token: String
    public var hint: String
    public var permissions: [String]
}

public struct Webhook: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var hint: String
    public var path: String
    public var enabled: Bool
    public var lastDeliveryAt: String?
    public var lastStatus: String?
    public var createdAt: String
}

public struct CreatedWebhook: Codable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var token: String
    public var urlPath: String
}

public struct MemoryNote: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var scope: String
    public var projectId: String?
    public var botId: String?
    public var name: String
    public var description: String
    public var body: String
    public var updatedAt: String
}

public struct MemoryEvent: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var scope: String
    public var name: String
    public var action: String
    public var source: String
    public var at: String
}

public struct Variable: Codable, Equatable, Sendable, Identifiable {
    public var name: String
    public var secret: Bool
    public var value: String?
    public var valueHint: String?
    public var updatedAt: String
    public var id: String { name }
}

public struct VariableEvent: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var action: String
    public var secret: Bool
    public var source: String
    public var createdAt: String
    public var actor: String?
}

public struct DecisionModel: Codable, Equatable, Sendable {
    public var kind: String
    public var modelId: String
    public var keyHint: String
    public var source: String
}

public struct DecisionModelResponse: Codable, Equatable, Sendable {
    public var decisionModel: DecisionModel?
}

public struct ClaudeSetup: Codable, Equatable, Sendable {
    public var configured: Bool
    public var hint: String?
}

public struct ProfileDay: Codable, Equatable, Sendable, Identifiable {
    public var date: String
    public var tokens: Int
    public var id: String { date }
}

public struct ProfileStats: Codable, Equatable, Sendable {
    public var today: String
    public var threads: Int
    public var longestThreadMs: Double
    public var currentStreakDays: Int
    public var longestStreakDays: Int
    public var tokens: Int
    public var days: [ProfileDay]
}

public struct Announcement: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var summary: String
    public var details: String
    public var template: String
    public var active: Bool
    public var createdAt: String
    public var updatedAt: String
}

public struct PlatformPerson: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var email: String
    public var image: String?
    public var createdAt: String
    public var lastActiveAt: String?
    public var owner: Bool
    public var workspaces: [WorkspaceMembership]
}

public struct WorkspaceMembership: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var role: String
}

public struct ServerModel: Codable, Equatable, Sendable {
    public var kind: String
    public var modelId: String
    public var keyHint: String
    public var source: String
}

public struct ServerModels: Codable, Equatable, Sendable {
    public var decision: ServerModel?
    public var small: ServerModel?
}

public struct GithubStatus: Codable, Equatable, Sendable {
    public var configured: Bool
    public var installUrl: String?
    public var canSetUp: Bool
    public var appKey: String
    public var own: Bool
    public var canSetUpWorkspace: Bool
}

public struct GithubAccount: Codable, Equatable, Sendable {
    public var connected: Bool
    public var login: String?
    public var appKey: String
}

public struct Mention: Codable, Equatable, Sendable, Identifiable {
    public var threadId: String
    public var title: String
    public var authorName: String?
    public var excerpt: String
    public var createdAt: String
    public var read: Bool
    public var id: String { threadId + createdAt }
}

public struct Preferences: Codable, Equatable, Sendable {
    public var timezone: String?
    public var defaultTimezone: String
    public var followUps: FollowUps
}

public struct FollowUps: Codable, Equatable, Sendable {
    public var enabled: Bool
    public var providerId: String?
    public var modelId: String?
    public var serverModel: ServerSmallModel?
}

public struct ServerSmallModel: Codable, Equatable, Sendable {
    public var provider: String
    public var modelId: String
}

public struct FolderEntry: Codable, Equatable, Sendable, Identifiable {
    public var name: String
    public var path: String
    public var git: Bool
    public var id: String { path }
}

public struct FolderListing: Codable, Equatable, Sendable {
    public var path: String?
    public var parent: String?
    public var folders: [FolderEntry]
}

public struct RepoEntry: Codable, Equatable, Sendable, Identifiable {
    public var name: String
    public var path: String
    public var type: String
    public var id: String { path }
}

public struct RepoListing: Codable, Equatable, Sendable {
    public var entries: [RepoEntry]
}

public struct RepoReadmeBody: Codable, Equatable, Sendable {
    public var name: String
    public var path: String
    public var text: String
    public var truncated: Bool
}

public struct RepoReadmeResponse: Codable, Equatable, Sendable {
    public var readme: RepoReadmeBody?
}

public struct RepoCommit: Codable, Equatable, Sendable, Identifiable {
    public var sha: String
    public var message: String
    public var author: String?
    public var date: String
    public var id: String { sha }
}

public struct RepoCommitPage: Codable, Equatable, Sendable {
    public var commits: [RepoCommit]
    public var hasMore: Bool
}

public struct TrackedItem: Codable, Equatable, Sendable, Identifiable {
    public var number: Int
    public var title: String
    public var url: String
    public var author: String?
    public var status: String
    public var comments: Int
    public var updatedAt: String
    public var id: Int { number }
}

public struct TrackedPage: Codable, Equatable, Sendable {
    public var items: [TrackedItem]
    public var total: Int
    public var hasMore: Bool
}

public struct FileEntry: Codable, Equatable, Sendable, Identifiable {
    public var name: String
    public var type: String
    public var id: String { name }
}

public struct ThreadFolder: Decodable, Equatable, Sendable {
    public var available: Bool
    public var entries: [FileEntry]

    private enum CodingKeys: String, CodingKey { case available, entries }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        available = container.optional(.available, default: false)
        entries = container.optional(.entries, default: [])
    }
}

public struct ThreadFile: Decodable, Equatable, Sendable {
    public var available: Bool
    public var kind: String?
    public var text: String?
    public var size: Int?

    private enum CodingKeys: String, CodingKey { case available, kind, text, size }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        available = container.optional(.available, default: false)
        kind = try container.decodeIfPresent(String.self, forKey: .kind)
        text = try container.decodeIfPresent(String.self, forKey: .text)
        size = try container.decodeIfPresent(Int.self, forKey: .size)
    }
}

public struct ThreadDiff: Decodable, Equatable, Sendable {
    public var available: Bool
    public var patch: String?
    public var truncated: Bool

    private enum CodingKeys: String, CodingKey { case available, patch, truncated }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        available = container.optional(.available, default: false)
        patch = try container.decodeIfPresent(String.self, forKey: .patch)
        truncated = container.optional(.truncated, default: false)
    }
}

public struct ShipReadiness: Decodable, Equatable, Sendable {
    public var ready: Bool
    public var ship: Bool
    public var appKey: String?
    public var machine: Bool
    public var githubMode: String

    private enum CodingKeys: String, CodingKey { case ready, ship, appKey, machine, githubMode }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        ready = container.optional(.ready, default: false)
        ship = container.optional(.ship, default: false)
        appKey = try container.decodeIfPresent(String.self, forKey: .appKey)
        machine = container.optional(.machine, default: false)
        githubMode = container.optional(.githubMode, default: "machine")
    }
}

public struct ComputerStatus: Decodable, Equatable, Sendable {
    public var available: Bool
    public var state: String?

    private enum CodingKeys: String, CodingKey { case available, state }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        available = container.optional(.available, default: false)
        state = try container.decodeIfPresent(String.self, forKey: .state)
    }
}

public struct BackgroundProcess: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var command: String
    public var status: String
    public var exitCode: Int?
    public var startedAt: String
}

public struct ProcessList: Codable, Equatable, Sendable {
    public var processes: [BackgroundProcess]
}

public struct ProcessLogs: Codable, Equatable, Sendable {
    public var stdout: String
    public var stderr: String
    public var truncated: Bool
}

public struct PreviewTicket: Codable, Equatable, Sendable {
    public var url: String
    public var embedUrl: String
}

public struct MessagePage: Decodable, Equatable, Sendable {
    public var messages: [ChatMessage]
    public var hidden: Int

    private enum CodingKeys: String, CodingKey { case messages, hidden }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        messages = container.optional(.messages, default: [])
        hidden = container.optional(.hidden, default: 0)
    }
}

public struct OkReply: Codable, Equatable, Sendable {
    public var ok: Bool?
}

public struct AcceptInvitationResult: Decodable, Equatable, Sendable {
    public var organizationId: String?

    private struct Invitation: Decodable { var organizationId: String? }
    private enum CodingKeys: String, CodingKey { case invitation, organizationId }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        organizationId =
            try container.decodeIfPresent(Invitation.self, forKey: .invitation)?.organizationId
            ?? container.decodeIfPresent(String.self, forKey: .organizationId)
    }
}
