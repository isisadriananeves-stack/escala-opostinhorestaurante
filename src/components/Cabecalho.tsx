"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { identidade } from "@/config/identidade";
import { menu } from "@/config/menu";

export function Cabecalho() {
  const caminho = usePathname();
  return (
    <header
      className="sticky top-0 z-10 border-b-4 text-white shadow-md"
      style={{ background: "var(--cor-principal)", borderColor: "var(--cor-destaque)" }}
    >
      <Link
        href="/"
        className="mx-auto flex max-w-3xl items-center gap-3 px-4 pt-3 pb-2"
      >
        {identidade.logo ? (
          <Image
            src={identidade.logo}
            alt={`Logo ${identidade.nome}`}
            width={52}
            height={52}
            priority
            className="h-[52px] w-[52px] shrink-0 rounded-full bg-[#F7EDD8] ring-2 ring-[color:var(--cor-destaque)]"
          />
        ) : null}
        <span className="titulo text-2xl leading-tight" style={{ color: "#FFF6E3" }}>
          {identidade.nome}
        </span>
      </Link>
      <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-2 pb-3 sm:gap-2 sm:px-3">
        {menu.map((item) => {
          const ativo = caminho === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={ativo ? "page" : undefined}
              className={`titulo whitespace-nowrap rounded-full px-3 py-2 text-base sm:px-4 ${
                ativo ? "" : "text-[#FFF6E3] active:bg-white/15"
              }`}
              style={
                ativo
                  ? { background: "var(--cor-destaque)", color: "var(--cor-texto-destaque)" }
                  : undefined
              }
            >
              {item.rotulo}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
