# Teste Completo - Sistema de Autenticação e Persistência de Imagens

## ✅ Dados Limpos

Todos os dados foram resetados:
- ✅ PostgreSQL: Tabelas `users`, `local_sessions`, `scenes`, `files` foram truncadas
- ⚠️ localStorage do navegador: PRECISA ser limpo manualmente (veja instruções abaixo)
- ⚠️ IndexedDB do navegador: PRECISA ser limpo manualmente (veja instruções abaixo)

## 🧹 Limpar Dados do Navegador

### Opção 1: Console do Navegador (Recomendado)
1. Abra http://localhost:3000
2. Pressione **F12** para abrir DevTools
3. Vá para a aba **Console**
4. Cole e execute os seguintes comandos:

```javascript
// Limpar localStorage
localStorage.clear();

// Limpar IndexedDB (para arquivos/imagens)
indexedDB.deleteDatabase('files-db');
indexedDB.deleteDatabase('excalidraw');

// Recarregar página
location.reload();
```

### Opção 2: Manualmente pelo DevTools
1. Abra http://localhost:3000
2. Pressione **F12**
3. Vá para **Application** (ou **Aplicativo**)
4. No menu lateral:
   - **Local Storage** → `http://localhost:3000` → Clique direito → **Clear**
   - **IndexedDB** → Clique direito em `files-db` → **Delete database**
   - **IndexedDB** → Clique direito em `excalidraw` → **Delete database**
5. Recarregue a página (**Ctrl+R** ou **F5**)

## 🧪 Roteiro de Teste

### 1. Teste Básico (Sem Autenticação)
- [ ] Acesse http://localhost:3000
- [ ] Desenhe alguns elementos
- [ ] Faça upload de uma imagem
- [ ] Observe o indicador de nuvem salvar (fica verde)
- [ ] Recarregue a página
- [ ] ⚠️ **Esperado**: Elementos salvos, mas **imagem quebrada** (porque não está autenticado)

### 2. Teste com Autenticação
- [ ] Clique no **botão de login** (ícone ao lado da nuvem)
- [ ] **Observe o modal**: Deve estar com **fundo branco sólido** (não transparente!)
- [ ] Clique em "Criar uma conta"
- [ ] Preencha:
  - Username: `teste`
  - Senha: `teste123`
  - Confirmar senha: `teste123`
- [ ] Clique em "Criar Conta"
- [ ] **Esperado**: Modal fecha, você está logado

### 3. Teste de Persistência de Imagens
- [ ] Faça upload de uma **nova imagem**
- [ ] Observe o console (F12 → Console):
  - `[PostgresLocalStorage] Salvando sessão com files: 1 arquivos`
  - `[PostgresLocalStorage] FilesData preparado: 1 arquivos`
- [ ] Aguarde o ícone da nuvem ficar **verde** (salvo)
- [ ] Passe o mouse sobre a nuvem → deve mostrar:
  - ✓ localStorage: ✓
  - ✓ PostgreSQL: ✓
  - Usuário: teste
- [ ] **Recarregue a página** (F5)
- [ ] Observe o console:
  - `[localStorage] Usuário autenticado, tentando carregar do PostgreSQL...`
  - `[localStorage] Dados carregados do PostgreSQL: {elements: X, files: 1}`
  - `[PostgresLocalStorage] Files recebidos do servidor: 1 arquivos`
- [ ] **✅ SUCESSO**: A imagem deve aparecer perfeitamente!

### 4. Teste Cross-Browser (Sincronização)
- [ ] **Abra uma aba anônima** (Ctrl+Shift+N)
- [ ] Acesse http://localhost:3000
- [ ] Clique no botão de login
- [ ] Faça login com: `teste` / `teste123`
- [ ] **✅ SUCESSO**: Todo o desenho e imagens devem aparecer!

### 5. Teste de Logout
- [ ] Passe o mouse sobre a nuvem
- [ ] No tooltip, clique em **"Sair"**
- [ ] **Esperado**: Página recarrega, você está deslogado
- [ ] O botão de login volta a aparecer ao lado da nuvem

## 🎨 Melhorias Implementadas

### Modal de Login
- ✅ Fundo branco sólido (não transparente)
- ✅ Tema claro e escuro responsivo
- ✅ Inputs com foco destacado (azul)
- ✅ Botão com hover animado
- ✅ Mensagens de erro destacadas em vermelho

### Sistema de Imagens
- ✅ Carregamento automático do PostgreSQL ao logar
- ✅ Fallback para localStorage se PostgreSQL falhar
- ✅ Logs detalhados no console para debug
- ✅ Sincronização entre dispositivos/navegadores

### Tooltip da Nuvem
- ✅ Sempre disponível ao passar o mouse
- ✅ Mostra status em tempo real (salvando/salvo/erro)
- ✅ Ícones visuais: ✓ ⏳ ✗ ⊝
- ✅ Botão de logout quando logado
- ✅ Botão de login quando deslogado

## 📊 Verificar Dados no PostgreSQL

```bash
# Ver usuários cadastrados
docker exec excalidraw-db psql -U postgres -c "SELECT id, username, created_at FROM users;"

# Ver sessões salvas
docker exec excalidraw-db psql -U postgres -c "SELECT user_id, LENGTH(elements) as elements_size, LENGTH(app_state) as appstate_size, jsonb_object_keys(files) as file_ids, updated_at FROM local_sessions;"

# Ver arquivos salvos
docker exec excalidraw-db psql -U postgres -c "SELECT user_id, jsonb_object_keys(files) as file_id FROM local_sessions WHERE files != '{}'::jsonb;"
```

## 🔧 Comandos Úteis

### Limpar TUDO novamente
```bash
# Limpar banco de dados
docker exec excalidraw-db psql -U postgres -c "TRUNCATE TABLE users, local_sessions, scenes, files CASCADE;"

# No navegador (Console):
localStorage.clear();
indexedDB.deleteDatabase('files-db');
indexedDB.deleteDatabase('excalidraw');
location.reload();
```

### Ver logs em tempo real
```bash
# Logs da API
docker logs -f excalidraw-postgres-api

# Logs do frontend (nginx)
docker logs -f excalidraw
```

## 🐛 Troubleshooting

### Imagens ainda quebradas?
1. Abra o console (F12)
2. Veja os logs - procure por erros
3. Verifique se o PostgreSQL salvou: `docker exec excalidraw-db psql -U postgres -c "SELECT jsonb_object_keys(files) FROM local_sessions;"`
4. Verifique se está logado: `localStorage.getItem('excalidraw-auth-token')`

### Modal transparente?
1. Verifique se o build foi feito: `docker images | grep excalidraw_excalidraw`
2. Force rebuild: `docker-compose build --no-cache excalidraw`
3. Limpe cache do navegador: Ctrl+Shift+R

### Não salva no PostgreSQL?
1. Veja logs da API: `docker logs excalidraw-postgres-api --tail 50`
2. Verifique conexão: `docker exec excalidraw-postgres-api wget -q -O- http://localhost:4001/health`
3. Verifique tabela: `docker exec excalidraw-db psql -U postgres -c "\d local_sessions"`

---

**Boa sorte com os testes! 🚀**
