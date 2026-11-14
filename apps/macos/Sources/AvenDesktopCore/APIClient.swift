import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum APIError: Error, LocalizedError, Equatable {
    case http(status: Int, message: String)
    case invalidServer
    case missingToken
    case decoding(String)

    public var errorDescription: String? {
        switch self {
        case .http(_, let message): return message
        case .invalidServer: return "That doesn't look like a server address"
        case .missingToken: return "The server did not return a session"
        case .decoding(let detail): return "Could not read the server's reply (\(detail))"
        }
    }

    public var isUnauthorized: Bool {
        if case .http(401, _) = self { return true }
        return false
    }
}

/// Talks to the control plane. Paths have no `/api` prefix on a local server; a hosted server's
/// API is under `/api`. A bearer token authenticates every call after sign-in. No cookies: the
/// shared session would keep one from sign-in, and the server then wants an Origin a native app
/// does not have.
public final class APIClient: @unchecked Sendable {
    public let baseURL: URL
    public var token: String?
    private let session: URLSession
    private let decoder = JSONDecoder()

    public static func cookielessSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.httpCookieStorage = nil
        configuration.timeoutIntervalForRequest = 120
        configuration.timeoutIntervalForResource = 60 * 60 * 24
        return URLSession(configuration: configuration)
    }

    public init(baseURL: URL, token: String? = nil, session: URLSession = APIClient.cookielessSession()) {
        self.baseURL = baseURL
        self.token = token
        self.session = session
    }

    /// Accepts `localhost:8000` or `https://aven.example.com/`. A server that is not local and has
    /// no port or path is the platform's address, whose API is under `/api`.
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
        if !local && url.port == nil && (url.path.isEmpty || url.path == "/") {
            return url.appendingPathComponent("api")
        }
        return url
    }

    public static func endpoint(base: URL, path: String, query: [URLQueryItem] = []) -> URL? {
        guard var components = URLComponents(url: base, resolvingAgainstBaseURL: false) else { return nil }
        let extra = path.hasPrefix("/") ? String(path.dropFirst()) : path
        let basePath = components.percentEncodedPath
        if basePath.isEmpty || basePath == "/" {
            components.percentEncodedPath = "/" + extra
        } else {
            let trimmed = basePath.hasSuffix("/") ? String(basePath.dropLast()) : basePath
            components.percentEncodedPath = trimmed + "/" + extra
        }
        if !query.isEmpty { components.queryItems = query }
        return components.url
    }

    public static func path(_ parts: String...) -> String {
        let allowed = CharacterSet.urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))
        let encoded = parts.map { part in
            part.addingPercentEncoding(withAllowedCharacters: allowed) ?? part
        }
        return "/" + encoded.joined(separator: "/")
    }

    // MARK: Transport

    @discardableResult
    public func send(
        _ path: String,
        method: String = "GET",
        query: [URLQueryItem] = [],
        body: JSONValue? = nil,
        authenticated: Bool = true
    ) async throws -> (Data, HTTPURLResponse) {
        guard var request = makeRequest(path, query: query, authenticated: authenticated) else {
            throw APIError.invalidServer
        }
        request.httpMethod = method
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await session.data(for: request)
        return (data, try Self.check(response, data: data))
    }

    public func get<T: Decodable>(
        _ type: T.Type, _ path: String, query: [URLQueryItem] = []
    ) async throws -> T {
        let (data, _) = try await send(path, query: query)
        return try decode(type, from: data)
    }

    public func getOptional<T: Decodable>(
        _ type: T.Type, _ path: String, query: [URLQueryItem] = []
    ) async throws -> T? {
        let (data, _) = try await send(path, query: query)
        if data.isEmpty || data == Data("null".utf8) { return nil }
        return try decode(type, from: data)
    }

    public func post<T: Decodable>(_ type: T.Type, _ path: String, body: JSONValue) async throws -> T {
        let (data, _) = try await send(path, method: "POST", body: body)
        return try decode(type, from: data)
    }

    public func postEmpty(_ path: String, body: JSONValue = .object([:])) async throws {
        _ = try await send(path, method: "POST", body: body)
    }

    public func patch<T: Decodable>(_ type: T.Type, _ path: String, body: JSONValue) async throws -> T {
        let (data, _) = try await send(path, method: "PATCH", body: body)
        return try decode(type, from: data)
    }

    public func patchEmpty(_ path: String, body: JSONValue) async throws {
        _ = try await send(path, method: "PATCH", body: body)
    }

    public func put<T: Decodable>(_ type: T.Type, _ path: String, body: JSONValue) async throws -> T {
        let (data, _) = try await send(path, method: "PUT", body: body)
        return try decode(type, from: data)
    }

    public func putEmpty(_ path: String, body: JSONValue) async throws {
        _ = try await send(path, method: "PUT", body: body)
    }

    public func delete(_ path: String) async throws {
        _ = try await send(path, method: "DELETE")
    }

    public func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            let snippet = String(data: data.prefix(180), encoding: .utf8) ?? ""
            throw APIError.decoding("\(type): \(snippet)")
        }
    }

    /// A snapshot first, then live events, until the connection ends or the task is cancelled.
    public func serverSentPayloads(_ path: String) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    guard var request = self.makeRequest(path, query: [], authenticated: true) else {
                        throw APIError.invalidServer
                    }
                    request.setValue("text/event-stream", forHTTPHeaderField: "accept")
                    request.timeoutInterval = 90
                    let pump = SSEByteStream()
                    let configuration = URLSessionConfiguration.ephemeral
                    configuration.httpShouldSetCookies = false
                    configuration.httpCookieStorage = nil
                    configuration.timeoutIntervalForRequest = 120
                    configuration.timeoutIntervalForResource = 60 * 60 * 24
                    let streaming = URLSession(configuration: configuration, delegate: pump, delegateQueue: nil)
                    let dataTask = streaming.dataTask(with: request)
                    let (bytes, byteContinuation) = AsyncThrowingStream.makeStream(of: UInt8.self, throwing: Error.self)
                    let response: URLResponse = try await withTaskCancellationHandler {
                        try await withCheckedThrowingContinuation { wait in
                            pump.attach(bytes: byteContinuation, response: wait)
                            dataTask.resume()
                        }
                    } onCancel: {
                        dataTask.cancel()
                    }
                    byteContinuation.onTermination = { _ in
                        dataTask.cancel()
                        streaming.invalidateAndCancel()
                    }
                    _ = try Self.check(response, data: nil)
                    var parser = ServerSentEventParser()
                    var splitter = LineSplitter()
                    for try await byte in bytes {
                        if let line = splitter.feed(byte: byte), let payload = parser.feed(line: line) {
                            continuation.yield(payload)
                        }
                    }
                    continuation.finish()
                } catch {
                    if Self.isCancellation(error) {
                        continuation.finish()
                    } else {
                        continuation.finish(throwing: error)
                    }
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private func makeRequest(
        _ path: String, query: [URLQueryItem], authenticated: Bool
    ) -> URLRequest? {
        guard let url = Self.endpoint(base: baseURL, path: path, query: query) else { return nil }
        var request = URLRequest(url: url)
        if authenticated, let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        }
        return request
    }

    @discardableResult
    static func check(_ response: URLResponse, data: Data?) throws -> HTTPURLResponse {
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidServer }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.http(status: http.statusCode, message: message(from: data, status: http.statusCode))
        }
        return http
    }

    static func message(from data: Data?, status: Int) -> String {
        guard let data, !data.isEmpty else { return "Request failed (\(status))" }
        if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let message = object["message"] as? String, !message.isEmpty { return message }
        }
        if let text = String(data: data, encoding: .utf8) {
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty, trimmed.count < 500, !trimmed.hasPrefix("<") { return trimmed }
        }
        return "Request failed (\(status))"
    }

    private static func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if let url = error as? URLError, url.code == .cancelled { return true }
        return false
    }
}

