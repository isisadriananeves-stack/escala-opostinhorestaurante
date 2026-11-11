"use client";

// Painel com a escala sugerida pela IA, para o dono conferir antes de salvar.
// Nada é gravado aqui: quem salva é a tela Escala, ao tocar em "Aprovar e salvar".

import { useEffect } from "react";
import { REGRAS } from "@/config/regras";
import { calcularAlertas, chaveCelula, ROTULO_TIPO } from "@/lib/alertas";
import { diaMes, diasDaSemana, horaCurta, rotuloDia, somarDias } from "@/lib/datas";
import type {
  Escala,
  EscalaSugerida,
  FuncionarioEscala as Funcionario,
  RespostaSugestao,
  Turno,
} from "@/lib/tipos";

const chaveLugar = (e: EscalaSugerida) => `${e.data}|${e.turno_id}|${e.funcionario_id}`;

/** O que muda na semana se a proposta for aprovada. */
export function diferencaDaProposta(
  proposta: EscalaSugerida[],
  escalasAtuais: Escala[],
  segunda: string,
): { entram: EscalaSugerida[]; saem: Escala[] } {
  const dias = new Set(diasDaSemana(segunda));
  const atuais = escalasAtuais.filter((e) => dias.has(e.data));
  const chavesAtuais = new Set(atuais.map(chaveLugar));
  const chavesProposta = new Set(proposta.map(chaveLugar));
  return {
    entram: proposta.filter((e) => !chavesAtuais.has(chaveLugar(e))),
    saem: atuais.filter((e) => !chavesProposta.has(chaveLugar(e))),
  };
}

function primeiroNome(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return partes.length > 1 ? `${partes[0]} ${partes[1][0]}.` : partes[0];
}

