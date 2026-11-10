// Conferências do cadastro de funcionário.
// O banco confere as mesmas regras (veja supabase/schema.sql); aqui elas
// rodam antes de salvar, para mostrar o aviso na hora, embaixo do campo.

export const NOME_MINIMO = 2;
export const NOME_MAXIMO = 60;

/** Tira espaços do começo, do fim e repetidos no meio. */
export function limparNome(nome: string): string {
  return nome.replace(/\s+/g, " ").trim();
}

/** Mensagem de erro do nome, ou null se estiver certo. */
export function erroNome(nome: string): string | null {
  const limpo = limparNome(nome);
  if (limpo.length < NOME_MINIMO) return "Preencha o nome (pelo menos 2 letras).";
  if (limpo.length > NOME_MAXIMO) return `O nome pode ter no máximo ${NOME_MAXIMO} letras.`;
  return null;
}

function digitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

/**
 * Formata o telefone enquanto a pessoa digita:
 * "11987654321" -> "(11) 98765-4321"; "1134567890" -> "(11) 3456-7890".
 */
export function formatarTelefone(texto: string): string {
  const d = digitos(texto).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  // Celular: 9 + 8 números (formato 9XXXX-XXXX). Fixo: 8 números (XXXX-XXXX).
  const corte = resto.length > 8 || resto.startsWith("9") ? 5 : 4;
  if (resto.length <= corte) return `(${ddd}) ${resto}`;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** Mensagem de erro do telefone (vazio é permitido), ou null se estiver certo. */
export function erroTelefone(telefone: string): string | null {
  const d = digitos(telefone);
  if (d.length === 0) return null;
  const exemplo = "Use DDD + número, ex.: (11) 91234-5678.";
  if (d.length !== 10 && d.length !== 11) return `Telefone incompleto. ${exemplo}`;
  if (d[0] === "0" || d[1] === "0") return `DDD inválido. ${exemplo}`;
  if (d.length === 11 && d[2] !== "9") return `Celular deve começar com 9 depois do DDD. ${exemplo}`;
  if (d.length === 10 && !"2345".includes(d[2])) {
    return `Telefone fixo deve começar com 2, 3, 4 ou 5 depois do DDD. ${exemplo}`;
  }
  return null;
}

/** Confere os dois dígitos verificadores do CPF (só números). */
export function cpfValido(cpf: string): boolean {
  const d = digitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const numeros = d.split("").map(Number);
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += numeros[i] * (tamanho + 1 - i);
    const resto = ((soma * 10) % 11) % 10;
    if (resto !== numeros[tamanho]) return false;
  }
  return true;
}

/** Mensagem de erro do CPF (vazio é permitido), ou null se estiver certo. */
export function erroCpf(cpf: string): string | null {
  const d = digitos(cpf);
  if (d.length === 0) return null;
  if (d.length !== 11) return "O CPF precisa ter 11 números.";
  if (!cpfValido(d)) return "CPF inválido: confira os números.";
  return null;
}

/** Traduz a recusa do banco para uma frase simples. */
export function mensagemDoBanco(erro: unknown): string | null {
  const texto =
    erro && typeof erro === "object"
      ? `${"code" in erro ? String(erro.code) : ""} ${"message" in erro ? String(erro.message) : ""}`
      : String(erro);
  if (texto.includes("23505")) return "Este CPF já está cadastrado para outro funcionário.";
  if (texto.includes("funcionarios_nome_tamanho")) return `O nome precisa ter de ${NOME_MINIMO} a ${NOME_MAXIMO} letras.`;
  if (texto.includes("funcionarios_telefone_formato")) return "Telefone em formato inválido. Ex.: (11) 91234-5678.";
  if (texto.includes("CPF inválido") || texto.includes("funcionarios_cpf_formato")) {
    return "CPF inválido: confira os números.";
  }
  return null;
}
