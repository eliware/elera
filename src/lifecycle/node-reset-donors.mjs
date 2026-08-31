export function selectRecoveryDonor({ donors, node } = {}) {
  const eligible = Array.isArray(donors) ? donors.filter((donor) => donor?.healthy === true && donor?.primary === true && donor.node !== node) : [];
  if (eligible.length === 0) throw Object.assign(new Error('single-member-resync requires a healthy Primary donor'), { statusCode: 409 });
  eligible.sort((left, right) => String(left.node).localeCompare(String(right.node)));
  return eligible[0].node;
}
