import AVFoundation
import SwiftUI
import UIKit

enum CameraState: Equatable {
    case checking
    case ready
    case denied
    case unavailable
}

struct QRScannerView: UIViewControllerRepresentable {
    var isPaused: Bool
    var onScan: (String) -> Void

    func makeUIViewController(context: Context) -> QRScannerViewController {
        let controller = QRScannerViewController()
        controller.onScan = onScan
        return controller
    }

    func updateUIViewController(_ uiViewController: QRScannerViewController, context: Context) {
        uiViewController.onScan = onScan
        uiViewController.isPaused = isPaused
    }
}

final class QRScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onScan: ((String) -> Void)?
    var isPaused = false {
        didSet {
            if isPaused == oldValue { return }
            updateSessionRunning()
        }
    }

    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "dev.anvia.aven.qrscanner")
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var isConfigured = false
    private var isVisible = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear

        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        view.layer.addSublayer(preview)
        previewLayer = preview

        configureSession()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        isVisible = true
        updateSessionRunning()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        isVisible = false
        updateSessionRunning()
    }

    private func configureSession() {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            guard
                let device = AVCaptureDevice.default(for: .video),
                let input = try? AVCaptureDeviceInput(device: device),
                self.session.canAddInput(input)
            else { return }

            let output = AVCaptureMetadataOutput()
            guard self.session.canAddOutput(output) else { return }

            self.session.beginConfiguration()
            self.session.addInput(input)
            self.session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            if output.availableMetadataObjectTypes.contains(.qr) {
                output.metadataObjectTypes = [.qr]
            }
            self.session.commitConfiguration()
            self.isConfigured = true

            DispatchQueue.main.async {
                self.updateSessionRunning()
            }
        }
    }

    private func updateSessionRunning() {
        let shouldRun = isVisible && !isPaused
        sessionQueue.async { [weak self] in
            guard let self, self.isConfigured else { return }
            if shouldRun && !self.session.isRunning {
                self.session.startRunning()
            } else if !shouldRun && self.session.isRunning {
                self.session.stopRunning()
            }
        }
    }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard !isPaused else { return }
        guard
            let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
            object.type == .qr,
            let value = object.stringValue,
            !value.isEmpty
        else { return }

        UINotificationFeedbackGenerator().notificationOccurred(.success)
        onScan?(value)
    }
}
