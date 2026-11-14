import AvenDesktopCore
import AppKit
import SwiftUI

struct SettingsSidebar: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        List(selection: model.destinationSelection) {
            ForEach(ControlPlaneCatalog.settingsGroups(isOwner: model.config?.isOwner == true), id: \.0) { group, entries in
                Section(group) {
                    ForEach(entries) { entry in
                        Text(entry.label).tag(Destination.settings(entry.id))
                    }
                }
            }
        }
        .listStyle(.sidebar)
    }
}

struct SettingsDetail: View {
    @Environment(AppModel.self) private var model
    var id: String

    var body: some View {
        let entry = ControlPlaneCatalog.settings.first { $0.id == id }
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                PageHeader(title: entry?.label ?? "Settings", subtitle: entry?.summary ?? "")
                switch id {
                case "general": GeneralSettings()
                case "profile": ProfileSettings()
                case "providers": ProvidersSettings()
                case "claude": ClaudeSettings()
                case "bots": BotModelSettings()
                case "skills": SkillsSettings()
                case "mcp": McpSettings()
                case "mcp-access": McpAccessSettings()
                case "webhooks": WebhooksSettings()
                case "memory": MemorySettings()
                case "environment-variables": VariablesSettings(scope: "personal", title: "Your variables")
                case "members": MembersSettings()
                case "github": GithubSettings()
                case "runtimes": RuntimesSettings()
                case "workspace-variables": VariablesSettings(scope: "workspace", title: "Workspace variables")
                case "decision-model": DecisionSettings()
                case "platform": PlatformSettings()
                case "people": PeopleSettings()
                case "announcements": AnnouncementsSettings()
                default:
                    Text("This page is not in the desktop app yet.")
                }
            }
            .padding(24)
            .frame(maxWidth: 860, alignment: .leading)
        }
    }
}

private struct GeneralSettings: View {
    @Environment(AppModel.self) private var model
    @Environment(DeviceSettings.self) private var device
    @State private var name = ""
    @State private var timezone = ""
    @State private var followUps = false
    @State private var followUpProvider: String?
    @State private var followUpModel: String?
    @State private var error: String?

    var body: some View {
        @Bindable var device = device
        VStack(alignment: .leading, spacing: 16) {
            Text("Account").font(.headline)
            Text(model.account?.email ?? "").foregroundStyle(.secondary)
            TextField("Name", text: $name).textFieldStyle(.roundedBorder)
            Button("Save name") { Task { await saveName() } }
            Text("Appearance").font(.headline)
            Text("Only affects this Mac.").font(.caption).foregroundStyle(.secondary)
            Picker("Mode", selection: $device.mode) {
                ForEach(AppearanceMode.allCases) { mode in Text(mode.label).tag(mode) }
            }
            Picker("Interface text size", selection: $device.textSize) {
                ForEach(InterfaceTextSize.allCases) { size in Text(size.label).tag(size) }
            }
            Text("Theme palettes, interface fonts and separate thread text sizes from the web app are not in this version.")
                .font(.caption).foregroundStyle(.secondary)
            Text("Sound").font(.headline)
            Toggle("Sounds", isOn: $device.sounds)
            Text("Time").font(.headline)
            TextField("Timezone", text: $timezone).textFieldStyle(.roundedBorder)
            Toggle("Follow-up suggestions", isOn: $followUps)
            Button("Save preferences") { Task { await savePreferences() } }
            StatusBanner(message: error)
        }
        .task {
            name = model.account?.name ?? ""
            if let preferences = try? await model.client?.preferences() {
                timezone = preferences.timezone ?? preferences.defaultTimezone
                followUps = preferences.followUps.enabled
                followUpProvider = preferences.followUps.providerId
                followUpModel = preferences.followUps.modelId
            }
        }
    }

    private func saveName() async {
        do { try await model.client?.updateName(name); await model.refresh() } catch { self.error = errorText(error) }
    }

    private func savePreferences() async {
        do {
            try await model.client?.setTimezone(timezone)
            try await model.client?.setFollowUps(
                enabled: followUps, providerID: followUpProvider, modelID: followUpModel)
        } catch { self.error = errorText(error) }
    }
}

