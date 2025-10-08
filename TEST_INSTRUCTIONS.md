# 📚 Documentação Completa - Excalidraw com PostgreSQL

## 🎯 Visão Geral

Sistema completo de persistência, autenticação e versionamento automático para Excalidraw com backend PostgreSQL.

### **Funcionalidades Implementadas:**

1. ✅ **Persistência PostgreSQL** - Salvamento automático de desenhos
2. ✅ **Sistema de Autenticação** - Login/Registro com JWT
3. ✅ **Sincronização Cross-Browser** - Mesmo usuário, múltiplos dispositivos
4. ✅ **Indicador Visual de Salvamento** - Ícone de nuvem com status
5. ✅ **Sistema de Versionamento** - Histórico completo de versões
6. ✅ **Auto-Save Automático** - Versões de segurança a cada 10 minutos
7. ✅ **Agrupamento por Diagrama** - Cada desenho tem suas próprias versões
8. ✅ **Preview de Versões** - Visualizar antes de restaurar

---

## 🏗️ Arquitetura do Sistema

### **Stack Tecnológico:**
- **Frontend**: React 19, TypeScript, Vite 5
- **Backend**: Node.js 18, Express
- **Database**: PostgreSQL 15
- **Web Server**: Nginx 1.27
- **Containerização**: Docker Compose

### **Fluxo de Dados:**

```
┌─────────────────────────────────────────────────────────────────┐
│                         USUÁRIO                                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXCALIDRAW APP                                │
│  - React Components                                              │
│  - ExcalidrawAPI                                                 │
│  - Auto-save Timer (10min)                                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              PostgresLocalStorage.ts                             │
│  - getUserId() → username ou UUID local                          │
│  - getSessionId() → ID único do diagrama                         │
│  - saveSessionVersion() → backup manual/automático               │
│  - listSessionVersions() → histórico filtrado por diagrama       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    REST API (Express)                            │
│  Endpoints:                                                      │
│  - POST /local-sessions/:userId                                  │
│  - GET  /local-sessions/:userId                                  │
│  - POST /local-sessions/:userId/versions                         │
│  - GET  /local-sessions/:userId/versions?sessionId=xxx           │
│  - GET  /local-sessions/:userId/versions/:versionId              │
│  - POST /auth/register                                           │
│  - POST /auth/login                                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    POSTGRESQL 15                                 │
│  Tables:                                                         │
│  - local_sessions (desenho atual)                                │
│  - session_versions (histórico de versões)                       │
│  - users (autenticação)                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🗄️ Schema do Banco de Dados

### **Tabela: `users`**
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### **Tabela: `local_sessions`**
```sql
CREATE TABLE local_sessions (
  user_id TEXT PRIMARY KEY,           -- username ou UUID local
  elements TEXT NOT NULL,              -- JSON dos elementos do desenho
  app_state TEXT NOT NULL,            -- Estado da aplicação (zoom, etc)
  files JSONB DEFAULT '{}',           -- Imagens e arquivos anexados
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### **Tabela: `session_versions`**
```sql
CREATE TABLE session_versions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,              -- username ou UUID local
  session_id TEXT NOT NULL,           -- ID único do diagrama
  elements TEXT NOT NULL,              -- JSON dos elementos
  app_state TEXT NOT NULL,            -- Estado da aplicação
  files JSONB DEFAULT '{}',           -- Arquivos
  version_number INTEGER NOT NULL,     -- Número da versão (por diagrama)
  is_auto_save BOOLEAN DEFAULT FALSE,  -- true = auto-save, false = manual
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_session_versions_user_id 
  ON session_versions(user_id, created_at DESC);
  
CREATE INDEX idx_session_versions_session_id 
  ON session_versions(session_id, created_at DESC);
```

---

## 🔐 Sistema de Autenticação

### **Registro de Usuário**

**Endpoint:** `POST /auth/register`

**Request:**
```json
{
  "username": "ricardo",
  "password": "senha123"
}
```

**Response (sucesso):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "username": "ricardo"
}
```

### **Login**

**Endpoint:** `POST /auth/login`

**Request:**
```json
{
  "username": "ricardo",
  "password": "senha123"
}
```

**Response (sucesso):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "username": "ricardo"
}
```

### **Token JWT**
- Armazenado em `localStorage` como `excalidraw-auth-token`
- Válido por **7 dias**
- Contém: `{ userId, username, iat, exp }`

---

