export const VERTICAL_SUPPORT_RESULT = {
  supported: "supported",
  unsupported: "unsupported",
} as const;

export type VerticalSupportResult = (typeof VERTICAL_SUPPORT_RESULT)[keyof typeof VERTICAL_SUPPORT_RESULT];

export function hasVerticalSupport(result: VerticalSupportResult): boolean {
  return result === VERTICAL_SUPPORT_RESULT.supported;
}
