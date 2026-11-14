import Foundation

/// A JSON value built for request bodies. A missing optional is left out; `.null` is sent as null.
public enum JSONValue: Encodable, Sendable, Equatable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case null
    case object([String: JSONValue])
    case array([JSONValue])

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .int(let value): try container.encode(value)
        case .double(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .null: try container.encodeNil()
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        }
    }
}

public func jsonObject(_ pairs: (String, JSONValue?)...) -> JSONValue {
    var object: [String: JSONValue] = [:]
    for (key, value) in pairs {
        if let value { object[key] = value }
    }
    return .object(object)
}

extension JSONValue {
    public static func optionalString(_ value: String?) -> JSONValue? {
        guard let value else { return nil }
        return .string(value)
    }
}
