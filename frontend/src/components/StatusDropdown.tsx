"use client";

import { STATUS_COLORS } from "@/lib/colors";
import { STATUS_LABELS, statusOrderFor, type ContentType } from "@/lib/noteStatus";

type Props = {
  status: string;
  contentType: ContentType;
  onChange: (status: string) => void;
};

export default function StatusDropdown({ status, contentType, onChange }: Props) {
  const options = statusOrderFor(contentType);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
      <span
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: STATUS_COLORS[status],
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      <select
        value={status}
        onChange={(e) => onChange(e.target.value)}
        title="Status de estudo"
        style={{
          // Fundo sólido (não "transparent") — o menu suspenso do <select>
          // herda essa cor pra si mesmo; com fundo transparente ele cai no
          // branco/preto padrão do navegador e o texto (var(--foreground))
          // fica ilegível contra isso. Ver também "color-scheme" em globals.css.
          background: "var(--panel-bg)",
          border: "1px solid var(--panel-border)",
          borderRadius: "4px",
          color: "var(--foreground)",
          cursor: "pointer",
          padding: "0.3rem 0.5rem",
          fontSize: "0.85rem",
        }}
      >
        {options.map((value) => (
          <option key={value} value={value} style={{ background: "var(--panel-bg)", color: "var(--foreground)" }}>
            {STATUS_LABELS[value]}
          </option>
        ))}
      </select>
    </div>
  );
}
