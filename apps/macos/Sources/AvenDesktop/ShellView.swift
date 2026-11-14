import AvenDesktopCore
import SwiftUI

struct ShellView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        HStack(spacing: 0) {
            RailView()
            NavigationSplitView {
                SidebarColumn()
            } detail: {
                DetailColumn()
            }
        }
        .sheet(isPresented: $model.palettePresented) {
            CommandPalette()
        }
        .sheet(item: invitationBinding) { invitation in
            InvitationSheet(id: invitation.id)
        }
        .sheet(isPresented: $model.announcementOpen) {
            if let item = model.visibleAnnouncement {
                AnnouncementSheet(announcement: item)
            }
        }
    }

    private var invitationBinding: Binding<InvitationBox?> {
        Binding(
            get: { model.pendingInvitation.map(InvitationBox.init) },
            set: { model.pendingInvitation = $0?.id }
        )
    }
}

private struct InvitationBox: Identifiable {
    var id: String
}

private struct RailView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 8) {
            railButton(.threads, systemImage: "bubble.left.and.bubble.right", help: "Aven · threads")
            Divider().frame(width: 18)
            railButton(.cockpit, systemImage: "square.grid.2x2", help: "Cockpit")
            railButton(.bots, systemImage: "face.smiling", help: model.mainBot?.name ?? "Bot")
            Spacer()
            railButton(.settings, systemImage: "gearshape", help: "Settings")
        }
        .padding(.vertical, 10)
        .frame(width: 52)
        .background(.bar)
    }

    private func railButton(_ section: Section, systemImage: String, help: String) -> some View {
        Button {
            model.show(section)
        } label: {
            Image(systemName: systemImage)
                .font(.system(size: 16))
                .frame(width: 32, height: 32)
                .background(
                    model.section == section ? Color.accentColor.opacity(0.18) : Color.clear,
                    in: RoundedRectangle(cornerRadius: 8)
                )
        }
        .buttonStyle(.plain)
        .help(help)
    }
}

private struct SidebarColumn: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        VStack(spacing: 0) {
            AccountHeader()
            switch model.section {
            case .threads: ThreadSidebar()
            case .cockpit: CockpitSidebar()
            case .bots: BotSidebar()
            case .settings: SettingsSidebar()
            }
            Spacer(minLength: 0)
            if let announcement = model.visibleAnnouncement {
                Button(announcement.title) {
                    model.announcementOpen = true
                }
                .buttonStyle(.plain)
                .font(.caption.weight(.semibold))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(8)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
                .padding(.horizontal, 8)
                .help(announcement.summary)
                .contextMenu {
                    Button("Dismiss") { model.dismissAnnouncement() }
                }
            }
            MachineFooter()
        }
        .navigationSplitViewColumnWidth(min: 220, ideal: 260, max: 360)
    }
}

private struct AccountHeader: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        HStack {
            Menu {
                Text(model.account?.email ?? "")
                Divider()
                ForEach(model.organizations) { organization in
                    Button {
                        Task { await model.switchOrganization(organization.id) }
                    } label: {
                        if organization.id == model.activeOrganizationID {
                            Label(organization.name, systemImage: "checkmark")
                        } else {
                            Text(organization.name)
                        }
                    }
                }
                Divider()
                Button("Personal settings") { model.destination = .settings("general"); model.section = .settings }
                Button("Search") { model.palettePresented = true }
                Divider()
                Button("Sign out") { model.signOut() }
            } label: {
                VStack(alignment: .leading, spacing: 1) {
                    Text(model.account?.name ?? "Account").font(.headline).lineLimit(1)
                    Text(model.organizationName).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .menuStyle(.borderlessButton)
            Button {
                model.palettePresented = true
            } label: {
                Image(systemName: "magnifyingglass")
            }
            .buttonStyle(.borderless)
            .help("Search")
            MentionsButton()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
}

private struct MentionsButton: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Menu {
            if model.mentions.isEmpty {
                Text("No mentions")
            }
            ForEach(model.mentions) { mention in
                Button {
                    model.openThread(mention.threadId)
                } label: {
                    Text(mention.read ? mention.title : "● \(mention.title)")
                }
            }
            if !model.mentions.isEmpty {
                Divider()
                Button("Mark all read") {
                    Task {
                        try? await model.client?.markMentionsRead()
                        await model.refresh()
                    }
                }
            }
        } label: {
            Image(systemName: model.mentions.contains { !$0.read } ? "at.badge.plus" : "at")
        }
        .menuStyle(.borderlessButton)
        .frame(width: 28)
        .help("Mentions")
    }
}

