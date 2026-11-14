import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

extension APIClient {
    public func platformConfig() async throws -> PlatformConfig {
        try await get(PlatformConfig.self, "/platform/config", authenticated: token != nil)
    }

    public func signIn(email: String, password: String, name: String? = nil) async throws -> String {
        let path = name == nil ? "/auth/sign-in/email" : "/auth/sign-up/email"
        let body = jsonObject(
            ("email", .string(email)),
            ("password", .string(password)),
            ("name", JSONValue.optionalString(name))
        )
        let (_, response) = try await send(path, method: "POST", body: body, authenticated: false)
        guard let token = response.value(forHTTPHeaderField: "set-auth-token"), !token.isEmpty else {
            throw APIError.missingToken
        }
        self.token = token
        return token
    }

    public func signOut() async {
        _ = try? await send("/auth/sign-out", method: "POST", body: .object([:]))
        token = nil
    }

    public func session() async throws -> AuthSession {
        try await get(AuthSession.self, "/auth/get-session")
    }

    public func updateName(_ name: String) async throws {
        try await postEmpty("/auth/update-user", body: jsonObject(("name", .string(name))))
    }

    public func organizations() async throws -> [Organization] {
        try await get([Organization].self, "/auth/organization/list")
    }

    public func setActiveOrganization(_ id: String) async throws {
        try await postEmpty(
            "/auth/organization/set-active", body: jsonObject(("organizationId", .string(id))))
    }

    public func fullOrganization() async throws -> FullOrganization {
        try await get(FullOrganization.self, "/auth/organization/get-full-organization")
    }

    public func invite(email: String, role: String) async throws -> CreatedID {
        try await post(
            CreatedID.self, "/auth/organization/invite-member",
            body: jsonObject(("email", .string(email)), ("role", .string(role))))
    }

    public func cancelInvitation(_ id: String) async throws {
        try await postEmpty(
            "/auth/organization/cancel-invitation", body: jsonObject(("invitationId", .string(id))))
    }

    public func removeMember(_ id: String) async throws {
        try await postEmpty(
            "/auth/organization/remove-member", body: jsonObject(("memberIdOrEmail", .string(id))))
    }

    public func invitation(_ id: String) async throws -> OrganizationInvitation {
        try await get(
            OrganizationInvitation.self, "/auth/organization/get-invitation",
            query: [URLQueryItem(name: "id", value: id)])
    }

    public func acceptInvitation(_ id: String) async throws -> AcceptInvitationResult {
        try await post(
            AcceptInvitationResult.self, "/auth/organization/accept-invitation",
            body: jsonObject(("invitationId", .string(id))))
    }

    public func threads() async throws -> [AvenThread] {
        try await get([AvenThread].self, "/threads")
    }

    public func thread(_ id: String) async throws -> AvenThread {
        try await get(AvenThread.self, APIClient.path("threads", id))
    }

    public func earlierMessages(threadID: String, before: Int) async throws -> MessagePage {
        try await get(
            MessagePage.self, APIClient.path("threads", threadID, "messages"),
            query: [URLQueryItem(name: "before", value: String(before))])
    }

    public func createThread(projectID: String, title: String?, backend: String?) async throws -> CreatedID {
        try await post(
            CreatedID.self, "/threads",
            body: jsonObject(
                ("projectId", .string(projectID)),
                ("title", JSONValue.optionalString(title)),
                ("backend", JSONValue.optionalString(backend))
            ))
    }

    public func updateThread(_ id: String, body: JSONValue) async throws {
        try await patchEmpty(APIClient.path("threads", id), body: body)
    }

    public func sendMessage(
        threadID: String, prompt: String, providerID: String?, modelID: String?, effort: String?
    ) async throws {
        try await postEmpty(
            APIClient.path("threads", threadID, "messages"),
            body: jsonObject(
                ("prompt", .string(prompt)),
                ("providerId", JSONValue.optionalString(providerID)),
                ("modelId", JSONValue.optionalString(modelID)),
                ("reasoningEffort", JSONValue.optionalString(effort))
            ))
    }

