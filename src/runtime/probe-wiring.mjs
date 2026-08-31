import { createProbeServer } from '../probes.mjs';

export function createSupervisorProbes(options) {
  return createProbeServer(options);
}
