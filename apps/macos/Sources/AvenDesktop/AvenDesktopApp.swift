import AppKit
import AvenDesktopCore
import SwiftUI

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }
}

@main
struct AvenDesktopApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup("Aven") {
            RootView()
                .environment(model)
                .environment(DeviceSettings.shared)
                .frame(minWidth: 960, minHeight: 620)
        }
        .defaultSize(width: 1220, height: 800)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Thread") { model.newThread() }
                    .keyboardShortcut("n")
                    .disabled(!model.isSignedIn)
            }
            CommandMenu("Go") {
                Button("Threads") { model.show(.threads) }
                    .keyboardShortcut("1")
                Button("Cockpit") { model.show(.cockpit) }
                    .keyboardShortcut("2")
                Button("Bot") { model.show(.bots) }
                    .keyboardShortcut("3")
                Button("Workspace Settings") { model.show(.settings) }
                    .keyboardShortcut(",", modifiers: [.command, .shift])
                Divider()
                Button("Search") { model.palettePresented = true }
                    .keyboardShortcut("k")
            }
        }

        Settings {
            MacSettingsView()
                .environment(model)
                .environment(DeviceSettings.shared)
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(DeviceSettings.self) private var device

    var body: some View {
        Group {
            if model.isSignedIn {
                ShellView()
            } else {
                LoginView()
            }
        }
        .preferredColorScheme(device.scheme)
        .dynamicTypeSize(device.textSize.dynamicType)
        .task {
            await model.restore()
        }
    }
}

struct MacSettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(DeviceSettings.self) private var device

    var body: some View {
        @Bindable var model = model
        @Bindable var device = device
        Form {
            Section("Server") {
                TextField("Control plane", text: $model.serverText)
                    .disabled(model.isSignedIn)
                Text("Sign out before changing the server. A hosted address is used as https://host/api.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Section("Appearance") {
                Picker("Mode", selection: $device.mode) {
                    ForEach(AppearanceMode.allCases) { mode in
                        Text(mode.label).tag(mode)
                    }
                }
                Picker("Interface text size", selection: $device.textSize) {
                    ForEach(InterfaceTextSize.allCases) { size in
                        Text(size.label).tag(size)
                    }
                }
                Toggle("Sounds", isOn: $device.sounds)
                Text("Mode, text size and sounds stay on this Mac. Color palettes from the web app are not in this version.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .frame(width: 480)
        .padding()
    }
}