    public func answer(threadID: String, answers: [(String, String)]) async throws {
        let payload = answers.map { pair in
            JSONValue.object(["questionId": .string(pair.0), "value": .string(pair.1)])
        }
        try await postEmpty(
            APIClient.path("threads", threadID, "answer"),
            body: .object(["answers": .array(payload)]))
    }

    public func cancel(threadID: String) async throws {
        try await postEmpty(APIClient.path("threads", threadID, "cancel"))
    }

    public func mentions() async throws -> [Mention] {
        try await get([Mention].self, "/threads/mentions")
    }

    public func markMentionsRead() async throws {
        try await postEmpty("/threads/mentions/read")
    }

    public func projects() async throws -> [Project] {
        try await get([Project].self, "/projects")
    }

    public func project(_ id: String) async throws -> Project {
        try await get(Project.self, APIClient.path("projects", id))
    }

    public func addFolder(runtimeID: String, path: String, name: String?) async throws -> Project {
        try await post(
            Project.self, "/projects/folder",
            body: jsonObject(
                ("runtimeId", .string(runtimeID)),
                ("path", .string(path)),
                ("name", JSONValue.optionalString(name))
            ))
    }

    public func addRepository(runtimeID: String, repository: String, name: String?) async throws -> Project {
        try await post(
            Project.self, "/projects/repository",
            body: jsonObject(
                ("runtimeId", .string(runtimeID)),
                ("repository", .string(repository)),
                ("name", JSONValue.optionalString(name))
            ))
    }

    public func moveProject(_ id: String, runtimeID: String) async throws {
        try await patchEmpty(
            APIClient.path("projects", id), body: jsonObject(("runtimeId", .string(runtimeID))))
    }

    public func deleteProject(_ id: String) async throws {
        try await delete(APIClient.path("projects", id))
    }

    public func projectFiles(_ id: String, path: String) async throws -> RepoListing {
        try await get(
            RepoListing.self, APIClient.path("projects", id, "files"),
            query: path.isEmpty ? [] : [URLQueryItem(name: "path", value: path)])
    }

    public func projectReadme(_ id: String) async throws -> RepoReadmeResponse {
        try await get(RepoReadmeResponse.self, APIClient.path("projects", id, "readme"))
    }

    public func projectCommits(_ id: String, page: Int) async throws -> RepoCommitPage {
        try await get(
            RepoCommitPage.self, APIClient.path("projects", id, "commits"),
            query: [URLQueryItem(name: "page", value: String(page))])
    }

    public func projectPulls(_ id: String, state: String, page: Int) async throws -> TrackedPage {
        try await get(
            TrackedPage.self, APIClient.path("projects", id, "pulls"),
            query: [
                URLQueryItem(name: "state", value: state),
                URLQueryItem(name: "page", value: String(page)),
            ])
    }

    public func projectIssues(_ id: String, state: String, page: Int) async throws -> TrackedPage {
        try await get(
            TrackedPage.self, APIClient.path("projects", id, "issues"),
            query: [
                URLQueryItem(name: "state", value: state),
                URLQueryItem(name: "page", value: String(page)),
            ])
    }

    public func runtimes() async throws -> [Runtime] {
        try await get([Runtime].self, "/runtimes")
    }

    public func createRuntime(name: String) async throws -> CreatedRuntime {
        try await post(CreatedRuntime.self, "/runtimes", body: jsonObject(("name", .string(name))))
    }

    public func renameRuntime(_ id: String, name: String) async throws {
        try await patchEmpty(APIClient.path("runtimes", id), body: jsonObject(("name", .string(name))))
    }

    public func setGithubMode(_ id: String, mode: String) async throws {
        try await patchEmpty(
            APIClient.path("runtimes", id, "github"), body: jsonObject(("githubMode", .string(mode))))
    }

