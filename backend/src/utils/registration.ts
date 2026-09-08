/** Las fechas de registro son días civiles, no instantes UTC. El cierre es inclusivo. */
export function registrationOpen(deadline: string | Date | null, now = new Date()): boolean {
  if (!deadline) return true;
  const date = deadline instanceof Date ? deadline.toISOString().slice(0, 10) : deadline.slice(0, 10);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cancun', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return today <= date;
}
