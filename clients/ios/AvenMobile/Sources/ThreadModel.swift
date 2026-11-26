import AvenKit
import Foundation
import Observation

@MainActor @Observable
final class ThreadModel {
    let threadId: String
    private(set) var detail: ThreadDetail?
    private(set) var transcript = Transcript()
    private(set) var hidden = 0
    private(set) var loaded = false
    private(set) var loadingEarlier = false
    private(set) var sending = false
    var errorMessage: String?

    private let client: APIClient
    private var attachment: Task<Void, Never>?

    init(threadId: String, client: APIClient) {
        self.threadId = threadId
        self.client = client
    }

    func attach() {
        guard attachment == nil else { return }
        attachment = Task { [weak self] in
            guard let self else { return }
            if let fetched = try? await self.client.thread(id: self.threadId) {
                self.detail = fetched
                self.hidden = fetched.hidden
                if !self.loaded {
                    self.transcript = Transcript(messages: fetched.messages, running: fetched.running)
                    self.loaded = true
                }
            }

            while !Task.isCancelled {
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

    func loadEarlier() async {
        guard hidden > 0, !loadingEarlier else { return }
        loadingEarlier = true
        defer { loadingEarlier = false }
        do {
            let page = try await client.earlierMessages(threadId: threadId, before: hidden)
            transcript.prepend(page.messages)
            hidden = page.hidden
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func send(_ prompt: String, providerId: String? = nil) async {
        guard !sending else { return }
        sending = true
        errorMessage = nil
        defer { sending = false }
        do {
            try await client.send(prompt: prompt, threadId: threadId, providerId: providerId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func answer(_ answers: [QuestionAnswer], providerId: String? = nil) async {
        guard !sending else { return }
        sending = true
        errorMessage = nil
        defer { sending = false }
        do {
            try await client.answer(threadId: threadId, answers: answers, providerId: providerId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func cancel() async {
        try? await client.cancel(threadId: threadId)
    }
}
