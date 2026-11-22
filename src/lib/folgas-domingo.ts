// Folgas fixas de domingo (tabela folgas_domingo, veja supabase/schema.sql).
// O banco faz a mesma conta na função tem_folga_fixa() e recusa escalar a pessoa
// no domingo de folga; aqui a conta serve para mostrar na tela e travar a escolha.

import type { FolgaDomingo } from "@/lib/tipos";
import { diaMes, paraData } from "@/lib/datas";

/** Quantos dias entre duas datas "AAAA-MM-DD" (b - a). */
function diasEntre(a: string, b: string): number {
  const [a1, a2, a3] = a.split("-").map(Number);
  const [b1, b2, b3] = b.split("-").map(Number);
  return Math.round((Date.UTC(b1, b2 - 1, b3) - Date.UTC(a1, a2 - 1, a3)) / 86_400_000);
}

/** 1º, 2º... domingo do mês ("2026-11-15" -> 3). */
export function ordemDoDomingo(dia: string): number {
  return Math.floor((paraData(dia).getDate() - 1) / 7) + 1;
}

/** Código de "último domingo do mês" em domingos_do_mes (o 4º ou o 5º, conforme o mês). */
export const ULTIMO_DOMINGO = -1;

/** É o último domingo do mês? (uma semana depois já é outro mês) */
export function ehUltimoDomingo(dia: string): boolean {
  const d = paraData(dia);
  const semanaQueVem = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
  return semanaQueVem.getMonth() !== d.getMonth();
}

/** A regra dá folga nesse dia? (só domingos contam) */
export function regraDaFolga(regra: FolgaDomingo, dia: string): boolean {
  if (paraData(dia).getDay() !== 0) return false;
  if (regra.tipo === "domingos_do_mes") {
    const lista = regra.domingos_do_mes ?? [];
    return (
      lista.includes(ordemDoDomingo(dia)) || (lista.includes(ULTIMO_DOMINGO) && ehUltimoDomingo(dia))
    );
  }
  if (!regra.inicio || dia < regra.inicio) return false;
  return diasEntre(regra.inicio, dia) % 14 === 0;
}

/** Mapa pessoa -> regra, para consultar rápido. */
export function folgasPorPessoa(folgas: FolgaDomingo[]): Map<string, FolgaDomingo> {
  return new Map(folgas.map((f) => [f.funcionario_id, f]));
}

/** A pessoa tem folga fixa nesse dia? */
export function temFolgaFixa(
  mapa: Map<string, FolgaDomingo>,
  funcionarioId: string,
  dia: string,
): boolean {
  const regra = mapa.get(funcionarioId);
  return regra ? regraDaFolga(regra, dia) : false;
}

/** "1º e 3º domingo do mês", "último domingo do mês" ou "domingo sim, domingo não (desde 22/11/2026)". */
export function descreverFolgaFixa(regra: FolgaDomingo): string {
  if (regra.tipo === "domingos_do_mes") {
    const lista = regra.domingos_do_mes ?? [];
    const ordens = lista
      .filter((n) => n !== ULTIMO_DOMINGO)
      .sort((a, b) => a - b)
      .map((n) => `${n}º`);
    if (lista.includes(ULTIMO_DOMINGO)) ordens.push("último");
    const texto =
      ordens.length <= 1 ? ordens.join("") : `${ordens.slice(0, -1).join(", ")} e ${ordens.at(-1)}`;
    return `${texto} domingo do mês`;
  }
  const inicio = regra.inicio ?? "";
  return `domingo sim, domingo não (desde ${diaMes(inicio)}/${inicio.slice(0, 4)})`;
}
