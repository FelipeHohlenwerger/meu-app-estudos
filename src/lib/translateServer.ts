// Chamada server-side pro MTranServer (github.com/xxnuo/mtranserver) — servidor
// de tradução offline self-hosted, rodando via Docker num computador da rede
// local (ver CLAUDE.md pro histórico completo da migração). Substitui o
// endpoint gratuito e não-oficial do Google Tradutor (translate.googleapis.com/
// translate_a/single), abandonado depois de ficar bloqueado por rate limit por
// vários dias seguidos, sem melhora nem depois de trocar o IP público — um
// endpoint de terceiro sem SLA nenhum não é viável como dependência
// permanente. Nunca hospeda o container aqui: `MTRANSERVER_URL` aponta pro
// endereço de rede de onde o container está rodando (ver .env.example) —
// tradução fica indisponível sempre que essa máquina estiver desligada ou
// fora da rede, e isso precisa aparecer como erro claro, não falha silenciosa.

export class TranslateError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function callTranslate(
  texto: string
): Promise<{ translatedText: string; detectedSourceLanguage?: string }> {
  const baseUrl = process.env.MTRANSERVER_URL;
  if (!baseUrl) {
    throw new TranslateError(
      "MTRANSERVER_URL não configurada — crie .env.local com essa variável (ver .env.example).",
      500
    );
  }
  const apiToken = process.env.MTRANSERVER_API_TOKEN;

  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, "")}/translate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
      },
      // "from: auto" — MTranServer detecta o idioma de origem sozinho (par
      // inglês/português configurado no servidor); "to: pt" sempre fixo,
      // igual ao endpoint antigo, porque o app sempre traduz PRA português,
      // não o contrário.
      body: JSON.stringify({ from: "auto", to: "pt", text: texto, html: false }),
    });
  } catch {
    // Mesmo padrão de mensagem já usado pro "servidor Calibre inalcançável"
    // (page.tsx) — aqui a causa mais provável é o notebook desligado ou fora
    // da rede local, não a internet da pessoa (o serviço é local).
    throw new TranslateError(
      "Não foi possível conectar ao serviço de tradução — verifique se o notebook está ligado e acessível na rede local.",
      503
    );
  }

  if (!res.ok) {
    throw new TranslateError(`Erro ao chamar o serviço de tradução (HTTP ${res.status})`, res.status);
  }

  const data = await res.json().catch(() => null);
  const translatedText = typeof data?.result === "string" ? data.result : undefined;
  if (!translatedText) {
    throw new TranslateError("O serviço de tradução não retornou nenhum resultado", 502);
  }

  // Alguns idiomas de origem valem a pena mostrar na UI ("Traduzido do
  // inglês") — só quando o servidor realmente resolveu um idioma concreto,
  // nunca o literal "auto" de volta.
  const detectedSourceLanguage = typeof data?.from === "string" && data.from !== "auto" ? data.from : undefined;

  return { translatedText, detectedSourceLanguage };
}
