/**
 * Environment Variable Normalization & Validation Utility
 *
 * Rules:
 * 1. Treat any VITE_* variable that is empty, missing, undefined, null, or equal to "disabled" (case-insensitive)
 *    as NOT configured.
 * 2. If any VITE_FIREBASE_* value is missing or "disabled", local demo auth and LocalRepo (localStorage/IndexedDB) are used.
 * 3. If VITE_AGENT_API_URL is missing or "disabled", run the LangGraph agent in the browser and show the badge "LangGraph (browser)".
 * 4. Never call server or show errors for unconfigured optional variables.
 */

export function isEnvConfigured(val?: string | boolean | null | undefined): boolean {
  if (val === undefined || val === null) return false;
  const s = String(val).trim().toLowerCase();
  return s !== '' && s !== 'disabled' && s !== 'false' && s !== 'null' && s !== 'undefined';
}

export function getEnv(key: string): string | undefined {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  if (!isEnvConfigured(v)) return undefined;
  return String(v).trim();
}

/**
 * Checks if Firebase environment variables are configured.
 * Returns false if ANY required key is missing or equal to "disabled".
 */
export function isFirebaseConfigured(): boolean {
  const requiredKeys = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
  ];
  return requiredKeys.every((key) => isEnvConfigured(import.meta.env[key]));
}

/**
 * Checks if Agent Backend API is configured.
 * If VITE_AGENT_API_URL is empty, missing, or equal to "disabled", returns false.
 */
export function isAgentApiConfigured(): boolean {
  return isEnvConfigured(import.meta.env.VITE_AGENT_API_URL);
}

export function getAgentApiUrl(): string | undefined {
  return getEnv('VITE_AGENT_API_URL');
}

/**
 * Returns the badge label for the agent execution engine.
 * When VITE_AGENT_API_URL is empty, missing, or equal to "disabled", returns "LangGraph (browser)".
 */
export function getAgentEngineBadge(): string {
  return isAgentApiConfigured() ? 'LangGraph (server)' : 'LangGraph (browser)';
}

/**
 * Checks if Gemini API is configured
 */
export function isGeminiConfigured(): boolean {
  return isEnvConfigured(import.meta.env.VITE_GEMINI_API_KEY);
}

export function getGeminiApiKey(): string | undefined {
  return getEnv('VITE_GEMINI_API_KEY');
}

export function getGeminiModel(): string {
  return getEnv('VITE_GEMINI_MODEL') || 'gemini-2.5-flash';
}

/**
 * Checks if Alert Webhook URL is configured
 */
export function getAlertWebhookUrl(): string | undefined {
  return getEnv('VITE_ALERT_WEBHOOK_URL');
}

/**
 * Checks if Custom Inference API URL is configured
 */
export function getInferenceApiUrl(): string | undefined {
  return getEnv('VITE_INFERENCE_API_URL');
}
