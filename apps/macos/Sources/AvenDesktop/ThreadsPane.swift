import AvenDesktopCore
import SwiftUI

struct ThreadSidebar: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        List(selection: model.destinationSelection) {
            Label("New thread", systemImage: "square.and.pencil").tag(Destination.newThread)
            Label("Projects", systemImage: "folder").tag(Destination.projects)
            ForEach(recencyGroups(model.ownOpenThreads)) { group in
                Section(group.label) {
                    ForEach(group.threads) { thread in
                        threadRow(thread)
                    }
                }
            }
            if !model.sharedThreads.isEmpty {
                Section(ControlPlaneCatalog.sharedSection) {
                    ForEach(model.sharedThreads) { thread in
                        threadRow(thread)
                    }
                }
            }
        }
        .listStyle(.sidebar)
    }

    private func threadRow(_ thread: AvenThread) -> some View {
        HStack {
            if model.unread.contains(thread.id) {
                Circle().fill(Color.accentColor).frame(width: 6, height: 6)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(thread.title).lineLimit(1)
                Text(model.projectName(thread.projectId))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            if thread.running {
                ProgressView().controlSize(.small)
            } else if thread.parentThreadId != nil {
                Text("Fork").font(.caption2).foregroundStyle(.secondary)
            } else if thread.createdBy != model.account?.id {
                Image(systemName: "person.2").font(.caption2).foregroundStyle(.secondary)
            }
        }
        .tag(Destination.thread(thread.id))
        .contextMenu {
            Button("Archive") { Task { await archive(thread) } }
        }
    }

    private func archive(_ thread: AvenThread) async {
        try? await model.client?.updateThread(thread.id, body: jsonObject(("state", .string("archived"))))
        if model.destination == .thread(thread.id) { model.newThread() }
        await model.refresh()
    }
}

struct NewThreadView: View {
    @Environment(AppModel.self) private var model
    @State private var projectID = ""
    @State private var prompt = ""
    @State private var providerID = ""
    @State private var modelID = ""
    @State private var effort = ""
    @State private var claude = false
    @State private var error: String?
    @State private var busy = false
    @State private var models: [String] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            PageHeader(
                title: "New thread",
                subtitle: "A thread runs in a project, on that project's computer.")
            if model.projects.isEmpty {
                ContentUnavailableView(
                    "No projects yet", systemImage: "folder",
                    description: Text("Add a folder or a repository from Projects."))
                Button("Projects") { model.destination = .projects }
            } else {
                Picker("Project", selection: $projectID) {
                    Text("Choose a project").tag("")
                    ForEach(model.projects) { project in
                        Text(project.name).tag(project.id)
                    }
                }
                if !model.providers.isEmpty {
                    Picker("Provider", selection: $providerID) {
                        Text("Default").tag("")
                        ForEach(model.providers) { provider in
                            Text(provider.name).tag(provider.id)
                        }
                    }
                    .onChange(of: providerID) { _, id in
                        Task { await loadModels(id) }
                    }
                    if !models.isEmpty {
                        Picker("Model", selection: $modelID) {
                            Text("Provider default").tag("")
                            ForEach(models, id: \.self) { Text($0).tag($0) }
                        }
                    }
                    TextField("Reasoning effort", text: $effort)
                        .textFieldStyle(.roundedBorder)
                }
                Toggle("Claude subscription", isOn: $claude)
                TextEditor(text: $prompt)
                    .font(.body)
                    .frame(minHeight: 140)
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(.quaternary))
                HStack {
                    Button("Start") { Task { await start() } }
                        .keyboardShortcut(.defaultAction)
                        .disabled(busy || projectID.isEmpty || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    if busy { ProgressView().controlSize(.small) }
                }
            }
            StatusBanner(message: error)
            recent
            Spacer()
        }
        .padding(24)
        .onAppear {
            if let draft = model.draftProjectID, model.projects.contains(where: { $0.id == draft }) {
                projectID = draft
            } else if projectID.isEmpty {
                projectID = model.projects.first?.id ?? ""
            }
        }
    }

    private var recent: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !model.ownOpenThreads.isEmpty {
                Text("Recent").font(.headline)
                ForEach(Array(model.ownOpenThreads.prefix(3))) { thread in
                    Button(thread.title) { model.openThread(thread.id) }
                        .buttonStyle(.plain)
                }
            }
        }
    }

    private func loadModels(_ id: String) async {
        models = []
        modelID = ""
        guard !id.isEmpty, let list = try? await model.client?.providerModels(id) else { return }
        models = list.models
    }

    private func start() async {
        guard let api = model.client else { return }
        busy = true
        error = nil
        do {
            let created = try await api.createThread(
                projectID: projectID, title: nil, backend: claude ? "claude" : nil)
            try await api.sendMessage(
                threadID: created.id,
                prompt: prompt.trimmingCharacters(in: .whitespacesAndNewlines),
                providerID: providerID.isEmpty ? nil : providerID,
                modelID: modelID.isEmpty ? nil : modelID,
                effort: effort.isEmpty ? nil : effort)
            prompt = ""
            await model.refresh()
            model.openThread(created.id)
        } catch {
            self.error = errorText(error)
        }
        busy = false
    }
}

