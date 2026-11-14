import Foundation
import Testing

@testable import AvenDesktopCore

@Suite struct ServerAddressTests {
    @Test func localAddressesStayOnTheTypedOrigin() throws {
        let url = try APIClient.normalize(server: "localhost:8000")
        #expect(url.absoluteString == "http://localhost:8000")
        let loopback = try APIClient.normalize(server: "http://127.0.0.1:8000/")
        #expect(loopback.absoluteString == "http://127.0.0.1:8000")
    }

    @Test func aHostedServerUsesTheApiPrefix() throws {
        let url = try APIClient.normalize(server: "https://aven.example.com/")
        #expect(url.absoluteString == "https://aven.example.com/api")
    }

    @Test func pathsJoinTheApiPrefix() throws {
        let base = try APIClient.normalize(server: "https://aven.example.com")
        let url = APIClient.endpoint(base: base, path: "/threads/abc")
        #expect(url?.absoluteString == "https://aven.example.com/api/threads/abc")
    }

    @Test func anEmptyServerIsRefused() {
        #expect(throws: APIError.invalidServer) {
            try APIClient.normalize(server: "  ")
        }
    }
}

@Suite struct EventStreamTests {
    @Test func aPingAndASplitDataLineBecomeOnePayload() {
        var parser = ServerSentEventParser()
        #expect(parser.feed(line: "event: ping") == nil)
        #expect(parser.feed(line: "data: ") == nil)
        #expect(parser.feed(line: "") == nil)
        #expect(parser.feed(line: "data: {\"type\":\"text\",") == nil)
        #expect(parser.feed(line: "data: \"delta\":\"hi\"}") == nil)
        #expect(parser.feed(line: "") == "{\"type\":\"text\",\n\"delta\":\"hi\"}")
    }

    @Test func bytesSplitOnNewlinesIncludingBlankOnes() {
        var splitter = LineSplitter()
        var lines: [String] = []
        for byte in Array("a\n\nb".utf8) {
            if let line = splitter.feed(byte: byte) { lines.append(line) }
        }
        #expect(lines == ["a", ""])
    }
}

@Suite struct TranscriptTests {
    @Test func aRunStreamsIntoTheLastAssistantMessage() throws {
        var transcript = Transcript()
        let events = [
            #"{"type":"snapshot","messages":[],"running":false}"#,
            #"{"type":"run_start","prompt":"Hello"}"#,
            #"{"type":"text","delta":"Hi"}"#,
            #"{"type":"text","delta":" there"}"#,
            #"{"type":"tool_start","tool":{"id":"t1","name":"read","target":"a.ts","status":"running"}}"#,
            #"{"type":"tool_end","id":"t1","status":"done","output":"ok"}"#,
            #"{"type":"future_event","surprise":true}"#,
            #"{"type":"done"}"#,
        ]
        for raw in events {
            transcript.apply(try JSONDecoder().decode(RunEvent.self, from: Data(raw.utf8)))
        }
        #expect(transcript.running == false)
        #expect(transcript.messages.count == 2)
        #expect(transcript.messages[0].text == "Hello")
        #expect(transcript.messages[1].text == "Hi there")
        guard case .tool(let tool) = transcript.messages[1].parts.last else {
            Issue.record("expected a tool")
            return
        }
        #expect(tool.status == "done")
        #expect(tool.output == "ok")
    }

    @Test func aWaitingQuestionIsTheLastRunningAsk() {
        var transcript = Transcript()
        transcript.apply(
            .snapshot(
                messages: [
                    ChatMessage(
                        id: "a", role: "assistant",
                        parts: [
                            .tool(
                                ToolCall(
                                    id: "q", name: "ask_user", target: "", status: "running",
                                    questions: [QuestionPrompt(id: "1", text: "Which?", choices: nil, allowCustom: true)]
                                ))
                        ])
                ],
                running: false, hidden: 0, error: nil, usage: nil))
        #expect(transcript.waitingQuestion?.id == "q")
        transcript.apply(.runResume)
        #expect(transcript.waitingQuestion == nil)
    }
}

@Suite struct WorkspaceTests {
    @Test func threadsGroupByRecencyAndAForkFollowsItsParent() throws {
        let calendar = Calendar(identifier: .gregorian)
        let now = calendar.date(bySettingHour: 15, minute: 0, second: 0, of: Date()) ?? Date()
        let today = iso(calendar.date(byAdding: .hour, value: -2, to: now) ?? now)
        let old = iso(calendar.date(byAdding: .day, value: -20, to: now) ?? now)
        let parent = thread(id: "parent", updatedAt: old, parent: nil)
        let fork = thread(id: "fork", updatedAt: today, parent: "parent")
        let groups = recencyGroups([parent, fork], now: now)
        #expect(groups.map(\.label) == ControlPlaneCatalog.recencyLabels)
        #expect(groups[0].threads.map(\.id) == ["parent", "fork"])
        #expect(groups[1].threads.isEmpty)
        #expect(groups[2].threads.isEmpty)
    }