private struct ProfileSettings: View {
    @Environment(AppModel.self) private var model
    @State private var stats: ProfileStats?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(model.account?.name ?? "").font(.title3)
            if let stats {
                HStack(spacing: 24) {
                    stat("Threads", "\(stats.threads)")
                    stat("Current streak", "\(stats.currentStreakDays)")
                    stat("Longest streak", "\(stats.longestStreakDays)")
                    stat("Tokens", "\(stats.tokens)")
                }
                Text("Longest thread \(Int(stats.longestThreadMs / 1000))s").font(.caption).foregroundStyle(.secondary)
                LazyVGrid(columns: Array(repeating: GridItem(.fixed(10), spacing: 3), count: 24), spacing: 3) {
                    ForEach(stats.days.suffix(168)) { day in
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color.accentColor.opacity(day.tokens == 0 ? 0.08 : min(1, 0.25 + Double(day.tokens) / 50_000)))
                            .frame(width: 10, height: 10)
                            .help("\(day.date): \(day.tokens)")
                    }
                }
            } else {
                ProgressView()
            }
        }
        .task { stats = try? await model.client?.profileStats() }
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.title3.weight(.semibold))
        }
    }
}

private struct ProvidersSettings: View {
    @Environment(AppModel.self) private var model
    @State private var providers: [Provider] = []
    @State private var kind = "openai"
    @State private var name = ""
    @State private var apiKey = ""
    @State private var baseURL = ""
    @State private var modelID = ""
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(providers) { provider in
                HStack {
                    VStack(alignment: .leading) {
                        Text(provider.name).font(.headline)
                        Text("\(provider.kind) \(provider.keyHint ?? "")").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if provider.isDefault { Text("Default").font(.caption) }
                    else {
                        Button("Make default") { Task { await makeDefault(provider) } }
                    }
                    Button("Remove", role: .destructive) { Task { await remove(provider) } }
                }
                .padding(8)
                .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 8))
            }
            Text("Add a provider").font(.headline)
            Picker("Kind", selection: $kind) {
                ForEach(["openai", "anthropic", "gemini", "bedrock", "vertex", "azure", "openai-compatible"], id: \.self) {
                    Text($0).tag($0)
                }
            }
            TextField("Name", text: $name).textFieldStyle(.roundedBorder)
            SecureField("API key", text: $apiKey).textFieldStyle(.roundedBorder)
            TextField("Base URL", text: $baseURL).textFieldStyle(.roundedBorder)
            TextField("Model", text: $modelID).textFieldStyle(.roundedBorder)
            Button("Add provider") { Task { await add() } }.disabled(name.isEmpty)
            StatusBanner(message: error)
        }
        .task { await reload() }
    }

    private func reload() async {
        providers = (try? await model.client?.providers()) ?? []
        await model.refresh()
    }

    private func add() async {
        do {
            _ = try await model.client?.createProvider(jsonObject(
                ("kind", .string(kind)),
                ("name", .string(name)),
                ("apiKey", apiKey.isEmpty ? nil : .string(apiKey)),
                ("baseUrl", baseURL.isEmpty ? nil : .string(baseURL)),
                ("modelId", modelID.isEmpty ? nil : .string(modelID))
            ))
            name = ""; apiKey = ""; baseURL = ""; modelID = ""
            await reload()
        } catch { self.error = errorText(error) }
    }

    private func makeDefault(_ provider: Provider) async {
        do { _ = try await model.client?.updateProvider(provider.id, body: jsonObject(("isDefault", .bool(true)))); await reload() }
        catch { self.error = errorText(error) }
    }

    private func remove(_ provider: Provider) async {
        do { try await model.client?.deleteProvider(provider.id); await reload() } catch { self.error = errorText(error) }
    }
}

private struct ClaudeSettings: View {
    @Environment(AppModel.self) private var model
    @State private var setup: ClaudeSetup?
    @State private var token = ""
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(setup?.configured == true ? "A token is saved \(setup?.hint ?? "")" : "No Claude setup token yet.")
            SecureField("sk-ant-oat01-…", text: $token).textFieldStyle(.roundedBorder)
            HStack {
                Button("Save") { Task { await save() } }.disabled(token.isEmpty)
                Button("Remove", role: .destructive) { Task { await remove() } }
            }
            StatusBanner(message: error)
        }
        .task { setup = try? await model.client?.claudeSetup() }
    }

    private func save() async {
        do { try await model.client?.saveClaudeSetup(token); token = ""; setup = try await model.client?.claudeSetup() }
        catch { self.error = errorText(error) }
    }

    private func remove() async {
        do { try await model.client?.deleteClaudeSetup(); setup = try await model.client?.claudeSetup() }
        catch { self.error = errorText(error) }
    }
}

