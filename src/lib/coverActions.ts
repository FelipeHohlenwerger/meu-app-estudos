// Sobe o arquivo de imagem pra <vault>/attachments/ (POST /api/attachments) —
// primeiro passo comum a capa de nota E capa de subtema, só o segundo passo
// (qual rota associa o path resultante a quê) difere entre as duas.
async function uploadCoverImage(
  vaultFetch: (url: string, init?: RequestInit) => Promise<Response>,
  file: File
): Promise<string | null> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await vaultFetch("/api/attachments", { method: "POST", body: formData });
  const data = await res.json();
  if (!data.path) {
    window.alert(data.error ?? "Não foi possível enviar a capa");
    return null;
  }
  return data.path as string;
}

// Upload de capa manual de NOTA (POST /api/attachments + PUT /api/note/cover)
// — usado tanto pelo botão "+ Capa" do painel (NotePanel.tsx) quanto pela
// opção "Adicionar capa" do menu "..." de um card na Homepage (NoteCard.tsx),
// pra não duplicar a sequência de duas chamadas em dois lugares.
export async function uploadAndSetCover(
  vaultFetch: (url: string, init?: RequestInit) => Promise<Response>,
  filename: string,
  file: File
): Promise<string | null> {
  const coverPath = await uploadCoverImage(vaultFetch, file);
  if (!coverPath) return null;
  await vaultFetch("/api/note/cover", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, coverPath }),
  });
  return coverPath;
}

export async function removeCover(
  vaultFetch: (url: string, init?: RequestInit) => Promise<Response>,
  filename: string
): Promise<void> {
  await vaultFetch("/api/note/cover", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, coverPath: null }),
  });
}

// Mesma ideia acima, mas pra capa manual de SUBTEMA (PUT /api/tag/cover) —
// usado pelo SubtemaCard na página de foco (TagFocusPage.tsx). `tagPath` é o
// caminho de tag completo do subtema (ex: "história.pré-história.livros"),
// nunca o texto de exibição formatado.
export async function uploadAndSetTagCover(
  vaultFetch: (url: string, init?: RequestInit) => Promise<Response>,
  tagPath: string,
  file: File
): Promise<string | null> {
  const coverPath = await uploadCoverImage(vaultFetch, file);
  if (!coverPath) return null;
  await vaultFetch("/api/tag/cover", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tagPath, coverPath }),
  });
  return coverPath;
}

export async function removeTagCover(
  vaultFetch: (url: string, init?: RequestInit) => Promise<Response>,
  tagPath: string
): Promise<void> {
  await vaultFetch("/api/tag/cover", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tagPath, coverPath: null }),
  });
}
