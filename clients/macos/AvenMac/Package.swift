// swift-tools-version: 6.0
import PackageDescription

// The macOS app: SwiftUI over AvenKit. SwiftUI's macros ship with Xcode, so this needs full Xcode
// to build (`xcodebuild`, or open this folder in Xcode); the Command Line Tools alone cannot.
let package = Package(
    name: "AvenMac",
    platforms: [.macOS(.v14)],
    dependencies: [.package(path: "../AvenKit")],
    targets: [
        .executableTarget(
            name: "AvenMac",
            dependencies: [.product(name: "AvenKit", package: "AvenKit")],
            swiftSettings: [.swiftLanguageMode(.v5)]
        )
    ]
)