private struct BotModelSettings: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(model.bots) { bot in
                BotCompactRow(bot: bot)
            }
        }
    }
}

private struct BotCompactRow: View {
    @Environment(AppModel.self) private var model
    var bot: Bot
    @State private var compact = ""
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(bot.name).font(.headline)
            Text(bot.modelId ?? "Uses your default provider").font(.caption).foregroundStyle(.secondary)
            TextField("Summarize after this many tokens", text: $compact)
                .textFieldStyle(.roundedBorder)
            Button("Save \(bot.name)") { Task { await save() } }
            StatusBanner(message: error)
        }
        .padding(8)
        .onAppear { compact = bot.compactAfterTokens.map(String.init) ?? "" }
    }

    private func save() async {
        let trimmed = compact.trimmingCharacters(in: .whitespaces)
        let tokens = Int(trimmed)
        if !trimmed.isEmpty && tokens == nil {
            error = "Enter a whole number."
            return
        }
        do {
            _ = try await model.client?.updateBot(
                bot.id, body: jsonObject(("compactAfterTokens", tokens.map { .int($0) } ?? .null)))
            await model.refresh()
        } catch { self.error = errorText(error) }
    }
}

private struct SkillsSettings: View {
    @Environment(AppModel.self) private var model
    @State private var skills: [Skill] = []
    @State private var builtin: [BuiltinSkill] = []
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button("Upload a skill folder") { Task { await upload() } }
            ForEach(skills) { skill in
                HStack {
                    VStack(alignment: .leading) {
                        Text(skill.name)
                        Text(skill.description).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                    }
                    Spacer()
                    Toggle("Enabled", isOn: Binding(
                        get: { skill.enabled },
                        set: { value in Task { await set(skill, value) } }
                    ))
                    .labelsHidden()
                    Button("Remove", role: .destructive) { Task { await remove(skill) } }
                }
            }
            Text("Built in").font(.headline).padding(.top, 8)
            ForEach(builtin) { skill in
                VStack(alignment: .leading) {
                    Text(skill.name)
                    Text(skill.description).font(.caption).foregroundStyle(.secondary)
                }
            }
            StatusBanner(message: error)
        }
        .task { await reload() }
    }

    private func reload() async {
        skills = (try? await model.client?.skills()) ?? []
        builtin = (try? await model.client?.builtinSkills()) ?? []
    }

    private func upload() async {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            let files = try skillPayload(url)
            _ = try await model.client?.uploadSkill(files: files)
            await reload()
        } catch { self.error = errorText(error) }
    }

    private func set(_ skill: Skill, _ enabled: Bool) async {
        do { try await model.client?.setSkill(skill.id, enabled: enabled); await reload() } catch { self.error = errorText(error) }
    }

    private func remove(_ skill: Skill) async {
        do { try await model.client?.deleteSkill(skill.id); await reload() } catch { self.error = errorText(error) }
    }
}

private func skillPayload(_ directory: URL) throws -> [(String, String)] {
    let root = directory.path
    guard let enumerator = FileManager.default.enumerator(
        at: directory, includingPropertiesForKeys: [.isRegularFileKey], options: [.skipsHiddenFiles]
    ) else {
        return []
    }
    var files: [(String, String)] = []
    for case let url as URL in enumerator {
        if url.lastPathComponent.hasPrefix(".") { continue }
        let values = try url.resourceValues(forKeys: [.isRegularFileKey])
        guard values.isRegularFile == true else { continue }
        let data = try Data(contentsOf: url)
        guard data.count <= 512_000 else { continue }
        var relative = url.path
        if relative.hasPrefix(root) { relative.removeFirst(root.count) }
        if relative.hasPrefix("/") { relative.removeFirst() }
        files.append((relative, data.base64EncodedString()))
        if files.count >= 40 { break }
    }
    if files.isEmpty { throw DesktopError("That folder has no files to upload.") }
    return files
}

