import AvenKit
import SwiftUI

struct NewThreadSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var projectId = ""
    @State private var prompt = ""
    @State private var working = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("New thread").font(.title2.weight(.semibold))
            Picker("Project", selection: $projectId) {
                ForEach(model.projects) { project in Text(project.name).tag(project.id) }
            }
            TextEditor(text: $prompt)
                .font(.body)
                .frame(minHeight: 120)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(.quaternary))
            if let error { Text(error).foregroundStyle(.red).font(.callout) }
            HStack {
                Spacer()
                Button("Cancel", role: .cancel) { dismiss() }
                Button("Start") { Task { await start() } }
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
                    .disabled(working || projectId.isEmpty || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(20)
        .frame(width: 460)
        .onAppear { projectId = model.projects.first?.id ?? "" }
    }

    private func start() async {
        working = true
        defer { working = false }
        do {
            try await model.startThread(projectId: projectId, prompt: prompt)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
