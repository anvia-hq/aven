import AvenDesktopCore
import SwiftUI

struct LoginView: View {
    @Environment(AppModel.self) private var model
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var invitation = ""
    @State private var registering = false
    @State private var config: PlatformConfig?
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        @Bindable var model = model
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text(registering ? "Create your account" : "Sign in to Aven")
                    .font(.title.weight(.semibold))
                Text(registering
                    ? "The first account on a server becomes its owner."
                    : "Welcome back. Enter your details to continue.")
                    .foregroundStyle(.secondary)
            }
            TextField("Server", text: $model.serverText)
                .textFieldStyle(.roundedBorder)
                .onSubmit { Task { await loadConfig() } }
            if showEmail {
                if registering {
                    TextField("Name", text: $name)
                        .textFieldStyle(.roundedBorder)
                }
                TextField("Email", text: $email)
                    .textFieldStyle(.roundedBorder)
                SecureField("Password", text: $password)
                    .textFieldStyle(.roundedBorder)
                TextField("Invitation", text: $invitation)
                    .textFieldStyle(.roundedBorder)
                Text("Leave the invitation blank unless someone sent you one.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Button(registering ? "Register" : "Sign in") {
                    Task { await submit() }
                }
                .keyboardShortcut(.defaultAction)
                .disabled(busy || email.isEmpty || password.isEmpty || (registering && name.isEmpty))
                if showRegister {
                    Button(registering ? "Have an account? Sign in" : "Don't have an account? Register") {
                        registering.toggle()
                        error = nil
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                }
            } else {
                Text("This server signs in with GitHub in the browser. Aven Desktop uses the email session token, so email sign-in has to be on for this app.")
                    .foregroundStyle(.secondary)
            }
            if config?.githubLogin == true && showEmail {
                Text("Sign in with GitHub stays in the browser. It does not create a session for this app.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let error {
                Text(error).foregroundStyle(.red).font(.callout)
            }
        }
        .padding(32)
        .frame(maxWidth: 420)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task { await loadConfig() }
    }

    private var showEmail: Bool { config?.emailLogin ?? true }
    private var showRegister: Bool { showEmail && (config?.registrationEnabled ?? true) }

    private func loadConfig() async {
        guard let url = try? APIClient.normalize(server: model.serverText) else { return }
        let api = APIClient(baseURL: url)
        config = try? await api.platformConfig()
    }

    private func submit() async {
        busy = true
        error = nil
        do {
            try await model.signIn(
                email: email, password: password, name: registering ? name : nil,
                invitation: invitation.trimmingCharacters(in: .whitespaces))
        } catch {
            self.error = errorText(error)
        }
        busy = false
    }
}
