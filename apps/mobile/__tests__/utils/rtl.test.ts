import { I18nManager } from "react-native";
import { reloadAppAsync } from "expo";
import { applyRTL } from "@/utils/rtl";

jest.mock("expo", () => ({
  reloadAppAsync: jest.fn().mockResolvedValue(undefined),
}));

describe("selected language controls native direction", (): void => {
  const originalDirection = Object.getOwnPropertyDescriptor(
    I18nManager,
    "isRTL"
  );
  afterEach((): void => {
    jest.restoreAllMocks();
    if (originalDirection)
      Object.defineProperty(I18nManager, "isRTL", originalDirection);
  });
  beforeEach((): void => {
    jest.clearAllMocks();
    jest.spyOn(I18nManager, "allowRTL").mockImplementation(() => undefined);
    jest.spyOn(I18nManager, "forceRTL").mockImplementation(() => undefined);
  });

  it("disables device-driven RTL for English even when already LTR", async (): Promise<void> => {
    Object.defineProperty(I18nManager, "isRTL", {
      configurable: true,
      value: false,
    });
    await applyRTL(false);
    expect(I18nManager.allowRTL).toHaveBeenCalledWith(false);
    expect(I18nManager.forceRTL).toHaveBeenCalledWith(false);
    expect(reloadAppAsync).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "reloads through Expo when target RTL is %s",
    async (target): Promise<void> => {
      Object.defineProperty(I18nManager, "isRTL", {
        configurable: true,
        value: !target,
      });
      await applyRTL(target);
      expect(I18nManager.allowRTL).toHaveBeenCalledWith(target);
      expect(I18nManager.forceRTL).toHaveBeenCalledWith(target);
      expect(reloadAppAsync).toHaveBeenCalledTimes(1);
    }
  );
});
