const modes = new Set(["bootstrap", "join", "standalone"]);

export function explicitStartupDecision(environment = process.env, nodeName) {
  const mode = environment.ELERA_EXPLICIT_START_MODE;
  if (!mode) return undefined;
  if (!modes.has(mode) || !nodeName) throw new Error("invalid explicit startup mode");
  return {
    mode,
    localWinner: mode === "bootstrap",
    winner: mode === "bootstrap" ? nodeName : undefined,
    reason: `explicit ${mode} initialization handoff`,
    epoch: null,
    evidence: [],
  };
}
