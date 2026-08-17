import type * as CCSolverPorts from "@tworld/ccsolver/ports";

// This type-only seam proves the intended dependency direction without defining
// the P2 runtime contract prematurely. Concrete adapters will live on this side.
export type CCSolverPortsPackageBoundary = typeof CCSolverPorts;
