// Selo em formato de pílula (adaptado do Badge do shadcn, sem pacotes extras).
// variante "contorno": borda e texto na cor principal; "cheio": fundo na cor principal.

type Props = React.HTMLAttributes<HTMLSpanElement> & {
  variante?: "contorno" | "cheio";
};

export function Badge({ variante = "contorno", className = "", style, ...props }: Props) {
  const cores =
    variante === "cheio"
      ? {
          background: "var(--cor-principal)",
          color: "var(--cor-texto-claro)",
          borderColor: "var(--cor-principal)",
        }
      : { color: "var(--cor-principal)", borderColor: "var(--cor-principal)" };
  return (
    <span
      className={`rotulo inline-flex items-center rounded-full border-2 px-4 py-1 text-xs ${className}`}
      style={{ ...cores, ...style }}
      {...props}
    />
  );
}
