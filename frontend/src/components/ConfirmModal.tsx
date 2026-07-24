"use client";

type Props = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmModal({ title, message, confirmLabel, danger, onConfirm, onCancel }: Props) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel-bg)",
          border: "1px solid var(--panel-border)",
          borderRadius: "8px",
          padding: "1.5rem",
          width: "360px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}
      >
        <h3 style={{ marginBottom: "0.5rem", fontSize: "1rem", color: "var(--foreground)" }}>{title}</h3>
        <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-muted)" }}>{message}</p>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.25rem" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "0.4rem 0.8rem",
              border: "1px solid var(--panel-border)",
              borderRadius: "4px",
              background: "transparent",
              color: "var(--foreground)",
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "0.4rem 0.8rem",
              border: "none",
              borderRadius: "4px",
              background: danger ? "#d04444" : "#2f7fd6",
              color: "white",
              cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
