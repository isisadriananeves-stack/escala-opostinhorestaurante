// Semanas modelo (REGRAS.semanasModelo): o que a sugestão com IA aprende com as
// escalas montadas à mão. Funções puras (sem banco), para poder testar.
//
// - Turno de cada pessoa (OBRIGATÓRIO na sugestão): os turnos em que ela trabalhou.
// - Costumes (quando der): dias da semana em que costuma folgar e com quem costuma
//   trabalhar no mesmo turno.

import type { Escala, EscalaSugerida } from "@/lib/tipos";
import { DIAS_SEMANA_CURTO, paraData, somarDias } from "@/lib/datas";

/** Pessoa -> turnos (ids) em que trabalhou nas semanas modelo. */
export function turnosDoModelo(escalasModelo: Escala[]): Map<string, Set<string>> {
  const mapa = new Map<string, Set<string>>();
  for (const e of escalasModelo) {
    if (!mapa.has(e.funcionario_id)) mapa.set(e.funcionario_id, new Set());
    mapa.get(e.funcionario_id)!.add(e.turno_id);
  }
  return mapa;
}

export type Costume = {
  // Dias da semana (0 = domingo) em que folgou na maioria das semanas modelo.
  diasDeFolga: number[];
  // Colegas com quem dividiu o mesmo turno em pelo menos metade dos seus turnos.
  junto: string[];
};

/**
 * Costumes de cada pessoa nas semanas modelo.
 * diasFechados: datas em que o restaurante não abriu (não contam como folga).
 */
export function costumesDoModelo(
  escalasModelo: Escala[],
  inicio: string,
  fim: string,
  diasFechados: Set<string> = new Set(),
): Map<string, Costume> {
  // Dias do período, por dia da semana (sem os dias fechados).
  const diasPorSemana = new Map<number, string[]>();
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
    if (diasFechados.has(d)) continue;
    const ds = paraData(d).getDay();
    diasPorSemana.set(ds, [...(diasPorSemana.get(ds) ?? []), d]);
  }
  const diasDaPessoa = new Map<string, Set<string>>();
  const porQuadro = new Map<string, string[]>();
  for (const e of escalasModelo) {
    if (!diasDaPessoa.has(e.funcionario_id)) diasDaPessoa.set(e.funcionario_id, new Set());
    diasDaPessoa.get(e.funcionario_id)!.add(e.data);
    const chave = `${e.data}|${e.turno_id}`;
    porQuadro.set(chave, [...(porQuadro.get(chave) ?? []), e.funcionario_id]);
  }

  const costumes = new Map<string, Costume>();
  for (const [pessoa, trabalhados] of diasDaPessoa) {
    // Folga "de costume": dia da semana em que folgou em mais da metade das vezes.
    const diasDeFolga: number[] = [];
    for (const [ds, datas] of diasPorSemana) {
      const folgou = datas.filter((d) => !trabalhados.has(d)).length;
      if (datas.length > 0 && folgou * 2 > datas.length) diasDeFolga.push(ds);
    }
    // Colegas de turno frequentes.
    const vezesJunto = new Map<string, number>();
    let turnosDaPessoa = 0;
    for (const pessoas of porQuadro.values()) {
      if (!pessoas.includes(pessoa)) continue;
      turnosDaPessoa++;
      for (const outra of pessoas) {
        if (outra !== pessoa) vezesJunto.set(outra, (vezesJunto.get(outra) ?? 0) + 1);
      }
    }
    const junto = [...vezesJunto.entries()]
      .filter(([, vezes]) => turnosDaPessoa > 0 && vezes * 2 >= turnosDaPessoa)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([outra]) => outra);
    costumes.set(pessoa, { diasDeFolga: diasDeFolga.sort(), junto });
  }
  return costumes;
}

/** "Seg e Qua" */
export function nomesDosDias(dias: number[]): string {
  const nomes = dias.map((d) => DIAS_SEMANA_CURTO[d]);
  if (nomes.length <= 1) return nomes.join("");
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/**
 * Tira da sugestão quem foi posto fora dos seus turnos do modelo.
 * - Quem não aparece no modelo pode ficar em qualquer turno (a função já é conferida antes).
 * - O que já estava salvo na semana fica (foi decisão de quem montou à mão).
 */
export function respeitarTurnosDoModelo(
  sugeridas: EscalaSugerida[],
  turnosPorPessoa: Map<string, Set<string>>,
  jaSalvas: { data: string; turno_id: string; funcionario_id: string }[],
): { mantidas: EscalaSugerida[]; tiradas: EscalaSugerida[] } {
  const salvas = new Set(jaSalvas.map((e) => `${e.data}|${e.turno_id}|${e.funcionario_id}`));
  const mantidas: EscalaSugerida[] = [];
  const tiradas: EscalaSugerida[] = [];
  for (const e of sugeridas) {
    const permitidos = turnosPorPessoa.get(e.funcionario_id);
    const ok =
      !permitidos ||
      permitidos.has(e.turno_id) ||
      salvas.has(`${e.data}|${e.turno_id}|${e.funcionario_id}`);
    (ok ? mantidas : tiradas).push(e);
  }
  return { mantidas, tiradas };
}
