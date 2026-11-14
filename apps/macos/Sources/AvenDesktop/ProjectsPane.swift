import AvenDesktopCore
import SwiftUI

struct ProjectsBoardView: View {
    @Environment(AppModel.self) private var model
    @State private var query = ""
    @State private var view = "all"
    @State private var runner = ""
    @State private var adding = false

    var body: some View {
        let filters = ProjectFilters(
            query: query, view: view, runnerID: runner.isEmpty ? nil : runner)
        let cards = projectBoard(model.projects, threads: model.threads, filters: filters, me: model.account?.id)
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PageHeader(title: "Projects", subtitle: "Folders and repositories your threads run in.")
                HStack {
                    TextField("Search", text: $query).textFieldStyle(.roundedBorder)
                    Picker("View", selection: $view) {
                        Text("All").tag("all")
                        Text("Mine").tag("mine")
                        Text("Working").tag("working")
                    }
                    .pickerStyle(.segmented)
                    .frame(maxWidth: 280)
                    Picker("Runner", selection: $runner) {
                        Text("Any runner").tag("")
                        ForEach(model.runtimes) { runtime in
                            Text(runtime.name).tag(runtime.id)
                        }
                    }
                    .frame(maxWidth: 200)
                    Button("Add project") { adding = true }
                }
                if cards.isEmpty {
                    ContentUnavailableView("No projects", systemImage: "folder")
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 280), spacing: 16)], spacing: 16) {
                        ForEach(cards) { card in
                            ProjectCardView(card: card)
                        }
                    }
                }
            }
            .padding(24)
        }
        .sheet(isPresented: $adding) { AddProjectSheet() }
    }
}

private struct ProjectCardView: View {
    @Environment(AppModel.self) private var model
    var card: ProjectCard

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(card.project.name) { model.destination = .project(card.project.id) }
                .font(.headline)
                .buttonStyle(.plain)
            Text(projectPlace(card.project).isEmpty ? "No folder yet" : projectPlace(card.project))
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Text(model.runtimeName(card.project.runtimeId))
                .font(.caption2)
                .foregroundStyle(.secondary)
            ForEach(card.threads) { thread in
                Button(thread.title) { model.openThread(thread.id) }
                    .buttonStyle(.plain)
                    .font(.callout)
            }
            Button("Start thread") {
                model.draftProjectID = card.project.id
                model.destination = .newThread
            }
            .font(.caption)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 12))
    }
}

private struct AddProjectSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var tab = "folder"
    @State private var runtimeID = ""
    @State private var path = ""
    @State private var repository = ""
    @State private var name = ""
    @State private var folders: [FolderEntry] = []
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Add project").font(.title3.weight(.semibold))
            Picker("Kind", selection: $tab) {
                Text("Folder").tag("folder")
                Text("Repository").tag("repository")
            }
            .pickerStyle(.segmented)
            Picker("Runner", selection: $runtimeID) {
                Text("Choose").tag("")
                ForEach(model.runtimes) { runtime in
                    Text(runtime.name).tag(runtime.id)
                }
            }
            if tab == "folder" {
                HStack {
                    TextField("Folder path", text: $path).textFieldStyle(.roundedBorder)
                    Button("Browse") { Task { await browse() } }
                        .disabled(runtimeID.isEmpty)
                }
                List(folders) { folder in
                    Button(folder.name) {
                        path = folder.path
                        Task { await browse() }
                    }
                    .buttonStyle(.plain)
                }
                .frame(height: 160)
            } else {
                TextField("owner/name", text: $repository).textFieldStyle(.roundedBorder)
            }
            TextField("Name (optional)", text: $name).textFieldStyle(.roundedBorder)
            StatusBanner(message: error)
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button("Add") { Task { await add() } }
                    .disabled(busy || runtimeID.isEmpty || (tab == "folder" ? path.isEmpty : repository.isEmpty))
            }
        }
        .padding(20)
        .frame(width: 480)
        .onAppear { runtimeID = model.runtimes.first?.id ?? "" }
    }

    private func browse() async {
        do {
            folders = try await model.client?.runtimeFolders(runtimeID, path: path.isEmpty ? nil : path).folders ?? []
        } catch {
            self.error = errorText(error)
        }
    }

    private func add() async {
        guard let api = model.client else { return }
        busy = true
        error = nil
        do {
            let project: Project
            if tab == "folder" {
                project = try await api.addFolder(
                    runtimeID: runtimeID, path: path, name: name.isEmpty ? nil : name)
            } else {
                project = try await api.addRepository(
                    runtimeID: runtimeID, repository: repository, name: name.isEmpty ? nil : name)
            }
            await model.refresh()
            model.destination = .project(project.id)
            dismiss()
        } catch {
            self.error = errorText(error)
        }
        busy = false
    }
}

