// Escape user input before putting it in a RegExp. Prevents regex injection and ReDoS.
export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');