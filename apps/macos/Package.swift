// swift-tools-version: 6.0
import PackageDescription

// Aven Desktop is the native macOS control plane. The library below is Foundation-only so
// `swift test` type-checks the API, models and screen catalog on Linux. The executable imports
// SwiftUI and is built only on macOS, where the SwiftPM manifest is evaluated.

#if os(macOS)
    let appProducts: [Product] = [
        .executable(name: "AvenDesktop", targets: ["AvenDesktop"]),
    ]
    let appTargets: [Target] = [
        .executableTarget(
            name: "AvenDesktop",
            dependencies: ["AvenDesktopCore"],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
    ]
#else
    let appProducts: [Product] = []
    let appTargets: [Target] = []
#endif

let package = Package(
    name: "AvenDesktop",
    products: [
        .library(name: "AvenDesktopCore", targets: ["AvenDesktopCore"]),
    ] + appProducts,
    targets: [
        .target(
            name: "AvenDesktopCore",
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .testTarget(
            name: "AvenDesktopCoreTests",
            dependencies: ["AvenDesktopCore"],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
    ] + appTargets
)
