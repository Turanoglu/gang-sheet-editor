/**
 * Shopify Variant ID Mapping for Gang Sheet board sizes.
 *
 * HOW TO SET UP:
 * 1. inkdyno.com Shopify Admin → Products → Add product
 * 2. Title: "DTF Gang Sheet Print"
 * 3. Add 9 variants (one per size) with matching prices:
 *    - 22x24  → $18.99
 *    - 22x36  → $29.99
 *    - 22x48  → $34.99
 *    - 22x60  → $39.99
 *    - 22x84  → $49.99
 *    - 22x108 → $59.99
 *    - 22x120 → $69.99
 *    - 22x180 → $89.99
 *    - 22x240 → $119.99
 * 4. For each variant, get the numeric Variant ID from:
 *    Admin URL → Products → [product] → click variant → URL contains /variants/XXXXXXXX
 *    OR: use Shopify Admin API / GraphQL to list variant IDs
 * 5. Replace the placeholder IDs below with real variant IDs.
 */

export const SHOPIFY_VARIANT_MAP: Record<string, number> = {
  '22x24':  47978579263588, // $18.99
  '22x36':  47978579296356, // $29.99
  '22x48':  47978579329124, // $34.99
  '22x60':  47978579361892, // $39.99
  '22x84':  47978579394660, // $49.99
  '22x108': 47978579427428, // $59.99
  '22x120': 47978579460196, // $69.99
  '22x180': 47978579492964, // $89.99
  '22x240': 47978579525732, // $119.99
};

/**
 * Returns the Shopify variant ID for a given board size.
 * Returns null if not configured or not found.
 */
export function getVariantId(width: number, height: number): number | null {
  const key = `${width}x${height}`;
  const id = SHOPIFY_VARIANT_MAP[key];
  return id && id > 0 ? id : null;
}

/**
 * Checks if variant IDs are configured (non-zero).
 */
export function areVariantsConfigured(): boolean {
  return Object.values(SHOPIFY_VARIANT_MAP).some(id => id > 0);
}
