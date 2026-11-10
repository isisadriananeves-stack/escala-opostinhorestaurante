-- =====================================================================
-- Sistema de escala · estrutura do banco de dados (Supabase / Postgres)
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em Run.
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================

create extension if not exists "pgcrypto";

-- Funcionários do restaurante
create table if not exists funcionarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  funcao text not null,
  telefone text,
  cpf text unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
-- Sexo (F/M), usado na regra de folga aos domingos
alter table funcionarios add column if not exists sexo text check (sexo in ('F', 'M'));
-- Só os 4 últimos números do CPF, preenchidos pelo próprio banco.
-- As telas mostram só isto; o CPF completo fica no servidor.
alter table funcionarios
  add column if not exists cpf_final text generated always as (right(cpf, 4)) stored;

-- Conferências do cadastro (o site confere as mesmas regras em src/lib/validacao.ts)
-- Nome: entre 2 e 60 letras
alter table funcionarios drop constraint if exists funcionarios_nome_tamanho;
alter table funcionarios add constraint funcionarios_nome_tamanho
  check (char_length(btrim(nome)) between 2 and 60);
-- Telefone: (DD) 9XXXX-XXXX (celular) ou (DD) XXXX-XXXX (fixo, começa com 2 a 5)
alter table funcionarios drop constraint if exists funcionarios_telefone_formato;
alter table funcionarios add constraint funcionarios_telefone_formato
  check (telefone is null or telefone ~ '^\([1-9][1-9]\) (9[0-9]{4}|[2-5][0-9]{3})-[0-9]{4}$');
-- CPF: sempre 11 números
alter table funcionarios drop constraint if exists funcionarios_cpf_formato;
alter table funcionarios add constraint funcionarios_cpf_formato
  check (cpf is null or cpf ~ '^[0-9]{11}$');

-- Conta dos dígitos verificadores do CPF
create or replace function cpf_valido(cpf text) returns boolean
language plpgsql immutable as $$
declare
  soma int; resto int; i int;
begin
  if cpf is null or cpf !~ '^[0-9]{11}$' or cpf ~ '^(.)\1{10}$' then
    return false;  -- formato errado ou todos os números iguais
  end if;
  soma := 0;
  for i in 1..9 loop soma := soma + substr(cpf, i, 1)::int * (11 - i); end loop;
  resto := (soma * 10) % 11 % 10;
  if resto <> substr(cpf, 10, 1)::int then return false; end if;
  soma := 0;
  for i in 1..10 loop soma := soma + substr(cpf, i, 1)::int * (12 - i); end loop;
  resto := (soma * 10) % 11 % 10;
  return resto = substr(cpf, 11, 1)::int;
end $$;

-- Confere o CPF só quando ele é cadastrado ou trocado
-- (os CPFs fictícios dos dados de exemplo continuam valendo)
create or replace function funcionarios_confere_cpf() returns trigger
language plpgsql as $$
begin
  if new.cpf is not null
     and (tg_op = 'INSERT' or new.cpf is distinct from old.cpf)
     and not cpf_valido(new.cpf) then
    raise exception 'CPF inválido' using errcode = '23514',
      hint = 'Confira os números do CPF.';
  end if;
  return new;
end $$;
-- (o gatilho que chama esta conferência é ligado no fim do arquivo,
--  depois dos dados de exemplo, que usam CPFs fictícios)

-- Turnos de trabalho (ex.: Almoço, Jantar)
create table if not exists turnos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  hora_inicio time not null,
  hora_fim time not null,
  ordem int not null default 0
);

-- Escala: quem trabalha em qual turno em qual dia
create table if not exists escalas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  turno_id uuid not null references turnos (id) on delete cascade,
  funcionario_id uuid not null references funcionarios (id) on delete cascade,
  criado_em timestamptz not null default now(),
  unique (data, turno_id, funcionario_id)
);
create index if not exists escalas_data_idx on escalas (data);

-- Regras da casa: mínimo de pessoas por turno e função
-- dia_semana: 0 = domingo ... 6 = sábado; null = vale para todos os dias
create table if not exists regras (
  id uuid primary key default gen_random_uuid(),
  dia_semana smallint check (dia_semana between 0 and 6),
  turno_id uuid not null references turnos (id) on delete cascade,
  funcao text not null,
  minimo int not null default 1
);

-- Configurações gerais (chave e valor em texto)
create table if not exists configuracoes (
  chave text primary key,
  valor text not null
);

