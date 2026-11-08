import SwiftUI

@main
struct AvenApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            Group {
                if model.isSignedIn {
                    ThreadListView()
                } else {
                    LoginView()
                }
            }
            .environment(model)
            .preferredColorScheme(.dark)
            .tint(Theme.accent)
        }
    }
}