private struct McpSettings: View {
    @Environment(AppModel.self) private var model
    @State private var servers: [McpServer] = []
    @State private var name = ""
    @State private var url = ""
    @State private var target = "all"
    @State private var header = ""
    @State private var headerValue = ""
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(servers) { server in
                HStack {
                    VStack(alignment: .leading) {
                        Text(server.name)
                        Text(server.url).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        if let last = server.lastError { Text(last).font(.caption).foregroundStyle(.red) }
                    }
                    Spacer()
                    Text(server.target).font(.caption)
                    Toggle("On", isOn: Binding(
                        get: { server.enabled },
                        set: { value in Task { await toggle(server, value) } }
                    )).labelsHidden()
                    Button("Remove", role: .destructive) { Task { await remove(server) } }
                }
            }
            TextField("Name", text: $name).textFieldStyle(.roundedBorder)
            TextField("https://", text: $url).textFieldStyle(.roundedBorder)
            Picker("Used by", selection: $target) {
                Text("Bots and threads").tag("all")
                Text("Bots").tag("bots")
                Text("Threads").tag("threads")
            }
            TextField("Header name", text: $header).textFieldStyle(.roundedBorder)
            SecureField("Header value", text: $headerValue).textFieldStyle(.roundedBorder)
            Button("Add server") { Task { await add() } }.disabled(name.isEmpty || url.isEmpty)
            StatusBanner(message: error)
        }
        .task { await reload() }
    }

    private func reload() async { servers = (try? await model.client?.mcpServers()) ?? [] }
    private func toggle(_ server: McpServer, _ enabled: Bool) async {
        do { try await model.client?.setMcp(server.id, enabled: enabled); await reload() } catch { self.error = errorText(error) }
    }
    private func remove(_ server: McpServer) async {
        do { try await model.client?.deleteMcp(server.id); await reload() } catch { self.error = errorText(error) }
    }
    private func add() async {
        var headers: [(String, String)] = []
        if !header.isEmpty { headers.append((header, headerValue)) }
        do {
            _ = try await model.client?.createMcp(name: name, url: url, target: target, headers: headers)
            name = ""; url = ""; header = ""; headerValue = ""
            await reload()
        } catch { self.error = errorText(error) }
    }
}

private struct McpAccessSettings: View {
    @Environment(AppModel.self) private var model
    @State private var tokens: [AccessToken] = []
    @State private var name = ""
    @State private var read = true
    @State private var change = false
    @State private var destructive = false
    @State private var created: String?
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(tokens) { token in
                HStack {
                    VStack(alignment: .leading) {
                        Text(token.name)
                        Text("\(token.hint) · \(token.permissions.joined(separator: ", "))").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Remove", role: .destructive) { Task { await remove(token) } }
                }
            }
            TextField("Token name", text: $name).textFieldStyle(.roundedBorder)
            Toggle("Read", isOn: $read)
            Toggle("Change", isOn: $change)
            Toggle("Destructive", isOn: $destructive)
            Button("Create token") { Task { await create() } }.disabled(name.isEmpty)
            if let created {
                Text("Copy this token now. It is not shown again.").font(.caption)
                Text(created).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
            }
            StatusBanner(message: error)
        }
        .task { await reload() }
    }

    private func reload() async { tokens = (try? await model.client?.accessTokens()) ?? [] }
    private func create() async {
        var permissions: [String] = []
        if read { permissions.append("read") }
        if change { permissions.append("change") }
        if destructive { permissions.append("destructive") }
        do {
            let made = try await model.client?.createAccessToken(name: name, permissions: permissions)
            created = made?.token
            name = ""
            await reload()
        } catch { self.error = errorText(error) }
    }
    private func remove(_ token: AccessToken) async {
        do { try await model.client?.deleteAccessToken(token.id); await reload() } catch { self.error = errorText(error) }
    }
}

