import Foundation

/// Incremental parser for a `text/event-stream`. Feed it lines (without the newline); it returns
/// the `data` payload of each completed message. Keep-alive `ping` events yield nothing.
public struct ServerSentEventParser: Sendable {
    private var event: String?
    private var data: [String] = []

    public init() {}

    public mutating func feed(line: String) -> String? {
        if line.isEmpty {
            defer { event = nil; data = [] }
            guard !data.isEmpty, event != "ping" else { return nil }
            return data.joined(separator: "\n")
        }
        if line.hasPrefix(":") { return nil }  // a comment
        let (field, value) = Self.split(line)
        switch field {
        case "event": event = value
        case "data": data.append(value)
        default: break
        }
        return nil
    }

    private static func split(_ line: String) -> (String, String) {
        guard let colon = line.firstIndex(of: ":") else { return (line, "") }
        let field = String(line[..<colon])
        var value = line[line.index(after: colon)...]
        if value.first == " " { value = value.dropFirst() }
        return (field, String(value))
    }
}

/// Splits a byte stream into lines, keeping empty ones. `URLSession.AsyncBytes.lines` drops them,
/// and an empty line is what ends a server-sent event, so it cannot be used here.
public struct LineSplitter: Sendable {
    private var buffer: [UInt8] = []

    public init() {}

    /// Returns a completed line (without `\n` or `\r\n`) when `byte` ends one.
    public mutating func feed(byte: UInt8) -> String? {
        guard byte == 0x0A else {
            buffer.append(byte)
            return nil
        }
        if buffer.last == 0x0D { buffer.removeLast() }
        defer { buffer.removeAll(keepingCapacity: true) }
        return String(decoding: buffer, as: UTF8.self)
    }
}
