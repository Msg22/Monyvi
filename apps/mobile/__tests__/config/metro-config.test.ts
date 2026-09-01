import path from "node:path";

interface MetroConfigShape {
  readonly watchFolders?: readonly string[];
  readonly resolver: {
    readonly assetExts: readonly string[];
    readonly sourceExts: readonly string[];
    readonly nodeModulesPaths?: readonly string[];
    readonly disableHierarchicalLookup?: boolean;
    readonly blockList?: unknown;
  };
  readonly transformer: Record<string, unknown>;
}

const projectRoot = path.resolve(__dirname, "../..");
const workspaceRoot = path.resolve(projectRoot, "../..");
const workspaceNodeModules = path.resolve(workspaceRoot, "node_modules");
const packageLogicRoot = path.resolve(workspaceRoot, "packages/logic");
const packageDbRoot = path.resolve(workspaceRoot, "packages/db");

function readWorkspaceOptOut(): string | undefined {
  const value: unknown = process.env.EXPO_NO_METRO_WORKSPACE_ROOT;
  return typeof value === "string" ? value : undefined;
}

function loadMetroConfig(
  realNodeModulesRoot: string = workspaceNodeModules,
  hasWorkspaceNodeModules: boolean = true
): MetroConfigShape {
  jest.resetModules();

  jest.doMock("node:fs", () => ({
    existsSync: jest.fn(() => hasWorkspaceNodeModules),
    realpathSync: {
      native: jest.fn(() => realNodeModulesRoot),
    },
  }));
  jest.doMock("@sentry/react-native/metro", () => ({
    getSentryExpoConfig: jest.fn(() => ({
      watchFolders: [
        workspaceNodeModules,
        projectRoot,
        packageLogicRoot,
        packageDbRoot,
      ],
      resolver: {
        assetExts: ["png", "svg"],
        sourceExts: ["js", "ts"],
        nodeModulesPaths: [
          path.resolve(projectRoot, "node_modules"),
          workspaceNodeModules,
        ],
        disableHierarchicalLookup: false,
        blockList: [],
      },
      transformer: {},
    })),
  }));

  jest.doMock("nativewind/metro", () => ({
    withNativeWind: jest.fn((config: MetroConfigShape) => config),
  }));

  jest.doMock("react-native-svg-transformer", () => ({}));

  return jest.requireActual("../../metro.config");
}

describe("metro config", () => {
  const originalWorkspaceOptOut = readWorkspaceOptOut();

  afterEach(() => {
    if (originalWorkspaceOptOut === undefined) {
      delete process.env.EXPO_NO_METRO_WORKSPACE_ROOT;
    } else {
      process.env.EXPO_NO_METRO_WORKSPACE_ROOT = originalWorkspaceOptOut;
    }
  });

  it("preserves Expo monorepo visibility roots for hoisted dependencies", () => {
    const config = loadMetroConfig();

    expect(config.watchFolders).toEqual([
      workspaceNodeModules,
      projectRoot,
      packageLogicRoot,
      packageDbRoot,
    ]);
    expect(config.resolver.nodeModulesPaths).toEqual([
      path.resolve(projectRoot, "node_modules"),
      workspaceNodeModules,
    ]);
  });

  it("uses node_modules realpath when a secondary worktree links dependencies", () => {
    const mainNodeModules = path.resolve(
      workspaceRoot,
      "../Monyvi/node_modules"
    );
    const config = loadMetroConfig(mainNodeModules);

    expect(config.watchFolders).toEqual([
      mainNodeModules,
      projectRoot,
      packageLogicRoot,
      packageDbRoot,
    ]);
    expect(config.resolver.nodeModulesPaths).toEqual([
      path.resolve(projectRoot, "node_modules"),
      mainNodeModules,
    ]);
  });

  it("uses explicit real node_modules paths for linked worktrees", () => {
    const mainNodeModules = path.resolve(
      workspaceRoot,
      "../Monyvi/node_modules"
    );
    const config = loadMetroConfig(mainNodeModules);

    expect(config.resolver.disableHierarchicalLookup).toBe(true);
    expect(config.resolver.nodeModulesPaths).toContain(mainNodeModules);
  });

  it("keeps Sentry paths when node_modules is unavailable", () => {
    const config = loadMetroConfig(workspaceNodeModules, false);

    expect(config.watchFolders).toContain(workspaceNodeModules);
    expect(config.resolver.nodeModulesPaths).toContain(workspaceNodeModules);
  });

  it("does not add the whole workspace root as an extra Metro crawl root", () => {
    const config = loadMetroConfig();

    expect(config.watchFolders).not.toContain(workspaceRoot);
  });
});