    public func updateRuntime(_ id: String) async throws {
        try await postEmpty(APIClient.path("runtimes", id, "update"), body: .object([:]))
    }

    public func revokeRuntime(_ id: String) async throws {
        try await delete(APIClient.path("runtimes", id))
    }

    public func runtimeFolders(_ id: String, path: String?) async throws -> FolderListing {
        var query: [URLQueryItem] = []
        if let path, !path.isEmpty { query.append(URLQueryItem(name: "path", value: path)) }
        return try await get(FolderListing.self, APIClient.path("runtimes", id, "folders"), query: query)
    }

    public func openPort(runtimeID: String, port: Int) async throws -> PreviewTicket {
        try await post(
            PreviewTicket.self, APIClient.path("runtimes", runtimeID, "ports"),
            body: jsonObject(("port", .int(port))))
    }

    public func providers() async throws -> [Provider] {
        try await get([Provider].self, "/providers")
    }

    public func createProvider(_ body: JSONValue) async throws -> Provider {
        try await post(Provider.self, "/providers", body: body)
    }

    public func updateProvider(_ id: String, body: JSONValue) async throws -> Provider {
        try await patch(Provider.self, APIClient.path("providers", id), body: body)
    }

    public func deleteProvider(_ id: String) async throws {
        try await delete(APIClient.path("providers", id))
    }

    public func providerModels(_ id: String) async throws -> ProviderModels {
        try await get(ProviderModels.self, APIClient.path("providers", id, "models"))
    }

    public func bots() async throws -> [Bot] {
        try await get([Bot].self, "/bots")
    }

    public func updateBot(_ id: String, body: JSONValue) async throws -> Bot {
        try await patch(Bot.self, APIClient.path("bots", id), body: body)
    }

    public func deleteBot(_ id: String) async throws {
        try await delete(APIClient.path("bots", id))
    }

    public func sendBot(id: String, text: String) async throws {
        try await postEmpty(APIClient.path("bots", id, "messages"), body: jsonObject(("text", .string(text))))
    }

    public func inbox() async throws -> [InboxItem] { try await get([InboxItem].self, "/cockpit/inbox") }

    public func createInbox(title: String, body: String, tags: [String]) async throws -> InboxItem {
        try await post(
            InboxItem.self, "/cockpit/inbox",
            body: jsonObject(("title", .string(title)), ("body", .string(body)), ("tags", .array(tags.map { .string($0) }))))
    }

    public func updateInbox(_ id: String, body: JSONValue) async throws -> InboxItem {
        try await patch(InboxItem.self, APIClient.path("cockpit", "inbox", id), body: body)
    }

    public func deleteInbox(_ id: String) async throws {
        try await delete(APIClient.path("cockpit", "inbox", id))
    }

    public func tasks() async throws -> [CockpitTask] { try await get([CockpitTask].self, "/cockpit/tasks") }

    public func createTask(_ body: JSONValue) async throws -> CockpitTask {
        try await post(CockpitTask.self, "/cockpit/tasks", body: body)
    }

    public func updateTask(_ id: String, body: JSONValue) async throws -> CockpitTask {
        try await patch(CockpitTask.self, APIClient.path("cockpit", "tasks", id), body: body)
    }

    public func deleteTask(_ id: String) async throws {
        try await delete(APIClient.path("cockpit", "tasks", id))
    }

    public func notes() async throws -> [CockpitNote] { try await get([CockpitNote].self, "/cockpit/notes") }

    public func createNote(title: String, body: String, pinned: Bool, tags: [String]) async throws -> CockpitNote {
        try await post(
            CockpitNote.self, "/cockpit/notes",
            body: jsonObject(
                ("title", .string(title)),
                ("body", .string(body)),
                ("pinned", .bool(pinned)),
                ("tags", .array(tags.map { .string($0) }))
            ))
    }

