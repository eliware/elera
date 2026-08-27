import { createHash } from "node:crypto";
import { literal } from "../accounts/sql.mjs";

const checksum = (value) => createHash("sha256").update(value).digest("hex");

export function createArtifactStore({ query }) {
  if (typeof query !== "function")
    throw new TypeError("query function is required");
  return {
    async list() {
      const [rows] = await query(
        "SELECT name, kind, key_version AS keyVersion, checksum, created_at AS createdAt, updated_at AS updatedAt FROM elera_meta.artifacts ORDER BY name",
      );
      return rows;
    },
    async get(name) {
      const [rows] = await query(
        `SELECT name, kind, ciphertext, key_version AS keyVersion, checksum, created_at AS createdAt, updated_at AS updatedAt FROM elera_meta.artifacts WHERE name=${literal(name)}`,
      );
      if (!rows[0])
        throw Object.assign(new Error("artifact not found"), {
          statusCode: 404,
        });
      return rows[0];
    },
    async put(
      name,
      { ciphertext, kind = "opaque", keyVersion = "default" } = {},
    ) {
      if (!String(name).trim())
        throw new TypeError("artifact name is required");
      if (
        typeof ciphertext !== "string" ||
        !ciphertext.startsWith("age-encryption.org/")
      )
        throw new TypeError("artifact must contain age ciphertext");
      const digest = checksum(ciphertext);
      await query(
        `INSERT INTO elera_meta.artifacts (name, kind, ciphertext, key_version, checksum) VALUES (${literal(name)}, ${literal(kind)}, ${literal(ciphertext)}, ${literal(keyVersion)}, ${literal(digest)}) ON DUPLICATE KEY UPDATE kind=VALUES(kind), ciphertext=VALUES(ciphertext), key_version=VALUES(key_version), checksum=VALUES(checksum)`,
      );
      return { name, kind, keyVersion, checksum: digest, stored: true };
    },
    async verify(name) {
      const artifact = await this.get(name);
      return {
        name,
        verified: checksum(artifact.ciphertext) === artifact.checksum,
        checksum: artifact.checksum,
      };
    },
    async remove(name) {
      await query(
        `DELETE FROM elera_meta.artifacts WHERE name=${literal(name)}`,
      );
      return { name, removed: true };
    },
  };
}