struct ThreadDetailView: View {
    @Environment(AppModel.self) private var model
    var id: String
    @State private var transcript = Transcript()
    @State private var prompt = ""
    @State private var error: String?
    @State private var panels = false
    @State private var providerID = ""
    @State private var modelID = ""
    @State private var effort = ""
    @State private var answers: [String: String] = [:]
    @State private var questionIndex = 0

    var body: some View {
        VStack(spacing: 0) {
            messageList
            composer
        }
        .navigationTitle(thread?.title ?? "Thread")
        .toolbar {
            ToolbarItemGroup {
                if let thread {
                    Menu("Share") {
                        Button("Private") { Task { await setVisibility("private") } }
                        Button("Workspace") { Task { await setVisibility("workspace") } }
                        Divider()
                        Button(thread.drivingUntil == nil ? "Multiplayer for 7 days" : "Turn multiplayer off") {
                            Task { await setDriving(thread.drivingUntil == nil) }
                        }
                    }
                    Button(shipTitle) { Task { await ship() } }
                        .disabled(transcript.running)
                }
                Button(panels ? "Hide panels" : "Panels") { panels.toggle() }
                Button("Archive") { Task { await archive() } }
            }
        }
        .inspector(isPresented: $panels) {
            ThreadInspector(id: id, transcript: transcript)
                .inspectorColumnWidth(min: 280, ideal: 340, max: 520)
        }
        .task(id: id) { await follow() }
        .onAppear { model.openThread(id) }
    }

    private var thread: AvenThread? { model.threads.first { $0.id == id } }

    private var shipTitle: String {
        if let open = thread?.pullRequests.last(where: { $0.state == "open" }) {
            return "Update PR #\(open.number)"
        }
        return "Ship"
    }