    public func updateNote(_ id: String, body: JSONValue) async throws -> CockpitNote {
        try await patch(CockpitNote.self, APIClient.path("cockpit", "notes", id), body: body)
    }

    public func deleteNote(_ id: String) async throws {
        try await delete(APIClient.path("cockpit", "notes", id))
    }

    public func tags() async throws -> [CockpitTag] { try await get([CockpitTag].self, "/cockpit/tags") }

    public func createTag(name: String, color: String?) async throws -> CockpitTag {
        try await post(
            CockpitTag.self, "/cockpit/tags",
            body: jsonObject(("name", .string(name)), ("color", JSONValue.optionalString(color))))
    }

    public func skills() async throws -> [Skill] { try await get([Skill].self, "/skills") }
    public func builtinSkills() async throws -> [BuiltinSkill] {
        try await get([BuiltinSkill].self, "/skills/built-in")
    }

    public func uploadSkill(files: [(String, String)]) async throws -> Skill {
        let payload = files.map { JSONValue.object(["path": .string($0.0), "data": .string($0.1)]) }
        return try await post(Skill.self, "/skills", body: .object(["files": .array(payload)]))
    }

    public func setSkill(_ id: String, enabled: Bool) async throws {
        try await patchEmpty(APIClient.path("skills", id), body: jsonObject(("enabled", .bool(enabled))))
    }

    public func deleteSkill(_ id: String) async throws { try await delete(APIClient.path("skills", id)) }

    public func mcpServers() async throws -> [McpServer] { try await get([McpServer].self, "/mcp-servers") }

    public func createMcp(name: String, url: String, target: String, headers: [(String, String)]) async throws -> McpServer {
        let headerValues = headers.map { JSONValue.object(["name": .string($0.0), "value": .string($0.1)]) }
        return try await post(
            McpServer.self, "/mcp-servers",
            body: jsonObject(
                ("name", .string(name)),
                ("url", .string(url)),
                ("target", .string(target)),
                ("headers", .array(headerValues)),
                ("enabled", .bool(true)),
                ("allowLocal", .bool(false))
            ))
    }

    public func setMcp(_ id: String, enabled: Bool) async throws {
        try await patchEmpty(APIClient.path("mcp-servers", id), body: jsonObject(("enabled", .bool(enabled))))
    }

    public func deleteMcp(_ id: String) async throws { try await delete(APIClient.path("mcp-servers", id)) }

    public func accessTokens() async throws -> [AccessToken] { try await get([AccessToken].self, "/mcp-access") }

    public func createAccessToken(name: String, permissions: [String]) async throws -> CreatedAccessToken {
        try await post(
            CreatedAccessToken.self, "/mcp-access",
            body: jsonObject(("name", .string(name)), ("permissions", .array(permissions.map { .string($0) }))))
    }

    public func deleteAccessToken(_ id: String) async throws { try await delete(APIClient.path("mcp-access", id)) }

    public func webhooks() async throws -> [Webhook] { try await get([Webhook].self, "/webhooks") }

    public func createWebhook(name: String) async throws -> CreatedWebhook {
        try await post(CreatedWebhook.self, "/webhooks", body: jsonObject(("name", .string(name))))
    }

    public func setWebhook(_ id: String, enabled: Bool) async throws {
        try await patchEmpty(APIClient.path("webhooks", id), body: jsonObject(("enabled", .bool(enabled))))
    }

    public func deleteWebhook(_ id: String) async throws { try await delete(APIClient.path("webhooks", id)) }

    public func memory() async throws -> [MemoryNote] { try await get([MemoryNote].self, "/memory") }

    public func memoryHistory() async throws -> [MemoryEvent] { try await get([MemoryEvent].self, "/memory/history") }

