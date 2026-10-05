interface CoordinatorModule {
  createAuthSessionMutationCoordinator: unknown;
}

describe("auth-session mutation coordinator contract", () => {
  it("exports the approved coordinator factory boundary", () => {
    const coordinatorModule = jest.requireActual<CoordinatorModule>(
      "@/services/auth-session-mutation-coordinator"
    );

    expect(coordinatorModule.createAuthSessionMutationCoordinator).toEqual(
      expect.any(Function)
    );
  });
});
