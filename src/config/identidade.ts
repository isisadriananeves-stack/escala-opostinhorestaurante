// Identidade visual do restaurante (estilo vintage e limpo).
// Para aplicar a sua: troque o nome e as cores abaixo e coloque o arquivo
// public/logo.png (ou deixe logo como null para mostrar só o nome).

export const identidade = {
  nome: "O Postinho Restaurante",
  // Vermelho-escuro: cabeçalho, botões, títulos e bordas (formato #RRGGBB)
  corPrincipal: "#8B1A1A",
  // Bege claro: fundo das páginas
  corSecundaria: "#F4EAD5",
  // Dourado envelhecido: só em detalhes finos (frisos e anéis)
  corDetalhe: "#C9A227",
  // Texto em cima da cor principal (botões e cabeçalho)
  corTextoClaro: "#FBF5E8",
  // Caminho do logo dentro da pasta public, ou null
  logo: "/logo.png" as string | null,
};
