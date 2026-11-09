import type { Metadata } from "next";
import { Oswald } from "next/font/google";
import "./globals.css";
import { identidade } from "@/config/identidade";
import { Cabecalho } from "@/components/Cabecalho";

// Letra condensada de letreiro antigo (parecida com a do logo),
// usada nos títulos, botões e menu.
const fonteTitulo = Oswald({
  subsets: ["latin"],
  display: "swap",
  variable: "--fonte-titulo",
});

export const metadata: Metadata = {
  title: `Escala · ${identidade.nome}`,
  description: "Sistema de escala de funcionários",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // As cores da identidade viram variáveis CSS para toda a aplicação.
  const estilo = {
    "--cor-principal": identidade.corPrincipal,
    "--cor-secundaria": identidade.corSecundaria,
    "--cor-detalhe": identidade.corDetalhe,
    "--cor-texto-claro": identidade.corTextoClaro,
  } as React.CSSProperties;

  return (
    <html
      lang="pt-BR"
      className={`h-full antialiased ${fonteTitulo.variable}`}
      style={estilo}
    >
      <body className="flex min-h-full flex-col">
        <Cabecalho />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">{children}</main>
        <footer className="px-4 py-6 text-center text-xs text-[color:var(--cor-principal)] opacity-70">
          {identidade.nome} · sistema de escala
        </footer>
      </body>
    </html>
  );
}
