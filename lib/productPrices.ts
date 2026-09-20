/** Shared Singles Pack prices used by orders + demand forecast. */

export const BLACK_PACK_PRICE = 8.38
export const WHITE_PACK_PRICE = 21.97

export const PACK_PRICES = {
  "Singles Pack - Black Edition": BLACK_PACK_PRICE,
  "Singles Pack - White Edition": WHITE_PACK_PRICE,
  "Singles Pack - Black Edition (Deposit)": BLACK_PACK_PRICE,
  "Singles Pack - White Edition (Deposit)": WHITE_PACK_PRICE,
} as const

export function getPackPrices() {
  return {
    black: BLACK_PACK_PRICE,
    white: WHITE_PACK_PRICE,
  } as const
}
