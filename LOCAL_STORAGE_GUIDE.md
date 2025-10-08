# Salvamento Local no PostgreSQL - Guia Completo

## O que mudou?

Agora o Excalidraw salva **tanto sessões locais quanto colaborativas** no PostgreSQL!

### Antes ❌
- **Sessões locais**: salvavam apenas no localStorage do navegador (limitado e pode ser perdido)
- **Sessões colaborativas**: salvavam no PostgreSQL (compartilhadas)

### Agora ✅
- **Sessões locais**: salvam no localStorage **E** no PostgreSQL (backup persistente)
- **Sessões colaborativas**: continuam salvando no PostgreSQL (compartilhadas)

## Como funciona?

### 1. Salvamento Automático Local

Quando você desenha algo NO MODO LOCAL (sem iniciar colaboração):

1. Os dados são salvos no **localStorage** (salvamento rápido)
2. Após 2 segundos de inatividade, os dados também são salvos no **PostgreSQL**
3. Um ID único de usuário é gerado e armazenado no localStorage
4. Esse ID é usado para recuperar seus desenhos

### 2. Carregamento Automático

Quando você abre o Excalidraw:

1. O sistema tenta carregar dados do **PostgreSQL primeiro**
2. Se não encontrar, usa os dados do **localStorage**
3. Seus desenhos são restaurados automaticamente

## Estrutura do Banco de Dados

### Nova Tabela: `local_sessions`

```sql
CREATE TABLE local_sessions (
  user_id TEXT PRIMARY KEY,           -- ID único do usuário (gerado automaticamente)
  elements TEXT NOT NULL,             -- Elementos do desenho (JSON)
  app_state TEXT NOT NULL,            -- Estado da aplicação (JSON)
  created_at TIMESTAMPTZ DEFAULT NOW(), -- Data de criação
  updated_at TIMESTAMPTZ DEFAULT NOW()  -- Última atualização
);
```

## Comandos Úteis

### Verificar sessões locais salvas

```bash
# Ver todas as sessões
docker exec excalidraw-db psql -U postgres -d postgres -c "SELECT user_id, created_at, updated_at FROM local_sessions;"

# Ver detalhes de uma sessão
docker exec excalidraw-db psql -U postgres -d postgres -c "SELECT user_id, LENGTH(elements) as elementos, LENGTH(app_state) as estado FROM local_sessions;"

# Contar sessões
docker exec excalidraw-db psql -U postgres -d postgres -c "SELECT COUNT(*) as total_sessoes FROM local_sessions;"
```

### Limpar sessões antigas

```bash
# Limpar todas as sessões locais
docker exec excalidraw-db psql -U postgres -d postgres -c "TRUNCATE local_sessions;"

# Limpar sessões mais antigas que 30 dias
docker exec excalidraw-db psql -U postgres -d postgres -c "DELETE FROM local_sessions WHERE updated_at < NOW() - INTERVAL '30 days';"
```

### Backup e Restauração

```bash
# Backup de sessões locais
docker exec excalidraw-db pg_dump -U postgres -d postgres -t local_sessions > local_sessions_backup.sql

# Restaurar backup
cat local_sessions_backup.sql | docker exec -i excalidraw-db psql -U postgres postgres
```

## Testar Funcionalidade

Execute o script de teste:

```bash
./test-local-storage.sh
```

Ou teste manualmente:

```bash
# 1. Salvar uma sessão de teste
curl -X PUT http://localhost:4001/local-sessions/meu-teste \
  -H "Content-Type: application/json" \
  -d '{
    "elements": [{"type":"rectangle","x":100,"y":100,"width":200,"height":150}],
    "appState": {"viewBackgroundColor":"#ffffff"}
  }'

# 2. Recuperar a sessão
curl http://localhost:4001/local-sessions/meu-teste

# 3. Verificar no banco
docker exec excalidraw-db psql -U postgres -d postgres -c "SELECT * FROM local_sessions WHERE user_id='meu-teste';"
```

## Vantagens do Salvamento Duplo

### ✅ localStorage (Navegador)
- ⚡ **Rápido**: salvamento instantâneo
- 💾 **Offline**: funciona sem internet
- 🔒 **Privado**: dados ficam no seu navegador

### ✅ PostgreSQL (Servidor)
- 💪 **Persistente**: não perde dados se limpar o navegador
- 🔄 **Recuperável**: pode acessar de outros dispositivos (com mesmo user_id)
- 📊 **Rastreável**: histórico de quando foi salvo
- 🗄️ **Backup**: dados ficam no servidor

## Diferenças entre Sessão Local vs Colaborativa

