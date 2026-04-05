declare const __TWORLD_GIT_COMMIT__: string | undefined;

export const TWORLD_BUILD_COMMIT =
  typeof __TWORLD_GIT_COMMIT__ === "string" && __TWORLD_GIT_COMMIT__.length > 0
    ? __TWORLD_GIT_COMMIT__
    : "unknown";
