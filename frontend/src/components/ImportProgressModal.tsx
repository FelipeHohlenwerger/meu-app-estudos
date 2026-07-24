"use client";

type Props = {
  message?: string;
};

export default function ImportProgressModal({ message = "Convertendo arquivo..." }: Props) {
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
    >
      <div
        style={{
          background: "var(--panel-bg)",
          border: "1px solid var(--panel-border)",
          borderRadius: "8px",
          padding: "1.5rem 2rem",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            width: "18px",
            height: "18px",
            border: "2px solid var(--panel-border)",
            borderTopColor: "#2f7fd6",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <span>{message}</span>
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
