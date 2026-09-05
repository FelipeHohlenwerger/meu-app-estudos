import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces, Lora, Literata, Source_Serif_4, Inter, Atkinson_Hyperlegible } from "next/font/google";
import Script from "next/script";
import AppShell from "@/components/AppShell";
import "./globals.css";

// Todo o app é dinâmico (índice SQLite local, single-user) — não há nada
// pra pré-renderizar estaticamente. Setado aqui (não em cada page.tsx) desde
// a correção do bug de "flicker" na navegação: ver comentário grande abaixo,
// sobre AppShell ter subido pro layout raiz — force-dynamic aqui já vale pra
// toda rota da árvore, sem precisar repetir em cada page.tsx fino.
export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Usada só nos títulos da página "biblioteca" (src/components/LibraryHome.tsx e
// TagNoteList.tsx) — o resto do app continua na fonte sans já existente.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

// Opções de fonte do corpo das notas (ver src/lib/fonts.ts) — cada uma vira
// uma CSS variable; o navegador só baixa o arquivo da fonte realmente usada
// em algo visível, então declarar as 5 aqui não baixa as 5 à toa.
const lora = Lora({ variable: "--font-lora", subsets: ["latin"] });
const literata = Literata({ variable: "--font-literata", subsets: ["latin"] });
const sourceSerif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"] });
const interBody = Inter({ variable: "--font-inter-body", subsets: ["latin"] });
const atkinsonHyperlegible = Atkinson_Hyperlegible({
  variable: "--font-atkinson",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Meu App de Estudos",
  description: "Editor de notas local-first com fichamento ativo, leitor de PDF/EPUB e integração com IA.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${lora.variable} ${literata.variable} ${sourceSerif.variable} ${interBody.variable} ${atkinsonHyperlegible.variable} h-full antialiased`}
      // O script de tema abaixo seta "data-theme" no <html> antes da hidratação,
      // que o servidor nunca renderiza (não tem acesso a localStorage) — isso é
      // intencional, não deixa o React tentar "corrigir" e reclamar do mismatch.
      suppressHydrationWarning
    >
      <head>
        {/* Aplica o tema salvo ANTES do primeiro paint — sem isso a página
            sempre nasceria escura por uma fração de segundo mesmo com o tema
            claro salvo, já que o CSS/React só reagem depois da hidratação.
            "beforeInteractive" é a forma suportada pelo Next pra isso (um
            <script> comum gera aviso do React e não tem essa garantia). */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("theme");if(t==="light")document.documentElement.dataset.theme="light";}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {/* AppShell mora AQUI (no layout raiz), não em cada page.tsx — ver bug
            corrigido: cada rota (/, /notes/[filename], /reader/[filename]
            etc.) tinha seu PRÓPRIO page.tsx renderizando <AppShell/>, e o
            App Router troca o conteúdo de "children" por um componente NOVO
            a cada navegação entre rotas irmãs (o "Page" de um arquivo é um
            tipo de componente diferente do "Page" de outro arquivo, mesmo
            retornando o mesmo JSX) — React desmonta e remonta a árvore
            inteira nesse ponto a cada clique, o que na prática parecia um
            reload completo (sidebar "piscando", perdendo scroll/estado,
            revalidando vaults/library do zero). O layout raiz, ao contrário
            de "page.tsx", NUNCA remonta entre navegações client-side pra
            rotas que ele engloba — é exatamente a garantia que faltava.
            AppShell não precisa de nada vindo de "children" (lê a tela atual
            direto da URL via usePathname/useParams/useSearchParams), mas
            "children" continua renderizado normalmente (sempre null agora,
            já que cada page.tsx virou um placeholder vazio) só pra manter o
            contrato usual do layout. */}
        <AppShell />
        {children}
      </body>
    </html>
  );
}
