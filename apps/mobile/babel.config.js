module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        "babel-preset-expo",
        { jsxImportSource: "nativewind", disableDeepImportWarnings: true },
      ],
    ],
    plugins: [
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