## 💾 Sistema de Salvamento

### **Salvamento Automático da Sessão Principal**

```typescript
// Debounced para evitar muitas requisições
saveLocalSessionToPostgresDebounced(
  elements,    // Elementos do desenho
  appState,    // Estado (zoom, cor, etc)
  files        // Imagens
);
```

**Timing:** Aguarda 2 segundos após última edição

**Quando ocorre:**
- Ao adicionar/editar/deletar elementos
- Ao mudar zoom, cor, ou ferramenta
- Ao adicionar imagens

### **Carregamento na Inicialização**

```typescript
const data = await loadLocalSessionFromPostgres();
// Retorna: { elements, appState, files }
```

**Lógica:**
1. Se usuário **logado**: carrega do PostgreSQL (username)
2. Se usuário **anônimo**: carrega do PostgreSQL (UUID local) ou localStorage

---

## 📦 Sistema de Versionamento

### **Como Funciona**

Cada diagrama tem um **ID único de sessão** (`session_id`) que:
- É gerado automaticamente ao criar/abrir um diagrama
- Persiste no `sessionStorage` da aba do navegador
- Agrupa todas as versões do mesmo diagrama

### **Tipos de Versões**

1. **Versões Manuais** (`is_auto_save = false`)
   - Criadas ao restaurar uma versão anterior
   - Salva backup da versão atual antes de restaurar

2. **Versões Automáticas** (`is_auto_save = true`)
   - Criadas a cada 10 minutos automaticamente
   - Apenas para usuários logados
   - Não interfere com o trabalho do usuário

### **Endpoints de Versionamento**

#### **Salvar Nova Versão**

**Endpoint:** `POST /local-sessions/:userId/versions`

**Request:**
```json
{
  "elements": [...],
  "appState": {...},
  "files": {...},
  "sessionId": "session-1728374521-abc123",
  "isAutoSave": true
}
```

**Response:**
```json
{
  "id": 42,
  "version_number": 5,
  "created_at": "2025-10-08T14:30:00Z",
  "is_auto_save": true
}
```

#### **Listar Versões do Diagrama Atual**

**Endpoint:** `GET /local-sessions/:userId/versions?sessionId=xxx`

**Response:**
```json
[
  {
    "id": 42,
    "session_id": "session-1728374521-abc123",
    "version_number": 5,
    "is_auto_save": true,
    "created_at": "2025-10-08T14:30:00Z",
    "element_count": 12
  },
  {
    "id": 41,
    "session_id": "session-1728374521-abc123",
    "version_number": 4,
    "is_auto_save": false,
    "created_at": "2025-10-08T14:20:00Z",
    "element_count": 10
  }
]
```

#### **Recuperar Versão Específica**

**Endpoint:** `GET /local-sessions/:userId/versions/:versionId`

**Response:**
```json
{
  "elements": [...],
  "appState": {...},
  "files": {...},
  "versionNumber": 5,
  "createdAt": "2025-10-08T14:30:00Z"
}
```

### **Auto-Save a cada 10 minutos**

```typescript
// Código no App.tsx
useEffect(() => {
  if (!currentUsername || !excalidrawAPI) return;

  const autoSaveInterval = setInterval(async () => {
    const elements = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();
    const files = excalidrawAPI.getFiles();

    if (elements.length > 0) {
      await saveSessionVersion(
        elements,
        appState,
        files,
        true  // isAutoSave = true
      );
      console.log('[AutoSave] Versão automática salva');
    }
  }, 10 * 60 * 1000);  // 10 minutos

  return () => clearInterval(autoSaveInterval);
}, [currentUsername, excalidrawAPI]);
```

**Logs no Console:**
```
[AutoSave] Timer iniciado - salvando versão a cada 10 minutos
[AutoSave] Versão automática salva com sucesso
```

---

## 🎨 Componentes da Interface

### **1. SaveIndicator - Indicador de Salvamento**

**Localização:** Rodapé centralizado

**Estados:**
- 🟢 **Saved** (Verde) - "Salvo"
- 🔵 **Saving** (Azul, pulsante) - "Salvando..."
- 🔴 **Error** (Vermelho) - "Erro ao salvar"
- ⚪ **Idle** (Cinza) - "Aguardando alterações"

**Tooltip ao passar mouse:**
```
Status de Salvamento

localStorage: ✓
PostgreSQL: ✓

Salvo agora mesmo

✓ Sincronizado em todos os dispositivos
```

