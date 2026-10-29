import AppKit
import SwiftUI

// A SwiftPM executable has no app bundle, so it must ask macOS to treat it as a regular
// foreground app (dock icon, menu bar, keyboard focus). Built as an Xcode app target this is moot.
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }
}

@main
struct AvenApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup("Aven") {
            Group {
                if model.isSignedIn {
                    RootView()
                } else {
                    LoginView()
                }
            }
            .environment(model)
            .frame(minWidth: 760, minHeight: 480)
        }
        .defaultSize(width: 1100, height: 720)
    }
}
