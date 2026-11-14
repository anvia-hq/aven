import AvenDesktopCore
import SwiftUI

struct CockpitSidebar: View {
    @Environment(AppModel.self) private var model
    @State private var tags: [CockpitTag] = []
    @State private var notes: [CockpitNote] = []
    @State private var openInbox = 0
    @State private var activeTasks = 0

    var body: some View {
        @Bindable var model = model
        List(selection: model.destinationSelection) {
            Section("Cockpit") {
                Label("Inbox", systemImage: "tray").tag(Destination.inbox)
                    .badge(openInbox)
                Label("Tasks", systemImage: "checklist").tag(Destination.tasks)
                    .badge(activeTasks)
                Label("Notes", systemImage: "note.text").tag(Destination.notes)
                Label("Tags", systemImage: "tag").tag(Destination.tags)
            }
            let pinned = notes.filter(\.pinned)
            if !pinned.isEmpty {
                Section("Pinned") {
                    ForEach(pinned) { note in
                        Label(note.title, systemImage: "pin").tag(Destination.note(note.id))
                    }
                }
            }
            if !tags.isEmpty {
                Section("Tags") {
                    ForEach(tags) { tag in
                        Button(tag.name) {
                            model.cockpitTag = model.cockpitTag == tag.name ? nil : tag.name
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .task { await counts() }
    }

    private func counts() async {
        guard let api = model.client else { return }
        let inbox = (try? await api.inbox()) ?? []
        let tasks = (try? await api.tasks()) ?? []
        openInbox = inbox.filter { !$0.done }.count
        activeTasks = tasks.filter { $0.status != "done" && $0.status != "cancelled" }.count
        notes = (try? await api.notes()) ?? []
        tags = (try? await api.tags()) ?? []
    }
}

struct InboxView: View {
    @Environment(AppModel.self) private var model
    @State private var items: [InboxItem] = []
    @State private var selected: String?
    @State private var title = ""
    @State private var bodyText = ""
    @State private var newTitle = ""
    @State private var newBody = ""
    @State private var creating = false
    @State private var error: String?

    var body: some View {
        HStack(spacing: 0) {
            List(filtered, selection: $selected) { item in
                VStack(alignment: .leading) {
                    Text(item.title).font(item.done ? .body : .body.weight(.semibold)).lineLimit(1)
                    Text(plainTextOf(item.body)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                .tag(Optional(item.id))
            }
            .frame(minWidth: 240, maxWidth: 320)
            .onChange(of: selected) { _, id in
                guard let item = items.first(where: { $0.id == id }) else { return }
                title = item.title
                bodyText = plainTextOf(item.body)
            }
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Inbox").font(.title2.weight(.semibold))
                    Spacer()
                    Button("New") { creating = true; newTitle = ""; newBody = "" }
                }
                if let item = items.first(where: { $0.id == selected }) {
                    TextField("Title", text: $title)
                        .font(.title3)
                    TextEditor(text: $bodyText)
                        .frame(minHeight: 200)
                    HStack {
                        Button("Save") { Task { await patch(item.id, jsonObject(("title", .string(title)), ("body", .string(bodyText)))) } }
                        Button(item.done ? "Reopen" : "Done") { Task { await setDone(item, done: !item.done) } }
                        Button("Delete", role: .destructive) { Task { await remove(item) } }
                    }
                } else {
                    ContentUnavailableView("No item selected", systemImage: "tray")
                }
                StatusBanner(message: error)
                Spacer()
            }
            .padding(16)
        }
        .task { await reload() }
        .sheet(isPresented: $creating) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Add to inbox").font(.headline)
                TextField("Title", text: $newTitle).textFieldStyle(.roundedBorder)
                TextEditor(text: $newBody).frame(height: 140)
                HStack {
                    Spacer()
                    Button("Cancel") { creating = false }
                    Button("Add to inbox") { Task { await create() } }.disabled(newTitle.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .padding(20)
            .frame(width: 420)
        }
    }

    private var filtered: [InboxItem] {
        items.filter { model.cockpitTag == nil || $0.tags.contains(model.cockpitTag ?? "") }
    }

    private func reload() async {
        items = (try? await model.client?.inbox()) ?? []
        if selected == nil { selected = filtered.first?.id }
        if let item = items.first(where: { $0.id == selected }) {
            title = item.title
            bodyText = plainTextOf(item.body)
        }
    }

    private func create() async {
        do {
            let item = try await model.client?.createInbox(title: newTitle, body: newBody, tags: model.cockpitTag.map { [$0] } ?? [])
            creating = false
            await reload()
            selected = item?.id
        } catch { self.error = errorText(error) }
    }

    private func patch(_ id: String, _ body: JSONValue) async {
        do { _ = try await model.client?.updateInbox(id, body: body); await reload() } catch { self.error = errorText(error) }
    }

    private func setDone(_ item: InboxItem, done: Bool) async {
        await patch(item.id, jsonObject(("done", .bool(done))))
    }

    private func remove(_ item: InboxItem) async {
        try? await model.client?.deleteInbox(item.id)
        selected = nil
        await reload()
    }
}

struct TasksView: View {
    @Environment(AppModel.self) private var model
    @State private var tasks: [CockpitTask] = []
    @State private var asList = false
    @State private var title = ""
    @State private var error: String?
    @State private var editing: CockpitTask?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                PageHeader(title: "Tasks", subtitle: "A board of what you are doing.")
                Spacer()
                Picker("View", selection: $asList) {
                    Text("Board").tag(false)
                    Text("List").tag(true)
                }
                .pickerStyle(.segmented)
                .frame(width: 180)
            }
            HStack {
                TextField("New task", text: $title).textFieldStyle(.roundedBorder)
                Button("Add") { Task { await add() } }.disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            if asList {
                Table(filtered) {
                    TableColumn("Task") { Text("T-\($0.number)  \($0.title)") }
                    TableColumn("Status") { Text(ControlPlaneCatalog.taskStatusLabels[$0.status] ?? $0.status) }
                    TableColumn("Priority") { Text($0.priority) }
                    TableColumn("Due") { Text($0.dueDate ?? "") }
                }
            } else {
                ScrollView(.horizontal) {
                    HStack(alignment: .top, spacing: 12) {
                        ForEach(ControlPlaneCatalog.taskStatuses, id: \.self) { status in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(ControlPlaneCatalog.taskStatusLabels[status] ?? status).font(.headline)
                                ForEach(filtered.filter { $0.status == status }) { task in
                                    Button(task.title) { editing = task }
                                        .buttonStyle(.plain)
                                        .padding(8)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 8))
                                }
                            }
                            .frame(width: 220, alignment: .topLeading)
                        }
                    }
                }
            }
            StatusBanner(message: error)
            Spacer()
        }
        .padding(20)
        .task { await reload() }
        .sheet(item: $editing) { task in
            TaskEditor(task: task) { await reload() }
        }
    }

    private var filtered: [CockpitTask] {
        tasks.filter { model.cockpitTag == nil || $0.tags.contains(model.cockpitTag ?? "") }
    }

    private func reload() async { tasks = (try? await model.client?.tasks()) ?? [] }

    private func add() async {
        do {
            _ = try await model.client?.createTask(jsonObject(
                ("title", .string(title)),
                ("tags", .array((model.cockpitTag.map { [$0] } ?? []).map { .string($0) }))
            ))
            title = ""
            await reload()
        } catch { self.error = errorText(error) }
    }
}

private struct TaskEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var task: CockpitTask
    var onSave: () async -> Void
    @State private var title = ""
    @State private var description = ""
    @State private var status = "todo"
    @State private var priority = "none"
    @State private var due = ""
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("T-\(task.number)").font(.caption).foregroundStyle(.secondary)
            TextField("Title", text: $title).font(.title3).textFieldStyle(.roundedBorder)
            Picker("Status", selection: $status) {
                ForEach(ControlPlaneCatalog.taskStatuses, id: \.self) { value in
                    Text(ControlPlaneCatalog.taskStatusLabels[value] ?? value).tag(value)
                }
            }
            Picker("Priority", selection: $priority) {
                ForEach(ControlPlaneCatalog.taskPriorities, id: \.self) { Text($0).tag($0) }
            }
            TextField("Due date", text: $due).textFieldStyle(.roundedBorder)
            TextEditor(text: $description).frame(minHeight: 120)
            StatusBanner(message: error)
            HStack {
                Button("Delete", role: .destructive) { Task { await remove() } }
                Spacer()
                Button("Cancel") { dismiss() }
                Button("Save") { Task { await save() } }
            }
        }
        .padding(20)
        .frame(width: 480)
        .onAppear {
            title = task.title
            description = plainTextOf(task.description)
            status = task.status
            priority = task.priority
            due = task.dueDate ?? ""
        }
    }

    private func save() async {
        do {
            _ = try await model.client?.updateTask(task.id, body: jsonObject(
                ("title", .string(title)),
                ("description", .string(description)),
                ("status", .string(status)),
                ("priority", .string(priority)),
                ("dueDate", due.isEmpty ? .null : .string(due))
            ))
            await onSave()
            dismiss()
        } catch { self.error = errorText(error) }
    }

    private func remove() async {
        try? await model.client?.deleteTask(task.id)
        await onSave()
        dismiss()
    }
}

