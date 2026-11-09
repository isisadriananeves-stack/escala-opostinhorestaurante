// Compara a escala planejada de um dia com as marcações de ponto.
// Não acessa banco nem API: recebe os dados prontos.

import type { Escala, Funcionario, MarcacaoPonto, Turno } from "@/lib/tipos";
import { horaCurta, horaParaMinutos } from "@/lib/datas";

export type Situacao =
  | "no-horario"
  | "atrasado"
  | "faltou"
  | "sem-entrada" // tem marcação no dia, mas sem a batida de entrada
  | "aguardando" // hoje, o turno ainda não começou (ou está na tolerância)
  | "futuro" // dia que ainda não aconteceu
  | "sem-dados" // a API falhou e não há dados de exemplo para o dia
  | "sem-cpf"; // funcionário sem CPF: não dá para achar a marcação dele

export type LinhaEscalado = {
  funcionario: Funcionario;
  turnos: Turno[];
  planejadoInicio: string; // "08:30"
  planejadoFim: string; // "23:30"
  marcacao: MarcacaoPonto | null;
  situacao: Situacao;
  minutosAtraso: number; // > 0 só quando atrasado
  minutosHoraExtra: number; // > 0 só quando fez hora extra
};

export type LinhaNaoEscalado = {
  funcionario: Funcionario | null; // null = CPF não cadastrado no sistema
  marcacao: MarcacaoPonto;
};

export type ResultadoConferencia = {
  escalados: LinhaEscalado[];
  naoEscalados: LinhaNaoEscalado[];
  resumo: {
    atrasos: number;
    minutosAtraso: number;
    faltas: number;
    horasExtras: number;
    minutosHoraExtra: number;
  };
};

export function soDigitos(cpf: string | null | undefined): string {
  return (cpf ?? "").replace(/\D/g, "");
}

export function conferirDia(params: {
  data: string;
  hoje: string;
  agoraMinutos: number; // minutos desde a meia-noite (usado só quando data = hoje)
  turnos: Turno[];
  funcionarios: Funcionario[];
  escalasDoDia: Escala[];
  marcacoes: MarcacaoPonto[];
  temDados: boolean;
  toleranciaAtrasoMinutos: number;
  horaExtraMinutos: number;
}): ResultadoConferencia {
  const {
    data,
    hoje,
    agoraMinutos,
    turnos,
    funcionarios,
    escalasDoDia,
    marcacoes,
    temDados,
    toleranciaAtrasoMinutos,
    horaExtraMinutos,
  } = params;

  const turnoPorId = new Map(turnos.map((t) => [t.id, t]));
  const funcionarioPorId = new Map(funcionarios.map((f) => [f.id, f]));
  const funcionarioPorCpf = new Map(
    funcionarios.filter((f) => soDigitos(f.cpf).length === 11).map((f) => [soDigitos(f.cpf), f]),
  );
  const marcacaoPorCpf = new Map<string, MarcacaoPonto>();
  for (const m of marcacoes) {
    if (m.data === data && !marcacaoPorCpf.has(m.cpf)) marcacaoPorCpf.set(m.cpf, m);
  }

  // Turnos de cada funcionário escalado no dia.
  const turnosDaPessoa = new Map<string, Turno[]>();
  for (const e of escalasDoDia) {
    if (e.data !== data) continue;
    const turno = turnoPorId.get(e.turno_id);
    if (!turno || !funcionarioPorId.has(e.funcionario_id)) continue;
    const lista = turnosDaPessoa.get(e.funcionario_id) ?? [];
    lista.push(turno);
    turnosDaPessoa.set(e.funcionario_id, lista);
  }

  const futuro = data > hoje;
  const ehHoje = data === hoje;
  const escalados: LinhaEscalado[] = [];
  const cpfsEscalados = new Set<string>();

  for (const [id, lista] of turnosDaPessoa) {
    const funcionario = funcionarioPorId.get(id)!;
    const turnosOrdenados = [...lista].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
    const inicio = horaCurta(turnosOrdenados[0].hora_inicio);
    const fim = horaCurta(
      turnosOrdenados.map((t) => t.hora_fim).sort((a, b) => b.localeCompare(a))[0],
    );
    const cpf = soDigitos(funcionario.cpf);
    if (cpf.length === 11) cpfsEscalados.add(cpf);
    const marcacao = cpf.length === 11 ? (marcacaoPorCpf.get(cpf) ?? null) : null;

    let situacao: Situacao;
    let minutosAtraso = 0;
    let minutosHoraExtra = 0;

    if (futuro) situacao = "futuro";
    else if (!temDados) situacao = "sem-dados";
    else if (cpf.length !== 11) situacao = "sem-cpf";
    else if (!marcacao) {
      const aindaPodeChegar =
        ehHoje && agoraMinutos <= horaParaMinutos(inicio) + toleranciaAtrasoMinutos;
      situacao = aindaPodeChegar ? "aguardando" : "faltou";
    } else if (!marcacao.entrada) {
      situacao = "sem-entrada";
    } else {
      const atraso = horaParaMinutos(marcacao.entrada) - horaParaMinutos(inicio);
      if (atraso > toleranciaAtrasoMinutos) {
        situacao = "atrasado";
        minutosAtraso = atraso;
      } else {
        situacao = "no-horario";
      }
    }

    if (marcacao?.saida && !futuro && temDados) {
      const extra = horaParaMinutos(marcacao.saida) - horaParaMinutos(fim);
      if (extra > horaExtraMinutos) minutosHoraExtra = extra;
    }

    escalados.push({
      funcionario,
      turnos: turnosOrdenados,
      planejadoInicio: inicio,
      planejadoFim: fim,
      marcacao,
      situacao,
      minutosAtraso,
      minutosHoraExtra,
    });
  }

  escalados.sort(
    (a, b) =>
      a.planejadoInicio.localeCompare(b.planejadoInicio) ||
      a.funcionario.nome.localeCompare(b.funcionario.nome, "pt-BR"),
  );

  // Quem bateu ponto mas não estava na escala do dia.
  const naoEscalados: LinhaNaoEscalado[] =
    futuro || !temDados
      ? []
      : Array.from(marcacaoPorCpf.values())
          .filter((m) => !cpfsEscalados.has(m.cpf))
          .map((m) => ({ funcionario: funcionarioPorCpf.get(m.cpf) ?? null, marcacao: m }))
          .sort((a, b) => (a.marcacao.entrada ?? "99").localeCompare(b.marcacao.entrada ?? "99"));

  const atrasados = escalados.filter((l) => l.situacao === "atrasado");
  const extras = escalados.filter((l) => l.minutosHoraExtra > 0);
  return {
    escalados,
    naoEscalados,
    resumo: {
      atrasos: atrasados.length,
      minutosAtraso: atrasados.reduce((s, l) => s + l.minutosAtraso, 0),
      faltas: escalados.filter((l) => l.situacao === "faltou").length,
      horasExtras: extras.length,
      minutosHoraExtra: extras.reduce((s, l) => s + l.minutosHoraExtra, 0),
    },
  };
}

/** 135 -> "2h15", 45 -> "45 min" */
export function formatarMinutos(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}
