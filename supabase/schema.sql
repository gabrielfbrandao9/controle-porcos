-- Controle de Porcos: banco de dados no Supabase
-- Usa o MESMO projeto do Otimizador de Cortes e dos Orçamentos (mesmo login),
-- mas não mexe nas tabelas deles: tudo aqui começa com "porcos_".
-- Cole este arquivo inteiro em: Supabase > SQL Editor > New query > Run
-- Pode rodar quantas vezes precisar: não apaga nada.

-- ---------------------------------------------------------------------------
-- Acesso: só quem está nesta lista vê os dados.
--   dono   vê, edita e decide quem tem acesso
--   editor vê e edita
--   leitor só vê
-- A pessoa entra com a conta Google do e-mail que está na lista.

create table if not exists public.porcos_acesso (
  email text primary key check (email = lower(email) and email like '%_@_%'),
  papel text not null check (papel in ('dono', 'editor', 'leitor')),
  nome text not null default '',
  adicionado_por uuid default auth.uid() references auth.users (id) on delete set null,
  adicionado_em timestamptz not null default now()
);

alter table public.porcos_acesso enable row level security;

-- E-mail confirmado de quem está usando (em minúsculas), ou null.
create or replace function public.meu_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email) from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
$$;

-- Papel de quem está usando: 'dono', 'editor', 'leitor' ou null (sem acesso).
create or replace function public.porcos_papel()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.papel from public.porcos_acesso a where a.email = public.meu_email();
$$;

create or replace function public.porcos_pode_ver()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.porcos_papel() is not null;
$$;

create or replace function public.porcos_pode_editar()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.porcos_papel() in ('dono', 'editor'), false);
$$;

revoke all on function public.porcos_papel(), public.porcos_pode_ver(), public.porcos_pode_editar() from anon, public;
grant execute on function public.porcos_papel(), public.porcos_pode_ver(), public.porcos_pode_editar() to authenticated;

-- Lista de acesso: cada pessoa vê a própria linha; o dono vê e altera todas,
-- mas só cria editores e leitores (o dono não pode ser removido nem rebaixado pelo site).
drop policy if exists "Ver acesso" on public.porcos_acesso;
create policy "Ver acesso" on public.porcos_acesso
  for select to authenticated
  using (email = (select public.meu_email()) or (select public.porcos_papel()) = 'dono');

drop policy if exists "Dono adiciona" on public.porcos_acesso;
create policy "Dono adiciona" on public.porcos_acesso
  for insert to authenticated
  with check ((select public.porcos_papel()) = 'dono' and papel in ('editor', 'leitor'));

drop policy if exists "Dono altera" on public.porcos_acesso;
create policy "Dono altera" on public.porcos_acesso
  for update to authenticated
  using ((select public.porcos_papel()) = 'dono' and papel <> 'dono')
  with check (papel in ('editor', 'leitor'));

drop policy if exists "Dono remove" on public.porcos_acesso;
create policy "Dono remove" on public.porcos_acesso
  for delete to authenticated
  using ((select public.porcos_papel()) = 'dono' and papel <> 'dono');

revoke all on public.porcos_acesso from anon;
grant select, insert, update, delete on public.porcos_acesso to authenticated;

-- Dono: só na primeira vez, troque o e-mail abaixo pelo da conta Google do dono e
-- tire os "--" da frente das três linhas. (O dono não pode ser criado pelo site.)
-- insert into public.porcos_acesso (email, papel, nome)
-- values ('seu.email@gmail.com', 'dono', 'Seu nome')
-- on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- Quem alterou por último (preenchido sozinho)

create or replace function public.porcos_carimbo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tabelas de dados

-- Animais do plantel (matrizes, barrões, porcas, porcos)
create table if not exists public.porcos_animais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text not null check (categoria in ('matriz', 'barrao', 'porca', 'porco')),
  nascimento date,
  chegada date,
  aquisicao text not null default 'nascido' check (aquisicao in ('nascido', 'comprado', 'ganhado')),
  negociado_com text not null default '',
  valor_compra numeric(12, 2),
  -- saída do plantel: vendido, abatido ou morto (null = ainda no plantel)
  saida text check (saida in ('venda', 'abate', 'morte')),
  saida_data date,
  valor_venda numeric(12, 2),
  foto text,  -- caminho no bucket porcos-fotos
  obs text not null default '',
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references auth.users (id) on delete set null
);

-- Gestações e crias de cada matriz
create table if not exists public.porcos_gestacoes (
  id uuid primary key default gen_random_uuid(),
  matriz_id uuid not null references public.porcos_animais (id) on delete cascade,
  cruzamento date not null,
  -- data do parto; em branco = previsto para o cruzamento + 114 dias (calculado pelo site)
  parto date,
  -- leitões vivos e mortos no parto (vivos em branco = ainda não nasceu); nascidos = vivos + mortos
  vivos int check (vivos >= 0),
  machos int check (machos >= 0),
  femeas int check (femeas >= 0),
  mortos int check (mortos >= 0),
  capacao date,
  obs text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references auth.users (id) on delete set null
);

-- Para quem criou a tabela quando a coluna se chamava "nascidos"
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'porcos_gestacoes' and column_name = 'nascidos') then
    alter table public.porcos_gestacoes rename column nascidos to vivos;
  end if;
end;
$$;
create index if not exists porcos_gestacoes_matriz_idx on public.porcos_gestacoes (matriz_id);

