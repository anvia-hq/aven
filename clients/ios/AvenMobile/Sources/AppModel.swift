import AvenKit
import Foundation
import Observation

@MainActor @Observable
final class AppModel {
    private static let serverKey = "aven.server"

    var server: String
    var threads: [ThreadSummary] = []
    var projects: [Project] = []
    private(set) var client: APIClient?
    private let tokens = TokenStore()

    var isSignedIn: Bool { client != nil }

    init() {
        server = UserDefaults.standard.string(forKey: Self.serverKey) ?? ""
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
        threads = []
        projects = []
    }

    func projectName(_ id: String) -> String {
        projects.first { $0.id == id }?.name ?? ""
    }

    func refresh() async {
        guard let client else { return }
        do {
            async let threads = client.threads()
            async let projects = client.projects()
            self.threads = try await threads
            self.projects = try await projects
        } catch let error as APIError where error.isUnauthorized {
            signOut()
        } catch {
        }
    }
}
