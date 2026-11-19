-- =====================================================================
-- Migração 09 — Área do Cliente e Painel M.A Joaquim (site representacaorj.com)
--
-- Convive no mesmo projeto Supabase do Portal Comercial sem interferência:
--   • Todas as tabelas novas usam prefixo `site_*`.
--   • Nenhuma tabela do Portal Comercial (catalogo, clientes, visitas,
--     representantes, cotacoes) tem suas políticas afrouxadas.
--   • Clientes do site autenticam no auth.users, NÃO entram em
--     `public.representantes`, logo veem 0 linhas do Portal Comercial.
--   • Representantes ativos (`public.eh_representante_ativo()`) enxergam
--     e gerenciam todas as solicitações vindas do site no `/painel/`.
--
-- Rode no SQL Editor do Supabase DEPOIS de 01-schema.sql, 02-rls.sql e
-- 03-cnpj-e-cotacoes.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EMPRESAS DO SITE (Ficha Cadastral completa — Cadastro Modelo M A JOAQUIM.xlsx)
-- ---------------------------------------------------------------------
create table if not exists public.site_empresas (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null unique check (cnpj ~ '^\d{14}$'),
  razao_social text not null,
  nome_fantasia text,
  inscricao_estadual text,
  tributacao text check (tributacao in ('lucro_real', 'lucro_presumido', 'simples_nacional')),

  cep text,
  endereco text,
  numero text,
  complemento text,
  caixa_postal text,
  bairro text,
  cidade text,
  uf text default 'RJ',

  telefone_fixo_1 text,
  telefone_fixo_2 text,
  fax text,
  celular_whatsapp text,

  email_geral text,
  email_compras text,
  email_financas text,
  email_xml_nfe text,
  site text,

  contato_comercial text,
  contato_financeiro text,

  forma_pagamento_diferenciada text default 'NÃO',
  suframa_identificacao text,
  suframa_inscricao text,
  suframa_validade date,
  observacoes_cadastro text,

  representante text not null default 'M A JOAQUIM REPRESENTAÇÃO.',
  nivel_cadastro integer not null default 1 check (nivel_cadastro in (1, 2)),
  aceite_lgpd_em timestamptz not null default now(),

  -- Cruzamento automático por CNPJ com a carteira do Portal Comercial
  cliente_carteira_id uuid references public.clientes(id) on delete set null,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists site_empresas_cnpj_idx on public.site_empresas (cnpj);
create index if not exists site_empresas_carteira_idx on public.site_empresas (cliente_carteira_id);

-- ---------------------------------------------------------------------
-- 2. DADOS BANCÁRIOS (Tabela isolada por LGPD — mesma ficha oficial)
-- ---------------------------------------------------------------------
create table if not exists public.site_empresas_bancario (
  empresa_id uuid primary key references public.site_empresas(id) on delete cascade,
  banco_nome text,
  banco_numero text,
  agencia text,
  conta text,
  titular_cnpj text,
  titular_cpf text,
  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. MEMBROS DA EMPRESA (Multi-usuário por loja + Multi-CNPJ por login)
-- ---------------------------------------------------------------------
create table if not exists public.site_empresa_membros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.site_empresas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text,
  email text,
  cargo text,
  papel text not null default 'titular' check (papel in ('titular', 'comprador', 'financeiro')),
  criado_em timestamptz not null default now(),
  unique (empresa_id, user_id)
);

create index if not exists site_membros_user_idx on public.site_empresa_membros (user_id);
create index if not exists site_membros_empresa_idx on public.site_empresa_membros (empresa_id);

-- ---------------------------------------------------------------------
-- 4. SEMÁFORO DE CADASTRO NAS 4 FÁBRICAS
-- ---------------------------------------------------------------------
create table if not exists public.site_cadastros_fabrica (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.site_empresas(id) on delete cascade,
  marca_slug text not null check (marca_slug in ('suryha', 'sibb', 'coel', 'perfiltec')),
  status text not null default 'nao_solicitado'
    check (status in ('nao_solicitado', 'pendente_envio', 'em_analise', 'aprovado', 'pendencia_documento')),
  codigo_cliente_fabrica text,
  condicao_comercial text,
  observacao_representante text,
  solicitado_em timestamptz,
  aprovado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, marca_slug)
);

