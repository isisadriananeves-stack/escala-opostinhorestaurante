// Selo em formato de pílula (adaptado do Badge do shadcn, sem pacotes extras).
// variante "contorno": borda e texto na cor principal; "cheio": fundo na cor de destaque.

type Props = React.HTMLAttributes<HTMLSpanElement> & {
  variante?: "contorno" | "cheio";
};

export function Badge({ variante = "contorno", className = "", style, ...props }: Props) {
  const cores =
    variante === "cheio"
      ? { background: "var(--cor-destaque)", color: "var(--cor-texto-destaque)", borderColor: "transparent" }
      : { color: "var(--cor-principal)", borderColor: "var(--cor-principal)" };
  return (
    <span
      className={`titulo inline-flex items-center rounded-full border-2 px-3 py-1 text-sm ${className}`}
      style={{ ...cores, ...style }}
      {...props}
    />
  );
}
