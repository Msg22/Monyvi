import AsyncStorage from "@react-native-async-storage/async-storage";
import { persistIntroLocaleOverride } from "@/services/intro-flag-service";

it("does not report successful selection when device preference cannot be saved", async (): Promise<void> => {
  jest
    .mocked(AsyncStorage.setItem)
    .mockRejectedValueOnce(new Error("disk unavailable"));
  await expect(persistIntroLocaleOverride("ar")).rejects.toThrow(
    "disk unavailable"
  );
});
