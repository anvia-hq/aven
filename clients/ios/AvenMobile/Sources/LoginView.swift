import AVFoundation
import SwiftUI
import UIKit

struct LoginView: View {
    @Environment(AppModel.self) private var model
    @State private var cameraState: CameraState = .checking
    @State private var showPasteSheet = false
    @State private var pastedLink = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                VStack(spacing: 8) {
                    Text("Sign in with QR")
                        .font(.title2.weight(.semibold))
                    Text("Open Aven on the web, go to Settings → Profile, and tap Link mobile.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.mutedForeground)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 12)

                scannerFrame

                if let error = model.pairingError {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(Theme.destructive)
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(Theme.destructive)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Button {
                            model.pairingError = nil
                        } label: {
                            Image(systemName: "xmark")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(Theme.mutedForeground)
                        }
                        .accessibilityLabel("Dismiss error")
                    }
                    .padding(12)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 12))
                }

                Spacer(minLength: 0)

                Button {
                    pastedLink = UIPasteboard.general.string ?? ""
                    showPasteSheet = true
                } label: {
                    Label("Paste pairing link", systemImage: "link")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Theme.foreground)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Theme.secondary, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(Theme.input, lineWidth: 1)
                        )
                }
                .disabled(model.isPairing)
                .accessibilityIdentifier("pastePairingLink")
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Aven")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Theme.background, for: .navigationBar)
            .task { await prepareCamera() }
            .sheet(isPresented: $showPasteSheet) { pasteSheet }
        }
    }

    private var scannerFrame: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Theme.card)

            switch cameraState {
            case .ready:
                QRScannerView(
                    isPaused: model.isPairing || model.pairingError != nil || showPasteSheet
                ) { scanned in
                    Task { await submit(scanned) }
                }
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                ScannerReticle()
                    .padding(28)

            case .checking:
                ProgressView()

            case .denied:
                VStack(spacing: 12) {
                    Image(systemName: "camera.fill")
                        .font(.title2)
                        .foregroundStyle(Theme.mutedForeground)
                    Text("Camera access is off")
                        .font(.headline)
                    Text("Allow camera access in Settings to scan your QR code, or paste a pairing link below.")
                        .font(.footnote)
                        .foregroundStyle(Theme.mutedForeground)
                        .multilineTextAlignment(.center)
                    Button {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            UIApplication.shared.open(url)
                        }
                    } label: {
                        Text("Open Settings")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(Theme.primaryForeground)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(Theme.primary, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    .padding(.top, 4)
                }
                .padding(24)

            case .unavailable:
                VStack(spacing: 12) {
                    Image(systemName: "qrcode.viewfinder")
                        .font(.system(size: 36))
                        .foregroundStyle(Theme.primary)
                    Text("Camera unavailable")
                        .font(.headline)
                        .foregroundStyle(Theme.foreground)
                    Text("Copy the pairing link from Aven web and tap Paste pairing link below.")
                        .font(.footnote)
                        .foregroundStyle(Theme.mutedForeground)
                        .multilineTextAlignment(.center)
                }
                .padding(24)
            }

            if model.isPairing {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(Theme.background.opacity(0.82))
                VStack(spacing: 10) {
                    ProgressView()
                    Text("Signing in…")
                        .font(.subheadline)
                        .foregroundStyle(Theme.mutedForeground)
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .frame(maxWidth: 320)
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Theme.input, lineWidth: 1)
        )
    }

    private var pasteSheet: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(
                        "Pairing link",
                        text: $pastedLink,
                        prompt: Text("aven://pair?server=...&code=..."),
                        axis: .vertical
                    )
                    .lineLimit(2...5)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .accessibilityIdentifier("pairingLinkField")
                } footer: {
                    Text("Copy the link from Settings → Profile → Link mobile in the Aven web app.")
                        .foregroundStyle(Theme.mutedForeground)
                }
                .listRowBackground(Theme.card)

                Section {
                    Button("Sign in") {
                        let value = pastedLink
                        showPasteSheet = false
                        Task { await submit(value) }
                    }
                    .disabled(pastedLink.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("submitPairingLink")
                }
                .listRowBackground(Theme.card)
            }
            .themedScreen()
            .navigationTitle("Paste pairing link")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showPasteSheet = false }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func prepareCamera() async {
        guard AVCaptureDevice.default(for: .video) != nil else {
            cameraState = .unavailable
            return
        }

        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            cameraState = .ready
        case .notDetermined:
            let granted = await AVCaptureDevice.requestAccess(for: .video)
            cameraState = granted ? .ready : .denied
        case .denied, .restricted:
            cameraState = .denied
        @unknown default:
            cameraState = .denied
        }
    }

    private func submit(_ raw: String) async {
        do {
            try await model.signIn(with: raw)
        } catch {
            model.pairingError = error.localizedDescription
        }
    }
}

private struct ScannerReticle: View {
    private let cornerLength: CGFloat = 24
    private let lineWidth: CGFloat = 3

    var body: some View {
        GeometryReader { geometry in
            let w = geometry.size.width
            let h = geometry.size.height
            Path { path in
                path.move(to: CGPoint(x: 0, y: cornerLength))
                path.addLine(to: CGPoint(x: 0, y: 0))
                path.addLine(to: CGPoint(x: cornerLength, y: 0))

                path.move(to: CGPoint(x: w - cornerLength, y: 0))
                path.addLine(to: CGPoint(x: w, y: 0))
                path.addLine(to: CGPoint(x: w, y: cornerLength))

                path.move(to: CGPoint(x: w, y: h - cornerLength))
                path.addLine(to: CGPoint(x: w, y: h))
                path.addLine(to: CGPoint(x: w - cornerLength, y: h))

                path.move(to: CGPoint(x: cornerLength, y: h))
                path.addLine(to: CGPoint(x: 0, y: h))
                path.addLine(to: CGPoint(x: 0, y: h - cornerLength))
            }
            .stroke(Theme.primary, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round))
        }
        .allowsHitTesting(false)
    }
}
