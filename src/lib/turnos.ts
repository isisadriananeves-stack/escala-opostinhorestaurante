// Turnos com função própria (coluna turnos.funcao, ex.: o turno "Caixa").
// O banco confere a mesma regra no gatilho confere_funcao_do_turno (supabase/schema.sql).

import type { Turno } from "@/lib/tipos";

function igual(a: string, b: string): boolean {
  const limpar = (t: string) =>
    t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return limpar(a) === limpar(b);
}

/**
 * A pessoa (pela função) pode trabalhar neste turno?
 * - turno com função: só quem é dessa função;
 * - quem é de uma função que tem turno próprio: só nesse turno.
 */
export function podeTrabalharNoTurno(funcaoDaPessoa: string, turno: Turno, turnos: Turno[]): boolean {
  if (turno.funcao) return igual(turno.funcao, funcaoDaPessoa);
  return !turnos.some((t) => t.funcao && igual(t.funcao, funcaoDaPessoa));
}

/** Frase curta de por que a pessoa não pode ficar no turno. */
export function motivoDoTurno(funcaoDaPessoa: string, turno: Turno): string {
  return turno.funcao
    ? `o ${turno.nome} é só para a função ${turno.funcao}`
    : `quem é da função ${funcaoDaPessoa} só trabalha no turno ${funcaoDaPessoa}`;
}
