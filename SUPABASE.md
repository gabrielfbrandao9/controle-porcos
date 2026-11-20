# Banco de dados (Supabase)

O Controle de Porcos usa o Supabase para login com Google, banco de dados PostgreSQL com regras de segurança (RLS) e armazenamento de fotos/bulas.

O sistema opera no modelo **Multi-inquilino com Grupos e Convites por Link**:
- Cada usuário que entra ganha automaticamente o seu próprio **Grupo** isolado com fórmulas de ração e vacinas pré-configuradas.
- O dono do grupo pode gerar **links de convite** (para compartilhar no WhatsApp) para que familiares ou colaboradores acessem e editem os mesmos dados.
- Quem tiver mais de um grupo pode alternar entre eles facilmente no aplicativo.

## Como aplicar as atualizações no banco

1. Abra o painel do seu projeto no **Supabase**.
2. Vá em **SQL Editor** → **New query**.
3. Copie todo o conteúdo do arquivo [`supabase/schema.sql`](supabase/schema.sql) e cole no editor.
4. Clique em **Run**.
   *(O script é seguro e idempotente: ele preserva todos os dados existentes, cria o primeiro grupo e associa os animais, crias e lançamentos a ele).*

## Endereço do site liberado no login (Redirect URLs)

Em **Authentication** → **URL Configuration** → **Redirect URLs**:
- `https://gabrielfbrandao9.github.io/controle-porcos/**`
- `http://localhost:8770/**` (para testes locais)

## Permissões no Grupo

| Permissão | Ver | Editar | Convidar / Gerenciar Membros |
|-----------|-----|--------|------------------------------|
| Dono | sim | sim | sim |
| Pode editar | sim | sim | não |
| Só ver | sim | não | não |

## Tabelas

| Tabela | O que guarda |
|--------|--------------|
| `porcos_grupos` | Criações/grupos independentes (nome, data de criação, dono) |
| `porcos_membros` | Membros de cada grupo, seus papéis (`dono`, `editor`, `leitor`) e último acesso |
| `porcos_convites` | Códigos de convites por link ativos para novos membros |
| `porcos_animais` | Plantel de cada grupo (`grupo_id`) |
| `porcos_gestacoes` | Gestações e crias de cada matriz no grupo (`grupo_id`) |
| `porcos_produtos` | Vacinas e remédios cadastrados no grupo (`grupo_id`) |
| `porcos_aplicacoes` | Aplicações de vacinas/medicamentos no grupo (`grupo_id`) |
| `porcos_abates` | Registros de abate no grupo (`grupo_id`) |
| `porcos_lancamentos` | Gastos e receitas no grupo (`grupo_id`) |
| `porcos_racoes` | Fórmulas de ração por fase no grupo (`grupo_id`) |
| `porcos_documentos` | Arquivos, manuais e laudos técnicos do SOS Suínos no grupo (`grupo_id`) |

Storage:
- Bucket `porcos-fotos`: fotos dos animais (privado, até 5 MB).
- Bucket `porcos-bulas`: bulas em PDF ou imagem (privado, até 20 MB).
- Bucket `porcos-documentos`: arquivos, laudos, fotos e manuais do SOS Suínos (privado, até 50 MB).