/// `URLSession.bytes(for:)` is not in swift-corelibs-foundation. A data-task delegate yields the
/// same bytes on macOS and on Linux, which is what the event stream reads.
private final class SSEByteStream: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    private let lock = NSLock()
    private var bytes: AsyncThrowingStream<UInt8, Error>.Continuation?
    private var responseWait: CheckedContinuation<URLResponse, Error>?
    private var response: URLResponse?
    private var pending: [UInt8] = []
    private var failure: Error?
    private var ended = false

    func attach(
        bytes: AsyncThrowingStream<UInt8, Error>.Continuation,
        response wait: CheckedContinuation<URLResponse, Error>
    ) {
        lock.lock()
        self.bytes = bytes
        let buffered = pending
        pending = []
        let received = response
        let failure = self.failure
        let ended = self.ended
        if received == nil, !ended { responseWait = wait }
        lock.unlock()
        buffered.forEach { bytes.yield($0) }
        if let received {
            wait.resume(returning: received)
        } else if ended {
            wait.resume(throwing: failure ?? APIError.invalidServer)
        }
        if ended {
            if let failure { bytes.finish(throwing: failure) } else { bytes.finish() }
        }
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        lock.lock()
        self.response = response
        let wait = responseWait
        responseWait = nil
        lock.unlock()
        wait?.resume(returning: response)
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        lock.lock()
        let continuation = bytes
        if continuation == nil { pending.append(contentsOf: data) }
        lock.unlock()
        guard let continuation else { return }
        for byte in data { continuation.yield(byte) }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        lock.lock()
        ended = true
        failure = error
        let continuation = bytes
        let wait = responseWait
        responseWait = nil
        lock.unlock()
        if let error {
            continuation?.finish(throwing: error)
            wait?.resume(throwing: error)
        } else {
            continuation?.finish()
            wait?.resume(throwing: APIError.invalidServer)
        }
    }
}
