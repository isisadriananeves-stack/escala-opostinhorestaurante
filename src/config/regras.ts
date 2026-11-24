// Regras da casa usadas nos alertas da tela "Escala da semana".
// Cada unidade tem as suas (veja o fim do arquivo); hoje as duas são iguais,
// mudando só o início das escalas e as semanas modelo.
//
// Para mudar uma regra, troque os números ou os textos abaixo.
// Dias da semana: 0 = domingo, 1 = segunda ... 6 = sábado.
// Nomes de turno e de função são comparados sem diferenciar maiúsculas
// e acentos ("salao" = "Salão"), mas precisam ser os mesmos usados no
// cadastro de turnos e na tela Equipe.

import { UNIDADE } from "@/config/unidade";

export const TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6];
export const SEGUNDA_A_SEXTA = [1, 2, 3, 4, 5];
export const SABADO_E_DOMINGO = [6, 0];

export type MinimoPorFuncao = {
  funcao: string;
  minimo: number;
  // Observação mostrada junto da regra (ex.: horário de chegada).
  // O sistema ainda não confere horários dentro do turno, só o total.
  observacao?: string;
};

export type RegraDeMinimo = {
  turno: string;
  dias: number[];
  descricao: string;
  funcoes: MinimoPorFuncao[];
};

export type RegrasDaCasa = {
  // Primeiro dia com escala no sistema (um domingo, "AAAA-MM-DD"). As telas não
  // mostram semanas antes dele, e a Conferência não cobra escala antes dele.
  inicioDasEscalas: string;
  // Semanas montadas à mão que servem de modelo para a sugestão com IA:
  // cada pessoa só é sugerida nos turnos em que trabalhou nelas, e a IA tenta
  // repetir os costumes (dias de folga, quem trabalha junto).
  // null = nenhuma ainda (a IA só segue as regras).
  semanasModelo: { inicio: string; fim: string } | null;
  minimos: RegraDeMinimo[];
  // Dias sem nenhum turno na semana (domingo a sábado).
  folgasPorSemana: number;
  // Máximo de dias seguidos de trabalho sem folga (atravessa a virada da semana).
  // Dia com o restaurante fechado interrompe a sequência (a pessoa não trabalhou).
  maxDiasSeguidos: number;
  domingos: {
    // Mulheres: não podem trabalhar dois domingos seguidos.
    mulheresEmDomingosAlternados: boolean;
    // Homens: quantos domingos de folga, no mínimo, em cada mês.
    homensDomingosDeFolgaPorMes: number;
  };
  // Quem trabalha no turno que fecha não pode trabalhar no turno que abre no dia seguinte.
  fecharEAbrir: {
    proibido: boolean;
    turnoQueFecha: string;
    turnoQueAbre: string;
  };
  // Conferência do dia (escala x ponto).
  conferencia: {
    // Entrada até X minutos depois do início do turno ainda conta como "No horário".
    toleranciaAtrasoMinutos: number;
    // Saída mais de X minutos depois do fim do turno conta como "Hora extra".
    horaExtraMinutos: number;
  };
};

const REGRAS_VILA_GALVAO: RegrasDaCasa = {
  inicioDasEscalas: "2026-12-13",
  semanasModelo: { inicio: "2026-12-13", fim: "2027-01-02" },
  minimos: [
    {
      turno: "Jantar",
      dias: TODOS_OS_DIAS,
      descricao: "Jantar, todos os dias",
      funcoes: [
        { funcao: "Cozinha", minimo: 1 },
        { funcao: "Chapa", minimo: 1 },
        { funcao: "Copa", minimo: 1 },
        { funcao: "Salão", minimo: 1 },
        { funcao: "Gerência", minimo: 1 },
      ],
    },
    {
      // Turno próprio do caixa (11:36 às 21:00): só quem é da função Caixa.
      turno: "Caixa",
      dias: TODOS_OS_DIAS,
      descricao: "Caixa, todos os dias",
      funcoes: [{ funcao: "Caixa", minimo: 1 }],
    },
    {
      turno: "Almoço",
      dias: SEGUNDA_A_SEXTA,
      descricao: "Almoço, segunda a sexta",
      funcoes: [
        { funcao: "Cozinha", minimo: 2 },
        { funcao: "Chapa", minimo: 2 },
        { funcao: "Copa", minimo: 1, observacao: "a partir das 11h" },
        { funcao: "Salão", minimo: 2 },
        { funcao: "Gerência", minimo: 1 },
      ],
    },
    {
      turno: "Almoço",
      dias: SABADO_E_DOMINGO,
      descricao: "Almoço, sábado e domingo",
      funcoes: [
        { funcao: "Salão", minimo: 5, observacao: "3 a partir das 11h e 2 a partir das 13h" },
        { funcao: "Cozinha", minimo: 4, observacao: "3 desde as 9h e 1 a partir das 12h" },
        { funcao: "Copa", minimo: 2, observacao: "a partir das 11h" },
        { funcao: "Chapa", minimo: 2, observacao: "desde as 9h" },
        { funcao: "Gerência", minimo: 1 },
      ],
    },
  ],
  folgasPorSemana: 2,
  maxDiasSeguidos: 5,
  domingos: {
    mulheresEmDomingosAlternados: true,
    homensDomingosDeFolgaPorMes: 1,
  },
  fecharEAbrir: {
    proibido: true,
    turnoQueFecha: "Jantar",
    turnoQueAbre: "Almoço",
  },
  conferencia: {
    toleranciaAtrasoMinutos: 10,
    horaExtraMinutos: 30,
  },
};

// Unidade Centro: mesmas regras, escalas a partir de 29/11/2026, ainda sem semanas modelo.
const REGRAS_CENTRO: RegrasDaCasa = {
  ...REGRAS_VILA_GALVAO,
  inicioDasEscalas: "2026-11-29",
  semanasModelo: null,
};

export const REGRAS: RegrasDaCasa = UNIDADE === "centro" ? REGRAS_CENTRO : REGRAS_VILA_GALVAO;
