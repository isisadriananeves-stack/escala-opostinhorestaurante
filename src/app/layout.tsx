import type { Metadata } from "next";
import { Lilita_One } from "next/font/google";
import "./globals.css";
import { identidade } from "@/config/identidade";
import { Cabecalho } from "@/components/Cabecalho";

// Letra grossa e arredondada, usada nos títulos e botões.
const fonteTitulo = Lilita_One({
  weight: "400",
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
    "--cor-destaque": identidade.corDestaque,
    "--cor-texto-destaque": identidade.corTextoDestaque,
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
