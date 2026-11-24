-- Controle de Porcos: banco de dados no Supabase
-- Sistema Multi-inquilino com Grupos e Convites por Link
-- Cole este arquivo inteiro em: Supabase > SQL Editor > New query > Run
-- Pode rodar quantas vezes precisar: não apaga dados existentes.

-- ---------------------------------------------------------------------------
-- 1. Grupos (cada usuário tem seu grupo/criação ou participa de grupos compartilhados)

create table if not exists public.porcos_grupos (
  id uuid primary key default gen_random_uuid(),
  nome text not null default 'Meu Grupo',
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references auth.users (id) on delete set null
);

alter table public.porcos_grupos enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Membros dos Grupos
--   dono   vê, edita, convida e gerencia membros e o grupo
--   editor vê e edita animais, crias, vacinas, etc.
--   leitor só vê

create table if not exists public.porcos_membros (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.porcos_grupos (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  email text check (email is null or (email = lower(email) and email like '%_@_%')),
  nome text not null default '',
  papel text not null check (papel in ('dono', 'editor', 'leitor')),
  adicionado_em timestamptz not null default now(),
  ultimo_acesso timestamptz
);

create index if not exists porcos_membros_grupo_idx on public.porcos_membros (grupo_id);
create index if not exists porcos_membros_user_idx on public.porcos_membros (user_id);
create index if not exists porcos_membros_email_idx on public.porcos_membros (email);

-- Garante que um usuário ou e-mail não seja duplicado no mesmo grupo
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'porcos_membros_grupo_user_uniq') then
    alter table public.porcos_membros add constraint porcos_membros_grupo_user_uniq unique (grupo_id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'porcos_membros_grupo_email_uniq') then
    alter table public.porcos_membros add constraint porcos_membros_grupo_email_uniq unique (grupo_id, email);
  end if;
end;
$$;

alter table public.porcos_membros enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Convites por Link
-- Permite gerar links que qualquer pessoa com conta Google pode clicar para entrar no grupo

create table if not exists public.porcos_convites (
  codigo text primary key,
  grupo_id uuid not null references public.porcos_grupos (id) on delete cascade,
  papel text not null check (papel in ('editor', 'leitor')) default 'editor',
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  usos_restantes int default null, -- null = ilimitado
  ativo boolean not null default true
);

create index if not exists porcos_convites_grupo_idx on public.porcos_convites (grupo_id);
alter table public.porcos_convites enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Funções de Apoio e RLS

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

-- Ids dos grupos aos quais o usuário autenticado pertence
create or replace function public.porcos_meus_grupos()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct m.grupo_id
  from public.porcos_membros m
  where m.user_id = auth.uid()
     or (public.meu_email() is not null and m.email = public.meu_email());
$$;

