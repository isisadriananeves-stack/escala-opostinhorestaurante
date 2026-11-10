// Confere, no servidor, se quem chamou uma rota está conectado e liberado.
// O navegador envia o "crachá" do login no cabeçalho Authorization;
// quem confere o crachá é o próprio Supabase.

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chavePublica } from "@/lib/supabase";

export type ResultadoLogin =
  // db: cliente do banco "em nome" de quem está logado (vale a mesma regra de acesso).
  | { ok: true; db: SupabaseClient }
  | { ok: false; status: 401 | 403 | 500; erro: string };

export async function conferirLogin(request: Request): Promise<ResultadoLogin> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = chavePublica();
  if (!url || !chave) {
    return { ok: false, status: 500, erro: "Banco de dados não configurado." };
  }

  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { ok: false, status: 401, erro: "Entre no sistema para ver as marcações de ponto." };
  }

  const db = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, status: 401, erro: "Sua sessão expirou. Saia e entre de novo." };
  }

  // Mesma lista de e-mails autorizados que protege as tabelas.
  const autorizado = await db.rpc("usuario_autorizado");
  if (!autorizado.error && autorizado.data !== true) {
    return { ok: false, status: 403, erro: "Seu e-mail não tem acesso a este sistema." };
  }
  return { ok: true, db };
}
