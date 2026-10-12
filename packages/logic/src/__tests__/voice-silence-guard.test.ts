import {
  classifyVoiceSilence,
  createAudioMeteringAccumulator,
  isVoiceSilenceRejected,
  METERING_MAX_ACTIVE_GAP_MS,
  METERING_MAX_LEADING_UNCOVERED_MS,
  METERING_MAX_TRAILING_UNCOVERED_MS,
  METERING_MIN_ACTIVE_DURATION_MS,
  METERING_MIN_VALID_SAMPLES,
  METERING_SENTINEL_FLOOR_DBFS,
  METERING_SILENCE_THRESHOLD_DBFS,
  type AudioMeteringSummary,
} from "../voice-silence-guard";

describe("voice-silence-guard", () => {
  describe("constants", () => {
    it("defines the exact approved contract thresholds and constants", () => {
      expect(METERING_SILENCE_THRESHOLD_DBFS).toBe(-70.0);
      expect(METERING_MIN_ACTIVE_DURATION_MS).toBe(1500);
      expect(METERING_MIN_VALID_SAMPLES).toBe(10);
      expect(METERING_MAX_ACTIVE_GAP_MS).toBe(250);
      expect(METERING_MAX_LEADING_UNCOVERED_MS).toBe(200);
      expect(METERING_MAX_TRAILING_UNCOVERED_MS).toBe(200);
      expect(METERING_SENTINEL_FLOOR_DBFS).toBe(-160.0);
    });
  });

  describe("classifyVoiceSilence", () => {
    const createDenseSilentSummary = (
      overrides: Partial<AudioMeteringSummary> = {}
    ): AudioMeteringSummary => ({
      validSampleCount: 15,
      hasAudibleSample: false,
      hasSentinelOrPoison: false,
      firstSampleActiveMs: 50,
      lastSampleActiveMs: 1450,
      maxActiveGapMs: 100,
      activeDurationMs: 1500,
      ...overrides,
    });

    it("confirms silence and rejects when candidate meets all valid coverage criteria", () => {
      const summary = createDenseSilentSummary();
      const result = classifyVoiceSilence(summary);

      expect(result.isSilent).toBe(true);
      expect(result.reason).toBe("silence_confirmed");
      expect(isVoiceSilenceRejected(summary)).toBe(true);
    });

    it("fails open when any sample is at exact equality with threshold (-70.0 dBFS)", () => {
      const summary = createDenseSilentSummary({ hasAudibleSample: true });
      const result = classifyVoiceSilence(summary);

      expect(result.isSilent).toBe(false);
      expect(result.reason).toBe("audible_sample_detected");
      expect(isVoiceSilenceRejected(summary)).toBe(false);
    });

    it("fails open when a brief audible spike occurs", () => {
      const summary = createDenseSilentSummary({ hasAudibleSample: true });
      const result = classifyVoiceSilence(summary);

      expect(result.isSilent).toBe(false);
      expect(result.reason).toBe("audible_sample_detected");
    });

    it("fails open when sentinel or floor sample (<= -160.0 dBFS) poisons the capture", () => {
      const summary = createDenseSilentSummary({ hasSentinelOrPoison: true });
      const result = classifyVoiceSilence(summary);

      expect(result.isSilent).toBe(false);
      expect(result.reason).toBe("sentinel_or_poison");
      expect(isVoiceSilenceRejected(summary)).toBe(false);
    });

    it("fails open when active duration is less than 1500 ms", () => {
      const summary = createDenseSilentSummary({
        activeDurationMs: 1499,
        lastSampleActiveMs: 1400,
      });
      const result = classifyVoiceSilence(summary);

      expect(result.isSilent).toBe(false);
      expect(result.reason).toBe("duration_too_short");
    });

    it("fails open when sample count is less than minimum required (10)", () => {
      const summary = createDenseSilentSummary({ validSampleCount: 9 });
      const result = classifyVoiceSilence(summary);

      expect(result.isSilent).toBe(false);
      expect(result.reason).toBe("insufficient_samples");
    });

    it("fails open when leading span before first sample exceeds 200 ms", () => {
      const summary = createDenseSilentSummary({ firstSampleActiveMs: 201 });
      const result = classifyVoiceSilence(summary);

      expect(result.isSilent).toBe(false);
      expect(result.reason).toBe("leading_span_uncovered");
    });

    it("passes leading check when first sample is at exactly 200 ms", () => {
      const summary = createDenseSilentSummary({ firstSampleActiveMs: 200 });
      const result = classifyVoiceSilence(summary);

      expect(result.isSilent).toBe(true);
      expect(result.reason).toBe("silence_confirmed");
    });

    it("fails open when trailing span after last sample exceeds 200 ms", () => {
      const summary = createDenseSilentSummary({
        activeDurationMs: 1500,
        lastSampleActiveMs: 1299, // 1500 - 1299 = 201 ms > 200 ms
      });
      const result = classifyVoiceSilence(summary);

      expect(result.isSilent).toBe(false);
      expect(result.reason).toBe("trailing_span_uncovered");
    });

    it("passes trailing check when trailing span is at exactly 200 ms", () => {
      const summary = createDenseSilentSummary({
        activeDurationMs: 1500,
        lastSampleActiveMs: 1300, // 1500 - 1300 = 200 ms
      });
      const result = classifyVoiceSilence(summary);

      expect(result.isSilent).toBe(true);
      expect(result.reason).toBe("silence_confirmed");
    });

    it("fails open when maximum active gap exceeds 250 ms", () => {
      const summary = createDenseSilentSummary({ maxActiveGapMs: 251 });
      const result = classifyVoiceSilence(summary);

      expect(result.isSilent).toBe(false);
      expect(result.reason).toBe("gap_too_large");
    });

    it("passes gap check when maximum active gap is at exactly 250 ms", () => {
      const summary = createDenseSilentSummary({ maxActiveGapMs: 250 });
      const result = classifyVoiceSilence(summary);

      expect(result.isSilent).toBe(true);
      expect(result.reason).toBe("silence_confirmed");
    });

    it("fails open when summary is null or undefined (e.g. mock recorder or unmetered)", () => {
      expect(classifyVoiceSilence(null)).toEqual({
        isSilent: false,
        reason: "missing_data",
      });
      expect(classifyVoiceSilence(undefined)).toEqual({
        isSilent: false,
        reason: "missing_data",
      });
      expect(isVoiceSilenceRejected(null)).toBe(false);
      expect(isVoiceSilenceRejected(undefined)).toBe(false);
    });

    it("fails open when firstSampleActiveMs or lastSampleActiveMs is null", () => {
      const summary = createDenseSilentSummary({
        firstSampleActiveMs: null,
        lastSampleActiveMs: null,
      });
      const result = classifyVoiceSilence(summary);

      expect(result.isSilent).toBe(false);
      expect(result.reason).toBe("leading_span_uncovered");
    });

    it("fails open with sentinel_or_poison on malformed summary counters (NaN or negative validSampleCount)", () => {
      const summary1 = createDenseSilentSummary({
        validSampleCount: Number.NaN,
      });
      expect(classifyVoiceSilence(summary1)).toEqual({
        isSilent: false,
        reason: "sentinel_or_poison",
      });

      const summary2 = createDenseSilentSummary({ validSampleCount: -1 });
      expect(classifyVoiceSilence(summary2)).toEqual({
        isSilent: false,
        reason: "sentinel_or_poison",
      });
    });

    it("fails open with sentinel_or_poison on malformed activeDurationMs or maxActiveGapMs (NaN or negative)", () => {
      const summary1 = createDenseSilentSummary({
        activeDurationMs: Number.NaN,
      });
      expect(classifyVoiceSilence(summary1)).toEqual({
        isSilent: false,
        reason: "sentinel_or_poison",
      });

      const summary2 = createDenseSilentSummary({
        maxActiveGapMs: Number.NaN,
      });
      expect(classifyVoiceSilence(summary2)).toEqual({
        isSilent: false,
        reason: "sentinel_or_poison",
      });

      const summary3 = createDenseSilentSummary({ maxActiveGapMs: -50 });
      expect(classifyVoiceSilence(summary3)).toEqual({
        isSilent: false,
        reason: "sentinel_or_poison",
      });
    });

    it("fails open with sentinel_or_poison on impossible summary chronology", () => {
      // firstSampleActiveMs > lastSampleActiveMs
      const summary1 = createDenseSilentSummary({
        firstSampleActiveMs: 800,
        lastSampleActiveMs: 200,
      });
      expect(classifyVoiceSilence(summary1)).toEqual({
        isSilent: false,
        reason: "sentinel_or_poison",
      });

      // lastSampleActiveMs > activeDurationMs
      const summary2 = createDenseSilentSummary({
        activeDurationMs: 1500,
        lastSampleActiveMs: 1600,
      });
      expect(classifyVoiceSilence(summary2)).toEqual({
        isSilent: false,
        reason: "sentinel_or_poison",
      });

      // firstSampleActiveMs > activeDurationMs
      const summary3 = createDenseSilentSummary({
        activeDurationMs: 1500,
        firstSampleActiveMs: 1600,
      });
      expect(classifyVoiceSilence(summary3)).toEqual({
        isSilent: false,
        reason: "sentinel_or_poison",
      });
    });
  });

  describe("createAudioMeteringAccumulator", () => {
    it("accumulates dense silence samples into a confirmed silence summary", () => {
      const acc = createAudioMeteringAccumulator();

      // Sample 15 times every 100ms with level -75 dBFS
      for (let i = 0; i < 15; i++) {
        acc.addSample(-75.0, 50 + i * 100);
      }

      const summary = acc.finalize(1500);
      expect(summary.validSampleCount).toBe(15);
      expect(summary.hasAudibleSample).toBe(false);
      expect(summary.hasSentinelOrPoison).toBe(false);
      expect(summary.firstSampleActiveMs).toBe(50);
      expect(summary.lastSampleActiveMs).toBe(1450);
      expect(summary.maxActiveGapMs).toBe(100);
      expect(summary.activeDurationMs).toBe(1500);

      const decision = classifyVoiceSilence(summary);
      expect(decision.isSilent).toBe(true);
    });

    it("detects exact equality at -70.0 dBFS as audible", () => {
      const acc = createAudioMeteringAccumulator();

      for (let i = 0; i < 14; i++) {
        acc.addSample(-75.0, 50 + i * 100);
      }
      acc.addSample(-70.0, 1450); // Exactly -70.0 dBFS

      const summary = acc.finalize(1500);
      expect(summary.hasAudibleSample).toBe(true);

      const decision = classifyVoiceSilence(summary);
      expect(decision.isSilent).toBe(false);
      expect(decision.reason).toBe("audible_sample_detected");
    });

    it("detects audible sample >= -70.0 dBFS", () => {
      const acc = createAudioMeteringAccumulator();

      for (let i = 0; i < 10; i++) {
        acc.addSample(-80.0, 50 + i * 100);
      }
      acc.addSample(-65.0, 1050); // Audible sample above -70.0

      const summary = acc.finalize(1500);
      expect(summary.hasAudibleSample).toBe(true);
      expect(classifyVoiceSilence(summary).isSilent).toBe(false);
    });

    it("poisons generation on Android sentinel -160.0 dBFS", () => {
      const acc = createAudioMeteringAccumulator();

      acc.addSample(-75.0, 100);
      acc.addSample(-160.0, 200); // Floor / native error sentinel
      acc.addSample(-75.0, 300);

      const summary = acc.finalize(1500);
      expect(summary.hasSentinelOrPoison).toBe(true);

      const decision = classifyVoiceSilence(summary);
      expect(decision.isSilent).toBe(false);
      expect(decision.reason).toBe("sentinel_or_poison");
    });

    it("poisons generation on sample level below -160.0 dBFS", () => {
      const acc = createAudioMeteringAccumulator();

      acc.addSample(-165.0, 100);

      const summary = acc.finalize(1500);
      expect(summary.hasSentinelOrPoison).toBe(true);
      expect(classifyVoiceSilence(summary).isSilent).toBe(false);
    });

    it("poisons generation on non-finite sample values (NaN, Infinity)", () => {
      const acc = createAudioMeteringAccumulator();

      acc.addSample(Number.NaN, 100);
      expect(acc.getSummary().hasSentinelOrPoison).toBe(true);

      const acc2 = createAudioMeteringAccumulator();
      acc2.addSample(Number.POSITIVE_INFINITY, 100);
      expect(acc2.getSummary().hasSentinelOrPoison).toBe(true);
    });

    it("poisons generation on out-of-range positive dBFS values (> 0.0)", () => {
      const acc = createAudioMeteringAccumulator();

      acc.addSample(1.5, 100);
      expect(acc.getSummary().hasSentinelOrPoison).toBe(true);
    });

    it("accepts sample at exact 0.0 dBFS as audible valid sample", () => {
      const acc = createAudioMeteringAccumulator();

      acc.addSample(0.0, 100);
      const summary = acc.getSummary();
      expect(summary.validSampleCount).toBe(1);
      expect(summary.hasAudibleSample).toBe(true);
      expect(summary.hasSentinelOrPoison).toBe(false);
    });

    it("allows manual recordPoison invocation on native status error", () => {
      const acc = createAudioMeteringAccumulator();

      acc.addSample(-75.0, 100);
      acc.recordPoison();

      expect(acc.getSummary().hasSentinelOrPoison).toBe(true);
      expect(classifyVoiceSilence(acc.finalize(1500)).isSilent).toBe(false);
    });

    it("calculates running maxActiveGapMs correctly across multiple samples and isolates gap failure", () => {
      const acc = createAudioMeteringAccumulator();

      // Sample 1 at 100 ms (valid leading span <= 200)
      acc.addSample(-75.0, 100);
      acc.addSample(-75.0, 200); // gap: 100
      acc.addSample(-75.0, 460); // gap: 260 > 250 max gap!
      acc.addSample(-75.0, 560); // gap: 100
      acc.addSample(-75.0, 660);
      acc.addSample(-75.0, 760);
      acc.addSample(-75.0, 860);
      acc.addSample(-75.0, 960);
      acc.addSample(-75.0, 1060);
      acc.addSample(-75.0, 1160);
      acc.addSample(-75.0, 1260);
      // Sample 12 at 1360 ms (valid count >= 10, trailing span 1500 - 1360 = 140 <= 200)
      acc.addSample(-75.0, 1360);

      const summary = acc.finalize(1500);
      expect(summary.maxActiveGapMs).toBe(260);
      expect(summary.validSampleCount).toBe(12);

      // Single isolated failure case: gap_too_large (not insufficient_samples or trailing gap)
      const decision = classifyVoiceSilence(summary);
      expect(decision.isSilent).toBe(false);
      expect(decision.reason).toBe("gap_too_large");
    });

    it("poisons generation on negative activeMs timestamp", () => {
      const acc = createAudioMeteringAccumulator();
      acc.addSample(-75.0, -10);
      expect(acc.getSummary().hasSentinelOrPoison).toBe(true);
    });

    it("poisons generation on non-finite activeMs timestamp (NaN, Infinity)", () => {
      const acc1 = createAudioMeteringAccumulator();
      acc1.addSample(-75.0, Number.NaN);
      expect(acc1.getSummary().hasSentinelOrPoison).toBe(true);

      const acc2 = createAudioMeteringAccumulator();
      acc2.addSample(-75.0, Number.POSITIVE_INFINITY);
      expect(acc2.getSummary().hasSentinelOrPoison).toBe(true);
    });

    it("poisons generation on decreasing/backwards clock timestamps", () => {
      const acc = createAudioMeteringAccumulator();
      acc.addSample(-75.0, 200);
      acc.addSample(-75.0, 150); // Clock jumped backwards
      expect(acc.getSummary().hasSentinelOrPoison).toBe(true);
    });

    it("poisons generation on duplicate clock timestamps", () => {
      const acc = createAudioMeteringAccumulator();
      acc.addSample(-75.0, 200);
      acc.addSample(-75.0, 200); // Duplicate timestamp
      expect(acc.getSummary().hasSentinelOrPoison).toBe(true);
    });

    it("poisons generation when finalize receives negative or non-finite finalActiveMs", () => {
      const acc1 = createAudioMeteringAccumulator();
      acc1.addSample(-75.0, 100);
      expect(acc1.finalize(Number.NaN).hasSentinelOrPoison).toBe(true);

      const acc2 = createAudioMeteringAccumulator();
      acc2.addSample(-75.0, 100);
      expect(acc2.finalize(-100).hasSentinelOrPoison).toBe(true);
    });

    it("poisons generation when finalize receives impossible chronology (finalActiveMs < lastSampleActiveMs)", () => {
      const acc = createAudioMeteringAccumulator();
      acc.addSample(-75.0, 500);
      // Finalized at 400 ms, which is earlier than the last sample at 500 ms!
      const summary = acc.finalize(400);
      expect(summary.hasSentinelOrPoison).toBe(true);
    });

    it("resets all accumulators to initial state cleanly", () => {
      const acc = createAudioMeteringAccumulator();

      acc.addSample(-75.0, 100);
      acc.addSample(-60.0, 200);
      acc.recordPoison();

      acc.reset();

      const summary = acc.getSummary();
      expect(summary.validSampleCount).toBe(0);
      expect(summary.hasAudibleSample).toBe(false);
      expect(summary.hasSentinelOrPoison).toBe(false);
      expect(summary.firstSampleActiveMs).toBeNull();
      expect(summary.lastSampleActiveMs).toBeNull();
      expect(summary.maxActiveGapMs).toBe(0);
      expect(summary.activeDurationMs).toBe(0);
    });
  });
});