-- Papel do usuário autenticado em um grupo específico ('dono', 'editor', 'leitor' ou null)
create or replace function public.porcos_meu_papel(p_grupo_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.papel
  from public.porcos_membros m
  where m.grupo_id = p_grupo_id
    and (m.user_id = auth.uid() or (public.meu_email() is not null and m.email = public.meu_email()))
  order by case when m.papel = 'dono' then 1 when m.papel = 'editor' then 2 else 3 end
  limit 1;
$$;

create or replace function public.porcos_pode_ver_grupo(p_grupo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.porcos_meu_papel(p_grupo_id) is not null;
$$;

create or replace function public.porcos_pode_editar_grupo(p_grupo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.porcos_meu_papel(p_grupo_id) in ('dono', 'editor'), false);
$$;

revoke all on function public.meu_email(), public.porcos_meus_grupos(), public.porcos_meu_papel(uuid),
  public.porcos_pode_ver_grupo(uuid), public.porcos_pode_editar_grupo(uuid) from anon, public;
grant execute on function public.meu_email(), public.porcos_meus_grupos(), public.porcos_meu_papel(uuid),
  public.porcos_pode_ver_grupo(uuid), public.porcos_pode_editar_grupo(uuid) to authenticated;

-- Políticas de RLS para grupos
drop policy if exists "Ver meus grupos" on public.porcos_grupos;
create policy "Ver meus grupos" on public.porcos_grupos
  for select to authenticated
  using (id in (select public.porcos_meus_grupos()));

drop policy if exists "Criar grupo" on public.porcos_grupos;
create policy "Criar grupo" on public.porcos_grupos
  for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "Dono altera grupo" on public.porcos_grupos;
create policy "Dono altera grupo" on public.porcos_grupos
  for update to authenticated
  using (public.porcos_meu_papel(id) = 'dono')
  with check (public.porcos_meu_papel(id) = 'dono');

drop policy if exists "Dono exclui grupo" on public.porcos_grupos;
create policy "Dono exclui grupo" on public.porcos_grupos
  for delete to authenticated
  using (public.porcos_meu_papel(id) = 'dono');

-- Políticas de RLS para membros
drop policy if exists "Ver membros do grupo" on public.porcos_membros;
create policy "Ver membros do grupo" on public.porcos_membros
  for select to authenticated
  using (grupo_id in (select public.porcos_meus_grupos()));

drop policy if exists "Dono adiciona membros" on public.porcos_membros;
create policy "Dono adiciona membros" on public.porcos_membros
  for insert to authenticated
  with check (public.porcos_meu_papel(grupo_id) = 'dono' or user_id = auth.uid());

drop policy if exists "Dono altera membros" on public.porcos_membros;
create policy "Dono altera membros" on public.porcos_membros
  for update to authenticated
  using (public.porcos_meu_papel(grupo_id) = 'dono' or user_id = auth.uid())
  with check (public.porcos_meu_papel(grupo_id) = 'dono' or user_id = auth.uid());

drop policy if exists "Dono remove membros" on public.porcos_membros;
create policy "Dono remove membros" on public.porcos_membros
  for delete to authenticated
  using (public.porcos_meu_papel(grupo_id) = 'dono' or user_id = auth.uid());

-- Políticas para convites
drop policy if exists "Ver convites do grupo" on public.porcos_convites;
create policy "Ver convites do grupo" on public.porcos_convites
  for select to authenticated
  using (grupo_id in (select public.porcos_meus_grupos()) or ativo = true);

drop policy if exists "Dono gerencia convites" on public.porcos_convites;
create policy "Dono gerencia convites" on public.porcos_convites
  for all to authenticated
  using (public.porcos_meu_papel(grupo_id) = 'dono')
  with check (public.porcos_meu_papel(grupo_id) = 'dono');

-- ---------------------------------------------------------------------------
-- 5. Tabelas de Dados e Coluna grupo_id

-- Animais do plantel
create table if not exists public.porcos_animais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text not null check (categoria in ('matriz', 'barrao', 'porca', 'porco')),
  nascimento date,
  chegada date,
  aquisicao text not null default 'nascido' check (aquisicao in ('nascido', 'comprado', 'ganhado')),
  negociado_com text not null default '',
  valor_compra numeric(12, 2),
  saida text check (saida in ('venda', 'abate', 'morte')),
  saida_data date,
  valor_venda numeric(12, 2),
  descarte boolean default false,
  descarte_data date,
  foto text,
  obs text not null default '',
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references auth.users (id) on delete set null
);

-- Gestações e crias
create table if not exists public.porcos_gestacoes (
  id uuid primary key default gen_random_uuid(),
  matriz_id uuid not null references public.porcos_animais (id) on delete cascade,
  cruzamento date not null,
  parto date,
  vivos int check (vivos >= 0),
  machos int check (machos >= 0),
  femeas int check (femeas >= 0),
  mortos int check (mortos >= 0),
  capacao date,
  desmame date,
  aborto boolean default false,
  aborto_data date,
  repeticao_cio boolean default false,
  obs text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references auth.users (id) on delete set null
);

-- Produtos e vacinas
create table if not exists public.porcos_produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  intervalo_dias int check (intervalo_dias > 0),
  bula text not null default '' check (bula = '' or (bula ~* '^https?://' and length(bula) <= 2000)),
  bula_arquivo text,
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references auth.users (id) on delete set null
);

-- Aplicações
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