| Recurso | Sessão Local | Sessão Colaborativa |
|---------|-------------|---------------------|
| **Como ativar** | Automático (padrão) | Clicar em "Live collaboration" |
| **Salvamento** | localStorage + PostgreSQL | PostgreSQL (criptografado) |
| **Compartilhamento** | ❌ Não compartilha | ✅ Link de compartilhamento |
| **ID de identificação** | `user_id` único gerado | `roomId` + `roomKey` |
| **Criptografia** | ❌ Dados em texto puro | ✅ Dados criptografados |
| **Sincronização** | ❌ Não sincroniza | ✅ Tempo real |
| **Tabela no DB** | `local_sessions` | `scenes` |

## Fluxo de Dados

### Salvamento Local
```
Usuário desenha
    ↓
localStorage (imediato)
    ↓
Aguarda 2 segundos
    ↓
PostgreSQL (backup)
```

### Carregamento
```
Usuário abre Excalidraw
    ↓
Tenta carregar do PostgreSQL
    ↓
Se não encontrar → carrega do localStorage
    ↓
Desenho é restaurado
```

## Arquivos Modificados

1. **`postgres-api/server.js`**
   - ✅ Adicionadas rotas `/local-sessions/:userId` (GET/PUT)
   - ✅ Criação da tabela `local_sessions`

2. **`excalidraw-app/data/PostgresLocalStorage.ts`** (NOVO)
   - ✅ Funções para salvar/carregar sessões locais
   - ✅ Geração de `userId` único
   - ✅ Debounce para evitar salvamentos excessivos

3. **`excalidraw-app/data/LocalData.ts`**
   - ✅ Integração com PostgreSQL no salvamento
   - ✅ Salvamento duplo (localStorage + PostgreSQL)

4. **`excalidraw-app/data/index.ts`**
   - ✅ Carregamento do PostgreSQL na inicialização
   - ✅ Fallback para localStorage se PostgreSQL falhar

## Solução de Problemas

### Dados não estão sendo salvos

```bash
# 1. Verificar se a API está rodando
docker logs excalidraw-postgres-api --tail 20

# 2. Verificar se a tabela existe
docker exec excalidraw-db psql -U postgres -d postgres -c "\dt"

# 3. Verificar conectividade
curl http://localhost:4001/health
```

### Recuperar userId do localStorage

Abra o console do navegador (F12) e execute:

```javascript
localStorage.getItem('excalidraw-local-user-id')
```

### Ver dados salvos no navegador

```javascript
// Ver elementos salvos
JSON.parse(localStorage.getItem('excalidraw'))

// Ver configurações
JSON.parse(localStorage.getItem('excalidraw-state'))
```

## Configuração Avançada

### Mudar tempo de debounce

Edite `PostgresLocalStorage.ts`:

```typescript
const SAVE_DEBOUNCE_MS = 5000; // 5 segundos em vez de 2
```

### Desabilitar salvamento no PostgreSQL

Comente a linha em `LocalData.ts`:

```typescript
// saveLocalSessionToPostgresDebounced(elements, appState);
```

### Limpar localStorage e forçar uso do PostgreSQL

```javascript
// No console do navegador
localStorage.clear();
location.reload();
```

## Monitoramento

### Ver atividade em tempo real

```bash
# Logs da API
docker logs excalidraw-postgres-api -f

# Logs do PostgreSQL
docker logs excalidraw-db -f

# Queries em execução
docker exec excalidraw-db psql -U postgres -d postgres -c "SELECT query, query_start FROM pg_stat_activity WHERE datname = 'postgres';"
```

### Estatísticas de uso

```sql
-- Total de sessões
SELECT COUNT(*) as total FROM local_sessions;

-- Sessões criadas hoje
SELECT COUNT(*) FROM local_sessions 
WHERE created_at >= CURRENT_DATE;

-- Sessões mais antigas
SELECT user_id, created_at, updated_at 
FROM local_sessions 
ORDER BY updated_at ASC 
LIMIT 10;

-- Tamanho médio dos dados
SELECT 
  AVG(LENGTH(elements)) as avg_elements_size,
  AVG(LENGTH(app_state)) as avg_appstate_size
FROM local_sessions;
```

## Próximos Passos

Possíveis melhorias futuras:

1. 🔐 **Criptografia**: criptografar dados locais também
2. 🔑 **Autenticação**: vincular `userId` a contas de usuário
3. 📱 **Multi-dispositivo**: sincronizar entre dispositivos
4. 🗓️ **Versionamento**: manter histórico de versões
5. 🧹 **Limpeza automática**: remover sessões antigas
6. 📊 **Dashboard**: visualizar estatísticas de uso

## Suporte

Para problemas ou dúvidas:

1. Verifique os logs: `docker-compose logs`
2. Execute o teste: `./test-local-storage.sh`
3. Consulte `POSTGRES_GUIDE.md` para funcionalidades de colaboração
