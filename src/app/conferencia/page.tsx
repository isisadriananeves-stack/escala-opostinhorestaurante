"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import type { Escala, Funcionario, RespostaMarcacoes, Turno } from "@/lib/tipos";
import { diaMes, hojeISO, rotuloDia, somarDias } from "@/lib/datas";
import { REGRAS } from "@/config/regras";
import {
  conferirDia,
  formatarMinutos,
  type LinhaEscalado,
  type Situacao,
} from "@/lib/conferencia";
import { AvisoErro, AvisoSemVariaveis, mensagemDeErro } from "@/components/AvisoBanco";

// Data e hora vêm do celular (no servidor ficam vazias).
const nada = () => () => {};
function useHoje(): string {
  return useSyncExternalStore(nada, hojeISO, () => "");
}
function ouvirMinuto(avisar: () => void) {
  const id = setInterval(avisar, 30_000);
  return () => clearInterval(id);
}
function minutosAgora(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
function useMinutosAgora(): number {
  return useSyncExternalStore(ouvirMinuto, minutosAgora, () => 0);
}

type DadosDoDia = {
  data: string;
  escalas: Escala[];
  ponto: RespostaMarcacoes | null;
  erroPonto: string | null;
};

async function buscarEscalasDoDia(data: string): Promise<Escala[]> {
  const { data: lista, error } = await supabase()
    .from("escalas")
    .select("id, data, turno_id, funcionario_id")
    .eq("data", data);
  if (error) throw error;
  return lista ?? [];
}

async function buscarPonto(data: string): Promise<RespostaMarcacoes> {
  const resposta = await fetch(`/api/ponto/marcacoes?data=${data}`, { cache: "no-store" });
  if (!resposta.ok) throw new Error(`erro ${resposta.status}`);
  return (await resposta.json()) as RespostaMarcacoes;
}

export default function ConferenciaDoDia() {
  const semVariaveis = !variaveisConfiguradas();
  const hoje = useHoje();
  const agora = useMinutosAgora();
  const [dataEscolhida, setDataEscolhida] = useState<string | null>(null);
  const data = dataEscolhida ?? hoje;

  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [cadastrosCarregados, setCadastrosCarregados] = useState(false);
  const [dados, setDados] = useState<DadosDoDia | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Turnos e funcionários: uma vez.
  useEffect(() => {
    if (semVariaveis) return;
    async function carregar() {
      try {
        const db = supabase();
        const [t, f] = await Promise.all([
          db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem"),
          db.from("funcionarios").select("*").order("nome"),
        ]);
        if (t.error) throw t.error;
        if (f.error) throw f.error;
        setTurnos(t.data ?? []);
        setFuncionarios(f.data ?? []);
      } catch (e) {
        setErro(mensagemDeErro(e));
      } finally {
        setCadastrosCarregados(true);
      }
    }
    carregar();
  }, [semVariaveis]);

  // Escala e ponto do dia escolhido.
  useEffect(() => {
    if (semVariaveis || !data) return;
    let valido = true;
    async function carregarDia() {
      // A escala vem do banco; o ponto vem da nossa rota no servidor.
      // Uma falha no ponto não impede de mostrar a escala.
      const [escalas, ponto] = await Promise.allSettled([
        buscarEscalasDoDia(data),
        buscarPonto(data),
      ]);
      if (!valido) return;
      if (escalas.status === "rejected") {
        setErro(mensagemDeErro(escalas.reason));
        setDados({ data, escalas: [], ponto: null, erroPonto: null });
        return;
      }
      setErro(null);
      setDados({
        data,
        escalas: escalas.value,
        ponto: ponto.status === "fulfilled" ? ponto.value : null,
        erroPonto: ponto.status === "rejected" ? mensagemDeErro(ponto.reason) : null,
      });
    }
    carregarDia();
    return () => {
      valido = false;
    };
  }, [data, semVariaveis]);

  if (semVariaveis) return <AvisoSemVariaveis />;

  const carregando = !cadastrosCarregados || !dados || dados.data !== data;
  const ponto = dados?.ponto ?? null;
  const temDados = Boolean(ponto?.temDados);
  const resultado =
    !carregando && dados
      ? conferirDia({
          data,
          hoje,
          agoraMinutos: agora,
          turnos,
          funcionarios,
          escalasDoDia: dados.escalas,
          marcacoes: ponto?.marcacoes ?? [],
          temDados,
          toleranciaAtrasoMinutos: REGRAS.conferencia.toleranciaAtrasoMinutos,
          horaExtraMinutos: REGRAS.conferencia.horaExtraMinutos,
        })
      : null;
  const futuro = Boolean(data && hoje && data > hoje);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl">Conferência do dia</h1>
        <p className="text-lg text-neutral-700">{data ? rotuloDia(data) : ""}</p>
      </div>

      {/* Seletor de data */}
      <div className="space-y-2">
        <div className="grid grid-cols-[auto_1fr_auto] gap-2">
          <button
            type="button"
            className="botao-secundario px-4"
            onClick={() => data && setDataEscolhida(somarDias(data, -1))}
            disabled={!data}
            aria-label="Dia anterior"
          >
            ◀
          </button>
          <label className="block">
            <span className="sr-only">Data</span>
            <input
              type="date"
              className="campo h-full text-center text-lg"
              value={data}
              onChange={(e) => e.target.value && setDataEscolhida(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="botao-secundario px-4"
            onClick={() => data && setDataEscolhida(somarDias(data, 1))}
            disabled={!data}
            aria-label="Próximo dia"
          >
            ▶
          </button>
        </div>
        {data !== hoje && hoje && (
          <button
            type="button"
            className="botao-secundario w-full"
            onClick={() => setDataEscolhida(null)}
          >
            Voltar para hoje
          </button>
        )}
      </div>

      {erro && <AvisoErro mensagem={erro} />}

      {carregando ? (
        <p className="text-neutral-600">Carregando escala e ponto...</p>
      ) : (
        <>
          <AvisoDaFonte ponto={ponto} erroPonto={dados?.erroPonto ?? null} futuro={futuro} />

          {resultado && !futuro && temDados && (
            <section className="grid grid-cols-3 gap-2" aria-label="Resumo do dia">
              <Contador
                rotulo={resultado.resumo.atrasos === 1 ? "Atraso" : "Atrasos"}
                valor={resultado.resumo.atrasos}
                detalhe={
                  resultado.resumo.minutosAtraso > 0
                    ? formatarMinutos(resultado.resumo.minutosAtraso)
                    : null
                }
                cor="text-amber-800"
              />
              <Contador
                rotulo={resultado.resumo.faltas === 1 ? "Falta" : "Faltas"}
                valor={resultado.resumo.faltas}
                detalhe={null}
                cor="text-red-700"
              />
              <Contador
                rotulo={resultado.resumo.horasExtras === 1 ? "Hora extra" : "Horas extras"}
                valor={resultado.resumo.horasExtras}
                detalhe={
                  resultado.resumo.minutosHoraExtra > 0
                    ? formatarMinutos(resultado.resumo.minutosHoraExtra)
                    : null
                }
                cor="text-blue-800"
              />
            </section>
          )}

          {resultado && (
            <section className="space-y-3">
              <h2 className="text-xl">Escalados ({resultado.escalados.length})</h2>
              {resultado.escalados.length === 0 ? (
                <p className="cartao text-neutral-600">
                  Ninguém escalado neste dia. Monte a escala na tela Escala da semana.
                </p>
              ) : (
                <ul className="space-y-3">
                  {resultado.escalados.map((linha) => (
                    <CartaoEscalado key={linha.funcionario.id} linha={linha} />
                  ))}
                </ul>
              )}
            </section>
          )}

          {resultado && resultado.naoEscalados.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xl">Não escalados ({resultado.naoEscalados.length})</h2>
              <p className="text-sm text-neutral-600">
                Bateram ponto, mas não estavam na escala deste dia.
              </p>
              <ul className="space-y-3">
                {resultado.naoEscalados.map(({ funcionario, marcacao }) => (
                  <li key={marcacao.cpf} className="cartao">
                    <p className="titulo text-lg" style={{ color: "var(--cor-principal)" }}>
                      {funcionario
                        ? funcionario.nome
                        : `Funcionário não cadastrado (CPF final ${marcacao.cpf.slice(-4)})`}
                    </p>
                    {funcionario && (
                      <p className="text-sm text-neutral-600">{funcionario.funcao}</p>
                    )}
                    <HorariosReais
                      entrada={marcacao.entrada}
                      saida={marcacao.saida}
                      saidaIntervalo={marcacao.saidaIntervalo}
                      voltaIntervalo={marcacao.voltaIntervalo}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {ponto && (
            <p className="border-t border-[color:var(--cor-borda)] pt-3 text-center text-sm text-neutral-600">
              Fonte dos dados:{" "}
              <strong>{ponto.fonte === "api" ? "API de ponto" : "dados de exemplo"}</strong>
            </p>
          )}
        </>
      )}
    </div>
  );
}

function AvisoDaFonte({
  ponto,
  erroPonto,
  futuro,
}: {
  ponto: RespostaMarcacoes | null;
  erroPonto: string | null;
  futuro: boolean;
}) {
  if (futuro) {
    return (
      <p className="cartao text-neutral-700">
        Este dia ainda não aconteceu: mostrando só o planejado.
      </p>
    );
  }
  if (!ponto) {
    return (
      <div className="cartao border-red-300 bg-red-50! shadow-none! text-red-800" role="alert">
        Não foi possível buscar as marcações de ponto agora. A escala aparece abaixo, sem a
        conferência. Tente de novo em instantes.
        {erroPonto && <span className="mt-1 block text-sm">Detalhe: {erroPonto}</span>}
      </div>
    );
  }
  if (ponto.fonte === "exemplo") {
    return (
      <div
        className="cartao border-amber-300 bg-amber-50! shadow-none! text-amber-900"
        role="status"
      >
        <p className="font-semibold">A API de ponto não respondeu. Usando dados de exemplo.</p>
        {ponto.aviso && <p className="mt-1 text-sm">Motivo: {ponto.aviso}</p>}
        {!ponto.temDados && (
          <p className="mt-2 text-sm">
            Os dados de exemplo só existem para{" "}
            {ponto.datasDeExemplo.map((d) => diaMes(d)).join(" e ")}. Para este dia não há
            marcações, então ninguém foi marcado como falta.
          </p>
        )}
      </div>
    );
  }
  return null;
}

function Contador({
  rotulo,
  valor,
  detalhe,
  cor,
}: {
  rotulo: string;
  valor: number;
  detalhe: string | null;
  cor: string;
}) {
  return (
    <div className="cartao px-2 py-3 text-center">
      <p className={`titulo text-3xl leading-none ${valor > 0 ? cor : "text-neutral-400"}`}>
        {valor}
      </p>
      <p className="mt-1 text-sm font-semibold leading-tight">{rotulo}</p>
      {detalhe && <p className="text-xs text-neutral-600">{detalhe}</p>}
    </div>
  );
}

const SELO: Record<Situacao, { texto: string; classe: string }> = {
  "no-horario": { texto: "No horário", classe: "bg-green-100 text-green-900 border-green-300" },
  atrasado: { texto: "Atrasado", classe: "bg-amber-100 text-amber-900 border-amber-300" },
  faltou: { texto: "Faltou", classe: "bg-red-100 text-red-800 border-red-300" },
  "sem-entrada": {
    texto: "Sem batida de entrada",
    classe: "bg-amber-50 text-amber-900 border-amber-300",
  },
  aguardando: { texto: "Aguardando", classe: "bg-neutral-100 text-neutral-700 border-neutral-300" },
  futuro: { texto: "Planejado", classe: "bg-neutral-100 text-neutral-700 border-neutral-300" },
  "sem-dados": {
    texto: "Sem dados de ponto",
    classe: "bg-neutral-100 text-neutral-700 border-neutral-300",
  },
  "sem-cpf": {
    texto: "Sem CPF no cadastro",
    classe: "bg-amber-50 text-amber-900 border-amber-300",
  },
};

function Selo({ texto, classe }: { texto: string; classe: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${classe}`}>
      {texto}
    </span>
  );
}

function CartaoEscalado({ linha }: { linha: LinhaEscalado }) {
  const { funcionario, turnos, planejadoInicio, planejadoFim, marcacao, situacao } = linha;
  const selo = SELO[situacao];
  const mostraReal = situacao !== "futuro" && situacao !== "sem-dados" && situacao !== "sem-cpf";
  return (
    <li className="cartao space-y-2">
      <div>
        <p className="titulo text-lg leading-tight" style={{ color: "var(--cor-principal)" }}>
          {funcionario.nome}
        </p>
        <p className="text-sm text-neutral-600">
          {funcionario.funcao} · {turnos.map((t) => t.nome).join(" + ")}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-neutral-600">Planejado</dt>
        <dd className="font-semibold">
          {planejadoInicio} às {planejadoFim}
        </dd>
        {mostraReal && (
          <>
            <dt className="text-neutral-600">Entrada real</dt>
            <dd className="font-semibold">{marcacao?.entrada ?? "—"}</dd>
            <dt className="text-neutral-600">Saída real</dt>
            <dd className="font-semibold">{marcacao?.saida ?? "—"}</dd>
            {marcacao?.saidaIntervalo && (
              <>
                <dt className="text-neutral-600">Intervalo</dt>
                <dd>
                  {marcacao.saidaIntervalo} às {marcacao.voltaIntervalo ?? "—"}
                </dd>
              </>
            )}
          </>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Selo
          texto={
            situacao === "atrasado"
              ? `Atrasado ${formatarMinutos(linha.minutosAtraso)}`
              : selo.texto
          }
          classe={selo.classe}
        />
        {linha.minutosHoraExtra > 0 && (
          <Selo
            texto={`Hora extra +${formatarMinutos(linha.minutosHoraExtra)}`}
            classe="bg-blue-100 text-blue-900 border-blue-300"
          />
        )}
      </div>
      {situacao === "sem-cpf" && (
        <p className="text-sm text-amber-900">
          Cadastre o CPF de {funcionario.nome.split(" ")[0]} na tela Equipe para conferir o ponto.
        </p>
      )}
    </li>
  );
}

function HorariosReais({
  entrada,
  saida,
  saidaIntervalo,
  voltaIntervalo,
}: {
  entrada: string | null;
  saida: string | null;
  saidaIntervalo: string | null;
  voltaIntervalo: string | null;
}) {
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
      <dt className="text-neutral-600">Entrada real</dt>
      <dd className="font-semibold">{entrada ?? "—"}</dd>
      <dt className="text-neutral-600">Saída real</dt>
      <dd className="font-semibold">{saida ?? "—"}</dd>
      {saidaIntervalo && (
        <>
          <dt className="text-neutral-600">Intervalo</dt>
          <dd>
            {saidaIntervalo} às {voltaIntervalo ?? "—"}
          </dd>
        </>
      )}
    </dl>
  );
}
