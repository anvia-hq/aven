import XCTest

final class SignInTests: XCTestCase {
    func testPairingLinkShowsTheThreadList() throws {
        let env = ProcessInfo.processInfo.environment
        let pairingURL = try XCTUnwrap(
            env["AVEN_TEST_PAIRING_URL"], "Set TEST_RUNNER_AVEN_TEST_PAIRING_URL")

        let app = XCUIApplication()
        app.launch()

        let pasteButton = app.buttons["pastePairingLink"]
        XCTAssertTrue(pasteButton.waitForExistence(timeout: 10))
        pasteButton.tap()

        let linkField = app.textViews["pairingLinkField"].exists
            ? app.textViews["pairingLinkField"]
            : app.textFields["pairingLinkField"]
        XCTAssertTrue(linkField.waitForExistence(timeout: 5))
        linkField.tap()
        linkField.typeText(pairingURL)
        app.buttons["submitPairingLink"].tap()

        XCTAssertTrue(app.navigationBars["Threads"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["No threads yet"].waitForExistence(timeout: 5))
    }
}