**Botões no Tooltip:**
- **Versões** - Abre histórico de versões
- **Sair** - Logout

### **2. AuthDialog - Modal de Autenticação**

**Tabs:**
- **Login** - Entrar com usuário existente
- **Registro** - Criar nova conta

**Campos:**
- Username
- Password

**Após login bem-sucedido:**
- Se houver desenho local E remoto → mostra `SessionChoiceDialog`
- Caso contrário → recarrega página

### **3. SessionChoiceDialog - Escolha de Sessão**

Aparece quando há conflito entre desenho local e remoto após login.

**Opções:**
1. **Carregar desenho do servidor**
   - Descarta local, carrega remoto
   
2. **Manter desenho local**
   - Salva remoto como versão de backup
   - Mantém desenho local como principal

### **4. VersionHistory - Histórico de Versões**

**Layout:**
```
┌─────────────────────────────────────────────┐
│  Histórico de Versões               [X]     │
│  Restaure versões anteriores do seu desenho │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ Versão 5 - 12 elementos              │   │
│  │ Há 2 minutos (Auto-save)             │   │
│  │ [👁 Visualizar] [🔄 Restaurar]       │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ Versão 4 - 10 elementos              │   │
│  │ Há 15 minutos                        │   │
│  │ [👁 Visualizar] [🔄 Restaurar]       │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  💡 Use "Visualizar" para ver a versão      │
│     antes de restaurar                       │
└─────────────────────────────────────────────┘
```

**Funcionalidades:**
- **Visualizar**: Carrega versão temporariamente (não salva backup)
- **Restaurar**: Salva atual como backup, depois carrega versão selecionada

**Timestamps:**
- "Agora" - < 1 minuto
- "Há X minutos" - < 60 minutos
- "Há X horas" - < 24 horas
- "DD/MM/YYYY HH:mm" - > 24 horas

---

## 🔄 Fluxos de Uso Completos

### **Fluxo 1: Usuário Anônimo (Primeira Vez)**

```
1. Abre http://localhost:3000
   ↓
2. UUID local é gerado → localStorage
   ↓
3. Desenha elementos
   ↓
4. Após 2s → salva no PostgreSQL (user_id = UUID)
   ↓
5. Indicador mostra "Salvo" 🟢
   ↓
6. Recarrega página → desenho é restaurado
```

### **Fluxo 2: Usuário Cria Conta**

```
1. Clica no indicador → "Sair"
   ↓
2. Modal de autenticação abre
   ↓
3. Registra: username="ricardo", password="senha123"
   ↓
4. Token JWT salvo
   ↓
5. Se havia desenho local:
   - Verifica se há desenho remoto
   - Se houver → mostra escolha
   - Se não houver → salva local como remoto
   ↓
6. Agora desenhos salvam com user_id="ricardo"
```

### **Fluxo 3: Login em Novo Dispositivo**

```
1. Abre http://localhost:3000 em outro PC
   ↓
2. Clica no indicador → "Sair" → "Login"
   ↓
3. Login: username="ricardo", password="senha123"
   ↓
4. Desenhos do usuário são carregados
   ↓
5. Edições sincronizam automaticamente
```

### **Fluxo 4: Versionamento Automático**

```
1. Usuário logado desenha
   ↓
2. Timer de 10min está ativo
   ↓
3. A cada 10 minutos:
   - saveSessionVersion(elements, appState, files, true)
   - Console: "[AutoSave] Versão automática salva"
   ↓
4. Versões ficam disponíveis no histórico
   ↓
5. Usuário pode restaurar qualquer versão
```

### **Fluxo 5: Restaurar Versão Anterior**

```
1. Clica no indicador → "Versões"
   ↓
2. Modal com histórico abre
   ↓
3. Opção A: Clica "Visualizar"
   - Desenho muda temporariamente
   - Não salva backup
   - Pode voltar editando
   ↓
4. Opção B: Clica "Restaurar"
   - Salva versão atual como backup
   - Carrega versão selecionada
   - Versão passa a ser a principal
```

---

## 🚀 Instalação e Configuração

### **Pré-requisitos:**
- Docker 20+
- Docker Compose 2+
- Portas livres: 3000 (Nginx), 4001 (API), 5432 (PostgreSQL)

### **Passo 1: Clonar Repositório**
```bash
git clone <repositorio>
cd excalidraw
```

### **Passo 2: Iniciar Containers**
```bash
docker compose up -d --build
```

