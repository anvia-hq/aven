import Foundation
import Security

/// Keeps the session token in the macOS Keychain, so it survives restarts and never sits in a file.
public struct TokenStore: Sendable {
    private let service: String

    public init(service: String = "dev.anvia.aven") { self.service = service }

    private func query(server: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: server,
        ]
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

    public func save(_ token: String, for server: String) {
        remove(for: server)
        var item = query(server: server)
        item[kSecValueData as String] = Data(token.utf8)
        SecItemAdd(item as CFDictionary, nil)
    }

    public func remove(for server: String) {
        SecItemDelete(query(server: server) as CFDictionary)
    }
}
