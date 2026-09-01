const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withNativeWind } = require("nativewind/metro");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceNodeModules = path.resolve(projectRoot, "../..", "node_modules");
const realWorkspaceNodeModules = fs.existsSync(workspaceNodeModules)
  ? fs.realpathSync.native(workspaceNodeModules)
  : workspaceNodeModules;
const metroIgnoredPaths = [
  path.resolve(projectRoot, "android"),
  path.resolve(projectRoot, ".expo"),
  path.resolve(projectRoot, "coverage"),
  path.resolve(projectRoot, ".gradle"),
  path.resolve(projectRoot, "build"),
  path.resolve(projectRoot, ".kotlin"),
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pathToBlockListPattern(filePath) {
  const pattern = path
    .resolve(filePath)
    .split(path.sep)
    .map(escapeRegExp)
    .join("[/\\\\]");

  return new RegExp(`${pattern}(?:[/\\\\].*)?$`);
}

const config = getSentryExpoConfig(projectRoot);

config.watchFolders = config.watchFolders.map((folder) =>
  folder === workspaceNodeModules ? realWorkspaceNodeModules : folder
);
config.resolver.nodeModulesPaths = config.resolver.nodeModulesPaths.map((folder) =>
  folder === workspaceNodeModules ? realWorkspaceNodeModules : folder
);
config.resolver.disableHierarchicalLookup = true;

config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList].filter(Boolean)),
  ...metroIgnoredPaths.map(pathToBlockListPattern),
];

config.transformer.babelTransformerPath =
  require.resolve("react-native-svg-transformer");
config.resolver.assetExts = config.resolver.assetExts.filter(
  (ext) => ext !== "svg"
);
config.resolver.sourceExts = [...config.resolver.sourceExts, "svg"];

module.exports = withNativeWind(config, {
  input: "./global.css",
  getCSSForPlatform: async (platform) => platform,
});
