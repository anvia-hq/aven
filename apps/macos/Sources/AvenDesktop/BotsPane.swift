import AvenDesktopCore
import SwiftUI

struct BotSidebar: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        List(selection: model.destinationSelection) {
            if let main = model.mainBot {
                Label(main.name, systemImage: "star").tag(Destination.bot(main.id))
            }
            ForEach(model.bots.filter { !$0.isMain }) { bot in
                VStack(alignment: .leading, spacing: 2) {
                    Text(bot.name).lineLimit(1)
                    Text(bot.description.isEmpty ? "No messages yet" : bot.description)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .tag(Destination.bot(bot.id))
            }
        }
        .listStyle(.sidebar)
    }
}

struct BotChatView: View {
    @Environment(AppModel.self) private var model
    var id: String
    @State private var chat = BotChat()
    @State private var draft = ""
    @State private var error: String?
    @State private var editing = false

    var body: some View {
        VStack(spacing: 0) {
            if id.isEmpty {
                ContentUnavailableView("No bot yet", systemImage: "face.smiling", description: Text("Opening bots creates your main bot."))
                    .task { await model.refresh() }
            } else {
                HStack {
                    VStack(alignment: .leading) {
                        Text(bot?.name ?? "Bot").font(.headline)
                        Text(bot?.description ?? "").font(.caption).foregroundStyle(.secondary).lineLimit(2)
                    }
                    Spacer()
                    Button("Settings") { editing = true }
                    if bot?.isMain == false {
                        Button("Delete", role: .destructive) { Task { await remove() } }
                    }
                }
                .padding(12)
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 10) {
                        ForEach(chat.messages) { message in
                            VStack(alignment: message.role == "user" ? .trailing : .leading, spacing: 4) {
                                if let peer = message.peerName {
                                    Text(peer).font(.caption2).foregroundStyle(.secondary)
                                }
                                Text(LocalizedStringKey(message.text))
                                    .textSelection(.enabled)
                                    .padding(10)
                                    .background(message.role == "user" ? Color.accentColor.opacity(0.15) : Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 12))
                                if !message.reactions.isEmpty {
                                    Text(message.reactions.joined(separator: " ")).font(.caption)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: message.role == "user" ? .trailing : .leading)
                        }
                        if chat.typing {
                            Text(chat.activity ?? "Typing…").font(.caption).foregroundStyle(.secondary)
                        }
                        if let failure = chat.error ?? error {
                            Text(failure).foregroundStyle(.red).font(.callout)
                        }
                    }
                    .padding(16)
                }
                HStack {
                    TextField("Message \(bot?.name ?? "the bot")", text: $draft, axis: .vertical)
                        .lineLimit(1...5)
                    Button("Send") { Task { await send() } }
                        .keyboardShortcut(.defaultAction)
                        .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding(12)
            }
        }
        .task(id: id) { await follow() }
        .sheet(isPresented: $editing) {
            if let bot { BotEditor(bot: bot) }
        }
    }

    private var bot: Bot? { model.bots.first { $0.id == id } }

    private func follow() async {
        guard !id.isEmpty, let api = model.client else { return }
        do {
            for try await payload in api.serverSentPayloads("/bots/\(id)/events") {
                guard let event = try? JSONDecoder().decode(BotStreamEvent.self, from: Data(payload.utf8)) else { continue }
                chat.apply(event)
            }
        } catch {
            if Task.isCancelled { return }
            self.error = errorText(error)
        }
    }

    private func send() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        draft = ""
        do { try await model.client?.sendBot(id: id, text: text) } catch {
            draft = text
            self.error = errorText(error)
        }
    }

    private func remove() async {
        try? await model.client?.deleteBot(id)
        await model.refresh()
        model.destination = .bot(model.mainBot?.id ?? "")
    }
}

private struct BotEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var bot: Bot
    @State private var name = ""
    @State private var instruction = ""
    @State private var description = ""
    @State private var providerID = ""
    @State private var modelID = ""
    @State private var effort = ""
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(bot.name).font(.title3.weight(.semibold))
            TextField("Name", text: $name).textFieldStyle(.roundedBorder)
            TextField("Description", text: $description).textFieldStyle(.roundedBorder)
            Text("Instruction").font(.headline)
            TextEditor(text: $instruction).frame(minHeight: 120)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(.quaternary))
            Picker("Provider", selection: $providerID) {
                Text("Default").tag("")
                ForEach(model.providers) { provider in
                    Text(provider.name).tag(provider.id)
                }
            }
            TextField("Model", text: $modelID).textFieldStyle(.roundedBorder)
            TextField("Reasoning effort", text: $effort).textFieldStyle(.roundedBorder)
            StatusBanner(message: error)
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button("Save") { Task { await save() } }
            }
        }
        .padding(20)
        .frame(width: 480)
        .onAppear {
            name = bot.name
            instruction = bot.instruction
            description = bot.description
            providerID = bot.providerId ?? ""
            modelID = bot.modelId ?? ""
            effort = bot.reasoningEffort ?? ""
        }
    }

    private func save() async {
        do {
            _ = try await model.client?.updateBot(
                bot.id,
                body: jsonObject(
                    ("name", .string(name)),
                    ("instruction", .string(instruction)),
                    ("description", .string(description)),
                    ("providerId", providerID.isEmpty ? .null : .string(providerID)),
                    ("modelId", modelID.isEmpty ? .null : .string(modelID)),
                    ("reasoningEffort", effort.isEmpty ? .null : .string(effort))
                ))
            await model.refresh()
            dismiss()
        } catch {
            self.error = errorText(error)
        }
    }
}