**Containers criados:**
- `excalidraw` (Nginx + React App) - porta 3000
- `excalidraw-postgres-api` (Node.js API) - porta 4001
- `excalidraw-db` (PostgreSQL 15) - porta 5432

### **Passo 3: Verificar Saúde**
```bash
# API
curl http://localhost:4001/health
# Deve retornar: {"status":"OK","timestamp":"..."}

# Frontend
curl http://localhost:3000
# Deve retornar HTML

# Database
docker exec excalidraw-db psql -U postgres -d postgres -c "\dt"
# Deve listar tabelas
```

### **Passo 4: Acessar Aplicação**
Abrir navegador: http://localhost:3000

---

## 🧪 Testes Completos

### **Teste 1: Salvamento Automático**

### **Teste 1: Salvamento Automático**

**Objetivo:** Verificar que desenhos salvam automaticamente no PostgreSQL

**Passos:**
1. Abra http://localhost:3000
2. Desenhe um retângulo
3. Aguarde 2 segundos
4. Verifique o console (F12):
   ```
   Sessão local salva no PostgreSQL com sucesso
   ```
5. Verifique o banco:
   ```bash
   docker exec excalidraw-db psql -U postgres -d postgres -c \
     "SELECT user_id, LENGTH(elements), updated_at FROM local_sessions;"
   ```

**Resultado Esperado:**
- ✅ 1 registro na tabela
- ✅ Indicador mostra "Salvo" (verde)
- ✅ Timestamp recente

### **Teste 2: Recuperação após Reload**

**Objetivo:** Verificar que desenhos são restaurados ao recarregar

**Passos:**
1. Com desenho salvo, pressione F5
2. Aguarde carregar
3. Verifique o console:
   ```
   Dados carregados do PostgreSQL: X elementos
   ```

**Resultado Esperado:**
- ✅ Desenho aparece corretamente
- ✅ Todos os elementos estão lá
- ✅ Posições e cores preservadas

### **Teste 3: Autenticação**

**Objetivo:** Criar conta e fazer login

**Passos:**
1. Clique no indicador de salvamento (rodapé)
2. Clique em "Sair"
3. Modal de autenticação abre
4. Aba "Registro":
   - Username: "teste"
   - Password: "senha123"
   - Clique "Registrar"
5. Verifique banco:
   ```bash
   docker exec excalidraw-db psql -U postgres -d postgres -c \
     "SELECT id, username, created_at FROM users;"
   ```

**Resultado Esperado:**
- ✅ Usuário criado no banco
- ✅ Token JWT salvo em localStorage
- ✅ Indicador mostra username "teste"

### **Teste 4: Sincronização Cross-Browser**

**Objetivo:** Verificar que desenhos sincronizam entre dispositivos

**Passos:**
1. Navegador 1: Desenhe algo e faça login (usuario: "teste")
2. Navegador 2 (aba anônima): Abra http://localhost:3000
3. Navegador 2: Faça login com mesmo usuário
4. Navegador 2: Desenho deve aparecer automaticamente

**Resultado Esperado:**
- ✅ Mesmo desenho em ambos navegadores
- ✅ Edições em N1 aparecem em N2 após reload
- ✅ Cada navegador tem mesmo user_id

### **Teste 5: Versionamento Manual**

**Objetivo:** Salvar e restaurar versões manualmente

**Passos:**
1. Desenhe 3 elementos
2. Clique indicador → "Versões"
3. Modal de histórico abre (deve estar vazio inicialmente)
4. Desenhe mais 2 elementos
5. Clique "Visualizar" na versão anterior
6. Desenho volta para 3 elementos (temporário)
7. Edite algo → volta ao estado atual
8. Clique "Restaurar" na versão anterior
9. Confirme no banco:
   ```bash
   docker exec excalidraw-db psql -U postgres -d postgres -c \
     "SELECT id, version_number, is_auto_save, created_at FROM session_versions ORDER BY created_at DESC;"
   ```

**Resultado Esperado:**
- ✅ 2 versões no histórico (backup + anterior)
- ✅ Desenho restaurado tem 3 elementos
- ✅ "Visualizar" não cria backup
- ✅ "Restaurar" cria backup da versão atual

### **Teste 6: Auto-Save Automático (10 minutos)**

**Objetivo:** Verificar salvamento automático a cada 10 minutos

