import { useReducedMotion } from "react-native-reanimated";

describe("global Reanimated Jest mock", () => {
  it("provides the reduced-motion hook used by animated components", () => {
    expect(typeof useReducedMotion).toBe("function");
    expect(useReducedMotion()).toBe(false);
  });
});
