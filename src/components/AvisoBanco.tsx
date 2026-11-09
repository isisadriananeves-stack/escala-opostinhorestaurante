// Mensagens padrão quando o banco não está configurado ou dá erro.

export function AvisoSemVariaveis() {
  return (
    <div className="cartao text-red-700">
      As variáveis do Supabase não foram configuradas. Na Vercel, em Settings &gt;
      Environment Variables, adicione NEXT_PUBLIC_SUPABASE_URL e
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ou ANON_KEY) e faça Redeploy.
    </div>
  );
}

export function AvisoErro({ mensagem }: { mensagem: string }) {
  return (
    <div className="cartao border-red-300 bg-red-50! shadow-none! text-red-800" role="alert">
      Não foi possível falar com o banco de dados. Tente de novo em instantes.
      <span className="mt-1 block text-sm text-red-700">Detalhe: {mensagem}</span>
    </div>
  );
}

export function mensagemDeErro(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String(e.message);
  return String(e);
}
