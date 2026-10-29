import AvenKit
import Foundation
import Observation

/// Who is signed in, and the lists the sidebar shows. One per window.
@MainActor @Observable
final class AppModel {
    private static let serverKey = "aven.server"

    var server: String
    var projects: [Project] = []
    var threads: [ThreadSummary] = []
    var selectedThreadId: String?
    private(set) var client: APIClient?
    private let tokens = TokenStore()

    var isSignedIn: Bool { client != nil }

    init() {
        server = UserDefaults.standard.string(forKey: Self.serverKey) ?? "localhost:8000"
        // Resume the last session if its token is still in the Keychain.
        if let url = try? APIClient.normalize(server: server),
            let token = tokens.token(for: url.absoluteString)
        {
            client = APIClient(baseURL: url, token: token)
        }
    }

    func signIn(server: String, email: String, password: String, name: String?) async throws {
        let url = try APIClient.normalize(server: server)
        let candidate = APIClient(baseURL: url)
        let token = try await candidate.signIn(email: email, password: password, name: name)
        tokens.save(token, for: url.absoluteString)
        UserDefaults.standard.set(server, forKey: Self.serverKey)
        self.server = server
        client = candidate
    }

    func signOut() {
        if let url = client?.baseURL { tokens.remove(for: url.absoluteString) }
        client = nil
        projects = []
        threads = []
        selectedThreadId = nil
    }

    /// Reloads the sidebar. A rejected token means the session is over, so go back to sign-in.
    func refresh() async {
        guard let client else { return }
        do {
            async let projects = client.projects()
            async let threads = client.threads()
            self.projects = try await projects
            self.threads = try await threads
        } catch let error as APIError where error.isUnauthorized {
            signOut()
        } catch {
            // Transient (offline, server restarting): keep what is on screen.
        }
    }

    func startThread(projectId: String, prompt: String) async throws {
        guard let client else { return }
        let thread = try await client.createThread(projectId: projectId)
        try await client.send(prompt: prompt, threadId: thread.id)
        await refresh()
        selectedThreadId = thread.id
    }
}