-- ---------------------------------------------------------------------
-- Acesso: só quem fez login E está na lista usuarios_autorizados.
-- Sem login, o banco não mostra nem altera nada.
-- ---------------------------------------------------------------------
alter table funcionarios enable row level security;
alter table turnos enable row level security;
alter table escalas enable row level security;
alter table regras enable row level security;
alter table configuracoes enable row level security;

-- Lista de e-mails que podem usar o sistema.
-- Sem regras de acesso: só é lida e alterada aqui no SQL Editor.
create table if not exists usuarios_autorizados (email text primary key);
alter table usuarios_autorizados enable row level security;
-- Para liberar alguém (crie antes o usuário em Authentication > Users):
-- insert into usuarios_autorizados (email) values (lower('email@exemplo.com'));

-- Pergunta ao banco: "quem está logado está na lista?"
create or replace function usuario_autorizado() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from usuarios_autorizados
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function usuario_autorizado() from public, anon;
grant execute on function usuario_autorizado() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['funcionarios','turnos','escalas','regras','configuracoes'] loop
    execute format('drop policy if exists "acesso aberto" on %I', t);
    execute format('drop policy if exists "equipe autorizada" on %I', t);
    execute format('create policy "equipe autorizada" on %I for all to authenticated
                    using (usuario_autorizado()) with check (usuario_autorizado())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Dados de exemplo (restaurante fictício Vila Tempero)
-- Os CPFs são fictícios e batem com a API de ponto de demonstração.
-- ---------------------------------------------------------------------
insert into turnos (nome, hora_inicio, hora_fim, ordem) values
  ('Almoço', '11:00', '15:30', 1),
  ('Jantar', '18:00', '23:30', 2)
on conflict (nome) do nothing;

-- Desliga a conferência de CPF só enquanto os exemplos (CPFs fictícios) entram.
drop trigger if exists confere_cpf on funcionarios;
insert into funcionarios (nome, funcao, telefone, cpf) values
  ('Ana Souza',      'Salão',      '(11) 91234-0001', '12345678901'),
  ('Bruno Lima',     'Cozinha',    '(11) 91234-0002', '23456789012'),
  ('Carla Mendes',   'Caixa',      '(11) 91234-0003', '34567890123'),
  ('Diego Alves',    'Cozinha',    '(11) 91234-0004', '45678901234'),
  ('Elaine Costa',   'Salão',      '(11) 91234-0005', '56789012345'),
  ('Fábio Rocha',    'Bar',        '(11) 91234-0006', '67890123456'),
  ('Gabriela Nunes', 'Salão',      '(11) 91234-0007', '78901234567'),
  ('Henrique Dias',  'Entregador', '(11) 91234-0008', '89012345678')
on conflict (cpf) do nothing;

insert into configuracoes (chave, valor) values
  ('folgas_minimas_semana', '1'),
  ('bloquear_fechar_e_abrir', 'true'),
  ('tolerancia_atraso_minutos', '10'),
  ('hora_extra_minutos', '30')
on conflict (chave) do nothing;

-- Regras de exemplo: todos os dias, 2 no salão e 1 na cozinha por turno;
-- sexta e sábado à noite, 3 no salão e 2 na cozinha.
insert into regras (dia_semana, turno_id, funcao, minimo)
select null, t.id, 'Salão', 2 from turnos t
where not exists (select 1 from regras);
insert into regras (dia_semana, turno_id, funcao, minimo)
select null, t.id, 'Cozinha', 1 from turnos t
where (select count(*) from regras) = 2;
insert into regras (dia_semana, turno_id, funcao, minimo)
select d, t.id, 'Salão', 3 from turnos t, unnest(array[5, 6]) as d
where t.nome = 'Jantar' and (select count(*) from regras) = 4;
insert into regras (dia_semana, turno_id, funcao, minimo)
select d, t.id, 'Cozinha', 2 from turnos t, unnest(array[5, 6]) as d
where t.nome = 'Jantar' and (select count(*) from regras) = 6;

-- ---------------------------------------------------------------------
-- Liga a conferência de CPF (só vale para CPF novo ou trocado).
-- ---------------------------------------------------------------------
drop trigger if exists confere_cpf on funcionarios;
create trigger confere_cpf before insert or update of cpf on funcionarios
  for each row execute function funcionarios_confere_cpf();
