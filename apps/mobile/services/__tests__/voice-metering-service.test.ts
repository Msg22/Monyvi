import {
  sampleRecorderMetering,
  validateRecorderStatus,
} from "../voice-metering-service";
import { createAudioMeteringAccumulator } from "@monyvi/logic";
import type { AudioRecorder } from "expo-audio";

describe("voice-metering-service", () => {
  describe("validateRecorderStatus", () => {
    describe("Android platform", () => {
      it("accepts normal absence of mediaServicesDidReset on Android when other status is valid", () => {
        const status = {
          canRecord: true,
          isRecording: true,
          durationMillis: 500,
          metering: -75.5,
          // mediaServicesDidReset omitted on Android
        };

        const result = validateRecorderStatus(status, "android");
        expect(result.isValid).toBe(true);
        expect(result.meteringLevel).toBe(-75.5);
        expect(result.shouldPoison).toBe(false);
      });

      it("accepts mediaServicesDidReset === false on Android", () => {
        const status = {
          canRecord: true,
          isRecording: true,
          durationMillis: 500,
          metering: -80,
          mediaServicesDidReset: false,
        };

        const result = validateRecorderStatus(status, "android");
        expect(result.isValid).toBe(true);
        expect(result.meteringLevel).toBe(-80);
        expect(result.shouldPoison).toBe(false);
      });

      it("poisons and rejects when mediaServicesDidReset is explicitly true on Android", () => {
        const status = {
          canRecord: true,
          isRecording: true,
          durationMillis: 500,
          metering: -80,
          mediaServicesDidReset: true,
        };

        const result = validateRecorderStatus(status, "android");
        expect(result.isValid).toBe(false);
        expect(result.shouldPoison).toBe(true);
      });
    });

    describe("iOS platform", () => {
      it("accepts status on iOS when mediaServicesDidReset === false", () => {
        const status = {
          canRecord: true,
          isRecording: true,
          durationMillis: 500,
          metering: -72.0,
          mediaServicesDidReset: false,
        };

        const result = validateRecorderStatus(status, "ios");
        expect(result.isValid).toBe(true);
        expect(result.meteringLevel).toBe(-72.0);
        expect(result.shouldPoison).toBe(false);
      });

      it("poisons and rejects on iOS when mediaServicesDidReset is undefined (missing)", () => {
        const status = {
          canRecord: true,
          isRecording: true,
          durationMillis: 500,
          metering: -72.0,
        };

        const result = validateRecorderStatus(status, "ios");
        expect(result.isValid).toBe(false);
        expect(result.shouldPoison).toBe(true);
      });

      it("poisons and rejects on iOS when mediaServicesDidReset is true", () => {
        const status = {
          canRecord: true,
          isRecording: true,
          durationMillis: 500,
          metering: -72.0,
          mediaServicesDidReset: true,
        };

        const result = validateRecorderStatus(status, "ios");
        expect(result.isValid).toBe(false);
        expect(result.shouldPoison).toBe(true);
      });
    });

    describe("General status invariants", () => {
      it("poisons when canRecord is false", () => {
        const status = {
          canRecord: false,
          isRecording: true,
          durationMillis: 500,
          metering: -75,
        };

        const result = validateRecorderStatus(status, "android");
        expect(result.isValid).toBe(false);
        expect(result.shouldPoison).toBe(true);
      });

      it("poisons when isRecording is false", () => {
        const status = {
          canRecord: true,
          isRecording: false,
          durationMillis: 500,
          metering: -75,
        };

        const result = validateRecorderStatus(status, "android");
        expect(result.isValid).toBe(false);
        expect(result.shouldPoison).toBe(true);
      });

      it("poisons when durationMillis is non-positive or non-finite", () => {
        expect(
          validateRecorderStatus(
            {
              canRecord: true,
              isRecording: true,
              durationMillis: 0,
              metering: -75,
            },
            "android"
          ).shouldPoison
        ).toBe(true);

        expect(
          validateRecorderStatus(
            {
              canRecord: true,
              isRecording: true,
              durationMillis: -10,
              metering: -75,
            },
            "android"
          ).shouldPoison
        ).toBe(true);

        expect(
          validateRecorderStatus(
            {
              canRecord: true,
              isRecording: true,
              durationMillis: Number.NaN,
              metering: -75,
            },
            "android"
          ).shouldPoison
        ).toBe(true);
      });

      it("poisons when status object is null or undefined or not an object", () => {
        expect(validateRecorderStatus(null, "android").shouldPoison).toBe(true);
        expect(validateRecorderStatus(undefined, "android").shouldPoison).toBe(
          true
        );
        expect(validateRecorderStatus("invalid", "android").shouldPoison).toBe(
          true
        );
      });

      it("poisons when metering reading is missing, undefined, or non-finite", () => {
        const missingMeteringStatus = {
          canRecord: true,
          isRecording: true,
          durationMillis: 500,
          // metering omitted
        };

        const result = validateRecorderStatus(missingMeteringStatus, "android");
        expect(result.isValid).toBe(false);
        expect(result.meteringLevel).toBeNull();
        expect(result.shouldPoison).toBe(true);

        const nanMeteringStatus = {
          canRecord: true,
          isRecording: true,
          durationMillis: 500,
          metering: Number.NaN,
        };
        expect(
          validateRecorderStatus(nanMeteringStatus, "android").shouldPoison
        ).toBe(true);

        const infMeteringStatus = {
          canRecord: true,
          isRecording: true,
          durationMillis: 500,
          metering: Number.POSITIVE_INFINITY,
        };
        expect(
          validateRecorderStatus(infMeteringStatus, "android").shouldPoison
        ).toBe(true);
      });

      it("poisons and fails open on unsupported platform even if status is otherwise valid", () => {
        const validStatus = {
          canRecord: true,
          isRecording: true,
          durationMillis: 500,
          metering: -75.0,
        };

        expect(validateRecorderStatus(validStatus, "web").shouldPoison).toBe(
          true
        );
        expect(
          validateRecorderStatus(validStatus, "windows").shouldPoison
        ).toBe(true);
        expect(
          validateRecorderStatus(validStatus, "unknown").shouldPoison
        ).toBe(true);
      });
    });
  });

  describe("sampleRecorderMetering", () => {
    it("poisons accumulator when recorder is null", () => {
      const acc = createAudioMeteringAccumulator();
      expect(() => {
        sampleRecorderMetering(null, acc, 100);
      }).not.toThrow();

      expect(acc.getSummary().hasSentinelOrPoison).toBe(true);
    });

    it("samples valid metering status and updates accumulator", () => {
      const acc = createAudioMeteringAccumulator();
      const mockRecorder = {
        getStatus: jest.fn(() => ({
          canRecord: true,
          isRecording: true,
          durationMillis: 500,
          metering: -78.4,
        })),
      } as unknown as AudioRecorder;

      sampleRecorderMetering(mockRecorder, acc, 200, "android");

      const summary = acc.getSummary();
      expect(summary.validSampleCount).toBe(1);
      expect(summary.firstSampleActiveMs).toBe(200);
      expect(summary.hasAudibleSample).toBe(false);
      expect(summary.hasSentinelOrPoison).toBe(false);
    });

    it("catches getStatus throws and poisons accumulator safely without throwing", () => {
      const acc = createAudioMeteringAccumulator();
      const mockRecorder = {
        getStatus: jest.fn(() => {
          throw new Error("Native recorder IllegalStateException");
        }),
      } as unknown as AudioRecorder;

      expect(() => {
        sampleRecorderMetering(mockRecorder, acc, 300, "android");
      }).not.toThrow();

      expect(acc.getSummary().hasSentinelOrPoison).toBe(true);
    });

    it("poisons accumulator when recorder lacks getStatus function", () => {
      const acc = createAudioMeteringAccumulator();
      const mockRecorder = {} as unknown as AudioRecorder;

      expect(() => {
        sampleRecorderMetering(mockRecorder, acc, 100, "android");
      }).not.toThrow();

      expect(acc.getSummary().hasSentinelOrPoison).toBe(true);
    });

    it("poisons whole generation when a single invalid mid-tick occurs amid valid quiet samples", () => {
      const acc = createAudioMeteringAccumulator();
      const validRecorder = {
        getStatus: jest.fn(() => ({
          canRecord: true,
          isRecording: true,
          durationMillis: 500,
          metering: -75.0,
        })),
      } as unknown as AudioRecorder;

      // 5 valid quiet ticks
      for (let t = 100; t <= 500; t += 100) {
        sampleRecorderMetering(validRecorder, acc, t, "android");
      }
      expect(acc.getSummary().validSampleCount).toBe(5);
      expect(acc.getSummary().hasSentinelOrPoison).toBe(false);

      // 1 invalid mid-tick (missing metering property)
      const invalidRecorder = {
        getStatus: jest.fn(() => ({
          canRecord: true,
          isRecording: true,
          durationMillis: 600,
        })),
      } as unknown as AudioRecorder;
      sampleRecorderMetering(invalidRecorder, acc, 600, "android");

      // Followed by more valid quiet ticks
      for (let t = 700; t <= 1500; t += 100) {
        sampleRecorderMetering(validRecorder, acc, t, "android");
      }

      // Generation must be poisoned and cannot be classified silent!
      const summary = acc.finalize(1500);
      expect(summary.hasSentinelOrPoison).toBe(true);
    });

    it("poisons accumulator when running on an unsupported platform with valid status", () => {
      const acc = createAudioMeteringAccumulator();
      const validRecorder = {
        getStatus: jest.fn(() => ({
          canRecord: true,
          isRecording: true,
          durationMillis: 500,
          metering: -75.0,
        })),
      } as unknown as AudioRecorder;

      sampleRecorderMetering(validRecorder, acc, 100, "web");
      expect(acc.getSummary().hasSentinelOrPoison).toBe(true);
    });
  });
});