struct NotesView: View {
    @Environment(AppModel.self) private var model
    var noteID: String?
    @State private var notes: [CockpitNote] = []
    @State private var selected: String?
    @State private var title = ""
    @State private var bodyText = ""
    @State private var error: String?

    var body: some View {
        HStack(spacing: 0) {
            List(filtered, selection: $selected) { note in
                Text(note.pinned ? "📌 \(note.title)" : note.title).tag(Optional(note.id))
            }
            .frame(minWidth: 220, maxWidth: 280)
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Notes").font(.title2.weight(.semibold))
                    Spacer()
                    Button("New note") { Task { await create() } }
                }
                if let note = notes.first(where: { $0.id == selected }) {
                    TextField("Title", text: $title).font(.title3)
                    TextEditor(text: $bodyText).frame(minHeight: 240)
                    HStack {
                        Button(note.pinned ? "Unpin" : "Pin") { Task { await patch(note.id, jsonObject(("pinned", .bool(!note.pinned)))) } }
                        Button("Save") { Task { await patch(note.id, jsonObject(("title", .string(title)), ("body", .string(bodyText)))) } }
                        Button("Delete", role: .destructive) { Task { await remove(note.id) } }
                    }
                } else {
                    ContentUnavailableView("No note open", systemImage: "note.text")
                }
                StatusBanner(message: error)
                Spacer()
            }
            .padding(16)
        }
        .task { await reload() }
        .onAppear { selected = noteID }
        .onChange(of: selected) { _, id in
            guard let note = notes.first(where: { $0.id == id }) else { return }
            title = note.title
            bodyText = plainTextOf(note.body)
        }
    }

    private var filtered: [CockpitNote] {
        notes.filter { model.cockpitTag == nil || $0.tags.contains(model.cockpitTag ?? "") }
    }

    private func reload() async {
        notes = (try? await model.client?.notes()) ?? []
        if selected == nil { selected = noteID ?? filtered.first?.id }
        if let note = notes.first(where: { $0.id == selected }) {
            title = note.title
            bodyText = plainTextOf(note.body)
        }
    }

    private func create() async {
        do {
            let note = try await model.client?.createNote(title: "Untitled", body: "", pinned: false, tags: model.cockpitTag.map { [$0] } ?? [])
            await reload()
            selected = note?.id
        } catch { self.error = errorText(error) }
    }

    private func patch(_ id: String, _ body: JSONValue) async {
        do { _ = try await model.client?.updateNote(id, body: body); await reload() } catch { self.error = errorText(error) }
    }

    private func remove(_ id: String) async {
        try? await model.client?.deleteNote(id)
        selected = nil
        await reload()
    }
}

struct TagsView: View {
    @Environment(AppModel.self) private var model
    @State private var tags: [CockpitTag] = []
    @State private var name = ""
    @State private var color = ""
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            PageHeader(title: "Tags", subtitle: "Add a tag before you use it, and pick its color.")
            HStack {
                TextField("Name", text: $name).textFieldStyle(.roundedBorder)
                TextField("#rrggbb", text: $color).textFieldStyle(.roundedBorder).frame(width: 120)
                Button("Add") { Task { await add() } }.disabled(name.isEmpty)
            }
            Table(tags) {
                TableColumn("Tag") { Text($0.name) }
                TableColumn("Color") { Text($0.color ?? "") }
                TableColumn("Inbox") { Text("\($0.inbox)") }
                TableColumn("Tasks") { Text("\($0.tasks)") }
                TableColumn("Notes") { Text("\($0.notes)") }
            }
            StatusBanner(message: error)
        }
        .padding(20)
        .task { await reload() }
    }

    private func reload() async { tags = (try? await model.client?.tags()) ?? [] }

    private func add() async {
        do {
            _ = try await model.client?.createTag(name: name, color: color.isEmpty ? nil : color)
            name = ""
            color = ""
            await reload()
        } catch { self.error = errorText(error) }
    }
}
