// Upload de capa manual (POST /api/attachments + PUT /api/note/cover) — usado
// tanto pelo botão "+ Capa" do painel (NotePanel.tsx) quanto pela opção
// "Adicionar capa" do menu "..." de um card na Homepage (NoteCard.tsx), pra
// não duplicar a sequência de duas chamadas em dois lugares.
export async function uploadAndSetCover(
  vaultFetch: (url: string, init?: RequestInit) => Promise<Response>,
  filename: string,
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
  await vaultFetch("/api/note/cover", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, coverPath: data.path }),
  });
  return data.path as string;
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
