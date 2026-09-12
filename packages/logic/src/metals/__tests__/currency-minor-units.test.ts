import {
  resolveCurrencyDisplayMinorUnits,
  resolveMetalsCurrencyMinorUnits,
} from "../currency-minor-units";
import type { CurrencyInstrumentCode } from "../rate-reference";

describe("Metals ISO currency minor units", () => {
  it.each([
    ["currency:EGP", 2],
    ["currency:SAR", 2],
    ["currency:KWD", 3],
    ["currency:JOD", 3],
    ["currency:JPY", 0],
    ["currency:KRW", 0],
  ] as const)("resolves %s to %s minor units", (instrumentCode, expected) => {
    expect(resolveMetalsCurrencyMinorUnits(instrumentCode)).toBe(expected);
  });

  it("returns null for an unsupported runtime instrument", () => {
    expect(
      resolveMetalsCurrencyMinorUnits(
        "currency:ZZZ" as CurrencyInstrumentCode
      )
    ).toBeNull();
  });
});

describe("canonical currency display minor units", () => {
  it.each([
    ["EGP", 2],
    ["KWD", 3],
    ["JPY", 0],
    ["BTC", 8],
  ] as const)("resolves %s display precision to %s", (currency, expected) => {
    expect(resolveCurrencyDisplayMinorUnits(currency)).toBe(expected);
  });
});
