import AvenKit
import SwiftUI

struct ThreadView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var thread: ThreadModel
    @State private var draft = ""
    @State private var selectedProviderId = ""
    @State private var showRename = false
    @State private var renameDraft = ""

    init(threadId: String, client: APIClient) {
        _thread = State(initialValue: ThreadModel(threadId: threadId, client: client))
    }

    private var summary: ThreadSummary? {
        model.thread(for: thread.threadId)
    }

    private var title: String {
        summary?.title ?? thread.detail?.title ?? "Thread"
    }

    private var isAwaitingAnswer: Bool {
        thread.transcript.pendingQuestionTool != nil
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18) {
                    if thread.hidden > 0 {
                        Button {
                            Task { await thread.loadEarlier() }
                        } label: {
                            HStack(spacing: 8) {
                                if thread.loadingEarlier {
                                    ProgressView().controlSize(.small)
                                }
                                Text(thread.loadingEarlier ? "Loading earlier…" : "Load earlier messages (\(thread.hidden))")
                                    .font(.footnote.weight(.medium))
                                    .foregroundStyle(Theme.mutedForeground)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(Theme.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(thread.loadingEarlier)
                    }

                    if !thread.loaded {
                        HStack {
                            Spacer()
                            ProgressView()
                            Spacer()
                        }
                        .padding(.top, 48)
                    } else if thread.transcript.messages.isEmpty {
                        ContentUnavailableView(
                            "Ready when you are",
                            systemImage: "bubble.left.and.bubble.right",
                            description: Text("Send a message to start the agent in this workspace.")
                        )
                        .padding(.top, 36)
                    } else {
                        ForEach(thread.transcript.messages) { message in
                            MessageView(message: message)
                                .id(message.id)
                        }
                    }

                    if thread.transcript.running {
                        HStack(spacing: 8) {
                            ProgressView()
                                .controlSize(.small)
                            Text("Working…")
                                .font(.footnote)
                                .foregroundStyle(Theme.mutedForeground)
                        }
                        .padding(.top, 4)
                    }

                    if let error = thread.errorMessage {
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(Theme.destructive)
                            Text(error)
                                .font(.footnote)
                                .foregroundStyle(Theme.destructive)
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }

                    Color.clear.frame(height: 8).id("bottom")
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: thread.transcript.messages.count) {
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo("bottom", anchor: .bottom)
                }
            }
            .onChange(of: thread.transcript.running) {
                proxy.scrollTo("bottom", anchor: .bottom)
            }
        }
        .background(Theme.background.ignoresSafeArea())
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 0) {
                if let askTool = thread.transcript.pendingQuestionTool,
                    let questions = askTool.questions
                {
                    AskUserCard(questions: questions, submitting: thread.sending) { answers in
                        Task {
                            await thread.answer(
                                answers,
                                providerId: selectedProviderId.isEmpty ? nil : selectedProviderId
                            )
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
                }

                composer
            }
            .background(Theme.background.opacity(0.96))
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.background, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if let current = summary {
                    Menu {
                        Button {
                            renameDraft = current.title
                            showRename = true
                        } label: {
                            Label("Rename", systemImage: "pencil")
                        }
                        Button {
                            Task { await model.togglePin(current) }
                        } label: {
                            Label(
                                current.isPinned ? "Unpin" : "Pin",
                                systemImage: current.isPinned ? "pin.slash" : "pin"
                            )
                        }
                        Divider()
                        Button(role: current.isArchived ? nil : .destructive) {
                            Task {
                                await model.setArchived(current, archived: !current.isArchived)
                                if !current.isArchived { dismiss() }
                            }
                        } label: {
                            Label(
                                current.isArchived ? "Restore" : "Archive",
                                systemImage: current.isArchived ? "arrow.uturn.backward" : "archivebox"
                            )
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
        }
        .alert("Rename thread", isPresented: $showRename) {
            TextField("Title", text: $renameDraft)
            Button("Save") {
                if let current = summary {
                    let next = renameDraft
                    Task { await model.renameThread(current, title: next) }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .onAppear { thread.attach() }
        .onDisappear { thread.detach() }
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if !model.providers.isEmpty {
                Menu {
                    Button {
                        selectedProviderId = ""
                    } label: {
                        Label("Default model", systemImage: selectedProviderId.isEmpty ? "checkmark" : "cpu")
                    }
                    ForEach(model.providers) { provider in
                        Button {
                            selectedProviderId = provider.id
                        } label: {
                            Label(
                                provider.name,
                                systemImage: selectedProviderId == provider.id ? "checkmark" : "cpu"
                            )
                        }
                    }
                } label: {
                    Image(systemName: "cpu")
                        .font(.subheadline)
                        .foregroundStyle(selectedProviderId.isEmpty ? Theme.mutedForeground : Theme.primary)
                        .frame(width: 34, height: 34)
                }
                .accessibilityLabel("Choose model")
            }

            TextField(
                isAwaitingAnswer ? "Answer the question above" : "Message the agent",
                text: $draft,
                axis: .vertical
            )
            .font(.body)
            .foregroundStyle(Theme.foreground)
            .lineLimit(1...6)
            .disabled(isAwaitingAnswer)
            .padding(.vertical, 6)

            if thread.transcript.running {
                Button {
                    Task { await thread.cancel() }
                } label: {
                    Image(systemName: "stop.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(width: 34, height: 34)
                        .background(Theme.destructive, in: Circle())
                }
                .accessibilityLabel("Stop run")
            } else {
                let canSend = !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    && !thread.sending
                    && !isAwaitingAnswer
                Button(action: send) {
                    Image(systemName: "arrow.up")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(canSend ? Theme.primaryForeground : Theme.mutedForeground)
                        .frame(width: 34, height: 34)
                        .background(
                            canSend ? Theme.primary : Theme.secondary,
                            in: Circle()
                        )
                }
                .disabled(!canSend)
                .accessibilityLabel("Send message")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Theme.input, lineWidth: 1)
        )
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 10)
    }

    private func send() {
        let prompt = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty, !thread.transcript.running, !isAwaitingAnswer else { return }
        draft = ""
        let providerId = selectedProviderId.isEmpty ? nil : selectedProviderId
        Task { await thread.send(prompt, providerId: providerId) }
    }
}

private struct AskUserCard: View {
    let questions: [Question]
    let submitting: Bool
    let onSubmit: ([QuestionAnswer]) -> Void

    @State private var selections: [String: String] = [:]
    @State private var customText: [String: String] = [:]

    private var answers: [QuestionAnswer] {
        questions.compactMap { question in
            let custom = (customText[question.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !custom.isEmpty {
                return QuestionAnswer(questionId: question.id, value: custom)
            }
            if let picked = selections[question.id], !picked.isEmpty {
                return QuestionAnswer(questionId: question.id, value: picked)
            }
            return nil
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "questionmark.circle.fill")
                    .foregroundStyle(Color.orange)
                Text("Question from agent")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.foreground)
            }

            ForEach(questions) { question in
                VStack(alignment: .leading, spacing: 8) {
                    Text(question.text)
                        .font(.subheadline)
                        .foregroundStyle(Theme.foreground)

                    if let choices = question.choices, !choices.isEmpty {
                        ForEach(choices, id: \.self) { choice in
                            let selected = selections[question.id] == choice.value
                                && (customText[question.id] ?? "").isEmpty
                            Button {
                                selections[question.id] = choice.value
                                customText[question.id] = ""
                            } label: {
                                HStack {
                                    Text(choice.label)
                                        .font(.footnote.weight(selected ? .semibold : .regular))
                                        .foregroundStyle(selected ? Theme.primaryForeground : Theme.foreground)
                                    Spacer()
                                    if selected {
                                        Image(systemName: "checkmark")
                                            .font(.caption.weight(.bold))
                                            .foregroundStyle(Theme.primaryForeground)
                                    }
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 9)
                                .background(
                                    selected ? Theme.primary : Theme.secondary,
                                    in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    if question.choices == nil || question.choices?.isEmpty == true || question.allowCustom == true {
                        TextField(
                            "Write your answer…",
                            text: Binding(
                                get: { customText[question.id] ?? "" },
                                set: { customText[question.id] = $0 }
                            )
                        )
                        .font(.subheadline)
                        .padding(10)
                        .background(Theme.background, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .stroke(Theme.input, lineWidth: 1)
                        )
                    }
                }
            }

            Button {
                onSubmit(answers)
            } label: {
                HStack {
                    Spacer()
                    if submitting {
                        ProgressView().controlSize(.small)
                    } else {
                        Text("Submit answer")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Theme.primaryForeground)
                    }
                    Spacer()
                }
                .padding(.vertical, 10)
                .background(Theme.primary, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(submitting || answers.count < questions.count)
        }
        .padding(14)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Theme.input, lineWidth: 1)
        )
    }
}