-- Abates
create table if not exists public.porcos_abates (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  animal_id uuid references public.porcos_animais (id) on delete set null,
  itens jsonb not null default '[]'::jsonb check (jsonb_typeof(itens) = 'array'),
  carne_kg numeric(10, 2),
  toucinho_kg numeric(10, 2),
  valor numeric(12, 2),
  obs text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references auth.users (id) on delete set null
);

-- Lançamentos (gastos e receitas)
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

-- Fórmulas de ração
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

-- Documentos e arquivos técnicos (SOS Suínos)
create table if not exists public.porcos_documentos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  nome_arquivo text not null,
  caminho text not null,
  bucket text not null default 'porcos-documentos',
  tamanho bigint default 0,
  tipo_mime text not null default '',
  categoria text not null default 'manual',
  obs text not null default '',
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references auth.users (id) on delete set null
);

-- Adiciona a coluna grupo_id em todas as tabelas de dados se ainda não tiver
alter table public.porcos_animais add column if not exists grupo_id uuid references public.porcos_grupos (id) on delete cascade;
alter table public.porcos_gestacoes add column if not exists grupo_id uuid references public.porcos_grupos (id) on delete cascade;
alter table public.porcos_produtos add column if not exists grupo_id uuid references public.porcos_grupos (id) on delete cascade;
alter table public.porcos_aplicacoes add column if not exists grupo_id uuid references public.porcos_grupos (id) on delete cascade;
alter table public.porcos_abates add column if not exists grupo_id uuid references public.porcos_grupos (id) on delete cascade;
alter table public.porcos_lancamentos add column if not exists grupo_id uuid references public.porcos_grupos (id) on delete cascade;
alter table public.porcos_racoes add column if not exists grupo_id uuid references public.porcos_grupos (id) on delete cascade;
alter table public.porcos_documentos add column if not exists grupo_id uuid references public.porcos_grupos (id) on delete cascade;

-- DNP (Dias Não Produtivos), Descarte e Manejo Reprodutivo
alter table public.porcos_animais add column if not exists descarte boolean default false;
alter table public.porcos_animais add column if not exists descarte_data date;
alter table public.porcos_gestacoes add column if not exists desmame date;
alter table public.porcos_gestacoes add column if not exists aborto boolean default false;
alter table public.porcos_gestacoes add column if not exists aborto_data date;
alter table public.porcos_gestacoes add column if not exists repeticao_cio boolean default false;

-- Índices de grupo
create index if not exists porcos_animais_grupo_idx on public.porcos_animais (grupo_id);
create index if not exists porcos_gestacoes_grupo_idx on public.porcos_gestacoes (grupo_id);
create index if not exists porcos_produtos_grupo_idx on public.porcos_produtos (grupo_id);
create index if not exists porcos_aplicacoes_grupo_idx on public.porcos_aplicacoes (grupo_id);
create index if not exists porcos_abates_grupo_idx on public.porcos_abates (grupo_id);
create index if not exists porcos_lancamentos_grupo_idx on public.porcos_lancamentos (grupo_id);
create index if not exists porcos_racoes_grupo_idx on public.porcos_racoes (grupo_id);
create index if not exists porcos_documentos_grupo_idx on public.porcos_documentos (grupo_id);

-- Na tabela de produtos, o nome era único globalmente; agora é único por grupo
do $$
begin
  alter table public.porcos_produtos drop constraint if exists porcos_produtos_nome_key;
  if not exists (select 1 from pg_constraint where conname = 'porcos_produtos_grupo_nome_key') then
    alter table public.porcos_produtos add constraint porcos_produtos_grupo_nome_key unique (grupo_id, nome);
  end if;
exception when others then
  null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Migração Segura dos Dados Existentes
-- Se já houver dados no banco sem grupo_id, cria um grupo inicial e vincula tudo

do $$
declare
  v_grupo_padrao_id uuid;
