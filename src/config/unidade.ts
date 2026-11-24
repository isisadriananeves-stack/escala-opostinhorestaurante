// Qual unidade este site atende. Cada site na Vercel tem a variável
// NEXT_PUBLIC_UNIDADE ("vila-galvao" ou "centro"); sem ela, vale Vila Galvão.
// O nome (src/config/identidade.ts) e as regras (src/config/regras.ts) seguem a unidade.

export type Unidade = "vila-galvao" | "centro";

export const UNIDADE: Unidade =
  process.env.NEXT_PUBLIC_UNIDADE === "centro" ? "centro" : "vila-galvao";
