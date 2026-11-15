import Foundation
import Security

struct KeychainTokenStore: Sendable {
    private let service = "dev.anvia.aven.desktop"

    func token(for server: String) -> String? {
        var query = base(server: server)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
            let data = result as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func save(_ token: String, for server: String) throws {
        remove(for: server)
        var query = base(server: server)
        query[kSecValueData as String] = Data(token.utf8)
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw APIFailure.keychain(status)
        }
    }

    func remove(for server: String) {
        SecItemDelete(base(server: server) as CFDictionary)
    }

    private func base(server: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: server,
        ]
    }
}

enum APIFailure: LocalizedError {
    case keychain(OSStatus)

    var errorDescription: String? {
        switch self {
        case .keychain(let status):
            "Could not save the session to the Keychain (\(status))"
        }
    }
}