struct ProjectDetailView: View {
    @Environment(AppModel.self) private var model
    var id: String
    @State private var path = ""
    @State private var entries: [RepoEntry] = []
    @State private var readme = ""
    @State private var commits: [RepoCommit] = []
    @State private var pulls: [TrackedItem] = []
    @State private var issues: [TrackedItem] = []
    @State private var variables: [Variable] = []
    @State private var error: String?
    @State private var confirmDelete = false

    var body: some View {
        let project = model.projects.first { $0.id == id }
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(project?.name ?? "Project").font(.title2.weight(.semibold))
                        Text(project.map(projectPlace) ?? "").font(.callout).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Start thread") {
                        model.draftProjectID = id
                        model.destination = .newThread
                    }
                }
                HStack(alignment: .top, spacing: 20) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Files").font(.headline)
                        if !path.isEmpty { Button("Up") { path = path.split(separator: "/").dropLast().joined(separator: "/") } }
                        ForEach(entries) { entry in
                            Button(entry.name) {
                                if entry.type == "directory" { path = entry.path } 
                            }
                            .buttonStyle(.plain)
                        }
                        Text("README").font(.headline).padding(.top, 8)
                        Text(readme.isEmpty ? "No README" : readme)
                            .font(.callout)
                            .textSelection(.enabled)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    VStack(alignment: .leading, spacing: 8) {
                        Text("About").font(.headline)
                        if let project {
                            LabeledContent("Runner", value: model.runtimeName(project.runtimeId))
                            LabeledContent("Branch", value: project.defaultBranch ?? "—")
                            Picker("Move to", selection: Binding(
                                get: { project.runtimeId },
                                set: { runtime in Task { await move(runtime) } }
                            )) {
                                ForEach(model.runtimes) { runtime in
                                    Text(runtime.name).tag(runtime.id)
                                }
                            }
                        }
                        Text("Recent threads").font(.headline)
                        ForEach(model.threads.filter { $0.projectId == id && $0.state != "archived" }.prefix(6)) { thread in
                            Button(thread.title) { model.openThread(thread.id) }.buttonStyle(.plain)
                        }
                        Text("Environment variables").font(.headline)
                        ForEach(variables) { variable in
                            Text(variable.secret ? "\(variable.name) ••••" : "\(variable.name)=\(variable.value ?? "")")
                                .font(.caption)
                        }
                        Text("Commits").font(.headline)
                        ForEach(commits.prefix(10)) { commit in
                            Text(commit.message).font(.caption).lineLimit(2)
                        }
                        Text("Pull requests").font(.headline)
                        ForEach(pulls) { item in
                            Link("#\(item.number) \(item.title)", destination: URL(string: item.url) ?? URL(string: "https://github.com")!)
                                .font(.caption)
                        }
                        Text("Issues").font(.headline)
                        ForEach(issues) { item in
                            Text("#\(item.number) \(item.title)").font(.caption).lineLimit(1)
                        }
                        Button("Delete project", role: .destructive) { confirmDelete = true }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                StatusBanner(message: error)
            }
            .padding(24)
        }
        .task(id: path) { await load() }
        .confirmationDialog("Delete this project?", isPresented: $confirmDelete) {
            Button("Delete project", role: .destructive) { Task { await remove() } }
        } message: {
            Text("Its threads are archived and kept.")
        }
    }

    private func load() async {
        guard let api = model.client else { return }
        do {
            let listing = try await api.projectFiles(id, path: path)
            entries = listing.entries
            readme = (try? await api.projectReadme(id).readme?.text) ?? ""
            commits = (try? await api.projectCommits(id, page: 1).commits) ?? []
            pulls = (try? await api.projectPulls(id, state: "open", page: 1).items) ?? []
            issues = (try? await api.projectIssues(id, state: "open", page: 1).items) ?? []
            variables = (try? await api.projectVariables(id)) ?? []
        } catch {
            self.error = errorText(error)
        }
    }

    private func move(_ runtimeID: String) async {
        do {
            try await model.client?.moveProject(id, runtimeID: runtimeID)
            await model.refresh()
        } catch {
            self.error = errorText(error)
        }
    }

    private func remove() async {
        do {
            try await model.client?.deleteProject(id)
            await model.refresh()
            model.destination = .projects
        } catch {
            self.error = errorText(error)
        }
    }
}
