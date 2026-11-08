// swift-tools-version: 6.0
import PackageDescription

// The client library for the Aven control plane (decision 0008): wire types, the transcript
// reducer, the API client and the Keychain token store. Foundation only, no UI and no third-party
// packages, so it builds and tests with just the Swift toolchain: `swift test`.
let package = Package(
    name: "AvenKit",
    platforms: [.macOS(.v14), .iOS(.v17)],
    products: [.library(name: "AvenKit", targets: ["AvenKit"])],
    targets: [
        .target(name: "AvenKit", swiftSettings: [.swiftLanguageMode(.v5)]),
        .testTarget(
            name: "AvenKitTests",
            dependencies: ["AvenKit"],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
    ]
)
