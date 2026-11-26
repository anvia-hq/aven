import AvenKit
import SwiftUI

struct SidebarView: View {
    @Environment(AppModel.self) private var model
    var section: AppSection
    var activeThreadId: String?
    var onSelectSection: (AppSection) -> Void
    var onSelectThread: (String) -> Void
    var onNewThread: () -> Void
    var onClose: () -> Void

    @State private var query = ""

    private var openThreads: [ThreadSummary] {
        let base = model.threads.filter { !$0.isArchived }
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return base }
        return base.filter {
            $0.title.localizedCaseInsensitiveContains(trimmed)
                || model.projectName($0.projectId).localizedCaseInsensitiveContains(trimmed)
        }
    }

    private var pinnedThreads: [ThreadSummary] {
        openThreads.filter(\.isPinned)
    }

    private var recentThreads: [ThreadSummary] {
        openThreads.filter { !$0.isPinned }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            searchBar

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(spacing: 3) {
                        ForEach(AppSection.primary) { item in
                            navRow(item)
                        }
                    }

                    if !pinnedThreads.isEmpty {
                        threadSection(title: "PINNED", threads: Array(pinnedThreads.prefix(6)))
                    }

                    if !recentThreads.isEmpty {
                        threadSection(title: "RECENT", threads: Array(recentThreads.prefix(12)))
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
            }

            Rectangle()
                .fill(Theme.border)
                .frame(height: 1)

            footer
        }
        .frame(maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.background.ignoresSafeArea())
        .overlay(alignment: .trailing) {
            Rectangle()
                .fill(Theme.border)
                .frame(width: 1)
                .ignoresSafeArea()
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            Text("Aven")
                .font(.headline.weight(.semibold))
                .foregroundStyle(Theme.foreground)
            Spacer()
            Button(action: onNewThread) {
                Image(systemName: "square.and.pencil")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Theme.foreground)
                    .frame(width: 32, height: 32)
            }
            .accessibilityLabel("New thread")
            .accessibilityIdentifier("sidebarNewThread")

            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Theme.mutedForeground)
                    .frame(width: 32, height: 32)
            }
            .accessibilityLabel("Close sidebar")
            .accessibilityIdentifier("closeSidebar")
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 8)
    }

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.caption)
                .foregroundStyle(Theme.mutedForeground)
            TextField("Filter threads", text: $query)
                .font(.subheadline)
                .foregroundStyle(Theme.foreground)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            if !query.isEmpty {
                Button {
                    query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(Theme.mutedForeground)
                }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }

    private func navRow(_ item: AppSection) -> some View {
        let active = section == item && activeThreadId == nil
        let count: Int? = {
            switch item {
            case .threads: return model.threads.filter { !$0.isArchived }.count
            case .projects: return model.projects.count
            default: return nil
            }
        }()

        return Button {
            onSelectSection(item)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: item.systemImage)
                    .font(.subheadline)
                    .foregroundStyle(active ? Theme.primary : Theme.mutedForeground)
                    .frame(width: 20)
                Text(item.title)
                    .font(.subheadline.weight(active ? .semibold : .regular))
                    .foregroundStyle(active ? Theme.primary : Theme.foreground)
                Spacer()
                if let count, count > 0 {
                    Text("\(count)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(Theme.mutedForeground)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(
                active ? Theme.secondary : Color.clear,
                in: RoundedRectangle(cornerRadius: 10, style: .continuous)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("sidebar-\(item.rawValue)")
    }

    private func threadSection(title: String, threads: [ThreadSummary]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(Theme.mutedForeground)
                .padding(.horizontal, 12)

            VStack(spacing: 2) {
                ForEach(threads) { thread in
                    threadRow(thread)
                }
            }
        }
    }

    private func threadRow(_ thread: ThreadSummary) -> some View {
        let selected = activeThreadId == thread.id

        return Button {
            onSelectThread(thread.id)
        } label: {
            HStack(spacing: 10) {
                if thread.running {
                    ProgressView()
                        .controlSize(.mini)
                        .frame(width: 16)
                } else if thread.awaitingAnswer {
                    Circle()
                        .fill(Color.orange)
                        .frame(width: 7, height: 7)
                        .frame(width: 16)
                } else {
                    Image(systemName: thread.isPinned ? "pin.fill" : "bubble.left")
                        .font(.caption2)
                        .foregroundStyle(selected ? Theme.primary : Theme.mutedForeground)
                        .frame(width: 16)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(thread.title)
                        .font(.footnote.weight(selected ? .semibold : .regular))
                        .foregroundStyle(selected ? Theme.primary : Theme.foreground)
                        .lineLimit(1)
                    let project = model.projectName(thread.projectId)
                    if !project.isEmpty {
                        Text(project)
                            .font(.caption2)
                            .foregroundStyle(Theme.mutedForeground)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                selected ? Theme.secondary : Color.clear,
                in: RoundedRectangle(cornerRadius: 9, style: .continuous)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var footer: some View {
        HStack(spacing: 8) {
            Button {
                onSelectSection(.settings)
            } label: {
                HStack(spacing: 10) {
                    ZStack {
                        Circle()
                            .fill(Theme.secondary)
                            .frame(width: 32, height: 32)
                        Text(userInitials)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Theme.foreground)
                    }
                    VStack(alignment: .leading, spacing: 1) {
                        Text(model.session?.user.name ?? "Settings")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(section == .settings ? Theme.primary : Theme.foreground)
                            .lineLimit(1)
                        Text(model.session?.user.email ?? model.serverHost)
                            .font(.caption2)
                            .foregroundStyle(Theme.mutedForeground)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "gearshape")
                        .font(.subheadline)
                        .foregroundStyle(section == .settings ? Theme.primary : Theme.mutedForeground)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(
                    section == .settings ? Theme.secondary : Theme.card,
                    in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                )
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("sidebar-settings")
        }
        .padding(12)
    }

    private var userInitials: String {
        let source = model.session?.user.name ?? "A"
        let parts = source.split(separator: " ").prefix(2)
        let letters = parts.compactMap(\.first).map(String.init).joined()
        return letters.isEmpty ? "A" : letters.uppercased()
    }
}
