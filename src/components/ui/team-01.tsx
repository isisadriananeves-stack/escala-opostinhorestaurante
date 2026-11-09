"use client";

// Vitrine da equipe (adaptada do componente "Team 01").
// Recebe as pessoas prontas: quem chama decide de onde vêm os dados.
// Animação de "subir e aparecer" ao rolar a tela, feita com CSS
// (classes .surgir em globals.css), sem pacotes de animação.

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

export type PessoaDaEquipe = {
  id: string;
  nome: string;
  funcao: string;
  telefone?: string | null;
};

type Props = {
  pessoas: PessoaDaEquipe[];
  selo?: string;
  titulo?: string;
};

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

function IconeTelefone({ tamanho = 18 }: { tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

// Fica "true" quando o elemento aparece na tela pela primeira vez.
// Devolve [funçãoParaORef, apareceu].
function useApareceu<T extends Element>(): [(el: T | null) => void, boolean] {
  const [elemento, setElemento] = useState<T | null>(null);
  const [apareceu, setApareceu] = useState(false);
  useEffect(() => {
    if (!elemento) return;
    if (typeof IntersectionObserver === "undefined") {
      // Sem suporte: mostra direto, sem esperar a rolagem.
      const id = requestAnimationFrame(() => setApareceu(true));
      return () => cancelAnimationFrame(id);
    }
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setApareceu(true);
          observador.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [elemento]);
  return [setElemento, apareceu];
}

export default function Team01({
  pessoas,
  selo = "Equipe",
  titulo = "Quem faz O Postinho acontecer",
}: Props) {
  const [refCabecalho, cabecalhoApareceu] = useApareceu<HTMLDivElement>();
  const [refGrade, gradeApareceu] = useApareceu<HTMLUListElement>();

  return (
    <section className="py-6 sm:py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-8">
        <div
          ref={refCabecalho}
          className={`mx-auto flex max-w-xl flex-col items-center gap-3 text-center ${
            cabecalhoApareceu ? "surgir-de-cima" : "surgir-espera"
          }`}
        >
          <Badge>{selo}</Badge>
          <h2 className="text-3xl md:text-5xl">{titulo}</h2>
        </div>

        <ul
          ref={refGrade}
          className="grid w-full grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4"
        >
          {pessoas.map((pessoa, indice) => (
            <li
              key={pessoa.id}
              className={`cartao flex flex-col items-center gap-3 text-center ${
                gradeApareceu ? "surgir" : "surgir-espera"
              }`}
              style={{ animationDelay: `${Math.min(indice, 11) * 0.1}s` }}
            >
              <div
                className="titulo flex aspect-square w-full max-w-[120px] items-center justify-center rounded-full border-4 text-4xl"
                style={{
                  background: "var(--cor-destaque)",
                  color: "var(--cor-texto-destaque)",
                  borderColor: "var(--cor-principal)",
                }}
                aria-hidden
              >
                {iniciais(pessoa.nome)}
              </div>
              <div className="flex flex-col items-center gap-1">
                <h3 className="titulo text-xl leading-tight" style={{ color: "var(--cor-principal)" }}>
                  {pessoa.nome}
                </h3>
                <p className="text-sm text-neutral-600">{pessoa.funcao}</p>
              </div>
              {pessoa.telefone && (
                <a
                  href={`tel:${pessoa.telefone.replace(/[^\d+]/g, "")}`}
                  className="flex h-11 w-11 items-center justify-center rounded-full border-2 active:scale-95"
                  style={{
                    borderColor: "var(--cor-principal)",
                    color: "var(--cor-principal)",
                    background: "#fffaf0",
                  }}
                  aria-label={`Ligar para ${pessoa.nome}`}
                >
                  <IconeTelefone />
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
