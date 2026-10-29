import AvenKit
import SwiftUI

struct ThreadView: View {
    @State private var thread: ThreadModel
    @State private var draft = ""

    init(threadId: String, client: APIClient) {
        _thread = State(initialValue: ThreadModel(threadId: threadId, client: client))
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        ForEach(thread.transcript.messages) { message in
                            MessageView(message: message).id(message.id)
                        }
                        if let error = thread.errorMessage {
                            Text(error).foregroundStyle(.red).font(.callout)
                        }
                        Color.clear.frame(height: 1).id("end")
                    }
                    .padding(20)
                    .frame(maxWidth: 760, alignment: .leading)
                    .frame(maxWidth: .infinity)
                }
                .onChange(of: thread.transcript) { proxy.scrollTo("end") }
            }
            Divider()
            composer
        }
        .onAppear { thread.attach() }
        .onDisappear { thread.detach() }
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField("Message the agent", text: $draft, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...8)
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 10).stroke(.quaternary))
                .onSubmit(send)
            if thread.transcript.running {
                Button("Stop", systemImage: "stop.fill") { Task { await thread.cancel() } }
            } else {
                Button("Send", systemImage: "arrow.up", action: send)
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .keyboardShortcut(.return, modifiers: .command)
            }
        }
        .padding(14)
    }

    private func send() {
        let prompt = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !prompt.isEmpty, !thread.transcript.running else { return }
        draft = ""
        Task { await thread.send(prompt) }
    }
}
