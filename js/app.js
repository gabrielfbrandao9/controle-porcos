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
    esc, fmtDate, fmtAge, fmtRelative, fmtMoney, fmtNum, fmtKg, fmtPct, fmtMonth, fmtMonthLong,
    parseNum, toInput, hoje, addDays, diffDays, daysUntil, ordinal, plural,
  } = U;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const view = $('#view');
  const CFG = window.APP_CONFIG || {};

  const CATEGORIAS = { matriz: 'Matriz', barrao: 'Barrão', porca: 'Porca', porco: 'Porco' };
  const CATEGORIAS_PLURAL = { matriz: 'matrizes', barrao: 'barrões', porca: 'porcas', porco: 'porcos' };
  const FEMININO = { matriz: true, porca: true };
  const AQUISICAO = { nascido: 'Nascido no local', comprado: 'Comprado', ganhado: 'Ganhado' };
  const SAIDAS = { venda: ['Vendido', 'Vendida'], abate: ['Abatido', 'Abatida'], morte: ['Morto', 'Morta'] };
  const SAIDA_FILTRO = { venda: 'Vendidos', abate: 'Abatidos', morte: 'Mortos' };
  const LANCAMENTOS = {
    soro: { tipo: 'despesa', label: 'Soro' },
    racao: { tipo: 'despesa', label: 'Ração' },
    outras: { tipo: 'despesa', label: 'Outras despesas' },
    venda: { tipo: 'receita', label: 'Receita (vendas)' },
  };
  const PAPEIS = { dono: 'Dono', editor: 'Pode editar', leitor: 'Só ver' };
  const GESTACAO_DIAS = 114;
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
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/></svg>',
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

  const emptyDb = () => ({ animais: [], gestacoes: [], produtos: [], aplicacoes: [], abates: [], lancamentos: [], racoes: [] });

  let user = null;
  let papel = null;
  let db = emptyDb();
  let fotoUrl = {};
  let loadedAt = 0;
  let offline = false;
  let current = { name: 'inicio', id: null };
  const filters = { animais: 'plantel', ano: 'todos', lancTodos: false, histTodos: false };
  let racaoModo = 'total';
  let racaoQtd = 100;
  let racaoIng = 'Milho';
  let installPrompt = null;
  let toastTimer = null;

  const canEdit = () => !offline && (papel === 'dono' || papel === 'editor');
  const editBtn = (html) => (canEdit() ? html : '');

  // ---------- Consultas nos dados ----------

  const byId = (kind, id) => db[kind].find((x) => x.id === id) || null;
  const animal = (id) => byId('animais', id);
  const produto = (id) => byId('produtos', id);
  const noPlantel = (a) => !a.saida;
  const nomeAnimal = (id) => (animal(id) || {}).nome || '—';

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

  // 'nascida', 'prevista' (parto ainda não chegou) ou 'pendente' (data passou e falta registrar)
  function situacaoGestacao(g) {
    if (g.vivos != null) return 'nascida';
    return daysUntil(partoDe(g)) >= 0 ? 'prevista' : 'pendente';
  }

  const aplicacoesAnimal = (id) => sortByDate(db.aplicacoes.filter((x) => x.animal_id === id));
  const aplicacoesCria = (id) => sortByDate(db.aplicacoes.filter((x) => x.gestacao_id === id));

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
  function calendario() {
    const rows = [];
    const produtos = produtosOrdenados().filter((p) => p.intervalo_dias);
    for (const p of produtos) {
      for (const a of sortAnimais(db.animais.filter(noPlantel))) {
        const aps = db.aplicacoes.filter((x) => x.animal_id === a.id && x.produto_id === p.id);
        const ultima = aps.reduce((m, x) => (x.data > m ? x.data : m), '');
        const proxima = ultima ? addDays(ultima, p.intervalo_dias) : null;
        rows.push({ produto: p, animal: a, ultima: ultima || null, proxima, faltam: proxima ? daysUntil(proxima) : null });
      }
    }
    return rows;
  }

  function badgeVacina(r) {
    if (r.faltam == null) return '<span class="badge muted">Sem registro</span>';
    if (r.faltam < 0) return `<span class="badge danger">Atrasada · ${-r.faltam} ${r.faltam === -1 ? 'dia' : 'dias'}</span>`;
    if (r.faltam <= AVISO_DIAS) return `<span class="badge warn">${r.faltam === 0 ? 'Hoje' : `Faltam ${plural(r.faltam, 'dia', 'dias')}`}</span>`;
    return `<span class="badge ok">Faltam ${plural(r.faltam, 'dia', 'dias')}</span>`;
  }

  function badgeGestacao(g) {
    const s = situacaoGestacao(g);
    const parto = partoDe(g);
    if (s === 'nascida') return `<span class="badge ok">Nascida · ${esc(fmtAge(parto))}</span>`;
    if (s === 'prevista') return `<span class="badge warn">Prevista · ${esc(fmtRelative(parto))}</span>`;
    return '<span class="badge danger">Registrar o parto</span>';
  }

  // ---------- Montagem das telas ----------

  function onRoute() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const name = parts[0] || 'inicio';
    current = { name, id: parts[1] ? decodeURIComponent(parts[1]) : null };
    const nav = name === 'animal' ? 'animais' : name;
    $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.route === nav));
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
      saude: renderSaude,
      racao: renderRacao,
      financas: renderFinancas,
      conta: renderConta,
    };
    view.innerHTML = banners() + (pages[current.name] || renderInicio)();
    if (current.name === 'conta' && papel === 'dono') loadAcessos();
  }

  function banners() {
    if (offline) {
      const quando = loadedAt ? new Date(loadedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
      return `<div class="banner warn"><p><strong>Sem conexão com a nuvem.</strong> Mostrando os dados salvos neste aparelho${quando ? ` em ${esc(quando)}` : ''}.
        Para editar, conecte-se à internet.</p><button type="button" class="btn small" data-act="reload">Tentar de novo</button></div>`;
    }
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
    list.forEach((a) => { n[a.categoria] = (n[a.categoria] || 0) + 1; });
    return Object.keys(CATEGORIAS).filter((c) => n[c]).map((c) => `${n[c]} ${n[c] === 1 ? CATEGORIAS[c].toLowerCase() : CATEGORIAS_PLURAL[c]}`).join(' · ');
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
    const list = sortAnimais(db.animais.filter((a) => f === 'todos' || (a.saida || 'plantel') === f));
    const chip = (v, label) => `<button type="button" class="chip${f === v ? ' on' : ''}" data-act="filter-animais" data-value="${v}">${label} <span class="n">${counts[v]}</span></button>`;

    const cards = list.length
      ? `<div class="animal-grid">${list.map((a) => `<a class="animal-card" href="#/animal/${a.id}">
          ${fotoHtml(a, 'large')}
          <span class="animal-info">
            <strong>${esc(a.nome)}</strong>
            <small>${esc(CATEGORIAS[a.categoria])} · ${esc(idadeAnimal(a))}</small>
            ${a.saida ? `<span class="badge muted">${esc(statusAnimal(a))} em ${esc(fmtDate(a.saida_data))}</span>` : `<small class="muted">${esc(AQUISICAO[a.aquisicao])}</small>`}
          </span></a>`).join('')}</div>`
      : '<div class="empty-box"><p>Nenhum animal aqui.</p></div>';

    return `${pageHead('Animais', 'Todos os animais que já passaram pelo plantel', editBtn(`<button type="button" class="btn primary" data-act="animal-new">${ICON.plus} Animal</button>`))}
      <div class="chips">${chip('plantel', 'No plantel')}${chip('venda', SAIDA_FILTRO.venda)}${chip('abate', SAIDA_FILTRO.abate)}${chip('morte', SAIDA_FILTRO.morte)}${chip('todos', 'Todos')}</div>
      ${cards}`;
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
              <td><div class="dose-list">${list.map((x, i) => doseChip(x, `${ordinal(i + 1)} · ${fmtDate(x.data)}`)).join('')}</div></td>
              <td>${prox ? `${esc(fmtDate(prox))}<br>${badgeVacina({ faltam: daysUntil(prox) })}` : '<span class="muted">—</span>'}</td></tr>`;
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

    const abate = db.abates.find((x) => x.animal_id === a.id);
    const abateHtml = abate ? bloco('animal-abate', 'Abate', `
        <dl class="info"><div><dt>Data</dt><dd>${esc(fmtDate(abate.data))}</dd></div>
        <div><dt>Peso</dt><dd>${esc(fmtKg(pesoAbate(abate)))}</dd></div>
        <div><dt>Valor</dt><dd>${esc(fmtMoney(abate.valor))}</dd></div></dl>
        ${partesAbate(abate).length ? partesTabela(abate) : ''}`,
      { extra: editBtn(`<button type="button" class="btn small" data-act="abate-edit" data-id="${abate.id}">${ICON.edit} Editar</button>`) }) : '';

    return `<a class="back" href="#/animais">${ICON.back} Animais</a>
      <div class="hero card">
        <div class="hero-photo">${fotoHtml(a, 'xl')}
          ${editBtn(`<button type="button" class="btn small photo-btn" data-act="foto" data-id="${a.id}">${ICON.camera} ${a.foto ? 'Trocar foto' : 'Pôr foto'}</button>`)}</div>
        <div class="hero-main">
          <h1>${esc(a.nome)}</h1>
          <p class="hero-badges"><span class="badge cat-${a.categoria}">${esc(CATEGORIAS[a.categoria])}</span>
            <span class="badge ${a.saida ? 'muted' : 'ok'}">${esc(statusAnimal(a))}</span></p>
          <dl class="info">${info.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
          ${a.obs ? `<p class="obs">${esc(a.obs)}</p>` : ''}
          ${editBtn(`<div class="hero-actions"><button type="button" class="btn" data-act="animal-edit" data-id="${a.id}">${ICON.edit} Editar</button>
            <button type="button" class="btn" data-act="aplicacao-new" data-animal="${a.id}">${ICON.syringe} Registrar aplicação</button></div>`)}
        </div>
      </div>
      ${bloco('animal-vacinas', 'Vacinas e remédios', saudeHtml)}
      ${gestHtml}
      ${abateHtml}`;
  }

  function doseChip(ap, label) {
    const title = ap.obs ? ` title="${esc(ap.obs)}"` : '';
    return canEdit()
      ? `<button type="button" class="dose" data-act="aplicacao-edit" data-id="${ap.id}"${title}>${esc(label)}</button>`
      : `<span class="dose"${title}>${esc(label)}</span>`;
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
      return `<section class="section">
        <div class="section-head">
          <a class="matriz-head" href="#/animal/${m.id}">${fotoHtml(m)}<span><strong>${esc(m.nome)}</strong>
            <small>${plural(gs.length, 'gestação', 'gestações')} · ${plural(nasc, 'nascido', 'nascidos')} (${plural(vivos, 'vivo', 'vivos')}, ${plural(mortos, 'morto', 'mortos')})${m.saida ? ` · ${esc(statusAnimal(m).toLowerCase())}` : ''}</small></span></a>
          ${editBtn(m.saida ? '' : `<button type="button" class="btn small" data-act="gestacao-new" data-matriz="${m.id}">${ICON.plus} Gestação</button>`)}
        </div>
        ${gs.length ? `<div class="cria-grid">${cards}</div>` : '<p class="muted">Nenhuma gestação registrada.</p>'}
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
    const linhas = [
      ['Cruzamento', fmtDate(g.cruzamento)],
      [nascida || g.parto ? 'Parto' : 'Parto previsto', fmtDate(parto)],
    ];
    if (nascida) {
      linhas.push(['Duração', plural(diffDays(g.cruzamento, parto), 'dia', 'dias')]);
      linhas.push(['Nascidos', String(nascidosDe(g))]);
      linhas.push(['Vivos', String(g.vivos)]);
      linhas.push(['Mortos', g.mortos != null ? String(g.mortos) : '—']);
      if (g.machos != null || g.femeas != null) linhas.push(['Machos / fêmeas', `${g.machos ?? '—'} / ${g.femeas ?? '—'}`]);
      linhas.push(['Capação', fmtDate(g.capacao)]);
    }
    return `<article class="cria card">
      <header><h3>${ordinal(n)} gestação</h3>${badgeGestacao(g)}</header>
      <dl class="kv">${linhas.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${aps.length ? `<div class="dose-list">${aps.map((x) => doseChip(x, `${(produto(x.produto_id) || {}).nome || '?'} · ${fmtDate(x.data)}`)).join('')}</div>` : ''}
      ${g.obs ? `<p class="obs">${esc(g.obs)}</p>` : ''}
      ${editBtn(`<footer><button type="button" class="btn small ghost" data-act="gestacao-edit" data-id="${g.id}">${ICON.edit} ${nascida ? 'Editar' : 'Registrar parto'}</button>
        <button type="button" class="btn small ghost" data-act="aplicacao-new" data-gestacao="${g.id}">${ICON.syringe} Aplicação</button></footer>`)}
    </article>`;
  }

  // ---------- Saúde ----------

  function renderSaude() {
    const cal = calendario();
    const produtos = produtosOrdenados();
    const comReforco = produtos.filter((p) => p.intervalo_dias);

    const calHtml = comReforco.map((p) => {
      const rows = cal.filter((r) => r.produto.id === p.id);
      return bloco(`saude-${p.id}`, `${esc(p.nome)} <small class="muted">a cada ${p.intervalo_dias} dias</small>`,
        rows.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Animal</th><th>Última</th><th>Próxima</th><th>Situação</th></tr></thead>
          <tbody>${rows.map((r) => `<tr><th scope="row"><a href="#/animal/${r.animal.id}">${esc(r.animal.nome)}</a></th>
            <td>${esc(fmtDate(r.ultima))}</td><td>${esc(fmtDate(r.proxima))}</td><td>${badgeVacina(r)}</td></tr>`).join('')}</tbody>
        </table></div>` : '<p class="muted">Nenhum animal no plantel.</p>');
    }).join('');

    const hist = sortByDate(db.aplicacoes, 'data', true);
    const mostra = filters.histTodos ? hist : hist.slice(0, 15);
    const histHtml = hist.length
      ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Data</th><th>Produto</th><th>Em</th></tr></thead>
          <tbody>${mostra.map((x) => `<tr${canEdit() ? ` class="clickable" data-act="aplicacao-edit" data-id="${x.id}"` : ''}>
            <td>${esc(fmtDate(x.data))}</td><td>${esc((produto(x.produto_id) || {}).nome || '—')}</td>
            <td>${esc(alvoAplicacao(x))}${x.obs ? `<small class="muted block">${esc(x.obs)}</small>` : ''}</td></tr>`).join('')}</tbody>
        </table></div>
        ${hist.length > mostra.length ? `<button type="button" class="btn small ghost" data-act="hist-todos">Mostrar todas (${hist.length})</button>` : ''}`
      : '<p class="muted">Nenhuma aplicação registrada.</p>';

    const prodHtml = `<ul class="list">${produtos.map((p) => `<li class="list-row${canEdit() ? ' clickable' : ''}"${canEdit() ? ` data-act="produto-edit" data-id="${p.id}"` : ''}>
        <span><strong>${esc(p.nome)}</strong></span>
        <span class="right"><small>${p.intervalo_dias ? `Reforço a cada ${p.intervalo_dias} dias` : 'Sem reforço no calendário'}</small></span></li>`).join('')}</ul>
      ${editBtn(`<button type="button" class="btn small" data-act="produto-new">${ICON.plus} Produto</button>`)}`;

    return `${pageHead('Saúde', 'Calendário de vacinas e vermífugos dos animais no plantel',
      editBtn(`<button type="button" class="btn primary" data-act="aplicacao-new">${ICON.syringe} Registrar aplicação</button>`))}
      ${calHtml || '<p class="muted">Nenhum produto com reforço cadastrado.</p>'}
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
  function renderRacao() {
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

  // ---------- Conta e acesso ----------

  let acessos = null;

  function renderConta() {
    const email = (user && user.email) || '';
    const avatar = user && user.user_metadata && user.user_metadata.avatar_url;
    const nome = (user && user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || '';
    const tema = (v, label) => `<button type="button" class="${themeChoice === v ? 'on' : ''}" data-act="theme" data-value="${v}">${label}</button>`;
    const quando = loadedAt ? new Date(loadedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

    const acessoHtml = papel === 'dono' ? `<section class="section card">
        <h2>Quem tem acesso</h2>
        <p class="muted">A pessoa entra em <strong>${esc(siteUrl())}</strong> com a conta Google do e-mail cadastrado aqui.
          Não chega e-mail nenhum: avise você mesmo.</p>
        <div id="acessoLista">${acessoListaHtml()}</div>
        <form class="acesso-form" id="acessoForm" autocomplete="off">
          <label class="field"><span>E-mail (Google)</span><input name="email" type="email" required placeholder="nome@gmail.com"></label>
          <label class="field"><span>Nome</span><input name="nome" placeholder="Opcional"></label>
          <label class="field"><span>Permissão</span><select name="papel"><option value="leitor">Só ver</option><option value="editor">Pode editar</option></select></label>
          <button class="btn primary">${ICON.plus} Dar acesso</button>
        </form>
      </section>` : '';

    return `${pageHead('Conta')}
      <section class="section card account-card">
        ${avatar ? `<img class="avatar big" src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar big">${esc((email[0] || '?').toUpperCase())}</span>`}
        <div><strong>${esc(nome || email)}</strong>${nome ? `<small class="muted block">${esc(email)}</small>` : ''}
          <span class="badge ${papel === 'leitor' ? 'muted' : 'ok'}">${esc(PAPEIS[papel] || '')}</span></div>
        <button type="button" class="btn" data-act="logout">Sair</button>
      </section>
      ${acessoHtml}
      <div class="two-col">
        <section class="section card"><h2>Aparência</h2>
          <div class="seg" role="group" aria-label="Tema">${tema('auto', 'Automático')}${tema('light', 'Claro')}${tema('dark', 'Escuro')}</div>
        </section>
        <section class="section card"><h2>Dados</h2>
          <p class="muted">${quando ? `Carregados às ${esc(quando)}. ` : ''}O site busca as novidades sozinho ao voltar para ele.</p>
          <button type="button" class="btn" data-act="reload">${ICON.refresh} Atualizar agora</button>
          <button type="button" class="btn ghost" data-act="install" ${installPrompt ? '' : 'hidden'}>Instalar app</button>
        </section>
      </div>`;
  }

  function siteUrl() {
    return location.origin + location.pathname;
  }

  function acessoListaHtml() {
    if (!acessos) return '<p class="muted">Carregando…</p>';
    return `<ul class="list">${acessos.map((x) => `<li class="list-row acesso-row">
        <span><strong>${esc(x.nome || x.email)}</strong>${x.nome ? `<small>${esc(x.email)}</small>` : ''}</span>
        <span class="right">${x.papel === 'dono' ? '<span class="badge ok">Dono</span>' : `
          <select data-act-change="acesso-papel" data-email="${esc(x.email)}" aria-label="Permissão de ${esc(x.email)}">
            <option value="leitor"${x.papel === 'leitor' ? ' selected' : ''}>Só ver</option>
            <option value="editor"${x.papel === 'editor' ? ' selected' : ''}>Pode editar</option>
          </select>
          <a class="btn small ghost" href="${esc(whatsLink(x))}" target="_blank" rel="noopener">Avisar</a>
          <button type="button" class="btn small danger-ghost" data-act="acesso-remover" data-email="${esc(x.email)}">Remover</button>`}</span>
      </li>`).join('')}</ul>`;
  }

  function whatsLink(x) {
    const txt = `Liberei para você o Controle de Porcos (${x.papel === 'editor' ? 'pode ver e editar' : 'só para ver'}). Entre com a conta Google ${x.email}: ${siteUrl()}`;
    return `https://wa.me/?text=${encodeURIComponent(txt)}`;
  }

  async function loadAcessos() {
    try {
      acessos = await Cloud.acessos();
    } catch (err) {
      acessos = [];
      toast(errMsg(err));
    }
    const box = $('#acessoLista');
    if (box) box.innerHTML = acessoListaHtml();
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

  async function save(kind, id, row) {
    if (id) {
      const r = await Cloud.update(kind, id, row);
      db[kind] = db[kind].map((x) => (x.id === id ? r : x));
      return r;
    }
    const [r] = await Cloud.insert(kind, [row]);
    db[kind].push(r);
    return r;
  }

  async function saveMany(kind, rows) {
    const list = await Cloud.insert(kind, rows);
    db[kind].push(...list);
    return list;
  }

  async function remove(kind, id) {
    await Cloud.remove(kind, id);
    db[kind] = db[kind].filter((x) => x.id !== id);
  }

  // ---------- Formulários de cada coisa ----------

  const animalOptions = (list, vazio) => [...(vazio ? [['', vazio]] : []), ...sortAnimais(list).map((a) => [a.id, a.nome])];

  function formAnimal(a) {
    const novo = !a;
    openForm({
      title: novo ? 'Novo animal' : `Editar ${a.nome}`,
      values: a ? { ...a, saida: a.saida || '' } : { categoria: 'porco', aquisicao: 'nascido', saida: '' },
      fields: [
        { name: 'nome', label: 'Nome', required: true, placeholder: 'Ex.: Pintada' },
        { name: 'categoria', label: 'Categoria', type: 'select', half: true, options: Object.entries(CATEGORIAS) },
        { name: 'aquisicao', label: 'Aquisição', type: 'select', half: true, options: Object.entries(AQUISICAO) },
        { name: 'nascimento', label: 'Nascimento', type: 'date', half: true },
        { name: 'chegada', label: 'Chegada', type: 'date', half: true, showIf: (v) => v.aquisicao !== 'nascido' },
        { name: 'negociado_com', label: 'Negociado com', half: true, showIf: (v) => v.aquisicao !== 'nascido', placeholder: 'Pessoa' },
        { name: 'valor_compra', label: 'Valor de compra', type: 'money', half: true, showIf: (v) => v.aquisicao === 'comprado' },
        { name: 'saida', label: 'Situação', type: 'select', options: [['', 'No plantel'], ['venda', 'Vendido'], ['abate', 'Abatido'], ['morte', 'Morreu']] },
        { name: 'saida_data', label: 'Data da saída', type: 'date', half: true, required: true, showIf: (v) => !!v.saida },
        { name: 'valor_venda', label: 'Valor da venda', type: 'money', half: true, showIf: (v) => v.saida === 'venda' },
        { name: 'lancar', label: 'Lançar o valor da venda como receita em Finanças', type: 'checkbox', showIf: (v) => v.saida === 'venda' && (!a || a.saida !== 'venda') },
        { name: 'obs', label: 'Observações', type: 'textarea' },
      ],
      onSave: async (v) => {
        const nasc = v.aquisicao === 'nascido';
        const row = {
          nome: v.nome,
          categoria: v.categoria,
          aquisicao: v.aquisicao,
          nascimento: v.nascimento,
          chegada: nasc ? null : v.chegada,
          negociado_com: nasc ? '' : v.negociado_com,
          valor_compra: v.aquisicao === 'comprado' ? v.valor_compra : null,
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
  }

  function formGestacao(g, matrizId) {
    const novo = !g;
    const matrizes = db.animais.filter((x) => x.categoria === 'matriz' && (noPlantel(x) || (g && x.id === g.matriz_id)));
    openForm({
      title: novo ? 'Nova gestação' : 'Gestação',
      intro: `Enquanto o dia do parto ficar em branco, a previsão é o cruzamento + ${GESTACAO_DIAS} dias (e acompanha se mudar o cruzamento).`,
      values: g || { matriz_id: matrizId || (matrizes[0] && matrizes[0].id), cruzamento: hoje() },
      fields: [
        { name: 'matriz_id', label: 'Matriz', type: 'select', required: true, options: animalOptions(matrizes) },
        { name: 'cruzamento', label: 'Cruzamento', type: 'date', half: true, required: true },
        { name: 'parto', label: 'Parto', type: 'date', half: true, hint: ' ' },
        { name: 'vivos', label: 'Vivos', type: 'number', half: true, hint: 'Em branco = ainda não nasceu' },
        { name: 'mortos', label: 'Mortos', type: 'number', half: true, hint: ' ' },
        { name: 'machos', label: 'Machos', type: 'number', half: true },
        { name: 'femeas', label: 'Fêmeas', type: 'number', half: true },
        { name: 'capacao', label: 'Capação', type: 'date', half: true },
        { name: 'obs', label: 'Observações', type: 'textarea' },
      ],
      onSave: async (v) => {
        const ints = ['vivos', 'mortos', 'machos', 'femeas'];
        for (const k of ints) {
          if (v[k] != null && (!Number.isInteger(v[k]) || v[k] < 0)) throw new Error('Use números inteiros nas quantidades.');
        }
        if (v.vivos == null && v.mortos != null) throw new Error('Preencha os vivos (pode ser 0) para registrar o parto.');
        const row = {
          matriz_id: v.matriz_id,
          cruzamento: v.cruzamento,
          // Sem data: fica a previsão (cruzamento + 114). Depois do parto registrado, a data fica fixa.
          parto: v.parto || (v.vivos != null ? addDays(v.cruzamento, GESTACAO_DIAS) : null),
          vivos: v.vivos, mortos: v.mortos, machos: v.machos, femeas: v.femeas,
          capacao: v.capacao,
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
      const vivos = parseNum(form.elements.vivos.value);
      const mortos = parseNum(form.elements.mortos.value);
      const ok = (n) => n == null || Number.isInteger(n);
      $('[data-field="mortos"] .hint', form).textContent = vivos != null && ok(vivos) && ok(mortos)
        ? `Nascidos: ${vivos + (mortos || 0)}`
        : '';
    };
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
    if (ap) titulo = `Aplicação em ${alvoAplicacao(ap)}`;
    else if (alvo.animal) titulo = `Aplicação em ${nomeAnimal(alvo.animal)}`;
    else if (alvo.gestacao) titulo = `Aplicação nas crias`;

    const fields = [
      { name: 'produto_id', label: 'Produto', type: 'select', half: true, required: true, options: produtos.map((p) => [p.id, p.nome]) },
      { name: 'data', label: novo ? 'Data da 1ª dose' : 'Data', type: 'date', half: true, required: true },
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
    </div>`);
    const renumerar = () => $$('.dose-row', form).forEach((r, k) => { $('span', r).textContent = `Data da ${ordinal(k + 2)} dose`; });
    form.onclick = (e) => {
      if (e.target.closest('[data-add-dose]')) {
        $('#dosesExtras').insertAdjacentHTML('beforeend', `<div class="dose-row"><label class="field"><span></span>
          <input type="date" name="data_extra"></label>
          <button type="button" class="icon" data-remove-dose aria-label="Tirar esta dose">×</button></div>`);
        renumerar();
        $('#dosesExtras .dose-row:last-child input').focus();
      }
      const rm = e.target.closest('[data-remove-dose]');
      if (rm) {
        rm.closest('.dose-row').remove();
        renumerar();
      }
    };
    dlg.addEventListener('close', () => { form.onclick = null; }, { once: true });
  }

  function formProduto(p) {
    openForm({
      title: p ? p.nome : 'Novo produto',
      values: p || {},
      fields: [
        { name: 'nome', label: 'Nome', required: true, placeholder: 'Ex.: Verme' },
        { name: 'intervalo_dias', label: 'Repetir a cada', type: 'number', suffix: 'dias', hint: 'Em branco = não aparece no calendário (ex.: Ferro nos leitões)' },
      ],
      onSave: async (v) => {
        if (v.intervalo_dias != null && (!Number.isInteger(v.intervalo_dias) || v.intervalo_dias <= 0)) throw new Error('O intervalo precisa ser um número inteiro de dias.');
        const row = { nome: v.nome, intervalo_dias: v.intervalo_dias };
        if (!p) row.ordem = db.produtos.reduce((m, x) => Math.max(m, x.ordem), 0) + 1;
        await save('produtos', p && p.id, row);
        return 'Produto salvo';
      },
      onDelete: p ? async () => {
        if (db.aplicacoes.some((x) => x.produto_id === p.id)) throw new Error('Este produto tem aplicações registradas: exclua-as antes.');
        await remove('produtos', p.id);
        return 'Produto excluído';
      } : null,
    });
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

  $('#fotoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    const a = fotoAlvo && animal(fotoAlvo);
    if (!file || !a) return;
    toast('Enviando foto…', 20000);
    try {
      const blob = await resizeImage(file);
      const path = `animais/${a.id}/${Date.now()}.jpg`;
      await Cloud.uploadFoto(path, blob);
      const antiga = a.foto;
      await save('animais', a.id, { foto: path });
      Object.assign(fotoUrl, await Cloud.fotoUrls([path]));
      if (antiga) Cloud.removeFotos([antiga]).catch(() => {});
      render();
      toast('Foto salva');
    } catch (err) {
      toast(errMsg(err), 6000);
    }
  });

  async function refreshFotos() {
    const paths = db.animais.map((a) => a.foto).filter(Boolean);
    try {
      fotoUrl = await Cloud.fotoUrls(paths);
    } catch (err) {
      fotoUrl = {};
    }
  }

  // ---------- Ações ----------

  const ACTIONS = {
    'filter-animais': (el) => { filters.animais = el.dataset.value; render(); },
    'filter-ano': (el) => { filters.ano = el.dataset.value; render(); },
    'lanc-todos': () => { filters.lancTodos = true; render(); },
    'hist-todos': () => { filters.histTodos = true; render(); },
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
    bloco: (el) => toggleBloco(el),
    foto: (el) => { fotoAlvo = el.dataset.id; $('#fotoInput').click(); },
    theme: (el) => { setTheme(el.dataset.value); render(); },
    logout: () => logout(),
    reload: () => reload(),
    install: () => install(),
    'acesso-remover': async (el) => {
      const email = el.dataset.email;
      if (!confirm(`Tirar o acesso de ${email}?`)) return;
      try {
        await Cloud.removeAcesso(email);
        acessos = acessos.filter((x) => x.email !== email);
        $('#acessoLista').innerHTML = acessoListaHtml();
        toast('Acesso removido');
      } catch (err) {
        toast(errMsg(err));
      }
    },
  };

  view.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !view.contains(el)) return;
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
    const el = e.target.closest('[data-act-change="acesso-papel"]');
    if (!el) return;
    try {
      const r = await Cloud.updateAcesso(el.dataset.email, { papel: el.value });
      acessos = acessos.map((x) => (x.email === r.email ? r : x));
      toast('Permissão alterada');
    } catch (err) {
      toast(errMsg(err));
      loadAcessos();
    }
  });

  view.addEventListener('input', (e) => {
    if (e.target.id !== 'racaoQtd') return;
    const n = parseNum(e.target.value);
    if (n == null || Number.isNaN(n) || n < 0) return;
    racaoQtd = n;
    // Redesenha só os cartões, para não perder o foco do campo
    const tmp = document.createElement('div');
    tmp.innerHTML = renderRacao();
    $('#racaoGrid').innerHTML = $('#racaoGrid', tmp).innerHTML;
  });

  view.addEventListener('submit', async (e) => {
    if (e.target.id !== 'acessoForm') return;
    e.preventDefault();
    const f = e.target;
    const email = f.email.value.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Digite um e-mail válido.');
    const btn = $('button', f);
    btn.disabled = true;
    try {
      const r = await Cloud.addAcesso({ email, nome: f.nome.value.trim(), papel: f.papel.value });
      acessos.push(r);
      f.reset();
      $('#acessoLista').innerHTML = acessoListaHtml();
      toast(`Acesso liberado para ${email}`);
    } catch (err) {
      toast(err && err.code === '23505' ? 'Este e-mail já tem acesso.' : errMsg(err));
    } finally {
      btn.disabled = false;
    }
  });

  function toast(msg, ms = 3000) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ---------- Entrada, login e carregamento ----------

  function showGate(kind, extra) {
    $('#app').hidden = true;
    $('#gate').hidden = false;
    const body = $('#gateBody');
    if (kind === 'login') {
      body.innerHTML = `<p class="muted">Entre com a conta Google que recebeu acesso.</p>
        <button type="button" class="btn google" id="btnGoogle">${ICON.google} Entrar com Google</button>
        <p class="gate-msg" id="gateMsg"></p>`;
      $('#btnGoogle').addEventListener('click', async () => {
        $('#gateMsg').textContent = 'Abrindo o Google…';
        try {
          await Cloud.signInWithGoogle();
        } catch (err) {
          $('#gateMsg').textContent = `Não foi possível entrar: ${err.message}`;
        }
      });
    } else if (kind === 'noaccess') {
      body.innerHTML = `<p>A conta <strong>${esc(user.email)}</strong> ainda não tem acesso.</p>
        <p class="muted">Peça para ${esc(CFG.donoNome || 'o dono')} liberar este e-mail e depois toque em “Tentar de novo”.</p>
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

  const cacheKey = () => `porcos:cache:${user.id}`;

  function saveCache() {
    try {
      localStorage.setItem(cacheKey(), JSON.stringify({ db, papel, at: loadedAt }));
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
      papel = await Cloud.papel();
      if (!papel) {
        try { localStorage.removeItem(cacheKey()); } catch (e) { /* nada */ }
        showGate('noaccess');
        return;
      }
      db = await Cloud.loadAll();
      loadedAt = Date.now();
      offline = false;
      await refreshFotos();
      saveCache();
      showApp();
      onRoute();
    } catch (err) {
      const c = readCache();
      if (c) {
        db = { ...emptyDb(), ...c.db };
        papel = c.papel;
        loadedAt = c.at;
        offline = true;
        fotoUrl = {};
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
      const novoPapel = await Cloud.papel();
      if (!novoPapel) {
        papel = null;
        showGate('noaccess');
        return;
      }
      papel = novoPapel;
      db = await Cloud.loadAll();
      loadedAt = Date.now();
      offline = false;
      await refreshFotos();
      saveCache();
      if (!dlg.open) render();
      if (!quiet) toast('Dados atualizados');
    } catch (err) {
      if (quiet) throw err;
      toast(errMsg(err).replace('Não foi possível salvar', 'Não foi possível atualizar'));
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
    acessos = null;
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

  // ---------- App instalável ----------

  async function install() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
    $('#btnInstall').hidden = true;
  }

  function bindApp() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      installPrompt = e;
      $('#btnInstall').hidden = false;
    });
    $('#btnInstall').addEventListener('click', install);
    window.addEventListener('appinstalled', () => {
      $('#btnInstall').hidden = true;
      toast('App instalado! Procure “Porcos” na tela inicial.');
    });

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
    $$('[data-logo]').forEach((el) => { el.innerHTML = LOGO; });
    renderTheme();
    window.addEventListener('hashchange', () => {
      if (dlg.open) dlg.close();
      onRoute();
    });
    bindApp();
  }

  init();
})();
