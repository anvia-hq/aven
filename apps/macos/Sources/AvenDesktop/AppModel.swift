import AvenDesktopCore
import Foundation
import Observation
import SwiftUI

enum Section: String, CaseIterable, Identifiable {
    case threads
    case cockpit
    case bots
    case settings

    var id: String { rawValue }

    var label: String {
        switch self {
        case .threads: "Threads"
        case .cockpit: "Cockpit"
        case .bots: "Bot"
        case .settings: "Settings"
        }
    }
}

enum Destination: Hashable {
    case newThread
    case thread(String)
    case projects
    case project(String)
    case inbox
    case tasks
    case notes
    case note(String)
    case tags
    case bot(String)
    case settings(String)
}

@MainActor @Observable
final class AppModel {
    private static let serverKey = "aven.desktop.server"
    private static let dismissedKey = "aven.desktop.dismissed-announcements"
    private static let unreadKey = "aven.desktop.unread"

    var serverText: String
    private(set) var client: APIClient?
    var account: Account?
    var config: PlatformConfig?
    var organizations: [Organization] = []
    var activeOrganizationID: String?
    var threads: [AvenThread] = []
    var projects: [Project] = []
    var runtimes: [Runtime] = []
    var bots: [Bot] = []
    var providers: [Provider] = []
    var mentions: [Mention] = []
    var announcement: Announcement?
    var dismissedAnnouncements: [String]
    var unread: Set<String>
    var section: Section = .threads
    var destination: Destination = .newThread

    var destinationSelection: Binding<Destination?> {
        Binding(
            get: { self.destination },
            set: { if let value = $0 { self.destination = value } }
        )
    }
    var cockpitTag: String?
    var status: String?
    var palettePresented = false
    var announcementOpen = false
    var pendingInvitation: String?
    var draftProjectID: String?
    private let tokens = KeychainTokenStore()
    private var poll: Task<Void, Never>?
    private var wasRunning: Set<String> = []

    var isSignedIn: Bool { client != nil }

    var organizationName: String {
        organizations.first { $0.id == activeOrganizationID }?.name ?? "Workspace"
    }

    var mainBot: Bot? { bots.first { $0.isMain } ?? bots.first }

    var ownOpenThreads: [AvenThread] {
        threads.filter { $0.state == "open" && $0.createdBy == account?.id }
    }

    var sharedThreads: [AvenThread] {
        threads.filter { $0.state == "open" && $0.createdBy != account?.id && $0.createdBy != "" }
    }

    var visibleAnnouncement: Announcement? {
        guard let announcement, !dismissedAnnouncements.contains(announcement.id) else { return nil }
        return announcement
    }

    init() {
        serverText = UserDefaults.standard.string(forKey: Self.serverKey) ?? "localhost:8000"
        dismissedAnnouncements = UserDefaults.standard.stringArray(forKey: Self.dismissedKey) ?? []
        unread = Set(UserDefaults.standard.stringArray(forKey: Self.unreadKey) ?? [])
        if let url = try? APIClient.normalize(server: serverText),
            let token = tokens.token(for: url.absoluteString)
        {
            client = APIClient(baseURL: url, token: token)
        }
    }

    func restore() async {
        guard client != nil else { return }
        await refresh()
        if isSignedIn { startPolling() }
    }

    func signIn(email: String, password: String, name: String?, invitation: String?) async throws {
        let url = try APIClient.normalize(server: serverText)
        let api = APIClient(baseURL: url)
        let token = try await api.signIn(email: email, password: password, name: name)
        try tokens.save(token, for: url.absoluteString)
        UserDefaults.standard.set(serverText, forKey: Self.serverKey)
        client = api
        serverText = url.absoluteString
        await refresh()
        if let invitation, !invitation.isEmpty { pendingInvitation = invitation }
        startPolling()
    }

    func signOut() {
        poll?.cancel()
        poll = nil
        let url = client?.baseURL.absoluteString
        if let url { tokens.remove(for: url) }
        Task { await client?.signOut() }
        client = nil
        account = nil
        threads = []
        projects = []
        runtimes = []
        bots = []
        providers = []
        mentions = []
        destination = .newThread
        section = .threads
    }

    func refresh() async {
        guard let api = client else { return }
        do {
            let session = try await api.session()
            account = session.user
            activeOrganizationID = session.activeOrganizationId
        } catch {
            if let failure = error as? APIError, failure.isUnauthorized {
                signOut()
                return
            }
            status = errorText(error)
        }
        config = try? await api.platformConfig()
        if let value = try? await api.organizations() { organizations = value }
        if let value = try? await api.threads() {
            threads = value
            noteRunning()
        }
        if let value = try? await api.projects() { projects = value }
        if let value = try? await api.runtimes() { runtimes = value }
        if let value = try? await api.bots() { bots = value }
        if let value = try? await api.providers() { providers = value }
        if let value = try? await api.mentions() { mentions = value }
        announcement = try? await api.activeAnnouncement()
    }

    func switchOrganization(_ id: String) async {
        guard let api = client else { return }
        do {
            try await api.setActiveOrganization(id)
            activeOrganizationID = id
            await refresh()
            newThread()
        } catch {
            status = errorText(error)
        }
    }

    func show(_ section: Section) {
        self.section = section
        switch section {
        case .threads:
            if !isThreadDestination { destination = .newThread }
        case .cockpit:
            if !isCockpitDestination { destination = .inbox }
        case .bots:
            if case .bot = destination { return }
            destination = .bot(mainBot?.id ?? "")
        case .settings:
            if case .settings = destination { return }
            destination = .settings("general")
        }
    }

    func newThread() {
        section = .threads
        destination = .newThread
    }

    func openThread(_ id: String) {
        unread.remove(id)
        saveUnread()
        section = .threads
        destination = .thread(id)
    }

    func dismissAnnouncement() {
        guard let id = announcement?.id else { return }
        dismissedAnnouncements.append(id)
        UserDefaults.standard.set(dismissedAnnouncements, forKey: Self.dismissedKey)
    }

    func projectName(_ id: String) -> String {
        projects.first { $0.id == id }?.name ?? "Project"
    }

    func runtimeName(_ id: String) -> String {
        runtimes.first { $0.id == id }?.name ?? "Runtime"
    }

    private var isThreadDestination: Bool {
        switch destination {
        case .newThread, .thread, .projects, .project: true
        default: false
        }
    }

    private var isCockpitDestination: Bool {
        switch destination {
        case .inbox, .tasks, .notes, .note, .tags: true
        default: false
        }
    }

    private func noteRunning() {
        let running = Set(threads.filter(\.running).map(\.id))
        for id in wasRunning.subtracting(running) where destination != .thread(id) {
            unread.insert(id)
        }
        wasRunning = running
        saveUnread()
    }

    private func saveUnread() {
        UserDefaults.standard.set(Array(unread), forKey: Self.unreadKey)
    }

    private func startPolling() {
        poll?.cancel()
        poll = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                await self?.refresh()
            }
        }
    }
}

struct DesktopError: LocalizedError {
    var message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

func errorText(_ error: Error) -> String {
    if let localized = error as? LocalizedError, let text = localized.errorDescription { return text }
    return error.localizedDescription
}
