// Ler e gravar a escala no banco (tabela escalas).
// Usado pela Escala da semana (por turno) e pela tela Folgas (por pessoa),
// para as duas telas gravarem do mesmo jeito.

import { supabase } from "@/lib/supabase";
import { periodoParaConferir } from "@/lib/alertas";
import type { Escala } from "@/lib/tipos";

export const CAMPOS_ESCALA = "id, data, turno_id, funcionario_id";

/**
 * Carrega a semana e os dias ao redor que as regras precisam
 * (sábado anterior, domingo seguinte e os domingos do mês).
 */
export async function buscarEscalas(inicioSemana: string): Promise<Escala[]> {
  const { inicio, fim } = periodoParaConferir(inicioSemana);
  const { data, error } = await supabase()
    .from("escalas")
    .select(CAMPOS_ESCALA)
    .gte("data", inicio)
    .lte("data", fim);
  if (error) throw error;
  return data ?? [];
}

/** Põe a pessoa no turno do dia. Devolve a escala criada. */
export async function escalar(
  funcionarioId: string,
  data: string,
  turnoId: string,
): Promise<Escala> {
  const { data: nova, error } = await supabase()
    .from("escalas")
    .insert({ data, turno_id: turnoId, funcionario_id: funcionarioId })
    .select(CAMPOS_ESCALA)
    .single();
  if (error) throw error;
  return nova;
}

/** Tira da escala (uma ou mais linhas, pelo id). */
export async function tirarDaEscala(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase().from("escalas").delete().in("id", ids);
  if (error) throw error;
}