create index if not exists site_cadastros_empresa_idx on public.site_cadastros_fabrica (empresa_id);

-- ---------------------------------------------------------------------
-- 5. COTAÇÕES DO SITE E ITENS (Multi-fábrica)
-- ---------------------------------------------------------------------
create table if not exists public.site_cotacoes (
  id text primary key,
  numero text unique,
  empresa_id uuid not null references public.site_empresas(id) on delete cascade,
  autor_id uuid references auth.users(id) on delete set null,
  status text not null default 'enviada'
    check (status in ('rascunho', 'enviada', 'em_atendimento', 'respondida', 'fechou_pedido', 'nao_fechou')),
  motivo_nao_fechou text,
  observacoes_gerais text,
  observacoes_por_marca jsonb not null default '{}'::jsonb,
  anexos_meta jsonb not null default '[]'::jsonb,
  resposta_representante text,
  canal text default 'site_whatsapp',
  criada_em timestamptz not null default now(),
  respondida_em timestamptz,
  atualizada_em timestamptz not null default now()
);

create index if not exists site_cotacoes_empresa_idx on public.site_cotacoes (empresa_id, criada_em desc);
create index if not exists site_cotacoes_status_idx on public.site_cotacoes (status, criada_em desc);

create table if not exists public.site_cotacao_itens (
  id uuid primary key default gen_random_uuid(),
  cotacao_id text not null references public.site_cotacoes(id) on delete cascade,
  marca_slug text not null,
  marca_nome text not null,
  codigo text,
  nome text not null,
  secao text,
  quantidade integer not null check (quantidade > 0),
  observacao_item text
);

create index if not exists site_cotacao_itens_cotacao_idx on public.site_cotacao_itens (cotacao_id);

-- ---------------------------------------------------------------------
-- 6. KITS DE REPOSIÇÃO RÁPIDA (Listas de giro salvas pela loja)
-- ---------------------------------------------------------------------
create table if not exists public.site_kits_reposicao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.site_empresas(id) on delete cascade,
  nome text not null,
  descricao text,
  itens jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists site_kits_empresa_idx on public.site_kits_reposicao (empresa_id);

