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
        NavigationStack {
            Form {
                Section {
                    TextField("Server", text: $server, prompt: Text("aven.example.com"))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .accessibilityIdentifier("server")
                    if creating { TextField("Name", text: $name).textContentType(.name) }
                    TextField("Email", text: $email)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .accessibilityIdentifier("email")
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .accessibilityIdentifier("password")
                }
                .listRowBackground(Theme.card)
                if let error {
                    Section { Text(error).foregroundStyle(Theme.destructive) }
                        .listRowBackground(Theme.card)
                }
                Section {
                    Button(creating ? "Create account" : "Sign in") { Task { await submit() } }
                        .disabled(working || email.isEmpty || password.isEmpty || server.isEmpty)
                    Button(creating ? "I already have an account" : "Create an account") {
                        creating.toggle()
                        error = nil
                    }
                }
                .listRowBackground(Theme.card)
            }
            .themedScreen()
            .navigationTitle("Aven")
            .onAppear { server = model.server }
        }
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
