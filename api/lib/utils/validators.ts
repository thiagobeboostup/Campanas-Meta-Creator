import { OBJECTIVE_MAP, CTA_OPTIONS } from "./constants.js";

/**
 * Ensure ad account ID is in the correct format (act_XXXXXXXXX).
 * Prepends "act_" if missing, then validates the format.
 */
export function validateAdAccountId(accountId: string): string {
  let cleaned = accountId.trim();
  if (!cleaned.startsWith("act_")) {
    cleaned = `act_${cleaned}`;
  }
  if (!/^act_\d+$/.test(cleaned)) {
    throw new Error(`Invalid ad account ID format: ${accountId}`);
  }
  return cleaned;
}

/**
 * Map and validate a campaign objective string to its ODAX API value.
 * Accepts both friendly names ("sales", "traffic") and raw API values ("OUTCOME_SALES").
 */
export function validateObjective(objective: string): string {
  const lower = objective.toLowerCase().trim();
  if (lower in OBJECTIVE_MAP) {
    return OBJECTIVE_MAP[lower];
  }
  if (objective.startsWith("OUTCOME_")) {
    return objective;
  }
  const validKeys = Object.keys(OBJECTIVE_MAP).join(", ");
  throw new Error(
    `Unknown objective: ${objective}. Valid options: ${validKeys}`
  );
}

/**
 * Validate a CTA (call-to-action) button type against the allowed list.
 */
export function validateCta(cta: string): string {
  const upper = cta.toUpperCase().trim();
  if (CTA_OPTIONS.includes(upper)) {
    return upper;
  }
  throw new Error(
    `Unknown CTA: ${cta}. Valid options: ${CTA_OPTIONS.join(", ")}`
  );
}

/**
 * Extract a Google Drive folder ID from a URL.
 * Supports standard folder URLs and id= query parameter format.
 */
export function extractDriveFolderId(url: string): string {
  const patterns = [/folders\/([a-zA-Z0-9_-]+)/, /id=([a-zA-Z0-9_-]+)/];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  throw new Error(`Could not extract folder ID from URL: ${url}`);
}