-- ---------------------------------------------------------------------
-- 7. SOLICITAÇÕES DE VISITA PRESENCIAL
-- ---------------------------------------------------------------------
create table if not exists public.site_solicitacoes_visita (
  id text primary key,
  empresa_id uuid not null references public.site_empresas(id) on delete cascade,
  autor_id uuid references auth.users(id) on delete set null,
  objetivo text not null check (objetivo in (
    'lancamentos_amostras', 'negociacao_volume', 'treinamento_balcao', 'pos_venda_garantia', 'outro'
  )),
  data_preferida date,
  turno text not null default 'qualquer' check (turno in ('manha', 'tarde', 'qualquer')),
  representante_preferido text default 'qualquer',
  corredor_sugerido text,
  observacoes text,
  status text not null default 'solicitada'
    check (status in ('solicitada', 'confirmada', 'realizada', 'remarcada', 'cancelada')),
  data_confirmada date,
  hora_confirmada time,
  resposta_representante text,
  visita_portal_id text references public.visitas(id) on delete set null,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

create index if not exists site_visitas_empresa_idx on public.site_solicitacoes_visita (empresa_id, criada_em desc);
create index if not exists site_visitas_status_idx on public.site_solicitacoes_visita (status, criada_em desc);

-- ---------------------------------------------------------------------
-- 8. CENTRAL PÓS-VENDA (2ª Via de Boleto, XML NF-e, Rastreio e Garantia)
-- ---------------------------------------------------------------------
create table if not exists public.site_chamados_pos_venda (
  id text primary key,
  empresa_id uuid not null references public.site_empresas(id) on delete cascade,
  autor_id uuid references auth.users(id) on delete set null,
  marca_slug text not null check (marca_slug in ('suryha', 'sibb', 'coel', 'perfiltec')),
  tipo text not null check (tipo in (
    'segunda_via_boleto', 'xml_nfe', 'rastreio_entrega', 'garantia_avaria', 'outro'
  )),
  numero_nf_ou_pedido text,
  descricao text not null,
  status text not null default 'aberto' check (status in ('aberto', 'em_andamento', 'resolvido')),
  resposta_representante text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists site_chamados_empresa_idx on public.site_chamados_pos_venda (empresa_id, criado_em desc);
create index if not exists site_chamados_status_idx on public.site_chamados_pos_venda (status, criado_em desc);

-- ---------------------------------------------------------------------
-- 9. EVENTOS DE BUSCA NO CATÁLOGO (Demandas não atendidas)
-- ---------------------------------------------------------------------
create table if not exists public.site_eventos_busca (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.site_empresas(id) on delete set null,
  termo text not null,
  marca_slug text,
  resultados integer not null default 0,
  criado_em timestamptz not null default now()
);

create index if not exists site_eventos_busca_criado_idx on public.site_eventos_busca (criado_em desc);

-- =====================================================================
-- TRIGGERS DE DATA E INTEGRAÇÃO COM A CARTEIRA DO PORTAL COMERCIAL
-- =====================================================================
create or replace function public.tocar_atualizada_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizada_em = now();
  return new;
end;
$$;

create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizada_em = now();
  return new;
end;
$$;

drop trigger if exists site_empresas_atualizado on public.site_empresas;
create trigger site_empresas_atualizado before update on public.site_empresas
  for each row execute function public.tocar_atualizado_em();

drop trigger if exists site_empresas_bancario_atualizado on public.site_empresas_bancario;
create trigger site_empresas_bancario_atualizado before update on public.site_empresas_bancario
  for each row execute function public.tocar_atualizado_em();

drop trigger if exists site_cadastros_fabrica_atualizado on public.site_cadastros_fabrica;
create trigger site_cadastros_fabrica_atualizado before update on public.site_cadastros_fabrica
  for each row execute function public.tocar_atualizado_em();

drop trigger if exists site_kits_atualizado on public.site_kits_reposicao;
create trigger site_kits_atualizado before update on public.site_kits_reposicao
  for each row execute function public.tocar_atualizado_em();

drop trigger if exists site_chamados_atualizado on public.site_chamados_pos_venda;
create trigger site_chamados_atualizado before update on public.site_chamados_pos_venda
  for each row execute function public.tocar_atualizado_em();

drop trigger if exists site_cotacoes_atualizada on public.site_cotacoes;
create trigger site_cotacoes_atualizada before update on public.site_cotacoes
  for each row execute function public.tocar_atualizada_em();

drop trigger if exists site_visitas_atualizada on public.site_solicitacoes_visita;
create trigger site_visitas_atualizada before update on public.site_solicitacoes_visita
  for each row execute function public.tocar_atualizada_em();

-- Limpa pontuação do CNPJ e cruza automaticamente com public.clientes
create or replace function public.vincular_site_empresa_carteira()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
begin
  new.cnpj := regexp_replace(coalesce(new.cnpj, ''), '\D', '', 'g');

  select c.id
    into v_cliente_id
    from public.clientes c
   where regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g') = new.cnpj
   order by case c.origem when 'ativo' then 1 when 'recuperacao' then 2 else 3 end
   limit 1;

  if v_cliente_id is not null then
    new.cliente_carteira_id := v_cliente_id;
  end if;

  return new;
end;
$$;

drop trigger if exists site_empresas_vincular_carteira on public.site_empresas;
create trigger site_empresas_vincular_carteira
  before insert or update of cnpj on public.site_empresas
  for each row execute function public.vincular_site_empresa_carteira();

-- Inicializa automaticamente os 4 status de fábrica ao cadastrar uma loja
create or replace function public.inicializar_fabricas_site_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.site_cadastros_fabrica (empresa_id, marca_slug)
  values
    (new.id, 'suryha'),
    (new.id, 'sibb'),
    (new.id, 'coel'),
    (new.id, 'perfiltec')
  on conflict (empresa_id, marca_slug) do nothing;
  return new;
end;
$$;

drop trigger if exists site_empresas_init_fabricas on public.site_empresas;
create trigger site_empresas_init_fabricas
  after insert on public.site_empresas
  for each row execute function public.inicializar_fabricas_site_empresa();

-- =====================================================================
-- FUNÇÕES DE AUTORIZAÇÃO E RPCs SEGURAS
-- =====================================================================
create or replace function public.minhas_empresas_site()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.empresa_id
    from public.site_empresa_membros m
   where m.user_id = auth.uid();
$$;

create or replace function public.eh_titular_empresa_site(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.site_empresa_membros m
     where m.empresa_id = p_empresa_id
       and m.user_id = auth.uid()
       and m.papel = 'titular'
  );
$$;

-- Cadastro Nível 1 seguro: evita sequestro de CNPJ já pertencente a outro usuário
create or replace function public.cadastrar_empresa_site(
  p_cnpj text,
  p_razao_social text,
  p_nome_fantasia text default null,
  p_cep text default null,
  p_endereco text default null,
  p_numero text default null,
  p_complemento text default null,
  p_bairro text default null,
  p_cidade text default null,
  p_uf text default 'RJ',
  p_telefone_fixo_1 text default null,
  p_celular_whatsapp text default null,
  p_email_geral text default null,
  p_email_compras text default null,
  p_contato_comercial text default null,
  p_cargo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  v_empresa_id uuid;
  v_ja_membro boolean := false;
  v_email_user text;
begin
  if v_uid is null then
    raise exception 'Autenticação obrigatória para cadastrar empresa.';
  end if;
  if length(v_cnpj) <> 14 then
    raise exception 'CNPJ inválido: informe 14 dígitos.';
  end if;
  if nullif(trim(coalesce(p_razao_social, '')), '') is null then
    raise exception 'Razão social obrigatória.';
  end if;

  select u.email into v_email_user from auth.users u where u.id = v_uid;

  select id into v_empresa_id from public.site_empresas where cnpj = v_cnpj;

  if v_empresa_id is not null then
    select exists (
      select 1 from public.site_empresa_membros
       where empresa_id = v_empresa_id and user_id = v_uid
    ) into v_ja_membro;

    if v_ja_membro then
      return jsonb_build_object(
        'empresa_id', v_empresa_id,
        'ja_existia', true,
        'vinculado', true
      );
    end if;

    return jsonb_build_object(
      'empresa_id', null,
      'ja_existia', true,
      'vinculado', false,
      'precisa_autorizacao', true
    );
  end if;

  insert into public.site_empresas (
    cnpj, razao_social, nome_fantasia, cep, endereco, numero, complemento,
    bairro, cidade, uf, telefone_fixo_1, celular_whatsapp,
    email_geral, email_compras, contato_comercial, nivel_cadastro
  ) values (
    v_cnpj,
    trim(p_razao_social),
    nullif(trim(coalesce(p_nome_fantasia, '')), ''),
    nullif(trim(coalesce(p_cep, '')), ''),
    nullif(trim(coalesce(p_endereco, '')), ''),
    nullif(trim(coalesce(p_numero, '')), ''),
    nullif(trim(coalesce(p_complemento, '')), ''),
    nullif(trim(coalesce(p_bairro, '')), ''),
    nullif(trim(coalesce(p_cidade, '')), ''),
    coalesce(nullif(upper(trim(coalesce(p_uf, ''))), ''), 'RJ'),
    nullif(trim(coalesce(p_telefone_fixo_1, '')), ''),
    nullif(trim(coalesce(p_celular_whatsapp, '')), ''),
    coalesce(nullif(lower(trim(coalesce(p_email_geral, ''))), ''), v_email_user),
    coalesce(nullif(lower(trim(coalesce(p_email_compras, ''))), ''), v_email_user),
    nullif(trim(coalesce(p_contato_comercial, '')), ''),
    1
  )
  returning id into v_empresa_id;

  insert into public.site_empresa_membros (empresa_id, user_id, nome, email, cargo, papel)
  values (
    v_empresa_id,
    v_uid,
    nullif(trim(coalesce(p_contato_comercial, '')), ''),
    v_email_user,
    nullif(trim(coalesce(p_cargo, '')), ''),
    'titular'
  );

  return jsonb_build_object(
    'empresa_id', v_empresa_id,
    'ja_existia', false,
    'vinculado', true
  );
end;
$$;

-- Permite ao cliente solicitar abertura de cadastro numa fábrica sem poder auto-aprovar
create or replace function public.solicitar_cadastro_fabrica_site(
  p_empresa_id uuid,
  p_marca_slug text
)
returns public.site_cadastros_fabrica
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.site_cadastros_fabrica;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.';
  end if;
  if not (p_empresa_id in (select public.minhas_empresas_site()) or public.eh_representante_ativo()) then
    raise exception 'Sem permissão para esta empresa.';
  end if;
  if p_marca_slug not in ('suryha', 'sibb', 'coel', 'perfiltec') then
    raise exception 'Fábrica inválida.';
  end if;

  insert into public.site_cadastros_fabrica (empresa_id, marca_slug, status, solicitado_em)
  values (p_empresa_id, p_marca_slug, 'pendente_envio', now())
  on conflict (empresa_id, marca_slug) do update
    set status = case
                   when public.site_cadastros_fabrica.status in ('nao_solicitado', 'pendencia_documento')
                     then 'pendente_envio'
                   else public.site_cadastros_fabrica.status
                 end,
        solicitado_em = coalesce(public.site_cadastros_fabrica.solicitado_em, now())
  returning * into v_row;

  return v_row;
end;
$$;

-- =====================================================================
-- ROW LEVEL SECURITY (RLS) — FRONTEIRA ABSOLUTA DE SEGURANÇA
-- =====================================================================
alter table public.site_empresas            enable row level security;
alter table public.site_empresas_bancario   enable row level security;
alter table public.site_empresa_membros     enable row level security;
alter table public.site_cadastros_fabrica   enable row level security;
alter table public.site_cotacoes            enable row level security;
alter table public.site_cotacao_itens       enable row level security;
alter table public.site_kits_reposicao      enable row level security;
alter table public.site_solicitacoes_visita enable row level security;
alter table public.site_chamados_pos_venda  enable row level security;
alter table public.site_eventos_busca       enable row level security;

-- 1. site_empresas
drop policy if exists "site_empresas: leitura" on public.site_empresas;
create policy "site_empresas: leitura"
  on public.site_empresas for select to authenticated
  using (id in (select public.minhas_empresas_site()) or public.eh_representante_ativo());

drop policy if exists "site_empresas: edicao" on public.site_empresas;
create policy "site_empresas: edicao"
  on public.site_empresas for update to authenticated
  using      (id in (select public.minhas_empresas_site()) or public.eh_representante_ativo())
  with check (id in (select public.minhas_empresas_site()) or public.eh_representante_ativo());

drop policy if exists "site_empresas: representante insere" on public.site_empresas;
create policy "site_empresas: representante insere"
  on public.site_empresas for insert to authenticated
  with check (public.eh_representante_ativo());

-- 2. site_empresas_bancario (somente membros titular/financeiro ou representantes ativos)
drop policy if exists "site_bancario: acesso restrito" on public.site_empresas_bancario;
create policy "site_bancario: acesso restrito"
  on public.site_empresas_bancario for all to authenticated
  using (
    public.eh_representante_ativo()
    or exists (
      select 1 from public.site_empresa_membros m
       where m.empresa_id = site_empresas_bancario.empresa_id
         and m.user_id = auth.uid()
         and m.papel in ('titular', 'financeiro')
    )
  )
  with check (
    public.eh_representante_ativo()
    or exists (
      select 1 from public.site_empresa_membros m
       where m.empresa_id = site_empresas_bancario.empresa_id
         and m.user_id = auth.uid()
         and m.papel in ('titular', 'financeiro')
    )
  );

-- 3. site_empresa_membros
drop policy if exists "site_membros: leitura" on public.site_empresa_membros;
create policy "site_membros: leitura"
  on public.site_empresa_membros for select to authenticated
  using (
    user_id = auth.uid()
    or empresa_id in (select public.minhas_empresas_site())
    or public.eh_representante_ativo()
  );

drop policy if exists "site_membros: gestao por titular ou rep" on public.site_empresa_membros;
create policy "site_membros: gestao por titular ou rep"
  on public.site_empresa_membros for all to authenticated
  using (
    public.eh_representante_ativo()
    or public.eh_titular_empresa_site(empresa_id)
  )
  with check (
    public.eh_representante_ativo()
    or public.eh_titular_empresa_site(empresa_id)
  );

-- 4. site_cadastros_fabrica
drop policy if exists "site_fabricas: leitura" on public.site_cadastros_fabrica;
create policy "site_fabricas: leitura"
  on public.site_cadastros_fabrica for select to authenticated
  using (
    empresa_id in (select public.minhas_empresas_site())
    or public.eh_representante_ativo()
  );

drop policy if exists "site_fabricas: representante gerencia" on public.site_cadastros_fabrica;
create policy "site_fabricas: representante gerencia"
  on public.site_cadastros_fabrica for all to authenticated
  using (public.eh_representante_ativo())
  with check (public.eh_representante_ativo());

-- 5. site_cotacoes
drop policy if exists "site_cotacoes: leitura" on public.site_cotacoes;
create policy "site_cotacoes: leitura"
  on public.site_cotacoes for select to authenticated
  using (
    empresa_id in (select public.minhas_empresas_site())
    or public.eh_representante_ativo()
  );

drop policy if exists "site_cotacoes: criacao" on public.site_cotacoes;
create policy "site_cotacoes: criacao"
  on public.site_cotacoes for insert to authenticated
  with check (
    empresa_id in (select public.minhas_empresas_site())
    or public.eh_representante_ativo()
  );

drop policy if exists "site_cotacoes: atualizacao" on public.site_cotacoes;
create policy "site_cotacoes: atualizacao"
  on public.site_cotacoes for update to authenticated
  using (
    public.eh_representante_ativo()
    or (empresa_id in (select public.minhas_empresas_site()) and status in ('rascunho', 'enviada'))
  )
  with check (
    public.eh_representante_ativo()
    or (empresa_id in (select public.minhas_empresas_site()) and status in ('rascunho', 'enviada'))
  );

-- 6. site_cotacao_itens
drop policy if exists "site_cotacao_itens: leitura" on public.site_cotacao_itens;
create policy "site_cotacao_itens: leitura"
  on public.site_cotacao_itens for select to authenticated
  using (
    public.eh_representante_ativo()
    or exists (
      select 1 from public.site_cotacoes c
       where c.id = site_cotacao_itens.cotacao_id
         and c.empresa_id in (select public.minhas_empresas_site())
    )
  );

drop policy if exists "site_cotacao_itens: escrita" on public.site_cotacao_itens;
create policy "site_cotacao_itens: escrita"
  on public.site_cotacao_itens for all to authenticated
  using (
    public.eh_representante_ativo()
    or exists (
      select 1 from public.site_cotacoes c
       where c.id = site_cotacao_itens.cotacao_id
         and c.empresa_id in (select public.minhas_empresas_site())
         and c.status in ('rascunho', 'enviada')
    )
  )
  with check (
    public.eh_representante_ativo()
    or exists (
      select 1 from public.site_cotacoes c
       where c.id = site_cotacao_itens.cotacao_id
         and c.empresa_id in (select public.minhas_empresas_site())
         and c.status in ('rascunho', 'enviada')
    )
  );

-- 7. site_kits_reposicao
drop policy if exists "site_kits: da empresa ou rep" on public.site_kits_reposicao;
create policy "site_kits: da empresa ou rep"
  on public.site_kits_reposicao for all to authenticated
  using (
    empresa_id in (select public.minhas_empresas_site())
    or public.eh_representante_ativo()
  )
  with check (
    empresa_id in (select public.minhas_empresas_site())
    or public.eh_representante_ativo()
  );

-- 8. site_solicitacoes_visita
drop policy if exists "site_visitas: leitura" on public.site_solicitacoes_visita;
create policy "site_visitas: leitura"
  on public.site_solicitacoes_visita for select to authenticated
  using (
    empresa_id in (select public.minhas_empresas_site())
    or public.eh_representante_ativo()
  );

drop policy if exists "site_visitas: criacao" on public.site_solicitacoes_visita;
create policy "site_visitas: criacao"
  on public.site_solicitacoes_visita for insert to authenticated
  with check (
    empresa_id in (select public.minhas_empresas_site())
    or public.eh_representante_ativo()
  );

drop policy if exists "site_visitas: atualizacao" on public.site_solicitacoes_visita;
create policy "site_visitas: atualizacao"
  on public.site_solicitacoes_visita for update to authenticated
  using (
    public.eh_representante_ativo()
    or (empresa_id in (select public.minhas_empresas_site()) and status = 'solicitada')
  )
  with check (
    public.eh_representante_ativo()
    or (empresa_id in (select public.minhas_empresas_site()) and status in ('solicitada', 'cancelada'))
  );

-- 9. site_chamados_pos_venda
drop policy if exists "site_chamados: leitura" on public.site_chamados_pos_venda;
create policy "site_chamados: leitura"
  on public.site_chamados_pos_venda for select to authenticated
  using (
    empresa_id in (select public.minhas_empresas_site())
    or public.eh_representante_ativo()
  );

drop policy if exists "site_chamados: criacao" on public.site_chamados_pos_venda;
create policy "site_chamados: criacao"
  on public.site_chamados_pos_venda for insert to authenticated
  with check (
    empresa_id in (select public.minhas_empresas_site())
    or public.eh_representante_ativo()
  );

drop policy if exists "site_chamados: atualizacao" on public.site_chamados_pos_venda;
create policy "site_chamados: atualizacao"
  on public.site_chamados_pos_venda for update to authenticated
  using (
    public.eh_representante_ativo()
    or (empresa_id in (select public.minhas_empresas_site()) and status = 'aberto')
  )
  with check (
    public.eh_representante_ativo()
    or (empresa_id in (select public.minhas_empresas_site()) and status = 'aberto')
  );

-- 10. site_eventos_busca (coleta anônima de buscas sem resultado; leitura restrita a reps)
drop policy if exists "site_eventos_busca: registrar" on public.site_eventos_busca;
create policy "site_eventos_busca: registrar"
  on public.site_eventos_busca for insert to anon, authenticated
  with check (
    empresa_id is null
    or empresa_id in (select public.minhas_empresas_site())
  );

drop policy if exists "site_eventos_busca: leitura rep" on public.site_eventos_busca;
create policy "site_eventos_busca: leitura rep"
  on public.site_eventos_busca for select to authenticated
  using (public.eh_representante_ativo());

-- =====================================================================
-- VIEW DE CRUZAMENTO COM A CARTEIRA DO PORTAL COMERCIAL
-- =====================================================================
create or replace view public.site_empresas_resumo_carteira
with (security_invoker = on) as
select
  se.id as empresa_id,
  se.cnpj,
  se.razao_social,
  se.nome_fantasia,
  se.cidade,
  se.uf,
  se.nivel_cadastro,
  se.cliente_carteira_id,
  c.codigo as codigo_sigma_carteira,
  c.origem as carteira_origem,
  c.status as carteira_status,
  c.ultima_visita as carteira_ultima_visita,
  (select count(*) from public.site_cotacoes sc where sc.empresa_id = se.id) as total_cotacoes_site,
  (select max(sc.criada_em) from public.site_cotacoes sc where sc.empresa_id = se.id) as ultima_cotacao_site
from public.site_empresas se
left join public.clientes c on c.id = se.cliente_carteira_id;

-- =====================================================================
-- CONFERÊNCIA RÁPIDA DE RLS
-- =====================================================================
select schemaname, tablename, rowsecurity
  from pg_tables
 where schemaname = 'public'
   and tablename like 'site_%'
 order by tablename;
