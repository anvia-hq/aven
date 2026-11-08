import SwiftUI

/// The platform's Mint dark theme (decision 0155), the only one the app has: charcoal with a faint
/// green tint. The values are the web app's oklch tokens in sRGB.
enum Theme {
    static let background = Color(red: 0.048, green: 0.065, blue: 0.055)
    static let card = Color(red: 0.073, green: 0.092, blue: 0.081)
    static let mutedForeground = Color(red: 0.514, green: 0.530, blue: 0.521)
    static let accent = Color(red: 0.000, green: 0.812, blue: 0.491)
    static let destructive = Color(red: 0.970, green: 0.361, blue: 0.379)
}

extension View {
    func themedScreen() -> some View {
        scrollContentBackground(.hidden)
            .background(Theme.background.ignoresSafeArea())
            .toolbarBackground(Theme.background, for: .navigationBar)
    }
}
