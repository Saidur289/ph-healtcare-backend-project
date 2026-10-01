// "yyyy-MM-dd" -> that calendar day at 00:00 UTC. Parsing at the server's local
// midnight shifted the stored date to the previous day for UTC+ time zones.
export const convertDate = (date: string | undefined) => {
  if (!date) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return undefined;
  const [, y, m, d] = match.map(Number);
  const value = new Date(Date.UTC(y, m - 1, d));
  // reject impossible days such as 2024-02-31
  if (value.getUTCFullYear() !== y || value.getUTCMonth() !== m - 1 || value.getUTCDate() !== d) return undefined;
  return value;
};
