import Foundation

public enum PairingError: Error, LocalizedError, Equatable {
    case invalidQRCode

    public var errorDescription: String? {
        switch self {
        case .invalidQRCode:
            return "That QR code is not a valid Aven sign-in code"
        }
    }
}

public struct PairingPayload: Equatable, Sendable {
    public let server: URL
    public let code: String

    public init(server: URL, code: String) {
        self.server = server
        self.code = code
    }

    public static func parse(_ url: URL) throws -> PairingPayload {
        try parse(url.absoluteString)
    }

    public static func parse(_ raw: String) throws -> PairingPayload {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard
            let components = URLComponents(string: trimmed),
            components.scheme?.lowercased() == "aven",
            components.host?.lowercased() == "pair",
            let items = components.queryItems,
            let rawServer = items.first(where: { $0.name == "server" })?.value,
            let rawCode = items.first(where: { $0.name == "code" })?.value
        else {
            throw PairingError.invalidQRCode
        }

        let code = rawCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !code.isEmpty else { throw PairingError.invalidQRCode }

        let server: URL
        do {
            server = try APIClient.normalize(server: rawServer)
        } catch {
            throw PairingError.invalidQRCode
        }

        guard let scheme = server.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
            throw PairingError.invalidQRCode
        }

        return PairingPayload(server: server, code: code)
    }
}