    public func createMemory(scope: String, name: String, body: String, projectID: String?, botID: String?) async throws -> MemoryNote {
        try await post(
            MemoryNote.self, "/memory",
            body: jsonObject(
                ("scope", .string(scope)),
                ("name", .string(name)),
                ("body", .string(body)),
                ("projectId", JSONValue.optionalString(projectID)),
                ("botId", JSONValue.optionalString(botID))
            ))
    }

    public func updateMemory(_ id: String, name: String?, body: String?) async throws {
        try await patchEmpty(
            APIClient.path("memory", id),
            body: jsonObject(("name", JSONValue.optionalString(name)), ("body", JSONValue.optionalString(body))))
    }

    public func deleteMemory(_ id: String) async throws { try await delete(APIClient.path("memory", id)) }

    public func variables(scope: String) async throws -> [Variable] {
        try await get([Variable].self, "/variables/\(scope)")
    }

    public func projectVariables(_ projectID: String) async throws -> [Variable] {
        try await get([Variable].self, APIClient.path("projects", projectID, "variables"))
    }

    public func setVariable(scope: String, name: String, value: String, secret: Bool) async throws {
        try await putEmpty(
            APIClient.path("variables", scope, name),
            body: jsonObject(("value", .string(value)), ("secret", .bool(secret))))
    }

    public func setProjectVariable(_ projectID: String, name: String, value: String, secret: Bool) async throws {
        try await putEmpty(
            APIClient.path("projects", projectID, "variables", name),
            body: jsonObject(("value", .string(value)), ("secret", .bool(secret))))
    }

    public func deleteVariable(scope: String, name: String) async throws {
        try await delete(APIClient.path("variables", scope, name))
    }

    public func variableHistory(scope: String) async throws -> [VariableEvent] {
        try await get([VariableEvent].self, "/variables/\(scope)/history")
    }

    public func preferences() async throws -> Preferences { try await get(Preferences.self, "/preferences") }

    public func setTimezone(_ timezone: String) async throws {
        try await putEmpty("/preferences/timezone", body: jsonObject(("timezone", .string(timezone))))
    }

    public func setFollowUps(enabled: Bool, providerID: String?, modelID: String?) async throws {
        try await putEmpty(
            "/preferences/follow-ups",
            body: jsonObject(
                ("enabled", .bool(enabled)),
                ("providerId", providerID.map(JSONValue.string) ?? .null),
                ("modelId", modelID.map(JSONValue.string) ?? .null)
            ))
    }

    public func decisionModel() async throws -> DecisionModelResponse {
        try await get(DecisionModelResponse.self, "/decision-model")
    }

    public func saveDecisionModel(kind: String, modelID: String, apiKey: String) async throws {
        try await putEmpty(
            "/decision-model",
            body: jsonObject(
                ("kind", .string(kind)),
                ("modelId", modelID.isEmpty ? nil : .string(modelID)),
                ("apiKey", apiKey.isEmpty ? nil : .string(apiKey))
            ))
    }

    public func deleteDecisionModel() async throws { try await delete("/decision-model") }

    public func claudeSetup() async throws -> ClaudeSetup { try await get(ClaudeSetup.self, "/claude-setup-token") }

    public func saveClaudeSetup(_ token: String) async throws {
        try await putEmpty("/claude-setup-token", body: jsonObject(("token", .string(token))))
    }

    public func deleteClaudeSetup() async throws { try await delete("/claude-setup-token") }

    public func profileStats() async throws -> ProfileStats { try await get(ProfileStats.self, "/profile/stats") }

    public func activeAnnouncement() async throws -> Announcement? {
        try await getOptional(Announcement.self, "/announcements/active")
    }

    public func announcements() async throws -> [Announcement] { try await get([Announcement].self, "/announcements") }

    public func createAnnouncement(_ body: JSONValue) async throws -> Announcement {
        try await post(Announcement.self, "/announcements", body: body)
    }

    public func setAnnouncementActive(_ id: String, active: Bool) async throws {
        try await patchEmpty(APIClient.path("announcements", id), body: jsonObject(("active", .bool(active))))
    }

