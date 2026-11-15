import Observation
import SwiftUI

enum AppearanceMode: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }
    var label: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }

    var scheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

enum InterfaceTextSize: String, CaseIterable, Identifiable {
    case small
    case `default`
    case large
    case extraLarge

    var id: String { rawValue }
    var label: String {
        switch self {
        case .small: "Small"
        case .default: "Default"
        case .large: "Large"
        case .extraLarge: "Extra large"
        }
    }

    var dynamicType: DynamicTypeSize {
        switch self {
        case .small: .small
        case .default: .large
        case .large: .xxLarge
        case .extraLarge: .xxxLarge
        }
    }
}

@MainActor @Observable
final class DeviceSettings {
    static let shared = DeviceSettings()

    var mode: AppearanceMode {
        didSet { UserDefaults.standard.set(mode.rawValue, forKey: Keys.mode) }
    }
    var sounds: Bool {
        didSet { UserDefaults.standard.set(sounds, forKey: Keys.sounds) }
    }
    var textSize: InterfaceTextSize {
        didSet { UserDefaults.standard.set(textSize.rawValue, forKey: Keys.text) }
    }

    var scheme: ColorScheme? { mode.scheme }

    private init() {
        let defaults = UserDefaults.standard
        mode = AppearanceMode(rawValue: defaults.string(forKey: Keys.mode) ?? "") ?? .system
        sounds = defaults.object(forKey: Keys.sounds) as? Bool ?? true
        textSize = InterfaceTextSize(rawValue: defaults.string(forKey: Keys.text) ?? "") ?? .default
    }

    private enum Keys {
        static let mode = "aven.desktop.mode"
        static let sounds = "aven.desktop.sounds"
        static let text = "aven.desktop.text"
    }
}
