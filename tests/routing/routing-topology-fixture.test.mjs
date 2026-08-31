import { expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { validateRoutingEvent } from '@eliware/elera-lib';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/routing-topology/positive.json', import.meta.url)));
const invalid = JSON.parse(readFileSync(new URL('../fixtures/routing-topology/negative.json', import.meta.url)));

test('defines a credential-free topology event fixture accepted by elera-lib', () => { expect(fixture.type).toBe('routing.topology'); expect(fixture.version).toBeGreaterThan(0); expect(fixture.context.ports.sql).toBe(3306); expect(fixture).not.toHaveProperty('credentials'); expect(validateRoutingEvent(fixture)).toBe(fixture); });
test('negative fixture captures required rejection cases', () => { expect(invalid.version).toBe(0); expect(invalid.generatedAt).toBe('not-a-timestamp'); expect(invalid.context.ports.sql).toBe('3306'); expect(invalid).toHaveProperty('credentials'); });
