import { expect, test } from '@jest/globals';
import fixture from '../../contracts/supervisor-intent.fixture.json' with { type: 'json' };
import { renderMariaDbConfig } from '../../src/intent/render.mjs';

test('renders standalone and Elera configuration', () => { const standalone = structuredClone(fixture); delete standalone.mariadb.dataDir; expect(renderMariaDbConfig(standalone)).toContain('datadir=/var/lib/mysql'); const cluster = structuredClone(fixture); cluster.cluster.members.push({ name: 'elera-2.cluster.local', address: 'elera-2.cluster.local' }); expect(renderMariaDbConfig(cluster)).toContain('wsrep_on=ON'); });
