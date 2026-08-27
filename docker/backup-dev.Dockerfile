FROM node:26-bookworm-slim

RUN apt-get update \
    && apt-get install --no-install-recommends -y openssh-client mariadb-client age \
    && rm -rf /var/lib/apt/lists/*

COPY galera-lib /workspace/galera-lib
COPY galera-cli /workspace/galera-cli
RUN cd /workspace/galera-lib && npm ci \
    && cd /workspace/galera-cli && npm ci

COPY galera/docker/backup-dev-entrypoint.sh /usr/local/bin/backup-dev-entrypoint.sh
RUN chmod 0755 /usr/local/bin/backup-dev-entrypoint.sh

WORKDIR /workspace/galera-cli
ENTRYPOINT ["/usr/local/bin/backup-dev-entrypoint.sh"]