    private var messageList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                if transcript.hidden > 0 {
                    Button("Show earlier messages") { Task { await loadEarlier() } }
                }
                ForEach(transcript.messages) { message in
                    MessageBubble(message: message, mine: message.senderId == nil || message.senderId == model.account?.id)
                }
                if let failure = transcript.error {
                    Text(failure).foregroundStyle(.red)
                }
                if let tool = transcript.waitingQuestion, let questions = tool.questions, questionIndex < questions.count {
                    QuestionForm(
                        question: questions[questionIndex],
                        answer: Binding(
                            get: { answers[questions[questionIndex].id] ?? "" },
                            set: { answers[questions[questionIndex].id] = $0 }
                        ),
                        isLast: questionIndex == questions.count - 1,
                        onNext: {
                            if questionIndex < questions.count - 1 {
                                questionIndex += 1
                            } else {
                                Task { await sendAnswers(questions) }
                            }
                        }
                    )
                }
            }
            .padding(20)
        }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 8) {
            if thread?.createdBy != model.account?.id && thread?.drivingUntil == nil && thread != nil {
                Text("Shared with you. You can read it.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else if transcript.waitingQuestion == nil {
                HStack {
                    if !model.providers.isEmpty {
                        Picker("Provider", selection: $providerID) {
                            Text("Default").tag("")
                            ForEach(model.providers) { provider in
                                Text(provider.name).tag(provider.id)
                            }
                        }
                        .labelsHidden()
                        .frame(maxWidth: 180)
                    }
                    TextField("Message", text: $prompt, axis: .vertical)
                        .lineLimit(1...6)
                        .onSubmit { Task { await send() } }
                    if transcript.running {
                        Button("Stop") { Task { await stop() } }
                    } else {
                        Button("Send") { Task { await send() } }
                            .keyboardShortcut(.defaultAction)
                            .disabled(prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
            StatusBanner(message: error)
        }
        .padding(12)
    }

    private func follow() async {
        guard let api = model.client else { return }
        var attempt = 0
        while !Task.isCancelled {
            do {
                for try await payload in api.serverSentPayloads("/threads/\(id)/events") {
                    attempt = 0
                    guard let event = try? JSONDecoder().decode(RunEvent.self, from: Data(payload.utf8)) else { continue }
                    transcript.apply(event)
                }
            } catch {
                if Task.isCancelled { return }
                if let failure = error as? APIError, failure.isUnauthorized {
                    model.signOut()
                    return
                }
                attempt += 1
                self.error = errorText(error)
                if attempt > 4 { return }
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }
    }

    private func send() async {
        let text = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let api = model.client else { return }
        prompt = ""
        do {
            try await api.sendMessage(
                threadID: id, prompt: text,
                providerID: providerID.isEmpty ? nil : providerID,
                modelID: modelID.isEmpty ? nil : modelID,
                effort: effort.isEmpty ? nil : effort)
        } catch {
            self.prompt = text
            self.error = errorText(error)
        }
    }

    private func stop() async {
        do { try await model.client?.cancel(threadID: id) } catch { self.error = errorText(error) }
    }

    private func sendAnswers(_ questions: [QuestionPrompt]) async {
        let payload = questions.map { ($0.id, answers[$0.id] ?? "") }
        do {
            try await model.client?.answer(threadID: id, answers: payload)
            questionIndex = 0
            answers = [:]
        } catch {
            self.error = errorText(error)
        }
    }

    private func loadEarlier() async {
        guard let page = try? await model.client?.earlierMessages(threadID: id, before: transcript.hidden) else { return }
        transcript.messages = page.messages + transcript.messages
        transcript.hidden = page.hidden
    }

    private func setVisibility(_ visibility: String) async {
        try? await model.client?.updateThread(id, body: jsonObject(("visibility", .string(visibility))))
        await model.refresh()
    }

    private func setDriving(_ on: Bool) async {
        let value: JSONValue = on ? .int(7) : .null
        try? await model.client?.updateThread(id, body: jsonObject(("driving", value)))
        await model.refresh()
    }

    private func archive() async {
        try? await model.client?.updateThread(id, body: jsonObject(("state", .string("archived"))))
        model.newThread()
        await model.refresh()
    }

    private func ship() async {
        do {
            let readiness = try await model.client?.shipReadiness(id)
            if readiness?.ship == false {
                try await model.client?.sendMessage(
                    threadID: id, prompt: "/setup-ship", providerID: nil, modelID: nil, effort: nil)
            } else {
                let mode = thread?.pullRequests.contains { $0.state == "open" } == true ? "update" : nil
                try await model.client?.ship(id, mode: mode)
            }
        } catch {
            self.error = errorText(error)
        }
    }
}

private struct MessageBubble: View {
    var message: ChatMessage
    var mine: Bool

    var body: some View {
        VStack(alignment: mine && message.role == "user" ? .trailing : .leading, spacing: 6) {
            Text(message.role == "user" ? "You" : "Agent")
                .font(.caption)
                .foregroundStyle(.secondary)
            ForEach(Array(message.parts.enumerated()), id: \.offset) { _, part in
                switch part {
                case .text(let text):
                    Text(LocalizedStringKey(text))
                        .textSelection(.enabled)
                        .padding(10)
                        .background(message.role == "user" ? Color.accentColor.opacity(0.15) : Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 10))
                case .reasoning(let text):
                    DisclosureGroup("Thoughts") {
                        Text(text).font(.callout).foregroundStyle(.secondary)
                    }
                case .tool(let tool):
                    DisclosureGroup("\(tool.name) \(tool.target)") {
                        if let output = tool.output, !output.isEmpty {
                            Text(output).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                        } else {
                            Text(tool.status).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                case .ignored:
                    EmptyView()
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: mine && message.role == "user" ? .trailing : .leading)
    }
}

private struct QuestionForm: View {
    var question: QuestionPrompt
    @Binding var answer: String
    var isLast: Bool
    var onNext: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(question.text).font(.headline)
            if let choices = question.choices, !choices.isEmpty {
                Picker("Answer", selection: $answer) {
                    Text("Choose").tag("")
                    ForEach(choices) { choice in
                        Text(choice.label).tag(choice.value)
                    }
                }
                .labelsHidden()
            }
            if question.choices == nil || question.allowCustom == true {
                TextField("Your answer", text: $answer)
                    .textFieldStyle(.roundedBorder)
            }
            Button(isLast ? "Send answers" : "Next") { onNext() }
                .disabled(answer.isEmpty)
        }
        .padding(12)
        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
    }
}

private struct ThreadInspector: View {
    @Environment(AppModel.self) private var model
    var id: String
    var transcript: Transcript
    @State private var panel = "Overview"

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Picker("Panel", selection: $panel) {
                ForEach(["Overview", "Files", "Changes", "Terminal", "Browser"], id: \.self) { Text($0).tag($0) }
            }
            .pickerStyle(.segmented)
            switch panel {
            case "Files": FilesPanel(id: id)
            case "Changes": ChangesPanel(id: id)
            case "Terminal": ComputerPanel(id: id)
            case "Browser": BrowserPanel(runtimeID: model.threads.first { $0.id == id }?.runtimeId ?? "")
            default: OverviewPanel(id: id, transcript: transcript)
            }
            Spacer()
        }
        .padding(12)
    }
}

private struct OverviewPanel: View {
    @Environment(AppModel.self) private var model
    var id: String
    var transcript: Transcript
    @State private var processes: [BackgroundProcess] = []
    @State private var error: String?

    var body: some View {
        let thread = model.threads.first { $0.id == id }
        VStack(alignment: .leading, spacing: 10) {
            Text("Environment").font(.headline)
            if let thread {
                LabeledContent("Project", value: model.projectName(thread.projectId))
                LabeledContent("Runtime", value: model.runtimeName(thread.runtimeId))
                LabeledContent("Backend", value: thread.agentBackend)
            }
            if let usage = transcript.usage {
                Text("Usage").font(.headline)
                LabeledContent("Input", value: "\(usage.totals.inputTokens)")
                LabeledContent("Output", value: "\(usage.totals.outputTokens)")
                if let context = usage.context {
                    let window = context.contextWindow.map { " / \($0)" } ?? ""
                    LabeledContent("Context", value: "\(context.usedTokens)\(window)")
                }
            }
            Text("Background tasks").font(.headline)
            if processes.isEmpty {
                Text("None yet").foregroundStyle(.secondary).font(.callout)
            }
            ForEach(processes) { process in
                HStack {
                    Text(process.command).lineLimit(1).font(.caption)
                    Spacer()
                    Text(process.status).font(.caption2).foregroundStyle(.secondary)
                    if process.status == "running" {
                        Button("Stop") { Task { await stop(process.id) } }
                    }
                }
            }
            StatusBanner(message: error)
        }
        .task(id: id) { await reload() }
    }

    private func reload() async {
        processes = (try? await model.client?.processes(id).processes) ?? []
    }

    private func stop(_ processID: String) async {
        do {
            try await model.client?.stopProcess(threadID: id, processID: processID)
            await reload()
        } catch {
            self.error = errorText(error)
        }
    }
}

private struct FilesPanel: View {
    @Environment(AppModel.self) private var model
    var id: String
    @State private var path = ""
    @State private var entries: [FileEntry] = []
    @State private var file: String?
    @State private var note: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                if !path.isEmpty {
                    Button("Up") { path = parent }
                }
                Text(path.isEmpty ? "/" : path).font(.caption).lineLimit(1)
            }
            List(entries) { entry in
                Button(entry.name) {
                    let next = path.isEmpty ? entry.name : "\(path)/\(entry.name)"
                    if entry.type == "directory" { path = next } else { Task { await open(next) } }
                }
                .buttonStyle(.plain)
            }
            if let file {
                ScrollView {
                    Text(file).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            if let note { Text(note).font(.caption).foregroundStyle(.secondary) }
        }
        .task(id: path) { await load() }
    }

    private var parent: String {
        path.split(separator: "/").dropLast().joined(separator: "/")
    }

    private func load() async {
        do {
            let folder = try await model.client?.threadFiles(id, path: path)
            if folder?.available == false {
                note = "The folder is not ready."
                entries = []
            } else {
                note = nil
                entries = folder?.entries ?? []
            }
        } catch {
            note = errorText(error)
        }
    }

    private func open(_ path: String) async {
        let body = try? await model.client?.threadFile(id, path: path)
        if body?.kind == "text" { file = body?.text } else { file = body?.kind == "binary" ? "Binary file" : "The file is not available." }
    }
}

private struct ChangesPanel: View {
    @Environment(AppModel.self) private var model
    var id: String
    @State private var scope = "unshipped"
    @State private var patch = ""
    @State private var note: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker("Scope", selection: $scope) {
                Text("Last turn").tag("turn")
                Text("Unshipped").tag("unshipped")
                Text("Full diff").tag("all")
            }
            let stats = diffStats(patch)
            Text("\(stats.files) files  +\(stats.additions)  -\(stats.deletions)")
                .font(.caption)
                .foregroundStyle(.secondary)
            ScrollView {
                Text(patch.isEmpty ? (note ?? "No changes") : patch)
                    .font(.system(.caption, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .task(id: scope) { await load() }
    }

    private func load() async {
        do {
            let diff = try await model.client?.threadDiff(id, scope: scope)
            if diff?.available == false {
                note = "Changes could not be read."
                patch = ""
            } else {
                patch = diff?.patch ?? ""
                note = diff?.truncated == true ? "Truncated" : nil
            }
        } catch {
            note = errorText(error)
        }
    }
}

private struct ComputerPanel: View {
    @Environment(AppModel.self) private var model
    var id: String
    @State private var status: ComputerStatus?
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Terminal").font(.headline)
            Text(label).foregroundStyle(.secondary)
            Text("The interactive shell is a raw socket on the runner. This app wakes the computer; it does not embed a terminal emulator.")
                .font(.caption)
                .foregroundStyle(.secondary)
            Button("Wake up") { Task { await wake() } }
                .disabled(status?.state == "awake" || status?.state == "waking")
            StatusBanner(message: error)
        }
        .task { status = try? await model.client?.computer(id) }
    }

    private var label: String {
        guard let status else { return "Checking the computer…" }
        if !status.available { return "This thread has no computer yet." }
        switch status.state {
        case "awake": return "The folder is awake."
        case "waking": return "Waking up."
        default: return "The folder is asleep."
        }
    }

    private func wake() async {
        do {
            try await model.client?.wakeComputer(id)
            status = try await model.client?.computer(id)
        } catch {
            self.error = errorText(error)
        }
    }
}

private struct BrowserPanel: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    var runtimeID: String
    @State private var port = "3000"
    @State private var ticket: PreviewTicket?
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Browser").font(.headline)
            Text("Opens a port of this runner in your browser, after you confirm it. The page is not embedded here.")
                .font(.caption)
                .foregroundStyle(.secondary)
            TextField("Port", text: $port)
                .textFieldStyle(.roundedBorder)
            Button("Open") { Task { await open() } }
                .disabled(Int(port) == nil || runtimeID.isEmpty)
            if let ticket {
                Button("Open in browser") { if let url = URL(string: ticket.url) { openURL(url) } }
                Text(ticket.url).font(.caption).textSelection(.enabled)
            }
            StatusBanner(message: error)
        }
    }

    private func open() async {
        guard let port = Int(port) else { return }
        do {
            ticket = try await model.client?.openPort(runtimeID: runtimeID, port: port)
            if let url = ticket.flatMap({ URL(string: $0.url) }) { openURL(url) }
        } catch {
            self.error = errorText(error)
        }
    }
}
