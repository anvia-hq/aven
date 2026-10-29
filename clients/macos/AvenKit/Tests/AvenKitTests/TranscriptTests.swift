import Foundation
import Testing

@testable import AvenKit

// The same fixtures the TypeScript reducer is tested with (packages/protocol/fixtures).
private struct Fixture: Decodable {
    struct Expected: Decodable {
        var messages: [Message]
        var running: Bool
    }
    var name: String
    var events: [RunEvent]
    var expected: Expected
}

private func fixtures() throws -> [Fixture] {
    let url = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()  // AvenKitTests
        .deletingLastPathComponent()  // Tests
        .deletingLastPathComponent()  // AvenKit
        .deletingLastPathComponent()  // macos
        .deletingLastPathComponent()  // clients
        .deletingLastPathComponent()  // repository root
        .appendingPathComponent("packages/protocol/fixtures/reducer.json")
    return try JSONDecoder().decode([Fixture].self, from: Data(contentsOf: url))
}

@Suite struct TranscriptTests {
    @Test func everySharedFixtureReducesTheSameWayAsTypeScript() throws {
        let all = try fixtures()
        #expect(all.count >= 9)
        for fixture in all {
            var transcript = Transcript()
            for event in fixture.events { transcript.apply(event) }
            #expect(transcript.messages == fixture.expected.messages, "\(fixture.name): messages")
            #expect(transcript.running == fixture.expected.running, "\(fixture.name): running")
        }
    }

    @Test func anUnknownEventTypeDecodesAndIsIgnored() throws {
        let event = try JSONDecoder().decode(
            RunEvent.self, from: Data(#"{"type":"something_new","x":1}"#.utf8))
        #expect(event == .unknown)
    }
}

@Suite struct ServerSentEventTests {
    @Test func collectsDataLinesAndSkipsPingsAndComments() {
        var parser = ServerSentEventParser()
        let lines = [
            ": hello", "event: ping", "data: ", "",
            #"data: {"type":"done"}"#, "",
            "data: a", "data: b", "",
        ]
        let payloads = lines.compactMap { parser.feed(line: $0) }
        #expect(payloads == [#"{"type":"done"}"#, "a\nb"])
    }
}

@Suite struct LineSplitterTests {
    @Test func keepsEmptyLinesAndHandlesCRLF() {
        var splitter = LineSplitter()
        let bytes = Array("data: a\r\n\r\ndata: b\n\n".utf8)
        let lines = bytes.compactMap { splitter.feed(byte: $0) }
        #expect(lines == ["data: a", "", "data: b", ""])
    }

    @Test func aMessageSplitAcrossReadsStillParses() {
        var splitter = LineSplitter()
        var parser = ServerSentEventParser()
        var payloads: [String] = []
        for byte in Array("data: {\"type\":\"done\"}\n\n".utf8) {
            if let line = splitter.feed(byte: byte), let payload = parser.feed(line: line) {
                payloads.append(payload)
            }
        }
        #expect(payloads == [#"{"type":"done"}"#])
    }
}

@Suite struct APIClientTests {
    @Test func normalizesWhatAPersonTypes() throws {
        #expect(try APIClient.normalize(server: "localhost:8000").absoluteString == "http://localhost:8000")
        #expect(
            try APIClient.normalize(server: " aven.example.com/ ").absoluteString
                == "https://aven.example.com")
        #expect(
            try APIClient.normalize(server: "https://aven.example.com/x/").absoluteString
                == "https://aven.example.com/x")
        #expect(throws: APIError.self) { try APIClient.normalize(server: "  ") }
    }
}
