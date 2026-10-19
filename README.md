# Controle de Porcos

Site para acompanhar a criação de porcos: plantel, gestações e crias, vacinas, ração, gastos e abates.
Substitui a planilha **Porcos** do Google Drive (os dados dela foram importados).

**Endereço:** <https://gabrielfbrandao9.github.io/controle-porcos/>

Só entra quem recebeu acesso, com a conta Google. Cada pessoa pode **só ver** ou **ver e editar**;
quem decide é o dono, na tela **Conta**. Veja [SUPABASE.md](SUPABASE.md).

## Telas

- **Início**: quantos animais há no plantel, próximo parto, leitões nascidos no ano, saldo, e avisos de
  vacinas atrasadas ou chegando e partos dos próximos 15 dias.
- **Animais**: ficha de cada animal (foto, idade calculada sozinha, compra, venda, abate), com filtro
  por situação (no plantel, vendidos, abatidos, mortos).
- **Crias**: gestações de cada matriz. Enquanto o dia do parto não for preenchido, ele fica previsto para
  114 dias depois do cruzamento; depois do parto, registre vivos e mortos (o site mostra os nascidos, a soma
  dos dois), machos/fêmeas, capação e as aplicações nos leitões.
- **Saúde**: calendário de cada vacina com reforço (Verme a cada 180 dias, Suiven a cada 365, Megabov a cada 120),
  com última e próxima aplicação de cada animal. Dá para registrar uma aplicação em vários animais de uma vez.
- **Ração**: fórmula de cada fase com a conta de quantos kg vão de cada ingrediente, a partir do total de ração
  ou da quantidade de milho que você tem.
- **Finanças**: gastos (soro, ração, outras despesas) e receitas por mês, saldo, margem e abates (carne,
  toucinho, valor), com filtro por ano.

Idades, duração das gestações, próximas vacinas e totais são calculados pelo site: não precisa digitar.

## Como funciona

Site estático (HTML, CSS e JavaScript, sem etapa de build) publicado pelo GitHub Pages, com os dados no
Supabase. Pode ser instalado no celular como app ("Adicionar à tela inicial"). Sem internet, mostra os
dados da última vez que abriu, só para consulta.

```
index.html            página e menu
css/style.css         visual (tema claro e escuro)
js/config.js          endereço e chave pública do Supabase
js/util.js            datas, idades e números no formato brasileiro
js/cloud.js           login e leitura/gravação no Supabase
js/app.js             telas e formulários
sw.js                 funcionamento como app instalável
supabase/schema.sql   tabelas e regras de segurança
```

Para testar no computador, sirva a pasta num servidor local (por exemplo
`python -m http.server 8770`) e abra `http://localhost:8770`.

Ao mudar a lista de arquivos, aumente `VERSION` em `sw.js`.
