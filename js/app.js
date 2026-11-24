/*
 * Controle de Porcos: telas e interação.
 *
 * Telas (pelo endereço #/...):
 *   #/inicio        resumo, avisos de vacinas e partos
 *   #/animais       plantel (no plantel, vendidos, abatidos, mortos)
 *   #/animal/<id>   ficha de um animal
 *   #/crias         gestações e crias de cada matriz
 *   #/saude         calendário de vacinas e remédios
 *   #/racao         fórmulas de ração por fase
 *   #/financas      gastos, receitas e abates
 *   #/conta         conta, tema e (para o dono) quem tem acesso
 *
 * Os dados ficam no Supabase. Ao entrar, tudo é carregado de uma vez; cada
 * alteração vai direto para o banco. Quem só pode ver não enxerga os botões
 * de editar (e o banco recusa se tentar).
 */
(function () {
  'use strict';

  const {
    esc, fmtDate, fmtAge, fmtRelative, fmtMoney, fmtNum, fmtKg, fmtPct, fmtBytes, fmtMonth, fmtMonthLong,
    parseNum, toInput, hoje, addDays, diffDays, daysUntil, ordinal, plural,
  } = U;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const view = $('#view');
  const CFG = window.APP_CONFIG || {};

  const CATEGORIAS = { matriz: 'Matriz', barrao: 'Barrão', marra: 'Marrã', cevado: 'Cevado', porca: 'Marrã', porco: 'Cevado' };
  const CATEGORIAS_PLURAL = { matriz: 'matrizes', barrao: 'barrões', marra: 'marrãs', cevado: 'cevados', porca: 'marrãs', porco: 'cevados' };
  const FEMININO = { matriz: true, marra: true, porca: true };
  const CATEGORIAS_FORM = [
    ['matriz', 'Matriz'],
    ['barrao', 'Barrão'],
    ['marra', 'Marrã'],
    ['cevado', 'Cevado'],
  ];

  function padronizarNomeAnimal(nome, categoria) {
    if (!nome || typeof nome !== 'string') return nome || '';
    if (!/porc[oa]/i.test(nome)) return nome;
    let targetTerm = null;
    const cat = (categoria || '').toLowerCase();
    if (cat === 'marra' || cat === 'porca' || cat === 'matriz') targetTerm = 'Marrã';
    else if (cat === 'cevado' || cat === 'porco' || cat === 'barrao') targetTerm = 'Cevado';

    return nome.replace(/\bporc([oa])(s)?\b/gi, (match, vogal, pluralSuffix) => {
      const isPlural = !!pluralSuffix;
      const base = targetTerm || (vogal.toLowerCase() === 'a' ? 'Marrã' : 'Cevado');
      let result = base;
      if (isPlural) result = base === 'Marrã' ? 'Marrãs' : 'Cevados';
      if (match === match.toUpperCase()) return result.toUpperCase();
      if (match[0] === match[0].toLowerCase()) return result.toLowerCase();
      return result;
    });
  }

  function padronizarAnimais(animais) {
    if (!Array.isArray(animais)) return;
    for (const a of animais) {
      if (a && a.nome) {
        a.nome = padronizarNomeAnimal(a.nome, a.categoria);
      }
      if (a && a.categoria) {
        if (a.categoria === 'porca') a.categoria = 'marra';
        else if (a.categoria === 'porco') a.categoria = 'cevado';
      }
    }
  }

  async function sincronizarNomesAnimais() {
    if (!db || !Array.isArray(db.animais)) return;
    padronizarAnimais(db.animais);
    if (!canEdit()) return;
    const paraAtualizar = [];
    for (const a of db.animais) {
      const nomePadrao = padronizarNomeAnimal(a.nome, a.categoria);
      const catPadrao = a.categoria === 'porca' ? 'marra' : (a.categoria === 'porco' ? 'cevado' : a.categoria);
      if (nomePadrao !== a.nome || catPadrao !== a.categoria) {
        paraAtualizar.push({ id: a.id, patch: { nome: nomePadrao, categoria: catPadrao } });
      }
    }
    for (const item of paraAtualizar) {
      try {
        await Cloud.updateSeExistir('animais', item.id, item.patch);
      } catch (err) {
        console.warn('Erro ao sincronizar nome de animal:', err);
      }
    }
  }
  const AQUISICAO = { nascido: 'Nascido no local', comprado: 'Comprado', ganhado: 'Ganhado' };
  const SAIDAS = { venda: ['Vendido', 'Vendida'], abate: ['Abatido', 'Abatida'], morte: ['Morto', 'Morta'] };
  const SAIDA_FILTRO = { venda: 'Vendidos', abate: 'Abatidos', morte: 'Mortos' };
  const LANCAMENTOS = {
    soro: { tipo: 'despesa', label: 'Soro' },
    racao: { tipo: 'despesa', label: 'Ração' },
    outras: { tipo: 'despesa', label: 'Outras despesas' },
    venda: { tipo: 'receita', label: 'Receita (vendas)' },
  };
  const CATEGORIAS_DOC = {
    manual: 'Manual / Guia',
    saude: 'Saúde & Sintomas',
    nutricao: 'Nutrição & Manejo',
    laudo: 'Laudo / Exame',
    financeiro: 'Notas & Comprovantes',
    outro: 'Outro',
  };
  const PAPEIS = { dono: 'Dono', editor: 'Pode editar', leitor: 'Só ver' };
  const GESTACAO_DIAS = 114;
  const DESMAME_DIAS = 45;
  const AVISO_DIAS = 15;

  const ICON = {
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>',
    camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    syringe: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 4.5 5 5M17 7l-8.5 8.5M12 5.5l6.5 6.5M7 13.5l3.5 3.5M8.5 15.5 4 20"/></svg>',
    pig: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="13" rx="7.5" ry="6.5"/><path d="M6.5 8.2 5 4.5l4 2M17.5 8.2 19 4.5l-4 2"/><ellipse cx="12" cy="15" rx="3" ry="2"/></svg>',
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    chevron: '<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5"/><path d="M5 19.5h14"/></svg>',
    upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    fileText: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    sos: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M4.93 4.93 8.5 8.5M15.5 15.5l3.57 3.57M4.93 19.07 8.5 15.5M15.5 8.5l3.57-3.57"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    timer: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5"/><path d="M10 2h4"/><path d="M12 2v3"/></svg>',
    alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    google: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
  };

  const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="16" fill="#9c4a32"/>
    <path d="M17 22 14 11l11 6M47 22l3-11-11 6" fill="#f3c9b4"/>
    <ellipse cx="32" cy="35" rx="19" ry="17" fill="#f3c9b4"/>
    <ellipse cx="32" cy="41" rx="8.5" ry="6" fill="#e59a80"/>
    <ellipse cx="29" cy="41" rx="1.6" ry="2.2" fill="#7a3422"/>
    <ellipse cx="35" cy="41" rx="1.6" ry="2.2" fill="#7a3422"/>
    <circle cx="24.5" cy="30" r="2.2" fill="#3b1d14"/>
    <circle cx="39.5" cy="30" r="2.2" fill="#3b1d14"/>
  </svg>`;

  // ---------- Estado ----------

  const emptyDb = () => ({ animais: [], gestacoes: [], produtos: [], aplicacoes: [], abates: [], lancamentos: [], racoes: [], documentos: [] });

  let user = null;
  let papel = null;
  let grupos = [];
  let grupoAtivo = null;
  let membros = [];
  let convites = [];
  let db = emptyDb();
  let fotoUrl = {};
  let bulaUrl = {};
  let docUrl = {};
  let buscaSos = '';
  let filtroSos = 'todos';
  let buscaDnp = '';
  let loadedAt = 0;
  let offline = false;
  let current = { name: 'inicio', id: null };
  const filters = { animais: 'plantel', dnp: 'todos', ano: 'todos', lancTodos: false, histTodos: false, esporadicoTodos: new Set() };
  let racaoModo = 'total';
  let racaoQtd = 100;
  let racaoIng = 'Milho';
  let racaoAba = 'racao'; // 'racao' | 'peso'
  let pesoEditandoFormula = false;
  let toastTimer = null;

  const canEdit = () => papel === 'dono' || papel === 'editor';
  const editBtn = (html) => (canEdit() ? html : '');

  // ---------- Consultas nos dados ----------

  const byId = (kind, id) => db[kind].find((x) => x.id === id) || null;
  const animal = (id) => {
    const a = byId('animais', id);
    if (a && a.nome) a.nome = padronizarNomeAnimal(a.nome, a.categoria);
    return a;
  };
  const produto = (id) => byId('produtos', id);
  const noPlantel = (a) => !a.saida;
  const nomeAnimal = (id) => {
    const a = animal(id);
    return a ? padronizarNomeAnimal(a.nome, a.categoria) : '—';
  };

  const sortAnimais = (list) => [...list].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
  const sortByDate = (list, key = 'data', desc = false) => [...list].sort((a, b) => (desc ? -1 : 1) * String(a[key] || '').localeCompare(String(b[key] || '')));
  const produtosOrdenados = () => [...db.produtos].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));

  function statusAnimal(a) {
    if (!a.saida) return 'No plantel';
    return SAIDAS[a.saida][FEMININO[a.categoria] ? 1 : 0];
  }

  const idadeAnimal = (a) => fmtAge(a.nascimento, a.saida ? a.saida_data : null);

  function gestacoesDe(matrizId) {
    return sortByDate(db.gestacoes.filter((g) => g.matriz_id === matrizId), 'cruzamento');
  }

  const numeroGestacao = (g) => gestacoesDe(g.matriz_id).findIndex((x) => x.id === g.id) + 1;
  // Sem data de parto registrada, o parto previsto é o cruzamento + 114 dias
  const partoDe = (g) => g.parto || addDays(g.cruzamento, GESTACAO_DIAS);
  // Nascidos = vivos + mortos (null enquanto não nasceu)
  const nascidosDe = (g) => (g.vivos == null ? null : g.vivos + (g.mortos || 0));

  // 'aborto', 'repeticao', 'nascida', 'prevista' (parto ainda não chegou) ou 'pendente' (data passou e falta registrar)
  function situacaoGestacao(g) {
    if (g.aborto) return 'aborto';
    if (g.repeticao_cio) return 'repeticao';
    if (g.vivos != null) return 'nascida';
    return daysUntil(partoDe(g)) >= 0 ? 'prevista' : 'pendente';
  }

  const ordemAplicacao = (a, b) => a.data.localeCompare(b.data) || String(a.criado_em || '').localeCompare(String(b.criado_em || '')) || a.id.localeCompare(b.id);

  // Aplicações de um animal mais as que ele tomou quando era cria (as da gestação em que nasceu),
  // sem repetir as já lançadas no próprio animal (mesmo produto no mesmo dia). As de cria vêm com
  // animal_id preenchido e deCria = true; o id continua o da aplicação da gestação.
  function aplicacoesAnimal(id) {
    const a = animal(id);
    const proprias = db.aplicacoes.filter((x) => x.animal_id === id);
    const deCria = a && a.gestacao_id
      ? db.aplicacoes
        .filter((x) => x.gestacao_id === a.gestacao_id && !proprias.some((p) => p.produto_id === x.produto_id && p.data === x.data))
        .map((x) => ({ ...x, animal_id: id, deCria: true }))
      : [];
    return [...proprias, ...deCria].sort(ordemAplicacao);
  }
  const aplicacoesCria = (id) => sortByDate(db.aplicacoes.filter((x) => x.gestacao_id === id));

  // Número da dose: posição da aplicação entre as do mesmo produto no mesmo animal (contando as de
  // quando era cria) ou nas crias da gestação, por data
  function numeroDose(ap) {
    const mesmas = (ap.animal_id ? aplicacoesAnimal(ap.animal_id) : db.aplicacoes.filter((x) => x.gestacao_id === ap.gestacao_id).sort(ordemAplicacao))
      .filter((x) => x.produto_id === ap.produto_id);
    return mesmas.findIndex((x) => x.id === ap.id) + 1;
  }

  const dose = (n) => `${ordinal(n)} dose`;
  const nomeProduto = (ap) => (produto(ap.produto_id) || {}).nome || '?';

  function alvoAplicacao(ap) {
    if (ap.animal_id) return nomeAnimal(ap.animal_id);
    const g = byId('gestacoes', ap.gestacao_id);
    return g ? `Crias da ${nomeAnimal(g.matriz_id)} (${ordinal(numeroGestacao(g))} gestação)` : '—';
  }

  // Partes de um abate: [{ parte, kg, preco (R$/kg), valor }]. O total do abate fica em "valor".
  const PARTES_SUGERIDAS = ['Carne', 'Toucinho', 'Costela', 'Lombo', 'Pernil', 'Paleta', 'Banha', 'Cabeça', 'Pés', 'Miúdos', 'Fígado', 'Couro', 'Linguiça'];
  const partesAbate = (ab) => (ab.itens || []).filter((i) => i && i.parte);
  const pesoAbate = (ab) => partesAbate(ab).reduce((s, i) => s + Number(i.kg || 0), 0);
  const kgParte = (ab, nome) => partesAbate(ab).filter((i) => i.parte.toLowerCase() === nome.toLowerCase()).reduce((s, i) => s + Number(i.kg || 0), 0);

  // Partes que aparecem nos abates (sem repetir, ignorando maiúsculas): Carne e Toucinho
  // primeiro, depois na ordem da lista de sugestões e, por fim, na ordem em que aparecem.
  function colunasPartes(abates) {
    const m = new Map();
    abates.forEach((a) => partesAbate(a).forEach((i) => {
      const nome = i.parte.trim();
      const key = nome.toLowerCase();
      if (!m.has(key)) m.set(key, { key, nome, ordem: m.size });
    }));
    const pos = (c) => {
      const k = PARTES_SUGERIDAS.findIndex((p) => p.toLowerCase() === c.key);
      return k >= 0 ? k : PARTES_SUGERIDAS.length + c.ordem;
    };
    return [...m.values()].sort((a, b) => pos(a) - pos(b));
  }

  // Calendário: para cada animal no plantel e produto com reforço, a última e a próxima aplicação.
  // todos = true inclui os que saíram do plantel e tomaram o produto (sem próxima dose).
  function calendario(todos = false) {
    const rows = [];
    const produtos = produtosOrdenados().filter((p) => p.intervalo_dias);
    for (const p of produtos) {
      for (const a of sortAnimais(db.animais.filter((x) => todos || noPlantel(x)))) {
        const aps = aplicacoesAnimal(a.id).filter((x) => x.produto_id === p.id);
        const saiu = !noPlantel(a);
        if (saiu && !aps.length) continue;
        const ultima = aps.length ? aps[aps.length - 1].data : null;
        const proxima = ultima && !saiu ? addDays(ultima, p.intervalo_dias) : null;
        rows.push({ produto: p, animal: a, aps, ultima, proxima, faltam: proxima ? daysUntil(proxima) : null, doses: aps.length, saiu });
      }
    }
    return rows;
  }

  function badgeVacina(r) {
    if (r.saiu) return `<span class="badge muted">${esc(statusAnimal(r.animal))} em ${esc(fmtDate(r.animal.saida_data))}</span>`;
    if (r.faltam == null) return '<span class="badge muted">Sem registro</span>';
    if (r.faltam < 0) return `<span class="badge danger">Atrasada · ${-r.faltam} ${r.faltam === -1 ? 'dia' : 'dias'}</span>`;
    if (r.faltam <= AVISO_DIAS) return `<span class="badge warn">${r.faltam === 0 ? 'Hoje' : `Faltam ${plural(r.faltam, 'dia', 'dias')}`}</span>`;
    return `<span class="badge ok">Faltam ${plural(r.faltam, 'dia', 'dias')}</span>`;
  }

  function badgeGestacao(g) {
    const s = situacaoGestacao(g);
    const parto = partoDe(g);
    if (s === 'aborto') return `<span class="badge dnp-aborto">Aborto · ${esc(fmtDate(g.aborto_data || g.cruzamento))}</span>`;
    if (s === 'repeticao') return '<span class="badge dnp-cio">Repetição de cio</span>';
    if (s === 'nascida') return `<span class="badge ok">Nascida · ${esc(fmtAge(parto))}</span>`;
    if (s === 'prevista') return `<span class="badge warn">Prevista · ${esc(fmtRelative(parto))}</span>`;
    return '<span class="badge danger">Registrar o parto</span>';
  }

  // ---------- Montagem das telas ----------

  function onRoute() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    let name = parts[0] || 'inicio';
    if (name === 'documentos') name = 'sos';
    current = { name, id: parts[1] ? decodeURIComponent(parts[1]) : null };
    const nav = name === 'animal' ? 'animais' : (name === 'sos' ? 'documentos' : name);
    $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.route === nav || (nav === 'documentos' && a.dataset.route === 'sos')));
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    if ($('#app').hidden) return;
    document.body.classList.toggle('readonly', !canEdit());
    renderAccount();
    const pages = {
      animais: renderAnimais,
      animal: () => renderAnimal(current.id),
      crias: renderCrias,
      dnp: renderDnp,
      saude: renderSaude,
      racao: renderRacao,
      financas: renderFinancas,
      sos: renderSos,
      documentos: renderSos,
      conta: renderConta,
    };
    view.innerHTML = banners() + (pages[current.name] || renderInicio)();
    if (current.name === 'animais') filtrarAnimais();
    if (current.name === 'dnp') filtrarDnp();
    if (current.name === 'conta') loadMembrosEConvites();
  }

  function banners() {
    const n = fila.length;
    const pend = n ? ` <strong>${n} ${n === 1 ? 'alteração guardada' : 'alterações guardadas'}</strong> neste aparelho ${n === 1 ? 'vai' : 'vão'} para a nuvem quando a internet voltar.` : '';
    if (offline) {
      const quando = loadedAt ? new Date(loadedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
      return `<div class="banner warn"><p><strong>Sem conexão com a nuvem.</strong> Mostrando os dados salvos neste aparelho${quando ? ` em ${esc(quando)}` : ''}.
        ${canEdit() ? `Dá para continuar anotando.${pend} Fotos, bulas e excluir animais ou gestações precisam de internet.` : ''}</p>
        <button type="button" class="btn small" data-act="reload">Tentar de novo</button></div>`;
    }
    if (n) return `<div class="banner warn"><p>${pend}</p><button type="button" class="btn small" data-act="reload">Enviar agora</button></div>`;
    return '';
  }

  const pageHead = (title, sub, actions = '') => `<div class="page-head">
      <div><h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div>
      ${actions ? `<div class="page-actions">${actions}</div>` : ''}
    </div>`;

  function fotoHtml(a, cls = '') {
    const url = a.foto && fotoUrl[a.foto];
    if (url) return `<span class="foto ${cls}"><img src="${esc(url)}" alt="" loading="lazy"></span>`;
    return `<span class="foto empty cat-${a.categoria} ${cls}">${ICON.pig}</span>`;
  }

  // ---------- Tabelas que dá para esconder ----------
  // Quais estão escondidas fica guardado neste aparelho.

  const FECHADAS_KEY = 'porcos:fechadas';
  const fechadas = (() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(FECHADAS_KEY) || '[]'));
    } catch (e) {
      return new Set();
    }
  })();

  // Seção com título clicável que mostra ou esconde o conteúdo.
  // opts: { extra: botões ao lado do título, sub: true para um bloco dentro de outro }
  function bloco(key, titulo, corpo, opts = {}) {
    const fechado = fechadas.has(key);
    const H = opts.sub ? 'h3' : 'h2';
    return `<section class="${opts.sub ? 'sub-bloco' : 'section card'} bloco${fechado ? ' fechado' : ''}" data-bloco="${esc(key)}">
      <div class="section-head bloco-head">
        <${H}><button type="button" class="bloco-toggle" data-act="bloco" data-key="${esc(key)}" aria-expanded="${!fechado}"
          title="${fechado ? 'Mostrar' : 'Esconder'}">${ICON.chevron}<span>${titulo}</span></button></${H}>
        ${opts.extra || ''}
      </div>
      <div class="bloco-body"${fechado ? ' hidden' : ''}>${corpo}</div>
    </section>`;
  }

  function toggleBloco(btn) {
    const key = btn.dataset.key;
    const sec = btn.closest('[data-bloco]');
    const fechar = !fechadas.has(key);
    if (fechar) fechadas.add(key);
    else fechadas.delete(key);
    sec.classList.toggle('fechado', fechar);
    $('.bloco-body', sec).hidden = fechar;
    btn.setAttribute('aria-expanded', String(!fechar));
    btn.title = fechar ? 'Mostrar' : 'Esconder';
    try {
      localStorage.setItem(FECHADAS_KEY, JSON.stringify([...fechadas]));
    } catch (e) { /* sem armazenamento: vale até fechar o site */ }
  }

  const stat = (label, value, sub, cls = '') => `<div class="stat ${cls}"><span class="stat-label">${label}</span>
      <strong class="stat-value">${value}</strong>${sub ? `<span class="stat-sub">${sub}</span>` : ''}</div>`;

  // ---------- Início ----------

  function resumoPlantel(list) {
    const n = {};
    list.forEach((a) => {
      const c = (a.categoria === 'porca' ? 'marra' : (a.categoria === 'porco' ? 'cevado' : a.categoria));
      n[c] = (n[c] || 0) + 1;
    });
    const order = ['matriz', 'barrao', 'marra', 'cevado'];
    return order.filter((c) => n[c]).map((c) => `${n[c]} ${n[c] === 1 ? CATEGORIAS[c].toLowerCase() : CATEGORIAS_PLURAL[c]}`).join(' · ');
  }

  function totaisFinancas(lancs) {
    const t = { soro: 0, racao: 0, outras: 0, venda: 0 };
    lancs.forEach((l) => { t[l.categoria] += Number(l.valor); });
    const despesas = t.soro + t.racao + t.outras;
    const saldo = t.venda - despesas;
    return { ...t, despesas, receitas: t.venda, saldo, margem: despesas ? (saldo / despesas) * 100 : null };
  }

  function renderInicio() {
    const plantel = db.animais.filter(noPlantel);
    const futuras = sortByDate(db.gestacoes.filter((g) => situacaoGestacao(g) !== 'nascida').map((g) => ({ g, parto: partoDe(g) })), 'parto');
    const prox = futuras.find((x) => daysUntil(x.parto) >= 0);
    const ano = String(new Date().getFullYear());
    const doAno = db.gestacoes.filter((g) => g.vivos != null && partoDe(g).startsWith(ano));
    const nascidos = doAno.reduce((s, g) => s + nascidosDe(g), 0);
    const vivos = doAno.reduce((s, g) => s + g.vivos, 0);
    const mortos = doAno.reduce((s, g) => s + (g.mortos || 0), 0);
    const fin = totaisFinancas(db.lancamentos);

    const stats = `<div class="stats">
      ${stat('No plantel', plantel.length, esc(resumoPlantel(plantel)) || 'Nenhum animal')}
      ${stat('Próximo parto', prox ? esc(fmtDate(prox.parto)) : '—', prox ? `${esc(nomeAnimal(prox.g.matriz_id))} · ${esc(fmtRelative(prox.parto))}` : 'Nenhum previsto')}
      ${stat(`Nascidos em ${ano}`, nascidos, doAno.length ? `${plural(vivos, 'vivo', 'vivos')} · ${plural(mortos, 'morto', 'mortos')} · ${plural(doAno.length, 'parto', 'partos')}` : 'Nenhum parto ainda')}
      ${stat('Saldo geral', fmtMoney(fin.saldo), fin.margem != null ? `Margem de ${fmtPct(fin.margem)}` : '', fin.saldo < 0 ? 'neg' : 'pos')}
    </div>`;

    // Avisos: vacinas atrasadas ou próximas e partos (agrupados por produto e data)
    const avisos = [];
    const grupos = new Map();
    calendario().filter((r) => r.faltam != null && r.faltam <= AVISO_DIAS).forEach((r) => {
      const k = `${r.produto.id}|${r.proxima}`;
      if (!grupos.has(k)) grupos.set(k, { ...r, animais: [] });
      grupos.get(k).animais.push(r.animal.nome);
    });
    for (const r of grupos.values()) {
      avisos.push({
        ordem: r.faltam,
        cls: r.faltam < 0 ? 'danger' : 'warn',
        icon: ICON.syringe,
        href: '#/saude',
        title: `${esc(r.produto.nome)} ${r.faltam < 0 ? 'atrasado' : 'chegando'}`,
        text: `${esc(r.animais.join(', '))} · ${r.faltam < 0 ? 'venceu' : 'vence'} em ${esc(fmtDate(r.proxima))} (${esc(fmtRelative(r.proxima))})`,
      });
    }
    futuras.forEach(({ g, parto }) => {
      const n = daysUntil(parto);
      if (n > AVISO_DIAS) return;
      avisos.push({
        ordem: n,
        cls: n < 0 ? 'danger' : 'warn',
        icon: ICON.pig,
        href: '#/crias',
        title: n < 0 ? `Parto da ${esc(nomeAnimal(g.matriz_id))}: falta registrar` : `Parto da ${esc(nomeAnimal(g.matriz_id))} chegando`,
        text: `${ordinal(numeroGestacao(g))} gestação · previsto para ${esc(fmtDate(parto))} (${esc(fmtRelative(parto))})`,
      });
    });

    // DNP: fêmeas gerando dias não produtivos hoje
    const dnpPlantel = calcularDnpPlantel();
    if (dnpPlantel.gerandoHoje.length) {
      avisos.push({
        ordem: -999,
        cls: 'danger',
        icon: ICON.timer,
        href: '#/dnp',
        title: `${plural(dnpPlantel.gerandoHoje.length, 'fêmea gerando DNP hoje', 'fêmeas gerando DNP hoje')}`,
        text: `${esc(dnpPlantel.gerandoHoje.map((d) => d.animal.nome).join(', '))} · toque para ver as causas e evitar prejuízo`,
      });
    }
    avisos.sort((a, b) => a.ordem - b.ordem);

    const avisosHtml = avisos.length
      ? `<ul class="alerts">${avisos.map((a) => `<li><a class="alert ${a.cls}" href="${a.href}"><span class="alert-icon">${a.icon}</span>
          <span><strong>${a.title}</strong><small>${a.text}</small></span></a></li>`).join('')}</ul>`
      : `<div class="empty-box">${ICON.ok}<p>Tudo em dia: nenhuma vacina ou parto nos próximos ${AVISO_DIAS} dias.</p></div>`;

    const partosHtml = futuras.length
      ? `<ul class="list">${futuras.map(({ g, parto }) => `<li class="list-row">
          <span><strong>${esc(nomeAnimal(g.matriz_id))}</strong><small>${ordinal(numeroGestacao(g))} gestação · cruzamento em ${esc(fmtDate(g.cruzamento))}</small></span>
          <span class="right"><strong>${esc(fmtDate(parto))}</strong><small>${esc(fmtRelative(parto))}</small></span></li>`).join('')}</ul>`
      : '<p class="muted">Nenhuma gestação em andamento.</p>';

    const plantelHtml = plantel.length
      ? `<div class="mini-grid">${sortAnimais(plantel).map((a) => `<a class="mini" href="#/animal/${a.id}">${fotoHtml(a)}
          <span><strong>${esc(a.nome)}</strong><small>${esc(CATEGORIAS[a.categoria])} · ${esc(idadeAnimal(a))}</small></span></a>`).join('')}</div>`
      : '<p class="muted">Nenhum animal no plantel.</p>';

    const data = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    return `${pageHead('Resumo', esc(data))}
      ${stats}
      <section class="section"><h2>Avisos</h2>${avisosHtml}</section>
      <div class="two-col">
        <section class="section card"><h2>Partos previstos</h2>${partosHtml}</section>
        <section class="section card"><h2>Plantel</h2>${plantelHtml}</section>
      </div>`;
  }

  // ---------- Animais ----------

  function renderAnimais() {
    const f = filters.animais;
    const counts = { plantel: 0, venda: 0, abate: 0, morte: 0, todos: db.animais.length };
    db.animais.forEach((a) => { counts[a.saida || 'plantel']++; });
    const list = sortAnimais(db.animais);
    const chip = (v, label) => `<button type="button" class="chip${f === v ? ' on' : ''}" data-act="filter-animais" data-value="${v}">${label} <span class="n">${counts[v]}</span></button>`;

    // Todos os cartões ficam na página; a situação e a busca só escondem (ver filtrarAnimais).
    const cards = list.length
      ? `<div class="animal-grid" id="animalGrid">${list.map((a) => `<a class="animal-card" href="#/animal/${a.id}" data-sit="${a.saida || 'plantel'}"
          data-busca="${esc(normBusca([a.nome, CATEGORIAS[a.categoria], a.negociado_com, a.obs].join(' ')))}">
          ${fotoHtml(a, 'large')}
          <span class="animal-info">
            <strong>${esc(a.nome)}</strong>
            <small>${esc(CATEGORIAS[a.categoria])} · ${esc(idadeAnimal(a))}</small>
            ${a.saida ? `<span class="badge muted">${esc(statusAnimal(a))} em ${esc(fmtDate(a.saida_data))}</span>` : `<small class="muted">${esc(AQUISICAO[a.aquisicao])}</small>`}
          </span></a>`).join('')}</div>`
      : '';

    return `${pageHead('Animais', 'Todos os animais que já passaram pelo plantel', editBtn(`<button type="button" class="btn" data-act="fotos-lote" title="Enviar várias fotos: cada arquivo vai para o animal com o mesmo nome">${ICON.camera} Fotos em lote</button>
      <button type="button" class="btn primary" data-act="animal-new">${ICON.plus} Animal</button>`))}
      ${db.animais.length > 6 ? `<input type="search" id="buscaAnimais" class="busca" placeholder="Buscar animal pelo nome, categoria, de quem comprou ou observação" aria-label="Buscar animal" autocomplete="off" value="${esc(buscaAnimais)}">` : ''}
      <div class="chips">${chip('plantel', 'No plantel')}${chip('venda', SAIDA_FILTRO.venda)}${chip('abate', SAIDA_FILTRO.abate)}${chip('morte', SAIDA_FILTRO.morte)}${chip('todos', 'Todos')}</div>
      ${cards}
      <div class="empty-box" id="animaisVazio" hidden><p id="animaisVazioTxt">Nenhum animal aqui.</p></div>`;
  }

  // Busca: sem acento e sem diferença entre maiúsculas e minúsculas. Com texto, procura em todas as situações.
  let buscaAnimais = '';
  const normBusca = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function filtrarAnimais() {
    const grid = $('#animalGrid');
    const vazio = $('#animaisVazio');
    if (!vazio) return;
    const q = normBusca(buscaAnimais.trim());
    const f = filters.animais;
    let n = 0;
    if (grid) {
      grid.querySelectorAll('.animal-card').forEach((c) => {
        const ok = q ? c.dataset.busca.includes(q) : f === 'todos' || c.dataset.sit === f;
        c.hidden = !ok;
        if (ok) n++;
      });
    }
    vazio.hidden = n > 0;
    $('#animaisVazioTxt').textContent = q ? `Nenhum animal com “${buscaAnimais.trim()}”.` : 'Nenhum animal aqui.';
    $$('.chips .chip', view).forEach((c) => c.classList.toggle('dim', !!q));
  }

  function renderAnimal(id) {
    const a = animal(id);
    if (!a) return `${pageHead('Animal não encontrado')}<p><a href="#/animais">Voltar para Animais</a></p>`;

    const info = [
      ['Categoria', CATEGORIAS[a.categoria]],
      ['Nascimento', a.nascimento ? `${fmtDate(a.nascimento)} · ${idadeAnimal(a)}` : '—'],
      ['Chegada', fmtDate(a.chegada)],
      ['Aquisição', AQUISICAO[a.aquisicao]],
      ['Negociado com', a.negociado_com || '—'],
      ['Valor de compra', fmtMoney(a.valor_compra)],
    ];
    if (a.saida) {
      info.push(['Saída', `${statusAnimal(a)} em ${fmtDate(a.saida_data)}`]);
      if (a.saida === 'venda') info.push(['Valor de venda', fmtMoney(a.valor_venda)]);
    }

    // Aplicações por produto
    const aps = aplicacoesAnimal(a.id);
    const porProduto = produtosOrdenados().map((p) => ({ p, list: aps.filter((x) => x.produto_id === p.id) })).filter((x) => x.list.length);
    const saudeHtml = porProduto.length
      ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Produto</th><th>Aplicações</th><th>Próxima</th></tr></thead>
          <tbody>${porProduto.map(({ p, list }) => {
            const ultima = list[list.length - 1].data;
            const prox = p.intervalo_dias && noPlantel(a) ? addDays(ultima, p.intervalo_dias) : null;
            return `<tr><th scope="row">${esc(p.nome)}</th>
              <td><div class="dose-list">${list.map((x, i) => doseChip(x, `${dose(i + 1)} · ${fmtDate(x.data)}`)).join('')}</div></td>
              <td>${prox ? `${esc(fmtDate(prox))} <small class="muted">${dose(list.length + 1)}</small><br>${badgeVacina({ faltam: daysUntil(prox) })}` : '<span class="muted">—</span>'}</td></tr>`;
          }).join('')}</tbody></table></div>`
      : '<p class="muted">Nenhuma aplicação registrada.</p>';

    let gestHtml = '';
    if (a.categoria === 'matriz' || gestacoesDe(a.id).length) {
      const gs = gestacoesDe(a.id);
      gestHtml = `<section class="section card"><div class="section-head"><h2>Gestações</h2>
          ${editBtn(`<button type="button" class="btn small" data-act="gestacao-new" data-matriz="${a.id}">${ICON.plus} Gestação</button>`)}</div>
        ${gs.length ? `<ul class="list">${gs.map((g, i) => `<li class="list-row">
            <span><strong>${ordinal(i + 1)} gestação</strong><small>Cruzamento ${esc(fmtDate(g.cruzamento))} · parto ${esc(fmtDate(partoDe(g)))}</small></span>
            <span class="right">${g.vivos != null ? `<strong>${plural(nascidosDe(g), 'nascido', 'nascidos')}</strong><small>${plural(g.vivos, 'vivo', 'vivos')} · ${plural(g.mortos || 0, 'morto', 'mortos')}</small>` : badgeGestacao(g)}</span>
          </li>`).join('')}</ul><p><a href="#/crias">Ver todas as crias</a></p>` : '<p class="muted">Nenhuma gestação registrada.</p>'}
      </section>`;
    }

    // Barrão: as gestações em que ele foi o pai
    const comoPai = sortByDate(db.gestacoes.filter((g) => g.barrao_id === a.id), 'cruzamento');
    if (a.categoria === 'barrao' || comoPai.length) {
      gestHtml += `<section class="section card"><h2>Crias como pai</h2>
        ${comoPai.length ? `<ul class="list">${comoPai.map((g) => `<li class="list-row">
            <span><strong><a href="#/animal/${g.matriz_id}">${esc(nomeAnimal(g.matriz_id))}</a> · ${ordinal(numeroGestacao(g))} gestação</strong>
              <small>Cruzamento ${esc(fmtDate(g.cruzamento))} · parto ${esc(fmtDate(partoDe(g)))}</small></span>
            <span class="right">${g.vivos != null ? `<strong>${plural(nascidosDe(g), 'nascido', 'nascidos')}</strong><small>${plural(g.vivos, 'vivo', 'vivos')} · ${plural(g.mortos || 0, 'morto', 'mortos')}</small>` : badgeGestacao(g)}</span>
          </li>`).join('')}</ul>`
          : '<p class="muted">Nenhuma gestação com este barrão. Para marcar, edite a gestação em Crias e escolha o barrão.</p>'}
      </section>`;
    }

    const abate = db.abates.find((x) => x.animal_id === a.id);
    const abateHtml = abate ? bloco('animal-abate', 'Abate', `
        <dl class="info"><div><dt>Data</dt><dd>${esc(fmtDate(abate.data))}</dd></div>
        <div><dt>Peso</dt><dd>${esc(fmtKg(pesoAbate(abate)))}</dd></div>
        <div><dt>Valor</dt><dd>${esc(fmtMoney(abate.valor))}</dd></div></dl>
        ${partesAbate(abate).length ? partesTabela(abate) : ''}`,
      { extra: editBtn(`<button type="button" class="btn small" data-act="abate-edit" data-id="${abate.id}">${ICON.edit} Editar</button>`) }) : '';

    let dnpSecHtml = '';
    if (a.categoria === 'matriz' || a.categoria === 'marra' || a.categoria === 'porca') {
      const d = calcularDnpMatriz(a);
      dnpSecHtml = `<section class="section card">
        <div class="section-head">
          <h2>Dias Não Produtivos (DNP)</h2>
          <button type="button" class="btn small" data-act="dnp-detalhes" data-id="${a.id}">${ICON.eye} Extrato de DNP</button>
        </div>
        <div class="dnp-resumo-banner">
          <div class="dnp-resumo-item">
            <small>Total DNP</small>
            <strong class="${d.totalDnp > 0 ? 'danger-text' : 'pos-text'}">${d.totalDnp} dias</strong>
          </div>
          <div class="dnp-resumo-item">
            <small>Status Hoje</small>
            <strong>${d.dnpHoje ? '<span class="badge dnp-ativo">⚠️ Gerando DNP hoje</span>' : '<span class="badge ok">Sem DNP ativo</span>'}</strong>
          </div>
          <div class="dnp-resumo-item">
            <small>Motivo principal</small>
            <strong><span class="badge ${d.motivoBadgeCls}">${esc(d.motivoPrincipal)}</span></strong>
          </div>
        </div>
      </section>`;
    }

    return `<a class="back" href="#/animais">${ICON.back} Animais</a>
      <div class="hero card">
        <div class="hero-photo">${fotoHtml(a, 'xl')}
          ${editBtn(`<button type="button" class="btn small photo-btn" data-act="foto" data-id="${a.id}">${ICON.camera} ${a.foto ? 'Trocar foto' : 'Pôr foto'}</button>`)}</div>
        <div class="hero-main">
          <h1>${esc(a.nome)}</h1>
          <p class="hero-badges"><span class="badge cat-${a.categoria}">${esc(CATEGORIAS[a.categoria])}</span>
            <span class="badge ${a.saida ? 'muted' : 'ok'}">${esc(statusAnimal(a))}</span>
            ${a.descarte && noPlantel(a) ? '<span class="badge dnp-descarte">Aguardando descarte</span>' : ''}</p>
          ${(() => {
            const g = a.gestacao_id && byId('gestacoes', a.gestacao_id);
            if (!g) return '';
            const parto = partoDe(g);
            const dataDesmame = g.desmame || (parto ? addDays(parto, DESMAME_DIAS) : null);
            let desmameTxt = '';
            if (dataDesmame) {
              const idadeD = parto ? diffDays(parto, dataDesmame) : null;
              const idadeTxt = idadeD != null && idadeD >= 0 ? ` (${plural(idadeD, 'dia', 'dias')})` : '';
              desmameTxt = ` · desmame ${g.desmame ? '' : 'previsto '}${fmtDate(dataDesmame)}${idadeTxt}`;
            }
            return `<p class="cria-de">Cria da <a href="#/animal/${g.matriz_id}">${esc(nomeAnimal(g.matriz_id))}</a>${g.barrao_id
                ? ` e do <a href="#/animal/${g.barrao_id}">${esc(nomeAnimal(g.barrao_id))}</a>` : ''}
              · ${ordinal(numeroGestacao(g))} gestação, parto em ${esc(fmtDate(parto))}${desmameTxt}</p>`;
          })()}
          <dl class="info">${info.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
          ${a.obs ? `<p class="obs">${esc(a.obs)}</p>` : ''}
          ${editBtn(`<div class="hero-actions"><button type="button" class="btn" data-act="animal-edit" data-id="${a.id}">${ICON.edit} Editar</button>
            <button type="button" class="btn" data-act="aplicacao-new" data-animal="${a.id}">${ICON.syringe} Registrar aplicação</button></div>`)}
        </div>
      </div>
      ${bloco('animal-vacinas', 'Vacinas e remédios', saudeHtml)}
      ${dnpSecHtml}
      ${gestHtml}
      ${abateHtml}`;
  }

  // Aplicação de quando o animal era cria: marcada com "cria" (editar muda a aplicação de todas as crias)
  function doseChip(ap, label) {
    const dica = [ap.deCria ? 'Tomou quando era cria (aplicação lançada nas crias da gestação)' : '', ap.obs || ''].filter(Boolean).join(' · ');
    const title = dica ? ` title="${esc(dica)}"` : '';
    const cls = ap.deCria ? 'dose de-cria' : 'dose';
    const texto = `${esc(label)}${ap.deCria ? ' <small>cria</small>' : ''}`;
    return canEdit()
      ? `<button type="button" class="${cls}" data-act="aplicacao-edit" data-id="${ap.id}"${title}>${texto}</button>`
      : `<span class="${cls}"${title}>${texto}</span>`;
  }

  // ---------- Crias ----------

  function renderCrias() {
    const matrizes = sortAnimais(db.animais.filter((a) => (a.categoria === 'matriz' && noPlantel(a)) || gestacoesDe(a.id).length));
    const blocos = matrizes.map((m) => {
      const gs = gestacoesDe(m.id);
      const nasc = gs.reduce((s, g) => s + (nascidosDe(g) || 0), 0);
      const vivos = gs.reduce((s, g) => s + (g.vivos || 0), 0);
      const mortos = gs.reduce((s, g) => s + (g.mortos || 0), 0);
      const cards = [...gs].reverse().map((g) => criaCard(g, gs.indexOf(g) + 1)).join('');
      // Gestação ainda sem parto registrado: aparece no cabeçalho, mesmo com a matriz minimizada
      const andamento = gs.find((g) => situacaoGestacao(g) !== 'nascida');
      const key = `crias-${m.id}`;
      const fechado = fechadas.has(key);
      return `<section class="section bloco matriz-bloco${fechado ? ' fechado' : ''}" data-bloco="${key}">
        <div class="section-head bloco-head">
          <div class="matriz-titulo">
            <button type="button" class="icon bloco-toggle" data-act="bloco" data-key="${key}" aria-expanded="${!fechado}"
              aria-label="Minimizar ou mostrar as gestações da ${esc(m.nome)}" title="${fechado ? 'Mostrar' : 'Minimizar'}">${ICON.chevron}</button>
            <a class="matriz-head" href="#/animal/${m.id}">${fotoHtml(m)}<span><strong>${esc(m.nome)}</strong>
              <small>${plural(gs.length, 'gestação', 'gestações')} · ${plural(nasc, 'nascido', 'nascidos')} (${plural(vivos, 'vivo', 'vivos')}, ${plural(mortos, 'morto', 'mortos')})${m.saida ? ` · ${esc(statusAnimal(m).toLowerCase())}` : ''}</small></span></a>
            ${andamento ? badgeGestacao(andamento) : ''}
          </div>
          ${editBtn(m.saida ? '' : `<button type="button" class="btn small" data-act="gestacao-new" data-matriz="${m.id}">${ICON.plus} Gestação</button>`)}
        </div>
        <div class="bloco-body"${fechado ? ' hidden' : ''}>
          ${gs.length ? `<div class="cria-grid">${cards}</div>` : '<p class="muted">Nenhuma gestação registrada.</p>'}
        </div>
      </section>`;
    }).join('');

    return `${pageHead('Crias', `Gestações e leitões de cada matriz. O parto previsto é ${GESTACAO_DIAS} dias depois do cruzamento.`,
      editBtn(`<button type="button" class="btn primary" data-act="gestacao-new">${ICON.plus} Gestação</button>`))}
      ${blocos || '<div class="empty-box"><p>Nenhuma matriz cadastrada.</p></div>'}`;
  }

  function criaCard(g, n) {
    const parto = partoDe(g);
    const nascida = g.vivos != null;
    const aps = aplicacoesCria(g.id);
    const filhos = sortAnimais(db.animais.filter((x) => x.gestacao_id === g.id));
    const linhas = [
      ['Barrão (pai)', g.barrao_id ? nomeAnimal(g.barrao_id) : '—'],
      ['Cruzamento', fmtDate(g.cruzamento)],
    ];
    if (g.aborto) {
      linhas.push(['Situação', 'Aborto']);
      linhas.push(['Data do aborto', fmtDate(g.aborto_data || g.cruzamento)]);
    } else if (g.repeticao_cio) {
      linhas.push(['Situação', 'Repetição de cio (cobertura não vingou)']);
    } else {
      linhas.push([nascida || g.parto ? 'Parto' : 'Parto previsto', fmtDate(parto)]);
      if (nascida) {
        linhas.push(['Duração', plural(diffDays(g.cruzamento, parto), 'dia', 'dias')]);
        linhas.push(['Nascidos', String(nascidosDe(g))]);
        linhas.push(['Vivos', String(g.vivos)]);
        linhas.push(['Mortos', g.mortos != null ? String(g.mortos) : '—']);
        if (g.machos != null || g.femeas != null) linhas.push(['Machos / fêmeas', `${g.machos ?? '—'} / ${g.femeas ?? '—'}`]);
        linhas.push(['Capação', fmtDate(g.capacao)]);
      }
      if (g.desmame) {
        linhas.push(['Desmame', fmtDate(g.desmame)]);
        if (parto) {
          const idadeDesmame = diffDays(parto, g.desmame);
          linhas.push(['Idade no desmame', idadeDesmame >= 0 ? plural(idadeDesmame, 'dia', 'dias') : '—']);
        }
      } else if (parto) {
        const desmamePrevisto = addDays(parto, DESMAME_DIAS);
        linhas.push(['Desmame previsto', fmtDate(desmamePrevisto)]);
        const idadePrevista = diffDays(parto, desmamePrevisto);
        linhas.push(['Idade no desmame', `${plural(idadePrevista, 'dia', 'dias')} (previsto)`]);
      }
    }
    return `<article class="cria card">
      <header><h3>${ordinal(n)} gestação</h3>${badgeGestacao(g)}</header>
      <dl class="kv">${linhas.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${aps.length ? `<div class="dose-list">${aps.map((x) => doseChip(x, `${nomeProduto(x)} ${dose(numeroDose(x))} · ${fmtDate(x.data)}`)).join('')}</div>` : ''}
      ${filhos.length ? `<p class="filhos"><span class="muted">Em Animais:</span> ${filhos.map((x) => `<a href="#/animal/${x.id}">${esc(x.nome)}</a>`).join(', ')}</p>` : ''}
      ${g.obs ? `<p class="obs">${esc(g.obs)}</p>` : ''}
      ${editBtn(`<footer><button type="button" class="btn small ghost" data-act="gestacao-edit" data-id="${g.id}">${ICON.edit} ${nascida ? 'Editar' : 'Registrar parto'}</button>
        <button type="button" class="btn small ghost" data-act="aplicacao-new" data-gestacao="${g.id}">${ICON.syringe} Aplicação</button></footer>`)}
    </article>`;
  }

  // ---------- Saúde ----------

  // Opções da aba Saúde, guardadas neste aparelho
  const SAUDE_KEY = 'porcos:saude';
  const saudeOpcoes = (() => {
    const padrao = { doses: false, animais: 'plantel' };
    try {
      return { ...padrao, ...JSON.parse(localStorage.getItem(SAUDE_KEY) || '{}') };
    } catch (e) {
      return padrao;
    }
  })();

  function setSaude(k, v) {
    saudeOpcoes[k] = v;
    try {
      localStorage.setItem(SAUDE_KEY, JSON.stringify(saudeOpcoes));
    } catch (e) { /* sem armazenamento: vale até fechar o site */ }
    render();
  }

  // Aplicação aparece em Saúde? Só as dos animais (as das crias ficam em Crias), seguindo o filtro de animais.
  const apNoFiltro = (x) => !!x.animal_id && (saudeOpcoes.animais === 'todos' || noPlantel(animal(x.animal_id) || {}));

  const dosesChips = (aps) => `<div class="dose-list">${aps.map((x, k) => doseChip(x, `${dose(k + 1)} · ${fmtDate(x.data)}`)).join('')}</div>`;

  function renderSaude() {
    const todos = saudeOpcoes.animais === 'todos';
    const comDoses = saudeOpcoes.doses;
    const cal = calendario(todos);
    const produtos = produtosOrdenados();
    const produtoUsado = (id) => db.aplicacoes.some((x) => x.produto_id === id);
    const comReforco = produtos.filter((p) => p.intervalo_dias && produtoUsado(p.id));
    // Aplicações de cada animal, contando as de quando era cria
    const apsAnimais = db.animais.flatMap((a) => aplicacoesAnimal(a.id));

    const calHtml = comReforco.map((p) => {
      const rows = cal.filter((r) => r.produto.id === p.id);
      return bloco(`saude-${p.id}`, `${esc(p.nome)} <small class="muted">a cada ${p.intervalo_dias} dias</small>`,
        rows.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Animal</th>${comDoses ? '<th>Doses aplicadas</th>' : ''}<th>Última</th><th>Próxima</th><th>Situação</th></tr></thead>
          <tbody>${rows.map((r) => `<tr${r.saiu ? ' class="saiu"' : ''}><th scope="row"><a href="#/animal/${r.animal.id}">${esc(r.animal.nome)}</a></th>
            ${comDoses ? `<td>${r.aps.length ? dosesChips(r.aps) : '<span class="muted">—</span>'}</td>` : ''}
            <td>${esc(fmtDate(r.ultima))}${r.doses ? `<small class="muted block">${dose(r.doses)}</small>` : ''}</td>
            <td>${esc(fmtDate(r.proxima))}${r.proxima ? `<small class="muted block">${dose(r.doses + 1)}</small>` : ''}</td>
            <td>${badgeVacina(r)}</td></tr>`).join('')}</tbody>
        </table></div>` : `<p class="muted">${todos ? 'Nenhum animal.' : 'Nenhum animal no plantel.'}</p>`);
    }).join('');

    // Produtos sem "repetir a cada": uso esporádico, mostra as aplicações feitas nos animais.
    // Com "Mostrar doses aplicadas", uma linha por animal com todas as doses.
    const nenhuma = `<p class="muted">Nenhuma aplicação em ${todos ? 'animais' : 'animais do plantel'}. As das crias ficam em <a href="#/crias">Crias</a>.</p>`;
    const esporadicoHtml = produtos.filter((p) => !p.intervalo_dias && produtoUsado(p.id)).map((p) => {
      const aps = sortByDate(apsAnimais.filter((x) => x.produto_id === p.id && apNoFiltro(x)), 'data', true);
      let corpo;
      if (!aps.length) return '';
      if (comDoses) {
        const grupos = new Map();
        [...aps].reverse().forEach((x) => {
          if (!grupos.has(x.animal_id)) grupos.set(x.animal_id, []);
          grupos.get(x.animal_id).push(x);
        });
        const linhas = [...grupos.values()].sort((a, b) => b[b.length - 1].data.localeCompare(a[a.length - 1].data));
        corpo = `<div class="table-wrap"><table class="table">
          <thead><tr><th>Animal</th><th>Doses aplicadas</th><th>Última</th></tr></thead>
          <tbody>${linhas.map((list) => {
            const a = animal(list[0].animal_id) || {};
            const saiu = !noPlantel(a);
            return `<tr${saiu ? ' class="saiu"' : ''}>
              <th scope="row"><a href="#/animal/${a.id}">${esc(a.nome || '—')}</a>
                ${saiu ? `<small class="muted block">${esc(statusAnimal(a))}</small>` : ''}</th>
              <td>${dosesChips(list)}</td><td>${esc(fmtDate(list[list.length - 1].data))}</td></tr>`;
          }).join('')}</tbody>
        </table></div>`;
      } else {
        const mostra = filters.esporadicoTodos.has(p.id) ? aps : aps.slice(0, 10);
        corpo = `<div class="table-wrap"><table class="table">
          <thead><tr><th>Data</th><th>Animal</th><th>Dose</th></tr></thead>
          <tbody>${mostra.map((x) => `<tr${canEdit() ? ` class="clickable" data-act="aplicacao-edit" data-id="${x.id}"` : ''}>
            <td>${esc(fmtDate(x.data))}</td>
            <td><a href="#/animal/${x.animal_id}">${esc(nomeAnimal(x.animal_id))}</a>${x.obs ? `<small class="muted block">${esc(x.obs)}</small>` : ''}</td>
            <td>${dose(numeroDose(x))}${x.deCria ? '<small class="muted block">de cria</small>' : ''}</td></tr>`).join('')}</tbody>
        </table></div>
        ${aps.length > mostra.length ? `<button type="button" class="btn small ghost" data-act="esporadico-todos" data-id="${p.id}">Mostrar todas (${aps.length})</button>` : ''}`;
      }
      return bloco(`saude-${p.id}`, `${esc(p.nome)} <small class="muted">uso esporádico</small>`, corpo);
    }).join('');

    const opcoesHtml = `<div class="calc-bar card saude-opcoes">
        <label class="check"><input type="checkbox" data-act-change="saude-doses"${comDoses ? ' checked' : ''}><span>Mostrar doses aplicadas</span></label>
        <div class="calc-field"><span class="calc-label">Animais</span>
          <div class="seg" role="group" aria-label="Quais animais">
            <button type="button" class="${todos ? '' : 'on'}" aria-pressed="${!todos}" data-act="saude-animais" data-value="plantel">No plantel</button>
            <button type="button" class="${todos ? 'on' : ''}" aria-pressed="${todos}" data-act="saude-animais" data-value="todos">Todos</button>
          </div></div>
      </div>`;

    const hist = sortByDate(db.aplicacoes.filter(apNoFiltro), 'data', true);
    const mostra = filters.histTodos ? hist : hist.slice(0, 15);
    const histHtml = hist.length
      ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Data</th><th>Produto</th><th>Animal</th></tr></thead>
          <tbody>${mostra.map((x) => `<tr${canEdit() ? ` class="clickable" data-act="aplicacao-edit" data-id="${x.id}"` : ''}>
            <td>${esc(fmtDate(x.data))}</td><td>${esc(nomeProduto(x))}<small class="muted block">${dose(numeroDose(x))}</small></td>
            <td>${esc(nomeAnimal(x.animal_id))}${x.obs ? `<small class="muted block">${esc(x.obs)}</small>` : ''}</td></tr>`).join('')}</tbody>
        </table></div>
        ${hist.length > mostra.length ? `<button type="button" class="btn small ghost" data-act="hist-todos">Mostrar todas (${hist.length})</button>` : ''}`
      : nenhuma;

    const prodHtml = `<ul class="list">${produtos.map((p) => `<li class="list-row${canEdit() ? ' clickable' : ''}"${canEdit() ? ` data-act="produto-edit" data-id="${p.id}"` : ''}>
        <span><strong>${esc(p.nome)}</strong><small>${p.intervalo_dias ? `Repetir a cada ${p.intervalo_dias} dias` : 'Uso esporádico'}</small></span>
        <span class="right">${(() => {
          const b = bulaDe(p);
          return b
            ? `<a class="btn small ghost" href="${esc(b.url)}" target="_blank" rel="noopener noreferrer" title="Abrir a bula de ${esc(p.nome)}${b.arquivo ? ' (arquivo enviado)' : ''}">Ver bula</a>`
            : '<small class="muted">sem bula</small>';
        })()}</span></li>`).join('')}</ul>
      ${editBtn(`<button type="button" class="btn small" data-act="produto-new">${ICON.plus} Produto</button>`)}`;

    return `${pageHead('Saúde', 'Vacinas e remédios: calendário dos de uso recorrente e aplicações dos de uso esporádico',
      editBtn(`<button type="button" class="btn primary" data-act="aplicacao-new">${ICON.syringe} Registrar aplicação</button>`))}
      ${opcoesHtml}
      ${calHtml ? `<h2 class="group-title">Uso recorrente</h2>${calHtml}` : ''}
      ${esporadicoHtml ? `<h2 class="group-title">Uso esporádico</h2>${esporadicoHtml}` : ''}
      ${!calHtml && !esporadicoHtml ? (produtos.length ? '<p class="muted">Nenhuma vacina ou remédio com aplicação registrada.</p>' : '<p class="muted">Nenhuma vacina ou remédio cadastrado.</p>') : ''}
      <div class="two-col">
        ${bloco('saude-historico', 'Últimas aplicações', histHtml)}
        <section class="section card"><h2>Vacinas e remédios</h2>${prodHtml}</section>
      </div>`;
  }

  // ---------- Ração ----------

  function racoesOrdenadas() {
    return [...db.racoes].sort((a, b) => a.ordem - b.ordem || a.fase.localeCompare(b.fase, 'pt-BR'));
  }

  // Ingredientes usados em alguma fase, na ordem em que aparecem
  function ingredientesRacao() {
    const nomes = [];
    racoesOrdenadas().forEach((r) => (r.itens || []).forEach((i) => {
      if (Number(i.pct) > 0 && i.nome && !nomes.includes(i.nome)) nomes.push(i.nome);
    }));
    return nomes;
  }

  /*
   * Como na Calculadora de ração: a partir do total da mistura ou da quantidade
   * de um ingrediente. Cada ingrediente = total × (% dele ÷ soma das %).
   */

  const PESO_FORMULA_DEFAULT = { k: 69.3, expC: 2, expL: 1 };

  function obterPesoFormula() {
    try {
      const raw = localStorage.getItem('porcos:peso_formula');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.k === 'number' && parsed.k > 0) {
          return {
            k: Number(parsed.k) || 69.3,
            expC: parsed.expC != null && !Number.isNaN(Number(parsed.expC)) ? Number(parsed.expC) : 2,
            expL: parsed.expL != null && !Number.isNaN(Number(parsed.expL)) ? Number(parsed.expL) : 1,
          };
        }
      }
    } catch {}
    return { ...PESO_FORMULA_DEFAULT };
  }

  function salvarPesoFormula(f) {
    try {
      localStorage.setItem('porcos:peso_formula', JSON.stringify(f));
    } catch {}
  }

  function obterPesoMedidas() {
    try {
      const raw = localStorage.getItem('porcos:peso_medidas');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {}
    return { cintura: '1,27', comprimento: '1,02' };
  }

  function salvarPesoMedidas(m) {
    try {
      localStorage.setItem('porcos:peso_medidas', JSON.stringify(m));
    } catch {}
  }

  function normalizarMedidaMetro(val) {
    if (val == null || val === '') return null;
    const s = String(val).trim().replace(/[^\d.,]/g, '').replace(',', '.');
    const n = parseFloat(s);
    if (Number.isNaN(n) || n <= 0) return null;
    // Se digitado em centímetros (ex.: 127 ou 102), converte dividindo por 100
    if (n >= 10) return n / 100;
    return n;
  }

  function calcularPesoEstimado(cinturaM, compM, formula) {
    const f = formula || obterPesoFormula();
    const c = normalizarMedidaMetro(cinturaM);
    const l = normalizarMedidaMetro(compM);
    if (!c || !l || c <= 0 || l <= 0) return null;
    const expC = Number(f.expC) != null && !Number.isNaN(Number(f.expC)) ? Number(f.expC) : 2;
    const expL = Number(f.expL) != null && !Number.isNaN(Number(f.expL)) ? Number(f.expL) : 1;
    const k = Number(f.k) || 69.3;

    const peso = Math.pow(c, expC) * Math.pow(l, expL) * k;
    if (!Number.isFinite(peso) || peso <= 0) return null;

    const min3 = peso * 0.97;
    const max3 = peso * 1.03;

    return { c, l, k, expC, expL, peso, min3, max3 };
  }

  const fmtKg1 = (v) => (v == null || Number.isNaN(v) ? '—' : `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`);
  const fmtM2 = (v) => (v == null || Number.isNaN(v) ? '—' : `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`);

  function renderPesoResultadoHtml(res, animalObj) {
    if (!res) {
      return `
        <div class="peso-display-box">
          <span class="peso-display-label">Peso Corporal Estimado</span>
          <span class="peso-display-value" style="color: var(--muted); font-size: 2rem;">Preencha as medidas</span>
          <p class="muted small" style="margin: 4px 0 0;">Informe a cintura e o comprimento para calcular em tempo real.</p>
        </div>`;
    }

    const { c, l, k, expC, expL, peso, min3, max3 } = res;
    const cStr = c.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const lStr = l.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const kStr = k.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

    let expressaoMath = '';
    if (expC === 2 && expL === 1) {
      expressaoMath = `${cStr} × ${cStr} × ${lStr} × ${kStr} = <strong>${fmtKg1(peso)}</strong>`;
    } else {
      const parteC = expC === 1 ? cStr : `${cStr}<sup>${expC}</sup>`;
      const parteL = expL === 1 ? lStr : `${lStr}<sup>${expL}</sup>`;
      expressaoMath = `${parteC} × ${parteL} × ${kStr} = <strong>${fmtKg1(peso)}</strong>`;
    }

    return `
      <div class="peso-display-box">
        <span class="peso-display-label">Peso Corporal Estimado</span>
        <span class="peso-display-value">${fmtKg1(peso)}</span>
        <div class="peso-display-range">
          <span>Faixa provável (±3%): <strong>${fmtKg1(min3)}</strong> a <strong>${fmtKg1(max3)}</strong></span>
        </div>
      </div>

      <div class="peso-calc-breakdown">
        <span class="peso-calc-formula-title">Cálculo passo a passo (em tempo real)</span>
        <div class="peso-calc-math">${expressaoMath}</div>
        <div class="peso-calc-legend">
          <span>• <strong>Cintura (C):</strong> ${fmtM2(c)} (${Math.round(c * 100)} cm)${expC !== 1 ? ` com expoente ${expC} = ${(Math.pow(c, expC)).toFixed(4)}` : ''}</span>
          <span>• <strong>Comprimento (L):</strong> ${fmtM2(l)} (${Math.round(l * 100)} cm)${expL !== 1 ? ` com expoente ${expL} = ${(Math.pow(l, expL)).toFixed(4)}` : ''}</span>
          <span>• <strong>Constante K:</strong> ${kStr} (fator multiplicador padrão SOS Suínos)</span>
          <span>• <strong>Margem de erro estimada:</strong> ±3% para animais em estação e postura natural.</span>
        </div>
      </div>`;
  }

  function renderPesoSemBalanca(switcherHtml = '') {
    const formula = obterPesoFormula();
    const medidas = obterPesoMedidas();
    const res = calcularPesoEstimado(medidas.cintura, medidas.comprimento, formula);

    const configPanelHtml = pesoEditandoFormula ? `
      <div class="peso-config-panel">
        <div class="peso-config-title">
          <span>⚙️ Configuração da Fórmula Biométrica</span>
          <button type="button" class="icon" data-act="peso-cancelar-formula" title="Fechar configuração">✕</button>
        </div>
        <p class="muted small" style="margin: 0;">
          A fórmula padrão da SOS Suínos é: <strong>Peso (kg) = Cintura² × Comprimento × 69,3</strong>.
          Você pode calibrar o fator K ou os expoentes conforme seu lote.
        </p>
        <div class="peso-config-grid">
          <label class="peso-field">
            <span>Fator multiplicador (K)</span>
            <input id="inputPesoK" inputmode="decimal" value="${esc(toInput(formula.k))}">
          </label>
          <label class="peso-field">
            <span>Expoente da Cintura (C)</span>
            <input id="inputPesoExpC" inputmode="numeric" value="${esc(toInput(formula.expC))}">
          </label>
          <label class="peso-field">
            <span>Expoente do Comprimento (L)</span>
            <input id="inputPesoExpL" inputmode="numeric" value="${esc(toInput(formula.expL))}">
          </label>
        </div>
        <div class="peso-config-actions">
          <button type="button" class="btn primary" data-act="peso-salvar-formula">Salvar Fórmula</button>
          <button type="button" class="btn" data-act="peso-restaurar-formula" title="Volta para K=69,3, C² e L¹">Restaurar padrão (69,3)</button>
          <button type="button" class="btn ghost" data-act="peso-cancelar-formula">Fechar</button>
        </div>
      </div>` : '';

    return `${pageHead('Ração', 'Estimativa de peso biométrico sem balança (SOS Suínos)')}
      ${switcherHtml}
      ${configPanelHtml}

      <div class="peso-grid">
        <!-- Coluna 1: Entradas de medidas -->
        <div class="peso-card">
          <div class="peso-card-header">
            <h2>📏 Medidas do Animal</h2>
            <button type="button" class="btn ghost small" data-act="peso-toggle-config" title="Ajustar fator K e expoentes da fórmula">
              ⚙️ ${pesoEditandoFormula ? 'Ocultar Fórmula' : 'Editar Fórmula'}
            </button>
          </div>

          <div class="peso-field">
            <label for="pesoCintura">
              Cintura / Perímetro Torácico (C)
            </label>
            <div class="peso-field-input-wrap">
              <input id="pesoCintura" inputmode="decimal" value="${esc(medidas.cintura || '')}" placeholder="Ex.: 1,27 ou 127" autocomplete="off">
              <span class="unit">metros (m)</span>
            </div>
            <small class="muted">Medir com fita logo atrás das patas dianteiras. Aceita metros (ex: 1,27) ou cm (ex: 127).</small>
          </div>

          <div class="peso-field">
            <label for="pesoComprimento">
              Comprimento (L)
            </label>
            <div class="peso-field-input-wrap">
              <input id="pesoComprimento" inputmode="decimal" value="${esc(medidas.comprimento || '')}" placeholder="Ex.: 1,02 ou 102" autocomplete="off">
              <span class="unit">metros (m)</span>
            </div>
            <small class="muted">Medir da base da orelha até a base do rabo. Aceita metros (ex: 1,02) ou cm (ex: 102).</small>
          </div>

          <div style="background: var(--surface-2); padding: 12px 14px; border-radius: 10px; border: 1px solid var(--line); font-size: 0.85rem;">
            <strong>Fórmula configurada:</strong>
            <span style="font-family: var(--mono); color: var(--accent); font-weight: 700; margin-left: 4px;">
              C<sup>${formula.expC}</sup> × L<sup>${formula.expL}</sup> × ${formula.k.toLocaleString('pt-BR')}
            </span>
          </div>
        </div>

        <!-- Coluna 2: Resultado em tempo real -->
        <div class="peso-card">
          <div class="peso-card-header">
            <h2>⚖️ Resultado Estimado</h2>
          </div>

          <div id="pesoResultadoBox" style="display: flex; flex-direction: column; gap: 16px;">
            ${renderPesoResultadoHtml(res)}
          </div>
        </div>
      </div>

      <!-- Guia ilustrativo de medição SOS Suínos -->
      <div class="peso-guia-card">
        <h3>📖 Como Medir Corretamente (SOS Suínos)</h3>
        <p class="muted small" style="margin: 0;">
          Para garantir a máxima precisão da estimativa de peso (margem de erro de ~3%), o animal deve estar em pé, na posição natural, sem curvar as costas.
        </p>
        <div class="peso-guia-steps">
          <div class="peso-guia-step">
            <div class="peso-guia-num">1</div>
            <div class="peso-guia-text">
              <strong>1. Cintura / Perímetro (C)</strong>
              <p>Passe a fita métrica ou barbante ao redor do corpo do porco, bem justo logo atrás das patas dianteiras (tórax).</p>
            </div>
          </div>
          <div class="peso-guia-step">
            <div class="peso-guia-num">2</div>
            <div class="peso-guia-text">
              <strong>2. Comprimento (L)</strong>
              <p>Meça sobre a linha do lombo, da base entre as orelhas até o início/base da cauda.</p>
            </div>
          </div>
          <div class="peso-guia-step">
            <div class="peso-guia-num">3</div>
            <div class="peso-guia-text">
              <strong>3. Fórmula SOS Suínos</strong>
              <p>Multiplica-se C × C × L × 69,3. Exemplo: 1,27 m × 1,27 m × 1,02 m × 69,3 = 114,0 kg.</p>
            </div>
          </div>
        </div>
      </div>`;
  }

  function atualizarCalculoPeso() {
    const cEl = $('#pesoCintura');
    const lEl = $('#pesoComprimento');
    if (!cEl || !lEl) return;

    const medidas = {
      cintura: cEl.value,
      comprimento: lEl.value,
    };
    salvarPesoMedidas(medidas);

    const formula = obterPesoFormula();
    const res = calcularPesoEstimado(medidas.cintura, medidas.comprimento, formula);
    const box = $('#pesoResultadoBox');
    if (box) {
      box.innerHTML = renderPesoResultadoHtml(res);
    }
  }

  function renderRacao() {
    const switcherHtml = `
      <div class="view-switch-bar">
        <div class="seg" role="group" aria-label="Visão da aba Ração">
          <button type="button" class="${racaoAba === 'racao' ? 'on' : ''}" aria-pressed="${racaoAba === 'racao'}" data-act="racao-aba" data-value="racao">Cálculo de Ração</button>
          <button type="button" class="${racaoAba === 'peso' ? 'on' : ''}" aria-pressed="${racaoAba === 'peso'}" data-act="racao-aba" data-value="peso">⚖️ Peso sem Balança</button>
        </div>
      </div>`;

    if (racaoAba === 'peso') {
      return renderPesoSemBalanca(switcherHtml);
    }

    const nomes = ingredientesRacao();
    if (!nomes.includes(racaoIng)) racaoIng = nomes.includes('Milho') ? 'Milho' : nomes[0] || '';
    const porIngrediente = racaoModo === 'ingrediente' && !!racaoIng;

    const cards = racoesOrdenadas().map((r) => {
      const itens = (r.itens || []).filter((i) => Number(i.pct) > 0);
      const soma = itens.reduce((s, i) => s + Number(i.pct), 0);
      const baseItem = porIngrediente ? itens.find((i) => i.nome === racaoIng) : null;
      let total = soma > 0 ? racaoQtd : NaN;
      if (porIngrediente) total = baseItem ? (racaoQtd * soma) / Number(baseItem.pct) : NaN;
      const kg = (pct) => (Number.isFinite(total) ? esc(fmtKg((total * pct) / soma)) : '—');
      const ok = Math.abs(soma - 100) < 0.01;
      return `<article class="card racao${porIngrediente && !baseItem ? ' sem-base' : ''}">
        <header><div><h3>${esc(r.fase)}</h3>${r.faixa ? `<small class="muted">${esc(r.faixa)}</small>` : ''}</div>
          ${editBtn(`<button type="button" class="icon" data-act="racao-edit" data-id="${r.id}" aria-label="Editar ${esc(r.fase)}" title="Editar">${ICON.edit}</button>`)}</header>
        <table class="table compact">
          <tbody>${itens.map((i) => `<tr${baseItem === i ? ' class="base"' : ''}><th scope="row">${esc(i.nome)}</th>
            <td class="num muted">${esc(fmtPct(Number(i.pct)))}</td>
            <td class="num"><strong>${kg(Number(i.pct))}</strong></td></tr>`).join('')}</tbody>
          <tfoot><tr><th scope="row">Total da mistura</th><td class="num ${ok ? 'muted' : 'danger-text'}">${esc(fmtPct(soma))}</td>
            <td class="num"><strong>${Number.isFinite(total) ? esc(fmtKg(total)) : '—'}</strong></td></tr></tfoot>
        </table>
        ${ok ? '' : '<p class="danger-text small">As porcentagens não somam 100%: as quantidades foram calculadas proporcionalmente.</p>'}
        ${porIngrediente && !baseItem ? `<p class="muted small">Esta fase não leva ${esc(racaoIng.toLowerCase())}.</p>` : ''}
      </article>`;
    }).join('');

    return `${pageHead('Ração', 'Quanto vai de cada ingrediente em cada fase',
      editBtn(`<button type="button" class="btn" data-act="racao-new">${ICON.plus} Fase</button>`))}
      ${switcherHtml}
      <div class="calc-bar card">
        <div class="calc-field"><span class="calc-label">Calcular a partir de</span>
          <div class="seg" role="group" aria-label="Calcular a partir de">
            <button type="button" class="${porIngrediente ? '' : 'on'}" aria-pressed="${!porIngrediente}" data-act="racao-modo" data-value="total">Total da mistura</button>
            <button type="button" class="${porIngrediente ? 'on' : ''}" aria-pressed="${porIngrediente}" data-act="racao-modo" data-value="ingrediente">Um ingrediente</button>
          </div></div>
        ${porIngrediente ? `<label class="calc-field"><span class="calc-label">Ingrediente</span>
          <select id="racaoIng">${nomes.map((n) => `<option${n === racaoIng ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : ''}
        <label class="calc-field"><span class="calc-label">${porIngrediente ? `Quantidade de ${esc(racaoIng.toLowerCase())}` : 'Total da mistura'}</span>
          <span class="qty"><input id="racaoQtd" inputmode="decimal" value="${esc(toInput(racaoQtd))}" autocomplete="off"><span>kg</span></span></label>
      </div>
      <div class="racao-grid" id="racaoGrid">${cards || '<p class="muted">Nenhuma fórmula cadastrada.</p>'}</div>
      ${CFG.calculadoraUrl ? `<p class="muted small">Também dá para usar a <a href="${esc(CFG.calculadoraUrl)}" target="_blank" rel="noopener">Calculadora de ração</a>.</p>` : ''}`;
  }

  // ---------- Finanças ----------

  const anoDe = (s) => String(s).slice(0, 4);

  function renderFinancas() {
    const anos = [...new Set([...db.lancamentos.map((l) => anoDe(l.data)), ...db.abates.map((a) => anoDe(a.data))])].sort().reverse();
    const ano = anos.includes(filters.ano) ? filters.ano : 'todos';
    const noAno = (s) => ano === 'todos' || anoDe(s) === ano;
    const lancs = db.lancamentos.filter((l) => noAno(l.data));
    const abates = sortByDate(db.abates.filter((a) => noAno(a.data)), 'data', true);
    const t = totaisFinancas(lancs);

    // Resumo por mês
    const meses = new Map();
    lancs.forEach((l) => {
      const k = l.data.slice(0, 7);
      if (!meses.has(k)) meses.set(k, []);
      meses.get(k).push(l);
    });
    const mesesHtml = [...meses.keys()].sort().reverse().map((k) => {
      const m = totaisFinancas(meses.get(k));
      return `<tr><th scope="row">${esc(fmtMonth(k))}</th><td class="num">${esc(fmtMoney(m.soro))}</td><td class="num">${esc(fmtMoney(m.racao))}</td>
        <td class="num">${esc(fmtMoney(m.outras))}</td><td class="num pos-text">${esc(fmtMoney(m.receitas))}</td>
        <td class="num ${m.saldo < 0 ? 'neg-text' : 'pos-text'}"><strong>${esc(fmtMoney(m.saldo))}</strong></td></tr>`;
    }).join('');

    const lista = sortByDate(lancs, 'data', true);
    const mostra = filters.lancTodos ? lista : lista.slice(0, 12);
    const lancHtml = lista.length
      ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th class="num">Valor</th></tr></thead>
          <tbody>${mostra.map((l) => `<tr${canEdit() ? ` class="clickable" data-act="lancamento-edit" data-id="${l.id}"` : ''}>
            <td>${esc(fmtDate(l.data))}</td><td>${esc(LANCAMENTOS[l.categoria].label)}</td><td>${esc(l.descricao || '—')}</td>
            <td class="num ${l.tipo === 'receita' ? 'pos-text' : 'neg-text'}">${l.tipo === 'receita' ? '+' : '−'} ${esc(fmtMoney(l.valor))}</td></tr>`).join('')}</tbody>
        </table></div>
        ${lista.length > mostra.length ? `<button type="button" class="btn small ghost" data-act="lanc-todos">Mostrar todos (${lista.length})</button>` : ''}`
      : '<p class="muted">Nenhum lançamento.</p>';

    const carne = abates.reduce((s, a) => s + kgParte(a, 'Carne'), 0);
    const peso = abates.reduce((s, a) => s + pesoAbate(a), 0);
    const valorAbates = abates.reduce((s, a) => s + Number(a.valor || 0), 0);
    // Uma coluna para cada parte que aparece nos abates do período
    const colunas = colunasPartes(abates);
    const celula = (a, col) => {
      const list = partesAbate(a).filter((i) => i.parte.trim().toLowerCase() === col.key);
      if (!list.length) return '<span class="muted">—</span>';
      if (list.some((i) => i.kg != null)) return esc(fmtKg(list.reduce((s, i) => s + Number(i.kg || 0), 0)));
      const v = list.reduce((s, i) => s + Number(i.valor || 0), 0);
      return v ? `<span class="muted">${esc(fmtMoney(v))}</span>` : '<span class="muted">sim</span>';
    };
    const totalColuna = (col) => {
      const list = abates.flatMap((a) => partesAbate(a).filter((i) => i.parte.trim().toLowerCase() === col.key && i.kg != null));
      return list.length ? fmtKg(list.reduce((s, i) => s + Number(i.kg), 0)) : '—';
    };
    const abatesHtml = abates.length
      ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Data</th><th>Animal</th>${colunas.map((c) => `<th class="num">${esc(c.nome)}</th>`).join('')}<th class="num">Valor</th></tr></thead>
          <tbody>${abates.map((a) => `<tr${canEdit() ? ` class="clickable" data-act="abate-edit" data-id="${a.id}"` : ''}>
            <td>${esc(fmtDate(a.data))}</td><td>${a.animal_id ? esc(nomeAnimal(a.animal_id)) : '<span class="muted">—</span>'}</td>
            ${colunas.map((c) => `<td class="num">${celula(a, c)}</td>`).join('')}
            <td class="num">${esc(fmtMoney(a.valor))}</td></tr>`).join('')}</tbody>
          <tfoot><tr><th scope="row" colspan="2">Total</th>${colunas.map((c) => `<td class="num">${esc(totalColuna(c))}</td>`).join('')}
            <td class="num">${esc(fmtMoney(valorAbates))}</td></tr></tfoot>
        </table></div>
        ${porParteHtml(abates)}`
      : '<p class="muted">Nenhum abate.</p>';

    const chip = (v, label) => `<button type="button" class="chip${ano === v ? ' on' : ''}" data-act="filter-ano" data-value="${v}">${label}</button>`;
    return `${pageHead('Finanças', 'Gastos, receitas e abates',
      editBtn(`<button type="button" class="btn primary" data-act="lancamento-new">${ICON.plus} Lançamento</button>
        <button type="button" class="btn" data-act="abate-new">${ICON.plus} Abate</button>`))}
      <div class="chips">${chip('todos', 'Tudo')}${anos.map((a) => chip(a, a)).join('')}</div>
      <div class="stats">
        ${stat('Despesas', fmtMoney(t.despesas), `Ração ${fmtMoney(t.racao)} · Soro ${fmtMoney(t.soro)}`)}
        ${stat('Receitas', fmtMoney(t.receitas), 'Vendas', 'pos')}
        ${stat('Saldo', fmtMoney(t.saldo), t.margem != null ? `Margem de ${fmtPct(t.margem)}` : '', t.saldo < 0 ? 'neg' : 'pos')}
        ${stat('Carne abatida', fmtKg(carne), `${plural(abates.length, 'abate', 'abates')} · ${fmtKg(peso)} no total · ${fmtMoney(valorAbates)}`)}
      </div>
      ${bloco('financas-meses', 'Por mês', meses.size ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Mês</th><th class="num">Soro</th><th class="num">Ração</th><th class="num">Outras</th><th class="num">Receitas</th><th class="num">Saldo</th></tr></thead>
          <tbody>${mesesHtml}</tbody>
          <tfoot><tr><th scope="row">Total</th><td class="num">${esc(fmtMoney(t.soro))}</td><td class="num">${esc(fmtMoney(t.racao))}</td><td class="num">${esc(fmtMoney(t.outras))}</td>
            <td class="num">${esc(fmtMoney(t.receitas))}</td><td class="num"><strong>${esc(fmtMoney(t.saldo))}</strong></td></tr></tfoot>
        </table></div>` : '<p class="muted">Nenhum lançamento.</p>')}
      ${bloco('financas-lancamentos', 'Lançamentos', lancHtml)}
      ${bloco('financas-abates', 'Abates', abatesHtml)}`;
  }

  // Tabela das partes de um abate
  function partesTabela(ab) {
    return `<div class="table-wrap"><table class="table compact partes-table">
      <thead><tr><th>Parte</th><th class="num">Peso</th><th class="num">Preço/kg</th><th class="num">Valor</th></tr></thead>
      <tbody>${partesAbate(ab).map((i) => `<tr><th scope="row">${esc(i.parte)}</th><td class="num">${esc(fmtKg(i.kg))}</td>
        <td class="num">${esc(fmtMoney(i.preco))}</td><td class="num">${esc(fmtMoney(i.valor))}</td></tr>`).join('')}</tbody>
    </table></div>`;
  }

  // Soma de cada parte nos abates do período, com o preço médio de quem tem valor
  function porParteHtml(abates) {
    const m = new Map();
    abates.forEach((a) => partesAbate(a).forEach((i) => {
      const k = i.parte.trim();
      const key = k.toLowerCase();
      if (!m.has(key)) m.set(key, { parte: k, kg: 0, valor: 0, kgComValor: 0, temValor: false });
      const x = m.get(key);
      x.kg += Number(i.kg || 0);
      if (i.valor != null) {
        x.temValor = true;
        x.valor += Number(i.valor);
        x.kgComValor += Number(i.kg || 0);
      }
    }));
    if (m.size < 2 && ![...m.values()].some((x) => x.temValor)) return '';
    const rows = [...m.values()].sort((a, b) => b.kg - a.kg);
    return bloco('financas-por-parte', 'Por parte', `<div class="table-wrap"><table class="table compact">
        <thead><tr><th>Parte</th><th class="num">Peso</th><th class="num">Valor</th><th class="num">Preço médio/kg</th></tr></thead>
        <tbody>${rows.map((x) => `<tr><th scope="row">${esc(x.parte)}</th><td class="num">${esc(fmtKg(x.kg))}</td>
          <td class="num">${x.temValor ? esc(fmtMoney(x.valor)) : '—'}</td>
          <td class="num">${x.temValor && x.kgComValor > 0 ? esc(fmtMoney(x.valor / x.kgComValor)) : '—'}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="muted small">Valor e preço médio só contam as partes lançadas com preço. Abates antigos têm só o valor total.</p>`, { sub: true });
  }

  // ---------- SOS Suínos (Documentos e Apoio ao Manejo) ----------

  function iconeTipoArquivo(ext) {
    if (ext === 'pdf') {
      return `<svg viewBox="0 0 24 24" class="svg-pdf" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h6"/><path d="M9 11h6"/><path d="M9 19h4"/></svg>`;
    }
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext)) {
      return `<svg viewBox="0 0 24 24" class="svg-img" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
    }
    if (['xls', 'xlsx', 'csv'].includes(ext)) {
      return `<svg viewBox="0 0 24 24" class="svg-sheet" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>`;
    }
    return `<svg viewBox="0 0 24 24" class="svg-doc" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  }

  function renderDocCard(d) {
    const url = docUrl[d.caminho];
    const catLabel = CATEGORIAS_DOC[d.categoria] || d.categoria || 'Outro';
    const ext = (d.nome_arquivo || '').split('.').pop().toLowerCase();
    const isImg = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext);
    const dataFmt = d.criado_em ? fmtDate(d.criado_em.slice(0, 10)) : '—';
    const icone = iconeTipoArquivo(ext);

    const thumbHtml = isImg && url ? `
      <div class="doc-thumb" data-act="sos-ver" data-id="${d.id}" title="Clique para visualizar">
        <img src="${url}" alt="${esc(d.titulo || d.nome_arquivo)}" loading="lazy">
      </div>` : '';

    return `
      <article class="doc-card card">
        ${thumbHtml}
        <div class="doc-card-top clickable" data-act="sos-ver" data-id="${d.id}" title="Clique para visualizar">
          <div class="doc-icon-wrap ext-${ext}">
            ${icone}
          </div>
          <div class="doc-card-info">
            <h3 class="doc-title" title="${esc(d.titulo || d.nome_arquivo)}">${esc(d.titulo || d.nome_arquivo)}</h3>
            <div class="doc-sub">
              <span class="badge cat-${esc(d.categoria || 'outro')}">${esc(catLabel)}</span>
              <span class="muted">${esc(fmtBytes(d.tamanho))}</span>
              <span class="muted">· ${esc(dataFmt)}</span>
            </div>
          </div>
        </div>
        <div class="doc-card-body">
          <div class="doc-filename muted" title="${esc(d.nome_arquivo)}">${esc(d.nome_arquivo)}</div>
          ${d.obs ? `<p class="doc-obs">${esc(d.obs)}</p>` : ''}
        </div>
        <div class="doc-card-actions">
          <button type="button" class="btn small primary" data-act="sos-ver" data-id="${d.id}" title="Visualizar na página">
            ${ICON.eye} Visualizar
          </button>
          ${url
            ? `<a class="btn small ghost icon" href="${url}" download="${esc(d.nome_arquivo)}" target="_blank" rel="noopener noreferrer" title="Baixar arquivo" aria-label="Baixar">${ICON.download}</a>`
            : `<button type="button" class="btn small ghost icon" data-act="sos-abrir" data-id="${d.id}" title="Baixar arquivo">${ICON.download}</button>`
          }
          ${canEdit() ? `
            <button type="button" class="btn small ghost icon" data-act="sos-edit" data-id="${d.id}" title="Editar informações" aria-label="Editar">${ICON.edit}</button>
            <button type="button" class="btn small danger-ghost icon" data-act="sos-delete" data-id="${d.id}" title="Excluir arquivo" aria-label="Excluir">${ICON.trash}</button>
          ` : ''}
        </div>
      </article>`;
  }

  async function abrirVisualizador(d) {
    if (!d) return;
    const dlg = $('#viewerDlg');
    if (!dlg) return;

    let url = docUrl[d.caminho];
    if (!url && navigator.onLine) {
      toast('Carregando arquivo…', 15000);
      try {
        const urls = await Cloud.documentoUrls([d]);
        if (urls[d.caminho]) {
          url = urls[d.caminho];
          docUrl[d.caminho] = url;
        }
      } catch (err) {
        console.error(err);
      }
    }

    const titleEl = $('#viewerTitle');
    const metaEl = $('#viewerMeta');
    const bodyEl = $('#viewerBody');
    const dlBtn = $('#viewerDownloadBtn');
    const newTabBtn = $('#viewerNewTabBtn');

    const ext = (d.nome_arquivo || '').split('.').pop().toLowerCase();
    const catLabel = CATEGORIAS_DOC[d.categoria] || d.categoria || 'Outro';
    const dataFmt = d.criado_em ? fmtDate(d.criado_em.slice(0, 10)) : '—';

    if (titleEl) titleEl.textContent = d.titulo || d.nome_arquivo;
    if (metaEl) {
      metaEl.innerHTML = `
        <span class="badge cat-${esc(d.categoria || 'outro')}">${esc(catLabel)}</span>
        <span class="muted">${esc(d.nome_arquivo)}</span>
        <span class="muted">· ${esc(fmtBytes(d.tamanho))}</span>
        <span class="muted">· ${esc(dataFmt)}</span>
        ${d.obs ? `<span class="muted">· "${esc(d.obs)}"</span>` : ''}
      `;
    }

    if (dlBtn) {
      if (url) {
        dlBtn.href = url;
        dlBtn.download = d.nome_arquivo;
        dlBtn.hidden = false;
      } else {
        dlBtn.hidden = true;
      }
    }
    if (newTabBtn) {
      if (url) {
        newTabBtn.href = url;
        newTabBtn.hidden = false;
      } else {
        newTabBtn.hidden = true;
      }
    }

    if (!url) {
      bodyEl.innerHTML = `<div class="viewer-fallback">
        <div class="viewer-fallback-icon">${iconeTipoArquivo(ext)}</div>
        <p><strong>Sem conexão com a nuvem</strong></p>
        <p class="muted">Conecte-se à internet para visualizar ou baixar este arquivo.</p>
      </div>`;
      dlg.showModal();
      return;
    }

    const isPdf = ext === 'pdf';
    const isImg = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext);
    const isText = ['txt', 'csv', 'log', 'json'].includes(ext);

    if (isImg) {
      bodyEl.innerHTML = `<div class="viewer-img-wrap">
        <img src="${url}" alt="${esc(d.titulo || d.nome_arquivo)}" class="viewer-img">
      </div>`;
    } else if (isPdf) {
      bodyEl.innerHTML = `<iframe src="${url}#view=FitH" class="viewer-frame" title="${esc(d.titulo || d.nome_arquivo)}"></iframe>`;
    } else if (isText) {
      bodyEl.innerHTML = `<div class="muted" style="padding: 20px;">Carregando texto…</div>`;
      dlg.showModal();
      try {
        const resp = await fetch(url);
        const txt = await resp.text();
        bodyEl.innerHTML = `<pre class="viewer-text"><code>${esc(txt)}</code></pre>`;
      } catch (err) {
        bodyEl.innerHTML = `<div class="viewer-fallback">
          <p class="muted">Não foi possível carregar a prévia do texto.</p>
          <a class="btn primary" href="${url}" download="${esc(d.nome_arquivo)}">${ICON.download} Baixar arquivo</a>
        </div>`;
      }
      return;
    } else {
      bodyEl.innerHTML = `<div class="viewer-fallback">
        <div class="viewer-fallback-icon">${iconeTipoArquivo(ext)}</div>
        <p><strong>${esc(d.nome_arquivo)}</strong></p>
        <p class="muted">Este tipo de arquivo (.${ext.toUpperCase()}) não pode ser visualizado diretamente no navegador, mas você pode baixá-lo no seu aparelho.</p>
        <a class="btn primary" href="${url}" download="${esc(d.nome_arquivo)}">${ICON.download} Baixar arquivo (${esc(fmtBytes(d.tamanho))})</a>
      </div>`;
    }

    dlg.showModal();
  }

  function renderSos() {
    const docs = db.documentos || [];
    const totalArquivos = docs.length;
    const totalBytes = docs.reduce((acc, d) => acc + (Number(d.tamanho) || 0), 0);

    // Contadores por categoria
    const counts = { todos: totalArquivos };
    Object.keys(CATEGORIAS_DOC).forEach((k) => {
      counts[k] = docs.filter((d) => d.categoria === k).length;
    });

    // Filtros
    let lista = docs;
    if (filtroSos !== 'todos') {
      lista = lista.filter((d) => d.categoria === filtroSos);
    }
    if (buscaSos.trim()) {
      const q = buscaSos.toLowerCase().trim();
      lista = lista.filter((d) =>
        (d.titulo && d.titulo.toLowerCase().includes(q)) ||
        (d.nome_arquivo && d.nome_arquivo.toLowerCase().includes(q)) ||
        (d.obs && d.obs.toLowerCase().includes(q)) ||
        (CATEGORIAS_DOC[d.categoria] && CATEGORIAS_DOC[d.categoria].toLowerCase().includes(q))
      );
    }
    lista = [...lista].sort((a, b) => (b.criado_em || '').localeCompare(a.criado_em || '') || (b.ordem || 0) - (a.ordem || 0));

    // Chips de filtro
    const chip = (k, label) => `<button type="button" class="chip${filtroSos === k ? ' on' : ''}${counts[k] === 0 && k !== 'todos' ? ' dim' : ''}" data-act="sos-filtro" data-value="${k}">${label} <span class="n">${counts[k]}</span></button>`;
    const chipsHtml = `<div class="chips">
      ${chip('todos', 'Todos')}
      ${Object.entries(CATEGORIAS_DOC).map(([k, label]) => chip(k, label)).join('')}
    </div>`;

    // Dropzone card
    const dropzoneHtml = canEdit() ? `
      <div class="sos-dropzone card" id="sosDropzone" tabindex="0" role="button" aria-label="Enviar novo arquivo para Documentos" data-act="sos-novo">
        <div class="sos-dropzone-icon">${ICON.upload}</div>
        <div class="sos-dropzone-text">
          <strong>Clique para selecionar ou arraste arquivos aqui</strong>
          <small class="muted">Suporta PDFs, imagens, laudos, manuais, planilhas e documentos (até 50 MB)</small>
        </div>
        <button type="button" class="btn primary small">${ICON.plus} Selecionar arquivo</button>
      </div>` : '';

    // Estatísticas
    const statsHtml = `
      <div class="stats" style="margin-bottom: 20px;">
        <div class="stat">
          <span class="stat-label">Arquivos salvos</span>
          <span class="stat-value">${totalArquivos}</span>
          <span class="stat-sub">${plural(totalArquivos, 'documento no plantel', 'documentos no plantel')}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Espaço utilizado</span>
          <span class="stat-value">${fmtBytes(totalBytes)}</span>
          <span class="stat-sub">Armazenamento em nuvem</span>
        </div>
        <div class="stat">
          <span class="stat-label">Manuais & Guias</span>
          <span class="stat-value">${counts.manual || 0}</span>
          <span class="stat-sub">Cartilhas técnicas</span>
        </div>
        <div class="stat">
          <span class="stat-label">Saúde & Laudos</span>
          <span class="stat-value">${(counts.saude || 0) + (counts.laudo || 0)}</span>
          <span class="stat-sub">Exames e veterinária</span>
        </div>
      </div>`;

    // Busca
    const buscaHtml = totalArquivos > 0 ? `
      <div class="sos-search-bar">
        <input type="search" class="busca" id="buscaSos" placeholder="Buscar documento por nome, categoria ou anotação…" value="${esc(buscaSos)}" autocomplete="off">
      </div>` : '';

    // Render list/cards
    let docsHtml = '';
    if (!lista.length) {
      if (totalArquivos === 0) {
        docsHtml = `<div class="card empty-box" style="padding: 32px 20px; text-align: center; flex-direction: column; gap: 12px; justify-content: center;">
          <div style="font-size: 2.2rem; color: var(--accent);">${ICON.fileText}</div>
          <div>
            <h3 style="font-size: 1.15rem; margin-bottom: 4px;">Nenhum arquivo enviado ainda</h3>
            <p class="muted" style="max-width: 480px; margin: 0 auto 16px;">Guarde aqui cartilhas sanitárias, manuais da Embrapa e ABCS, fotos de exames, receitas veterinárias e tabelas de apoio à criação de suínos.</p>
            ${canEdit() ? `<button type="button" class="btn primary" data-act="sos-novo">${ICON.plus} Enviar primeiro arquivo</button>` : ''}
          </div>
        </div>`;
      } else {
        docsHtml = `<div class="card empty-box" style="padding: 24px; text-align: center; justify-content: center;">
          <p class="muted">Nenhum documento encontrado com os filtros atuais.</p>
        </div>`;
      }
    } else {
      docsHtml = `<div class="sos-grid">${lista.map((d) => renderDocCard(d)).join('')}</div>`;
    }

    return `
      ${pageHead('Documentos', 'Manuais técnicos, laudos, cartilhas, bulas e arquivos de apoio ao manejo', canEdit() ? `<button type="button" class="btn primary" data-act="sos-novo">${ICON.plus} Enviar arquivo</button>` : '')}
      ${statsHtml}
      ${dropzoneHtml}
      ${chipsHtml}
      ${buscaHtml}
      ${docsHtml}
    `;
  }

  // ---------- DNP (Dias Não Produtivos) ----------

  function calcularDnpMatriz(m) {
    const gs = gestacoesDe(m.id);
    const dataFim = noPlantel(m) ? hoje() : (m.saida_data || hoje());
    const itens = [];
    const intervalosParto = [];

    // 1. Marrãs sem cobertura > 210 dias
    if (m.nascimento) {
      const meta210 = addDays(m.nascimento, 210);
      if (gs.length > 0) {
        const primeiroCruz = gs[0].cruzamento;
        const dias = diffDays(meta210, primeiroCruz);
        if (dias > 0) {
          itens.push({
            tipo: 'marra',
            rotulo: 'Marrã > 210d sem cobertura',
            badgeCls: 'dnp-marra',
            dias,
            periodo: `${fmtDate(meta210)} a ${fmtDate(primeiroCruz)}`,
            ativoHoje: false,
            obs: `Idade de 210 dias completada em ${fmtDate(meta210)}, primeira cobertura em ${fmtDate(primeiroCruz)}.`,
          });
        }
      } else {
        const dias = diffDays(meta210, dataFim);
        if (dias > 0) {
          const ativoHoje = noPlantel(m);
          itens.push({
            tipo: 'marra',
            rotulo: 'Marrã > 210d sem cobertura',
            badgeCls: 'dnp-marra',
            dias,
            periodo: `${fmtDate(meta210)} até ${ativoHoje ? 'hoje' : fmtDate(dataFim)}`,
            ativoHoje,
            obs: ativoHoje
              ? `Completou 210 dias em ${fmtDate(meta210)} e ainda não foi coberta.`
              : `Completou 210 dias em ${fmtDate(meta210)} e saiu sem cobertura.`,
          });
        }
      }
    }

    // 2. Atraso pós-desmame > 4 dias & 5. Intervalo de Partos > 140 dias
    for (let i = 0; i < gs.length; i++) {
      const g = gs[i];
      const gNext = gs[i + 1] || null;

      if (g.vivos != null) {
        const parto = partoDe(g);
        const desmame = g.desmame || addDays(parto, DESMAME_DIAS);
        const tolerancia = addDays(desmame, 4);

        if (gNext) {
          const dias = diffDays(tolerancia, gNext.cruzamento);
          if (dias > 0) {
            itens.push({
              tipo: 'desmame',
              rotulo: 'Atraso pós-desmame (> 4d)',
              badgeCls: 'dnp-desmame',
              dias,
              periodo: `${fmtDate(tolerancia)} a ${fmtDate(gNext.cruzamento)}`,
              ativoHoje: false,
              obs: `Desmame em ${fmtDate(desmame)}, tolerância até ${fmtDate(tolerancia)}, nova cobertura em ${fmtDate(gNext.cruzamento)}.`,
            });
          }
        } else {
          if (!m.descarte) {
            const dias = diffDays(tolerancia, dataFim);
            if (dias > 0) {
              const ativoHoje = noPlantel(m);
              itens.push({
                tipo: 'desmame',
                rotulo: 'Atraso pós-desmame (> 4d)',
                badgeCls: 'dnp-desmame',
                dias,
                periodo: `${fmtDate(tolerancia)} até ${ativoHoje ? 'hoje' : fmtDate(dataFim)}`,
                ativoHoje,
                obs: ativoHoje
                  ? `Desmame em ${fmtDate(desmame)}, tolerância até ${fmtDate(tolerancia)}. Aguardando nova cobertura.`
                  : `Desmame em ${fmtDate(desmame)}, saiu do plantel sem nova cobertura.`,
              });
            }
          }
        }

        if (gNext && gNext.vivos != null) {
          const ip = diffDays(parto, partoDe(gNext));
          if (ip > 140) {
            intervalosParto.push({
              g1: g,
              g2: gNext,
              ip,
              meta: 140,
              excesso: ip - 140,
              periodo: `${fmtDate(parto)} a ${fmtDate(partoDe(gNext))}`,
              obs: `${ordinal(numeroGestacao(g))} a ${ordinal(numeroGestacao(gNext))} gestação`,
            });
          }
        }
      }

      // 3. Repetição de cio
      if (g.repeticao_cio) {
        const fimRep = gNext ? gNext.cruzamento : dataFim;
        const dias = Math.max(0, diffDays(g.cruzamento, fimRep));
        const ativoHoje = noPlantel(m) && !gNext;
        if (dias > 0 || ativoHoje) {
          itens.push({
            tipo: 'cio',
            rotulo: 'Repetição de cio',
            badgeCls: 'dnp-cio',
            dias,
            periodo: `${fmtDate(g.cruzamento)} a ${gNext ? fmtDate(fimRep) : (ativoHoje ? 'hoje' : fmtDate(fimRep))}`,
            ativoHoje,
            obs: `Cobertura em ${fmtDate(g.cruzamento)} não vingou.${gNext ? ` Nova cobertura em ${fmtDate(gNext.cruzamento)}.` : ' Aguardando nova cobertura.'}`,
          });
        }
      }

      // 4. Aborto
      if (g.aborto) {
        const dataAborto = g.aborto_data || g.parto || addDays(g.cruzamento, 60);
        const fimAborto = gNext ? gNext.cruzamento : (dataAborto || dataFim);
        const dias = Math.max(0, diffDays(g.cruzamento, fimAborto));
        const ativoHoje = noPlantel(m) && !gNext && (!g.aborto_data || diffDays(g.aborto_data, hoje()) > 0);
        if (dias > 0 || ativoHoje) {
          itens.push({
            tipo: 'aborto',
            rotulo: 'Aborto',
            badgeCls: 'dnp-aborto',
            dias,
            periodo: `${fmtDate(g.cruzamento)} a ${gNext ? fmtDate(gNext.cruzamento) : fmtDate(dataAborto)}`,
            ativoHoje,
            obs: `Cobertura em ${fmtDate(g.cruzamento)}, aborto registrado em ${fmtDate(dataAborto)}.`,
          });
        }
      }
    }

    // 6. Atraso no descarte (gera DNP da decisão até a saída física)
    if (m.descarte) {
      let dataDecisao = m.descarte_data;
      if (!dataDecisao) {
        const ultG = [...gs].reverse().find((g) => g.vivos != null);
        dataDecisao = ultG ? (ultG.desmame || addDays(partoDe(ultG), DESMAME_DIAS)) : (m.chegada || m.nascimento || hoje());
      }
      const fimDescarte = m.saida && m.saida_data ? m.saida_data : hoje();
      const dias = Math.max(0, diffDays(dataDecisao, fimDescarte));
      const ativoHoje = noPlantel(m);
      if (dias > 0 || ativoHoje) {
        itens.push({
          tipo: 'descarte',
          rotulo: 'Aguardando descarte (saída física)',
          badgeCls: 'dnp-descarte',
          dias,
          periodo: `${fmtDate(dataDecisao)} até ${ativoHoje ? 'hoje' : fmtDate(fimDescarte)}`,
          ativoHoje,
          obs: ativoHoje
            ? `Decisão de descarte em ${fmtDate(dataDecisao)}. Fêmea ainda não teve saída física (abate/venda).`
            : `Decisão de descarte em ${fmtDate(dataDecisao)}, saída física em ${fmtDate(m.saida_data)}.`,
        });
      }
    }

    const totalDnp = itens.reduce((s, it) => s + it.dias, 0);
    const dnpHoje = itens.some((it) => it.ativoHoje);

    let motivoPrincipal = 'Sem DNP acumulado';
    let motivoBadgeCls = 'dnp-ok';
    const ativoItem = itens.find((it) => it.ativoHoje);
    if (ativoItem) {
      motivoPrincipal = ativoItem.rotulo;
      motivoBadgeCls = ativoItem.badgeCls;
    } else if (itens.length > 0) {
      const maior = [...itens].sort((a, b) => b.dias - a.dias)[0];
      motivoPrincipal = maior.rotulo;
      motivoBadgeCls = maior.badgeCls;
    }

    return {
      animal: m,
      totalDnp,
      dnpHoje,
      motivoPrincipal,
      motivoBadgeCls,
      itens,
      intervalosParto,
    };
  }

  function calcularDnpPlantel() {
    const femeas = sortAnimais(db.animais.filter((a) => a.categoria === 'matriz' || a.categoria === 'marra' || a.categoria === 'porca'));
    const matrizesDnp = femeas.map(calcularDnpMatriz);
    const totalDnp = matrizesDnp.reduce((s, d) => s + d.totalDnp, 0);
    const matrizesNoPlantel = matrizesDnp.filter((d) => noPlantel(d.animal));
    const gerandoHoje = matrizesDnp.filter((d) => d.dnpHoje);
    const mediaPlantel = matrizesNoPlantel.length ? Math.round((matrizesNoPlantel.reduce((s, d) => s + d.totalDnp, 0) / matrizesNoPlantel.length) * 10) / 10 : 0;

    return {
      femeas,
      matrizesDnp,
      totalDnp,
      matrizesNoPlantel,
      gerandoHoje,
      mediaPlantel,
    };
  }

  function renderDnp() {
    const p = calcularDnpPlantel();
    const f = filters.dnp || 'todos';

    const cardMedia = stat('DNP Médio do Plantel', `${fmtNum(p.mediaPlantel)} dias`, 'Média por matriz no plantel');
    const cardTotal = stat('Total DNP Acumulado', `${fmtNum(p.totalDnp)} dias`, `${plural(p.femeas.length, 'matriz avaliada', 'matrizes avaliadas')}`);
    const cardHoje = stat('Gerando DNP Hoje', `${p.gerandoHoje.length}`, p.gerandoHoje.length === 1 ? '1 matriz com DNP ativo' : `${p.gerandoHoje.length} matrizes com DNP ativo`, p.gerandoHoje.length ? 'warn' : 'pos');

    const alertaHtml = p.gerandoHoje.length ? `
      <div class="dnp-alerta-box">
        ${ICON.alert}
        <div>
          <strong>Atenção: ${p.gerandoHoje.length} ${p.gerandoHoje.length === 1 ? 'matriz está gerando DNP hoje' : 'matrizes estão gerando DNP hoje'}</strong>
          <p class="muted small">${p.gerandoHoje.map((d) => `<strong>${esc(d.animal.nome)}</strong> (${esc(d.motivoPrincipal)})`).join(' · ')}</p>
        </div>
      </div>
    ` : '';

    const counts = {
      todos: p.matrizesDnp.length,
      hoje: p.gerandoHoje.length,
      plantel: p.matrizesNoPlantel.length,
      com_dnp: p.matrizesDnp.filter((d) => d.totalDnp > 0).length,
      descarte: p.matrizesDnp.filter((d) => d.animal.descarte && noPlantel(d.animal)).length,
    };

    const chip = (v, label) => `<button type="button" class="chip${f === v ? ' on' : ''}" data-act="dnp-filtro" data-value="${v}">${label} <span class="n">${counts[v] || 0}</span></button>`;

    const chipsHtml = `
      <div class="chips">
        ${chip('todos', 'Todas')}
        ${chip('hoje', 'Gerando DNP hoje')}
        ${chip('plantel', 'No plantel')}
        ${chip('com_dnp', 'Com DNP')}
        ${chip('descarte', 'Aguardando descarte')}
      </div>
    `;

    const buscaHtml = p.matrizesDnp.length > 4 ? `
      <input type="search" id="buscaDnp" class="busca" placeholder="Buscar fêmea por nome ou motivo do DNP…" aria-label="Buscar fêmea no DNP" autocomplete="off" value="${esc(buscaDnp)}">
    ` : '';

    const linhasHtml = p.matrizesDnp.map((d) => {
      const a = d.animal;
      const sit = noPlantel(a) ? (a.descarte ? 'descarte' : 'plantel') : (a.saida || 'saiu');
      const buscaStr = normBusca([a.nome, d.motivoPrincipal, statusAnimal(a), a.descarte ? 'descarte' : '', d.dnpHoje ? 'hoje gerando' : ''].join(' '));

      return `
        <tr class="dnp-row" data-id="${a.id}" data-sit="${sit}" data-hoje="${d.dnpHoje ? '1' : '0'}" data-dnp="${d.totalDnp > 0 ? '1' : '0'}" data-busca="${esc(buscaStr)}">
          <td>
            <div style="display:flex;align-items:center;gap:10px;">
              ${fotoHtml(a)}
              <div>
                <strong><a href="#/animal/${a.id}">${esc(a.nome)}</a></strong>
                <div class="small muted">${esc(CATEGORIAS[a.categoria])} · ${esc(idadeAnimal(a))}</div>
              </div>
            </div>
          </td>
          <td>
            <span class="badge ${a.descarte && noPlantel(a) ? 'dnp-descarte' : (a.saida ? 'muted' : 'ok')}">${esc(a.descarte && noPlantel(a) ? 'Aguardando descarte' : statusAnimal(a))}</span>
          </td>
          <td>
            <div class="dnp-dias-destaque${d.totalDnp > 0 ? ' com-dnp' : ''}">${d.totalDnp} ${d.totalDnp === 1 ? 'dia' : 'dias'}</div>
          </td>
          <td>
            <span class="badge ${d.motivoBadgeCls}">${esc(d.motivoPrincipal)}</span>
          </td>
          <td>
            ${d.dnpHoje ? '<span class="badge dnp-ativo">⚠️ Gerando DNP hoje</span>' : '<span class="badge ok">Sem DNP ativo</span>'}
          </td>
          <td style="text-align:right;">
            <button type="button" class="btn small" data-act="dnp-detalhes" data-id="${a.id}">${ICON.eye} Detalhes</button>
          </td>
        </tr>
      `;
    }).join('');

    const tabelaHtml = `
      <div class="table-wrap">
        <table class="table" id="dnpTabela">
          <thead>
            <tr>
              <th>Matriz</th>
              <th>Situação</th>
              <th>DNP Total</th>
              <th>Motivo Principal</th>
              <th>Status Hoje</th>
              <th style="text-align:right;">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${linhasHtml}
          </tbody>
        </table>
      </div>
      <div class="empty-box" id="dnpVazio" hidden><p id="dnpVazioTxt">Nenhuma matriz encontrada.</p></div>
    `;

    return `
      ${pageHead('Dias Não Produtivos (DNP)', 'Manejo reprodutivo, intervalos entre partos e dias improdutivos acumulados do plantel.')}
      <div class="stats">${cardMedia}${cardTotal}${cardHoje}</div>
      ${alertaHtml}
      ${chipsHtml}
      ${buscaHtml}
      ${p.matrizesDnp.length ? tabelaHtml : '<div class="empty-box"><p>Nenhuma matriz cadastrada.</p></div>'}
    `;
  }

  function filtrarDnp() {
    const tabela = $('#dnpTabela');
    const vazio = $('#dnpVazio');
    if (!tabela || !vazio) return;
    const q = normBusca(buscaDnp.trim());
    const f = filters.dnp || 'todos';
    let n = 0;

    tabela.querySelectorAll('tbody tr').forEach((tr) => {
      let ok = true;
      if (q) {
        ok = tr.dataset.busca.includes(q);
      } else {
        if (f === 'hoje') ok = tr.dataset.hoje === '1';
        else if (f === 'plantel') ok = tr.dataset.sit === 'plantel' || tr.dataset.sit === 'descarte';
        else if (f === 'com_dnp') ok = tr.dataset.dnp === '1';
        else if (f === 'descarte') ok = tr.dataset.sit === 'descarte';
      }
      tr.hidden = !ok;
      if (ok) n++;
    });

    vazio.hidden = n > 0;
    $('#dnpVazioTxt').textContent = q ? `Nenhuma matriz encontrada com “${buscaDnp.trim()}”.` : 'Nenhuma matriz aqui.';
    $$('.chips .chip', view).forEach((c) => c.classList.toggle('dim', !!q));
  }

  function abrirDnpDetalhes(id) {
    const a = animal(id);
    if (!a) return;
    const dnp = calcularDnpMatriz(a);
    const dlg = $('#dnpDlg');
    if (!dlg) return;

    $('#dnpDlgTitle').textContent = `DNP: ${a.nome}`;
    $('#dnpDlgMeta').textContent = `${CATEGORIAS[a.categoria]} · ${a.descarte && noPlantel(a) ? 'Aguardando descarte' : statusAnimal(a)}`;

    let html = `
      <div class="dnp-resumo-banner">
        <div class="dnp-resumo-item">
          <small>Total DNP</small>
          <strong class="${dnp.totalDnp > 0 ? 'danger-text' : 'pos-text'}">${dnp.totalDnp} ${dnp.totalDnp === 1 ? 'dia' : 'dias'}</strong>
        </div>
        <div class="dnp-resumo-item">
          <small>Status Hoje</small>
          <strong>${dnp.dnpHoje ? '<span class="badge dnp-ativo">⚠️ Gerando DNP hoje</span>' : '<span class="badge ok">Sem DNP ativo</span>'}</strong>
        </div>
        <div class="dnp-resumo-item">
          <small>Motivo Principal</small>
          <strong><span class="badge ${dnp.motivoBadgeCls}">${esc(dnp.motivoPrincipal)}</span></strong>
        </div>
      </div>
    `;

    html += `<h3 class="dnp-secao-titulo">${ICON.calendar} Períodos improdutivos detalhados</h3>`;
    if (!dnp.itens.length) {
      html += '<p class="muted">Nenhum dia não produtivo registrado para esta matriz.</p>';
    } else {
      html += `<div class="dnp-lista">${dnp.itens.map((it) => `
        <div class="dnp-item${it.ativoHoje ? ' ativo-hoje' : ''}">
          <div class="dnp-item-head">
            <span class="dnp-item-motivo"><span class="badge ${it.badgeCls}">${esc(it.rotulo)}</span>${it.ativoHoje ? '<span class="badge dnp-ativo">Gerando DNP hoje</span>' : ''}</span>
            <span class="dnp-item-dias">${plural(it.dias, 'dia', 'dias')}</span>
          </div>
          <div class="dnp-item-periodo">Período: <strong>${esc(it.periodo)}</strong></div>
          ${it.obs ? `<div class="dnp-item-obs muted">${esc(it.obs)}</div>` : ''}
        </div>
      `).join('')}</div>`;
    }

    if (dnp.intervalosParto.length) {
      html += `<h3 class="dnp-secao-titulo" style="margin-top: 10px;">${ICON.pig} Intervalo de Partos (IP > 140 dias)</h3>
      <div class="dnp-lista">${dnp.intervalosParto.map((ip) => `
        <div class="dnp-item">
          <div class="dnp-item-head">
            <span class="dnp-item-motivo"><span class="badge dnp-ip">${esc(ip.obs)}</span></span>
            <span class="dnp-item-dias">${ip.ip} dias (${ip.excesso}d acima da meta)</span>
          </div>
          <div class="dnp-item-periodo">Partos: <strong>${esc(ip.periodo)}</strong></div>
          <div class="dnp-item-obs muted">Meta recomendada: ~140 dias entre partos. O excesso de ${ip.excesso} dias reduz a eficiência reprodutiva do ciclo.</div>
        </div>
      `).join('')}</div>`;
    }

    $('#dnpDlgBody').innerHTML = html;
    dlg.showModal();
  }

  // ---------- Conta, Grupos e Convites ----------

  function renderConta() {
    const email = (user && user.email) || '';
    const avatar = user && user.user_metadata && user.user_metadata.avatar_url;
    const nome = (user && user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || '';
    const tema = (v, label) => `<button type="button" class="${themeChoice === v ? 'on' : ''}" data-act="theme" data-value="${v}">${label}</button>`;
    const quando = loadedAt ? new Date(loadedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    const isDono = papel === 'dono';

    const grupoHtml = `<section class="section card">
        <div class="grupo-card-head">
          <div>
            <h2>Grupo: <strong>${esc((grupoAtivo && grupoAtivo.nome) || 'Meu Grupo')}</strong></h2>
            <small class="muted">Sua função neste grupo: <strong>${esc(PAPEIS[papel] || papel)}</strong></small>
          </div>
          <div class="btn-row">
            ${isDono ? `<button type="button" class="btn small" data-act="grupo-renomear">${ICON.edit} Renomear grupo</button>` : ''}
            <button type="button" class="btn small" data-act="grupo-trocar">Alternar / Novo grupo (${grupos.length})</button>
          </div>
        </div>

        ${isDono ? `
          <div class="bloco-head" style="margin-top: 20px;">
            <h3>Convite por Link (WhatsApp)</h3>
            <p class="muted">Gere um link para compartilhar. Quem clicar entra direto neste grupo com sua conta Google.</p>
            <button type="button" class="btn primary small" data-act="convite-novo">${ICON.plus} Gerar link de convite</button>
          </div>
          <div id="convitesLista" class="convites-lista">${convitesListaHtml()}</div>
        ` : ''}

        <div class="bloco-head" style="margin-top: 24px;">
          <h3>Membros do Grupo</h3>
          <p class="muted">Pessoas que têm acesso a este grupo de criação.</p>
        </div>
        <div id="membrosLista">${membrosListaHtml()}</div>
      </section>`;

    return `${pageHead('Conta')}
      <section class="section card account-card">
        ${avatar ? `<img class="avatar big" src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar big">${esc((email[0] || '?').toUpperCase())}</span>`}
        <div><strong>${esc(nome || email)}</strong>${nome ? `<small class="muted block">${esc(email)}</small>` : ''}
          <span class="badge ${papel === 'leitor' ? 'muted' : 'ok'}">${esc(PAPEIS[papel] || '')}</span></div>
        <button type="button" class="btn" data-act="logout">Sair</button>
      </section>
      ${grupoHtml}
      <div class="two-col">
        <section class="section card"><h2>Aparência</h2>
          <div class="seg" role="group" aria-label="Tema">${tema('auto', 'Automático')}${tema('light', 'Claro')}${tema('dark', 'Escuro')}</div>
        </section>
        <section class="section card"><h2>Dados</h2>
          <p class="muted">${quando ? `Carregados às ${esc(quando)}. ` : ''}O site busca as novidades sozinho ao voltar para ele.
            Sem internet, dá para continuar anotando: as alterações ficam neste aparelho e vão para a nuvem quando a conexão voltar.</p>
          <div class="btn-row">
            <button type="button" class="btn" data-act="reload">${ICON.refresh} Atualizar agora</button>
            <button type="button" class="btn ghost" data-app-apk="Atualizar app" hidden>Instalar app</button>
          </div>
        </section>
      </div>
      <p class="muted small" style="margin:-4px 0 16px"><a href="privacidade.html">Política de privacidade</a>: quais dados o site guarda e como pedir para apagar.</p>
      <section class="section card"><h2>Cópia de segurança</h2>
        <p class="muted">Guarde de vez em quando no computador ou no Google Drive.</p>
        <ul class="copia-opcoes">
          <li><strong>Cópia completa (.zip)</strong>: todos os dados mais as fotos dos animais e os arquivos de bula.
            É a melhor para guardar e a que restaura tudo.</li>
          <li><strong>Excel</strong>: uma aba para cada parte do site (animais, gestações, aplicações, abates,
            lançamentos, resumo por mês, ração e vacinas), fácil de ler e de fazer contas. Sem fotos e bulas.</li>
          <li><strong>JSON</strong>: só os dados, exatamente como estão no banco. Sem fotos e bulas.</li>
        </ul>
        <div class="btn-row">
          <button type="button" class="btn primary" data-act="exportar-zip">${ICON.download} Baixar cópia completa (.zip)</button>
          <button type="button" class="btn" data-act="exportar">${ICON.download} Excel</button>
          <button type="button" class="btn" data-act="exportar-json">${ICON.download} JSON</button>
        </div>
        ${papel === 'dono' ? `<div class="restaurar">
          <h3>Restaurar cópia</h3>
          <p class="muted">Escolha uma cópia completa (.zip) ou um JSON baixados daqui. Os dados atuais deste grupo são substituídos
            pelos da cópia; antes, o site baixa uma cópia dos dados atuais. Só o dono vê esta opção.</p>
          <button type="button" class="btn danger-ghost restaurar-btn" data-act="restaurar">${ICON.refresh} Restaurar cópia…</button>
        </div>` : ''}
      </section>`;
  }

  function siteUrl() {
    return location.origin + location.pathname;
  }

  // Data e hora no fuso do aparelho: "hoje às 14:32", "ontem às 07:01", "16/10/2026 às 07:01"
  function fmtQuando(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dias = diffDays(U.iso(d), hoje());
    if (dias === 0) return `hoje às ${hora}`;
    if (dias === 1) return `ontem às ${hora}`;
    return `${d.toLocaleDateString('pt-BR')} às ${hora} (há ${dias} dias)`;
  }

  function convitesListaHtml() {
    if (!Array.isArray(convites) || !convites.length) return '<p class="muted small" style="margin-top: 6px;">Nenhum link de convite ativo no momento.</p>';
    return convites.map((c) => {
      const link = `${siteUrl()}?convite=${c.codigo}`;
      const whats = `https://wa.me/?text=${encodeURIComponent(`Convite para participar do grupo "${grupoAtivo ? grupoAtivo.nome : 'Porcos'}" no Controle de Porcos (${c.papel === 'editor' ? 'pode ver e editar' : 'só para ver'}): ${link}`)}`;
      return `
        <div class="convite-item">
          <div class="convite-info">
            <span>Permissão: <span class="badge ${c.papel === 'editor' ? 'ok' : 'muted'}">${c.papel === 'editor' ? 'Pode editar' : 'Só ver'}</span></span>
            <span class="convite-code">${esc(link)}</span>
            <small class="muted">Criado ${esc(fmtQuando(c.criado_em))}</small>
          </div>
          <div class="convite-actions">
            <button type="button" class="btn small" data-act="convite-copiar" data-link="${esc(link)}">Copiar link</button>
            <a class="btn small ghost" href="${esc(whats)}" target="_blank" rel="noopener">WhatsApp</a>
            <button type="button" class="btn small danger-ghost" data-act="convite-revogar" data-codigo="${esc(c.codigo)}">Excluir</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function membrosListaHtml() {
    if (!Array.isArray(membros)) return '<p class="muted">Carregando membros…</p>';
    if (!membros.length) return '<p class="muted">Nenhum membro listado.</p>';
    return `<ul class="list">${membros.map((x) => `<li class="list-row acesso-row">
        <span><strong>${esc(x.nome || x.email || 'Membro')}</strong>${x.nome && x.email ? `<small>${esc(x.email)}</small>` : ''}
          <small class="ultimo-acesso${x.ultimo_acesso ? '' : ' nunca'}">${x.ultimo_acesso
            ? `Último acesso: ${esc(fmtQuando(x.ultimo_acesso))}`
            : 'Ainda não abriu o site'}</small></span>
        <span class="right">
          ${x.papel === 'dono' ? '<span class="badge ok">Dono</span>' : (papel === 'dono' ? `
            <select data-act-change="membro-papel" data-id="${esc(x.id)}" aria-label="Permissão de ${esc(x.email || x.nome)}">
              <option value="leitor"${x.papel === 'leitor' ? ' selected' : ''}>Só ver</option>
              <option value="editor"${x.papel === 'editor' ? ' selected' : ''}>Pode editar</option>
            </select>
            <button type="button" class="btn small danger-ghost" data-act="membro-remover" data-id="${esc(x.id)}" data-nome="${esc(x.nome || x.email)}">Remover</button>
          ` : `<span class="badge ${x.papel === 'editor' ? 'ok' : 'muted'}">${esc(PAPEIS[x.papel] || x.papel)}</span>`)}
          ${x.is_current_user && x.papel !== 'dono' ? `<button type="button" class="btn small danger-ghost" data-act="membro-sair" data-id="${esc(x.id)}">Sair do grupo</button>` : ''}
        </span>
      </li>`).join('')}</ul>`;
  }

  async function loadMembrosEConvites() {
    if (!grupoAtivo) return;
    try {
      membros = await Cloud.listarMembros(grupoAtivo.id);
    } catch (err) {
      membros = [];
    }
    const mb = $('#membrosLista');
    if (mb) mb.innerHTML = membrosListaHtml();

    if (papel === 'dono') {
      try {
        convites = await Cloud.listarConvites(grupoAtivo.id);
      } catch (err) {
        convites = [];
      }
      const cb = $('#convitesLista');
      if (cb) cb.innerHTML = convitesListaHtml();
    }
  }

  function atualizarBtnGrupo() {
    const btn = $('#btnGrupo');
    const nomeEl = $('#grupoNome');
    if (!btn || !nomeEl) return;
    if (grupoAtivo) {
      btn.hidden = false;
      nomeEl.textContent = grupoAtivo.nome;
      btn.title = `Grupo: ${grupoAtivo.nome} (${PAPEIS[papel] || papel}). Clique para alternar.`;
    } else {
      btn.hidden = true;
    }
  }

  function dialogGrupos() {
    openForm({
      title: 'Meus Grupos',
      intro: 'Você pode alternar entre seus grupos ou criar uma nova criação independente.',
      values: {},
      fields: [],
      submitLabel: 'Fechar',
      onSave: async () => {},
    });

    const listaHtml = `
      <div style="display: grid; gap: 8px; margin: 12px 0;">
        ${grupos.map((g) => `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: ${g.id === (grupoAtivo && grupoAtivo.id) ? 'var(--accent-soft)' : 'var(--surface)'};">
            <div>
              <strong>${esc(g.nome)}</strong> ${g.id === (grupoAtivo && grupoAtivo.id) ? '<span class="badge ok">Ativo</span>' : ''}
              <small class="muted block">${esc(PAPEIS[g.papel] || g.papel)}</small>
            </div>
            ${g.id !== (grupoAtivo && grupoAtivo.id) ? `<button type="button" class="btn small" data-trocar-grupo-id="${esc(g.id)}">Usar este</button>` : ''}
          </div>
        `).join('')}
      </div>
      <button type="button" class="btn primary" id="btnNovoGrupoModal" style="width: 100%; margin-top: 6px;">${ICON.plus} Criar novo grupo</button>
    `;

    $('.fields', form).innerHTML = listaHtml;
    $('#btnNovoGrupoModal', form).onclick = () => {
      dlg.close();
      formNovoGrupo();
    };
    $$('[data-trocar-grupo-id]', form).forEach((btn) => {
      btn.onclick = async () => {
        const novoId = btn.dataset.trocarGrupoId;
        dlg.close();
        await trocarGrupo(novoId);
      };
    });
  }

  function formNovoGrupo() {
    openForm({
      title: 'Criar Novo Grupo',
      intro: 'O novo grupo terá seus próprios animais, finanças e membros separados.',
      values: { nome: '' },
      fields: [
        { name: 'nome', label: 'Nome do Grupo', required: true, placeholder: 'Ex.: Criação 2, Granja Esperança' }
      ],
      submitLabel: 'Criar Grupo',
      onSave: async (v) => {
        const novo = await Cloud.criarGrupo(v.nome);
        toast(`Grupo "${v.nome}" criado!`);
        grupos.push(novo);
        await trocarGrupo(novo.id);
      }
    });
  }

  function formRenomearGrupo() {
    if (!grupoAtivo || papel !== 'dono') return;
    openForm({
      title: 'Renomear Grupo',
      values: { nome: grupoAtivo.nome },
      fields: [
        { name: 'nome', label: 'Nome do Grupo', required: true }
      ],
      submitLabel: 'Salvar Nome',
      onSave: async (v) => {
        await Cloud.renomearGrupo(grupoAtivo.id, v.nome);
        grupoAtivo.nome = v.nome;
        const g = grupos.find((x) => x.id === grupoAtivo.id);
        if (g) g.nome = v.nome;
        atualizarBtnGrupo();
        render();
        toast('Nome do grupo atualizado!');
      }
    });
  }

  async function trocarGrupo(novoId) {
    const escolhido = grupos.find((g) => g.id === novoId);
    if (!escolhido) return;
    try {
      localStorage.setItem('porcos:grupo_ativo', novoId);
    } catch (e) {}
    grupoAtivo = escolhido;
    papel = grupoAtivo.papel;
    atualizarBtnGrupo();
    db = emptyDb();
    fotoUrl = {};
    bulaUrl = {};
    showGate('loading');
    try {
      lerFila();
      if (fila.length) await enviarFila();
      db = await Cloud.loadAll(grupoAtivo.id);
      sincronizarNomesAnimais();
      loadedAt = Date.now();
      offline = false;
      await refreshFotos();
      saveCache();
      showApp();
      onRoute();
      toast(`Você está no grupo "${grupoAtivo.nome}"`);
    } catch (err) {
      showGate('error', err && err.message);
    }
  }

  function formGerarConvite() {
    openForm({
      title: 'Gerar Link de Convite',
      intro: 'Qualquer pessoa que acessar este link e fizer login com o Google entrará para este grupo.',
      values: { papel: 'editor' },
      fields: [
        {
          name: 'papel', label: 'Permissão para quem entrar', type: 'select',
          options: [['editor', 'Pode editar (animais, vacinas, gastos)'], ['leitor', 'Só ver (apenas visualização)']]
        }
      ],
      submitLabel: 'Gerar Link',
      onSave: async (v) => {
        const codigo = await Cloud.gerarConvite(grupoAtivo.id, v.papel);
        const link = `${siteUrl()}?convite=${codigo}`;
        toast('Link de convite gerado!');
        await loadMembrosEConvites();
        setTimeout(() => dialogLinkGerado(link, v.papel), 300);
      }
    });
  }

  function dialogLinkGerado(link, papelConvite) {
    const whats = `https://wa.me/?text=${encodeURIComponent(`Convite para participar do grupo "${grupoAtivo ? grupoAtivo.nome : 'Porcos'}" no Controle de Porcos (${papelConvite === 'editor' ? 'pode ver e editar' : 'só para ver'}): ${link}`)}`;
    openForm({
      title: 'Link de Convite Gerado',
      intro: 'Envie o link abaixo para as pessoas que você quer convidar:',
      values: {},
      fields: [],
      submitLabel: 'Fechar',
      onSave: async () => {},
    });
    $('.fields', form).innerHTML = `
      <div style="display: grid; gap: 12px; margin: 12px 0;">
        <input readonly value="${esc(link)}" style="font-family: var(--mono); font-size: 0.88rem;" id="linkGeradoInput" onclick="this.select()">
        <div class="btn-row">
          <button type="button" class="btn primary" id="btnCopiarLinkGerado">${ICON.ok} Copiar link</button>
          <a class="btn" href="${esc(whats)}" target="_blank" rel="noopener">Enviar no WhatsApp</a>
        </div>
      </div>
    `;
    $('#btnCopiarLinkGerado', form).onclick = () => {
      navigator.clipboard.writeText(link).then(() => toast('Link copiado para a área de transferência!'));
    };
  }

  // ---------- Formulários ----------

  const dlg = $('#dlg');
  const form = $('#dlgForm');
  let formState = null;

  function fieldHtml(f, v) {
    const id = `f_${f.name}`;
    const val = v[f.name];
    const req = f.required ? ' required' : '';
    const cls = `field${f.half ? ' half' : ''}`;
    const hint = f.hint ? `<small class="hint">${f.hint}</small>` : '';
    switch (f.type) {
      case 'select':
        return `<label class="${cls}" data-field="${f.name}"><span>${f.label}</span><select id="${id}" name="${f.name}"${req}>
          ${f.options.map(([value, label]) => `<option value="${esc(value)}"${String(val ?? '') === String(value) ? ' selected' : ''}>${esc(label)}</option>`).join('')}
          </select>${hint}</label>`;
      case 'textarea':
        return `<label class="${cls}" data-field="${f.name}"><span>${f.label}</span><textarea id="${id}" name="${f.name}" rows="2" placeholder="${esc(f.placeholder || '')}">${esc(val || '')}</textarea>${hint}</label>`;
      case 'checkbox':
        return `<label class="check" data-field="${f.name}"><input type="checkbox" name="${f.name}"${val ? ' checked' : ''}><span>${f.label}</span></label>`;
      case 'checkboxes':
        return `<fieldset class="field checks" data-field="${f.name}"><legend>${f.label}</legend>
          ${f.options.length ? f.options.map(([value, label]) => `<label class="check"><input type="checkbox" name="${f.name}" value="${esc(value)}"${(val || []).includes(value) ? ' checked' : ''}><span>${esc(label)}</span></label>`).join('') : '<p class="muted">Nenhum.</p>'}
          ${hint}</fieldset>`;
      case 'date':
        return `<label class="${cls}" data-field="${f.name}"><span>${f.label}</span><input id="${id}" type="date" name="${f.name}" value="${esc(val || '')}"${req}>${hint}</label>`;
      case 'number':
      case 'money':
        return `<label class="${cls}" data-field="${f.name}"><span>${f.label}</span>
          <span class="input-affix">${f.type === 'money' ? '<i>R$</i>' : ''}<input id="${id}" name="${f.name}" inputmode="decimal" autocomplete="off" value="${esc(toInput(val))}" placeholder="${esc(f.placeholder || '')}"${req}>${f.suffix ? `<i>${f.suffix}</i>` : ''}</span>${hint}</label>`;
      default:
        return `<label class="${cls}" data-field="${f.name}"><span>${f.label}</span><input id="${id}" name="${f.name}" value="${esc(val || '')}" autocomplete="off" placeholder="${esc(f.placeholder || '')}"${req}>${hint}</label>`;
    }
  }

  function readForm() {
    const out = {};
    for (const f of formState.fields) {
      if (f.type === 'checkboxes') {
        out[f.name] = $$(`input[name="${f.name}"]:checked`, form).map((i) => i.value);
        continue;
      }
      const el = form.elements[f.name];
      if (!el) continue;
      if (f.type === 'checkbox') out[f.name] = el.checked;
      else if (f.type === 'number' || f.type === 'money') out[f.name] = parseNum(el.value);
      else if (f.type === 'date') out[f.name] = el.value || null;
      else out[f.name] = el.value.trim();
    }
    return out;
  }

  function applyShowIf() {
    const v = readForm();
    for (const f of formState.fields) {
      if (!f.showIf) continue;
      const box = $(`[data-field="${f.name}"]`, form);
      if (box) box.hidden = !f.showIf(v);
    }
  }

  const isVisible = (f) => {
    const box = $(`[data-field="${f.name}"]`, form);
    return !box || !box.hidden;
  };

  function formError(msg) {
    const p = $('#formError');
    p.textContent = msg || '';
    p.hidden = !msg;
  }

  /*
   * Abre um formulário.
   * opts: { title, intro, fields, values, onSave(valores), onDelete(), submitLabel, deleteConfirm }
   * Campo: { name, label, type, options, required, half, hint, suffix, showIf(valores) }
   */
  function openForm(opts) {
    formState = opts;
    const v = opts.values || {};
    form.innerHTML = `<div class="dlg-head"><h2>${esc(opts.title)}</h2><button type="button" class="icon" data-close aria-label="Fechar">×</button></div>
      ${opts.intro ? `<p class="muted dlg-text">${opts.intro}</p>` : ''}
      <div class="fields">${opts.fields.map((f) => fieldHtml(f, v)).join('')}</div>
      <p class="form-error" id="formError" hidden></p>
      <div class="dlg-actions">
        ${opts.onDelete ? '<button type="button" class="btn danger-ghost" data-delete>Excluir</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn" data-close>Cancelar</button>
        <button class="btn primary" type="submit">${esc(opts.submitLabel || 'Salvar')}</button>
      </div>`;
    applyShowIf();
    dlg.showModal();
    const first = $('input:not([type=checkbox]), select, textarea', form);
    if (first && !('ontouchstart' in window)) first.focus();
  }

  form.addEventListener('input', () => formState && applyShowIf());
  form.addEventListener('change', () => formState && applyShowIf());

  form.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) {
      dlg.close();
      return;
    }
    if (e.target.closest('[data-delete]') && formState && formState.onDelete) {
      if (!confirm(formState.deleteConfirm || 'Excluir mesmo? Não dá para desfazer.')) return;
      await runForm(() => formState.onDelete());
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!formState) return;
    const v = readForm();
    for (const f of formState.fields) {
      if (!isVisible(f)) continue;
      const val = v[f.name];
      if (f.required && (val == null || val === '' || (Array.isArray(val) && !val.length))) {
        formError(`Preencha: ${f.label}.`);
        return;
      }
      if ((f.type === 'number' || f.type === 'money') && Number.isNaN(val)) {
        formError(`Número inválido em: ${f.label}.`);
        return;
      }
    }
    await runForm(() => formState.onSave(v));
  });

  async function runForm(fn) {
    const buttons = $$('button', form);
    buttons.forEach((b) => { b.disabled = true; });
    formError('');
    try {
      const msg = await fn();
      dlg.close();
      formState = null;
      render();
      if (msg) toast(msg);
    } catch (err) {
      formError(errMsg(err));
    } finally {
      buttons.forEach((b) => { b.disabled = false; });
    }
  }

  dlg.addEventListener('close', () => { formState = null; });

  function errMsg(err) {
    if (Cloud.isDenied(err)) return 'Você não tem permissão para fazer isso.';
    const m = (err && err.message) || String(err);
    if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Sem conexão com a internet. Tente de novo.';
    return `Não foi possível salvar: ${m}`;
  }

  // ---------- Gravação ----------

  // Cada gravação tenta ir direto para o banco. Sem internet, ela é feita aqui (no aparelho)
  // e entra numa fila, enviada na ordem assim que a conexão volta.

  const filaKey = () => `porcos:fila:${user.id}:${grupoAtivo ? grupoAtivo.id : 'padrao'}`;
  let fila = [];
  let enviando = null;

  function lerFila() {
    try { fila = JSON.parse(localStorage.getItem(filaKey()) || '[]'); } catch (e) { fila = []; }
    if (!Array.isArray(fila)) fila = [];
  }
  function gravarFila() {
    try { localStorage.setItem(filaKey(), JSON.stringify(fila)); } catch (e) { /* sem espaço */ }
  }
  const semRede = (err) => !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed/i.test((err && err.message) || String(err || ''));
  function novoId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  function naFila(op) {
    fila.push(op);
    gravarFila();
    offline = true;
    saveCache();
  }

  // Envia a fila. Lança erro se faltar internet (o resto continua na fila).
  function enviarFila() {
    if (!enviando) {
      enviando = (async () => {
        let enviadas = 0;
        let descartadas = 0;
        try {
          while (fila.length) {
            const o = fila[0];
            try {
              if (o.op === 'insert') await Cloud.upsertMany(o.kind, [o.row], grupoAtivo ? grupoAtivo.id : null);
              else if (o.op === 'update') await Cloud.updateSeExistir(o.kind, o.id, o.row);
              else await Cloud.remove(o.kind, o.id);
              enviadas++;
            } catch (err) {
              if (semRede(err)) throw err;
              console.warn('Alteração recusada pelo banco', o, err);
              descartadas++;
            }
            fila.shift();
            gravarFila();
          }
        } finally {
          enviando = null;
          if (enviadas || descartadas) {
            toast(descartadas
              ? `${enviadas} ${enviadas === 1 ? 'alteração enviada' : 'alterações enviadas'}; ${descartadas} recusada${descartadas > 1 ? 's' : ''} pelo banco (sem permissão ou dado inválido).`
              : `${enviadas} ${enviadas === 1 ? 'alteração feita sem internet foi enviada' : 'alterações feitas sem internet foram enviadas'}.`, 6000);
          }
        }
      })();
    }
    return enviando;
  }

  // Antes de gravar direto no banco, manda o que está na fila (para manter a ordem).
  async function online() {
    if (!navigator.onLine) return false;
    if (!fila.length) return true;
    try { await enviarFila(); return true; } catch (e) { return false; }
  }

  async function save(kind, id, row) {
    if (!db[kind]) db[kind] = [];
    if (await online()) {
      try {
        if (id) {
          const r = await Cloud.update(kind, id, row);
          db[kind] = db[kind].map((x) => (x.id === id ? r : x));
          return r;
        }
        const rowComGrupo = grupoAtivo ? { ...row, grupo_id: grupoAtivo.id } : row;
        const [r] = await Cloud.insert(kind, [rowComGrupo], grupoAtivo ? grupoAtivo.id : null);
        db[kind].push(r);
        return r;
      } catch (err) {
        if (!semRede(err)) {
          if (err && (err.code === '42P01' || /relation.*does not exist/i.test(err.message || ''))) {
            console.warn(`Tabela ${kind} ainda não criada no Supabase. Salvando localmente.`);
          } else if (err && /schema cache|could not find.*column/i.test(err.message || '')) {
            console.warn(`Coluna ausente no schema cache do Supabase. Salvando localmente.`);
          } else {
            throw err;
          }
        }
      }
    }
    const agora = new Date().toISOString();
    if (id) {
      const r = { ...byId(kind, id), ...row, atualizado_em: agora };
      db[kind] = db[kind].map((x) => (x.id === id ? r : x));
      naFila({ op: 'update', kind, id, row });
      return r;
    }
    const r = { ...row, id: novoId(), grupo_id: grupoAtivo ? grupoAtivo.id : null, criado_em: agora, atualizado_em: agora };
    db[kind].push(r);
    naFila({ op: 'insert', kind, id: r.id, row: r });
    return r;
  }

  async function saveMany(kind, rows) {
    const rowsComGrupo = grupoAtivo ? rows.map((r) => ({ ...r, grupo_id: r.grupo_id || grupoAtivo.id })) : rows;
    if (await online()) {
      try {
        const list = await Cloud.insert(kind, rowsComGrupo, grupoAtivo ? grupoAtivo.id : null);
        db[kind].push(...list);
        return list;
      } catch (err) {
        if (!semRede(err)) throw err;
      }
    }
    const list = [];
    for (const row of rowsComGrupo) list.push(await save(kind, null, row));
    return list;
  }

  async function remove(kind, id) {
    if (await online()) {
      try {
        await Cloud.remove(kind, id);
        db[kind] = db[kind].filter((x) => x.id !== id);
        return;
      } catch (err) {
        if (!semRede(err)) throw err;
      }
    }
    db[kind] = db[kind].filter((x) => x.id !== id);
    naFila({ op: 'remove', kind, id });
  }

  // ---------- Formulários de cada coisa ----------

  const animalOptions = (list, vazio) => [...(vazio ? [['', vazio]] : []), ...sortAnimais(list).map((a) => [a.id, a.nome])];

  // Mãe, pai e gestação de onde o animal nasceu (o que estiver informado)
  function paisDe(a) {
    const g = a && a.gestacao_id ? byId('gestacoes', a.gestacao_id) : null;
    return { gestacao: g, mae: g ? g.matriz_id : null, pai: g ? g.barrao_id || null : null };
  }

  // Parentesco próximo entre a matriz e o barrão de um cruzamento (texto) ou null
  function parentesco(matriz, barrao) {
    if (!matriz || !barrao) return null;
    const pm = paisDe(matriz);
    const pb = paisDe(barrao);
    if (pm.pai === barrao.id) return `o ${barrao.nome} é pai da ${matriz.nome}`;
    if (pb.mae === matriz.id) return `o ${barrao.nome} é filho da ${matriz.nome}`;
    if (pm.gestacao && pm.gestacao === pb.gestacao) return `${barrao.nome} e ${matriz.nome} são irmãos da mesma ninhada`;
    if (pm.mae && pm.mae === pb.mae) return `${barrao.nome} e ${matriz.nome} são filhos da mesma mãe (${nomeAnimal(pm.mae)})`;
    if (pm.pai && pm.pai === pb.pai) return `${barrao.nome} e ${matriz.nome} são filhos do mesmo pai (${nomeAnimal(pm.pai)})`;
    if (pm.mae && paisDe(animal(pm.mae)).pai === barrao.id) return `o ${barrao.nome} é avô da ${matriz.nome}`;
    if (pb.mae && paisDe(animal(pb.mae)).mae === matriz.id) return `a ${matriz.nome} é avó do ${barrao.nome}`;
    return null;
  }

  // "Matriz 1 · 2ª gestação · parto 29/04/2025"
  const rotuloGestacao = (g) => `${nomeAnimal(g.matriz_id)} · ${ordinal(numeroGestacao(g))} gestação · parto ${fmtDate(partoDe(g))}`;

  function formAnimal(a) {
    const novo = !a;
    // Gestações já nascidas, das mais recentes para as mais antigas (um animal não pode ser cria dele mesmo)
    const gestacoes = sortByDate(db.gestacoes.filter((g) => g.vivos != null && (!a || g.matriz_id !== a.id)), 'parto', true);
    openForm({
      title: novo ? 'Novo animal' : `Editar ${padronizarNomeAnimal(a.nome, a.categoria)}`,
      values: a ? { ...a, nome: padronizarNomeAnimal(a.nome, a.categoria), saida: a.saida || '', descarte: !!a.descarte } : { categoria: 'cevado', aquisicao: 'nascido', saida: '', descarte: false },
      fields: [
        { name: 'nome', label: 'Nome', required: true, placeholder: 'Ex.: Pintada' },
        { name: 'categoria', label: 'Categoria', type: 'select', half: true, options: CATEGORIAS_FORM },
        { name: 'aquisicao', label: 'Aquisição', type: 'select', half: true, options: Object.entries(AQUISICAO) },
        { name: 'nascimento', label: 'Nascimento', type: 'date', half: true },
        { name: 'gestacao_id', label: 'Cria da gestação', type: 'select', hint: ' ',
          options: [['', '— (não informado)'], ...gestacoes.map((g) => [g.id, rotuloGestacao(g)])] },
        { name: 'chegada', label: 'Chegada', type: 'date', half: true, showIf: (v) => v.aquisicao !== 'nascido' },
        { name: 'negociado_com', label: 'Negociado com', half: true, showIf: (v) => v.aquisicao !== 'nascido', placeholder: 'Pessoa' },
        { name: 'valor_compra', label: 'Valor de compra', type: 'money', half: true, showIf: (v) => v.aquisicao === 'comprado' },
        { name: 'descarte', label: 'Marcada para descarte (gera DNP até a saída física)', type: 'checkbox', showIf: (v) => v.categoria === 'matriz' || v.categoria === 'marra' || v.categoria === 'porca' },
        { name: 'saida', label: 'Situação', type: 'select', options: [['', 'No plantel'], ['venda', 'Vendido'], ['abate', 'Abatido'], ['morte', 'Morreu']] },
        { name: 'saida_data', label: 'Data da saída', type: 'date', half: true, required: true, showIf: (v) => !!v.saida },
        { name: 'valor_venda', label: 'Valor da venda', type: 'money', half: true, showIf: (v) => v.saida === 'venda' },
        { name: 'lancar', label: 'Lançar o valor da venda como receita em Finanças', type: 'checkbox', showIf: (v) => v.saida === 'venda' && (!a || a.saida !== 'venda') },
        { name: 'obs', label: 'Observações', type: 'textarea' },
      ],
      onSave: async (v) => {
        const nasc = v.aquisicao === 'nascido';
        const mae = v.gestacao_id ? byId('gestacoes', v.gestacao_id) : null;
        const cat = v.categoria === 'porca' ? 'marra' : (v.categoria === 'porco' ? 'cevado' : v.categoria);
        const row = {
          nome: padronizarNomeAnimal(v.nome, cat),
          categoria: cat,
          aquisicao: v.aquisicao,
          // Sem data de nascimento, usa a do parto da gestação escolhida
          nascimento: v.nascimento || (mae ? partoDe(mae) : null),
          gestacao_id: mae ? mae.id : null,
          chegada: nasc ? null : v.chegada,
          negociado_com: nasc ? '' : v.negociado_com,
          valor_compra: v.aquisicao === 'comprado' ? v.valor_compra : null,
          descarte: !!v.descarte,
          descarte_data: v.descarte ? (a && a.descarte_data ? a.descarte_data : hoje()) : null,
          saida: v.saida || null,
          saida_data: v.saida ? v.saida_data : null,
          valor_venda: v.saida === 'venda' ? v.valor_venda : null,
          obs: v.obs,
        };
        if (novo) row.ordem = db.animais.reduce((m, x) => Math.max(m, x.ordem), 0) + 1;
        const r = await save('animais', a && a.id, row);
        if (v.lancar && row.saida === 'venda' && row.valor_venda) {
          await save('lancamentos', null, { data: row.saida_data, tipo: 'receita', categoria: 'venda', descricao: `Venda: ${row.nome}`, valor: row.valor_venda });
        }
        if (novo) location.hash = `#/animal/${r.id}`;
        return novo ? 'Animal cadastrado' : 'Alterações salvas';
      },
      onDelete: a ? async () => {
        await Cloud.remove('animais', a.id);
        if (a.foto) Cloud.removeFotos([a.foto]).catch(() => {});
        await reload(true);
        location.hash = '#/animais';
        return 'Animal excluído';
      } : null,
      deleteConfirm: a ? `Excluir ${a.nome}? As gestações e aplicações dele também são apagadas. Não dá para desfazer. (Para tirar do plantel, mude a Situação.)` : '',
    });

    // Sugestão: gestação com parto no mesmo dia do nascimento digitado
    const dica = $('[data-field="gestacao_id"] .hint', form);
    const sugerir = () => {
      const nasc = form.elements.nascimento.value;
      const escolhida = form.elements.gestacao_id.value;
      const iguais = nasc && !escolhida ? gestacoes.filter((g) => partoDe(g) === nasc) : [];
      dica.innerHTML = iguais.length
        ? `Parto no mesmo dia do nascimento: ${iguais.map((g) => `<button type="button" class="link-btn" data-usar-gestacao="${g.id}">${esc(rotuloGestacao(g))}</button>`).join(' ou ')}`
        : (escolhida && !nasc ? 'Sem data de nascimento, fica a data do parto desta gestação.' : '');
    };
    sugerir();
    form.oninput = sugerir;
    form.onchange = sugerir;
    form.onclick = (e) => {
      const b = e.target.closest('[data-usar-gestacao]');
      if (!b) return;
      form.elements.gestacao_id.value = b.dataset.usarGestacao;
      sugerir();
    };
    dlg.addEventListener('close', () => { form.oninput = null; form.onchange = null; form.onclick = null; }, { once: true });
  }

  function formGestacao(g, matrizId) {
    const novo = !g;
    const matrizes = db.animais.filter((x) => x.categoria === 'matriz' && (noPlantel(x) || (g && x.id === g.matriz_id)));
    // Todos os barrões (o pai de uma gestação antiga pode já ter saído do plantel): primeiro os do plantel
    const barroes = sortAnimais(db.animais.filter((x) => x.categoria === 'barrao'))
      .sort((x, y) => Number(!noPlantel(x)) - Number(!noPlantel(y)))
      .map((x) => [x.id, noPlantel(x) ? x.nome : `${x.nome} (${statusAnimal(x).toLowerCase()} em ${fmtDate(x.saida_data)})`]);
    openForm({
      title: novo ? 'Nova gestação' : 'Gestação',
      intro: `Enquanto o dia do parto ficar em branco, a previsão é o cruzamento + ${GESTACAO_DIAS} dias (e acompanha se mudar o cruzamento).`,
      values: g ? { ...g, aborto: !!g.aborto, aborto_data: g.aborto_data || '', repeticao_cio: !!g.repeticao_cio, desmame: g.desmame || '' } : { matriz_id: matrizId || (matrizes[0] && matrizes[0].id), cruzamento: hoje(), aborto: false, aborto_data: '', repeticao_cio: false, desmame: '' },
      fields: [
        { name: 'matriz_id', label: 'Matriz', type: 'select', half: true, required: true, options: animalOptions(matrizes) },
        { name: 'barrao_id', label: 'Barrão (pai)', type: 'select', half: true, options: [['', '— (não informado)'], ...barroes] },
        { name: 'cruzamento', label: 'Cruzamento', type: 'date', half: true, required: true },
        { name: 'repeticao_cio', label: 'Repetição de cio (cobertura falhou / não emprenhou)', type: 'checkbox', showIf: (v) => !v.aborto },
        { name: 'aborto', label: 'Houve aborto', type: 'checkbox', showIf: (v) => !v.repeticao_cio },
        { name: 'aborto_data', label: 'Data do aborto', type: 'date', half: true, showIf: (v) => !!v.aborto },
        { name: 'parto', label: 'Parto', type: 'date', half: true, hint: ' ', showIf: (v) => !v.aborto && !v.repeticao_cio },
        { name: 'desmame', label: 'Desmame dos leitões', type: 'date', half: true, hint: `Em branco = ${DESMAME_DIAS} dias após o parto`, showIf: (v) => !v.aborto && !v.repeticao_cio },
        { name: 'vivos', label: 'Vivos', type: 'number', half: true, hint: 'Em branco = ainda não nasceu', showIf: (v) => !v.aborto && !v.repeticao_cio },
        { name: 'mortos', label: 'Mortos', type: 'number', half: true, hint: ' ', showIf: (v) => !v.aborto && !v.repeticao_cio },
        { name: 'machos', label: 'Machos', type: 'number', half: true, showIf: (v) => !v.aborto && !v.repeticao_cio },
        { name: 'femeas', label: 'Fêmeas', type: 'number', half: true, showIf: (v) => !v.aborto && !v.repeticao_cio },
        { name: 'capacao', label: 'Capação', type: 'date', half: true, showIf: (v) => !v.aborto && !v.repeticao_cio },
        { name: 'obs', label: 'Observações', type: 'textarea' },
      ],
      onSave: async (v) => {
        if (!v.aborto && !v.repeticao_cio) {
          const ints = ['vivos', 'mortos', 'machos', 'femeas'];
          for (const k of ints) {
            if (v[k] != null && (!Number.isInteger(v[k]) || v[k] < 0)) throw new Error('Use números inteiros nas quantidades.');
          }
          if (v.vivos == null && v.mortos != null) throw new Error('Preencha os vivos (pode ser 0) para registrar o parto.');
        }
        const row = {
          matriz_id: v.matriz_id,
          barrao_id: v.barrao_id || null,
          cruzamento: v.cruzamento,
          aborto: !!v.aborto,
          aborto_data: v.aborto ? (v.aborto_data || hoje()) : null,
          repeticao_cio: !!v.repeticao_cio,
          // Sem data: fica a previsão (cruzamento + 114). Depois do parto registrado, a data fica fixa.
          parto: (v.aborto || v.repeticao_cio) ? null : (v.parto || (v.vivos != null ? addDays(v.cruzamento, GESTACAO_DIAS) : null)),
          desmame: (v.aborto || v.repeticao_cio) ? null : (v.desmame || null),
          vivos: (v.aborto || v.repeticao_cio) ? null : v.vivos,
          mortos: (v.aborto || v.repeticao_cio) ? null : v.mortos,
          machos: (v.aborto || v.repeticao_cio) ? null : v.machos,
          femeas: (v.aborto || v.repeticao_cio) ? null : v.femeas,
          capacao: (v.aborto || v.repeticao_cio) ? null : v.capacao,
          obs: v.obs,
        };
        await save('gestacoes', g && g.id, row);
        return novo ? 'Gestação registrada' : 'Alterações salvas';
      },
      onDelete: g ? async () => {
        await Cloud.remove('gestacoes', g.id);
        await reload(true);
        return 'Gestação excluída';
      } : null,
      deleteConfirm: 'Excluir esta gestação? As aplicações nas crias também são apagadas.',
    });

    // Dicas que acompanham o que é digitado: previsão do parto e nascidos (vivos + mortos)
    const dicas = () => {
      const cruz = form.elements.cruzamento.value;
      const partoHint = $('[data-field="parto"] .hint', form);
      partoHint.textContent = form.elements.parto.value || !cruz
        ? ''
        : `Em branco: previsto para ${fmtDate(addDays(cruz, GESTACAO_DIAS))}`;
      const desmameHint = $('[data-field="desmame"] .hint', form);
      if (desmameHint) {
        const partoVal = form.elements.parto.value || (cruz ? addDays(cruz, GESTACAO_DIAS) : null);
        desmameHint.textContent = form.elements.desmame.value
          ? ''
          : (partoVal ? `Em branco: previsto para ${fmtDate(addDays(partoVal, DESMAME_DIAS))} (${DESMAME_DIAS} dias)` : `Em branco = ${DESMAME_DIAS} dias após o parto`);
      }
      const vivos = parseNum(form.elements.vivos.value);
      const mortos = parseNum(form.elements.mortos.value);
      const ok = (n) => n == null || Number.isInteger(n);
      $('[data-field="mortos"] .hint', form).textContent = vivos != null && ok(vivos) && ok(mortos)
        ? `Nascidos: ${vivos + (mortos || 0)}`
        : '';
      // Aviso de cruzamento entre parentes
      const rel = parentesco(animal(form.elements.matriz_id.value), animal(form.elements.barrao_id.value));
      const aviso = $('#avisoParentesco', form);
      aviso.textContent = rel ? `Atenção: ${rel}.` : '';
      aviso.hidden = !rel;
    };
    $('[data-field="barrao_id"]', form).insertAdjacentHTML('afterend', '<p class="aviso-parentesco" id="avisoParentesco" hidden></p>');
    dicas();
    form.oninput = dicas;
    form.onchange = dicas;
    dlg.addEventListener('close', () => { form.oninput = null; form.onchange = null; }, { once: true });
  }

  // alvo: { animal } ou { gestacao } ou nada (escolher vários animais)
  function formAplicacao(ap, alvo = {}) {
    const novo = !ap;
    const produtos = produtosOrdenados();
    if (!produtos.length) return toast('Cadastre um produto em Saúde primeiro.');
    const plantel = db.animais.filter(noPlantel);
    const varios = novo && !alvo.animal && !alvo.gestacao;
    let titulo = 'Aplicação';
    if (ap) titulo = `${nomeProduto(ap)} ${dose(numeroDose(ap))} em ${alvoAplicacao(ap)}`;
    else if (alvo.animal) titulo = `Aplicação em ${nomeAnimal(alvo.animal)}`;
    else if (alvo.gestacao) titulo = `Aplicação nas crias`;

    const fields = [
      { name: 'produto_id', label: 'Produto', type: 'select', half: true, required: true, options: produtos.map((p) => [p.id, p.nome]) },
      { name: 'data', label: 'Data', type: 'date', half: true, required: true },
    ];
    if (varios) fields.push({ name: 'animais', label: 'Em quais animais', type: 'checkboxes', required: true, options: animalOptions(plantel) });
    fields.push({ name: 'obs', label: 'Observações', type: 'textarea', placeholder: 'Dose, lote...' });

    openForm({
      title: titulo,
      values: ap || { produto_id: produtos[0].id, data: hoje(), animais: [] },
      fields,
      onSave: async (v) => {
        const base = { produto_id: v.produto_id, obs: v.obs };
        if (ap) {
          await save('aplicacoes', ap.id, { ...base, data: v.data });
          return 'Alterações salvas';
        }
        // Uma aplicação para cada data (doses) em cada animal (ou nas crias)
        const extras = $$('input[name="data_extra"]', form).map((i) => i.value).filter(Boolean);
        const datas = [...new Set([v.data, ...extras])].sort();
        const alvos = varios
          ? v.animais.map((id) => ({ animal_id: id }))
          : [{ animal_id: alvo.animal || null, gestacao_id: alvo.gestacao || null }];
        const rows = alvos.flatMap((t) => datas.map((data) => ({ ...base, ...t, data })));
        await saveMany('aplicacoes', rows);
        return rows.length > 1 ? `${rows.length} aplicações registradas` : 'Aplicação registrada';
      },
      onDelete: ap ? async () => {
        await remove('aplicacoes', ap.id);
        return 'Aplicação excluída';
      } : null,
    });
    if (!novo) return;

    // Mais doses da mesma vacina: cada data extra vira outra aplicação
    $('[data-field="data"]', form).insertAdjacentHTML('afterend', `<div class="field doses">
      <div id="dosesExtras"></div>
      <button type="button" class="btn small ghost" data-add-dose>${ICON.plus} Outra dose</button>
    </div>
    ${varios ? '' : '<div class="field ja-aplicadas" id="jaAplicadas"></div>'}`);

    // Doses que o alvo já tem do produto escolhido (num animal, contando as de quando era cria)
    const dosesDe = (alvoId, campo) => (campo === 'animal_id' ? aplicacoesAnimal(alvoId) : aplicacoesCria(alvoId))
      .filter((x) => x.produto_id === form.elements.produto_id.value);

    // Mostra as doses já registradas e numera os campos a partir da dose seguinte
    function atualizarDoses() {
      const nomeP = (produto(form.elements.produto_id.value) || {}).nome || '';
      let base = null; // quantas doses o alvo já tem (null = animais com quantidades diferentes)
      if (varios) {
        const marcados = [];
        $$('input[name="animais"]', form).forEach((i) => {
          const n = dosesDe(i.value, 'animal_id').length;
          const ultima = n ? dosesDe(i.value, 'animal_id')[n - 1].data : null;
          const span = $('span', i.closest('.check'));
          let info = $('small', span);
          if (!info) {
            span.insertAdjacentHTML('beforeend', '<small class="muted block"></small>');
            info = $('small', span);
          }
          info.textContent = n ? `${plural(n, 'dose', 'doses')} · última ${fmtDate(ultima)}` : 'nenhuma dose';
          if (i.checked) marcados.push(n);
        });
        const lista = marcados.length ? marcados : [];
        base = lista.length && lista.every((n) => n === lista[0]) ? lista[0] : null;
      } else {
        const aps = alvo.animal ? dosesDe(alvo.animal, 'animal_id') : dosesDe(alvo.gestacao, 'gestacao_id');
        base = aps.length;
        $('#jaAplicadas').innerHTML = `<span>Já registradas de ${esc(nomeP)}</span>
          ${aps.length ? `<div class="dose-list">${aps.map((x, k) => `<span class="dose">${dose(k + 1)} · ${esc(fmtDate(x.data))}</span>`).join('')}</div>`
            : `<p class="muted small">Nenhuma dose de ${esc(nomeP)} registrada ainda.</p>`}`;
      }
      const rotulo = (k) => (base == null
        ? (k === 0 ? 'Data da próxima dose' : 'Data da dose seguinte')
        : `Data da ${dose(base + 1 + k)}`);
      $('[data-field="data"] > span', form).textContent = rotulo(0);
      $$('.dose-row', form).forEach((r, k) => { $('span', r).textContent = rotulo(k + 1); });
    }

    atualizarDoses();
    form.onchange = atualizarDoses;
    form.onclick = (e) => {
      if (e.target.closest('[data-add-dose]')) {
        $('#dosesExtras').insertAdjacentHTML('beforeend', `<div class="dose-row"><label class="field"><span></span>
          <input type="date" name="data_extra"></label>
          <button type="button" class="icon" data-remove-dose aria-label="Tirar esta dose">×</button></div>`);
        atualizarDoses();
        $('#dosesExtras .dose-row:last-child input').focus();
      }
      const rm = e.target.closest('[data-remove-dose]');
      if (rm) {
        rm.closest('.dose-row').remove();
        atualizarDoses();
      }
    };
    dlg.addEventListener('close', () => { form.onclick = null; form.onchange = null; }, { once: true });
  }

  // Link da bula: '' se vazio, null se inválido. Sem "http" na frente, completa com https://
  function linkBula(s) {
    let t = String(s || '').trim();
    if (!t) return '';
    if (!/^https?:\/\//i.test(t)) t = `https://${t}`;
    try {
      const u = new URL(t);
      return /^https?:$/.test(u.protocol) && u.hostname.includes('.') && t.length <= 2000 ? u.href : null;
    } catch (e) {
      return null;
    }
  }

  const BULA_MAX = 20 * 1024 * 1024;
  const BULA_TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

  // Bula de um produto: { url, arquivo } (arquivo = true quando foi enviada como arquivo) ou null
  function bulaDe(p) {
    if (p.bula_arquivo && bulaUrl[p.bula_arquivo]) return { url: bulaUrl[p.bula_arquivo], arquivo: true };
    if (/^https?:\/\//i.test(p.bula || '')) return { url: p.bula, arquivo: false };
    return null;
  }

  function formProduto(p) {
    // Bula: um link ou um arquivo enviado (PDF ou foto). Guardar um apaga o outro.
    let modo = p && p.bula_arquivo ? 'arquivo' : 'link';
    openForm({
      title: p ? p.nome : 'Novo produto',
      values: p || {},
      fields: [
        { name: 'nome', label: 'Nome', required: true, placeholder: 'Ex.: Verme' },
        { name: 'intervalo_dias', label: 'Repetir a cada', type: 'number', suffix: 'dias', hint: 'Em branco = uso esporádico, sem calendário (ex.: Ferro nos leitões)' },
      ],
      onSave: async (v) => {
        if (v.intervalo_dias != null && (!Number.isInteger(v.intervalo_dias) || v.intervalo_dias <= 0)) throw new Error('O intervalo precisa ser um número inteiro de dias.');
        const row = { nome: v.nome, intervalo_dias: v.intervalo_dias };
        const antigo = p && p.bula_arquivo;
        let arquivo = null;
        if (modo === 'link') {
          const bula = linkBula($('[name="bula_link"]', form).value);
          if (bula == null) throw new Error('O link da bula não parece um endereço válido (ex.: https://site.com.br/bula.pdf).');
          Object.assign(row, { bula, bula_arquivo: null });
        } else {
          arquivo = $('[name="bula_file"]', form).files[0] || null;
          if (arquivo && !BULA_TIPOS.includes(arquivo.type)) throw new Error('A bula precisa ser um PDF ou uma foto (JPG, PNG ou WEBP).');
          if (arquivo && arquivo.size > BULA_MAX) throw new Error('O arquivo da bula passa de 20 MB.');
          if (arquivo && !navigator.onLine) throw new Error('Para enviar o arquivo da bula, conecte-se à internet.');
          row.bula = '';
          if (!arquivo && !antigo) row.bula_arquivo = null;
        }
        if (!p) row.ordem = db.produtos.reduce((m, x) => Math.max(m, x.ordem), 0) + 1;
        const salvo = await save('produtos', p && p.id, row);
        if (arquivo) {
          const ext = arquivo.type === 'application/pdf' ? 'pdf' : arquivo.type.split('/')[1].replace('jpeg', 'jpg');
          const path = `${salvo.id}/${Date.now()}.${ext}`;
          await Cloud.uploadBula(path, arquivo);
          await save('produtos', salvo.id, { bula_arquivo: path });
          Object.assign(bulaUrl, await Cloud.bulaUrls([path]));
        }
        // Arquivo antigo que deixou de ser usado
        const atual = byId('produtos', salvo.id).bula_arquivo;
        if (antigo && antigo !== atual) Cloud.removeBulas([antigo]).catch(() => {});
        return 'Produto salvo';
      },
      onDelete: p ? async () => {
        if (db.aplicacoes.some((x) => x.produto_id === p.id)) throw new Error('Este produto tem aplicações registradas: exclua-as antes.');
        await remove('produtos', p.id);
        if (p.bula_arquivo) Cloud.removeBulas([p.bula_arquivo]).catch(() => {});
        return 'Produto excluído';
      } : null,
    });

    const atual = p && p.bula_arquivo && bulaUrl[p.bula_arquivo];
    $('[data-field="intervalo_dias"]', form).insertAdjacentHTML('afterend', `<div class="field bula-field">
      <span>Bula</span>
      <div class="seg" role="group" aria-label="Como guardar a bula">
        <button type="button" data-bula-modo="link">Link</button>
        <button type="button" data-bula-modo="arquivo">Arquivo</button>
      </div>
      <div data-bula="link">
        <input name="bula_link" value="${esc((p && p.bula) || '')}" placeholder="https://…" autocomplete="off" aria-label="Link da bula">
        <small class="hint">Copie o endereço da página ou do PDF da bula e cole aqui. Em branco = sem bula.</small>
      </div>
      <div data-bula="arquivo">
        ${p && p.bula_arquivo ? `<p class="small">Arquivo atual: ${atual ? `<a href="${esc(atual)}" target="_blank" rel="noopener">abrir</a>` : 'guardado'}
          · escolha outro abaixo para trocar.</p>` : ''}
        <input type="file" name="bula_file" accept="application/pdf,image/jpeg,image/png,image/webp" aria-label="Arquivo da bula">
        <small class="hint">PDF ou foto da bula, até 20 MB. Só quem tem acesso ao site consegue abrir.</small>
      </div>
      <small class="hint">Guardar um link apaga o arquivo, e guardar um arquivo apaga o link.</small>
    </div>`);
    const mostrarModo = () => {
      $$('[data-bula-modo]', form).forEach((b) => {
        b.classList.toggle('on', b.dataset.bulaModo === modo);
        b.setAttribute('aria-pressed', String(b.dataset.bulaModo === modo));
      });
      $$('[data-bula]', form).forEach((d) => { d.hidden = d.dataset.bula !== modo; });
    };
    mostrarModo();
    form.onclick = (e) => {
      const b = e.target.closest('[data-bula-modo]');
      if (b) {
        modo = b.dataset.bulaModo;
        mostrarModo();
      }
    };
    dlg.addEventListener('close', () => { form.onclick = null; }, { once: true });
  }

  function formLancamento(l) {
    openForm({
      title: l ? 'Lançamento' : 'Novo lançamento',
      values: l || { data: hoje(), categoria: 'racao' },
      fields: [
        { name: 'categoria', label: 'Tipo', type: 'select', half: true, options: Object.entries(LANCAMENTOS).map(([k, x]) => [k, x.label]) },
        { name: 'data', label: 'Data', type: 'date', half: true, required: true },
        { name: 'valor', label: 'Valor', type: 'money', required: true },
        { name: 'descricao', label: 'Descrição', placeholder: 'Ex.: 3 sacos de milho' },
      ],
      onSave: async (v) => {
        if (!(v.valor > 0)) throw new Error('O valor precisa ser maior que zero.');
        await save('lancamentos', l && l.id, { data: v.data, categoria: v.categoria, tipo: LANCAMENTOS[v.categoria].tipo, valor: v.valor, descricao: v.descricao });
        return l ? 'Alterações salvas' : 'Lançamento salvo';
      },
      onDelete: l ? async () => {
        await remove('lancamentos', l.id);
        return 'Lançamento excluído';
      } : null,
    });
  }

  function formAbate(ab) {
    const opcoes = db.animais.filter((x) => noPlantel(x) || x.saida === 'abate');
    openForm({
      title: ab ? 'Abate' : 'Novo abate',
      intro: ab ? '' : 'Ao escolher um animal do plantel, ele é marcado como abatido nesta data.',
      values: ab || { data: hoje(), animal_id: '' },
      fields: [
        { name: 'data', label: 'Data', type: 'date', half: true, required: true },
        { name: 'animal_id', label: 'Animal', type: 'select', half: true, options: animalOptions(opcoes, '— (não informado)') },
        { name: 'lancar', label: 'Lançar o valor total como receita em Finanças', type: 'checkbox', showIf: () => !ab },
        { name: 'obs', label: 'Observações', type: 'textarea' },
      ],
      onSave: async (v) => {
        const { itens, total } = lerPartes();
        const kgDe = (nome) => {
          const list = itens.filter((i) => i.parte.toLowerCase() === nome && i.kg != null);
          return list.length ? list.reduce((s, i) => s + i.kg, 0) : null;
        };
        const row = {
          data: v.data, animal_id: v.animal_id || null, itens, valor: total, obs: v.obs,
          carne_kg: kgDe('carne'), toucinho_kg: kgDe('toucinho'),
        };
        await save('abates', ab && ab.id, row);
        const a = row.animal_id && animal(row.animal_id);
        if (a && (!a.saida || a.saida === 'abate') && a.saida_data !== row.data) {
          await save('animais', a.id, { saida: 'abate', saida_data: row.data });
        }
        if (!ab && v.lancar && total > 0) {
          await save('lancamentos', null, { data: row.data, tipo: 'receita', categoria: 'venda', descricao: `Abate${a ? `: ${a.nome}` : ''}`, valor: total });
        }
        return ab ? 'Alterações salvas' : 'Abate registrado';
      },
      onDelete: ab ? async () => {
        await remove('abates', ab.id);
        return 'Abate excluído';
      } : null,
    });

    // Partes: uma linha por parte, com peso, preço por kg e valor (peso × preço, ou digitado)
    const partes = ab ? partesAbate(ab) : [{ parte: 'Carne' }, { parte: 'Toucinho' }];
    const linha = (i = {}) => `<div class="parte-row">
      <input class="p-nome" name="parte_nome" list="partesLista" value="${esc(i.parte || '')}" placeholder="Parte" aria-label="Parte" autocomplete="off">
      <span class="input-affix p-kg"><input name="parte_kg" inputmode="decimal" value="${esc(toInput(i.kg))}" aria-label="Peso" autocomplete="off"><i>kg</i></span>
      <span class="input-affix p-preco"><i>R$</i><input name="parte_preco" inputmode="decimal" value="${esc(toInput(i.preco))}" aria-label="Preço por kg" placeholder="/kg" autocomplete="off"></span>
      <span class="input-affix p-valor"><i>R$</i><input name="parte_valor" inputmode="decimal" value="${esc(toInput(i.valor))}" aria-label="Valor da parte" placeholder="valor" autocomplete="off"></span>
      <button type="button" class="icon p-del" data-remove-parte aria-label="Tirar parte">×</button>
    </div>`;
    $('[data-field="lancar"]', form).insertAdjacentHTML('beforebegin', `<div class="field partes">
      <span>Partes</span>
      <div class="parte-head" aria-hidden="true"><span>Parte</span><span>Peso</span><span>Preço/kg</span><span>Valor</span><span></span></div>
      <div id="partesItens">${partes.map(linha).join('')}</div>
      <datalist id="partesLista">${PARTES_SUGERIDAS.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
      <button type="button" class="btn small ghost" data-add-parte>${ICON.plus} Parte</button>
      <small class="hint">Com peso e preço por kg, o valor da parte é calculado. Sem preço, dá para digitar o valor direto.</small>
      <label class="field total-abate"><span>Valor total</span>
        <span class="input-affix"><i>R$</i><input name="abate_total" inputmode="decimal" value="${esc(toInput(ab && ab.valor))}" autocomplete="off"></span>
        <small class="hint" id="totalHint"></small></label>
    </div>`);

    const num = (el) => parseNum(el.value);
    const round2 = (n) => Math.round(n * 100) / 100;
    function recalcular() {
      let soma = 0;
      let algum = false;
      $$('.parte-row', form).forEach((r) => {
        const kg = num($('[name=parte_kg]', r));
        const preco = num($('[name=parte_preco]', r));
        const valor = $('[name=parte_valor]', r);
        if (kg != null && preco != null && !Number.isNaN(kg) && !Number.isNaN(preco)) {
          valor.value = toInput(round2(kg * preco));
          valor.readOnly = true;
        } else if (valor.readOnly) {
          valor.value = '';
          valor.readOnly = false;
        }
        const v = num(valor);
        if (v != null && !Number.isNaN(v)) {
          soma += v;
          algum = true;
        }
      });
      const total = $('[name=abate_total]', form);
      total.readOnly = algum;
      if (algum) total.value = toInput(round2(soma));
      $('#totalHint').textContent = algum ? 'Soma das partes.' : 'Sem valor nas partes: digite o valor total do abate.';
    }

    lerPartes = () => {
      const itens = $$('.parte-row', form).map((r) => ({
        parte: $('[name=parte_nome]', r).value.trim(),
        kg: num($('[name=parte_kg]', r)),
        preco: num($('[name=parte_preco]', r)),
        valor: num($('[name=parte_valor]', r)),
      })).filter((i) => i.parte);
      if (itens.some((i) => [i.kg, i.preco, i.valor].some((x) => Number.isNaN(x) || (x != null && x < 0)))) {
        throw new Error('Confira os números das partes.');
      }
      const total = num($('[name=abate_total]', form));
      if (Number.isNaN(total) || (total != null && total < 0)) throw new Error('Valor total inválido.');
      return { itens, total: itens.some((i) => i.valor != null) ? round2(itens.reduce((s, i) => s + (i.valor || 0), 0)) : total };
    };

    recalcular();
    form.oninput = (e) => { if (e.target.closest('.parte-row')) recalcular(); };
    form.onclick = (e) => {
      if (e.target.closest('[data-add-parte]')) {
        $('#partesItens').insertAdjacentHTML('beforeend', linha());
        $('#partesItens .parte-row:last-child input').focus();
      }
      const rm = e.target.closest('[data-remove-parte]');
      if (rm) {
        rm.closest('.parte-row').remove();
        recalcular();
      }
    };
    dlg.addEventListener('close', () => { form.oninput = null; form.onclick = null; }, { once: true });
  }

  // Lê as partes do formulário de abate aberto (definida por formAbate)
  let lerPartes = () => ({ itens: [], total: null });

  // Fórmula de ração: lista de ingredientes com porcentagem
  function formRacao(r) {
    const itens = r ? r.itens : [{ nome: 'Milho', pct: 0 }, { nome: 'Farelo de soja', pct: 0 }, { nome: 'Núcleo', pct: 0 }];
    const linha = (i) => `<div class="item-row"><input name="item_nome" value="${esc(i.nome)}" placeholder="Ingrediente" aria-label="Ingrediente" autocomplete="off">
      <span class="input-affix"><input name="item_pct" inputmode="decimal" value="${esc(toInput(i.pct))}" aria-label="Porcentagem" autocomplete="off"><i>%</i></span>
      <button type="button" class="icon" data-remove-item aria-label="Tirar ingrediente">×</button></div>`;

    openForm({
      title: r ? r.fase : 'Nova fase',
      values: r || {},
      fields: [
        { name: 'fase', label: 'Fase', required: true, half: true, placeholder: 'Ex.: Crescimento' },
        { name: 'faixa', label: 'Idade', half: true, placeholder: 'Ex.: 71 a 110 dias' },
      ],
      onSave: async (v) => {
        const nomes = $$('input[name="item_nome"]', form).map((i) => i.value.trim());
        const pcts = $$('input[name="item_pct"]', form).map((i) => parseNum(i.value));
        const lista = nomes.map((nome, k) => ({ nome, pct: pcts[k] == null ? 0 : pcts[k] })).filter((x) => x.nome);
        if (!lista.length) throw new Error('Coloque pelo menos um ingrediente.');
        if (lista.some((x) => Number.isNaN(x.pct) || x.pct < 0)) throw new Error('Porcentagem inválida.');
        const row = { fase: v.fase, faixa: v.faixa, itens: lista };
        if (!r) row.ordem = db.racoes.reduce((m, x) => Math.max(m, x.ordem), 0) + 1;
        await save('racoes', r && r.id, row);
        return 'Fórmula salva';
      },
      onDelete: r ? async () => {
        await remove('racoes', r.id);
        return 'Fase excluída';
      } : null,
    });
    $('.fields', form).insertAdjacentHTML('beforeend', `<div class="field"><span>Ingredientes</span>
      <div class="items" id="racaoItens">${itens.map(linha).join('')}</div>
      <p class="hint" id="racaoSoma"></p>
      <button type="button" class="btn small ghost" data-add-item>${ICON.plus} Ingrediente</button></div>`);
    const soma = () => {
      const s = $$('input[name="item_pct"]', form).reduce((t, i) => t + (parseNum(i.value) || 0), 0);
      const p = $('#racaoSoma');
      if (!p) return;
      p.textContent = `Soma: ${fmtPct(s)}${Math.abs(s - 100) < 0.01 ? '' : ' (o ideal é 100%)'}`;
      p.classList.toggle('danger-text', Math.abs(s - 100) >= 0.01);
    };
    soma();
    form.oninput = soma;
    form.onclick = (e) => {
      if (e.target.closest('[data-add-item]')) {
        $('#racaoItens').insertAdjacentHTML('beforeend', linha({ nome: '', pct: '' }));
        $('#racaoItens .item-row:last-child input').focus();
      }
      const rm = e.target.closest('[data-remove-item]');
      if (rm) {
        rm.closest('.item-row').remove();
        soma();
      }
    };
    dlg.addEventListener('close', () => { form.oninput = null; form.onclick = null; }, { once: true });
  }

  // ---------- SOS Suínos: Envio e Gerenciamento de Arquivos ----------

  function formUploadSos(file) {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast('O arquivo passa do limite de 50 MB.');
      return;
    }
    const nomePadrao = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
    const tituloSugerido = nomePadrao.charAt(0).toUpperCase() + nomePadrao.slice(1);

    // Sugere categoria pelo nome do arquivo
    let catSugerida = 'manual';
    const n = file.name.toLowerCase();
    if (/vacina|doenca|doença|remedio|remédio|saude|saúde|sintoma/i.test(n)) catSugerida = 'saude';
    else if (/racao|ração|nutricao|nutrição|alimento|manejo|baia/i.test(n)) catSugerida = 'nutricao';
    else if (/laudo|exame|necropsia|necrópsia|veterinario|veterinário/i.test(n)) catSugerida = 'laudo';
    else if (/nota|comprovante|recibo|pagamento|custo/i.test(n)) catSugerida = 'financeiro';

    openForm({
      title: 'Enviar documento',
      intro: `Arquivo selecionado: <strong>${esc(file.name)}</strong> (${esc(fmtBytes(file.size))})`,
      values: {
        titulo: tituloSugerido,
        categoria: catSugerida,
        obs: '',
      },
      fields: [
        { name: 'titulo', label: 'Título ou nome do documento', type: 'text', required: true },
        { name: 'categoria', label: 'Categoria', type: 'select', required: true, options: Object.entries(CATEGORIAS_DOC).map(([k, v]) => [k, v]) },
        { name: 'obs', label: 'Anotações / Observações (opcional)', type: 'textarea' },
      ],
      submitLabel: 'Enviar para a nuvem',
      onSave: async (v) => {
        if (!navigator.onLine) throw new Error('Para enviar arquivos para a nuvem, conecte-se à internet.');
        toast('Enviando arquivo para a nuvem…', 25000);
        const limpo = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${grupoAtivo ? grupoAtivo.id : 'geral'}/${Date.now()}_${limpo}`;
        const bucketUsado = await Cloud.uploadDocumento(path, file);
        const salvo = await save('documentos', null, {
          titulo: v.titulo.trim() || file.name,
          nome_arquivo: file.name,
          caminho: path,
          bucket: bucketUsado,
          tamanho: file.size,
          tipo_mime: file.type || '',
          categoria: v.categoria,
          obs: v.obs ? v.obs.trim() : '',
          ordem: (db.documentos || []).reduce((m, x) => Math.max(m, x.ordem || 0), 0) + 1,
        });
        try {
          const urls = await Cloud.documentoUrls([salvo]);
          Object.assign(docUrl, urls);
        } catch (e) {}
        render();
        return 'Arquivo enviado com sucesso!';
      },
    });
  }

  async function uploadMultiplosSos(files) {
    if (!navigator.onLine) return toast('Conecte-se à internet para enviar os arquivos.');
    toast(`Enviando ${files.length} arquivos…`, 30000);
    let enviados = 0;
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) continue;
      const limpo = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${grupoAtivo ? grupoAtivo.id : 'geral'}/${Date.now()}_${limpo}`;
      try {
        const bucket = await Cloud.uploadDocumento(path, file);
        let categoria = 'outro';
        const n = file.name.toLowerCase();
        if (/manual|cartilha|guia/i.test(n)) categoria = 'manual';
        else if (/vacina|doenca|doença|remedio|remédio|saude|saúde|sintoma/i.test(n)) categoria = 'saude';
        else if (/racao|ração|nutricao|nutrição|alimento|manejo/i.test(n)) categoria = 'nutricao';
        else if (/laudo|exame|necropsia|necrópsia/i.test(n)) categoria = 'laudo';
        else if (/nota|comprovante|recibo/i.test(n)) categoria = 'financeiro';

        const nomePadrao = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
        const titulo = nomePadrao.charAt(0).toUpperCase() + nomePadrao.slice(1);
        const salvo = await save('documentos', null, {
          titulo,
          nome_arquivo: file.name,
          caminho: path,
          bucket,
          tamanho: file.size,
          tipo_mime: file.type || '',
          categoria,
          obs: '',
          ordem: (db.documentos || []).reduce((m, x) => Math.max(m, x.ordem || 0), 0) + 1,
        });
        try {
          const urls = await Cloud.documentoUrls([salvo]);
          Object.assign(docUrl, urls);
        } catch (e) {}
        enviados++;
      } catch (e) {
        console.error(e);
      }
    }
    render();
    toast(`${plural(enviados, 'arquivo enviado', 'arquivos enviados')} com sucesso!`);
  }

  function processarArquivosSos(fileList) {
    if (!fileList || !fileList.length) return;
    const files = [...fileList];
    if (files.length === 1) {
      formUploadSos(files[0]);
    } else {
      uploadMultiplosSos(files);
    }
  }

  function formEditarSos(d) {
    if (!d) return;
    openForm({
      title: 'Editar documento',
      intro: `Arquivo: <strong>${esc(d.nome_arquivo)}</strong> (${esc(fmtBytes(d.tamanho))})`,
      values: {
        titulo: d.titulo || d.nome_arquivo,
        categoria: d.categoria || 'manual',
        obs: d.obs || '',
      },
      fields: [
        { name: 'titulo', label: 'Título do documento', type: 'text', required: true },
        { name: 'categoria', label: 'Categoria', type: 'select', required: true, options: Object.entries(CATEGORIAS_DOC).map(([k, v]) => [k, v]) },
        { name: 'obs', label: 'Observações / Anotações', type: 'textarea' },
      ],
      submitLabel: 'Salvar alterações',
      onSave: async (v) => {
        await save('documentos', d.id, {
          titulo: v.titulo.trim() || d.nome_arquivo,
          categoria: v.categoria,
          obs: v.obs ? v.obs.trim() : '',
        });
        return 'Documento atualizado';
      },
      onDelete: async () => {
        await remove('documentos', d.id);
        if (d.caminho) Cloud.removeDocumentos([d]).catch(() => {});
        return 'Documento excluído';
      },
    });
  }

  async function excluirSos(d) {
    if (!d) return;
    if (!confirm(`Excluir o arquivo "${d.titulo || d.nome_arquivo}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await remove('documentos', d.id);
      if (d.caminho) {
        Cloud.removeDocumentos([d]).catch(() => {});
      }
      render();
      toast('Arquivo excluído');
    } catch (err) {
      toast(errMsg(err));
    }
  }

  // ---------- Fotos ----------

  let fotoAlvo = null;

  function resizeImage(file, max = 1200) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('não foi possível ler a foto'))), 'image/jpeg', 0.85);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('arquivo de imagem inválido'));
      };
      img.src = url;
    });
  }

  // Reduz a foto, envia e troca a foto do animal (apaga a antiga)
  async function enviarFoto(a, file) {
    const blob = await resizeImage(file);
    const path = `animais/${a.id}/${Date.now()}.jpg`;
    await Cloud.uploadFoto(path, blob);
    const antiga = animal(a.id).foto;
    await save('animais', a.id, { foto: path });
    Object.assign(fotoUrl, await Cloud.fotoUrls([path]));
    if (antiga) Cloud.removeFotos([antiga]).catch(() => {});
  }

  $('#fotoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    const a = fotoAlvo && animal(fotoAlvo);
    if (!file || !a) return;
    toast('Enviando foto…', 20000);
    try {
      await enviarFoto(a, file);
      render();
      toast('Foto salva');
    } catch (err) {
      toast(errMsg(err), 6000);
    }
  });

  // Fotos em lote: cada arquivo vai para o animal com o mesmo nome ("Matriz 1.jpg" -> Matriz 1)
  const normalizar = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  $('#fotosLote').addEventListener('change', (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const porNome = new Map(db.animais.map((a) => [normalizar(a.nome), a]));
    const itens = files.map((f) => ({ file: f, animal: porNome.get(normalizar(f.name.replace(/\.[^.]+$/, ''))) || null }))
      .sort((x, y) => (x.animal ? x.animal.ordem : 1e9) - (y.animal ? y.animal.ordem : 1e9));
    const ok = itens.filter((x) => x.animal);
    const repetidos = new Set(ok.map((x) => x.animal.id)).size !== ok.length;
    const lista = `<ul class="list lote-lista">${itens.map((x) => `<li class="list-row"><span><strong>${esc(x.file.name)}</strong>
        <small>${x.animal ? `${esc(x.animal.nome)}${x.animal.foto ? ' · substitui a foto atual' : ''}` : 'nenhum animal com esse nome: fica de fora'}</small></span>
        <span class="right">${x.animal ? fotoHtml(x.animal) : ''}<span class="lote-status" data-arquivo="${esc(x.file.name)}"></span></span></li>`).join('')}</ul>`;
    openForm({
      title: 'Fotos em lote',
      intro: `Cada foto vai para o animal com o mesmo nome do arquivo (ex.: <strong>Matriz 1.jpg</strong> vai para a Matriz 1).
        ${repetidos ? '<br><strong>Há mais de um arquivo para o mesmo animal: vale o último.</strong>' : ''}`,
      fields: [],
      submitLabel: ok.length ? `Enviar ${plural(ok.length, 'foto', 'fotos')}` : 'Fechar',
      onSave: async () => {
        let n = 0;
        for (const x of ok) {
          const st = $(`.lote-status[data-arquivo="${CSS.escape(x.file.name)}"]`, form);
          if (st) st.textContent = 'enviando…';
          try {
            await enviarFoto(x.animal, x.file);
            n++;
            if (st) st.textContent = 'ok';
          } catch (err) {
            if (st) st.textContent = 'erro';
            throw new Error(`${n} de ${ok.length} enviadas. Parou em ${x.file.name}: ${errMsg(err)}`);
          }
        }
        return ok.length ? `${plural(n, 'foto enviada', 'fotos enviadas')}` : '';
      },
    });
    $('.fields', form).innerHTML = lista;
  });

  // Endereços temporários das fotos e dos arquivos de bula e documentos (os buckets são privados)
  async function refreshFotos() {
    const paths = db.animais.map((a) => a.foto).filter(Boolean);
    const bulas = db.produtos.map((p) => p.bula_arquivo).filter(Boolean);
    const docs = (db.documentos || []).map((d) => ({ caminho: d.caminho, bucket: d.bucket })).filter((x) => x.caminho);
    try {
      fotoUrl = await Cloud.fotoUrls(paths);
    } catch (err) {
      fotoUrl = {};
    }
    try {
      bulaUrl = await Cloud.bulaUrls(bulas);
    } catch (err) {
      bulaUrl = {};
    }
    try {
      docUrl = await Cloud.documentoUrls(docs);
    } catch (err) {
      docUrl = {};
    }
  }

  // ---------- Cópia de segurança em Excel ----------
  // A biblioteca (SheetJS) só é baixada quando alguém exporta.

  const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  let xlsxPronto = null;

  function carregarXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxPronto) {
      xlsxPronto = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = XLSX_URL;
        s.onload = () => resolve(window.XLSX);
        s.onerror = () => {
          xlsxPronto = null;
          reject(new Error('não foi possível baixar o gerador de planilhas (sem internet?)'));
        };
        document.head.appendChild(s);
      });
    }
    return xlsxPronto;
  }

  // Data "AAAA-MM-DD" -> número de série do Excel (dias desde 30/12/1899), sem depender do fuso horário.
  // As colunas de data recebem o formato dd/mm/aaaa em exportarExcel.
  const COLUNAS_DATA = new Set(['Data', 'Nascimento', 'Chegada', 'Data da saída', 'Cruzamento', 'Parto', 'Capação', 'Desmame', 'Data do descarte', 'Data do aborto']);
  function xDate(s) {
    if (!s) return null;
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
    return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
  }
  const xNum = (v) => (v == null || v === '' ? null : Number(v));

  // Monta as abas: { nome, linhas: [{ coluna: valor }], dinheiro: [colunas], datas: [colunas] }
  function abasExcel() {
    const animalNome = (id) => (id ? nomeAnimal(id) : '');
    const animais = sortAnimais(db.animais).map((a) => {
      const g = a.gestacao_id && byId('gestacoes', a.gestacao_id);
      return {
        Nome: a.nome,
        Categoria: CATEGORIAS[a.categoria],
        Situação: statusAnimal(a),
        Nascimento: xDate(a.nascimento),
        Idade: a.nascimento ? idadeAnimal(a) : '',
        Aquisição: AQUISICAO[a.aquisicao],
        Chegada: xDate(a.chegada),
        'Negociado com': a.negociado_com || '',
        'Valor de compra': xNum(a.valor_compra),
        'Data da saída': xDate(a.saida_data),
        'Valor da venda': xNum(a.valor_venda),
        Mãe: g ? animalNome(g.matriz_id) : '',
        Pai: g ? animalNome(g.barrao_id) : '',
        'Cria da gestação': g ? `${ordinal(numeroGestacao(g))} gestação` : '',
        Observações: a.obs || '',
      };
    });
    const gestacoes = [...db.gestacoes].sort((a, b) => nomeAnimal(a.matriz_id).localeCompare(nomeAnimal(b.matriz_id), 'pt-BR') || a.cruzamento.localeCompare(b.cruzamento))
      .map((g) => {
        const parto = partoDe(g);
        const dataDesmame = g.desmame || (parto ? addDays(parto, DESMAME_DIAS) : null);
        const idadeDesmame = parto && dataDesmame ? diffDays(parto, dataDesmame) : null;
        return {
          Matriz: animalNome(g.matriz_id),
          Gestação: ordinal(numeroGestacao(g)),
          'Barrão (pai)': animalNome(g.barrao_id),
          Cruzamento: xDate(g.cruzamento),
          Parto: xDate(parto),
          Situação: { nascida: 'Nascida', prevista: 'Prevista', pendente: 'Falta registrar o parto' }[situacaoGestacao(g)],
          'Duração (dias)': g.vivos != null ? diffDays(g.cruzamento, parto) : null,
          Nascidos: nascidosDe(g),
          Vivos: g.vivos,
          Mortos: g.mortos,
          Machos: g.machos,
          Fêmeas: g.femeas,
          Capação: xDate(g.capacao),
          Desmame: xDate(dataDesmame),
          'Idade no desmame (dias)': idadeDesmame,
          Observações: g.obs || '',
        };
      });
    const aplicacoes = sortByDate(db.aplicacoes).map((x) => ({
      Data: xDate(x.data),
      Produto: nomeProduto(x),
      Dose: dose(numeroDose(x)),
      Em: alvoAplicacao(x),
      Observações: x.obs || '',
    }));
    const produtos = produtosOrdenados().map((p) => ({
      Nome: p.nome,
      Uso: p.intervalo_dias ? 'Recorrente' : 'Esporádico',
      'Repetir a cada (dias)': p.intervalo_dias,
      Bula: p.bula_arquivo ? 'Arquivo enviado (abrir pelo site)' : (p.bula || ''),
    }));
    const partes = colunasPartes(db.abates);
    const abates = sortByDate(db.abates).map((ab) => {
      const row = { Data: xDate(ab.data), Animal: animalNome(ab.animal_id) };
      partes.forEach((c) => {
        const list = partesAbate(ab).filter((i) => i.parte.trim().toLowerCase() === c.key);
        row[`${c.nome} (kg)`] = list.some((i) => i.kg != null) ? list.reduce((s, i) => s + Number(i.kg || 0), 0) : null;
        row[`${c.nome} (R$)`] = list.some((i) => i.valor != null) ? list.reduce((s, i) => s + Number(i.valor || 0), 0) : null;
      });
      row['Peso total (kg)'] = partesAbate(ab).length ? pesoAbate(ab) : null;
      row['Valor total'] = xNum(ab.valor);
      row.Observações = ab.obs || '';
      return row;
    });
    const lancamentos = sortByDate(db.lancamentos).map((l) => ({
      Data: xDate(l.data),
      Tipo: l.tipo === 'receita' ? 'Receita' : 'Despesa',
      Categoria: LANCAMENTOS[l.categoria].label,
      Descrição: l.descricao || '',
      Valor: Number(l.valor),
    }));
    const meses = new Map();
    db.lancamentos.forEach((l) => {
      const k = l.data.slice(0, 7);
      if (!meses.has(k)) meses.set(k, []);
      meses.get(k).push(l);
    });
    const porMes = [...meses.keys()].sort().map((k) => {
      const t = totaisFinancas(meses.get(k));
      return { Mês: fmtMonth(k), Soro: t.soro, Ração: t.racao, Outras: t.outras, Receitas: t.receitas, Saldo: t.saldo };
    });
    const nomesIng = ingredientesRacao();
    const racao = racoesOrdenadas().map((r) => {
      const row = { Fase: r.fase, Idade: r.faixa || '' };
      nomesIng.forEach((n) => {
        const i = (r.itens || []).find((x) => x.nome === n);
        row[`${n} (%)`] = i ? Number(i.pct) : 0;
      });
      row['Soma (%)'] = (r.itens || []).reduce((s, i) => s + Number(i.pct || 0), 0);
      return row;
    });
    const docsExcel = (db.documentos || []).map((d) => ({
      Título: d.titulo || '',
      Arquivo: d.nome_arquivo || '',
      Categoria: CATEGORIAS_DOC[d.categoria] || d.categoria || 'Outro',
      Tamanho: fmtBytes(d.tamanho),
      Data: xDate(d.criado_em ? d.criado_em.slice(0, 10) : null),
      Observações: d.obs || '',
    }));
    const dnpPlantel = calcularDnpPlantel();
    const dnpExcel = dnpPlantel.matrizesDnp.map((d) => ({
      Matriz: d.animal.nome,
      Situação: d.animal.descarte && noPlantel(d.animal) ? 'Aguardando descarte' : statusAnimal(d.animal),
      'Total DNP (dias)': d.totalDnp,
      'Motivo principal': d.motivoPrincipal,
      'Gerando DNP hoje': d.dnpHoje ? 'Sim' : 'Não',
      'Descarte planejado': d.animal.descarte ? 'Sim' : 'Não',
      'Data do descarte': xDate(d.animal.descarte_data),
      'Períodos improdutivos': d.itens.map((it) => `${it.rotulo}: ${it.dias}d (${it.periodo})`).join('; ') || 'Nenhum',
    }));
    const dinheiroAbates = Object.keys(abates[0] || {}).filter((k) => k.endsWith('(R$)') || k === 'Valor total');
    return [
      { nome: 'Animais', linhas: animais, dinheiro: ['Valor de compra', 'Valor da venda'] },
      { nome: 'Gestações', linhas: gestacoes },
      { nome: 'DNP', linhas: dnpExcel },
      { nome: 'Aplicações', linhas: aplicacoes },
      { nome: 'Vacinas e remédios', linhas: produtos },
      { nome: 'Abates', linhas: abates, dinheiro: dinheiroAbates },
      { nome: 'Lançamentos', linhas: lancamentos, dinheiro: ['Valor'] },
      { nome: 'Por mês', linhas: porMes, dinheiro: ['Soro', 'Ração', 'Outras', 'Receitas', 'Saldo'] },
      { nome: 'Ração', linhas: racao },
      { nome: 'Documentos', linhas: docsExcel },
    ];
  }

  async function exportarExcel(btn) {
    btn.disabled = true;
    toast('Preparando a planilha…', 20000);
    try {
      const XLSX = await carregarXlsx();
      const wb = XLSX.utils.book_new();
      for (const aba of abasExcel()) {
        const ws = aba.linhas.length
          ? XLSX.utils.json_to_sheet(aba.linhas)
          : XLSX.utils.aoa_to_sheet([['Nenhum registro']]);
        const cols = aba.linhas.length ? Object.keys(aba.linhas[0]) : [];
        // Formato de data e de dinheiro, e largura das colunas
        cols.forEach((c, j) => {
          const z = COLUNAS_DATA.has(c) ? 'dd/mm/yyyy' : ((aba.dinheiro || []).includes(c) ? '"R$" #,##0.00' : null);
          if (!z) return;
          for (let i = 1; i <= aba.linhas.length; i++) {
            const cell = ws[XLSX.utils.encode_cell({ r: i, c: j })];
            if (cell && typeof cell.v === 'number') cell.z = z;
          }
        });
        ws['!cols'] = cols.map((c) => ({
          wch: Math.min(40, Math.max(c.length, ...aba.linhas.map((l) => (COLUNAS_DATA.has(c) ? 10 : String(l[c] ?? '').length))) + 2),
        }));
        XLSX.utils.book_append_sheet(wb, ws, aba.nome);
      }
      XLSX.writeFile(wb, `controle-porcos-${hoje()}.xlsx`);
      toast('Planilha baixada');
    } catch (err) {
      toast(`Não foi possível gerar a planilha: ${err.message}`, 6000);
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- Cópia completa (JSON e ZIP) e restauração ----------
  //
  // JSON: as tabelas do banco como estão (com ids). ZIP: o mesmo JSON em "dados.json" mais as
  // fotos e os arquivos de bula em "arquivos/<bucket>/<caminho>". Restaurar aceita os dois.

  const COPIA_APP = 'controle-porcos';

  function dadosCopia() {
    const tabelas = Object.fromEntries(Object.entries(Cloud.TABLES).map(([kind, tabela]) => [tabela, db[kind]]));
    return {
      app: COPIA_APP,
      formato: 1,
      exportado_em: new Date().toISOString(),
      exportado_por: (user && user.email) || '',
      dados_carregados_em: loadedAt ? new Date(loadedAt).toISOString() : null,
      contagem: Object.fromEntries(Object.entries(tabelas).map(([t, rows]) => [t, rows.length])),
      tabelas,
    };
  }

  function baixarBlob(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function exportarJson(sufixo = '') {
    const blob = new Blob([JSON.stringify(dadosCopia(), null, 2)], { type: 'application/json' });
    baixarBlob(blob, `controle-porcos-${hoje()}${sufixo}.json`);
    if (!sufixo) toast(offline ? 'Cópia baixada (com os dados salvos neste aparelho)' : 'Cópia baixada');
  }

  const JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  let jszipPronto = null;

  function carregarJszip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (!jszipPronto) {
      jszipPronto = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = JSZIP_URL;
        s.onload = () => resolve(window.JSZip);
        s.onerror = () => {
          jszipPronto = null;
          reject(new Error('não foi possível baixar o gerador de .zip (sem internet?)'));
        };
        document.head.appendChild(s);
      });
    }
    return jszipPronto;
  }

  // Arquivos guardados no Supabase que a cópia completa leva: [{ bucket, path }]
  function arquivosDaCopia() {
    const lista = [];
    db.animais.forEach((a) => { if (a.foto) lista.push({ bucket: Cloud.BUCKETS.fotos, path: a.foto }); });
    db.produtos.forEach((p) => { if (p.bula_arquivo) lista.push({ bucket: Cloud.BUCKETS.bulas, path: p.bula_arquivo }); });
    (db.documentos || []).forEach((d) => { if (d.caminho) lista.push({ bucket: d.bucket || Cloud.BUCKETS.documentos, path: d.caminho }); });
    return lista;
  }

  async function exportarZip(btn) {
    if (offline) return toast('Sem conexão: a cópia completa precisa baixar as fotos da nuvem.');
    btn.disabled = true;
    try {
      const JSZip = await carregarJszip();
      const zip = new JSZip();
      const dados = dadosCopia();
      const arquivos = arquivosDaCopia();
      const faltando = [];
      for (let i = 0; i < arquivos.length; i++) {
        const f = arquivos[i];
        toast(`Baixando fotos e bulas… ${i + 1} de ${arquivos.length}`, 20000);
        try {
          zip.file(`arquivos/${f.bucket}/${f.path}`, await Cloud.downloadArquivo(f.bucket, f.path));
        } catch (err) {
          faltando.push(`${f.bucket}/${f.path}`);
        }
      }
      dados.arquivos = arquivos.map((f) => `${f.bucket}/${f.path}`).filter((p) => !faltando.includes(p));
      if (faltando.length) dados.arquivos_faltando = faltando;
      zip.file('dados.json', JSON.stringify(dados, null, 2));
      zip.file('LEIA-ME.txt', 'Cópia completa do Controle de Porcos.\r\n\r\n'
        + 'dados.json: todos os dados (animais, gestações, aplicações, abates, lançamentos, ração, vacinas).\r\n'
        + 'arquivos/: fotos dos animais e arquivos de bula.\r\n\r\n'
        + 'Para restaurar: no site, Conta > Cópia de segurança > Restaurar cópia, e escolha este .zip.\r\n');
      toast('Montando o arquivo .zip…', 20000);
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      baixarBlob(blob, `controle-porcos-completo-${hoje()}.zip`);
      toast(faltando.length
        ? `Cópia baixada, mas ${plural(faltando.length, 'arquivo não pôde', 'arquivos não puderam')} ser incluído(s).`
        : `Cópia completa baixada (${plural(arquivos.length, 'arquivo', 'arquivos')})`, 6000);
    } catch (err) {
      toast(`Não foi possível gerar a cópia: ${err.message}`, 6000);
    } finally {
      btn.disabled = false;
    }
  }

  // Lê um .zip (cópia completa) ou .json: { dados, arquivos: [{ bucket, path, blob }] }
  async function lerCopia(file) {
    let dados;
    const arquivos = [];
    if (/\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
      const JSZip = await carregarJszip();
      const zip = await JSZip.loadAsync(file);
      const j = zip.file('dados.json');
      if (!j) throw new Error('o .zip não tem o arquivo dados.json (não é uma cópia completa deste site).');
      dados = JSON.parse(await j.async('string'));
      const buckets = Object.values(Cloud.BUCKETS);
      const entradas = zip.file(/^arquivos\//);
      for (const e of entradas) {
        const m = e.name.match(/^arquivos\/([^/]+)\/(.+)$/);
        if (!m || !buckets.includes(m[1])) continue;
        arquivos.push({ bucket: m[1], path: m[2], blob: await e.async('blob') });
      }
    } else {
      dados = JSON.parse(await file.text());
    }
    if (!dados || dados.app !== COPIA_APP || !dados.tabelas || typeof dados.tabelas !== 'object') {
      throw new Error('este arquivo não é uma cópia do Controle de Porcos.');
    }
    if (dados.formato > 1) throw new Error('a cópia foi feita por uma versão mais nova do site; recarregue a página e tente de novo.');
    return { dados, arquivos };
  }

  const tipoArquivo = (path) => ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }[String(path).split('.').pop().toLowerCase()] || 'application/octet-stream');

  // Linhas de uma tabela da cópia prontas para gravar (sem "atualizado_por", que o banco preenche)
  function linhasCopia(dados, kind) {
    const rows = dados.tabelas[Cloud.TABLES[kind]];
    if (rows == null) return [];
    if (!Array.isArray(rows)) throw new Error(`a tabela ${Cloud.TABLES[kind]} da cópia está com defeito.`);
    return rows.map((r) => {
      if (!r || !r.id) throw new Error(`há um registro sem id em ${Cloud.TABLES[kind]}.`);
      const { atualizado_por: _ap, ...resto } = r;
      if (kind === 'gestacoes' && resto.nascidos !== undefined && resto.vivos === undefined) {
        resto.vivos = resto.nascidos; // cópias de antes da troca "nascidos" -> "vivos"
        delete resto.nascidos;
      }
      return resto;
    });
  }

  const ORDEM_APAGAR = ['documentos', 'aplicacoes', 'abates', 'lancamentos', 'racoes', 'gestacoes', 'animais', 'produtos'];

  // Substitui os dados atuais pelos da cópia. progresso(texto) mostra em que passo está.
  async function restaurarCopia({ dados, arquivos }, progresso) {
    const novos = Object.fromEntries(Object.keys(Cloud.TABLES).map((k) => [k, linhasCopia(dados, k)]));
    // 1) Apaga o que não existe na cópia (filhos antes dos pais)
    for (const kind of ORDEM_APAGAR) {
      const manter = new Set(novos[kind].map((r) => r.id));
      const apagar = db[kind].filter((r) => !manter.has(r.id)).map((r) => r.id);
      if (apagar.length) {
        progresso(`Apagando ${apagar.length} registro(s) que não estão na cópia…`);
        await Cloud.removeIds(kind, apagar);
      }
    }
    // 2) Grava a cópia (pais antes dos filhos). Animais e gestações se apontam: animais primeiro sem a gestação.
    progresso('Gravando vacinas e remédios…');
    await Cloud.upsertMany('produtos', novos.produtos);
    progresso('Gravando animais…');
    await Cloud.upsertMany('animais', novos.animais.map((a) => ({ ...a, gestacao_id: null })));
    progresso('Gravando gestações…');
    await Cloud.upsertMany('gestacoes', novos.gestacoes);
    await Cloud.upsertMany('animais', novos.animais);
    for (const [kind, nome] of [['aplicacoes', 'aplicações'], ['abates', 'abates'], ['lancamentos', 'lançamentos'], ['racoes', 'ração'], ['documentos', 'Documentos (arquivos)']]) {
      progresso(`Gravando ${nome}…`);
      await Cloud.upsertMany(kind, novos[kind]);
    }
    // 3) Fotos e bulas que vieram no .zip
    for (let i = 0; i < arquivos.length; i++) {
      const f = arquivos[i];
      progresso(`Enviando fotos e bulas… ${i + 1} de ${arquivos.length}`);
      await Cloud.uploadArquivo(f.bucket, f.path, f.blob, tipoArquivo(f.path));
    }
  }

  async function abrirRestauracao(file) {
    let copia;
    try {
      toast('Lendo a cópia…', 20000);
      copia = await lerCopia(file);
      toast('Cópia lida', 1500);
    } catch (err) {
      toast(`Não foi possível ler: ${err.message}`, 7000);
      return;
    }
    const { dados, arquivos } = copia;
    const linhas = Object.entries(Cloud.TABLES).map(([kind, tabela]) => {
      const nCopia = Array.isArray(dados.tabelas[tabela]) ? dados.tabelas[tabela].length : 0;
      const nomes = { animais: 'Animais', gestacoes: 'Gestações', produtos: 'Vacinas e remédios', aplicacoes: 'Aplicações', abates: 'Abates', lancamentos: 'Lançamentos', racoes: 'Fases de ração', documentos: 'Documentos' };
      return `<tr><th scope="row">${nomes[kind]}</th><td class="num">${db[kind].length}</td><td class="num"><strong>${nCopia}</strong></td></tr>`;
    }).join('');
    const quando = dados.exportado_em ? new Date(dados.exportado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '?';
    openForm({
      title: 'Restaurar cópia',
      intro: `Cópia de <strong>${esc(quando)}</strong>${dados.exportado_por ? `, feita por ${esc(dados.exportado_por)}` : ''}.
        ${arquivos.length ? `Traz ${plural(arquivos.length, 'foto ou bula', 'fotos e bulas')}.` : 'Não traz fotos nem bulas (só dados).'}`,
      fields: [
        { name: 'confirmo', label: 'Entendo que os dados atuais serão substituídos pelos da cópia', type: 'checkbox' },
      ],
      submitLabel: 'Restaurar',
      onSave: async (v) => {
        if (!v.confirmo) throw new Error('Marque a caixa de confirmação para restaurar.');
        const p = $('#restauroProgresso', form);
        const progresso = (t) => { p.hidden = false; p.textContent = t; };
        progresso('Baixando uma cópia dos dados atuais, por segurança…');
        exportarJson('-antes-de-restaurar');
        try {
          await restaurarCopia(copia, progresso);
        } catch (err) {
          await reload(true).catch(() => {});
          throw new Error(`a restauração parou no meio (${errMsg(err).replace('Não foi possível salvar: ', '')}). Os dados podem ter ficado misturados: tente de novo, ou restaure o arquivo "-antes-de-restaurar" que foi baixado.`);
        }
        progresso('Atualizando a tela…');
        await reload(true);
        return 'Cópia restaurada';
      },
    });
    $('.fields', form).insertAdjacentHTML('afterbegin', `<div class="field">
        <table class="table compact"><thead><tr><th></th><th class="num">Agora</th><th class="num">Na cópia</th></tr></thead><tbody>${linhas}</tbody></table>
        <p class="aviso-parentesco">Tudo o que não estiver na cópia será apagado. Antes de começar, o site baixa uma cópia dos dados atuais.
          A lista de quem tem acesso não muda.</p>
      </div>`);
    $('.fields', form).insertAdjacentHTML('beforeend', '<p class="hint" id="restauroProgresso" hidden></p>');
  }

  $('#restaurarInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) abrirRestauracao(file);
  });

  // ---------- Ações ----------

  const ACTIONS = {
    'filter-animais': (el) => { filters.animais = el.dataset.value; render(); },
    'filter-ano': (el) => { filters.ano = el.dataset.value; render(); },
    'lanc-todos': () => { filters.lancTodos = true; render(); },
    'hist-todos': () => { filters.histTodos = true; render(); },
    'esporadico-todos': (el) => { filters.esporadicoTodos.add(el.dataset.id); render(); },
    'animal-new': () => formAnimal(null),
    'animal-edit': (el) => formAnimal(animal(el.dataset.id)),
    'gestacao-new': (el) => formGestacao(null, el.dataset.matriz),
    'gestacao-edit': (el) => formGestacao(byId('gestacoes', el.dataset.id)),
    'aplicacao-new': (el) => formAplicacao(null, { animal: el.dataset.animal, gestacao: el.dataset.gestacao }),
    'aplicacao-edit': (el) => formAplicacao(byId('aplicacoes', el.dataset.id)),
    'produto-new': () => formProduto(null),
    'produto-edit': (el) => formProduto(produto(el.dataset.id)),
    'lancamento-new': () => formLancamento(null),
    'lancamento-edit': (el) => formLancamento(byId('lancamentos', el.dataset.id)),
    'abate-new': () => formAbate(null),
    'abate-edit': (el) => formAbate(byId('abates', el.dataset.id)),
    'racao-new': () => formRacao(null),
    'racao-edit': (el) => formRacao(byId('racoes', el.dataset.id)),
    'racao-modo': (el) => { racaoModo = el.dataset.value; render(); },
    'racao-aba': (el) => { racaoAba = el.dataset.value; render(); },
    'peso-toggle-config': () => { pesoEditandoFormula = !pesoEditandoFormula; render(); },
    'peso-salvar-formula': () => {
      const kEl = $('#inputPesoK');
      const cEl = $('#inputPesoExpC');
      const lEl = $('#inputPesoExpL');
      const k = kEl ? parseNum(kEl.value) : 69.3;
      const expC = cEl ? parseNum(cEl.value) : 2;
      const expL = lEl ? parseNum(lEl.value) : 1;
      if (k == null || Number.isNaN(k) || k <= 0) {
        toast('Digite um valor válido para a constante K (ex.: 69,3).');
        return;
      }
      salvarPesoFormula({ k, expC: expC != null ? expC : 2, expL: expL != null ? expL : 1 });
      pesoEditandoFormula = false;
      toast(`Fórmula atualizada: K = ${k.toLocaleString('pt-BR')}`);
      render();
    },
    'peso-restaurar-formula': () => {
      salvarPesoFormula({ ...PESO_FORMULA_DEFAULT });
      pesoEditandoFormula = false;
      toast('Fórmula restaurada para o padrão (69,3)!');
      render();
    },
    'peso-cancelar-formula': () => {
      pesoEditandoFormula = false;
      render();
    },
    bloco: (el) => toggleBloco(el),
    'saude-animais': (el) => setSaude('animais', el.dataset.value),
    foto: (el) => { fotoAlvo = el.dataset.id; $('#fotoInput').click(); },
    'fotos-lote': () => $('#fotosLote').click(),
    'sos-novo': () => $('#sosInput').click(),
    'sos-filtro': (el) => { filtroSos = el.dataset.value; render(); },
    'sos-ver': (el) => abrirVisualizador(byId('documentos', el.dataset.id)),
    'sos-edit': (el) => formEditarSos(byId('documentos', el.dataset.id)),
    'sos-delete': (el) => excluirSos(byId('documentos', el.dataset.id)),
    'sos-abrir': async (el) => {
      const d = byId('documentos', el.dataset.id);
      if (!d) return;
      if (!navigator.onLine) return toast('Conecte-se à internet para baixar este arquivo.');
      try {
        toast('Gerando link…');
        const urls = await Cloud.documentoUrls([d]);
        if (urls[d.caminho]) {
          docUrl[d.caminho] = urls[d.caminho];
          window.open(urls[d.caminho], '_blank', 'noopener,noreferrer');
          render();
        } else {
          toast('Não foi possível obter o link do arquivo.');
        }
      } catch (err) {
        toast(errMsg(err));
      }
    },
    'dnp-detalhes': (el) => abrirDnpDetalhes(el.dataset.id),
    'dnp-filtro': (el) => { filters.dnp = el.dataset.value; render(); },
    exportar: (el) => exportarExcel(el),
    'exportar-json': () => exportarJson(),
    'exportar-zip': (el) => exportarZip(el),
    restaurar: () => {
      if (papel !== 'dono' || offline) return toast('Só o dono pode restaurar, e precisa estar com internet.');
      $('#restaurarInput').click();
    },
    theme: (el) => { setTheme(el.dataset.value); render(); },
    logout: () => logout(),
    reload: () => reload(),
    'grupo-trocar': () => dialogGrupos(),
    'grupo-renomear': () => formRenomearGrupo(),
    'grupo-novo': () => formNovoGrupo(),
    'convite-novo': () => formGerarConvite(),
    'convite-copiar': (el) => {
      const link = el.dataset.link;
      if (link && navigator.clipboard) {
        navigator.clipboard.writeText(link).then(() => toast('Link copiado!'));
      }
    },
    'convite-revogar': async (el) => {
      const codigo = el.dataset.codigo;
      if (!confirm('Desativar este link de convite?')) return;
      try {
        await Cloud.revogarConvite(codigo);
        convites = convites.filter((c) => c.codigo !== codigo);
        const cb = $('#convitesLista');
        if (cb) cb.innerHTML = convitesListaHtml();
        toast('Convite desativado');
      } catch (err) {
        toast(errMsg(err));
      }
    },
    'membro-remover': async (el) => {
      const id = el.dataset.id;
      const nome = el.dataset.nome || 'este membro';
      if (!confirm(`Remover ${nome} do grupo?`)) return;
      try {
        await Cloud.removerMembro(grupoAtivo.id, id);
        membros = membros.filter((m) => m.id !== id);
        const mb = $('#membrosLista');
        if (mb) mb.innerHTML = membrosListaHtml();
        toast('Membro removido');
      } catch (err) {
        toast(errMsg(err));
      }
    },
    'membro-sair': async (el) => {
      const id = el.dataset.id;
      if (!confirm(`Tem certeza que deseja sair do grupo "${grupoAtivo ? grupoAtivo.nome : 'Porcos'}"?`)) return;
      try {
        await Cloud.removerMembro(grupoAtivo.id, id);
        toast(`Você saiu do grupo "${grupoAtivo ? grupoAtivo.nome : ''}"`);
        grupos = grupos.filter((g) => g.id !== (grupoAtivo && grupoAtivo.id));
        if (grupos.length) {
          await trocarGrupo(grupos[0].id);
        } else {
          await start();
        }
      } catch (err) {
        toast(errMsg(err));
      }
    },
  };

  view.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !view.contains(el)) return;
    // Link dentro de uma linha clicável: segue o link em vez de abrir a edição
    const link = e.target.closest('a[href]');
    if (link && el.contains(link) && link !== el) return;
    const fn = ACTIONS[el.dataset.act];
    if (fn) {
      e.preventDefault();
      fn(el);
    }
  });

  view.addEventListener('change', async (e) => {
    if (e.target.id === 'racaoIng') {
      racaoIng = e.target.value;
      render();
      return;
    }
    if (e.target.matches('[data-act-change="saude-doses"]')) {
      setSaude('doses', e.target.checked);
      return;
    }
    const elMembro = e.target.closest('[data-act-change="membro-papel"]');
    if (elMembro) {
      try {
        await Cloud.alterarPapelMembro(grupoAtivo.id, elMembro.dataset.id, elMembro.value);
        toast('Permissão alterada');
      } catch (err) {
        toast(errMsg(err));
        loadMembrosEConvites();
      }
      return;
    }
  });

  view.addEventListener('input', (e) => {
    if (e.target.id === 'pesoCintura' || e.target.id === 'pesoComprimento') {
      atualizarCalculoPeso();
      return;
    }
    if (e.target.id === 'buscaDnp') {
      buscaDnp = e.target.value;
      filtrarDnp();
      return;
    }
    if (e.target.id === 'buscaAnimais') {
      buscaAnimais = e.target.value;
      filtrarAnimais();
      return;
    }
    if (e.target.id === 'buscaSos') {
      buscaSos = e.target.value;
      const tmp = document.createElement('div');
      tmp.innerHTML = renderSos();
      const newGrid = $('.sos-grid', tmp);
      const currGrid = $('.sos-grid');
      if (currGrid && newGrid) {
        currGrid.innerHTML = newGrid.innerHTML;
      } else {
        render();
        const b = $('#buscaSos');
        if (b) { b.focus(); b.selectionStart = b.selectionEnd = b.value.length; }
      }
      return;
    }
    if (e.target.id !== 'racaoQtd') return;
    const n = parseNum(e.target.value);
    if (n == null || Number.isNaN(n) || n < 0) return;
    racaoQtd = n;
    // Redesenha só os cartões, para não perder o foco do campo
    const tmp = document.createElement('div');
    tmp.innerHTML = renderRacao();
    $('#racaoGrid').innerHTML = $('#racaoGrid', tmp).innerHTML;
  });



  function toast(msg, ms = 3000) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ---------- Entrada, login e carregamento ----------

  // ---------- Entrada, login e carregamento ----------

  function confirmDialog({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar' }) {
    return new Promise((resolve) => {
      formState = { fields: [] };
      form.innerHTML = `
        <div class="dlg-head"><h2>${esc(title)}</h2><button type="button" class="icon" data-close aria-label="Fechar">×</button></div>
        <div class="dlg-text" style="margin: 14px 0 18px; line-height: 1.5;">${message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>
        <div class="dlg-actions">
          <button type="button" class="btn" data-cancel>${esc(cancelLabel)}</button>
          <span class="spacer"></span>
          <button type="button" class="btn primary" data-confirm>${esc(confirmLabel)}</button>
        </div>`;
      const onConfirm = () => { dlg.close(); resolve(true); };
      const onCancel = () => { dlg.close(); resolve(false); };
      form.querySelector('[data-confirm]').onclick = onConfirm;
      form.querySelector('[data-cancel]').onclick = onCancel;
      form.querySelector('[data-close]').onclick = onCancel;
      dlg.addEventListener('close', () => resolve(false), { once: true });
      dlg.showModal();
    });
  }

  function verificarParametrosConvite() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      let codigo = urlParams.get('convite') || urlParams.get('codigo');
      if (!codigo && window.location.hash.includes('convite')) {
        const hashQuery = window.location.hash.split('?')[1];
        if (hashQuery) {
          const hp = new URLSearchParams(hashQuery);
          codigo = hp.get('codigo') || hp.get('convite');
        }
      }
      if (codigo) {
        sessionStorage.setItem('porcos:convite_pendente', codigo.trim().toLowerCase());
        const cleanUrl = window.location.pathname + window.location.hash.replace(/\?.*$/, '');
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch (e) {}
  }

  async function processarConvitePendente() {
    let codigo = null;
    try { codigo = sessionStorage.getItem('porcos:convite_pendente'); } catch (e) {}
    if (!codigo) return;

    try {
      const info = await Cloud.consultarConvite(codigo);
      if (!info) {
        sessionStorage.removeItem('porcos:convite_pendente');
        toast('Este link de convite é inválido ou já expirou.', 5000);
        return;
      }
      const aceitar = await confirmDialog({
        title: 'Convite para Grupo',
        message: `Você foi convidado para participar do grupo **${esc(info.grupo_nome)}** com acesso **${esc(PAPEIS[info.papel] || info.papel)}**.\n\nDeseja entrar neste grupo agora?`,
        confirmLabel: 'Entrar no Grupo',
        cancelLabel: 'Agora não',
      });
      if (aceitar) {
        const r = await Cloud.aceitarConvite(codigo);
        sessionStorage.removeItem('porcos:convite_pendente');
        try { localStorage.setItem('porcos:grupo_ativo', r.grupo_id); } catch (e) {}
        toast(`Bem-vindo ao grupo ${r.grupo_nome}!`);
      } else {
        sessionStorage.removeItem('porcos:convite_pendente');
      }
    } catch (err) {
      sessionStorage.removeItem('porcos:convite_pendente');
      toast(`Erro ao processar convite: ${err.message}`);
    }
  }

  function showGate(kind, extra) {
    $('#app').hidden = true;
    $('#gate').hidden = false;
    const body = $('#gateBody');
    if (kind === 'login') {
      let pendenteMsg = '';
      try {
        if (sessionStorage.getItem('porcos:convite_pendente')) {
          pendenteMsg = '<div class="banner ok" style="margin-bottom: 14px; text-align: left;"><p><strong>Convite recebido!</strong> Faça login para entrar no grupo compartilhado.</p></div>';
        }
      } catch (e) {}
      body.innerHTML = `${pendenteMsg}<p class="muted">Entre com sua conta Google para acessar ou criar sua granja.</p>
        <button type="button" class="btn google" id="btnGoogle">${ICON.google} Entrar com Google</button>
        <form class="gate-email" id="gateEmail" autocomplete="on">
          <p class="gate-sep"><span>ou receba um link por e-mail</span></p>
          <input type="email" id="gateEmailInput" placeholder="seu e-mail" required autocomplete="email" aria-label="Seu e-mail">
          <button type="submit" class="btn">Enviar link de acesso</button>
        </form>
        <p class="gate-msg" id="gateMsg"></p>
        <button type="button" class="btn ghost" data-app-apk="Atualizar app" hidden>Instalar app</button>
        <p class="gate-priv"><a href="privacidade.html">Política de privacidade</a></p>`;
      $('#gateEmail').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = $('#gateEmailInput').value.trim().toLowerCase();
        $('#gateMsg').textContent = 'Enviando…';
        try {
          await Cloud.signInWithEmail(email);
          $('#gateMsg').textContent = `Pronto! Abra o link que chegou em ${email} neste mesmo aparelho e navegador (veja também o spam).`;
        } catch (err) {
          $('#gateMsg').textContent = `Não foi possível enviar: ${err.message}`;
        }
      });
      $('#btnGoogle').addEventListener('click', async () => {
        $('#gateMsg').textContent = 'Abrindo o Google…';
        try {
          await Cloud.signInWithGoogle();
        } catch (err) {
          $('#gateMsg').textContent = `Não foi possível entrar: ${err.message}`;
        }
      });
    } else if (kind === 'noaccess') {
      body.innerHTML = `<p>A conta <strong>${esc(user.email)}</strong> ainda não tem nenhum grupo.</p>
        <div class="gate-actions"><button type="button" class="btn primary" id="gateRetry">Tentar de novo</button>
        <button type="button" class="btn" id="gateOut">Usar outra conta</button></div>`;
      $('#gateRetry').addEventListener('click', start);
      $('#gateOut').addEventListener('click', logout);
    } else if (kind === 'error') {
      body.innerHTML = `<p>Não foi possível carregar os dados.</p><p class="muted small">${esc(extra || '')}</p>
        <div class="gate-actions"><button type="button" class="btn primary" id="gateRetry">Tentar de novo</button>
        <button type="button" class="btn" id="gateOut">Sair</button></div>`;
      $('#gateRetry').addEventListener('click', start);
      $('#gateOut').addEventListener('click', logout);
    } else {
      body.innerHTML = '<p class="muted">Carregando…</p>';
    }
  }

  function showApp() {
    $('#gate').hidden = true;
    $('#app').hidden = false;
  }

  const cacheKey = () => `porcos:cache:${user.id}:${grupoAtivo ? grupoAtivo.id : 'padrao'}`;

  function saveCache() {
    try {
      localStorage.setItem(cacheKey(), JSON.stringify({ db, papel, grupoAtivo, at: loadedAt }));
    } catch (e) { /* sem espaço: tudo bem */ }
  }

  function readCache() {
    try {
      const c = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
      return c && c.db ? c : null;
    } catch (e) {
      return null;
    }
  }

  let starting = false;

  async function start() {
    if (!user || starting) return;
    starting = true;
    showGate('loading');
    try {
      await processarConvitePendente();

      grupos = await Cloud.inicializarUsuario();
      if (!Array.isArray(grupos) || !grupos.length) {
        papel = null;
        grupoAtivo = null;
        showGate('noaccess');
        return;
      }

      const salvoId = localStorage.getItem('porcos:grupo_ativo');
      grupoAtivo = grupos.find((g) => g.id === salvoId) || grupos[0];
      papel = grupoAtivo.papel;
      try { localStorage.setItem('porcos:grupo_ativo', grupoAtivo.id); } catch (e) {}

      atualizarBtnGrupo();
      lerFila();
      if (fila.length) await enviarFila();
      db = await Cloud.loadAll(grupoAtivo.id);
      sincronizarNomesAnimais();
      loadedAt = Date.now();
      offline = false;
      await refreshFotos();
      saveCache();
      showApp();
      onRoute();
    } catch (err) {
      lerFila();
      const c = readCache();
      if (c) {
        db = { ...emptyDb(), ...c.db };
        padronizarAnimais(db.animais);
        papel = c.papel;
        grupoAtivo = c.grupoAtivo || { id: 'cache', nome: 'Meu Grupo', papel };
        atualizarBtnGrupo();
        loadedAt = c.at;
        offline = true;
        fotoUrl = {};
        bulaUrl = {};
        showApp();
        onRoute();
      } else {
        showGate('error', err && err.message);
      }
    } finally {
      starting = false;
    }
  }

  // Busca de novo tudo do banco (quiet: sem avisos)
  async function reload(quiet) {
    try {
      grupos = await Cloud.inicializarUsuario();
      if (!Array.isArray(grupos) || !grupos.length) {
        papel = null;
        grupoAtivo = null;
        showGate('noaccess');
        return;
      }
      const atual = grupos.find((g) => g.id === (grupoAtivo && grupoAtivo.id)) || grupos[0];
      grupoAtivo = atual;
      papel = grupoAtivo.papel;
      try { localStorage.setItem('porcos:grupo_ativo', grupoAtivo.id); } catch (e) {}
      atualizarBtnGrupo();

      if (fila.length) await enviarFila();
      db = await Cloud.loadAll(grupoAtivo.id);
      sincronizarNomesAnimais();
      loadedAt = Date.now();
      offline = false;
      await refreshFotos();
      saveCache();
      if (!dlg.open) render();
      if (!quiet) toast('Dados atualizados');
    } catch (err) {
      if (quiet && !semRede(err)) throw err;
      if (semRede(err)) {
        offline = true;
        if (!dlg.open) render();
      }
      if (!quiet) toast(errMsg(err).replace('Não foi possível salvar', 'Não foi possível atualizar'));
    }
  }

  async function logout() {
    try {
      await Cloud.signOut();
    } catch (err) {
      toast(`Erro ao sair: ${err.message}`);
    }
  }

  function renderAccount() {
    const box = $('#account');
    if (!user) return;
    const avatar = user.user_metadata && user.user_metadata.avatar_url;
    box.innerHTML = avatar
      ? `<img class="avatar" src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">`
      : `<span class="avatar">${esc((user.email || '?')[0].toUpperCase())}</span>`;
    box.classList.toggle('on', current.name === 'conta');
  }

  let authKnown = false;

  Cloud.onAuthChange((u) => {
    const antes = user;
    if (authKnown && (u && u.id) === (antes && antes.id)) return; // renovação do login: nada mudou
    authKnown = true;
    user = u;
    membros = [];
    convites = [];
    if (!u) {
      papel = null;
      db = emptyDb();
      showGate('login');
      return;
    }
    // Fora do callback do Supabase (chamar o banco dentro dele pode travar)
    setTimeout(start, 0);
  });

  // ---------- Tema claro/escuro ----------

  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  let themeChoice = (() => {
    try {
      const t = localStorage.getItem('porcos:tema');
      return t === 'light' || t === 'dark' ? t : 'auto';
    } catch (e) {
      return 'auto';
    }
  })();

  const isDark = () => themeChoice === 'dark' || (themeChoice === 'auto' && darkQuery.matches);

  function setTheme(choice) {
    themeChoice = choice;
    if (choice === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = choice;
    try {
      if (choice === 'auto') localStorage.removeItem('porcos:tema');
      else localStorage.setItem('porcos:tema', choice);
    } catch (e) { /* sem armazenamento: vale até fechar */ }
    renderTheme();
  }

  function renderTheme() {
    const dark = isDark();
    document.documentElement.classList.toggle('dark', dark);
    const label = dark ? 'Mudar para o modo claro' : 'Mudar para o modo escuro';
    const btn = $('#btnTheme');
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }

  darkQuery.addEventListener('change', renderTheme);
  $('#btnTheme').addEventListener('click', () => {
    setTheme(isDark() ? 'light' : 'dark');
    if (current.name === 'conta') render();
  });

  function bindApp() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    }
    // Ao voltar para o site, busca o que outras pessoas mudaram
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && user && papel && Date.now() - loadedAt > 60000 && !dlg.open) {
        reload(true).catch(() => {});
      }
    });
    window.addEventListener('online', () => { if (offline && user) start(); });
  }

  // ---------- Início ----------

  function init() {
    verificarParametrosConvite();
    $$('[data-logo]').forEach((el) => { el.innerHTML = LOGO; });
    renderTheme();
    window.addEventListener('hashchange', () => {
      if (dlg.open) dlg.close();
      const vDlg = $('#viewerDlg');
      if (vDlg && vDlg.open) vDlg.close();
      const dDlg = $('#dnpDlg');
      if (dDlg && dDlg.open) dDlg.close();
      onRoute();
    });
    const btnG = $('#btnGrupo');
    if (btnG) btnG.addEventListener('click', () => dialogGrupos());

    const sosIn = $('#sosInput');
    if (sosIn) {
      sosIn.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files && files.length) {
          processarArquivosSos(files);
          e.target.value = '';
        }
      });
    }

    document.addEventListener('dragover', (e) => {
      if (current.name !== 'sos') return;
      const dropzone = $('#sosDropzone');
      if (dropzone && (dropzone.contains(e.target) || dropzone === e.target)) {
        e.preventDefault();
        dropzone.classList.add('drag-over');
      }
    });

    document.addEventListener('dragleave', (e) => {
      if (current.name !== 'sos') return;
      const dropzone = $('#sosDropzone');
      if (dropzone && (!e.relatedTarget || !dropzone.contains(e.relatedTarget))) {
        dropzone.classList.remove('drag-over');
      }
    });

    document.addEventListener('drop', (e) => {
      if (current.name !== 'sos') return;
      const dropzone = $('#sosDropzone');
      if (dropzone) dropzone.classList.remove('drag-over');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        e.preventDefault();
        processarArquivosSos(e.dataTransfer.files);
      }
    });

    const viewerDlg = $('#viewerDlg');
    const viewerClose = $('#viewerCloseBtn');
    if (viewerClose && viewerDlg) {
      viewerClose.addEventListener('click', () => viewerDlg.close());
      viewerDlg.addEventListener('click', (e) => {
        const rect = viewerDlg.getBoundingClientRect();
        const inDialog = (
          rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX && e.clientX <= rect.left + rect.width
        );
        if (!inDialog) viewerDlg.close();
      });
    }

    const dnpDlg = $('#dnpDlg');
    const dnpClose = $('#dnpDlgCloseBtn');
    if (dnpClose && dnpDlg) {
      dnpClose.addEventListener('click', () => dnpDlg.close());
      dnpDlg.addEventListener('click', (e) => {
        const rect = dnpDlg.getBoundingClientRect();
        const inDialog = (
          rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX && e.clientX <= rect.left + rect.width
        );
        if (!inDialog) dnpDlg.close();
      });
    }

    bindApp();
  }

  init();
})();
