// Identidade visual do restaurante (estilo vintage e limpo).
// As duas unidades usam as mesmas cores e o mesmo logo (public/logo.png);
// só o nome muda, conforme a unidade do site (src/config/unidade.ts).

import { UNIDADE } from "@/config/unidade";

const NOMES = {
  "vila-galvao": "O Postinho - Vila Galvão",
  centro: "O Postinho - Centro",
} as const;

export const identidade = {
  nome: NOMES[UNIDADE],
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
