import { defineSecret } from "firebase-functions/params";

/**
 * Einziger Ort fuer alle `defineSecret()`-Deklarationen dieses Projekts.
 *
 * WOZU ZENTRAL: `defineSecret(name)` sollte je Name genau EINMAL aufgerufen
 * werden - jede Function importiert dieselbe Instanz, statt sich ihre eigene
 * (aber namensgleiche) zu bauen. Die Namen MUESSEN exakt denen im Secret
 * Manager entsprechen:
 * SYNC_MANUAL_SECRET, RESEND_API_KEY, RESEND_DOMAIN.
 */
export const syncManualSecret = defineSecret("SYNC_MANUAL_SECRET");
export const resendApiKey = defineSecret("RESEND_API_KEY");
export const resendDomain = defineSecret("RESEND_DOMAIN");
