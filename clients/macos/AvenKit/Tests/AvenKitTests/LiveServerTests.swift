import Foundation
import Testing

@testable import AvenKit

// Runs against a real control plane when AVEN_TEST_URL is set (for example http://localhost:8000);
// otherwise it passes without doing anything. It signs up a throwaway user.
@Suite struct LiveServerTests {
    @Test func signsUpListsAndAttachesToAThreadWithABearerToken() async throws {
        guard let address = ProcessInfo.processInfo.environment["AVEN_TEST_URL"] else { return }
        let client = APIClient(baseURL: try APIClient.normalize(server: address))
        let email = "swift-\(UUID().uuidString.prefix(8))@aven.test"

        let token = try await client.signIn(email: email, password: "password123", name: "Swift")
        #expect(!token.isEmpty)
        #expect(try await client.projects().isEmpty)
        #expect(try await client.threads().isEmpty)

        // A rejected token surfaces as an unauthorized error.
        let stranger = APIClient(baseURL: client.baseURL, token: "nope")
        await #expect(throws: APIError.self) { try await stranger.projects() }

        // The client cannot create projects yet; make one the way the web app does.
        var request = URLRequest(url: client.baseURL.appendingPathComponent("/projects"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "name": "swift", "projectPath": NSTemporaryDirectory(),
        ])
        _ = try await URLSession.shared.data(for: request)

        let project = try #require(try await client.projects().first)
        let thread = try await client.createThread(projectId: project.id)
        #expect(try await client.threads().map(\.id) == [thread.id])

        // Attaching gives a snapshot first.
        var first: RunEvent?
        for try await event in client.events(threadId: thread.id) {
            first = event
            break
        }
        #expect(first == .snapshot(messages: [], running: false))
    }
}
