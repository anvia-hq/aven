import AvenKit
import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model
    @State private var showingNewThread = false

    var body: some View {
        @Bindable var model = model
        NavigationSplitView {
            List(selection: $model.selectedThreadId) {
                ForEach(model.threads) { thread in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(thread.title).lineLimit(1)
                            Text(thread.projectPath)
                                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                        Spacer()
                        if thread.running { ProgressView().controlSize(.small) }
                    }
                    .tag(thread.id)
                }
            }
            .navigationSplitViewColumnWidth(min: 220, ideal: 280)
            .overlay {
                if model.threads.isEmpty {
                    ContentUnavailableView("No threads yet", systemImage: "bubble.left", description: Text("Start one from a project."))
                }
            }
            .toolbar {
                ToolbarItem {
                    Button("New thread", systemImage: "square.and.pencil") { showingNewThread = true }
                        .disabled(model.projects.isEmpty)
                        .help(model.projects.isEmpty ? "Create a project in the web app first" : "New thread")
                }
                ToolbarItem {
                    Button("Sign out", systemImage: "rectangle.portrait.and.arrow.right") { model.signOut() }
                }
            }
        } detail: {
            if let id = model.selectedThreadId, let client = model.client {
                ThreadView(threadId: id, client: client)
                    .id(id)
            } else {
                ContentUnavailableView("Choose a thread", systemImage: "bubble.left.and.bubble.right")
            }
        }
        .task {
            // Keeps the sidebar (and each thread's running dot) current.
            while !Task.isCancelled {
                await model.refresh()
                try? await Task.sleep(for: .seconds(5))
            }
        }
        .sheet(isPresented: $showingNewThread) { NewThreadSheet() }
    }
}
