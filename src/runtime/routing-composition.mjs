import { createAssignmentStore } from '../routing/assignment-store.mjs';
import { createMetadataAssignmentStore } from '../routing/metadata-assignments.mjs';
import { createRoutingBundleService } from '../routing/bundle-service.mjs';
import { createRoutingEventSnapshot } from '../routing/event-snapshot.mjs';
import { createRoutingEventBus } from '../routing/event-bus.mjs';
import { createEventVersionStore } from '../routing/event-version-store.mjs';

export function createRoutingComposition({
  environment = process.env,
  config,
  identity,
  observationStore,
  managed,
  query,
  resolveAddress,
  log,
  getDrained = () => false,
} = {}) {
  const routingEnvironment = { ...environment, ELERA_CLUSTER_SIZE: String(config.clusterSize) };
  const sharedRoutingAssignments = createMetadataAssignmentStore({ query });
  const routingAssignments = createAssignmentStore({
    path: environment.ELERA_ASSIGNMENTS_PATH ?? `${environment.MARIADB_DATA_DIR ?? '/var/lib/mysql'}/elera-state/routing-assignments.json`,
  });
  const routingBundles = createRoutingBundleService({
    managed,
    observationStore,
    environment: routingEnvironment,
    assignmentStore: sharedRoutingAssignments,
    validateAddresses: true,
    resolveAddress,
    log,
  });
  const routingEvent = createRoutingEventSnapshot({
    observationStore,
    assignmentStore: sharedRoutingAssignments,
    environment: routingEnvironment,
    nodeIdentity: identity,
    getDrained,
    versionStore: createEventVersionStore({ path: environment.ELERA_EVENT_VERSION_PATH }),
  });
  const routingBus = createRoutingEventBus({ log });
  return { routingEnvironment, routingAssignments, sharedRoutingAssignments, routingBundles, routingEvent, routingBus };
}
