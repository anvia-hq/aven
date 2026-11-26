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

    @Test func detectsPendingAskUserQuestionAndResumes() {
        var transcript = Transcript()
        let question = Question(
            id: "q-1",
            text: "Pick a target",
            choices: [QuestionChoice(label: "iOS", value: "ios")],
            allowCustom: true)
        let askTool = Tool(
            id: "t-1",
            name: "ask_user",
            target: "",
            status: .running,
            diff: nil,
            output: nil,
            questions: [question],
            artifacts: nil)
        transcript.apply(.runStart(prompt: "Build"))
        transcript.apply(.toolStart(askTool))
        #expect(transcript.pendingQuestionTool == nil)

        transcript.apply(.done)
        #expect(transcript.pendingQuestionTool?.id == "t-1")

        transcript.apply(.runResume)
        #expect(transcript.running == true)
        #expect(transcript.pendingQuestionTool == nil)
    }

    @Test func prependsEarlierMessagesWithoutDuplicates() {
        var transcript = Transcript(
            messages: [Message(id: "m-2", role: .user, parts: [.text("later")])],
            running: false)
        transcript.prepend([
            Message(id: "e-0", role: .user, parts: [.text("earlier")]),
            Message(id: "m-2", role: .user, parts: [.text("dup")]),
        ])
        #expect(transcript.messages.map(\.id) == ["e-0", "m-2"])
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
                == "https://aven.example.com/api")
        #expect(
            try APIClient.normalize(server: "https://aven.example.com:2837").absoluteString
                == "https://aven.example.com:2837")
        #expect(
            try APIClient.normalize(server: "https://aven.example.com/x/").absoluteString
                == "https://aven.example.com/x")
        #expect(throws: APIError.self) { try APIClient.normalize(server: "  ") }
    }
}

@Suite struct PairingPayloadTests {
    @Test func parsesAValidPairingURL() throws {
        let payload = try PairingPayload.parse(
            " aven://pair?server=https%3A%2F%2Faven.example.com%2Fapi&code=abc_123-XYZ \n")
        #expect(payload.server.absoluteString == "https://aven.example.com/api")
        #expect(payload.code == "abc_123-XYZ")
    }

    @Test func parsesLocalDevServerURL() throws {
        let payload = try PairingPayload.parse(
            "aven://pair?server=http%3A%2F%2Flocalhost%3A5173%2Fapi&code=token123456789012")
        #expect(payload.server.absoluteString == "http://localhost:5173/api")
        #expect(payload.code == "token123456789012")
    }

    @Test func rejectsNonAvenOrMalformedCodes() {
        #expect(throws: PairingError.invalidQRCode) {
            try PairingPayload.parse("https://aven.example.com/?code=abc")
        }
        #expect(throws: PairingError.invalidQRCode) {
            try PairingPayload.parse("aven://other?server=https://aven.example.com&code=abc")
        }
        #expect(throws: PairingError.invalidQRCode) {
            try PairingPayload.parse("aven://pair?server=https://aven.example.com")
        }
        #expect(throws: PairingError.invalidQRCode) {
            try PairingPayload.parse("aven://pair?server=file:///etc/passwd&code=abc")
        }
        #expect(throws: PairingError.invalidQRCode) {
            try PairingPayload.parse("not a url")
        }
    }
}
