declare const sessionDigestBrand: unique symbol;

export type SessionDigest = string & {
  readonly [sessionDigestBrand]: "SessionDigest";
};
