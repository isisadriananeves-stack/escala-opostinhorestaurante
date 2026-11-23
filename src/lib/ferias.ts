// Férias (tabela ferias). O banco faz a mesma conta na função de_ferias() e recusa
// escalar a pessoa nesses dias. As folgas fixas de domingo seguem iguais.

import type { Ferias } from "@/lib/tipos";
import { diaMes } from "@/lib/datas";

/** Pessoa -> lista de férias. */
export function feriasPorPessoa(ferias: Ferias[]): Map<string, Ferias[]> {
  const mapa = new Map<string, Ferias[]>();
  for (const f of ferias) mapa.set(f.funcionario_id, [...(mapa.get(f.funcionario_id) ?? []), f]);
  return mapa;
}

/** Férias da pessoa que incluem o dia (ou null). */
export function feriasNoDia(
  mapa: Map<string, Ferias[]>,
  funcionarioId: string,
  dia: string,
): Ferias | null {
  return (mapa.get(funcionarioId) ?? []).find((f) => f.inicio <= dia && dia <= f.fim) ?? null;
}

/** A pessoa está de férias nesse dia? */
export function deFerias(mapa: Map<string, Ferias[]>, funcionarioId: string, dia: string): boolean {
  return feriasNoDia(mapa, funcionarioId, dia) !== null;
}

/** "de 04/01 a 02/02" */
export function descreverFerias(f: Ferias): string {
  return `de ${diaMes(f.inicio)} a ${diaMes(f.fim)}`;
}

/** Férias em andamento ou a próxima, a partir de hoje (ou null). */
export function feriasAtuaisOuProximas(lista: Ferias[], hoje: string): Ferias | null {
  return [...lista].filter((f) => f.fim >= hoje).sort((a, b) => a.inicio.localeCompare(b.inicio))[0] ?? null;
}
