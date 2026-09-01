export function createBootstrapCredentialLease(environment = process.env, runtimeIdentity) {
  return ({ database, identity, routes }) => {
    const host = runtimeIdentity?.name;
    if (!host) throw new Error('runtime identity is required for bootstrap credential leases');
    if (identity !== undefined && identity !== host) throw Object.assign(new Error(`bootstrap lease identity ${identity} does not match runtime identity ${host}`), { code: 'RUNTIME_IDENTITY_MISMATCH', statusCode: 409 });
    const port = Number(environment.ELERA_NODE_SQL_PORT ?? 3306);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('ELERA_NODE_SQL_PORT must be a valid TCP port');
    const node = { host, port, weight: 100 };
    const routeSet = Object.fromEntries((routes ?? ['primary', 'balanced']).map((route) => [route, [{ ...node }]]));
    for (const route of ['primary', 'balanced']) routeSet[route] ??= [{ ...node }];
    return { database, identity: host, username: 'root', password: '', routes: routeSet, bundleVersion: 1, expiresAt: new Date(Date.now() + 3600000).toISOString() };
  };
}
