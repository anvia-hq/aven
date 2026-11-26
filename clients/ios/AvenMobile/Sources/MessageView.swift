import AvenKit
import SwiftUI

struct MessageView: View {
    let message: Message

    var body: some View {
        if message.role == .user {
            userBubble
        } else {
            assistantTurn
        }
    }

    private var userBubble: some View {
        let text = message.parts.compactMap { part -> String? in
            if case .text(let value) = part { return value }
            return nil
        }.joined(separator: "\n")

        return HStack {
            Spacer(minLength: 48)
            Text(text)
                .font(.body)
                .foregroundStyle(Theme.foreground)
                .textSelection(.enabled)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Theme.secondary, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(Theme.border, lineWidth: 1)
                )
        }
    }

    private var assistantTurn: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(message.parts.enumerated()), id: \.offset) { _, part in
                switch part {
                case .text(let text):
                    if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        MarkdownTextView(text: text)
                    }
                case .reasoning(let text):
                    ReasoningRow(text: text)
                case .tool(let tool):
                    ToolRowView(tool: tool)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct MarkdownTextView: View {
    let text: String

    var body: some View {
        Group {
            if let attributed = try? AttributedString(
                markdown: text,
                options: AttributedString.MarkdownParsingOptions(
                    interpretedSyntax: .inlineOnlyPreservingWhitespace
                )
            ) {
                Text(attributed)
            } else {
                Text(text)
            }
        }
        .font(.body)
        .foregroundStyle(Theme.foreground)
        .textSelection(.enabled)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct ReasoningRow: View {
    let text: String
    @State private var expanded = false

    var body: some View {
        DisclosureGroup(isExpanded: $expanded) {
            Text(text)
                .font(.footnote)
                .foregroundStyle(Theme.mutedForeground)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 6)
        } label: {
            Label("Thinking", systemImage: "brain")
                .font(.caption.weight(.medium))
                .foregroundStyle(Theme.mutedForeground)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Theme.muted, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

private struct ToolRowView: View {
    let tool: Tool
    @State private var expanded = false

    private var hasDetails: Bool {
        !(tool.output?.isEmpty ?? true) || !(tool.diff?.isEmpty ?? true)
    }

    var body: some View {
        Group {
            if hasDetails {
                DisclosureGroup(isExpanded: $expanded) {
                    VStack(alignment: .leading, spacing: 8) {
                        if let diff = tool.diff, !diff.isEmpty {
                            DiffPreview(lines: diff)
                        }
                        if let output = tool.output, !output.isEmpty {
                            ScrollView(.horizontal, showsIndicators: false) {
                                Text(output.prefix(4000))
                                    .font(.system(.caption2, design: .monospaced))
                                    .foregroundStyle(Theme.mutedForeground)
                                    .textSelection(.enabled)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .padding(8)
                            .background(Theme.background, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        }
                    }
                    .padding(.top, 8)
                } label: {
                    header
                }
            } else {
                header
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Theme.border, lineWidth: 1)
        )
    }

    private var header: some View {
        HStack(spacing: 8) {
            statusIcon
            Text(tool.name)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.foreground)
            if !tool.target.isEmpty {
                Text(tool.target)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(Theme.mutedForeground)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            Spacer(minLength: 0)
        }
    }

    @ViewBuilder
    private var statusIcon: some View {
        switch tool.status {
        case .running:
            ProgressView()
                .controlSize(.mini)
                .frame(width: 14)
        case .done:
            Image(systemName: "checkmark.circle.fill")
                .font(.caption)
                .foregroundStyle(Theme.success)
                .frame(width: 14)
        case .error:
            Image(systemName: "exclamationmark.circle.fill")
                .font(.caption)
                .foregroundStyle(Theme.destructive)
                .frame(width: 14)
        }
    }
}

private struct DiffPreview: View {
    let lines: [DiffLine]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 1) {
                ForEach(Array(lines.prefix(120).enumerated()), id: \.offset) { _, line in
                    Text("\(prefix(line.type))\(line.text)")
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(foreground(line.type))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(background(line.type))
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .background(Theme.background, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func prefix(_ kind: DiffLine.Kind) -> String {
        switch kind {
        case .add: return "+ "
        case .del: return "- "
        case .ctx: return "  "
        }
    }

    private func foreground(_ kind: DiffLine.Kind) -> Color {
        switch kind {
        case .add: return Theme.success
        case .del: return Theme.destructive
        case .ctx: return Theme.mutedForeground
        }
    }

    private func background(_ kind: DiffLine.Kind) -> Color {
        switch kind {
        case .add: return Theme.success.opacity(0.12)
        case .del: return Theme.destructive.opacity(0.12)
        case .ctx: return .clear
        }
    }
}
