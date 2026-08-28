export const unsafeDataDirectoryCases = Object.freeze([
  'missing',
  'empty',
  'partial',
  'stale',
  'corrupt',
  'read-only',
  'insufficient-space',
]);

export async function assertDataDirectoryRefusal({ lab, caseName } = {}) {
  if (!unsafeDataDirectoryCases.includes(caseName)) throw new TypeError(`unknown data-directory case: ${caseName}`);
  const result = await lab.start({ bootstrap: false, dataDirectoryCase: caseName });
  if (result.started === true || result.initialized === true) throw new Error(`${caseName} data directory was accepted without explicit recovery`);
  if (!result.reason) throw new Error(`${caseName} refusal did not include a diagnostic`);
  return result;
}
