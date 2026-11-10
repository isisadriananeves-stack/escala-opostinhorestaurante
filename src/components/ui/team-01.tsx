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
                className="titulo flex aspect-square w-full max-w-[120px] items-center justify-center rounded-full text-4xl"
                style={{
                  // Selo com anel duplo, como o do logo.
                  background: "var(--cor-secundaria)",
                  color: "var(--cor-principal)",
                  border: "5px double var(--cor-principal)",
                  boxShadow: "0 0 0 3px var(--cor-cartao), 0 0 0 4px var(--cor-detalhe)",
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
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