begin
  select id into v_grupo_padrao_id from public.porcos_grupos order by criado_em limit 1;

  if v_grupo_padrao_id is null then
    insert into public.porcos_grupos (nome) values ('Meu Grupo') returning id into v_grupo_padrao_id;
  end if;

  -- Se existir a tabela antiga porcos_acesso, migra para porcos_membros
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'porcos_acesso') then
    insert into public.porcos_membros (grupo_id, user_id, email, nome, papel, adicionado_em, ultimo_acesso)
    select v_grupo_padrao_id, u.id, a.email, a.nome, a.papel, a.adicionado_em, a.ultimo_acesso
    from public.porcos_acesso a
    left join auth.users u on lower(u.email) = a.email
    on conflict do nothing;
  end if;

  -- Vincula qualquer registro sem grupo ao grupo inicial
  update public.porcos_animais set grupo_id = v_grupo_padrao_id where grupo_id is null;
  update public.porcos_gestacoes set grupo_id = v_grupo_padrao_id where grupo_id is null;
  update public.porcos_produtos set grupo_id = v_grupo_padrao_id where grupo_id is null;
  update public.porcos_aplicacoes set grupo_id = v_grupo_padrao_id where grupo_id is null;
  update public.porcos_abates set grupo_id = v_grupo_padrao_id where grupo_id is null;
  update public.porcos_lancamentos set grupo_id = v_grupo_padrao_id where grupo_id is null;
  update public.porcos_racoes set grupo_id = v_grupo_padrao_id where grupo_id is null;
  update public.porcos_documentos set grupo_id = v_grupo_padrao_id where grupo_id is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Carimbo e RLS em todas as tabelas de dados

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

do $$
declare
  t text;
