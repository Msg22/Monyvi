/**
 * Supabase Client for Monyvi Mobile
 * Initialized with environment variables
 *
 * Uses SecureStore for session persistence:
 * - iOS: Keychain - survives data clear and app reinstalls
 * - Android: EncryptedSharedPreferences - survives app restarts but NOT manual data clear
 */

import { SupabaseDatabase } from "@monyvi/db";
import { createClient, AuthError, processLock } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AUTH_REDIRECT_URL } from "@/constants/auth-constants";
import { z } from "zod";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env"
  );
}

export function getSupabaseStorageKey(url: string): string {
  const withoutProtocol = url.replace(/^[a-z][a-z\d+\-.]*:\/\//i, "");
  const host = withoutProtocol.split(/[/?#:]/, 1)[0] ?? "";
  const projectRef = host.split(".")[0] ?? host;

  return `sb-${projectRef}-auth-token`;
}

const AUTH_STORAGE_KEY = getSupabaseStorageKey(supabaseUrl);

/**
 * Chunked SecureStore adapter for Supabase Auth.
 *
 * SecureStore has a 2048-byte limit per key. After OAuth identity linking,
 * the Supabase JWT can exceed this limit. This adapter transparently splits
 * large values into numbered chunks and reassembles them on read.
 *
 * Storage layout:
 * - Small values (\u2264 CHUNK_SIZE): stored directly at `key`
 * - Large values: split into `key__chunk_0`, `key__chunk_1`, etc.
 *   with `key` storing the chunk count as `__chunked__:N`
 *
 * Persistence behavior:
 * - iOS: Uses Keychain (survives data clear and reinstall)
 * - Android: Uses EncryptedSharedPreferences (cleared when user clears app data)
 *
 * TODO: Use generation-based chunk prefixes to prevent concurrent read/write
 * corruption during chunked writes. Currently, a concurrent getItem() could
 * assemble mixed old/new chunks if setItem() is in progress.
 */

const CHUNK_SIZE = 2048;
const CHUNK_MARKER = "__chunked__:";

function chunkKey(key: string, index: number): string {
  return `${key}__chunk_${index}`;
}

const secureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const raw = await SecureStore.getItemAsync(key);
      if (raw === null) return null;

      // Check if the value is chunked
      if (raw.startsWith(CHUNK_MARKER)) {
        const count = parseInt(raw.replace(CHUNK_MARKER, ""), 10);
        const chunks: string[] = [];

        for (let i = 0; i < count; i++) {
          const chunk = await SecureStore.getItemAsync(chunkKey(key, i));
          if (chunk === null) {
            // TODO: Replace with structured logging (e.g., Sentry)
            return null;
          }
          chunks.push(chunk);
        }

        return chunks.join("");
      }

      // Small value \u2014 return as-is
      return raw;
    } catch {
      // TODO: Replace with structured logging (e.g., Sentry)
      return null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    try {
      // Read old chunk count before overwriting, so we can clean up stale chunks
      let oldChunkCount = 0;
      const oldRaw = await SecureStore.getItemAsync(key);
      if (oldRaw !== null && oldRaw.startsWith(CHUNK_MARKER)) {
        oldChunkCount = parseInt(oldRaw.replace(CHUNK_MARKER, ""), 10);
      }

      if (value.length <= CHUNK_SIZE) {
        // Small value \u2014 store directly (overwrites any existing marker/value)
        await SecureStore.setItemAsync(key, value);

        // Clean up all old chunks since we no longer need them
        for (let i = 0; i < oldChunkCount; i++) {
          await SecureStore.deleteItemAsync(chunkKey(key, i));
        }
        return;
      }

      // Large value \u2014 split into chunks
      const chunks: string[] = [];
      for (let i = 0; i < value.length; i += CHUNK_SIZE) {
        chunks.push(value.slice(i, i + CHUNK_SIZE));
      }

      // Write chunks first, then update the marker (so reads always succeed)
      for (let i = 0; i < chunks.length; i++) {
        await SecureStore.setItemAsync(chunkKey(key, i), chunks[i]);
      }

      // Update marker with new chunk count
      await SecureStore.setItemAsync(key, `${CHUNK_MARKER}${chunks.length}`);

      // Clean up any extra stale chunks from the old value
      for (let i = chunks.length; i < oldChunkCount; i++) {
        await SecureStore.deleteItemAsync(chunkKey(key, i));
      }
    } catch {
      // TODO: Replace with structured logging (e.g., Sentry)
    }
  },

  removeItem: async (key: string): Promise<void> => {
    try {
      const raw = await SecureStore.getItemAsync(key);

      // Clean up chunks if they exist
      if (raw !== null && raw.startsWith(CHUNK_MARKER)) {
        const count = parseInt(raw.replace(CHUNK_MARKER, ""), 10);
        for (let i = 0; i < count; i++) {
          await SecureStore.deleteItemAsync(chunkKey(key, i));
        }
      }

      // Remove the main key
      await SecureStore.deleteItemAsync(key);
    } catch {
      // TODO: Replace with structured logging (e.g., Sentry)
    }
  },
};

export const supabase = createClient<SupabaseDatabase>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      storage: secureStoreAdapter,
      storageKey: AUTH_STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  }
);

