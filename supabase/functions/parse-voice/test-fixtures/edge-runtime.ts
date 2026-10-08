import { setCapturedServeHandler, type CapturedServeHandler } from "./state.ts";

Object.defineProperty(Deno, "serve", {
  configurable: true,
  value: (handler: CapturedServeHandler): void => {
    setCapturedServeHandler(handler);
  },
});

export {};
