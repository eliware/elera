FROM node:26-bookworm-slim

RUN apt-get update \
    && apt-get install --no-install-recommends -y openssh-client mariadb-client age \
    && rm -rf /var/lib/apt/lists/*

COPY elera-cli /workspace/elera-cli
RUN cd /workspace/elera-cli && npm ci

COPY elera/docker/sample-app /workspace/sample-app
RUN cd /workspace/sample-app && npm install --omit=dev

COPY elera/docker/backup-dev-e2e.mjs /workspace/backup-dev-e2e.mjs
COPY elera/docker/e2e /workspace/e2e

WORKDIR /workspace/elera-cli
COPY elera/docker/backup-dev-entrypoint.mjs /usr/local/bin/backup-dev-entrypoint.mjs
ENTRYPOINT ["node", "/usr/local/bin/backup-dev-entrypoint.mjs"]
