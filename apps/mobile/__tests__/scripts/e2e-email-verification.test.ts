interface EmailVerificationE2eModule {
  buildVerificationEmail(baseEmail: string, suffix?: string): string;
  extractVerificationCode(html: string): string | null;
  getMailpitLatestMessageUrl(mailpitBaseUrl: string, email: string): string;
}

const helper = jest.requireActual(
  "../../scripts/run-email-verification-e2e"
) as EmailVerificationE2eModule;

describe("email verification E2E helper", () => {
  it("derives an isolated verification recipient from the normal E2E account", () => {
    expect(helper.buildVerificationEmail("e2e-ci@monyvi.test", "321")).toBe(
      "verification-321-e2e-ci@monyvi.test"
    );
  });

  it("builds a recipient-filtered Mailpit latest-message URL", () => {
    expect(
      helper.getMailpitLatestMessageUrl(
        "http://127.0.0.1:54324",
        "verification-321@monyvi.test"
      )
    ).toBe(
      "http://127.0.0.1:54324/view/latest.html?query=to%3Averification-321%40monyvi.test"
    );
  });

  it("extracts the six-digit code from the deterministic local template", () => {
    expect(
      helper.extractVerificationCode(
        '<div data-verification-code="123456">123456</div>'
      )
    ).toBe("123456");
  });

  it("falls back to a visible six-digit token when the marker is unavailable", () => {
    expect(
      helper.extractVerificationCode(
        "<p>Your Monyvi code:</p><strong>654321</strong>"
      )
    ).toBe("654321");
  });

  it("does not accept non-six-digit values as verification codes", () => {
    expect(
      helper.extractVerificationCode(
        '<div data-verification-code="12345">12345</div>'
      )
    ).toBeNull();
  });
});
