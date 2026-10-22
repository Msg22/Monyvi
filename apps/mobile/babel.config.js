module.exports = function (api) {
  // Cache separately by Babel environment. Jest executes CommonJS through
  // jest-expo; Metro must retain its own production import() handling.
  const isTest = api.env("test");
  return {
    presets: [
      [
        "babel-preset-expo",
        { jsxImportSource: "nativewind", disableDeepImportWarnings: true },
      ],
    ],
    plugins: [
      // The existing Expo test preset supplies the CommonJS module transform.
      // Lower only test import() to Promise-deferred module evaluation; do not
      // enable Node VM modules or replace the runtime's lazy import boundary.
      ...(isTest ? ["@babel/plugin-transform-dynamic-import"] : []),
      ["@babel/plugin-proposal-decorators", { legacy: true }],
      [
        "module-resolver",
        {
          root: ["./"],
          alias: {
            "@": "./",
            "@monyvi/mobile": "./",
            "@monyvi/logic": "../../packages/logic/src",
            "@monyvi/db": "../../packages/db/src",
          },
        },
      ],
      "react-native-reanimated/plugin",
    ],
  };
};
