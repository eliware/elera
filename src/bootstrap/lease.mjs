export function createBootstrapCredentialLease(environment = process.env) {
  return ({ database, identity, routes }) => {
    const host = environment.RUNTIME_NODE_ADDRESS ?? '127.0.0.1';
    const port = 3306;
    const node = { host, port, weight: 100 };
    const routeSet = Object.fromEntries((routes ?? ['primary', 'balanced']).map((route) => [route, [{ ...node }]]));
    for (const route of ['primary', 'balanced']) routeSet[route] ??= [{ ...node }];
    return { database, identity, username: 'root', password: '', routes: routeSet, bundleVersion: 1, expiresAt: new Date(Date.now() + 3600000).toISOString() };
  };
}
