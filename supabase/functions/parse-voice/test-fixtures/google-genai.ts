import { recordProviderInvocation, takeProviderResult } from "./state.ts";

export type ContentListUnion = unknown;

interface GenerateContentResult {
  readonly text: string | undefined;
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
        return { text: result.text };
      },
    };
  }
}
