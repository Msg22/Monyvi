interface EmailVerificationE2eModule {
  buildVerificationEmail(
    baseEmail: string,
    suffix?: string
  ): string;
  extractConfirmationUrl(html: string): string | null;
  getMailpitLatestMessageUrl(
    mailpitBaseUrl: string,
    email: string
  ): string;
  resolveConfirmationRedirect(
    confirmationUrl: string,
    fetchImpl?: typeof fetch
  ): Promise<string>;
}

const helper = jest.requireActual(
  "../../scripts/run-email-verification-e2e"
) as EmailVerificationE2eModule;

describe("email verification E2E helper", () => {
  it("derives an isolated verification recipient from the normal E2E account", () => {
    expect(
      helper.buildVerificationEmail("e2e-ci@monyvi.test", "321")
    ).toBe("verification-321-e2e-ci@monyvi.test");
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

  it("extracts and HTML-decodes the Supabase confirmation URL", () => {
    expect(
      helper.extractConfirmationUrl(
        '<p><a href="http://127.0.0.1:54321/auth/v1/verify?token=abc&amp;type=signup&amp;redirect_to=monyvi%3A%2F%2Fauth-callback">Confirm</a></p>'
      )
    ).toBe(
      "http://127.0.0.1:54321/auth/v1/verify?token=abc&type=signup&redirect_to=monyvi%3A%2F%2Fauth-callback"
    );
  });

  it("resolves the host confirmation request to the canonical native callback without following it", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      status: 302,
      headers: {
        get: (name: string): string | null =>
          name.toLowerCase() === "location"
            ? "monyvi://auth-callback#access_token=a&refresh_token=b"
            : null,
      },
    });

    await expect(
      helper.resolveConfirmationRedirect(
        "http://127.0.0.1:54321/auth/v1/verify?token=abc",
        fetchImpl as unknown as typeof fetch
      )
    ).resolves.toBe(
      "monyvi://auth-callback#access_token=a&refresh_token=b"
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:54321/auth/v1/verify?token=abc",
      { redirect: "manual" }
    );
  });

  it("rejects any confirmation redirect that does not return to Monyvi", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      status: 302,
      headers: {
        get: (): string => "https://evil.example/callback",
      },
    });

    await expect(
      helper.resolveConfirmationRedirect(
        "http://127.0.0.1:54321/auth/v1/verify?token=abc",
        fetchImpl as unknown as typeof fetch
      )
    ).rejects.toThrow("canonical Monyvi auth callback");
  });
});
