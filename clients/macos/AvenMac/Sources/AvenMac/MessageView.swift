import AvenKit
import SwiftUI

struct MessageView: View {
    let message: Message

    var body: some View {
        if message.role == .user {
            HStack {
                Spacer(minLength: 60)
                Text(plain)
                    .textSelection(.enabled)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
            }
        } else {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(message.parts.enumerated()), id: \.offset) { _, part in
                    switch part {
                    case .text(let text):
                        Text(markdown(text)).textSelection(.enabled)
                    case .tool(let tool):
                        ToolView(tool: tool)
                    }
                }
            }
        }
    }

    private var plain: String {
        message.parts.compactMap { if case .text(let text) = $0 { text } else { nil } }.joined()
    }

    private func markdown(_ text: String) -> AttributedString {
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        return (try? AttributedString(markdown: text, options: options)) ?? AttributedString(text)
    }
}

private struct ToolView: View {
    let tool: Tool
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                expanded.toggle()
            } label: {
                HStack(spacing: 8) {
                    statusIcon
                    Text(tool.name).font(.callout.monospaced().weight(.medium))
                    Text(tool.target).font(.callout.monospaced()).foregroundStyle(.secondary).lineLimit(1)
                    Spacer()
                    if hasDetail { Image(systemName: expanded ? "chevron.down" : "chevron.right").foregroundStyle(.secondary) }
                }
            }
            .buttonStyle(.plain)
            .disabled(!hasDetail)
            if expanded {
                if let diff = tool.diff { DiffView(lines: diff) }
                if let output = tool.output, !output.isEmpty {
                    ScrollView(.horizontal) {
                        Text(output).font(.caption.monospaced()).textSelection(.enabled)
                    }
                    .padding(8)
                    .background(.quinary, in: RoundedRectangle(cornerRadius: 6))
                }
            }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 8).stroke(.quaternary))
    }

    private var hasDetail: Bool { tool.diff != nil || !(tool.output ?? "").isEmpty }

    @ViewBuilder private var statusIcon: some View {
        switch tool.status {
        case .running: ProgressView().controlSize(.small)
        case .done: Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        case .error: Image(systemName: "xmark.circle.fill").foregroundStyle(.red)
        }
    }
}

private struct DiffView: View {
    let lines: [DiffLine]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                Text("\(prefix(line)) \(line.text)")
                    .font(.caption.monospaced())
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(tint(line))
            }
        }
        .padding(4)
        .background(.quinary, in: RoundedRectangle(cornerRadius: 6))
    }

    private func prefix(_ line: DiffLine) -> String {
        switch line.type {
        case .add: "+"
        case .del: "-"
        case .ctx: " "
        }
    }

    private func tint(_ line: DiffLine) -> Color {
        switch line.type {
        case .add: .green.opacity(0.18)
        case .del: .red.opacity(0.18)
        case .ctx: .clear
        }
    }
}