private struct WebhooksSettings: View {
    @Environment(AppModel.self) private var model
    @State private var hooks: [Webhook] = []
    @State private var name = ""
    @State private var created: CreatedWebhook?
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(hooks) { hook in
                HStack {
                    VStack(alignment: .leading) {
                        Text(hook.name)
                        Text(hook.path).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Toggle("Enabled", isOn: Binding(
                        get: { hook.enabled },
                        set: { value in Task { await toggle(hook, value) } }
                    )).labelsHidden()
                    Button("Remove", role: .destructive) { Task { await remove(hook) } }
                }
            }
            TextField("Name", text: $name).textFieldStyle(.roundedBorder)
            Button("Add webhook") { Task { await add() } }.disabled(name.isEmpty)
            if let created {
                Text("Token").font(.caption)
                Text(created.token).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                Text(created.urlPath).font(.caption).textSelection(.enabled)
            }
            StatusBanner(message: error)
        }
        .task { await reload() }
    }

    private func reload() async { hooks = (try? await model.client?.webhooks()) ?? [] }
    private func add() async {
        do { created = try await model.client?.createWebhook(name: name); name = ""; await reload() }
        catch { self.error = errorText(error) }
    }
    private func toggle(_ hook: Webhook, _ enabled: Bool) async {
        do { try await model.client?.setWebhook(hook.id, enabled: enabled); await reload() } catch { self.error = errorText(error) }
    }
    private func remove(_ hook: Webhook) async {
        do { try await model.client?.deleteWebhook(hook.id); await reload() } catch { self.error = errorText(error) }
    }
}

private struct MemorySettings: View {
    @Environment(AppModel.self) private var model
    @State private var notes: [MemoryNote] = []
    @State private var history: [MemoryEvent] = []
    @State private var scope = "personal"
    @State private var name = ""
    @State private var bodyText = ""
    @State private var showHistory = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker("Folder", selection: $scope) {
                Text("Personal").tag("personal")
                Text("Project").tag("project")
                Text("Bot").tag("bot")
            }
            .pickerStyle(.segmented)
            ForEach(notes.filter { $0.scope == scope }) { note in
                VStack(alignment: .leading) {
                    Text(note.name).font(.headline)
                    Text(note.body).font(.callout).lineLimit(4)
                    Button("Delete", role: .destructive) { Task { await remove(note) } }
                }
            }
            TextField("Name, such as staging.md", text: $name).textFieldStyle(.roundedBorder)
            TextEditor(text: $bodyText).frame(height: 100)
            Button("Add note") { Task { await add() } }.disabled(name.isEmpty)
            Button(showHistory ? "Hide history" : "History") { showHistory.toggle() }
            if showHistory {
                ForEach(history.prefix(30)) { event in
                    Text("\(event.action) \(event.name) · \(event.source)").font(.caption)
                }
            }
            StatusBanner(message: error)
        }
        .task { await reload() }
    }

    private func reload() async {
        notes = (try? await model.client?.memory()) ?? []
        history = (try? await model.client?.memoryHistory()) ?? []
    }

    private func add() async {
        let projectID = scope == "project" ? model.projects.first?.id : nil
        let botID = scope == "bot" ? model.mainBot?.id : nil
        do {
            _ = try await model.client?.createMemory(scope: scope, name: name, body: bodyText, projectID: projectID, botID: botID)
            name = ""; bodyText = ""
            await reload()
        } catch { self.error = errorText(error) }
    }

    private func remove(_ note: MemoryNote) async {
        do { try await model.client?.deleteMemory(note.id); await reload() } catch { self.error = errorText(error) }
    }
}

