// Formata um horário de parede (ms desde epoch, ver last_activity_ms em
// vaultIndex.ts) como tempo relativo em português — usado pela seção
// "Editados recentemente" da Homepage. "ontem" usa fronteira de dia de
// calendário (comparando datas locais), não uma janela corrida de 24h — é
// mais intuitivo (ex: editado às 23h de ontem e visto às 1h de hoje continua
// "ontem", não "há 2h").

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function formatRelativeTime(ms: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - ms);

  if (diff < MINUTE_MS) return "agora";
  if (diff < HOUR_MS) return `há ${Math.floor(diff / MINUTE_MS)} min`;
  if (diff < DAY_MS) return `há ${Math.floor(diff / HOUR_MS)} h`;

  const dayDiff = Math.round((startOfDay(now) - startOfDay(ms)) / DAY_MS);
  if (dayDiff <= 1) return "ontem";
  if (dayDiff < 7) return `há ${dayDiff} dias`;

  const weeks = Math.floor(dayDiff / 7);
  if (weeks < 5) return `há ${weeks} semana${weeks > 1 ? "s" : ""}`;

  const months = Math.floor(dayDiff / 30);
  if (months < 12) return `há ${months} ${months > 1 ? "meses" : "mês"}`;

  const years = Math.floor(dayDiff / 365);
  return `há ${years} ano${years > 1 ? "s" : ""}`;
}
