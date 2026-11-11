// POST /api/escala/sugerir   corpo: { "segunda": "AAAA-MM-DD" }
// Pede à IA (no servidor, com a ANTHROPIC_API_KEY) uma proposta de escala para a
// semana que começa nessa segunda, seguindo as regras de src/config/regras.ts.
// Não salva nada: devolve a proposta para o dono aprovar na tela.
// Só responde para quem está conectado e liberado (veja src/lib/login-servidor.ts).

import { REGRAS } from "@/config/regras";
import { periodoParaConferir } from "@/lib/alertas";
import { paraData } from "@/lib/datas";
import { ErroIA, sugerirEscala } from "@/lib/integracoes/anthropic";
import { conferirLogin } from "@/lib/login-servidor";
import {
  CAMPOS_FUNCIONARIO_ESCALA,
  type Escala,
  type FuncionarioEscala,
  type RespostaSugestao,
  type Turno,
} from "@/lib/tipos";

export const dynamic = "force-dynamic";
// A IA pode levar alguns minutos para pensar na semana inteira.
export const maxDuration = 300;

export async function POST(request: Request) {
  const login = await conferirLogin(request);
  if (!login.ok) {
    return Response.json({ erro: login.erro }, { status: login.status });
  }

  let segunda = "";
  try {
    const corpo = (await request.json()) as { segunda?: unknown };
    if (typeof corpo.segunda === "string") segunda = corpo.segunda;
  } catch {
    // corpo inválido: cai na validação abaixo
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(segunda) || paraData(segunda).getDay() !== 1) {
    return Response.json(
      { erro: "Semana inválida. Envie a segunda-feira no formato AAAA-MM-DD." },
      { status: 400 },
    );
  }

  let turnos: Turno[];
  let funcionarios: FuncionarioEscala[];
  let escalas: Escala[];
  try {
    const { inicio, fim } = periodoParaConferir(segunda);
    const [t, f, e] = await Promise.all([
      login.db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem"),
      login.db.from("funcionarios").select(CAMPOS_FUNCIONARIO_ESCALA).eq("ativo", true).order("funcao").order("nome"),
      login.db
        .from("escalas")
        .select("id, data, turno_id, funcionario_id")
        .gte("data", inicio)
        .lte("data", fim),
    ]);
    if (t.error) throw t.error;
    if (f.error) throw f.error;
    if (e.error) throw e.error;
    turnos = t.data ?? [];
    funcionarios = f.data ?? [];
    escalas = e.data ?? [];
  } catch {
    return Response.json(
      { erro: "Não foi possível ler turnos, equipe e escala no banco." },
      { status: 500 },
    );
  }

  if (turnos.length === 0 || funcionarios.length === 0) {
    return Response.json(
      { erro: "Cadastre turnos e funcionários ativos antes de pedir uma sugestão." },
      { status: 400 },
    );
  }

  try {
    const sugestao = await sugerirEscala({ regras: REGRAS, segunda, turnos, funcionarios, escalas });
    return Response.json(sugestao satisfies RespostaSugestao);
  } catch (e) {
    const erro = e instanceof ErroIA ? e.message : "A sugestão da IA falhou. Tente de novo.";
    console.error("[ia] sugestão falhou:", erro);
    return Response.json({ erro }, { status: 502 });
  }
}