**Nota:** Para testar rapidamente, modifique temporariamente o timer no código:
```typescript
// App.tsx - linha ~607
}, 10 * 1000);  // 10 segundos ao invés de 10 minutos
```

**Passos:**
1. Faça login
2. Desenhe algo
3. Verifique console:
   ```
   [AutoSave] Timer iniciado - salvando versão a cada 10 minutos
   ```
4. Aguarde 10 segundos (ou 10 minutos na versão final)
5. Console deve mostrar:
   ```
   [AutoSave] Versão automática salva com sucesso
   ```
6. Abra "Versões" → deve haver versão marcada como "Auto-save"
7. Verifique banco:
   ```bash
   docker exec excalidraw-db psql -U postgres -d postgres -c \
     "SELECT id, version_number, is_auto_save, session_id, created_at FROM session_versions ORDER BY created_at DESC LIMIT 5;"
   ```

**Resultado Esperado:**
- ✅ Versão com `is_auto_save = true`
- ✅ `session_id` preenchido
- ✅ Timer continua rodando
- ✅ Logs no console a cada intervalo

### **Teste 7: Agrupamento por Diagrama**

**Objetivo:** Verificar que versões são agrupadas por diagrama

**Passos:**
1. Desenhe algo (Diagrama A)
2. Salve versão manual (Versões → automaticamente ao restaurar)
3. Abra nova aba → novo diagrama (Diagrama B)
4. Desenhe algo diferente
5. Salve versão manual
6. Aba 1 (Diagrama A): Abra "Versões" → deve ver apenas versões do Diagrama A
7. Aba 2 (Diagrama B): Abra "Versões" → deve ver apenas versões do Diagrama B
8. Verifique banco:
   ```bash
   docker exec excalidraw-db psql -U postgres -d postgres -c \
     "SELECT session_id, version_number, created_at FROM session_versions ORDER BY session_id, version_number;"
   ```

**Resultado Esperado:**
- ✅ 2 `session_id` diferentes
- ✅ Cada diagrama tem numeração independente (v1, v2, v3...)
- ✅ Histórico filtra corretamente por `session_id`

### **Teste 8: Imagens e Arquivos**

**Objetivo:** Verificar que imagens são salvas e restauradas

**Passos:**
1. Desenhe um retângulo
2. Arraste uma imagem para o canvas
3. Aguarde salvamento
4. Verifique banco:
   ```bash
   docker exec excalidraw-db psql -U postgres -d postgres -c \
     "SELECT user_id, LENGTH(files::text) as files_size FROM local_sessions;"
   ```
5. Recarregue página (F5)
6. Imagem deve aparecer corretamente

**Resultado Esperado:**
- ✅ `files_size > 2` (não está vazio)
- ✅ Imagem restaurada após reload
- ✅ Versões incluem imagens

### **Teste 9: Escolha de Sessão ao Fazer Login**

**Objetivo:** Testar modal de escolha quando há conflito local vs remoto

**Passos:**
1. **Navegador Anônimo:** Desenhe algo (Desenho Local)
2. **Navegador Anônimo:** Não faça login ainda
3. **Navegador Normal:** Login como "teste" e desenhe algo diferente (Desenho Remoto)
4. **Navegador Anônimo:** Agora faça login como "teste"
5. Modal "Escolher Sessão" deve aparecer:
   - Opção A: "Carregar desenho do servidor"
   - Opção B: "Manter desenho local"
6. Escolha "Manter desenho local"

**Resultado Esperado:**
- ✅ Modal aparece mostrando ambos desenhos
- ✅ "Manter local": Desenho Local fica visível
- ✅ Desenho Remoto salvo como versão de backup
- ✅ Verifique histórico: deve ter versão do desenho remoto

### **Teste 10: Offline / API Indisponível**

**Objetivo:** Verificar fallback para localStorage quando API falha

**Passos:**
1. Pare a API:
   ```bash
   docker stop excalidraw-postgres-api
   ```
2. Abra http://localhost:3000
3. Desenhe algo
4. Console deve mostrar:
   ```
   Erro ao salvar sessão local no PostgreSQL: Failed to fetch
   ```
5. Recarregue página
6. Desenho deve aparecer (carregado do localStorage)
7. Restaure API:
   ```bash
   docker start excalidraw-postgres-api
   ```
8. Edite desenho novamente
9. Deve salvar no PostgreSQL normalmente

**Resultado Esperado:**
- ✅ Aplicação continua funcionando offline
- ✅ Dados salvam em localStorage
- ✅ Ao restaurar API, volta a salvar no PostgreSQL
- ✅ Nenhum erro fatal no React

