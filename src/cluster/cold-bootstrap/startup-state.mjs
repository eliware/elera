export function shouldStartMariaDb({ elera, mode, localWinner = false, bootstrapComplete = false } = {}) {
  if (typeof elera !== "boolean" || typeof mode !== "string") throw new TypeError("startup state requires elera and mode");
  if (!elera) return true;
  if (mode === 'bootstrap') return localWinner === true;
  if (mode === 'join') return bootstrapComplete === true;
  if (mode === 'rejoin') return true;
  return false;
}
