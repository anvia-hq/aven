import XCTest

final class SignInTests: XCTestCase {
    func testSignInShowsTheThreadList() throws {
        let env = ProcessInfo.processInfo.environment
        let server = try XCTUnwrap(env["AVEN_TEST_SERVER"], "Set TEST_RUNNER_AVEN_TEST_SERVER")
        let email = try XCTUnwrap(env["AVEN_TEST_EMAIL"], "Set TEST_RUNNER_AVEN_TEST_EMAIL")
        let password = try XCTUnwrap(env["AVEN_TEST_PASSWORD"], "Set TEST_RUNNER_AVEN_TEST_PASSWORD")

        let app = XCUIApplication()
        app.launch()

        let serverField = app.textFields["server"]
        XCTAssertTrue(serverField.waitForExistence(timeout: 10))
        serverField.tap()
        serverField.typeText(server)
        let emailField = app.textFields["email"]
        emailField.tap()
        emailField.typeText(email)
        let passwordField = app.secureTextFields["password"]
        passwordField.tap()
        passwordField.typeText(password)
        app.buttons["Sign in"].tap()

        XCTAssertTrue(app.navigationBars["Threads"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["No threads yet"].waitForExistence(timeout: 5))
    }
}
