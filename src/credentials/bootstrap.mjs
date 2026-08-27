export function createBootstrapCredentialLease(environment = process.env) {
  return ({ database, identity, routes }) => {
    const host = environment.GALERA_ADVERTISED_HOST ?? environment.MARIADB_HOST ?? '127.0.0.1';
    const port = Number(environment.MARIADB_PORT ?? 3306);
    const node = { host, port, weight: 100 };
    const routeSet = Object.fromEntries((routes ?? ['primary', 'balanced']).map((route) => [route, [{ ...node }]]));
    for (const route of ['primary', 'balanced']) routeSet[route] ??= [{ ...node }];
    return { database, identity, username: environment.MARIADB_USER ?? 'root', password: environment.MARIADB_PASSWORD ?? '', routes: routeSet, bundleVersion: 1, expiresAt: new Date(Date.now() + 3600000).toISOString() };
  };
}
