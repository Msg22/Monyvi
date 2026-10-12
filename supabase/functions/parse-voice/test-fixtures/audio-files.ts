/**
 * Audio file fixtures with genuine ArrayBuffer ownership for Deno tests.
 * Avoids TS2322 by ensuring all BlobPart views are backed strictly by ArrayBuffer.
 */

function createSafeArrayBuffer(bytes: readonly number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function createAudioFile(
  bytes: readonly number[],
  filename: string,
  mimeType: string
): File {
  return new File([createSafeArrayBuffer(bytes)], filename, { type: mimeType });
}

export function createDefaultWavFile(): File {
  return createAudioFile(
    [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45],
    "voice.wav",
    "audio/wav"
  );
}

export function createEmptyAudioFile(): File {
  return new File([], "empty.wav", { type: "audio/wav" });
}

export interface RecognizedAudioFixture {
  readonly filename: string;
  readonly expectedMime: string;
  readonly createFile: () => File;
}

export const RECOGNIZED_AUDIO_FIXTURES: readonly RecognizedAudioFixture[] = [
  {
    filename: "audio.wav",
    expectedMime: "audio/wav",
    createFile: (): File => createDefaultWavFile(),
  },
  {
    filename: "audio.mp3",
    expectedMime: "audio/mpeg",
    createFile: (): File =>
      createAudioFile(
        [0xff, 0xfb, 0x90, 0x44, 0, 0, 0, 0],
        "audio.mp3",
        "audio/mpeg"
      ),
  },
  {
    filename: "audio.m4a",
    expectedMime: "audio/mp4",
    createFile: (): File =>
      createAudioFile(
        [0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20],
        "audio.m4a",
        "audio/mp4"
      ),
  },
];
