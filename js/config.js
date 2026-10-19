/*
 * Configuração do Supabase. Veja SUPABASE.md.
 *
 * É o mesmo projeto Supabase do Otimizador de Cortes e dos Orçamentos: o login
 * (Google) é o mesmo e os dados ficam nas tabelas "porcos_*" (supabase/schema.sql).
 *
 * A chave "publishable" é pública por natureza e pode ficar no GitHub: quem
 * protege os dados são as regras de segurança (RLS) do schema.sql. NUNCA
 * coloque aqui a chave "service_role" ou "secret".
 */
window.APP_CONFIG = {
  supabaseUrl: 'https://hvpafupdzqoochnlkfvp.supabase.co',
  supabaseKey: 'sb_publishable_gxZJWsTHWsg4tZkcIAnhCA_tQPPYppf',

  // Calculadora de ração (link na tela Ração)
  calculadoraUrl: 'https://gabrielfbrandao9.github.io/calculadora-racao/',

  // Quem decide os acessos (aparece na tela "sem acesso")
  donoNome: 'Gabriel',
};
