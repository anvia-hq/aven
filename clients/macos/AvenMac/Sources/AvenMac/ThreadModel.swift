import AvenKit
import Foundation
import Observation

/// One open thread: attaches to its run stream, keeps the transcript and sends messages.
@MainActor @Observable
final class ThreadModel {
    let threadId: String
    private(set) var transcript = Transcript()
    private(set) var loaded = false
    var errorMessage: String?
    private let client: APIClient
    private var attachment: Task<Void, Never>?

    init(threadId: String, client: APIClient) {
        self.threadId = threadId
        self.client = client
    }

    /// Follows the thread until `detach()`. A dropped connection is retried: the server sends a
    /// fresh snapshot each time, so a reconnect can never duplicate output.
    func attach() {
        guard attachment == nil else { return }
        attachment = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                do {
                    for try await event in self.client.events(threadId: self.threadId) {
                        self.apply(event)
                    }
                } catch {
                    if Task.isCancelled { return }
                }
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    func detach() {
        attachment?.cancel()
        attachment = nil
    }

    private func apply(_ event: RunEvent) {
        transcript.apply(event)
        if case .snapshot = event { loaded = true }
        if case .error(let message) = event { errorMessage = message }
    }

    func send(_ prompt: String) async {
        errorMessage = nil
        do {
            try await client.send(prompt: prompt, threadId: threadId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func cancel() async {
        try? await client.cancel(threadId: threadId)
    }
}
