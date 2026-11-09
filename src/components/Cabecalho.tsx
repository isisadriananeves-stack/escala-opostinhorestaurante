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
      className="sticky top-0 z-10 shadow-md"
      style={{
        background: "var(--cor-principal)",
        color: "var(--cor-texto-claro)",
        // Friso duplo fino dourado embaixo, como nos rótulos antigos.
        borderBottom: "4px double var(--cor-detalhe)",
      }}
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
            className="h-[52px] w-[52px] shrink-0 rounded-full ring-2 ring-[color:var(--cor-detalhe)]"
            style={{ background: "var(--cor-secundaria)" }}
          />
        ) : null}
        <span className="titulo text-2xl leading-tight tracking-wide">
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
              className={`rotulo whitespace-nowrap rounded-full px-3 py-2 text-sm sm:px-4 ${
                ativo ? "" : "active:bg-white/15"
              }`}
              style={
                ativo
                  ? { background: "var(--cor-secundaria)", color: "var(--cor-principal)" }
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
