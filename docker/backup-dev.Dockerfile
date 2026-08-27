FROM node:26-bookworm-slim

RUN apt-get update \
    && apt-get install --no-install-recommends -y openssh-client mariadb-client age \
    && rm -rf /var/lib/apt/lists/*

COPY elera-cli /workspace/elera-cli
RUN cd /workspace/elera-cli && npm ci

COPY elera/docker/backup-dev-entrypoint.sh /usr/local/bin/backup-dev-entrypoint.sh
RUN chmod 0755 /usr/local/bin/backup-dev-entrypoint.sh

WORKDIR /workspace/elera-cli
ENTRYPOINT ["/usr/local/bin/backup-dev-entrypoint.sh"]