export async function clearPersistedAuthSession(): Promise<void> {
  await secureStoreAdapter.removeItem(AUTH_STORAGE_KEY);
  await secureStoreAdapter.removeItem(`${AUTH_STORAGE_KEY}-code-verifier`);
  await secureStoreAdapter.removeItem(`${AUTH_STORAGE_KEY}-user`);
}

/**
 * Get current authenticated user ID.
 * Returns null if not authenticated.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

/**
 * Check if user has a valid authenticated session.
 */
export async function isAuthenticated(): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session !== null;
}

// =============================================================================
// OAuth Authentication
// =============================================================================

/** Supported OAuth providers. */
type OAuthProvider = "google" | "facebook" | "apple";

/**
 * Zod schema for validating the Supabase OAuth signInWithOAuth response.
 * Ensures `data.url` is a valid URL string before we pass it to the browser.
 */
const OAuthResponseSchema = z.object({
  data: z.object({
    url: z.string().url(),
  }),
  error: z.null(),
});

/**
 * Sign in with an OAuth provider.
 *
 * Uses Supabase's `signInWithOAuth()` to create or restore a session
 * via the specified provider. Returns the OAuth URL to open in a browser.
 *
 * @param provider - The OAuth provider to sign in with (google, facebook, or apple)
 * @returns The OAuth URL to open in a browser, or an error
 */
export async function signInWithOAuthProvider(
  provider: OAuthProvider
): Promise<{ url: string } | { error: AuthError }> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: AUTH_REDIRECT_URL,
    },
  });

  if (error) {
    return { error };
  }

  // Validate the response shape at runtime
  const parsed = OAuthResponseSchema.safeParse({ data, error });
  if (!parsed.success) {
    // TODO: Replace with structured logging (e.g., Sentry)
    // Unexpected response shape from Supabase OAuth
    return {
      error: new AuthError(
        "Invalid OAuth response: missing or malformed URL",
        undefined,
        "unexpected_failure"
      ),
    };
  }

  return { url: parsed.data.data.url };
}

// =============================================================================
// Email/Password Authentication
// =============================================================================

/**
 * Result of an email auth operation.
 * On success, returns user data. On error, returns the AuthError.
 */
interface EmailAuthResult {
  readonly success: boolean;
  readonly error?: AuthError;
  readonly needsVerification?: boolean;
}

/**
 * Sign up a new user with email and password.
 *
 * Creates a new Supabase user. The user must verify their email
 * before they can sign in. Supabase automatically sends a
 * verification email on success.
 *
 * @param email - The user's email address
 * @param password - The user's chosen password
 * @returns Result indicating success, error, or verification needed
 */
export async function signUpWithEmail(
  email: string,
  password: string
): Promise<EmailAuthResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return { success: false, error };
  }

  // Supabase returns user with `email_confirmed_at = null` for unverified users
  const needsVerification = !data.user?.email_confirmed_at;

  return { success: true, needsVerification };
}

/**
 * Sign in an existing user with email and password.
 *
 * Only works for users who have verified their email address.
 *
 * @param email - The user's email address
 * @param password - The user's password
 * @returns Result indicating success or error
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<EmailAuthResult> {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { success: false, error };
  }

  return { success: true };
}

/**
 * Send a password reset email to the specified address.
 *
 * Supabase sends an email with a reset link. The user clicks the link,
 * which deep-links back to the app via `auth-callback.tsx`.
 *
 * @param email - The email address to send the reset link to
 * @returns Result indicating success or error
 */
export async function resetPasswordForEmail(
  email: string
): Promise<EmailAuthResult> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: AUTH_REDIRECT_URL,
  });

  if (error) {
    return { success: false, error };
  }

  return { success: true };
}

/**
 * Resend the email verification link for a pending sign-up.
 *
 * @param email - The email address to resend verification to
 * @returns Result indicating success or error
 */
export async function resendVerificationEmail(
  email: string
): Promise<EmailAuthResult> {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
  });

  if (error) {
    return { success: false, error };
  }

  return { success: true };
}

export type { OAuthProvider, EmailAuthResult };
