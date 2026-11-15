import Foundation

public enum RecencyGroupID: String, CaseIterable, Sendable, Equatable {
    case today
    case week
    case month

    public var label: String {
        switch self {
        case .today: "Today"
        case .week: "Last 7 days"
        case .month: "Last 30 days"
        }
    }
}

public struct RecencyGroup: Equatable, Sendable, Identifiable {
    public var id: RecencyGroupID
    public var label: String
    public var threads: [AvenThread]
}

public func parseTimestamp(_ value: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = fractional.date(from: value) { return date }
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    return plain.date(from: value)
}

/// Today, Last 7 days, Last 30 days. A fork sits with its parent, in the group of whichever was
/// touched last. Anything older than 30 days stays in the last group until it is archived.
public func recencyGroups(_ threads: [AvenThread], now: Date = Date()) -> [RecencyGroup] {
    let calendar = Calendar(identifier: .gregorian)
    let startOfToday = calendar.startOfDay(for: now).timeIntervalSince1970
    let weekAgo = now.timeIntervalSince1970 - 7 * 86_400
    let byID = Dictionary(uniqueKeysWithValues: threads.map { ($0.id, $0) })
    func root(of thread: AvenThread) -> AvenThread {
        var current = thread
        var seen = Set<String>()
        while let parentID = current.parentThreadId, !seen.contains(current.id), let parent = byID[parentID] {
            seen.insert(current.id)
            current = parent
        }
        return current
    }
    var latest: [String: TimeInterval] = [:]
    for thread in threads {
        let id = root(of: thread).id
        let at = parseTimestamp(thread.updatedAt)?.timeIntervalSince1970 ?? 0
        latest[id] = max(latest[id] ?? 0, at)
    }
    func groupID(_ thread: AvenThread) -> RecencyGroupID {
        let at = latest[root(of: thread).id] ?? 0
        if at >= startOfToday { return .today }
        return at >= weekAgo ? .week : .month
    }
    return RecencyGroupID.allCases.map { id in
        RecencyGroup(id: id, label: id.label, threads: threads.filter { groupID($0) == id })
    }
}

public func projectPlace(_ project: Project) -> String {
    project.repoFullName ?? project.directory ?? ""
}

public struct ProjectFilters: Equatable, Sendable {
    public var query: String
    public var view: String
    public var runnerID: String?

    public init(query: String = "", view: String = "all", runnerID: String? = nil) {
        self.query = query
        self.view = view
        self.runnerID = runnerID
    }
}

public func filterProjects(
    _ projects: [Project], filters: ProjectFilters, me: String?, running: Set<String>
) -> [Project] {
    let query = filters.query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return projects.filter { project in
        if !query.isEmpty {
            let haystack = "\(project.name) \(projectPlace(project))".lowercased()
            if !haystack.contains(query) { return false }
        }
        if filters.view == "mine", project.createdBy != me { return false }
        if filters.view == "working", !running.contains(project.id) { return false }
        if let runnerID = filters.runnerID, project.runtimeId != runnerID { return false }
        return true
    }
}

public struct ProjectCard: Equatable, Sendable, Identifiable {
    public var id: String { project.id }
    public var project: Project
    public var threads: [AvenThread]
    public var working: Int
    public var lastActive: Date
}

public func projectBoard(
    _ projects: [Project], threads: [AvenThread], filters: ProjectFilters, me: String?
) -> [ProjectCard] {
    let open = threads.filter { $0.state != "archived" }
    let running = Set(open.filter(\.running).map(\.projectId))
    let visible = filterProjects(projects, filters: filters, me: me, running: running)
    return visible.map { project in
        let mine = open.filter { $0.projectId == project.id }
        let newest = mine.sorted { ($0.updatedAt) > ($1.updatedAt) }
        let working = mine.filter(\.running).count
        let last = newest.compactMap { parseTimestamp($0.updatedAt) }.max()
            ?? parseTimestamp(project.updatedAt) ?? .distantPast
        return ProjectCard(project: project, threads: Array(newest.prefix(4)), working: working, lastActive: last)
    }
    .sorted { lhs, rhs in
        if (lhs.working > 0) != (rhs.working > 0) { return lhs.working > 0 }
        return lhs.lastActive > rhs.lastActive
    }
}

public struct DiffStats: Equatable, Sendable {
    public var files: Int
    public var additions: Int
    public var deletions: Int
}

public func diffStats(_ patch: String) -> DiffStats {
    var files = 0
    var additions = 0
    var deletions = 0
    for line in patch.split(separator: "\n", omittingEmptySubsequences: false) {
        if line.hasPrefix("diff --git ") {
            files += 1
        } else if line.hasPrefix("+"), !line.hasPrefix("+++") {
            additions += 1
        } else if line.hasPrefix("-"), !line.hasPrefix("---") {
            deletions += 1
        }
    }
    return DiffStats(files: files, additions: additions, deletions: deletions)
}

/// Cockpit bodies are BlockNote JSON in the web app, or plain text. This is the text a native
/// field can show. Saving writes plain text back.
public func plainTextOf(_ body: String) -> String {
    let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.hasPrefix("["),
        let data = trimmed.data(using: .utf8),
        let json = try? JSONSerialization.jsonObject(with: data),
        let lines = blockLines(json),
        !lines.isEmpty
    {
        return lines.joined(separator: "\n")
    }
    return trimmed
        .replacingOccurrences(of: "```", with: "")
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

private func blockLines(_ value: Any) -> [String]? {
    if let blocks = value as? [Any] {
        let lines = blocks.flatMap { blockLines($0) ?? [] }
        return lines.isEmpty ? nil : lines
    }
    guard let block = value as? [String: Any] else { return nil }
    var lines: [String] = []
    if let text = block["text"] as? String, !text.isEmpty { lines.append(text) }
    if let content = block["content"] { lines.append(contentsOf: blockLines(content) ?? []) }
    if let children = block["children"] { lines.append(contentsOf: blockLines(children) ?? []) }
    return lines
}

public func meterPercent(used: Double, total: Double) -> Double? {
    guard total > 0 else { return nil }
    return min(100, max(0, used / total * 100))
}

public enum MeterLevel: String, Sendable {
    case low
    case busy
    case high
}

public func meterLevel(_ percent: Double?) -> MeterLevel {
    guard let percent else { return .low }
    if percent >= 90 { return .high }
    if percent >= 60 { return .busy }
    return .low
}
