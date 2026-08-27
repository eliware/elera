FROM alpine:3.22

RUN apk add --no-cache openssh-server
COPY elera/docker/backup-nas-entrypoint.mjs /usr/local/bin/backup-nas-entrypoint.mjs

EXPOSE 22
ENTRYPOINT ["node", "/usr/local/bin/backup-nas-entrypoint.mjs"]