begin
  foreach t in array array['porcos_animais', 'porcos_gestacoes', 'porcos_produtos', 'porcos_aplicacoes',
                           'porcos_abates', 'porcos_lancamentos', 'porcos_racoes', 'porcos_documentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    execute format('drop policy if exists "Ver" on public.%I', t);
    execute format('create policy "Ver" on public.%I for select to authenticated using (grupo_id in (select public.porcos_meus_grupos()))', t);

    execute format('drop policy if exists "Criar" on public.%I', t);
    execute format('create policy "Criar" on public.%I for insert to authenticated with check (public.porcos_pode_editar_grupo(grupo_id))', t);

    execute format('drop policy if exists "Alterar" on public.%I', t);
    execute format('create policy "Alterar" on public.%I for update to authenticated using (public.porcos_pode_editar_grupo(grupo_id)) with check (public.porcos_pode_editar_grupo(grupo_id))', t);

    execute format('drop policy if exists "Excluir" on public.%I', t);
    execute format('create policy "Excluir" on public.%I for delete to authenticated using (public.porcos_pode_editar_grupo(grupo_id))', t);

    execute format('drop trigger if exists carimbo on public.%I', t);
    execute format('create trigger carimbo before update on public.%I for each row execute function public.porcos_carimbo()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. RPCs para o Frontend

-- Inicialização do usuário ao entrar:
-- Se não tem nenhum grupo, cria o grupo pessoal e adiciona os produtos e rações padrão
create or replace function public.porcos_inicializar_usuario()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := public.meu_email();
  v_nome text := '';
  v_grupo_id uuid;
  v_grupos jsonb;
begin
  if v_user_id is null then
    raise exception 'Não autenticado';
  end if;

  select coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', '')
  into v_nome
  from auth.users where id = v_user_id;

  -- Se havia convite por e-mail pendente, associa o user_id
  if v_email is not null then
    update public.porcos_membros
    set user_id = v_user_id,
        nome = case when (nome is null or nome = '') and v_nome <> '' then v_nome else nome end
    where email = v_email and user_id is null;
  end if;

  -- Verifica se o usuário já tem pelo menos um grupo
  if not exists (select 1 from public.porcos_meus_grupos()) then
    -- Cria um novo grupo pessoal
    insert into public.porcos_grupos (nome, criado_por)
    values (case when v_nome <> '' then 'Grupo de ' || split_part(v_nome, ' ', 1) else 'Meu Grupo' end, v_user_id)
    returning id into v_grupo_id;

    -- Cadastra o usuário como dono do grupo
    insert into public.porcos_membros (grupo_id, user_id, email, nome, papel)
    values (v_grupo_id, v_user_id, v_email, v_nome, 'dono');

    -- Cria vacinas e remédios padrão para começar
    insert into public.porcos_produtos (grupo_id, nome, intervalo_dias, ordem) values
      (v_grupo_id, 'Ferro', null, 1),
      (v_grupo_id, 'Isocox', null, 2),
      (v_grupo_id, 'Verme', 180, 3),
      (v_grupo_id, 'Suiven', 365, 4),
      (v_grupo_id, 'Megabov', 120, 5)
    on conflict do nothing;

    -- Cria fórmulas de ração padrão
    insert into public.porcos_racoes (grupo_id, fase, faixa, itens, ordem) values
      (v_grupo_id, 'Gestação', 'cobertura ao parto', '[{"nome":"Milho","pct":70},{"nome":"Farelo de soja","pct":25},{"nome":"Núcleo","pct":5}]'::jsonb, 1),
      (v_grupo_id, 'Lactação', 'parto ao desmame', '[{"nome":"Milho","pct":65},{"nome":"Farelo de soja","pct":30},{"nome":"Núcleo","pct":5}]'::jsonb, 2),
      (v_grupo_id, 'Inicial / Creche', 'desmame até 25 kg', '[{"nome":"Milho","pct":60},{"nome":"Farelo de soja","pct":35},{"nome":"Núcleo","pct":5}]'::jsonb, 3),
      (v_grupo_id, 'Crescimento', '25 a 60 kg', '[{"nome":"Milho","pct":68},{"nome":"Farelo de soja","pct":28},{"nome":"Núcleo","pct":4}]'::jsonb, 4),
      (v_grupo_id, 'Terminação', '60 kg ao abate', '[{"nome":"Milho","pct":74},{"nome":"Farelo de soja","pct":22},{"nome":"Núcleo","pct":4}]'::jsonb, 5)
    on conflict do nothing;
  end if;

  -- Atualiza o último acesso
  update public.porcos_membros
  set ultimo_acesso = now()
  where (user_id = v_user_id or (v_email is not null and email = v_email))
    and (ultimo_acesso is null or ultimo_acesso < now() - interval '5 minutes');

  -- Retorna a lista de grupos aos quais o usuário pertence
  select jsonb_agg(
    jsonb_build_object(
      'id', g.id,
      'nome', g.nome,
      'papel', m.papel,
      'criado_em', g.criado_em
    ) order by case when m.papel = 'dono' then 1 when m.papel = 'editor' then 2 else 3 end, g.criado_em
  ) into v_grupos
  from public.porcos_grupos g
  join public.porcos_membros m on m.grupo_id = g.id
  where m.user_id = v_user_id or (v_email is not null and m.email = v_email);

  return coalesce(v_grupos, '[]'::jsonb);
end;
$$;

-- Criar um novo grupo adicional
create or replace function public.porcos_criar_grupo(p_nome text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := public.meu_email();
  v_nome_user text := '';
  v_grupo_id uuid;
begin
  if v_user_id is null then raise exception 'Não autenticado'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Nome do grupo não pode ser vazio'; end if;

  select coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', '')
  into v_nome_user from auth.users where id = v_user_id;

  insert into public.porcos_grupos (nome, criado_por)
  values (trim(p_nome), v_user_id)
  returning id into v_grupo_id;

  insert into public.porcos_membros (grupo_id, user_id, email, nome, papel)
  values (v_grupo_id, v_user_id, v_email, v_nome_user, 'dono');

  -- Produtos e rações padrão
  insert into public.porcos_produtos (grupo_id, nome, intervalo_dias, ordem) values
    (v_grupo_id, 'Ferro', null, 1),
    (v_grupo_id, 'Isocox', null, 2),
    (v_grupo_id, 'Verme', 180, 3),
    (v_grupo_id, 'Suiven', 365, 4),
    (v_grupo_id, 'Megabov', 120, 5)
  on conflict do nothing;

  insert into public.porcos_racoes (grupo_id, fase, faixa, itens, ordem) values
    (v_grupo_id, 'Gestação', 'cobertura ao parto', '[{"nome":"Milho","pct":70},{"nome":"Farelo de soja","pct":25},{"nome":"Núcleo","pct":5}]'::jsonb, 1),
    (v_grupo_id, 'Lactação', 'parto ao desmame', '[{"nome":"Milho","pct":65},{"nome":"Farelo de soja","pct":30},{"nome":"Núcleo","pct":5}]'::jsonb, 2),
    (v_grupo_id, 'Inicial / Creche', 'desmame até 25 kg', '[{"nome":"Milho","pct":60},{"nome":"Farelo de soja","pct":35},{"nome":"Núcleo","pct":5}]'::jsonb, 3),
    (v_grupo_id, 'Crescimento', '25 a 60 kg', '[{"nome":"Milho","pct":68},{"nome":"Farelo de soja","pct":28},{"nome":"Núcleo","pct":4}]'::jsonb, 4),
    (v_grupo_id, 'Terminação', '60 kg ao abate', '[{"nome":"Milho","pct":74},{"nome":"Farelo de soja","pct":22},{"nome":"Núcleo","pct":4}]'::jsonb, 5)
  on conflict do nothing;

  return jsonb_build_object('id', v_grupo_id, 'nome', trim(p_nome), 'papel', 'dono');
end;
$$;

-- Renomear grupo
create or replace function public.porcos_renomear_grupo(p_grupo_id uuid, p_novo_nome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.porcos_meu_papel(p_grupo_id) <> 'dono' then
    raise exception 'Apenas o dono pode renomear o grupo';
  end if;
  update public.porcos_grupos
  set nome = trim(p_novo_nome)
  where id = p_grupo_id;
end;
$$;

-- Gerar código de convite por link
create or replace function public.porcos_gerar_convite(p_grupo_id uuid, p_papel text default 'editor')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_codigo text;
begin
  if public.porcos_meu_papel(p_grupo_id) <> 'dono' then
    raise exception 'Apenas o dono pode gerar convites';
  end if;
  if p_papel not in ('editor', 'leitor') then
    raise exception 'Papel inválido para convite';
  end if;

  v_codigo := lower(substring(md5(random()::text || clock_timestamp()::text) from 1 for 10));

  insert into public.porcos_convites (codigo, grupo_id, papel, criado_por)
  values (v_codigo, p_grupo_id, p_papel, auth.uid());

  return v_codigo;
end;
$$;

-- Listar convites ativos do grupo
create or replace function public.porcos_listar_convites(p_grupo_id uuid)
returns table (codigo text, papel text, criado_em timestamptz, ativo boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.codigo, c.papel, c.criado_em, c.ativo
  from public.porcos_convites c
  where c.grupo_id = p_grupo_id and c.ativo = true
    and public.porcos_meu_papel(p_grupo_id) = 'dono'
  order by c.criado_em desc;
$$;

-- Revogar / desativar convite
create or replace function public.porcos_revogar_convite(p_codigo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grupo_id uuid;
begin
  select grupo_id into v_grupo_id from public.porcos_convites where codigo = p_codigo;
  if v_grupo_id is null or public.porcos_meu_papel(v_grupo_id) <> 'dono' then
    raise exception 'Permissão negada para revogar este convite';
  end if;
  update public.porcos_convites set ativo = false where codigo = p_codigo;
end;
$$;

-- Consultar informações do convite antes de aceitar
create or replace function public.porcos_consultar_convite(p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  select c.codigo, c.papel, c.ativo, g.id as grupo_id, g.nome as grupo_nome
  into v_row
  from public.porcos_convites c
  join public.porcos_grupos g on g.id = c.grupo_id
  where c.codigo = lower(trim(p_codigo)) and c.ativo = true;

  if v_row is null then
    return null;
  end if;

  return jsonb_build_object(
    'codigo', v_row.codigo,
    'grupo_id', v_row.grupo_id,
    'grupo_nome', v_row.grupo_nome,
    'papel', v_row.papel
  );
end;
$$;

-- Aceitar convite por link
create or replace function public.porcos_aceitar_convite(p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_convite record;
  v_user_id uuid := auth.uid();
  v_email text := public.meu_email();
  v_nome text := '';
begin
  if v_user_id is null then raise exception 'Você precisa fazer login para aceitar o convite'; end if;

  select c.codigo, c.grupo_id, c.papel, c.ativo, c.usos_restantes, g.nome as grupo_nome
  into v_convite
  from public.porcos_convites c
  join public.porcos_grupos g on g.id = c.grupo_id
  where c.codigo = lower(trim(p_codigo)) and c.ativo = true;

  if v_convite is null then
    raise exception 'Convite inválido ou expirado';
  end if;

  select coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', '')
  into v_nome from auth.users where id = v_user_id;

  -- Adiciona ou atualiza o membro no grupo
  insert into public.porcos_membros (grupo_id, user_id, email, nome, papel)
  values (v_convite.grupo_id, v_user_id, v_email, v_nome, v_convite.papel)
  on conflict (grupo_id, user_id) do update
  set papel = case when public.porcos_membros.papel = 'dono' then 'dono' else excluded.papel end;

  if v_convite.usos_restantes is not null then
    if v_convite.usos_restantes <= 1 then
      update public.porcos_convites set ativo = false, usos_restantes = 0 where codigo = v_convite.codigo;
    else
      update public.porcos_convites set usos_restantes = usos_restantes - 1 where codigo = v_convite.codigo;
    end if;
  end if;

  return jsonb_build_object(
    'grupo_id', v_convite.grupo_id,
    'grupo_nome', v_convite.grupo_nome,
    'papel', v_convite.papel
  );
end;
$$;

-- Listar membros do grupo
create or replace function public.porcos_listar_membros(p_grupo_id uuid)
returns table (id uuid, email text, papel text, nome text, adicionado_em timestamptz, ultimo_acesso timestamptz, is_current_user boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id,
    m.email,
    m.papel,
    m.nome,
    m.adicionado_em,
    m.ultimo_acesso,
    (m.user_id = auth.uid() or (public.meu_email() is not null and m.email = public.meu_email())) as is_current_user
  from public.porcos_membros m
  where m.grupo_id = p_grupo_id
    and public.porcos_pode_ver_grupo(p_grupo_id)
  order by case when m.papel = 'dono' then 1 when m.papel = 'editor' then 2 else 3 end, m.adicionado_em;
$$;

-- Alterar papel de um membro
create or replace function public.porcos_alterar_papel_membro(p_grupo_id uuid, p_membro_id uuid, p_papel text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.porcos_meu_papel(p_grupo_id) <> 'dono' then
    raise exception 'Apenas o dono pode alterar permissões';
  end if;
  if p_papel not in ('editor', 'leitor') then
    raise exception 'Permissão inválida';
  end if;

  update public.porcos_membros
  set papel = p_papel
  where id = p_membro_id and grupo_id = p_grupo_id and papel <> 'dono';
end;
$$;

-- Remover membro ou sair do grupo
create or replace function public.porcos_remover_membro(p_grupo_id uuid, p_membro_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membro record;
  v_sou_dono boolean;
begin
  v_sou_dono := (public.porcos_meu_papel(p_grupo_id) = 'dono');

  select * into v_membro from public.porcos_membros where id = p_membro_id and grupo_id = p_grupo_id;
  if v_membro is null then return; end if;

  -- Se for o dono do grupo tentando ser removido: não permite se for o único dono
  if v_membro.papel = 'dono' then
    raise exception 'O dono do grupo não pode ser removido';
  end if;

  -- Só o dono ou a própria pessoa saindo pode remover
  if not v_sou_dono and v_membro.user_id <> auth.uid() and v_membro.email <> public.meu_email() then
    raise exception 'Permissão negada para remover este membro';
  end if;

  delete from public.porcos_membros where id = p_membro_id;
end;
$$;

-- Conceder permissões de execução
revoke all on function
  public.porcos_inicializar_usuario(),
  public.porcos_criar_grupo(text),
  public.porcos_renomear_grupo(uuid, text),
  public.porcos_gerar_convite(uuid, text),
  public.porcos_listar_convites(uuid),
  public.porcos_revogar_convite(text),
  public.porcos_consultar_convite(text),
  public.porcos_aceitar_convite(text),
  public.porcos_listar_membros(uuid),
  public.porcos_alterar_papel_membro(uuid, uuid, text),
  public.porcos_remover_membro(uuid, uuid)
from anon, public;

grant execute on function
  public.porcos_inicializar_usuario(),
  public.porcos_criar_grupo(text),
  public.porcos_renomear_grupo(uuid, text),
  public.porcos_gerar_convite(uuid, text),
  public.porcos_listar_convites(uuid),
  public.porcos_revogar_convite(text),
  public.porcos_consultar_convite(text),
  public.porcos_aceitar_convite(text),
  public.porcos_listar_membros(uuid),
  public.porcos_alterar_papel_membro(uuid, uuid, text),
  public.porcos_remover_membro(uuid, uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Storage (fotos e bulas)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('porcos-fotos', 'porcos-fotos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Porcos: ver fotos" on storage.objects;
create policy "Porcos: ver fotos" on storage.objects
  for select to authenticated
  using (bucket_id = 'porcos-fotos' and exists (select 1 from public.porcos_meus_grupos()));

drop policy if exists "Porcos: enviar fotos" on storage.objects;
create policy "Porcos: enviar fotos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'porcos-fotos' and exists (select 1 from public.porcos_meus_grupos()));

drop policy if exists "Porcos: trocar fotos" on storage.objects;
create policy "Porcos: trocar fotos" on storage.objects
  for update to authenticated
  using (bucket_id = 'porcos-fotos' and exists (select 1 from public.porcos_meus_grupos()))
  with check (bucket_id = 'porcos-fotos' and exists (select 1 from public.porcos_meus_grupos()));

drop policy if exists "Porcos: apagar fotos" on storage.objects;
create policy "Porcos: apagar fotos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'porcos-fotos' and exists (select 1 from public.porcos_meus_grupos()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('porcos-bulas', 'porcos-bulas', false, 20971520, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Porcos: ver bulas" on storage.objects;
create policy "Porcos: ver bulas" on storage.objects
  for select to authenticated
  using (bucket_id = 'porcos-bulas' and exists (select 1 from public.porcos_meus_grupos()));

drop policy if exists "Porcos: enviar bulas" on storage.objects;
create policy "Porcos: enviar bulas" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'porcos-bulas' and exists (select 1 from public.porcos_meus_grupos()));

drop policy if exists "Porcos: trocar bulas" on storage.objects;
create policy "Porcos: trocar bulas" on storage.objects
  for update to authenticated
  using (bucket_id = 'porcos-bulas' and exists (select 1 from public.porcos_meus_grupos()))
  with check (bucket_id = 'porcos-bulas' and exists (select 1 from public.porcos_meus_grupos()));

drop policy if exists "Porcos: apagar bulas" on storage.objects;
create policy "Porcos: apagar bulas" on storage.objects
  for delete to authenticated
  using (bucket_id = 'porcos-bulas' and exists (select 1 from public.porcos_meus_grupos()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('porcos-documentos', 'porcos-documentos', false, 52428800, null)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Porcos: ver documentos" on storage.objects;
create policy "Porcos: ver documentos" on storage.objects
  for select to authenticated
  using (bucket_id = 'porcos-documentos' and exists (select 1 from public.porcos_meus_grupos()));

drop policy if exists "Porcos: enviar documentos" on storage.objects;
create policy "Porcos: enviar documentos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'porcos-documentos' and exists (select 1 from public.porcos_meus_grupos()));

drop policy if exists "Porcos: trocar documentos" on storage.objects;
create policy "Porcos: trocar documentos" on storage.objects
  for update to authenticated
  using (bucket_id = 'porcos-documentos' and exists (select 1 from public.porcos_meus_grupos()))
  with check (bucket_id = 'porcos-documentos' and exists (select 1 from public.porcos_meus_grupos()));

drop policy if exists "Porcos: apagar documentos" on storage.objects;
create policy "Porcos: apagar documentos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'porcos-documentos' and exists (select 1 from public.porcos_meus_grupos()));
