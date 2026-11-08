import AvenKit
import SwiftUI

struct ThreadListView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        NavigationStack {
            List(model.threads) { thread in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(thread.title).lineLimit(1)
                        Text(model.projectName(thread.projectId))
                            .font(.caption).foregroundStyle(Theme.mutedForeground).lineLimit(1)
                    }
                    Spacer()
                    if thread.running { ProgressView() }
                }
                .listRowBackground(Theme.card)
            }
            .overlay {
                if model.threads.isEmpty {
                    ContentUnavailableView(
                        "No threads yet", systemImage: "bubble.left",
                        description: Text("Start one from the web app."))
                }
            }
            .themedScreen()
            .refreshable { await model.refresh() }
            .navigationTitle("Threads")
            .toolbar {
                Button("Sign out", systemImage: "rectangle.portrait.and.arrow.right") {
                    model.signOut()
                }
            }
        }
        .task {
            while !Task.isCancelled {
                await model.refresh()
                try? await Task.sleep(for: .seconds(5))
            }
        }
    }
}