struct VariablesSettings: View {
    @Environment(AppModel.self) private var model
    var scope: String
    var title: String
    @State private var variables: [Variable] = []
    @State private var history: [VariableEvent] = []
    @State private var name = ""
    @State private var value = ""
    @State private var secret = false
    @State private var showHistory = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline)
            ForEach(variables) { variable in
                HStack {
                    Text(variable.name).font(.body.monospaced())
                    Spacer()
                    Text(variable.secret ? (variable.valueHint ?? "secret") : (variable.value ?? "")).foregroundStyle(.secondary)
                    Button("Remove", role: .destructive) { Task { await remove(variable) } }
                }
            }
            TextField("NAME", text: $name).textFieldStyle(.roundedBorder)
            SecureField("Value", text: $value).textFieldStyle(.roundedBorder)
            Toggle("Secret", isOn: $secret)
            Button("Save variable") { Task { await save() } }.disabled(name.isEmpty)
            Button(showHistory ? "Hide history" : "History") { showHistory.toggle() }
            if showHistory {
                ForEach(history.prefix(40)) { event in
                    Text("\(event.action) \(event.name) · \(event.actor ?? event.source)").font(.caption)
                }
            }
            StatusBanner(message: error)
        }
        .task { await reload() }
    }

    private func reload() async {
        variables = (try? await model.client?.variables(scope: scope)) ?? []
        history = (try? await model.client?.variableHistory(scope: scope)) ?? []
    }

    private func save() async {
        do {
            try await model.client?.setVariable(scope: scope, name: name, value: value, secret: secret)
            name = ""; value = ""; secret = false
            await reload()
        } catch { self.error = errorText(error) }
    }

    private func remove(_ variable: Variable) async {
        do { try await model.client?.deleteVariable(scope: scope, name: variable.name); await reload() }
        catch { self.error = errorText(error) }
    }
}

private struct MembersSettings: View {
    @Environment(AppModel.self) private var model
    @State private var organization: FullOrganization?
    @State private var email = ""
    @State private var role = "member"
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let organization {
                Table(organization.members) {
                    TableColumn("Name") { Text($0.name) }
                    TableColumn("Email") { Text($0.email) }
                    TableColumn("Role") { Text($0.role) }
                    TableColumn("Status") { Text($0.status) }
                    TableColumn("") { member in
                        if member.email != model.account?.email {
                            Button("Remove") { Task { await remove(member.id) } }
                        }
                    }
                }
                if !organization.invitations.isEmpty {
                    Text("Pending").font(.headline)
                    ForEach(organization.invitations) { invitation in
                        HStack {
                            Text(invitation.email ?? invitation.id)
                            Spacer()
                            Text(invitation.role).foregroundStyle(.secondary)
                            Button("Cancel") { Task { await cancel(invitation.id) } }
                        }
                    }
                }
            }
            TextField("Email", text: $email).textFieldStyle(.roundedBorder)
            Picker("Role", selection: $role) {
                Text("Member").tag("member")
                Text("Admin").tag("admin")
            }
            Button("Invite") { Task { await invite() } }.disabled(email.isEmpty)
            StatusBanner(message: error)
        }
        .task { await reload() }
    }

    private func reload() async { organization = try? await model.client?.fullOrganization() }
    private func invite() async {
        do {
            _ = try await model.client?.invite(email: email, role: role)
            email = ""
            await reload()
        } catch { self.error = errorText(error) }
    }
    private func cancel(_ id: String) async {
        do { try await model.client?.cancelInvitation(id); await reload() } catch { self.error = errorText(error) }
    }
    private func remove(_ id: String) async {
        do { try await model.client?.removeMember(id); await reload() } catch { self.error = errorText(error) }
    }
}

private struct GithubSettings: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @State private var status: GithubStatus?
    @State private var account: GithubAccount?
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(status?.configured == true ? "A GitHub App is configured\(status?.own == true ? " for this workspace" : "")." : "GitHub is not configured.")
            if let login = account?.login { Text("Connected as \(login)") }
            else { Text("Your GitHub account is not connected.").foregroundStyle(.secondary) }
            if let url = status?.installUrl, let link = URL(string: url) {
                Button("Install or connect") { openURL(link) }
            }
            Text("Creating a GitHub App with the manifest flow stays in the browser. This app opens the install link the server returns.")
                .font(.caption).foregroundStyle(.secondary)
            StatusBanner(message: error)
        }
        .task {
            do {
                status = try await model.client?.githubStatus()
                account = try await model.client?.githubAccount()
            } catch { self.error = errorText(error) }
        }
    }
}

