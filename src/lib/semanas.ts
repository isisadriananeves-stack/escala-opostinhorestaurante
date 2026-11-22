// Qual semana as telas Escala e Folgas mostram, respeitando o início das escalas
// (REGRAS.inicioDasEscalas): antes dele, as telas abrem direto na primeira semana
// com escala e não deixam voltar para semanas anteriores.

import { REGRAS } from "@/config/regras";
import { inicioDaSemana, somarDias } from "@/lib/datas";

/** Domingo da primeira semana com escala. */
export const PRIMEIRA_SEMANA = inicioDaSemana(REGRAS.inicioDasEscalas);

/** Semana em que as telas abrem: a atual ou, se ainda não chegou, a primeira semana com escala. */
export function semanaBase(hoje: string): string {
  const atual = inicioDaSemana(hoje);
  return atual < PRIMEIRA_SEMANA ? PRIMEIRA_SEMANA : atual;
}

/** Domingo da semana mostrada, "deslocamento" semanas depois (ou antes) da semana base. */
export function semanaMostrada(hoje: string, deslocamento: number): string {
  return somarDias(semanaBase(hoje), 7 * deslocamento);
}

/** Pode voltar uma semana? (não antes da primeira semana com escala) */
export function podeVoltar(semana: string): boolean {
  return semana > PRIMEIRA_SEMANA;
}

/** A semana atual ainda é antes do início das escalas? (o botão "Hoje" vira "Início") */
export function antesDoInicio(hoje: string): boolean {
  return inicioDaSemana(hoje) < PRIMEIRA_SEMANA;
}
