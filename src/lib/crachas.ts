// Transforma os funcionários do banco nos crachás do mural da tela Início
// (src/components/ui/team-lanyard-rail.tsx). Sem foto: o retrato é um círculo
// com as iniciais, na cor da função. Telefone e CPF não entram no crachá.

import type { LanyardMember } from "@/components/ui/team-lanyard-rail";
import { FUNCOES_PADRAO, type FuncionarioInicio } from "@/lib/tipos";

type Tom = 1 | 2 | 3 | 4 | 5;

// Mesmas cores de --color-chart-1 a 5 (src/app/globals.css). A imagem do
// retrato não enxerga as variáveis do CSS, por isso as cores estão repetidas aqui.
const CORES_DO_TOM: Record<Tom, { fundo: string; letra: string }> = {
  1: { fundo: "#8b1a1a", letra: "#fbf5e8" },
  2: { fundo: "#c9a227", letra: "#2a1a14" },
  3: { fundo: "#6b4226", letra: "#fbf5e8" },
  4: { fundo: "#5f6b2e", letra: "#fbf5e8" },
  5: { fundo: "#1f5c63", letra: "#fbf5e8" },
};

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Cor da fita: cada função tem a sua (funções fora da lista padrão também ganham uma fixa). */
function tomDaFuncao(funcao: string): Tom {
  const alvo = funcao.trim().toLowerCase();
  let indice = FUNCOES_PADRAO.findIndex((f) => f.toLowerCase() === alvo);
  if (indice < 0) {
    indice = 0;
    for (const letra of alvo) indice = (indice * 31 + letra.charCodeAt(0)) % 1000;
  }
  return ((indice % 5) + 1) as Tom;
}

/** "Maria da Silva" -> "MS"; "Ana" -> "A". */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = Array.from(partes[0])[0] ?? "";
  const ultima = partes.length > 1 ? (Array.from(partes[partes.length - 1])[0] ?? "") : "";
  return (primeira + ultima).toLocaleUpperCase("pt-BR");
}

function escaparXml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Retrato com as iniciais, como imagem SVG embutida (não baixa nada da internet). */
function retratoComIniciais(nome: string, tom: Tom): string {
  const { fundo, letra } = CORES_DO_TOM[tom];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">` +
    `<rect width="120" height="120" fill="${fundo}"/>` +
    `<circle cx="60" cy="60" r="52" fill="none" stroke="${letra}" stroke-opacity="0.35" stroke-width="2"/>` +
    `<text x="60" y="61" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="'Arial Narrow', Arial, Helvetica, sans-serif" font-weight="700" font-size="46" ` +
    `letter-spacing="2" fill="${letra}">${escaparXml(iniciais(nome))}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** "Na equipe do Postinho desde março de 2026." (ou nada, se a data faltar). */
function textoDoVerso(criadoEm: string | undefined): string | undefined {
  if (!criadoEm) return undefined;
  const data = new Date(criadoEm);
  if (Number.isNaN(data.getTime())) return undefined;
  return `Na equipe do Postinho desde ${MESES[data.getMonth()]} de ${data.getFullYear()}.`;
}

export function paraCrachas(equipe: FuncionarioInicio[]): LanyardMember[] {
  return equipe.map((pessoa) => {
    const tom = tomDaFuncao(pessoa.funcao);
    return {
      id: pessoa.id,
      name: pessoa.nome,
      role: pessoa.funcao,
      team: `O Postinho · ${pessoa.funcao}`,
      image: retratoComIniciais(pessoa.nome, tom),
      bio: textoDoVerso(pessoa.criado_em),
      tags: [pessoa.funcao],
      tone: tom,
    };
  });
}