private struct RuntimesSettings: View {
    @Environment(AppModel.self) private var model
    @State private var name = ""
    @State private var token: String?
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(model.runtimes) { runtime in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Circle().fill(runtime.online ? Color.green : Color.secondary).frame(width: 8, height: 8)
                        Text(runtime.name).font(.headline)
                        if runtime.isControlPlane { Text("Built in").font(.caption).foregroundStyle(.secondary) }
                        Spacer()
                        if runtime.shared { Text("Shared").font(.caption) }
                    }
                    Text(runtime.directories.joined(separator: ", ")).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                    if let stats = runtime.stats {
                        Text(load(stats)).font(.caption2).foregroundStyle(.secondary)
                    }
                    HStack {
                        if runtime.canUpdate, runtime.updateTo != nil {
                            Button("Update") { Task { await update(runtime) } }
                        }
                        Picker("GitHub", selection: Binding(
                            get: { runtime.githubMode },
                            set: { mode in Task { await setMode(runtime, mode) } }
                        )) {
                            Text("Machine").tag("machine")
                            Text("Person").tag("person")
                        }
                        .frame(width: 160)
                        if !runtime.isControlPlane {
                            Button("Revoke", role: .destructive) { Task { await revoke(runtime) } }
                        }
                    }
                }
                .padding(8)
                .background(.quaternary.opacity(0.35), in: RoundedRectangle(cornerRadius: 8))
            }
            TextField("New runtime name", text: $name).textFieldStyle(.roundedBorder)
            Button("Create runtime") { Task { await create() } }.disabled(name.isEmpty)
            if let token {
                Text("Copy this token now. It is shown once.").font(.caption)
                Text(token).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
            }
            StatusBanner(message: error)
        }
    }

    private func load(_ stats: RuntimeStats) -> String {
        let cpu = stats.cpuPercent.map { "CPU \(Int($0))%" } ?? "CPU —"
        let memory = meterPercent(used: stats.memoryUsedBytes, total: stats.memoryTotalBytes).map { "Memory \(Int($0))%" } ?? ""
        let disk = meterPercent(used: stats.diskUsedBytes, total: stats.diskTotalBytes).map { "Disk \(Int($0))%" } ?? ""
        return [cpu, memory, disk].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private func create() async {
        do {
            let created = try await model.client?.createRuntime(name: name)
            token = created?.token
            name = ""
            await model.refresh()
        } catch { self.error = errorText(error) }
    }

    private func update(_ runtime: Runtime) async {
        do { try await model.client?.updateRuntime(runtime.id); await model.refresh() } catch { self.error = errorText(error) }
    }

    private func setMode(_ runtime: Runtime, _ mode: String) async {
        do { try await model.client?.setGithubMode(runtime.id, mode: mode); await model.refresh() } catch { self.error = errorText(error) }
    }

    private func revoke(_ runtime: Runtime) async {
        do { try await model.client?.revokeRuntime(runtime.id); await model.refresh() } catch { self.error = errorText(error) }
    }
}

private struct DecisionSettings: View {
    @Environment(AppModel.self) private var model
    @State private var current: DecisionModel?
    @State private var kind = "jev"
    @State private var modelID = ""
    @State private var apiKey = ""
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let current {
                Text("\(current.kind) · \(current.modelId) · \(current.source)").font(.callout)
                Text(current.keyHint).font(.caption).foregroundStyle(.secondary)
            } else {
                Text("This workspace has no decision model of its own.").foregroundStyle(.secondary)
            }
            Picker("Kind", selection: $kind) {
                Text("Jev").tag("jev")
                Text("Jev through OpenRouter").tag("jev-openrouter")
            }
            TextField("Model", text: $modelID).textFieldStyle(.roundedBorder)
            SecureField("API key", text: $apiKey).textFieldStyle(.roundedBorder)
            HStack {
                Button("Save") { Task { await save() } }
                Button("Remove", role: .destructive) { Task { await remove() } }
            }
            StatusBanner(message: error)
        }
        .task { current = try? await model.client?.decisionModel().decisionModel }
    }

    private func save() async {
        do {
            try await model.client?.saveDecisionModel(kind: kind, modelID: modelID, apiKey: apiKey)
            current = try await model.client?.decisionModel().decisionModel
            apiKey = ""
        } catch { self.error = errorText(error) }
    }

    private func remove() async {
        do { try await model.client?.deleteDecisionModel(); current = nil } catch { self.error = errorText(error) }
    }
}

