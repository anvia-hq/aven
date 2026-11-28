import AvenKit
import SwiftUI

struct ProjectsView: View {
    @Environment(AppModel.self) private var model
    var onOpenSidebar: () -> Void
    var onOpenThread: (String) -> Void
    var onNewThreadInProject: (String) -> Void

    @State private var query = ""

    private var filteredProjects: [Project] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return model.projects }
        return model.projects.filter { $0.name.localizedCaseInsensitiveContains(trimmed) }
    }

    var body: some View {
        NavigationStack {
            List(filteredProjects) { project in
                NavigationLink {
                    ProjectDetailView(
                        project: project,
                        onOpenThread: onOpenThread,
                        onNewThread: { onNewThreadInProject(project.id) }
                    )
                } label: {
                    projectRow(project)
                }
                .listRowBackground(Theme.card)
            }
            .overlay {
                if model.projects.isEmpty {
                    ContentUnavailableView(
                        "No projects yet", systemImage: "folder",
                        description: Text("Add a folder or repository from the web app."))
                }
            }
            .searchable(text: $query, prompt: "Search projects")
            .themedScreen()
            .refreshable { await model.refresh() }
            .navigationTitle("Projects")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: onOpenSidebar) {
                        Image(systemName: "sidebar.left")
                    }
                    .accessibilityLabel("Open sidebar")
                    .accessibilityIdentifier("sidebarToggle")
                }
            }
        }
    }

    private func projectRow(_ project: Project) -> some View {
        let threadCount = model.threads.filter { $0.projectId == project.id && !$0.isArchived }.count
        let runtime = model.runtime(for: project.runtimeId)

        return HStack(spacing: 12) {
            Image(systemName: "folder")
                .foregroundStyle(Theme.mutedForeground)
            VStack(alignment: .leading, spacing: 2) {
                Text(project.name)
                    .foregroundStyle(Theme.foreground)
                    .lineLimit(1)
                if let runtime {
                    HStack(spacing: 5) {
                        Circle()
                            .fill(runtime.online ? Theme.success : Theme.mutedForeground.opacity(0.4))
                            .frame(width: 6, height: 6)
                        Text(runtime.name)
                            .font(.caption)
                            .foregroundStyle(Theme.mutedForeground)
                            .lineLimit(1)
                    }
                }
            }
            Spacer()
            if threadCount > 0 {
                Text("\(threadCount)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(Theme.mutedForeground)
            }
        }
    }
}

private struct ProjectDetailView: View {
    @Environment(AppModel.self) private var model
    let project: Project
    var onOpenThread: (String) -> Void
    var onNewThread: () -> Void

    private var projectThreads: [ThreadSummary] {
        model.threads.filter { $0.projectId == project.id && !$0.isArchived }
    }

    var body: some View {
        List {
            if let runtime = model.runtime(for: project.runtimeId) {
                Section("Computer") {
                    HStack {
                        Circle()
                            .fill(runtime.online ? Theme.success : Theme.mutedForeground.opacity(0.4))
                            .frame(width: 8, height: 8)
                        Text(runtime.name)
                            .foregroundStyle(Theme.foreground)
                        Spacer()
                        Text(runtime.online ? "Online" : "Offline")
                            .font(.caption)
                            .foregroundStyle(Theme.mutedForeground)
                    }
                    .listRowBackground(Theme.card)
                }
            }

            Section("Threads") {
                if projectThreads.isEmpty {
                    Text("No open threads in this project.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.mutedForeground)
                        .listRowBackground(Theme.card)
                } else {
                    ForEach(projectThreads) { thread in
                        Button {
                            onOpenThread(thread.id)
                        } label: {
                            HStack {
                                Text(thread.title)
                                    .foregroundStyle(Theme.foreground)
                                    .lineLimit(1)
                                Spacer()
                                if thread.running { ProgressView() }
                            }
                        }
                        .listRowBackground(Theme.card)
                    }
                }
            }
        }
        .themedScreen()
        .navigationTitle(project.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: onNewThread) {
                    Image(systemName: "square.and.pencil")
                }
                .accessibilityLabel("New thread in \(project.name)")
            }
        }
    }
}

struct CockpitView: View {
    var onOpenSidebar: () -> Void
    @State private var tab = "Inbox"
    private let tabs = ["Inbox", "Tasks", "Notes", "Tags"]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Cockpit", selection: $tab) {
                    ForEach(tabs, id: \.self) { Text($0).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)

                ContentUnavailableView(
                    tab,
                    systemImage: iconFor(tab),
                    description: Text("Native Cockpit \(tab.lowercased()) sync is coming in Phase 3.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Cockpit")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: onOpenSidebar) {
                        Image(systemName: "sidebar.left")
                    }
                    .accessibilityLabel("Open sidebar")
                    .accessibilityIdentifier("sidebarToggle")
                }
            }
        }
    }

    private func iconFor(_ tab: String) -> String {
        switch tab {
        case "Inbox": return "tray"
        case "Tasks": return "checklist"
        case "Notes": return "note.text"
        default: return "tag"
        }
    }
}

struct BotsView: View {
    var onOpenSidebar: () -> Void

    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "Bots",
                systemImage: "sparkles",
                description: Text("Bot chat, goals, and schedules are coming in Phase 3.")
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Bots")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: onOpenSidebar) {
                        Image(systemName: "sidebar.left")
                    }
                    .accessibilityLabel("Open sidebar")
                    .accessibilityIdentifier("sidebarToggle")
                }
            }
        }
    }
}

struct GitCenterView: View {
    var onOpenSidebar: () -> Void

    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "Git Center",
                systemImage: "arrow.triangle.branch",
                description: Text("Branches, commit graph, and pull requests are coming in Phase 4.")
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Git Center")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: onOpenSidebar) {
                        Image(systemName: "sidebar.left")
                    }
                    .accessibilityLabel("Open sidebar")
                    .accessibilityIdentifier("sidebarToggle")
                }
            }
        }
    }
}

struct AutomationsView: View {
    var onOpenSidebar: () -> Void

    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "Automations",
                systemImage: "bolt",
                description: Text("Schedules, webhooks, and run history are coming in Phase 4.")
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Automations")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: onOpenSidebar) {
                        Image(systemName: "sidebar.left")
                    }
                    .accessibilityLabel("Open sidebar")
                    .accessibilityIdentifier("sidebarToggle")
                }
            }
        }
    }
}
