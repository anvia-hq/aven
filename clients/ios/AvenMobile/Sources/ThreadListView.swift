import AvenKit
import SwiftUI

struct ThreadListView: View {
    @Environment(AppModel.self) private var model
    @Binding var path: [String]
    var onOpenSidebar: () -> Void
    var onNewThread: () -> Void

    @State private var query = ""
    @State private var showArchived = false
    @State private var renamingThread: ThreadSummary?
    @State private var renameDraft = ""

    private var filtered: [ThreadSummary] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return model.threads }
        return model.threads.filter {
            $0.title.localizedCaseInsensitiveContains(trimmed)
                || model.projectName($0.projectId).localizedCaseInsensitiveContains(trimmed)
        }
    }

    private var viewerId: String? { model.session?.user.id }

    private var pinned: [ThreadSummary] {
        filtered.filter { !$0.isArchived && $0.isPinned }
    }

    private var openOwn: [ThreadSummary] {
        filtered.filter { thread in
            !thread.isArchived && !thread.isPinned && !isSharedByTeammate(thread)
        }
    }

    private var openShared: [ThreadSummary] {
        filtered.filter { thread in
            !thread.isArchived && !thread.isPinned && isSharedByTeammate(thread)
        }
    }

    private var archived: [ThreadSummary] {
        filtered.filter(\.isArchived)
    }

    private func isSharedByTeammate(_ thread: ThreadSummary) -> Bool {
        guard thread.isShared, let viewerId, let creator = thread.createdBy else { return false }
        return creator != viewerId
    }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                if !pinned.isEmpty {
                    Section("Pinned") {
                        ForEach(pinned) { threadRow($0) }
                    }
                }

                if !openOwn.isEmpty {
                    Section(pinned.isEmpty && openShared.isEmpty ? "" : "Recent") {
                        ForEach(openOwn) { threadRow($0) }
                    }
                }

                if !openShared.isEmpty {
                    Section("Shared with workspace") {
                        ForEach(openShared) { threadRow($0) }
                    }
                }

                if !archived.isEmpty {
                    Section {
                        DisclosureGroup(isExpanded: $showArchived) {
                            ForEach(archived) { threadRow($0) }
                        } label: {
                            HStack {
                                Text("Archived")
                                    .foregroundStyle(Theme.mutedForeground)
                                Spacer()
                                Text("\(archived.count)")
                                    .font(.caption.monospacedDigit())
                                    .foregroundStyle(Theme.mutedForeground)
                            }
                        }
                        .listRowBackground(Theme.card)
                    }
                }
            }
            .overlay {
                if model.threads.isEmpty {
                    ContentUnavailableView(
                        "No threads yet",
                        systemImage: "bubble.left",
                        description: Text("Tap the compose button to start a new thread.")
                    )
                } else if filtered.isEmpty {
                    ContentUnavailableView.search(text: query)
                }
            }
            .searchable(text: $query, prompt: "Search threads")
            .themedScreen()
            .refreshable { await model.refresh() }
            .navigationTitle("Threads")
            .navigationDestination(for: String.self) { threadId in
                if let client = model.client {
                    ThreadView(threadId: threadId, client: client)
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: onOpenSidebar) {
                        Image(systemName: "sidebar.left")
                    }
                    .accessibilityLabel("Open sidebar")
                    .accessibilityIdentifier("sidebarToggle")
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: onNewThread) {
                        Image(systemName: "square.and.pencil")
                    }
                    .accessibilityLabel("New thread")
                    .accessibilityIdentifier("newThreadButton")
                }
            }
            .alert("Rename thread", isPresented: Binding(
                get: { renamingThread != nil },
                set: { if !$0 { renamingThread = nil } }
            )) {
                TextField("Title", text: $renameDraft)
                Button("Save") {
                    if let target = renamingThread {
                        let newTitle = renameDraft
                        renamingThread = nil
                        Task { await model.renameThread(target, title: newTitle) }
                    }
                }
                Button("Cancel", role: .cancel) { renamingThread = nil }
            }
        }
    }

    private func threadRow(_ thread: ThreadSummary) -> some View {
        NavigationLink(value: thread.id) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        if thread.isPinned {
                            Image(systemName: "pin.fill")
                                .font(.caption2)
                                .foregroundStyle(Theme.mutedForeground)
                        }
                        Text(thread.title)
                            .foregroundStyle(Theme.foreground)
                            .lineLimit(1)
                    }
                    HStack(spacing: 6) {
                        let project = model.projectName(thread.projectId)
                        if !project.isEmpty {
                            Text(project)
                                .font(.caption)
                                .foregroundStyle(Theme.mutedForeground)
                                .lineLimit(1)
                        }
                        if isSharedByTeammate(thread), let author = thread.createdByName {
                            Text("· \(author)")
                                .font(.caption)
                                .foregroundStyle(Theme.mutedForeground)
                                .lineLimit(1)
                        }
                    }
                }
                Spacer(minLength: 4)
                if thread.running {
                    ProgressView()
                        .controlSize(.small)
                } else if thread.awaitingAnswer {
                    Text("Needs answer")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(Color.orange)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.orange.opacity(0.16), in: Capsule())
                }
            }
            .padding(.vertical, 2)
        }
        .listRowBackground(Theme.card)
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            if !thread.isArchived {
                Button {
                    Task { await model.togglePin(thread) }
                } label: {
                    Label(thread.isPinned ? "Unpin" : "Pin", systemImage: thread.isPinned ? "pin.slash" : "pin")
                }
                .tint(Theme.secondary)
            }
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button {
                Task { await model.setArchived(thread, archived: !thread.isArchived) }
            } label: {
                Label(
                    thread.isArchived ? "Restore" : "Archive",
                    systemImage: thread.isArchived ? "arrow.uturn.backward" : "archivebox"
                )
            }
            .tint(thread.isArchived ? Theme.success : Theme.destructive)
        }
        .contextMenu {
            if !thread.isArchived {
                Button {
                    Task { await model.togglePin(thread) }
                } label: {
                    Label(thread.isPinned ? "Unpin" : "Pin", systemImage: thread.isPinned ? "pin.slash" : "pin")
                }
                Button {
                    renameDraft = thread.title
                    renamingThread = thread
                } label: {
                    Label("Rename", systemImage: "pencil")
                }
            }
            Button(role: thread.isArchived ? nil : .destructive) {
                Task { await model.setArchived(thread, archived: !thread.isArchived) }
            } label: {
                Label(
                    thread.isArchived ? "Restore" : "Archive",
                    systemImage: thread.isArchived ? "arrow.uturn.backward" : "archivebox"
                )
            }
        }
    }
}
