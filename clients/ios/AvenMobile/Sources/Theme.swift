import SwiftUI

/// Aven's default dark theme from apps/platform/src/index.css (.dark), oklch tokens in sRGB.
enum Theme {
    static let background = Color(red: 0.103, green: 0.104, blue: 0.110)
    static let foreground = Color(red: 0.868, green: 0.869, blue: 0.878)
    static let card = Color(red: 0.121, green: 0.122, blue: 0.128)
    static let popover = Color(red: 0.130, green: 0.131, blue: 0.137)
    static let primary = Color(red: 0.907, green: 0.908, blue: 0.917)
    static let primaryForeground = Color(red: 0.068, green: 0.068, blue: 0.074)
    static let secondary = Color(red: 0.130, green: 0.131, blue: 0.137)
    static let muted = Color(red: 0.112, green: 0.113, blue: 0.119)
    static let mutedForeground = Color(red: 0.524, green: 0.525, blue: 0.533)
    static let border = Color.white.opacity(0.07)
    static let input = Color.white.opacity(0.12)
    static let destructive = Color(red: 0.970, green: 0.361, blue: 0.379)
    static let success = Color(red: 0.220, green: 0.815, blue: 0.501)
}

extension View {
    func themedScreen() -> some View {
        scrollContentBackground(.hidden)
            .background(Theme.background.ignoresSafeArea())
            .toolbarBackground(Theme.background, for: .navigationBar)
    }
}