    @Test func theBoardPutsAWorkingProjectFirstAndFiltersMine() {
        let mine = project(id: "mine", name: "Mine", by: "me", updatedAt: "2024-01-01T00:00:00Z")
        let other = project(id: "other", name: "Other", by: "them", updatedAt: "2024-06-01T00:00:00Z")
        let running = thread(id: "t", updatedAt: "2024-06-02T00:00:00Z", parent: nil, project: "other", running: true)
        let filters = ProjectFilters(query: "", view: "working", runnerID: nil)
        let cards = projectBoard([mine, other], threads: [running], filters: filters, me: "me")
        #expect(cards.map(\.id) == ["other"])
        let mineOnly = projectBoard(
            [mine, other], threads: [running], filters: ProjectFilters(view: "mine"), me: "me")
        #expect(mineOnly.map(\.id) == ["mine"])
    }

    @Test func plainTextReadsBlockNoteAndLeavesProse() {
        let blocks = #"[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]},{"type":"paragraph","content":[{"type":"text","text":"there"}]}]"#
        #expect(plainTextOf(blocks) == "Hello\nthere")
        #expect(plainTextOf("Just words") == "Just words")
    }

    @Test func aPatchCountsFilesAndLines() {
        let patch = """
            diff --git a/a.ts b/a.ts
            --- a/a.ts
            +++ b/a.ts
            @@ -1 +1,2 @@
            -old
            +new
            +extra
            diff --git a/b.ts b/b.ts
            --- /dev/null
            +++ b/b.ts
            +only
            """
        #expect(diffStats(patch) == DiffStats(files: 2, additions: 3, deletions: 1))
    }

    @Test func metersTurnBusyAndThenHigh() {
        #expect(meterLevel(10) == .low)
        #expect(meterLevel(60) == .busy)
        #expect(meterLevel(90) == .high)
        #expect(meterPercent(used: 50, total: 0) == nil)
    }
}

@Suite struct CatalogTests {
    @Test func theShellMatchesTheWebOrder() {
        #expect(ControlPlaneCatalog.rail == ["Threads", "Cockpit", "Bot", "Settings"])
        #expect(ControlPlaneCatalog.threadTabs == ["New thread", "Projects"])
        #expect(ControlPlaneCatalog.cockpit.map(\.label) == ["Inbox", "Tasks", "Notes", "Tags"])
        let personal = ControlPlaneCatalog.settings.filter { $0.group == "Personal" }.map(\.label)
        #expect(
            personal == [
                "General", "Profile", "Providers", "Claude Subscription", "Bots", "Skills",
                "MCP servers", "MCP access", "Webhooks", "Memory", "Environment variables",
            ])
        let workspace = ControlPlaneCatalog.settings.filter { $0.group == "Workspace" }.map(\.label)
        #expect(workspace == ["Members", "GitHub", "Runtimes", "Variables", "Decision model"])
        #expect(ControlPlaneCatalog.settings(isOwner: false).contains { $0.group == "Platform" } == false)
        #expect(ControlPlaneCatalog.settings(isOwner: true).contains { $0.id == "people" })
    }
}

@Suite struct DecodingTests {
    @Test func aThreadListItemAndAPartialRuntimeDecode() throws {
        let thread = """
            {"id":"t1","projectId":"p1","title":"Fix","agentBackend":"native","createdBy":"u",
            "createdByName":"Ada","createdByImage":null,"participants":[],"visibility":"private",
            "drivingUntil":null,"parentThreadId":null,"runtimeId":"r1","state":"open","running":true,
            "pullRequests":[],"createdAt":"2024-01-01T00:00:00.000Z","updatedAt":"2024-01-02T00:00:00.000Z"}
            """
        let decoded = try JSONDecoder().decode(AvenThread.self, from: Data(thread.utf8))
        #expect(decoded.running)
        #expect(decoded.messages.isEmpty)
        let runtime = #"{"id":"r1","name":"Laptop"}"#
        let machine = try JSONDecoder().decode(Runtime.self, from: Data(runtime.utf8))
        #expect(machine.online == false)
        #expect(machine.name == "Laptop")
    }

    @Test func aSessionKeepsTheActiveOrganization() throws {
        let raw = """
            {"session":{"id":"s","activeOrganizationId":"org-1"},
             "user":{"id":"u","name":"Ada","email":"ada@example.com","image":null}}
            """
        let session = try JSONDecoder().decode(AuthSession.self, from: Data(raw.utf8))
        #expect(session.user.email == "ada@example.com")
        #expect(session.activeOrganizationId == "org-1")
    }

    @Test func anHttpErrorPrefersTheServerMessage() {
        let message = APIClient.message(from: Data(#"{"message":"Project not found"}"#.utf8), status: 404)
        #expect(message == "Project not found")
        #expect(APIError.http(status: 401, message: "no").isUnauthorized)
    }
}

private func iso(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.string(from: date)
}

private func thread(
    id: String, updatedAt: String, parent: String?, project: String = "p", running: Bool = false
) -> AvenThread {
    let raw = """
        {"id":"\(id)","projectId":"\(project)","title":"\(id)","createdBy":"me","updatedAt":"\(updatedAt)",
        "parentThreadId":\(parent.map { "\"\($0)\"" } ?? "null"),"running":\(running),"state":"open"}
        """
    return try! JSONDecoder().decode(AvenThread.self, from: Data(raw.utf8))
}

private func project(id: String, name: String, by: String, updatedAt: String) -> Project {
    Project(
        id: id, name: name, repoFullName: nil, defaultBranch: nil, directory: "/work/\(name)",
        runtimeId: "r", createdBy: by, createdAt: updatedAt, updatedAt: updatedAt)
}