private struct PlatformSettings: View {
    @Environment(AppModel.self) private var model
    @State private var registration = false
    @State private var models: ServerModels?
    @State private var smallKind = "anthropic"
    @State private var smallModel = ""
    @State private var smallKey = ""
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Toggle("Registration", isOn: $registration)
            Button("Save registration") { Task { await saveRegistration(registration) } }
            if let decision = models?.decision {
                Text("Decision model \(decision.kind) \(decision.modelId) (\(decision.source))").font(.callout)
            }
            if let small = models?.small {
                Text("Small model \(small.kind) \(small.modelId) (\(small.source))").font(.callout)
            }
            Picker("Small model kind", selection: $smallKind) {
                Text("Anthropic").tag("anthropic")
                Text("OpenAI").tag("openai")
                Text("Gemini").tag("gemini")
            }
            TextField("Model", text: $smallModel).textFieldStyle(.roundedBorder)
            SecureField("API key", text: $smallKey).textFieldStyle(.roundedBorder)
            Button("Save small model") { Task { await saveSmall() } }.disabled(smallModel.isEmpty)
            StatusBanner(message: error)
        }
        .task {
            registration = model.config?.registrationEnabled ?? false
            models = try? await model.client?.serverModels()
        }
    }

    private func saveRegistration(_ value: Bool) async {
        do { try await model.client?.setRegistration(value); await model.refresh() } catch { self.error = errorText(error) }
    }

    private func saveSmall() async {
        do {
            try await model.client?.saveServerSmall(kind: smallKind, modelID: smallModel, apiKey: smallKey)
            models = try await model.client?.serverModels()
            smallKey = ""
        } catch { self.error = errorText(error) }
    }
}

private struct PeopleSettings: View {
    @Environment(AppModel.self) private var model
    @State private var people: [PlatformPerson] = []
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Table(people) {
                TableColumn("Name") { Text($0.owner ? "\($0.name) · owner" : $0.name) }
                TableColumn("Email") { Text($0.email) }
                TableColumn("Workspaces") { Text($0.workspaces.map(\.name).joined(separator: ", ")) }
                TableColumn("") { person in
                    if !person.owner {
                        Button("Remove") { Task { await remove(person.id) } }
                    }
                }
            }
            StatusBanner(message: error)
        }
        .task { await reload() }
    }

    private func reload() async {
        do { people = try await model.client?.people() ?? [] } catch { self.error = errorText(error) }
    }

    private func remove(_ id: String) async {
        do { try await model.client?.removePerson(id); await reload() } catch { self.error = errorText(error) }
    }
}

private struct AnnouncementsSettings: View {
    @Environment(AppModel.self) private var model
    @State private var items: [Announcement] = []
    @State private var title = ""
    @State private var summary = ""
    @State private var details = ""
    @State private var template = "waves"
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(items) { item in
                HStack {
                    VStack(alignment: .leading) {
                        Text(item.title).font(.headline)
                        Text(item.summary).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(item.active ? "Active" : "Off").font(.caption)
                    Button(item.active ? "Hide" : "Show") { Task { await toggle(item) } }
                    Button("Delete", role: .destructive) { Task { await remove(item) } }
                }
            }
            TextField("Title", text: $title).textFieldStyle(.roundedBorder)
            TextField("Summary", text: $summary).textFieldStyle(.roundedBorder)
            TextField("Details", text: $details, axis: .vertical).lineLimit(3...6)
            Picker("Template", selection: $template) {
                ForEach(["waves", "violet", "pink", "amber"], id: \.self) { Text($0).tag($0) }
            }
            Button("Publish") { Task { await create() } }.disabled(title.isEmpty || summary.isEmpty)
            StatusBanner(message: error)
        }
        .task { await reload() }
    }

    private func reload() async { items = (try? await model.client?.announcements()) ?? [] }
    private func create() async {
        do {
            _ = try await model.client?.createAnnouncement(jsonObject(
                ("title", .string(title)),
                ("summary", .string(summary)),
                ("details", .string(details)),
                ("template", .string(template)),
                ("active", .bool(true))
            ))
            title = ""; summary = ""; details = ""
            await reload()
        } catch { self.error = errorText(error) }
    }
    private func toggle(_ item: Announcement) async {
        do { try await model.client?.setAnnouncementActive(item.id, active: !item.active); await reload() }
        catch { self.error = errorText(error) }
    }
    private func remove(_ item: Announcement) async {
        do { try await model.client?.deleteAnnouncement(item.id); await reload() } catch { self.error = errorText(error) }
    }
}