---

## 📊 Monitoramento e Debug

### **Logs em Tempo Real**

```bash
# API
docker logs excalidraw-postgres-api -f

# Frontend
docker logs excalidraw -f

# Database
docker logs excalidraw-db -f
```

### **Consultas Úteis**

**Ver todas as sessões:**
```bash
docker exec excalidraw-db psql -U postgres -d postgres -c \
  "SELECT user_id, LENGTH(elements) as bytes, updated_at FROM local_sessions;"
```

**Ver todas as versões:**
```bash
docker exec excalidraw-db psql -U postgres -d postgres -c \
  "SELECT id, user_id, session_id, version_number, is_auto_save, created_at FROM session_versions ORDER BY created_at DESC LIMIT 20;"
```

**Ver versões de um diagrama específico:**
```bash
docker exec excalidraw-db psql -U postgres -d postgres -c \
  "SELECT id, version_number, is_auto_save, created_at FROM session_versions WHERE session_id = 'session-xxx' ORDER BY version_number;"
```

**Ver usuários registrados:**
```bash
docker exec excalidraw-db psql -U postgres -d postgres -c \
  "SELECT id, username, created_at FROM users ORDER BY created_at DESC;"
```

**Contar elementos por sessão:**
```bash
docker exec excalidraw-db psql -U postgres -d postgres -c \
  "SELECT user_id, (SELECT COUNT(*) FROM json_array_elements(elements::json)) as element_count FROM local_sessions;"
```

### **Limpar Dados**

**Limpar tudo:**
```bash
docker exec excalidraw-db psql -U postgres -d postgres -c \
  "TRUNCATE local_sessions, session_versions, users CASCADE;"
```

**Limpar apenas versões:**
```bash
docker exec excalidraw-db psql -U postgres -d postgres -c \
  "TRUNCATE session_versions;"
```

**Limpar localStorage (Console do navegador):**
```javascript
localStorage.clear();
sessionStorage.clear();
location.reload();
```

---

## ⚠️ Troubleshooting

### **Problema: "Nenhuma versão salva ainda"**

**Causa:** Versões só são criadas quando:
1. Usuário está logado
2. Auto-save de 10 minutos dispara
3. Ou quando restaura uma versão (cria backup)

**Solução:**
- Aguarde 10 minutos OU
- Modifique código para testar com 10 segundos

### **Problema: "Versões de outros diagramas aparecem"**

**Causa:** Filtro por `session_id` não está funcionando

**Verificar:**
```bash
# Ver session_id de cada versão
docker exec excalidraw-db psql -U postgres -d postgres -c \
  "SELECT DISTINCT session_id FROM session_versions;"

# Ver session_id atual no navegador (Console F12)
sessionStorage.getItem('excalidraw-session-id')
```

**Solução:**
- Limpar `sessionStorage` e recarregar
- Verificar que API está filtrando corretamente

### **Problema: "Modal transparente/confundindo com diagrama"**

**Causa:** Variáveis CSS podem estar com opacidade baixa

**Verificação:**
- Inspecionar elemento (F12 → Inspector)
- Verificar `background-color` do modal
- Deve ser cor sólida (ex: `#ffffff` ou `#1f2937`)

**Corrigido em:** `SaveIndicator.scss`, todos modais têm `!important`

### **Problema: "Token JWT inválido"**

**Sintomas:**
- Logout automático
- Console: "Token inválido ou expirado"

**Solução:**
```javascript
// Console do navegador
localStorage.removeItem('excalidraw-auth-token');
localStorage.removeItem('excalidraw-auth-username');
// Fazer login novamente
```

### **Problema: "Auto-save não está funcionando"**

**Verificar:**
1. Usuário está logado?
   ```javascript
   localStorage.getItem('excalidraw-auth-username')
   ```
2. Console mostra timer iniciado?
   ```
   [AutoSave] Timer iniciado - salvando versão a cada 10 minutos
   ```
3. Verificar se `excalidrawAPI` está disponível
4. Verificar se há elementos no canvas

**Debug:**
```javascript
// Console - forçar salvamento imediato
window.testAutoSave = async () => {
  const { saveSessionVersion } = await import('./data/PostgresLocalStorage');
  // ... código de teste
};
```

---

## 📝 Configurações Avançadas

### **Variáveis de Ambiente**