    public func deleteAnnouncement(_ id: String) async throws { try await delete(APIClient.path("announcements", id)) }

    public func people() async throws -> [PlatformPerson] { try await get([PlatformPerson].self, "/platform/users") }

    public func removePerson(_ id: String) async throws { try await delete(APIClient.path("platform", "users", id)) }

    public func setRegistration(_ enabled: Bool) async throws {
        try await patchEmpty("/platform/settings", body: jsonObject(("registrationEnabled", .bool(enabled))))
    }

    public func serverModels() async throws -> ServerModels {
        try await get(ServerModels.self, "/platform/server-models")
    }

    public func saveServerDecision(kind: String, modelID: String, apiKey: String) async throws {
        try await putEmpty(
            "/platform/server-models/decision",
            body: jsonObject(
                ("kind", .string(kind)),
                ("modelId", modelID.isEmpty ? nil : .string(modelID)),
                ("apiKey", apiKey.isEmpty ? nil : .string(apiKey))
            ))
    }

    public func saveServerSmall(kind: String, modelID: String, apiKey: String) async throws {
        try await putEmpty(
            "/platform/server-models/small",
            body: jsonObject(
                ("kind", .string(kind)),
                ("modelId", .string(modelID)),
                ("apiKey", apiKey.isEmpty ? nil : .string(apiKey))
            ))
    }

    public func githubStatus() async throws -> GithubStatus { try await get(GithubStatus.self, "/github") }

    public func githubAccount() async throws -> GithubAccount { try await get(GithubAccount.self, "/github/user") }

    public func threadFiles(_ id: String, path: String) async throws -> ThreadFolder {
        try await get(
            ThreadFolder.self, APIClient.path("threads", id, "files"),
            query: path.isEmpty ? [] : [URLQueryItem(name: "path", value: path)])
    }

    public func threadFile(_ id: String, path: String) async throws -> ThreadFile {
        try await get(
            ThreadFile.self, APIClient.path("threads", id, "files", "content"),
            query: [URLQueryItem(name: "path", value: path)])
    }

    public func threadDiff(_ id: String, scope: String) async throws -> ThreadDiff {
        try await get(
            ThreadDiff.self, APIClient.path("threads", id, "diff"),
            query: [URLQueryItem(name: "scope", value: scope)])
    }

    public func shipReadiness(_ id: String) async throws -> ShipReadiness {
        try await get(ShipReadiness.self, APIClient.path("threads", id, "ship"))
    }

    public func ship(_ id: String, mode: String?) async throws {
        try await postEmpty(
            APIClient.path("threads", id, "ship"),
            body: mode.map { jsonObject(("mode", .string($0))) } ?? .object([:]))
    }

    public func computer(_ id: String) async throws -> ComputerStatus {
        try await get(ComputerStatus.self, APIClient.path("threads", id, "computer"))
    }

    public func wakeComputer(_ id: String) async throws {
        try await postEmpty(APIClient.path("threads", id, "computer", "wake"))
    }

    public func processes(_ id: String) async throws -> ProcessList {
        try await get(ProcessList.self, APIClient.path("threads", id, "processes"))
    }

    public func stopProcess(threadID: String, processID: String) async throws {
        try await postEmpty(APIClient.path("threads", threadID, "processes", processID, "stop"))
    }

    public func processLogs(threadID: String, processID: String) async throws -> ProcessLogs {
        try await get(ProcessLogs.self, APIClient.path("threads", threadID, "processes", processID, "logs"))
    }
}

extension APIClient {
    /// `platformConfig` is public even before a token exists.
    fileprivate func get<T: Decodable>(
        _ type: T.Type, _ path: String, query: [URLQueryItem] = [], authenticated: Bool
    ) async throws -> T {
        let (data, _) = try await send(path, query: query, authenticated: authenticated)
        return try decode(type, from: data)
    }
}
