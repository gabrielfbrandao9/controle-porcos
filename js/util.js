/*
 * Ajudantes: datas (sempre "AAAA-MM-DD", no fuso do aparelho), idades,
 * dinheiro e números no formato brasileiro.
 */
(function (global) {
  'use strict';

  const DIA = 86400000;

  function parseDate(s) {
    if (!s) return null;
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function iso(date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  }

  function today() {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  const hoje = () => iso(today());

  function addDays(s, n) {
    const d = parseDate(s);
    d.setDate(d.getDate() + n);
    return iso(d);
  }

  // Dias de a até b (b - a)
  function diffDays(a, b) {
    return Math.round((parseDate(b) - parseDate(a)) / DIA);
  }

  // Dias que faltam até a data (negativo = já passou)
  const daysUntil = (s) => diffDays(hoje(), s);

  function fmtDate(s) {
    if (!s) return '—';
    const [y, m, d] = String(s).slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  // "2025-03" -> "mar/2025"
  function fmtMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    return `${MESES[m - 1]}/${y}`;
  }

  function fmtMonthLong(ym) {
    const [y, m] = ym.split('-').map(Number);
    return `${MESES_LONGOS[m - 1]} de ${y}`;
  }

  // Anos, meses e dias entre duas datas
  function ymd(fromS, toS) {
    const a = parseDate(fromS);
    const b = parseDate(toS);
    let y = b.getFullYear() - a.getFullYear();
    let m = b.getMonth() - a.getMonth();
    let d = b.getDate() - a.getDate();
    if (d < 0) {
      m--;
      d += new Date(b.getFullYear(), b.getMonth(), 0).getDate();
    }
    if (m < 0) {
      y--;
      m += 12;
    }
    return { y, m, d };
  }

  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  // "1 ano e 5 meses", "11 meses e 19 dias", "13 dias"
  function fmtAge(fromS, toS) {
    if (!fromS) return '—';
    const to = toS || hoje();
    if (diffDays(fromS, to) < 0) return '—';
    const { y, m, d } = ymd(fromS, to);
    if (y > 0) return m ? `${plural(y, 'ano', 'anos')} e ${plural(m, 'mês', 'meses')}` : plural(y, 'ano', 'anos');
    if (m > 0) return d ? `${plural(m, 'mês', 'meses')} e ${plural(d, 'dia', 'dias')}` : plural(m, 'mês', 'meses');
    return plural(d, 'dia', 'dias');
  }

  // "faltam 4 dias", "hoje", "há 12 dias"
  function fmtRelative(s) {
    const n = daysUntil(s);
    if (n === 0) return 'hoje';
    if (n === 1) return 'amanhã';
    if (n === -1) return 'ontem';
    return n > 0 ? `faltam ${n} dias` : `há ${-n} dias`;
  }

  const moneyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const numFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const kgFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtMoney = (v) => (v == null || v === '' ? '—' : moneyFmt.format(Number(v)));
  const fmtNum = (v) => (v == null || v === '' ? '—' : numFmt.format(Number(v)));
  const fmtKg = (v) => (v == null || v === '' ? '—' : `${kgFmt.format(Number(v))} kg`);
  const fmtPct = (v) => `${numFmt.format(v)}%`;

  // "1.450,00", "1450.5", "R$ 30" -> número; vazio -> null; inválido -> NaN
  function parseNum(s) {
    if (s == null) return null;
    let t = String(s).replace(/R\$|\s|kg|%/gi, '');
    if (!t) return null;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  }

  // Número para mostrar num campo de formulário ("1450,5")
  const toInput = (v) => (v == null || v === '' ? '' : String(v).replace('.', ','));

  const ordinal = (n) => `${n}ª`;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  global.U = {
    parseDate, iso, today, hoje, addDays, diffDays, daysUntil, fmtDate, fmtMonth, fmtMonthLong, ymd, fmtAge, fmtRelative,
    fmtMoney, fmtNum, fmtKg, fmtPct, parseNum, toInput, ordinal, plural, esc,
  };
})(window);
