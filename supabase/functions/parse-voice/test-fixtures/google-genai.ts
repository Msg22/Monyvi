import { recordProviderInvocation, takeProviderResult } from "./state.ts";

export type ContentListUnion = unknown;

export interface GenerateContentResponseUsageMetadata {
  readonly promptTokenCount?: number;
  readonly cachedContentTokenCount?: number;
  readonly candidatesTokenCount?: number;
  readonly totalTokenCount?: number;
}

interface GenerateContentResult {
  readonly text: string | undefined;
  readonly usageMetadata?: GenerateContentResponseUsageMetadata;
}

export class GoogleGenAI {
  readonly models: {
    readonly generateContent: (
      input: unknown
    ) => Promise<GenerateContentResult>;
  };

  constructor(_options: { readonly apiKey: string }) {
    this.models = {
      generateContent: async (
        input: unknown
      ): Promise<GenerateContentResult> => {
        recordProviderInvocation(input);
        const result = takeProviderResult();
        if (result.kind === "error") {
          throw new Error(result.message);
        }

        const responseObj: Record<string, unknown> = {};

        Object.defineProperty(responseObj, "text", {
          configurable: true,
          enumerable: true,
          get: () => result.text,
        });

        Object.defineProperty(responseObj, "usageMetadata", {
          configurable: true,
          enumerable: true,
          get: () => result.usageMetadata,
        });

        return responseObj as unknown as GenerateContentResult;
      },
    };
  }
}