private struct MachineFooter: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(model.runtimes.prefix(4)) { runtime in
                HStack(spacing: 6) {
                    Circle()
                        .fill(runtime.online ? Color.green : Color.secondary)
                        .frame(width: 7, height: 7)
                    Text(runtime.name).lineLimit(1).font(.caption)
                    Spacer()
                    if let stats = runtime.stats {
                        Text(meter(stats)).font(.caption2).foregroundStyle(.secondary)
                    }
                }
                .help(runtime.online ? "Online" : "Offline")
            }
        }
        .padding(10)
    }

    private func meter(_ stats: RuntimeStats) -> String {
        let cpu = stats.cpuPercent.map { "\(Int($0))%" } ?? "–"
        return cpu
    }
}

struct DetailColumn: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        switch model.destination {
        case .newThread:
            NewThreadView()
        case .thread(let id):
            ThreadDetailView(id: id)
        case .projects:
            ProjectsBoardView()
        case .project(let id):
            ProjectDetailView(id: id)
        case .inbox:
            InboxView()
        case .tasks:
            TasksView()
        case .notes:
            NotesView(noteID: nil)
        case .note(let id):
            NotesView(noteID: id)
        case .tags:
            TagsView()
        case .bot(let id):
            BotChatView(id: resolvedBot(id))
        case .settings(let id):
            SettingsDetail(id: id)
        }
    }

    private func resolvedBot(_ id: String) -> String {
        id.isEmpty ? (model.mainBot?.id ?? "") : id
    }
}

private struct CommandPalette: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("Search threads, projects, settings", text: $query)
                .textFieldStyle(.roundedBorder)
            List(results) { result in
                Button(result.title) {
                    result.go()
                    dismiss()
                }
                .buttonStyle(.plain)
            }
            .frame(minHeight: 280)
        }
        .padding()
        .frame(width: 460)
    }

    private var results: [PaletteItem] {
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        return items.filter { needle.isEmpty || $0.title.lowercased().contains(needle) }
    }

    private var items: [PaletteItem] {
        var rows = [
            PaletteItem(id: "new-thread", title: "New thread") { model.newThread() },
            PaletteItem(id: "projects", title: "Projects") { model.section = .threads; model.destination = .projects },
            PaletteItem(id: "inbox", title: "Inbox") { model.section = .cockpit; model.destination = .inbox },
            PaletteItem(id: "tasks", title: "Tasks") { model.section = .cockpit; model.destination = .tasks },
            PaletteItem(id: "notes", title: "Notes") { model.section = .cockpit; model.destination = .notes },
        ]
        rows += model.threads.filter { $0.state == "open" }.map { thread in
            PaletteItem(id: "thread-\(thread.id)", title: thread.title) { model.openThread(thread.id) }
        }
        rows += model.projects.map { project in
            PaletteItem(id: "project-\(project.id)", title: project.name) {
                model.section = .threads
                model.destination = .project(project.id)
            }
        }
        rows += ControlPlaneCatalog.settings(isOwner: model.config?.isOwner == true).map { entry in
            PaletteItem(id: "settings-\(entry.id)", title: "Settings · \(entry.label)") {
                model.section = .settings
                model.destination = .settings(entry.id)
            }
        }
        return rows
    }
}

private struct PaletteItem: Identifiable {
    var id: String
    var title: String
    var go: () -> Void
}

private struct InvitationSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var id: String
    @State private var invitation: OrganizationInvitation?
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("You've been invited").font(.title2.weight(.semibold))
            if let invitation {
                Text("\(invitation.inviterEmail ?? "Someone") invited you to join \(invitation.organizationName ?? "a workspace") as \(invitation.role).")
                    .foregroundStyle(.secondary)
                Button("Join organization") { Task { await accept() } }
                    .disabled(busy)
            }
            if let error { Text(error).foregroundStyle(.red) }
            Button("Not now") { model.pendingInvitation = nil; dismiss() }
                .buttonStyle(.plain)
        }
        .padding(24)
        .frame(width: 420)
        .task {
            invitation = try? await model.client?.invitation(id)
            if invitation == nil { error = "This invitation is not valid" }
        }
    }

    private func accept() async {
        busy = true
        do {
            let result = try await model.client?.acceptInvitation(id)
            if let organization = result?.organizationId {
                try await model.client?.setActiveOrganization(organization)
            }
            model.pendingInvitation = nil
            await model.refresh()
            dismiss()
        } catch {
            self.error = errorText(error)
        }
        busy = false
    }
}

private struct AnnouncementSheet: View {
    var announcement: Announcement
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(announcement.title).font(.title2.weight(.semibold))
            Text(announcement.summary).foregroundStyle(.secondary)
            Text(announcement.details)
            Button("Close") { dismiss() }
                .keyboardShortcut(.cancelAction)
        }
        .padding(24)
        .frame(width: 460)
    }
}

struct PageHeader: View {
    var title: String
    var subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.title2.weight(.semibold))
            Text(subtitle).font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct StatusBanner: View {
    var message: String?

    var body: some View {
        if let message, !message.isEmpty {
            Text(message).font(.callout).foregroundStyle(.red).frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
