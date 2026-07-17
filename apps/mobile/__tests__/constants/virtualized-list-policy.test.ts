import { ANDROID_SAFE_LIST_PROPS } from "@/constants/virtualized-list-policy";

describe("ANDROID_SAFE_LIST_PROPS", () => {
  it("opts out of native clipped-subview removal", () => {
    expect(ANDROID_SAFE_LIST_PROPS).toEqual({
      removeClippedSubviews: false,
    });
  });
});