-- Remédios e vacinas (Ferro, Verme, Suiven, Megabov, Isocox...)
create table if not exists public.porcos_produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  -- de quantos em quantos dias repetir (null = não tem reforço no calendário)
  intervalo_dias int check (intervalo_dias > 0),
  -- link da bula (vazio = sem bula)
  bula text not null default '' check (bula = '' or (bula ~* '^https?://' and length(bula) <= 2000)),
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references auth.users (id) on delete set null
);
-- Para quem criou a tabela antes do link da bula
alter table public.porcos_produtos add column if not exists bula text not null default '';

-- Cada aplicação: num animal OU numa cria (leitegada)
create table if not exists public.porcos_aplicacoes (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.porcos_produtos (id) on delete restrict,
  animal_id uuid references public.porcos_animais (id) on delete cascade,
  gestacao_id uuid references public.porcos_gestacoes (id) on delete cascade,
  data date not null,
  obs text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references auth.users (id) on delete set null,
  constraint porcos_aplicacoes_alvo check ((animal_id is null) <> (gestacao_id is null))
);
create index if not exists porcos_aplicacoes_animal_idx on public.porcos_aplicacoes (animal_id);
create index if not exists porcos_aplicacoes_gestacao_idx on public.porcos_aplicacoes (gestacao_id);
create index if not exists porcos_aplicacoes_produto_idx on public.porcos_aplicacoes (produto_id);

-- Abates
create table if not exists public.porcos_abates (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  animal_id uuid references public.porcos_animais (id) on delete set null,
  -- partes: [{ "parte": "Carne", "kg": 75, "preco": 20, "valor": 1500 }, ...]
  -- preco = R$ por kg (opcional); valor = valor da parte (kg × preço, ou digitado)
  itens jsonb not null default '[]'::jsonb check (jsonb_typeof(itens) = 'array'),
  -- kg de carne e toucinho (copiados das partes, para consultas simples)
  carne_kg numeric(10, 2),
  toucinho_kg numeric(10, 2),
  -- valor total do abate (soma das partes, ou digitado quando as partes não têm valor)
  valor numeric(12, 2),
  obs text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references auth.users (id) on delete set null
);
create index if not exists porcos_abates_animal_idx on public.porcos_abates (animal_id);
-- Para quem criou a tabela antes das partes
alter table public.porcos_abates add column if not exists itens jsonb not null default '[]'::jsonb;

-- Gastos e receitas
create table if not exists public.porcos_lancamentos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  tipo text not null check (tipo in ('despesa', 'receita')),
  categoria text not null check (categoria in ('soro', 'racao', 'outras', 'venda')),
  descricao text not null default '',
  valor numeric(12, 2) not null check (valor >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references auth.users (id) on delete set null
);
create index if not exists porcos_lancamentos_data_idx on public.porcos_lancamentos (data);

-- Fórmulas de ração por fase: itens = [{ "nome": "Milho", "pct": 40 }, ...]
create table if not exists public.porcos_racoes (
  id uuid primary key default gen_random_uuid(),
  fase text not null,
  faixa text not null default '',
  itens jsonb not null default '[]'::jsonb check (jsonb_typeof(itens) = 'array'),
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references auth.users (id) on delete set null
);

-- Segurança e carimbo em todas as tabelas de dados
do $$
declare
  t text;
begin
  foreach t in array array['porcos_animais', 'porcos_gestacoes', 'porcos_produtos', 'porcos_aplicacoes',
                           'porcos_abates', 'porcos_lancamentos', 'porcos_racoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    execute format('drop policy if exists "Ver" on public.%I', t);
    execute format('create policy "Ver" on public.%I for select to authenticated using ((select public.porcos_pode_ver()))', t);
    execute format('drop policy if exists "Criar" on public.%I', t);
    execute format('create policy "Criar" on public.%I for insert to authenticated with check ((select public.porcos_pode_editar()))', t);
    execute format('drop policy if exists "Alterar" on public.%I', t);
    execute format('create policy "Alterar" on public.%I for update to authenticated using ((select public.porcos_pode_editar())) with check ((select public.porcos_pode_editar()))', t);
    execute format('drop policy if exists "Excluir" on public.%I', t);
    execute format('create policy "Excluir" on public.%I for delete to authenticated using ((select public.porcos_pode_editar()))', t);

    execute format('drop trigger if exists carimbo on public.%I', t);
    execute format('create trigger carimbo before update on public.%I for each row execute function public.porcos_carimbo()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fotos dos animais (Supabase Storage), até 5 MB cada

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('porcos-fotos', 'porcos-fotos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Porcos: ver fotos" on storage.objects;
create policy "Porcos: ver fotos" on storage.objects
  for select to authenticated
  using (bucket_id = 'porcos-fotos' and (select public.porcos_pode_ver()));

drop policy if exists "Porcos: enviar fotos" on storage.objects;
create policy "Porcos: enviar fotos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'porcos-fotos' and (select public.porcos_pode_editar()));

drop policy if exists "Porcos: trocar fotos" on storage.objects;
create policy "Porcos: trocar fotos" on storage.objects
  for update to authenticated
  using (bucket_id = 'porcos-fotos' and (select public.porcos_pode_editar()))
  with check (bucket_id = 'porcos-fotos' and (select public.porcos_pode_editar()));

drop policy if exists "Porcos: apagar fotos" on storage.objects;
create policy "Porcos: apagar fotos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'porcos-fotos' and (select public.porcos_pode_editar()));
