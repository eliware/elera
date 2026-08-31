export const createPendingInitAuthenticator = (environment) => (request) => Boolean(environment.ROOT_TOKEN) && request.headers.authorization === `Bearer ${environment.ROOT_TOKEN}`;

