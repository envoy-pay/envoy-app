export function shortAddress(addr: string, head = 6, tail = 4): string {
  if (!addr.startsWith("0x") || addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head + 2)}…${addr.slice(-tail)}`;
}
