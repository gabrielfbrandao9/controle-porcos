/*
 * Nuvem (Supabase): login com Google, leitura e gravação das tabelas "porcos_*",
 * fotos dos animais (bucket "porcos-fotos") e arquivos das bulas (bucket "porcos-bulas").
 * Quem pode ver ou editar é decidido no banco (tabela porcos_acesso + RLS):
 * o site só esconde os botões de quem não pode editar.
 */
(function (global) {
  'use strict';

  const cfg = global.APP_CONFIG || {};
  const client = global.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  const BUCKET = 'porcos-fotos';
  const BULAS = 'porcos-bulas';
  const TABLES = {
    animais: 'porcos_animais',
    gestacoes: 'porcos_gestacoes',
    produtos: 'porcos_produtos',
    aplicacoes: 'porcos_aplicacoes',
    abates: 'porcos_abates',
    lancamentos: 'porcos_lancamentos',
    racoes: 'porcos_racoes',
  };
  const PAGE = 1000;

  const redirectTo = () => global.location.origin + global.location.pathname;

  function check(res) {
    if (res.error) throw res.error;
    return res.data;
  }

  async function selectAll(table) {
    const all = [];
    for (let from = 0; ; from += PAGE) {
      const rows = check(await client.from(table).select('*').order('id').range(from, from + PAGE - 1));
      all.push(...rows);
      if (rows.length < PAGE) return all;
    }
  }

  const Cloud = {
    TABLES,

    onAuthChange(cb) {
      client.auth.onAuthStateChange((event, session) => cb(session ? session.user : null, event));
    },

    async signInWithGoogle() {
      check(await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } }));
    },

    async signOut() {
      check(await client.auth.signOut());
    },

    // 'dono', 'editor', 'leitor' ou null (sem acesso)
    async papel() {
      return check(await client.rpc('porcos_papel'));
    },

    // Todos os dados: { animais: [...], gestacoes: [...], ... }
    async loadAll() {
      const keys = Object.keys(TABLES);
      const lists = await Promise.all(keys.map((k) => selectAll(TABLES[k])));
      return Object.fromEntries(keys.map((k, i) => [k, lists[i]]));
    },

    async insert(kind, rows) {
      return check(await client.from(TABLES[kind]).insert(rows).select());
    },

    async update(kind, id, patch) {
      return check(await client.from(TABLES[kind]).update(patch).eq('id', id).select().single());
    },

    async remove(kind, id) {
      check(await client.from(TABLES[kind]).delete().eq('id', id));
    },

    // ---------- Acesso (só o dono altera) ----------

    // Com último acesso ao site e último login Google (a função só devolve algo para o dono)
    async acessos() {
      return check(await client.rpc('porcos_acessos'));
    },

    // Marca que quem está usando abriu o site agora
    async registrarAcesso() {
      check(await client.rpc('porcos_registrar_acesso'));
    },

    async addAcesso(row) {
      return check(await client.from('porcos_acesso').insert(row).select().single());
    },

    async updateAcesso(email, patch) {
      return check(await client.from('porcos_acesso').update(patch).eq('email', email).select().single());
    },

    async removeAcesso(email) {
      check(await client.from('porcos_acesso').delete().eq('email', email));
    },

    // ---------- Fotos ----------

    async uploadFoto(path, blob) {
      check(await client.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true }));
    },

    async removeFotos(paths) {
      if (paths.length) check(await client.storage.from(BUCKET).remove(paths));
    },

    // { caminho: url temporária }
    async fotoUrls(paths) {
      if (!paths.length) return {};
      const rows = check(await client.storage.from(BUCKET).createSignedUrls(paths, 6 * 3600));
      return Object.fromEntries(rows.filter((r) => r.signedUrl).map((r) => [r.path, r.signedUrl]));
    },

    // ---------- Bulas enviadas como arquivo ----------

    async uploadBula(path, file) {
      check(await client.storage.from(BULAS).upload(path, file, { contentType: file.type || 'application/pdf', upsert: true }));
    },

    async removeBulas(paths) {
      if (paths.length) check(await client.storage.from(BULAS).remove(paths));
    },

    // { caminho: url temporária }
    async bulaUrls(paths) {
      if (!paths.length) return {};
      const rows = check(await client.storage.from(BULAS).createSignedUrls(paths, 6 * 3600));
      return Object.fromEntries(rows.filter((r) => r.signedUrl).map((r) => [r.path, r.signedUrl]));
    },

    // Erro de permissão (RLS) vindo do banco
    isDenied(err) {
      return !!err && (err.code === '42501' || /row-level security|permission denied/i.test(err.message || ''));
    },
  };

  global.Cloud = Cloud;
})(window);
