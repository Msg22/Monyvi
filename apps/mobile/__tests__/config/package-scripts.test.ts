interface MobilePackageJson {
  readonly scripts: {
    readonly "android:release": string;
  };
}

interface RootPackageJson {
  readonly scripts: {
    readonly "db:types:local": string;
    readonly "db:sync-local": string;
  };
}

const mobilePackage =
  jest.requireActual<MobilePackageJson>("../../package.json");
const rootPackage = jest.requireActual<RootPackageJson>(
  "../../../../package.json"
);

describe("mobile package scripts", () => {
  it("clears stale Metro workspace opt-out values for release starts", () => {
    expect(mobilePackage.scripts["android:release"]).toContain(
      "EXPO_NO_METRO_WORKSPACE_ROOT=false"
    );
  });

  it("generates local migration types from local Supabase", () => {
    expect(rootPackage.scripts["db:types:local"]).toContain("--local");
    expect(rootPackage.scripts["db:sync-local"]).toContain("db:types:local");
    expect(rootPackage.scripts["db:sync-local"]).not.toMatch(
      /npm run db:sync$/
    );
  });
});
