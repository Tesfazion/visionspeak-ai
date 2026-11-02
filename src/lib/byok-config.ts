/**
 * BYOK (Bring Your Own Key) configuration for the VisionSpeak platform.
 *
 * API keys are stored encrypted in the user's data directory and only used server-side.
 * The platform never exposes keys to the browser. BYOK is strictly additive: the
 * on-device MediaPipe + Web Speech pipeline remains the default; external AI
 * augments analysis when a key is configured.
 *
 * Key storage:
 *   - Per-user encrypted keys in data/users.json (encrypted field)
 *   - Global default key in .env.local (NEXT_PUBLIC_BYOK_KEY used only for server init)
 *   - Global key takes precedence when set; per-user keys are checked first if no global.
 */

export type BYOKProviderId = "openai" | "anthropic" | "none";

export const BYOK_CONFIG_FILE = "./data/byok-config.json";

export interface BYOKConfig {
  /** Global default provider (optional — applies to all users unless overridden). */
  defaultProvider: BYOKProviderId;
  /** Per-user provider overrides keyed by userId. */
  overrides?: Record<string, BYOKProviderId>;
  /** Global API key (optional). When set, serves as the default key for all users. */
  globalApiKey?: string;
  /** Per-user keys stored encrypted in user records. */
  perUserKeys?: Record<string, string>;
  /** Whether any external AI is active on this deployment. */
  isEnabled: boolean;
}

/**
 * Load BYOK config from env (global) and user data (per-user).
 *
 * Global takes precedence: if NEXT_PUBLIC_BYOK_KEY is set, all users inherit it.
 * Per-user keys override when the user has their own key stored.
 */
export async function loadBYOKConfig(
  userId: string | null,
  dataDir: string = process.env.DATA_DIR ?? "./data",
): Promise<BYOKConfig> {
  // Global env check
  const globalKey = process.env.NEXT_PUBLIC_BYOK_KEY;
  const globalProvider = process.env.NEXT_PUBLIC_BYOK_PROVIDER || "none";

  if (globalKey) {
    return {
      defaultProvider: globalProvider as BYOKProviderId,
      globalApiKey: globalKey,
      isEnabled: true,
      overrides: {},
    };
  }

  // Load user data for per-user keys
  const perUserKeys: Record<string, string> = {};
  let userProvider = globalProvider as BYOKProviderId;

  if (userId) {
    const usersFile = `${dataDir}/users.json`;
    try {
      const fs = await import("node:fs/promises");
      const raw = await fs.readFile(usersFile, "utf8");
      const users = JSON.parse(raw);
      const user = users.find((u: Record<string, unknown>) => u.id === userId);
      if (user?.encryptedApiKey) {
        // In a real deployment this would be decrypted with a master key
        // For this stub we just mark it as available
        perUserKeys[userId] = user.encryptedApiKey;
        userProvider = user.preferredProvider || globalProvider as BYOKProviderId;
      }
    } catch {
      // Ignore read errors — per-user falls back to disabled
    }
  }

  return {
    defaultProvider: userProvider,
    perUserKeys,
    globalApiKey: undefined,
    isEnabled: Object.keys(perUserKeys).length > 0 || !!globalKey,
    overrides: {},
  };
}

export function hasProvider(config: BYOKConfig, userId: string | null): boolean {
  if (config.isEnabled) {
    if (config.globalApiKey) return true;
    if (config.perUserKeys && userId && config.perUserKeys[userId]) return true;
  }
  return false;
}

export function getProviderForUser(config: BYOKConfig, userId: string | null): BYOKProviderId {
  if (config.globalApiKey) return config.defaultProvider;
  if (userId && config.perUserKeys && config.perUserKeys[userId]) {
    // Return per-user override or default if no override
    const override = config.overrides?.[userId];
    return override || config.defaultProvider;
  }
  return config.defaultProvider;
}