export function PropostaEscala({
  proposta,
  segunda,
  turnos,
  funcionarios,
  escalasAtuais,
  salvando,
  erro,
  onAprovar,
  onDescartar,
}: {
  proposta: RespostaSugestao;
  segunda: string;
  turnos: Turno[];
  funcionarios: Funcionario[];
  // Escala salva no período carregado pela tela (semana e dias ao redor).
  escalasAtuais: Escala[];
  salvando: boolean;
  erro: string | null;
  onAprovar: () => void;
  onDescartar: () => void;
}) {
  const dias = diasDaSemana(segunda);
  const porId = new Map(funcionarios.map((f) => [f.id, f]));
  const { entram, saem } = diferencaDaProposta(proposta.escalas, escalasAtuais, segunda);
  const semMudanca = entram.length === 0 && saem.length === 0;

  // Confere a proposta com as mesmas regras da tela: fora da semana fica o que já está salvo.
  const diasSet = new Set(dias);
  const simuladas: Escala[] = [
    ...escalasAtuais.filter((e) => !diasSet.has(e.data)),
    ...proposta.escalas.map((e, i) => ({ ...e, id: `proposta-${i}` })),
  ];
  const { alertas } = calcularAlertas({
    regras: REGRAS,
    segunda,
    turnos,
    funcionarios,
    escalas: simuladas,
  });

  const chavesEntram = new Set(entram.map(chaveLugar));
  function pessoasDoQuadro(data: string, turnoId: string) {
    const ficam = proposta.escalas
      .filter((e) => e.data === data && e.turno_id === turnoId)
      .map((e) => ({ f: porId.get(e.funcionario_id), nova: chavesEntram.has(chaveLugar(e)) }));
    const saindo = saem
      .filter((e) => e.data === data && e.turno_id === turnoId)
      .map((e) => ({ f: porId.get(e.funcionario_id) }));
    const ordenar = <T extends { f?: Funcionario }>(l: T[]) =>
      l
        .filter((p): p is T & { f: Funcionario } => Boolean(p.f))
        .sort((a, b) => a.f.nome.localeCompare(b.f.nome, "pt-BR"));
    return { ficam: ordenar(ficam), saindo: ordenar(saindo) };
  }

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape" && !salvando) onDescartar();
    }
    window.addEventListener("keydown", aoTeclar);
    const overflowAntigo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAntigo;
    };
  }, [onDescartar, salvando]);

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Escala sugerida"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-2xl bg-white shadow-lg sm:rounded-2xl"
      >
        <div className="border-b border-neutral-200 p-4">
          <p className="titulo text-xl" style={{ color: "var(--cor-principal)" }}>
            Escala sugerida · {diaMes(segunda)} a {diaMes(somarDias(segunda, 6))}
          </p>
          <p className="text-sm font-semibold text-amber-800">
            Ainda não foi salva. Confira e toque em Aprovar.
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {proposta.observacoes.length > 0 && (
            <section className="rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="font-semibold text-amber-900">Recado da IA</p>
              <ul className="mt-1 space-y-1 text-sm text-amber-900">
                {proposta.observacoes.map((o, i) => (
                  <li key={i}>• {o}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-wrap gap-2 text-base font-semibold">
            <span className="rounded-lg bg-green-100 px-3 py-1 text-green-900">
              + {entram.length} {entram.length === 1 ? "entrada" : "entradas"}
            </span>
            <span className="rounded-lg bg-red-100 px-3 py-1 text-red-900">
              − {saem.length} {saem.length === 1 ? "saída" : "saídas"}
            </span>
          </section>

          <section
            className={`rounded-xl border p-3 ${
              alertas.length > 0 ? "border-red-300 bg-red-50" : "border-green-300 bg-green-50"
            }`}
          >
            {alertas.length === 0 ? (
              <p className="font-semibold text-green-800">✓ A sugestão cumpre todas as regras</p>
            ) : (
              <>
                <p className="font-semibold text-red-800">
                  ⚠ {alertas.length} {alertas.length === 1 ? "alerta continua" : "alertas continuam"}
                </p>
                <ul className="mt-2 space-y-1">
                  {alertas.map((a, i) => (
                    <li key={i} className="text-sm text-red-900">
                      • <span className="font-semibold">{ROTULO_TIPO[a.tipo]}:</span> {a.texto}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <p className="text-sm text-neutral-600">
            <span className="rounded bg-green-100 px-1 text-green-900">Verde</span> = entra na
            escala. <span className="rounded bg-red-100 px-1 text-red-900 line-through">Riscado</span>{" "}
            = sai. Arraste a grade para o lado para ver todos os dias.
          </p>

          <div className="overflow-x-auto rounded-xl border border-neutral-200">
            <table className="w-full border-separate border-spacing-0 text-left">
              <thead>
                <tr>
                  <th className="titulo sticky left-0 z-[1] min-w-[84px] border-b border-r border-neutral-200 bg-white p-2 text-base">
                    Turno
                  </th>
                  {dias.map((dia) => (
                    <th
                      key={dia}
                      className="titulo min-w-[108px] border-b border-neutral-200 p-2 text-center text-base"
                    >
                      {rotuloDia(dia)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {turnos.map((turno) => (
                  <tr key={turno.id}>
                    <th className="sticky left-0 z-[1] border-b border-r border-neutral-200 bg-white p-2 align-top">
                      <span className="titulo block text-lg">{turno.nome}</span>
                      <span className="block text-xs font-normal text-neutral-600">
                        {horaCurta(turno.hora_inicio)} às {horaCurta(turno.hora_fim)}
                      </span>
                    </th>
                    {dias.map((dia) => {
                      const { ficam, saindo } = pessoasDoQuadro(dia, turno.id);
                      return (
                        <td
                          key={chaveCelula(dia, turno.id)}
                          className="border-b border-neutral-200 p-1 align-top"
                        >
                          <div className="flex min-h-[72px] flex-col gap-1 p-1">
                            {ficam.map(({ f, nova }) => (
                              <span
                                key={f.id}
                                className={`truncate rounded-md px-2 py-1 text-sm ${
                                  nova ? "bg-green-100 font-semibold text-green-900" : "bg-neutral-100"
                                }`}
                              >
                                {nova && "+ "}
                                {primeiroNome(f.nome)}
                              </span>
                            ))}
                            {saindo.map(({ f }) => (
                              <span
                                key={f.id}
                                className="truncate rounded-md bg-red-100 px-2 py-1 text-sm text-red-900 line-through"
                              >
                                {primeiroNome(f.nome)}
                              </span>
                            ))}
                            {ficam.length === 0 && saindo.length === 0 && (
                              <span className="m-auto text-sm text-neutral-400">vazio</span>
                            )}
                            {ficam.length > 0 && (
                              <span className="mt-auto text-xs text-neutral-500">
                                {ficam.length} {ficam.length === 1 ? "pessoa" : "pessoas"}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {erro && (
          <p className="px-4 pb-2 text-sm text-red-700" role="alert">
            Não foi possível salvar. Detalhe: {erro}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 border-t border-neutral-200 p-4">
          <button
            type="button"
            className="botao-secundario"
            onClick={onDescartar}
            disabled={salvando}
          >
            Descartar
          </button>
          <button
            type="button"
            className="botao"
            onClick={onAprovar}
            disabled={salvando || semMudanca}
          >
            {salvando ? "Salvando..." : "Aprovar e salvar"}
          </button>
          {semMudanca && (
            <p className="col-span-2 text-center text-sm text-neutral-600">
              A sugestão é igual ao que já está salvo.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
