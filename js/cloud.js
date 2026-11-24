/*
 * Nuvem (Supabase): login com Google, leitura e gravação das tabelas "porcos_*",
 * fotos dos animais (bucket "porcos-fotos") e arquivos das bulas (bucket "porcos-bulas").
 * Suporta modelo multi-inquilino com Grupos e Convites por Link.
 */
(function (global) {
  'use strict';

  const cfg = global.APP_CONFIG || {};
  const client = global.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  const BUCKET = 'porcos-fotos';
  const BULAS = 'porcos-bulas';
  const DOCUMENTOS = 'porcos-documentos';
  const TABLES = {
    animais: 'porcos_animais',
    gestacoes: 'porcos_gestacoes',
    produtos: 'porcos_produtos',
    aplicacoes: 'porcos_aplicacoes',
    abates: 'porcos_abates',
    lancamentos: 'porcos_lancamentos',
    racoes: 'porcos_racoes',
    documentos: 'porcos_documentos',
  };
  const PAGE = 1000;

  const redirectTo = () => global.location.origin + global.location.pathname;

  function check(res) {
    if (res.error) throw res.error;
    return res.data;
  }

  async function selectAll(table, grupoId) {
    const all = [];
    for (let from = 0; ; from += PAGE) {
      let query = client.from(table).select('*');
      if (grupoId) query = query.eq('grupo_id', grupoId);
      const res = await query.order('id').range(from, from + PAGE - 1);
      if (res.error) {
        if (res.error.code === '42P01' || /relation.*does not exist/i.test(res.error.message || '')) {
          console.warn(`Tabela ${table} não encontrada no banco. Execute o schema.sql atualizado.`);
          return [];
        }
        throw res.error;
      }
      const rows = res.data || [];
      all.push(...rows);
      if (rows.length < PAGE) return all;
    }
  }

  const Cloud = {
    TABLES,
    client,

    onAuthChange(cb) {
      client.auth.onAuthStateChange((event, session) => cb(session ? session.user : null, event));
    },

    async signInWithGoogle() {
      check(await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } }));
    },

    // Link de acesso por e-mail (para quem não usa a conta Google)
    async signInWithEmail(email) {
      check(await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } }));
    },

    async signOut() {
      check(await client.auth.signOut());
    },

    // ---------- Grupos e Inicialização ----------

    // Garante que o usuário tem seu grupo inicial (ou devolve os grupos aos quais pertence)
    async inicializarUsuario() {
      return check(await client.rpc('porcos_inicializar_usuario'));
    },

    async criarGrupo(nome) {
      return check(await client.rpc('porcos_criar_grupo', { p_nome: nome }));
    },

    async renomearGrupo(grupoId, novoNome) {
      return check(await client.rpc('porcos_renomear_grupo', { p_grupo_id: grupoId, p_novo_nome: novoNome }));
    },

    // ---------- Convites por Link ----------

    async gerarConvite(grupoId, papel = 'editor') {
      return check(await client.rpc('porcos_gerar_convite', { p_grupo_id: grupoId, p_papel: papel }));
    },

    async listarConvites(grupoId) {
      return check(await client.rpc('porcos_listar_convites', { p_grupo_id: grupoId }));
    },

    async revogarConvite(codigo) {
      return check(await client.rpc('porcos_revogar_convite', { p_codigo: codigo }));
    },

    async consultarConvite(codigo) {
      return check(await client.rpc('porcos_consultar_convite', { p_codigo: codigo }));
    },

    async aceitarConvite(codigo) {
      return check(await client.rpc('porcos_aceitar_convite', { p_codigo: codigo }));
    },

    // ---------- Membros do Grupo ----------

    async listarMembros(grupoId) {
      return check(await client.rpc('porcos_listar_membros', { p_grupo_id: grupoId }));
    },

    async alterarPapelMembro(grupoId, membroId, papel) {
      return check(await client.rpc('porcos_alterar_papel_membro', { p_grupo_id: grupoId, p_membro_id: membroId, p_papel: papel }));
    },

    async removerMembro(grupoId, membroId) {
      return check(await client.rpc('porcos_remover_membro', { p_grupo_id: grupoId, p_membro_id: membroId }));
    },

    // ---------- Dados do Grupo ----------

    // Todos os dados do grupo: { animais: [...], gestacoes: [...], ... }
    async loadAll(grupoId) {
      const keys = Object.keys(TABLES);
      const lists = await Promise.all(keys.map((k) => selectAll(TABLES[k], grupoId)));
      return Object.fromEntries(keys.map((k, i) => [k, lists[i]]));
    },

    async insert(kind, rows, grupoId) {
      let payload = grupoId ? rows.map((r) => ({ ...r, grupo_id: r.grupo_id || grupoId })) : rows;
      while (true) {
        try {
          return check(await client.from(TABLES[kind]).insert(payload).select());
        } catch (err) {
          if (/schema cache|could not find.*column/i.test(err.message || '')) {
            const m = (err.message || '').match(/Could not find the '([^']+)' column/i);
            if (m && m[1] && payload.some((r) => m[1] in r)) {
              console.warn(`Coluna '${m[1]}' ausente no schema Supabase. Inserindo sem ela.`);
              payload = payload.map((r) => { const c = { ...r }; delete c[m[1]]; return c; });
              continue;
            }
          }
          throw err;
        }
      }
    },

    async update(kind, id, patch) {
      let currentPatch = { ...patch };
      while (true) {
        try {
          return check(await client.from(TABLES[kind]).update(currentPatch).eq('id', id).select().single());
        } catch (err) {
          if (/schema cache|could not find.*column/i.test(err.message || '')) {
            const m = (err.message || '').match(/Could not find the '([^']+)' column/i);
            if (m && m[1] && m[1] in currentPatch) {
              console.warn(`Coluna '${m[1]}' ausente no schema Supabase. Atualizando sem ela.`);
              delete currentPatch[m[1]];
              continue;
            }
          }
          throw err;
        }
      }
    },

    async remove(kind, id) {
      check(await client.from(TABLES[kind]).delete().eq('id', id));
    },

    // Alteração feita sem internet: não falha se o registro já foi apagado em outro aparelho
    async updateSeExistir(kind, id, patch) {
      let currentPatch = { ...patch };
      while (true) {
        try {
          check(await client.from(TABLES[kind]).update(currentPatch).eq('id', id));
          return;
        } catch (err) {
          if (/schema cache|could not find.*column/i.test(err.message || '')) {
            const m = (err.message || '').match(/Could not find the '([^']+)' column/i);
            if (m && m[1] && m[1] in currentPatch) {
              console.warn(`Coluna '${m[1]}' ausente no schema Supabase. Removendo do payload.`);
              delete currentPatch[m[1]];
              continue;
            }
          }
          throw err;
        }
      }
    },

    // ---------- Restaurar cópia (em lotes) ----------

    async upsertMany(kind, rows, grupoId) {
      const payload = grupoId ? rows.map((r) => ({ ...r, grupo_id: r.grupo_id || grupoId })) : rows;
      for (let i = 0; i < payload.length; i += 500) {
        const slice = payload.slice(i, i + 500);
        try {
          check(await client.from(TABLES[kind]).upsert(slice));
        } catch (err) {
          if (/schema cache|could not find.*column/i.test(err.message || '')) {
            const m = (err.message || '').match(/Could not find the '([^']+)' column/i);
            if (m && m[1]) {
              const fallback = slice.map((r) => { const c = { ...r }; delete c[m[1]]; return c; });
              check(await client.from(TABLES[kind]).upsert(fallback));
              continue;
            }
          }
          throw err;
        }
      }
    },

    async removeIds(kind, ids) {
      for (let i = 0; i < ids.length; i += 200) {
        check(await client.from(TABLES[kind]).delete().in('id', ids.slice(i, i + 200)));
      }
    },

    BUCKETS: { fotos: BUCKET, bulas: BULAS, documentos: DOCUMENTOS },

    async downloadArquivo(bucket, path) {
      return check(await client.storage.from(bucket).download(path));
    },

    async uploadArquivo(bucket, path, blob, contentType) {
      check(await client.storage.from(bucket).upload(path, blob, { contentType, upsert: true }));
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

    // ---------- Documentos do SOS Suínos ----------

    async uploadDocumento(path, file) {
      try {
        check(await client.storage.from(DOCUMENTOS).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true }));
        return DOCUMENTOS;
      } catch (err) {
        // Se o bucket porcos-documentos ainda não foi criado no Supabase, tenta porcos-bulas como alternativa
        if (/bucket not found/i.test(err.message || '') || err.statusCode === '404' || err.status === 404) {
          check(await client.storage.from(BULAS).upload(`sos/${path}`, file, { contentType: file.type || 'application/octet-stream', upsert: true }));
          return BULAS;
        }
        throw err;
      }
    },

    async removeDocumentos(items) {
      if (!items || !items.length) return;
      const porBucket = {};
      items.forEach((it) => {
        const p = typeof it === 'string' ? it : it.caminho;
        const b = (typeof it === 'object' && it.bucket) || DOCUMENTOS;
        if (!p) return;
        if (!porBucket[b]) porBucket[b] = [];
        porBucket[b].push(p);
      });
      for (const [b, paths] of Object.entries(porBucket)) {
        try {
          check(await client.storage.from(b).remove(paths));
        } catch (e) {}
      }
    },

    // { caminho: url temporária }
    async documentoUrls(items) {
      if (!items || !items.length) return {};
      const res = {};
      const porBucket = {};
      items.forEach((it) => {
        const p = typeof it === 'string' ? it : it.caminho;
        const b = (typeof it === 'object' && it.bucket) || DOCUMENTOS;
        if (!p) return;
        if (!porBucket[b]) porBucket[b] = [];
        porBucket[b].push(p);
      });
      for (const [b, paths] of Object.entries(porBucket)) {
        try {
          const rows = check(await client.storage.from(b).createSignedUrls(paths, 6 * 3600));
          rows.filter((r) => r.signedUrl).forEach((r) => { res[r.path] = r.signedUrl; });
        } catch (e) {}
      }
      return res;
    },

    // Erro de permissão (RLS) vindo do banco
    isDenied(err) {
      return !!err && (err.code === '42501' || /row-level security|permission denied/i.test(err.message || ''));
    },
  };

  global.Cloud = Cloud;
})(window);
