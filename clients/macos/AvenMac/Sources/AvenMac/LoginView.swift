import SwiftUI

struct LoginView: View {
    @Environment(AppModel.self) private var model
    @State private var server = ""
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var creating = false
    @State private var working = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 20) {
            VStack(spacing: 4) {
                Text("Aven").font(.largeTitle.weight(.semibold))
                Text("Sign in to your control plane").foregroundStyle(.secondary)
            }
            Form {
                TextField("Server", text: $server, prompt: Text("localhost:8000"))
                    .autocorrectionDisabled()
                if creating { TextField("Name", text: $name) }
                TextField("Email", text: $email).textContentType(.username)
                SecureField("Password", text: $password).textContentType(.password)
            }
            .formStyle(.columns)
            .frame(width: 320)
            if let error {
                Text(error).foregroundStyle(.red).font(.callout).frame(width: 320)
            }
            Button(creating ? "Create account" : "Sign in") { Task { await submit() } }
                .keyboardShortcut(.defaultAction)
                .buttonStyle(.borderedProminent)
                .disabled(working || email.isEmpty || password.isEmpty || server.isEmpty)
            Button(creating ? "I already have an account" : "Create an account") {
                creating.toggle()
                error = nil
            }
            .buttonStyle(.link)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear { server = model.server }
    }

    private func submit() async {
        working = true
        error = nil
        do {
            try await model.signIn(
                server: server, email: email, password: password, name: creating ? name : nil)
        } catch {
            self.error = error.localizedDescription
        }
        working = false
    }
}
