export function isHybridCcV1Path(pathname: string, basePath: string): boolean {
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  const relative = pathname.startsWith(normalizedBase)
    ? pathname.slice(normalizedBase.length)
    : pathname.replace(/^\//u, "");
  return relative.replace(/\/+$/u, "") === "dev/hybridcc/v1";
}