**postgres-api/server.js:**
```javascript
const JWT_SECRET = process.env.JWT_SECRET || 'excalidraw-secret-key-change-in-production';
```

**docker-compose.yml:**
```yaml
environment:
  - POSTGRES_HOST=excalidraw-db
  - POSTGRES_PORT=5432
  - POSTGRES_USER=postgres
  - POSTGRES_PASSWORD=postgres
  - POSTGRES_DB=postgres
  - JWT_SECRET=meu-segredo-super-secreto
```

### **Alterar Intervalo de Auto-Save**

**excalidraw-app/App.tsx (linha ~607):**
```typescript
}, 10 * 60 * 1000);  // 10 minutos

// Trocar para 5 minutos:
}, 5 * 60 * 1000);

// Ou 30 segundos para testes:
}, 30 * 1000);
```

### **Alterar Debounce de Salvamento**

**excalidraw-app/data/PostgresLocalStorage.ts:**
```typescript
export const saveLocalSessionToPostgresDebounced = debounce(
  saveLocalSessionToPostgres,
  2000  // 2 segundos - trocar para 5000 = 5 segundos
);
```

---

## 🎯 Checklist Final

**Funcionalidades Básicas:**
- [ ] Desenhos salvam automaticamente (2s debounce)
- [ ] Desenhos carregam ao recarregar página
- [ ] localStorage funciona como fallback
- [ ] Indicador de salvamento mostra status correto

**Autenticação:**
- [ ] Registro de novo usuário funciona
- [ ] Login com credenciais corretas funciona
- [ ] Token JWT persiste em localStorage
- [ ] Logout limpa token e recarrega

**Sincronização:**
- [ ] Desenhos sincronizam entre navegadores
- [ ] Escolha de sessão aparece ao fazer login com desenho local
- [ ] Opção "Manter local" salva remoto como versão
- [ ] Opção "Carregar remoto" descarta local

**Versionamento:**
- [ ] Histórico de versões abre corretamente
- [ ] Versões listam apenas do diagrama atual
- [ ] "Visualizar" carrega versão temporariamente
- [ ] "Restaurar" salva backup e carrega versão
- [ ] Timestamps formatados corretamente

**Auto-Save:**
- [ ] Timer inicia ao fazer login
- [ ] Versões automáticas salvam a cada 10 minutos
- [ ] Flag `is_auto_save = true` está correta
- [ ] Logs aparecem no console

**Agrupamento:**
- [ ] Cada diagrama tem `session_id` único
- [ ] Versões filtram por `session_id`
- [ ] Abas diferentes = diagramas diferentes
- [ ] Numeração de versões é por diagrama

**Interface:**
- [ ] Modais não estão transparentes
- [ ] Tooltips têm fundo sólido
- [ ] Botões têm texto visível
- [ ] Z-index correto (modais sobre diagrama)

**Robustez:**
- [ ] API offline → fallback para localStorage
- [ ] Erros não quebram aplicação
- [ ] Dados grandes (50+ elementos) funcionam
- [ ] Imagens são salvas e restauradas

---

## 🚀 Conclusão

Sistema completo de persistência, autenticação e versionamento implementado com sucesso!

**Principais Conquistas:**
✅ Salvamento automático com debounce  
✅ Sincronização cross-browser  
✅ Autenticação JWT com 7 dias de validade  
✅ Versionamento automático a cada 10 minutos  
✅ Agrupamento de versões por diagrama  
✅ Preview de versões antes de restaurar  
✅ Interface visual clara com indicadores de status  
✅ Fallback para localStorage quando offline  
✅ Suporte completo a imagens e arquivos  

**Performance:**
- Debounce de 2s evita salvamentos excessivos
- Índices no PostgreSQL para queries rápidas
- Session ID em `sessionStorage` (não persiste entre abas)
- Auto-save assíncrono não bloqueia UI

**Segurança:**
- Passwords hasheados com bcrypt (salt rounds: 10)
- JWT com expiração de 7 dias
- Validação de token em cada requisição crítica
- SQL parametrizado (previne SQL injection)

---

**📞 Suporte:**
Para dúvidas ou problemas, verificar:
1. Logs dos containers (`docker logs <container> -f`)
2. Console do navegador (F12)
3. Estrutura do banco (`\d` no psql)
4. Este documento completo

**Versão da Documentação:** 1.0.0  
**Última Atualização:** 08/10/2025  
**Status:** ✅ Produção
