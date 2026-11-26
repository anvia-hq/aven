import SwiftUI

@main
struct AvenApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            Group {
                if model.isSignedIn {
                    RootView()
                } else {
                    LoginView()
                }
            }
            .environment(model)
            .preferredColorScheme(.dark)
            .tint(Theme.primary)
            .onOpenURL { url in
                Task { await model.handleIncomingURL(url) }
            }
        }
    }
}
