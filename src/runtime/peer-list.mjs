export function peerList(value = '') {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}
