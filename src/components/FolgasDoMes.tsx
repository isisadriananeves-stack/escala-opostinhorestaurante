"use client";

// Visão "Mês" da aba Folgas: quantas folgas cada funcionário teve no mês.
// A conta fica em src/lib/folgas-mes.ts.

import { useEffect, useState } from "react";
import type { DiaFechado, Escala, Ferias, FuncionarioEscala } from "@/lib/tipos";
import { diaMes } from "@/lib/datas";
import { feriasPorPessoa } from "@/lib/ferias";
import { buscarEscalasEntre } from "@/lib/escalas";
import { contarFolgasDoMes, limitesDoMes, somarMeses, type LinhaDoMes } from "@/lib/folgas-mes";
import { AvisoErro, mensagemDeErro } from "@/components/AvisoBanco";
import { REGRAS } from "@/config/regras";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function nomeDoMes(anoMes: string): string {
  const [ano, mes] = anoMes.split("-").map(Number);
  return `${MESES[mes - 1]} de ${ano}`;
}

/** "03, 07 e 10" (só o dia). */
function listarDias(datas: string[]): string {
  const nomes = datas.map((d) => d.slice(8, 10));
  if (nomes.length <= 1) return nomes.join("");
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/** Junta dias seguidos em faixas: "16/01 a 31/01, 05/02". */
function faixas(datas: string[]): string {
  const partes: string[] = [];
  let inicio = datas[0];
  for (let i = 1; i <= datas.length; i++) {
    const anterior = datas[i - 1];
    const atual = datas[i];
    const seguido =
      atual && Date.parse(atual) - Date.parse(anterior) === 86_400_000;
    if (seguido) continue;
    partes.push(inicio === anterior ? diaMes(inicio) : `${diaMes(inicio)} a ${diaMes(anterior)}`);
    inicio = atual;
  }
  return partes.join(", ");
}

export function FolgasDoMes({
  hoje,
  funcionarios,
  ferias,
  diasFechados,
}: {
  hoje: string;
  funcionarios: FuncionarioEscala[];
  ferias: Ferias[];
  diasFechados: DiaFechado[];
}) {
  // Primeiro mês com escala; antes dele, a tela abre nele.
  const primeiroMes = REGRAS.inicioDasEscalas.slice(0, 7);
  const mesBase = hoje.slice(0, 7) < primeiroMes ? primeiroMes : hoje.slice(0, 7);
  const [deslocamento, setDeslocamento] = useState(0);
  const anoMes = somarMeses(mesBase, deslocamento);

  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [mesCarregado, setMesCarregado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  useEffect(() => {
    let valido = true;
    const { primeiro, ultimo } = limitesDoMes(anoMes);
    buscarEscalasEntre(primeiro, ultimo)
      .then((lista) => {
        if (!valido) return;
        setEscalas(lista);
        setErro(null);
      })
      .catch((e) => {
        if (valido) setErro(mensagemDeErro(e));
      })
      .finally(() => {
        if (valido) setMesCarregado(anoMes);
      });
    return () => {
      valido = false;
    };
  }, [anoMes]);

  const carregando = mesCarregado !== anoMes;
  const ativos = funcionarios
    .filter((f) => f.ativo)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const conta = contarFolgasDoMes({
    anoMes,
    inicioDasEscalas: REGRAS.inicioDasEscalas,
    funcionarios: ativos,
    escalas,
    fechados: new Set(diasFechados.map((d) => d.data)),
    mapaFerias: feriasPorPessoa(ferias),
  });

  // Média e extremos: só entre quem não teve férias no mês (comparação justa).
  const comparaveis = conta.linhas.filter((l) => l.ferias.length === 0);
  const media =
    comparaveis.length > 0
      ? comparaveis.reduce((soma, l) => soma + l.folgas.length, 0) / comparaveis.length
      : 0;
  const maximo = Math.max(...comparaveis.map((l) => l.folgas.length), 0);
  const minimo = Math.min(...comparaveis.map((l) => l.folgas.length), Infinity);
  const nomes = (lista: LinhaDoMes[]) =>
    lista.map((l) => l.funcionario.nome.split(/\s+/)[0]).join(", ");

  function alternar(id: string) {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-lg capitalize text-neutral-700">{nomeDoMes(anoMes)}</p>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          className="botao-secundario whitespace-nowrap px-1 text-sm! tracking-normal!"
          onClick={() => setDeslocamento((d) => d - 1)}
          disabled={anoMes <= primeiroMes}
          aria-label="Mês anterior"
        >
          ◀ Anterior
        </button>
        <button
          type="button"
          className="botao-secundario whitespace-nowrap px-1 text-sm! tracking-normal!"
          onClick={() => setDeslocamento(0)}
          disabled={deslocamento === 0}
        >
          {hoje.slice(0, 7) < primeiroMes ? "Início" : "Este mês"}
        </button>
        <button
          type="button"
          className="botao-secundario whitespace-nowrap px-1 text-sm! tracking-normal!"
          onClick={() => setDeslocamento((d) => d + 1)}
          aria-label="Próximo mês"
        >
          Próximo ▶
        </button>
      </div>

      {erro && <AvisoErro mensagem={erro} />}

      {carregando ? (
        <p className="text-neutral-600">Carregando o mês...</p>
      ) : (
        <>
          <section className="cartao space-y-1" aria-label="Resumo do mês">
            {conta.inicio !== limitesDoMes(anoMes).primeiro && (
              <p className="text-sm text-neutral-600">
                As escalas começam em {diaMes(conta.inicio)}: a conta vai de{" "}
                {diaMes(conta.inicio)} a {diaMes(conta.fim)}.
              </p>
            )}
            {conta.diasMontados.length === 0 ? (
              <p className="font-semibold text-neutral-700">Nenhum dia com escala montada neste mês.</p>
            ) : (
              <>
                <p className="text-neutral-700">
                  Escala montada em <strong>{conta.diasMontados.length}</strong>{" "}
                  {conta.diasMontados.length === 1 ? "dia" : "dias"}
                  {conta.diasFechados.length > 0 &&
                    ` · fechado: ${conta.diasFechados.map(diaMes).join(", ")}`}
                </p>
                {conta.diasSemEscala.length > 0 && (
                  <p className="text-sm font-semibold text-amber-700">
                    {conta.diasSemEscala.length}{" "}
                    {conta.diasSemEscala.length === 1 ? "dia ainda sem escala" : "dias ainda sem escala"}{" "}
                    ({faixas(conta.diasSemEscala)}): {conta.diasSemEscala.length === 1 ? "fica" : "ficam"}{" "}
                    fora da conta.
                  </p>
                )}
                {comparaveis.length > 0 && (
                  <>
                    <p className="text-neutral-700">
                      Média: <strong>{media.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</strong>{" "}
                      {Math.abs(media - 1) < 0.05 ? "folga" : "folgas"} por pessoa
                    </p>
                    {maximo !== minimo && (
                      <p className="text-sm text-neutral-700">
                        Mais folgas ({maximo}):{" "}
                        {nomes(comparaveis.filter((l) => l.folgas.length === maximo))}
                        <br />
                        Menos folgas ({minimo}):{" "}
                        {nomes(comparaveis.filter((l) => l.folgas.length === minimo))}
                      </p>
                    )}
                  </>
                )}
              </>
            )}
            <p className="text-sm text-neutral-600">
              Folga é dia sem turno (a folga fixa de domingo conta). Dia fechado e férias não contam
              como folga. Toque numa pessoa para ver as datas.
            </p>
          </section>

          {conta.diasMontados.length > 0 && (
            <ul className="space-y-2">
              {conta.linhas.map((l) => {
                const aberto = abertos.has(l.funcionario.id);
                return (
                  <li key={l.funcionario.id} className="cartao p-0!">
                    <button
                      type="button"
                      aria-expanded={aberto}
                      onClick={() => alternar(l.funcionario.id)}
                      className="flex w-full items-start justify-between gap-3 p-4 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block text-lg font-semibold">{l.funcionario.nome}</span>
                        <span className="block text-sm text-neutral-600">
                          {l.funcionario.funcao} · {l.domingos}{" "}
                          {l.domingos === 1 ? "folga" : "folgas"} no domingo · trabalhou{" "}
                          {l.trabalhados} {l.trabalhados === 1 ? "dia" : "dias"}
                          {l.ferias.length > 0 && (
                            <span className="font-semibold text-sky-800">
                              {" "}
                              · férias {l.ferias.length} {l.ferias.length === 1 ? "dia" : "dias"}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="titulo shrink-0 text-xl text-green-800">
                        {l.folgas.length} {l.folgas.length === 1 ? "folga" : "folgas"}
                      </span>
                    </button>
                    {aberto && (
                      <div className="space-y-1 border-t border-[color:var(--cor-borda)] px-4 pb-4 pt-2 text-sm">
                        <p>
                          <strong>Folgas:</strong>{" "}
                          {l.folgas.length > 0 ? listarDias(l.folgas) : "nenhuma"}
                        </p>
                        {l.ferias.length > 0 && (
                          <p className="text-sky-800">
                            <strong>Férias:</strong> {faixas(l.ferias)}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

