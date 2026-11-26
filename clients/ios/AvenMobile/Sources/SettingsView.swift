import AvenKit
import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    var onOpenSidebar: () -> Void
    @State private var confirmSignOut = false

    var body: some View {
        NavigationStack {
            List {
                Section("Personal") {
                    NavigationLink {
                        AccountSettingsView()
                    } label: {
                        Label("General", systemImage: "gearshape")
                    }
                    .listRowBackground(Theme.card)

                    NavigationLink {
                        PlaceholderSettingsView(
                            title: "Profile",
                            icon: "person.circle",
                            summary: "Threads, streaks, and token charts (Phase 2)."
                        )
                    } label: {
                        Label("Profile", systemImage: "person.circle")
                    }
                    .listRowBackground(Theme.card)

                    NavigationLink {
                        PlaceholderSettingsView(
                            title: "Personal variables",
                            icon: "lock",
                            summary: "Manage your personal workspace environment variables (Phase 3)."
                        )
                    } label: {
                        Label("Personal variables", systemImage: "lock")
                    }
                    .listRowBackground(Theme.card)
                }

                Section("Agents") {
                    NavigationLink {
                        ProvidersSettingsView()
                    } label: {
                        HStack {
                            Label("Providers", systemImage: "cpu")
                            Spacer()
                            if !model.providers.isEmpty {
                                Text("\(model.providers.count)")
                                    .font(.caption.monospacedDigit())
                                    .foregroundStyle(Theme.mutedForeground)
                            }
                        }
                    }
                    .listRowBackground(Theme.card)

                    settingsPlaceholderLink("Bots", icon: "sparkles", summary: "Bot model assignments (Phase 3).")
                    settingsPlaceholderLink("Memory", icon: "brain", summary: "Notes agents keep about you (Phase 3).")
                    settingsPlaceholderLink("Skills", icon: "book", summary: "Installed agent skills (Phase 3).")
                    settingsPlaceholderLink("MCP", icon: "puzzlepiece.extension", summary: "Remote MCP servers and tokens (Phase 4).")
                    settingsPlaceholderLink("Webhooks", icon: "link", summary: "Incoming webhooks for your bots (Phase 4).")
                }

                Section("Workspace") {
                    NavigationLink {
                        RuntimesSettingsView()
                    } label: {
                        HStack {
                            Label("Runtimes", systemImage: "desktopcomputer")
                            Spacer()
                            let onlineCount = model.runtimes.filter(\.online).count
                            if !model.runtimes.isEmpty {
                                Text("\(onlineCount)/\(model.runtimes.count)")
                                    .font(.caption.monospacedDigit())
                                    .foregroundStyle(Theme.mutedForeground)
                            }
                        }
                    }
                    .listRowBackground(Theme.card)

                    settingsPlaceholderLink("Members", icon: "person.2", summary: "Workspace members and invitations (Phase 3).")
                    settingsPlaceholderLink("GitHub", icon: "chevron.left.forwardslash.chevron.right", summary: "GitHub integration status (Phase 3).")
                    settingsPlaceholderLink("Workspace variables", icon: "key", summary: "Shared environment variables (Phase 4).")
                    settingsPlaceholderLink("Decision model", icon: "flag", summary: "Workspace decision model (Phase 4).")
                }

                Section {
                    Button(role: .destructive) {
                        confirmSignOut = true
                    } label: {
                        Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                            .foregroundStyle(Theme.destructive)
                    }
                    .listRowBackground(Theme.card)
                }
            }
            .themedScreen()
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: onOpenSidebar) {
                        Image(systemName: "sidebar.left")
                    }
                    .accessibilityLabel("Open sidebar")
                    .accessibilityIdentifier("sidebarToggle")
                }
            }
            .confirmationDialog("Sign out of Aven?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) { model.signOut() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("You'll need to scan a new QR code from the web app to sign back in.")
            }
        }
    }

    private func settingsPlaceholderLink(_ title: String, icon: String, summary: String) -> some View {
        NavigationLink {
            PlaceholderSettingsView(title: title, icon: icon, summary: summary)
        } label: {
            Label(title, systemImage: icon)
        }
        .listRowBackground(Theme.card)
    }
}

private struct AccountSettingsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        List {
            Section("Account") {
                if let user = model.session?.user {
                    LabeledContent("Name", value: user.name)
                        .listRowBackground(Theme.card)
                    LabeledContent("Email", value: user.email)
                        .listRowBackground(Theme.card)
                }
                LabeledContent("Server", value: model.serverHost)
                    .listRowBackground(Theme.card)
            }
        }
        .themedScreen()
        .navigationTitle("General")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct ProvidersSettingsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        List {
            if model.providers.isEmpty {
                Text("No providers configured yet. Add one in the web app.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.mutedForeground)
                    .listRowBackground(Theme.card)
            } else {
                ForEach(model.providers) { provider in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(provider.name)
                                .foregroundStyle(Theme.foreground)
                            Text(provider.modelId ?? provider.kind)
                                .font(.caption)
                                .foregroundStyle(Theme.mutedForeground)
                        }
                        Spacer()
                        if provider.isDefault {
                            Text("Default")
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(Theme.primaryForeground)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(Theme.primary, in: Capsule())
                        }
                    }
                    .listRowBackground(Theme.card)
                }
            }
        }
        .themedScreen()
        .refreshable { await model.refresh() }
        .navigationTitle("Providers")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct RuntimesSettingsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        List {
            if model.runtimes.isEmpty {
                Text("No runtimes connected yet.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.mutedForeground)
                    .listRowBackground(Theme.card)
            } else {
                ForEach(model.runtimes) { runtime in
                    HStack(spacing: 10) {
                        Circle()
                            .fill(runtime.online ? Theme.success : Theme.mutedForeground.opacity(0.4))
                            .frame(width: 8, height: 8)
                        Text(runtime.name)
                            .foregroundStyle(Theme.foreground)
                        Spacer()
                        Text(runtime.online ? "Online" : "Offline")
                            .font(.caption)
                            .foregroundStyle(Theme.mutedForeground)
                    }
                    .listRowBackground(Theme.card)
                }
            }
        }
        .themedScreen()
        .refreshable { await model.refresh() }
        .navigationTitle("Runtimes")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct PlaceholderSettingsView: View {
    let title: String
    let icon: String
    let summary: String

    var body: some View {
        ContentUnavailableView(title, systemImage: icon, description: Text(summary))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
    }
}
