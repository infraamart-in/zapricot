/**
 * The one source of truth for card proportions. Every card on the site (home ring, product
 * rolodex, 2D fallbacks, dialogs, OG images, and the texture build in scripts/) derives its size
 * from here plus a single scale factor. Nothing else hard-codes a card width or height.
 *
 * Real ISO/IEC 7810 ID-1 metal card.
 */
export const CARD_MM = {
  width: 85.6,
  height: 53.98,
  radius: 3.18,
  thickness: 0.8,
  bevel: 0.12,
} as const

/** width : height ≈ 1.586 */
export const CARD_ASPECT = CARD_MM.width / CARD_MM.height

/** Corner radius as a fraction of the card width (≈ 3.7%). */
export const CARD_RADIUS_OF_WIDTH = CARD_MM.radius / CARD_MM.width

/** 3D units: 1 unit = the card's height. Scenes scale this with one uniform factor. */
export const CARD_3D = {
  width: CARD_ASPECT,
  height: 1,
  radius: CARD_MM.radius / CARD_MM.height,
  thickness: CARD_MM.thickness / CARD_MM.height,
  bevel: CARD_MM.bevel / CARD_MM.height,
} as const

/** Pixel size of a card at a given width, keeping the exact ID-1 aspect. */
export function cardSize(width: number) {
  return { width, height: Math.round(width / CARD_ASPECT) }
}

/** Every finish texture (/cards/<id>.webp) is exactly this size: same pixels, same aspect. */
export const CARD_TEXTURE = cardSize(1280)

/** Every flat card image (/cards/<id>-2d.webp) is exactly this size. */
export const CARD_IMAGE_2D = cardSize(720)
