// Tipos que espelham as tabelas do Supabase (veja supabase/schema.sql).

export type Funcionario = {
  id: string;
  nome: string;
  funcao: string;
  telefone: string | null;
  cpf: string | null;
  // Só os 4 últimos números do CPF (o banco preenche sozinho a partir do CPF).
  cpf_final: string | null;
  ativo: boolean;
  // "F" = feminino, "M" = masculino, null = não informado (usado na regra dos domingos)
  sexo?: "F" | "M" | null;
  // Data do cadastro no sistema (o banco preenche sozinho).
  criado_em?: string;
  // Data em que a pessoa entrou no restaurante, "AAAA-MM-DD" (Pontomais ou tela Equipe).
  data_admissao?: string | null;
};

// O que cada tela busca de um funcionário: só o que ela mostra ou usa.
// O CPF completo nunca vai para o navegador; quem precisa dele é o servidor
// (rota da conferência de ponto).
export const CAMPOS_FUNCIONARIO_INICIO = "id, nome, funcao, data_admissao";
export type FuncionarioInicio = Pick<Funcionario, "id" | "nome" | "funcao" | "data_admissao">;

export const CAMPOS_FUNCIONARIO_EQUIPE =
  "id, nome, funcao, telefone, ativo, sexo, cpf_final, data_admissao";
export type FuncionarioEquipe = Pick<
  Funcionario,
  "id" | "nome" | "funcao" | "telefone" | "ativo" | "sexo" | "cpf_final" | "data_admissao"
>;

export const CAMPOS_FUNCIONARIO_ESCALA = "id, nome, funcao, ativo, sexo";
export type FuncionarioEscala = Pick<Funcionario, "id" | "nome" | "funcao" | "ativo" | "sexo">;

export const CAMPOS_FUNCIONARIO_CONFERENCIA = "id, nome, funcao, cpf_final";
export type FuncionarioConferencia = Pick<Funcionario, "id" | "nome" | "funcao" | "cpf_final">;

export type Turno = {
  id: string;
  nome: string;
  hora_inicio: string; // "11:00:00"
  hora_fim: string; // "15:30:00"
  ordem: number;
  // Função que pode trabalhar neste turno (ex.: "Caixa"); null = qualquer função.
  // Quem é de uma função com turno próprio só trabalha nesse turno.
  funcao?: string | null;
};
export const CAMPOS_TURNO = "id, nome, hora_inicio, hora_fim, ordem, funcao";

// Dia em que o restaurante não abre (tabela dias_fechados), ex.: 25/12 "Natal".
// Ninguém é escalado, e o dia NÃO conta como folga na regra de folgas por semana.
export type DiaFechado = { data: string; motivo: string };
export const CAMPOS_DIA_FECHADO = "data, motivo";

export type Escala = {
  id: string;
  data: string; // "2026-11-20"
  turno_id: string;
  funcionario_id: string;
};

export type Regra = {
  id: string;
  dia_semana: number | null; // 0 = domingo ... 6 = sábado; null = todos os dias
  turno_id: string;
  funcao: string;
  minimo: number;
};

export type Configuracao = {
  chave: string;
  valor: string;
};

export const FUNCOES_PADRAO = [
  "Salão",
  "Cozinha",
  "Chapa",
  "Copa",
  "Caixa",
  "Bar",
  "Entregador",
  "Gerência",
];

// Marcação de ponto de um dia, já no formato interno do sistema
// (o adaptador em src/lib/integracoes/ponto.ts converte o formato do fornecedor).
export type MarcacaoPonto = {
  cpf: string; // só dígitos
  data: string; // "2026-11-04"
  entrada: string | null; // "10:55"
  saidaIntervalo: string | null;
  voltaIntervalo: string | null;
  saida: string | null;
};

// Marcação já ligada ao funcionário pelo servidor (sem o CPF completo).
export type MarcacaoConferida = Omit<MarcacaoPonto, "cpf"> & {
  funcionarioId: string | null; // null = CPF não cadastrado no sistema
  cpfFinal: string; // 4 últimos números, para identificar quem não tem cadastro
};

// Resposta da rota /api/ponto/marcacoes.
export type RespostaMarcacoes = {
  fonte: "api" | "exemplo";
  marcacoes: MarcacaoConferida[];
  // Motivo de não ter usado a API (quando fonte = "exemplo").
  aviso: string | null;
  // false quando a API falhou e os dados de exemplo não cobrem a data.
  temDados: boolean;
  datasDeExemplo: string[];
};

// Um lugar na escala proposto pela IA (ainda não salvo no banco).
export type EscalaSugerida = Pick<Escala, "data" | "turno_id" | "funcionario_id">;

// Resposta da rota /api/escala/sugerir.
export type RespostaSugestao = {
  // A semana inteira proposta (domingo a sábado), já conferida pelo servidor.
  escalas: EscalaSugerida[];
  // Recados da IA: o que não deu para cumprir e por quê.
  observacoes: string[];
};

// Data de admissão vinda do sistema de ponto (formato interno, devolvido por
// src/lib/integracoes/ponto.ts). O CPF só circula no servidor.
export type AdmissaoPonto = {
  cpf: string; // só os 11 números
  dataAdmissao: string; // "AAAA-MM-DD"
};

// Resumo que a rota /api/ponto/admissoes devolve para a tela Equipe.
export type ResumoAdmissoes = {
  preenchidas: number; // datas gravadas agora
  jaTinham: number; // já tinham data (não mexemos)
  semCpf: number; // ativos sem CPF cadastrado aqui
  naoEncontrados: number; // com CPF, mas sem cadastro ativo no Pontomais
};

// Folga fixa de domingo de uma pessoa (tabela folgas_domingo).
//   "domingos_do_mes": folga nos domingos do mês indicados (1 a 5; -1 = último), todo mês.
//   "quinzenal": domingo sim, domingo não, a partir do domingo "inicio" (AAAA-MM-DD).
export type FolgaDomingo = {
  id: string;
  funcionario_id: string;
  tipo: "domingos_do_mes" | "quinzenal";
  domingos_do_mes: number[] | null;
  inicio: string | null;
};
export const CAMPOS_FOLGA_DOMINGO = "id, funcionario_id, tipo, domingos_do_mes, inicio";
