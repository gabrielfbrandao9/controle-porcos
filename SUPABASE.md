# Banco de dados (Supabase)

O Controle de Porcos usa **o mesmo projeto Supabase do Otimizador de Cortes e dos Orçamentos**:
o mesmo login com Google e a mesma chave, que já estão em [`js/config.js`](js/config.js).
As tabelas dele começam com `porcos_` e não mexem nas dos outros sites.

O banco já foi criado e os dados da planilha **Porcos** já foram importados. Este arquivo serve
para consulta ou para refazer tudo num projeto novo.

## Liberar o endereço do site (falta fazer)

Em **Authentication** → **URL Configuration** → **Redirect URLs**, adicione:

- `https://gabrielfbrandao9.github.io/controle-porcos/**`
- `http://localhost:8770/**`, para testar no computador.

Não mude o **Site URL** (continua sendo o do Otimizador). Sem esse endereço na lista, o Google
devolve a pessoa para o Otimizador depois do login; como os sites ficam no mesmo endereço
(`gabrielfbrandao9.github.io`), basta voltar para o Controle de Porcos que ela já aparece conectada,
mas é melhor liberar.

## Quem pode ver e editar

Só entra quem está na tabela `porcos_acesso`. O banco confere o e-mail da conta Google em toda
leitura e gravação (regras de segurança, RLS), então não adianta ter o endereço do site.

| Permissão | Ver | Editar | Dar e tirar acesso |
|-----------|-----|--------|--------------------|
| Dono      | sim | sim    | sim                |
| Pode editar | sim | sim  | não                |
| Só ver    | sim | não    | não                |

O dono libera as pessoas no site, em **Conta** (toque na sua foto no canto de cima):
digita o e-mail Google da pessoa, escolhe a permissão e toca em **Dar acesso**. Não chega
e-mail nenhum: o botão **Avisar** abre o WhatsApp com o link. Quem entrar sem estar na lista
vê a mensagem "ainda não tem acesso".

## Tabelas

| Tabela | O que guarda |
|--------|--------------|
| `porcos_animais` | Cada animal: categoria, nascimento, chegada, compra, saída (venda, abate ou morte), foto |
| `porcos_gestacoes` | Cruzamento, parto (ou previsão), nascidos, machos/fêmeas, mortos e capação de cada matriz |
| `porcos_produtos` | Vacinas e remédios e de quantos em quantos dias repetir |
| `porcos_aplicacoes` | Cada aplicação, num animal ou nas crias de uma gestação |
| `porcos_abates` | Carne, toucinho e valor de cada abate |
| `porcos_lancamentos` | Gastos (soro, ração, outras) e receitas |
| `porcos_racoes` | Fórmula de ração de cada fase (% de cada ingrediente) |
| `porcos_acesso` | Quem pode entrar e com qual permissão |

As fotos ficam no Storage, no bucket `porcos-fotos` (privado; até 5 MB cada, o site reduz antes de enviar).
Cada tabela guarda quando e por quem foi a última alteração (`atualizado_em`, `atualizado_por`).

## Projeto novo do zero

1. **SQL Editor** → **New query**, cole [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**
   (antes, siga a instrução do arquivo para cadastrar o e-mail do dono).
2. Ative o login com Google em **Authentication** → **Sign In / Providers**.
3. Coloque a URL e a chave *publishable* do projeto em `js/config.js`.

## Bom saber

- **Projeto pausado**: no plano gratuito, o Supabase pausa o projeto depois de 1 semana sem acesso
  a nenhum dos sites. Se acontecer, entre no painel e clique em **Restore**. Os dados não se perdem.
- **Ver os dados**: **Table Editor** → tabelas `porcos_*`.
