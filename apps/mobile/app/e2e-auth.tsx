import { isE2eTestMode } from "@/config/e2e-test-config";
import { signInWithEmail } from "@/services/auth-service";
import { logger } from "@/utils/logger";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

const E2E_AUTH_TIMEOUT_MS = 30_000;

function getSingleParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default function E2eAuthRoute(): React.JSX.Element {
  const router = useRouter();
  const [status, setStatus] = useState<"signing-in" | "failed">("signing-in");
  const params = useLocalSearchParams<{
    email?: string | string[];
    password?: string | string[];
  }>();
  const email = getSingleParam(params.email);
  const password = getSingleParam(params.password);

  useEffect(() => {
    if (!isE2eTestMode()) {
      router.replace("/auth");
      return;
    }

    if (!email || !password) {
      logger.warn("e2eAuth.missingCredentials");
      router.replace("/auth");
      return;
    }

    let isCancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (isCancelled) {
        return;
      }

      setStatus("failed");
      logger.error("e2eAuth.signIn.timeout", {
        timeoutMs: E2E_AUTH_TIMEOUT_MS,
      });
    }, E2E_AUTH_TIMEOUT_MS);

    signInWithEmail(email, password)
      .then((result) => {
        if (isCancelled) {
          return;
        }

        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        if (result.error) {
          setStatus("failed");
          logger.error("e2eAuth.signIn.failed", {
            message: result.error.message,
          });
          return;
        }

        router.replace("/");
      })
      .catch((error: unknown) => {
        if (isCancelled) {
          return;
        }

        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        setStatus("failed");
        logger.error(
          "e2eAuth.signIn.unexpected",
          error instanceof Error ? { message: error.message } : { error }
        );
      });

    return () => {
      isCancelled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [email, password, router]);

  return (
    <View className="flex-1 items-center justify-center bg-background px-6 dark:bg-background-dark">
      <Text className="text-center text-base font-semibold text-text-primary">
        {status === "failed" ? "E2E auth failed" : "Signing in for E2E"}
      </Text>
      {status === "failed" ? (
        <Text className="mt-2 text-center text-sm text-text-secondary">
          Check Metro, local Supabase, and the E2E auth logs.
        </Text>
      ) : null}
    </View>
  );
}
