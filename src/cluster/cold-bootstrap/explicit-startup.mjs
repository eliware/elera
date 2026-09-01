const modes = new Set(["bootstrap", "join", "standalone"]);
const isFqdn = (value) => typeof value === 'string' && value.includes('.') && value.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));

export function explicitStartupDecision(environment = process.env, nodeName) {
  const mode = environment.ELERA_EXPLICIT_START_MODE;
  if (!mode) return undefined;
  if (!modes.has(mode) || !isFqdn(nodeName)) throw new Error("invalid explicit startup mode");
  return {
    mode,
    localWinner: mode === "bootstrap",
    bootstrapComplete: mode === "join",
    winner: mode === "bootstrap" ? nodeName : undefined,
    reason: `explicit ${mode} initialization handoff`,
    epoch: null,
    evidence: [],
  };
}
