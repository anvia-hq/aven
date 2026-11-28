import AvenKit
import SwiftUI

struct NewThreadSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var initialProjectId: String?
    var onCreated: (ThreadSummary) -> Void

    @State private var selectedProjectId = ""
    @State private var selectedProviderId = ""
    @State private var prompt = ""
    @State private var starting = false
    @State private var errorMessage: String?

    private var canStart: Bool {
        !starting
            && !selectedProjectId.isEmpty
            && !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                if model.projects.isEmpty {
                    Section {
                        Text("Add a project in the web app before starting a thread.")
                            .foregroundStyle(Theme.mutedForeground)
                    }
                    .listRowBackground(Theme.card)
                } else {
                    Section("Workspace") {
                        Picker("Project", selection: $selectedProjectId) {
                            ForEach(model.projects) { project in
                                Text(project.name).tag(project.id)
                            }
                        }

                        if !model.providers.isEmpty {
                            Picker("Model", selection: $selectedProviderId) {
                                Text("Default").tag("")
                                ForEach(model.providers) { provider in
                                    Text(provider.name).tag(provider.id)
                                }
                            }
                        }
                    }
                    .listRowBackground(Theme.card)

                    Section("Prompt") {
                        TextField(
                            "What should we build?",
                            text: $prompt,
                            axis: .vertical
                        )
                        .lineLimit(4...10)
                        .accessibilityIdentifier("newThreadPrompt")
                    }
                    .listRowBackground(Theme.card)
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(Theme.destructive)
                    }
                    .listRowBackground(Theme.card)
                }
            }
            .themedScreen()
            .navigationTitle("New thread")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if starting {
                        ProgressView()
                    } else {
                        Button("Start") { Task { await start() } }
                            .disabled(!canStart)
                            .accessibilityIdentifier("startThreadButton")
                    }
                }
            }
            .onAppear {
                if selectedProjectId.isEmpty {
                    selectedProjectId = initialProjectId ?? model.projects.first?.id ?? ""
                }
            }
        }
    }

    private func start() async {
        let trimmed = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !selectedProjectId.isEmpty else { return }

        starting = true
        errorMessage = nil
        do {
            let project = model.projects.first { $0.id == selectedProjectId }
            let created = try await model.startThread(
                projectId: selectedProjectId,
                runtimeId: project?.runtimeId,
                prompt: trimmed,
                providerId: selectedProviderId.isEmpty ? nil : selectedProviderId
            )
            dismiss()
            onCreated(created)
        } catch {
            errorMessage = error.localizedDescription
        }
        starting = false
    }
}
