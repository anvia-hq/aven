import Foundation
import Security

/// Keeps the session token in the macOS Keychain, so it survives restarts and never sits in a file.
public struct TokenStore: Sendable {
    /// Why the Keychain would not take a token: the `OSStatus` it answered with.
    public enum Failure: Error, LocalizedError {
        case keychain(OSStatus)

        public var errorDescription: String? {
            switch self {
            case .keychain(let status):
                let reason = (SecCopyErrorMessageString(status, nil) as String?) ?? "error \(status)"
                return "Could not save the session to the Keychain: \(reason)"
            }
        }
    }

    private let service: String

    public init(service: String = "dev.anvia.aven") { self.service = service }

    /// The items of this service: one server's, or every server's when it is left out.
    private func query(server: String? = nil) -> [String: Any] {
        var item: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
        ]
        if let server { item[kSecAttrAccount as String] = server }
        return item
    }

    public func token(for server: String) -> String? {
        var item = query(server: server)
        item[kSecReturnData as String] = true
        item[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(item as CFDictionary, &result) == errSecSuccess,
            let data = result as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    public func save(_ token: String, for server: String) throws {
        remove(for: server)
        var item = query(server: server)
        item[kSecValueData as String] = Data(token.utf8)
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else { throw Failure.keychain(status) }
    }

    public func remove(for server: String) {
        SecItemDelete(query(server: server) as CFDictionary)
    }

    /// Every token of this service, whichever server it was for, not just the current one's.
    public func removeAll() {
        SecItemDelete(query() as CFDictionary)
    }
}
