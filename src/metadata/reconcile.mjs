const identityKey = (value) => `${value.application}:${value.name}`;

export function createMetadataReconciler({ managed, accounts } = {}) {
  if (!managed) throw new TypeError('managed metadata service is required');

  async function snapshot() {
    const [databases, identities, accountRows] = await Promise.all([
      managed.listDatabases(),
      managed.listIdentities(),
      accounts?.list?.() ?? []
    ]);
    return { databases, identities, accounts: accountRows };
  }

  async function plan(desired = {}) {
    const current = await snapshot();
    const currentDatabases = new Map(current.databases.map((item) => [item.name, item]));
    const currentIdentities = new Map(current.identities.map((item) => [identityKey(item), item]));
    const currentAccounts = new Set(current.accounts.map((item) => `${item.user}:${item.host}`));
    const changes = [];
    for (const database of desired.databases ?? []) {
      if (!currentDatabases.has(database.database ?? database.name)) changes.push({ operation: 'database.create', data: database });
    }
    for (const identity of desired.identities ?? []) {
      if (!currentIdentities.has(identityKey(identity))) changes.push({ operation: 'identity.create', data: identity });
    }
    for (const account of desired.accounts ?? []) {
      if (!currentAccounts.has(`${account.user}:${account.host ?? '%'}`)) changes.push({ operation: 'account.create', data: account });
    }
    return { desired, current, changes, converged: changes.length === 0 };
  }

  async function apply(desired, { confirm = false } = {}) {
    if (!confirm) throw Object.assign(new Error('reconcile apply requires confirm: true'), { statusCode: 409 });
    const before = await plan(desired);
    const results = [];
    for (const change of before.changes) {
      if (change.operation === 'database.create') results.push(await managed.createDatabase({ application: change.data.application, databaseName: change.data.database ?? change.data.name }));
      if (change.operation === 'identity.create') results.push(await managed.createIdentity({ application: change.data.application, databaseName: change.data.database, identity: change.data.name ?? change.data.identity, purpose: change.data.purpose, grants: change.data.grants }));
      if (change.operation === 'account.create') results.push(await accounts.provision(change.data));
    }
    return { ...before, results, applied: results.length };
  }

  async function verify(desired) {
    const result = await plan(desired);
    return { verified: result.converged, ...result };
  }

  return { plan, apply, verify };
}
