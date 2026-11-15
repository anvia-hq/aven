import Foundation

/// The control plane's information architecture, in the same order as the web app.
/// The macOS shell reads this so a screen cannot drift from the sidebar without a test failing.

public struct SettingsEntry: Equatable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var group: String
    public var ownerOnly: Bool
    public var summary: String

    public init(id: String, label: String, group: String, ownerOnly: Bool = false, summary: String) {
        self.id = id
        self.label = label
        self.group = group
        self.ownerOnly = ownerOnly
        self.summary = summary
    }
}

public struct CockpitEntry: Equatable, Sendable, Identifiable {
    public var id: String
    public var label: String

    public init(id: String, label: String) {
        self.id = id
        self.label = label
    }
}

public enum ControlPlaneCatalog {
    public static let rail = ["Threads", "Cockpit", "Bot", "Settings"]

    public static let threadTabs = ["New thread", "Projects"]

    public static let recencyLabels = ["Today", "Last 7 days", "Last 30 days"]

    public static let sharedSection = "Shared with workspace"

    public static let cockpit = [
        CockpitEntry(id: "inbox", label: "Inbox"),
        CockpitEntry(id: "tasks", label: "Tasks"),
        CockpitEntry(id: "notes", label: "Notes"),
        CockpitEntry(id: "tags", label: "Tags"),
    ]

    public static let projectViews = ["All", "Mine", "Working"]

    public static let taskStatuses = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"]

    public static let taskStatusLabels = [
        "backlog": "Backlog",
        "todo": "To do",
        "in_progress": "In progress",
        "in_review": "In review",
        "done": "Done",
        "cancelled": "Cancelled",
    ]

    public static let taskPriorities = ["urgent", "high", "medium", "low", "none"]

    public static let settings: [SettingsEntry] = [
        SettingsEntry(
            id: "general", label: "General", group: "Personal",
            summary: "Your personal account and preferences."),
        SettingsEntry(
            id: "profile", label: "Profile", group: "Personal",
            summary: "Your threads, streaks and tokens."),
        SettingsEntry(
            id: "providers", label: "Providers", group: "Personal",
            summary: "The models your threads run on. They belong to you, not to a workspace; the default one is used when you send a message."),
        SettingsEntry(
            id: "claude", label: "Claude Subscription", group: "Personal",
            summary: "Run threads on Anthropic's Claude Agent SDK with your own Claude subscription, instead of Aven's own agent."),
        SettingsEntry(
            id: "bots", label: "Bots", group: "Personal",
            summary: "The model each of your bots talks with. A bot with no model of its own uses your default provider."),
        SettingsEntry(
            id: "skills", label: "Skills", group: "Personal",
            summary: "Instructions for particular kinds of task. The agent sees each skill's name and description, and reads the rest when a task calls for it."),
        SettingsEntry(
            id: "mcp", label: "MCP servers", group: "Personal",
            summary: "Remote tool servers your agents can use. They are yours, in every workspace, and only your own bots and threads use them."),
        SettingsEntry(
            id: "mcp-access", label: "MCP access", group: "Personal",
            summary: "Let other tools and agents use Aven as you, through MCP. Each token has the permissions you choose, and you can remove it at any time."),
        SettingsEntry(
            id: "webhooks", label: "Webhooks", group: "Personal",
            summary: "Get reports from other services to your main bot. It decides what each one needs."),
        SettingsEntry(
            id: "memory", label: "Memory", group: "Personal",
            summary: "Notes your agents keep about you and your work, and read in later conversations. They are yours alone."),
        SettingsEntry(
            id: "environment-variables", label: "Environment variables", group: "Personal",
            summary: "Yours alone, in this workspace. They replace a project's or the workspace's of the same name."),
        SettingsEntry(
            id: "members", label: "Members", group: "Workspace",
            summary: "People with access to this workspace."),
        SettingsEntry(
            id: "github", label: "GitHub", group: "Workspace",
            summary: "How this workspace reaches GitHub."),
        SettingsEntry(
            id: "runtimes", label: "Runtimes", group: "Workspace",
            summary: "Computers that run agents in their own folders. A project runs on one, and only its owner can start threads on it."),
        SettingsEntry(
            id: "workspace-variables", label: "Variables", group: "Workspace",
            summary: "For every project in the workspace. Only an owner or an admin can change them."),
        SettingsEntry(
            id: "decision-model", label: "Decision model", group: "Workspace",
            summary: "One for the workspace. Only an owner or an admin can change it."),
        SettingsEntry(
            id: "platform", label: "Platform", group: "Platform", ownerOnly: true,
            summary: "Settings for the whole installation."),
        SettingsEntry(
            id: "people", label: "People", group: "Platform", ownerOnly: true,
            summary: "Every account on this installation, including people who are in none of your workspaces."),
        SettingsEntry(
            id: "announcements", label: "Announcements", group: "Platform", ownerOnly: true,
            summary: "Show a card in every sidebar. Clicking it opens the details."),
    ]

    public static func settings(isOwner: Bool) -> [SettingsEntry] {
        settings.filter { isOwner || !$0.ownerOnly }
    }

    public static func settingsGroups(isOwner: Bool) -> [(String, [SettingsEntry])] {
        let visible = settings(isOwner: isOwner)
        var groups: [(String, [SettingsEntry])] = []
        for entry in visible {
            if groups.last?.0 == entry.group {
                groups[groups.count - 1].1.append(entry)
            } else {
                groups.append((entry.group, [entry]))
            }
        }
        return groups
    }
}
