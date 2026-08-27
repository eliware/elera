FROM alpine:3.22

RUN apk add --no-cache openssh-server
COPY elera/docker/backup-nas-entrypoint.sh /usr/local/bin/backup-nas-entrypoint.sh
RUN chmod 0755 /usr/local/bin/backup-nas-entrypoint.sh

EXPOSE 22
ENTRYPOINT ["/usr/local/bin/backup-nas-entrypoint.sh"]
