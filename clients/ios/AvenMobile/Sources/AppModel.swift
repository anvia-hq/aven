import AvenKit
import Foundation
import Observation

@MainActor @Observable
final class AppModel {
    private static let serverKey = "aven.server"

    var server: String
    var session: SessionInfo?
    var threads: [ThreadSummary] = []
    var projects: [Project] = []
    var runtimes: [Runtime] = []
    var providers: [ProviderSummary] = []
    var isPairing = false
    var pairingError: String?
    private(set) var client: APIClient?
    private let tokens = TokenStore()

    var isSignedIn: Bool { client != nil }

    var serverHost: String {
        URL(string: server)?.host ?? server
    }

    init() {
        server = UserDefaults.standard.string(forKey: Self.serverKey) ?? ""
        if let url = try? APIClient.normalize(server: server),
            let token = tokens.token(for: url.absoluteString)
        {
            client = APIClient(baseURL: url, token: token)
        }
    }

    func signIn(with rawPairingCode: String) async throws {
        guard !isPairing else { return }
        isPairing = true
        pairingError = nil
        defer { isPairing = false }

        let payload = try PairingPayload.parse(rawPairingCode)
        let candidate = APIClient(baseURL: payload.server)
        let token = try await candidate.exchangePairingCode(payload.code)
        try tokens.save(token, for: payload.server.absoluteString)
        UserDefaults.standard.set(payload.server.absoluteString, forKey: Self.serverKey)
        self.server = payload.server.absoluteString
        client = candidate
    }

    func handleIncomingURL(_ url: URL) async {
        guard !isSignedIn, !isPairing else { return }
        do {
            try await signIn(with: url.absoluteString)
        } catch {
            pairingError = error.localizedDescription
        }
    }

    func signOut() {
        let previous = client
        tokens.removeAll()
        client = nil
        session = nil
        threads = []
        projects = []
        runtimes = []
        providers = []
        pairingError = nil
        if let previous {
            Task { await previous.signOut() }
        }
    }

    func projectName(_ id: String) -> String {
        projects.first { $0.id == id }?.name ?? ""
    }

    func runtime(for id: String?) -> Runtime? {
        guard let id else { return nil }
        return runtimes.first { $0.id == id }
    }

    func thread(for id: String) -> ThreadSummary? {
        threads.first { $0.id == id }
    }

    func refresh() async {
        guard let client else { return }
        do {
            async let threadsTask = client.threads()
            async let projectsTask = client.projects()
            self.threads = try await threadsTask
            self.projects = try await projectsTask
        } catch let error as APIError where error.isUnauthorized {
            signOut()
            return
        } catch {
        }

        async let runtimesTask = try? client.runtimes()
        async let providersTask = try? client.providers()
        async let sessionTask = try? client.session()
        if let loadedRuntimes = await runtimesTask { runtimes = loadedRuntimes }
        if let loadedProviders = await providersTask { providers = loadedProviders }
        if let loadedSession = await sessionTask { session = loadedSession }
    }

    func startThread(
        projectId: String,
        runtimeId: String?,
        prompt: String,
        providerId: String? = nil,
        modelId: String? = nil,
        reasoningEffort: String? = nil
    ) async throws -> ThreadSummary {
        guard let client else { throw APIError.missingToken }
        let created = try await client.createThread(
            projectId: projectId, runtimeId: runtimeId, providerId: providerId)
        try await client.send(
            prompt: prompt,
            threadId: created.id,
            providerId: providerId,
            modelId: modelId,
            reasoningEffort: reasoningEffort)
        await refresh()
        return threads.first { $0.id == created.id } ?? created
    }

    func togglePin(_ thread: ThreadSummary) async {
        guard let client else { return }
        try? await client.pinThread(threadId: thread.id, pinned: !thread.isPinned)
        await refresh()
    }

    func setArchived(_ thread: ThreadSummary, archived: Bool) async {
        guard let client else { return }
        try? await client.updateThread(threadId: thread.id, state: archived ? "archived" : "open")
        await refresh()
    }

    func renameThread(_ thread: ThreadSummary, title: String) async {
        guard let client else { return }
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        try? await client.updateThread(threadId: thread.id, title: trimmed)
        await refresh()
    }
}
