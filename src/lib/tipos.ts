// Tipos que espelham as tabelas do Supabase (veja supabase/schema.sql).

export type Funcionario = {
  id: string;
  nome: string;
  funcao: string;
  telefone: string | null;
  cpf: string | null;
  ativo: boolean;
  // "F" = feminino, "M" = masculino, null = não informado (usado na regra dos domingos)
  sexo?: "F" | "M" | null;
};

export type Turno = {
  id: string;
  nome: string;
  hora_inicio: string; // "11:00:00"
  hora_fim: string; // "15:30:00"
  ordem: number;
};

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

// Resposta da rota /api/ponto/marcacoes.
export type RespostaMarcacoes = {
  fonte: "api" | "exemplo";
  marcacoes: MarcacaoPonto[];
  // Motivo de não ter usado a API (quando fonte = "exemplo").
  aviso: string | null;
  // false quando a API falhou e os dados de exemplo não cobrem a data.
  temDados: boolean;
  datasDeExemplo: string[];
};
