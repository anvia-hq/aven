import Foundation

public enum APIError: Error, LocalizedError, Equatable {
    case http(status: Int, message: String)
    case invalidServer
    case missingToken

    public var errorDescription: String? {
        switch self {
        case .http(_, let message): return message
        case .invalidServer: return "That doesn't look like a server address"
        case .missingToken: return "The server did not return a session"
        }
    }

    public var isUnauthorized: Bool {
        if case .http(401, _) = self { return true }
        return false
    }
}

/// Talks to the control plane. Paths have no `/api` prefix (that exists only in the web app's dev
/// proxy). A token authenticates every call once the user has signed in.
public final class APIClient: @unchecked Sendable {
    public let baseURL: URL
    public var token: String?
    private let session: URLSession

    /// No cookies: the app authenticates with its bearer token alone. The shared session would
    /// keep a cookie from sign-in, and the server then (rightly) wants an `Origin` header that a
    /// native client has no honest value for.
    public static func cookielessSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.httpCookieStorage = nil
        return URLSession(configuration: configuration)
    }

    public init(baseURL: URL, token: String? = nil, session: URLSession = APIClient.cookielessSession()) {
        self.baseURL = baseURL
        self.token = token
        self.session = session
    }

    /// Accepts what a person types: `localhost:8000`, `https://aven.example.com/`. A server that is not
    /// local and has no port or path is the platform's address, whose API is under `/api`.
    public static func normalize(server: String) throws -> URL {
        var text = server.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw APIError.invalidServer }
        if !text.contains("://") {
            let local = text.hasPrefix("localhost") || text.hasPrefix("127.0.0.1")
            text = (local ? "http://" : "https://") + text
        }
        while text.hasSuffix("/") { text.removeLast() }
        guard let url = URL(string: text), let host = url.host else { throw APIError.invalidServer }
        let local = host == "localhost" || host == "127.0.0.1"
        if !local && url.port == nil && url.path.isEmpty {
            return url.appendingPathComponent("api")
        }
        return url
    }

    // MARK: Sign in

    /// Signs in (or up) and returns the bearer token the server hands back in `set-auth-token`.
    public func signIn(email: String, password: String, name: String? = nil) async throws -> String {
        let path = name == nil ? "/auth/sign-in/email" : "/auth/sign-up/email"
        var body: [String: String] = ["email": email, "password": password]
        if let name { body["name"] = name }
        let (_, response) = try await send(path, method: "POST", body: body, authenticated: false)
        guard let token = response.value(forHTTPHeaderField: "set-auth-token"), !token.isEmpty else {
            throw APIError.missingToken
        }
        self.token = token
        return token
    }

    /// Exchanges a one-time QR pairing code for a bearer session token.
    public func exchangePairingCode(_ code: String) async throws -> String {
        let (data, response) = try await send(
            "/mobile-pair/exchange", method: "POST", body: ["code": code], authenticated: false)
        let headerToken = response.value(forHTTPHeaderField: "set-auth-token")
        let bodyToken = try? JSONDecoder().decode(PairingExchangeResponse.self, from: data).token
        guard let token = headerToken ?? bodyToken, !token.isEmpty else {
            throw APIError.missingToken
        }
        self.token = token
        return token
    }

    public func signOut() async {
        _ = try? await send("/auth/sign-out", method: "POST", body: [String: String]())
        self.token = nil
    }

    // MARK: Resources

    public func session() async throws -> SessionInfo { try await get("/auth/get-session") }
    public func projects() async throws -> [Project] { try await get("/projects") }
    public func runtimes() async throws -> [Runtime] { try await get("/runtimes") }
    public func threads() async throws -> [ThreadSummary] { try await get("/threads") }
    public func thread(id: String) async throws -> ThreadDetail { try await get("/threads/\(id)") }
    public func providers() async throws -> [ProviderSummary] { try await get("/providers") }

    public func models(providerId: String) async throws -> ProviderModels {
        try await get("/providers/\(providerId)/models")
    }

    public func earlierMessages(threadId: String, before: Int) async throws -> ThreadMessagesPage {
        try await get("/threads/\(threadId)/messages?before=\(before)")
    }

    public func createThread(
        projectId: String,
        title: String? = nil,
        runtimeId: String? = nil,
        providerId: String? = nil
    ) async throws -> ThreadSummary {
        var body: [String: String] = ["projectId": projectId]
        if let title { body["title"] = title }
        if let runtimeId { body["runtimeId"] = runtimeId }
        if let providerId { body["providerId"] = providerId }
        return try await post("/threads", body: body)
    }

    /// Starts a run. The run's progress arrives on `events(threadId:)`.
    public func send(
        prompt: String,
        threadId: String,
        providerId: String? = nil,
        modelId: String? = nil,
        reasoningEffort: String? = nil
    ) async throws {
        var body: [String: String] = ["prompt": prompt]
        if let providerId { body["providerId"] = providerId }
        if let modelId { body["modelId"] = modelId }
        if let reasoningEffort { body["reasoningEffort"] = reasoningEffort }
        _ = try await send("/threads/\(threadId)/messages", method: "POST", body: body)
    }

    public func answer(
        threadId: String,
        answers: [QuestionAnswer],
        providerId: String? = nil,
        modelId: String? = nil,
        reasoningEffort: String? = nil
    ) async throws {
        let body = AnswerQuestionBody(
            answers: answers,
            providerId: providerId,
            modelId: modelId,
            reasoningEffort: reasoningEffort)
        _ = try await send("/threads/\(threadId)/answer", method: "POST", body: body)
    }

    public func updateThread(
        threadId: String,
        title: String? = nil,
        state: String? = nil,
        visibility: String? = nil
    ) async throws {
        var body: [String: String] = [:]
        if let title { body["title"] = title }
        if let state { body["state"] = state }
        if let visibility { body["visibility"] = visibility }
        _ = try await send("/threads/\(threadId)", method: "PATCH", body: body)
    }

    public func pinThread(threadId: String, pinned: Bool) async throws {
        _ = try await send("/threads/\(threadId)/pin", method: pinned ? "PUT" : "DELETE")
    }

    public func cancel(threadId: String) async throws {
        _ = try await send("/threads/\(threadId)/cancel", method: "POST", body: [String: String]())
    }

    // MARK: Run stream

    /// A snapshot first, then live events, until the connection ends or the task is cancelled.
    /// Dropping it never stops the agent. Reattach to see a run in progress.
    public func events(threadId: String) -> AsyncThrowingStream<RunEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = try makeRequest("/threads/\(threadId)/events")
                    request.setValue("text/event-stream", forHTTPHeaderField: "accept")
                    request.timeoutInterval = 60  // the server pings every 5 seconds
                    let (bytes, response) = try await session.bytes(for: request)
                    try Self.check(response, data: nil)
                    var parser = ServerSentEventParser()
                    var splitter = LineSplitter()
                    let decoder = JSONDecoder()
                    for try await byte in bytes {
                        guard let line = splitter.feed(byte: byte),
                            let payload = parser.feed(line: line)
                        else { continue }
                        if let event = try? decoder.decode(RunEvent.self, from: Data(payload.utf8)) {
                            continuation.yield(event)
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    // MARK: Plumbing

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let (data, _) = try await send(path, method: "GET")
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func post<T: Decodable>(_ path: String, body: some Encodable) async throws -> T {
        let (data, _) = try await send(path, method: "POST", body: body)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func makeRequest(_ path: String, authenticated: Bool = true) throws -> URLRequest {
        let url: URL
        if let queryStart = path.firstIndex(of: "?") {
            let route = String(path[..<queryStart])
            let query = String(path[path.index(after: queryStart)...])
            var components = URLComponents(
                url: baseURL.appendingPathComponent(route), resolvingAgainstBaseURL: false)
            components?.percentEncodedQuery = query
            url = components?.url ?? baseURL.appendingPathComponent(route)
        } else {
            url = baseURL.appendingPathComponent(path)
        }
        var request = URLRequest(url: url)
        if authenticated, let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization") }
        return request
    }

    @discardableResult
    private func send(
        _ path: String, method: String, body: (any Encodable)? = nil, authenticated: Bool = true
    ) async throws -> (Data, HTTPURLResponse) {
        var request = try makeRequest(path, authenticated: authenticated)
        request.httpMethod = method
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }
        let (data, response) = try await session.data(for: request)
        return (data, try Self.check(response, data: data))
    }

    @discardableResult
    private static func check(_ response: URLResponse, data: Data?) throws -> HTTPURLResponse {
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidServer }
        guard (200..<300).contains(http.statusCode) else {
            // The server answers expected errors with a short plain-text message.
            let text = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
            let message = (!text.isEmpty && text.count < 300) ? text : "Request failed (\(http.statusCode))"
            throw APIError.http(status: http.statusCode, message: message)
        }
        return http
    }
}

private struct PairingExchangeResponse: Decodable {
    var token: String
}

private struct AnswerQuestionBody: Encodable {
    var answers: [QuestionAnswer]
    var providerId: String?
    var modelId: String?
    var reasoningEffort: String?
}

private struct AnyEncodable: Encodable {
    let value: any Encodable
    init(_ value: any Encodable) { self.value = value }
    func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}
