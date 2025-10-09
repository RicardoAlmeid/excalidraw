# PostgreSQL Persistence with Authentication and Session Control

## 🎯 Resumo

Esta feature adiciona persistência completa dos diagramas no PostgreSQL com sistema de autenticação, controle de sessões simultâneas e versionamento.

## ✨ Features Principais

### 1. **Sistema de Autenticação**
- Login e registro de usuários
- Autenticação JWT
- Gestão de sessões seguras
- Proteção de rotas na API

### 2. **Persistência PostgreSQL**
- Auto-save a cada 10 minutos
- Salvamento manual com nome e nota de versão
- Histórico completo de versões
- Suporte a imagens e arquivos binários

### 3. **Controle de Sessões**
- **Uma sessão ativa por usuário**: Apenas um navegador/aba pode editar por vez
- Sessões secundárias entram automaticamente em modo visualização
- Banner visual indicando modo somente leitura
- Botão "Assumir Controle" para transferir edição entre sessões
- Sistema de heartbeat para detectar sessões ativas (polling a cada 5s)
- Limpeza automática de sessões inativas (timeout 30s)

### 4. **Nomenclatura Dual**
- **Nome do Diagrama**: Identificador principal compartilhado entre versões
- **Nota da Versão**: Descrição específica de cada salvamento
- Editor visual com ícone de lápis
- Botão "Novo Diagrama" para criar diagramas limpos

### 5. **Histórico de Versões**
- Lista completa de versões salvas
- Preview visual antes de restaurar
- Filtro por sessão
- Indicadores de auto-save vs manual
- Contador de elementos

## 🏗️ Arquitetura

### Backend (PostgreSQL + Express)
```
postgres-api/
├── server.js          # API REST
├── Dockerfile         # Container Node.js
└── package.json       # Dependências
```

**Endpoints principais:**
- `POST /auth/register` - Criar conta
- `POST /auth/login` - Autenticar
- `POST /local-sessions/:userId` - Salvar sessão
- `GET /local-sessions/:userId` - Carregar sessão
- `GET /local-sessions/:userId/versions` - Listar versões
- `POST /sessions/claim` - Reivindicar sessão ativa
- `POST /sessions/heartbeat` - Manter sessão viva
- `POST /sessions/transfer` - Transferir controle
- `POST /sessions/release` - Liberar sessão

### Frontend (React)
```
excalidraw-app/
├── components/
│   ├── AuthDialog.tsx           # Login/Registro
│   ├── SaveIndicator.tsx        # Status de salvamento
│   ├── VersionHistory.tsx       # Histórico
│   ├── ViewOnlyBanner.tsx       # Banner de visualização
│   └── SessionChoiceDialog.tsx  # Escolha local vs remoto
├── data/
│   ├── AuthService.ts           # Gestão de autenticação
│   ├── PostgresLocalStorage.ts  # API client
│   └── SaveEvents.ts            # Eventos de salvamento
└── hooks/
    └── useSaveStatus.ts         # Hook de status
```

### Database Schema

**Tabela `users`:**
```sql
- id SERIAL PRIMARY KEY
- username TEXT UNIQUE
- password_hash TEXT
- created_at TIMESTAMPTZ
```

**Tabela `session_versions`:**
```sql
- id SERIAL PRIMARY KEY
- user_id TEXT
- session_id TEXT
- elements TEXT (JSON)
- app_state TEXT (JSON)
- files JSONB
- version_number INTEGER
- is_auto_save BOOLEAN
- diagram_name VARCHAR(255)
- version_note TEXT
- created_at TIMESTAMPTZ
```

**Tabela `active_sessions`:**
```sql
- id SERIAL PRIMARY KEY
- user_id TEXT UNIQUE
- session_id TEXT
- diagram_name VARCHAR(255)
- browser_session_id TEXT UNIQUE
- last_heartbeat TIMESTAMPTZ
```

## 🚀 Como Usar

### Setup Inicial

1. **Iniciar containers:**
```bash
docker compose up -d
```

2. **Acessar aplicação:**
```
http://localhost:9500
```

3. **Criar conta:**
- Clique em "Login" no canto superior direito
- Escolha "Registrar"
- Preencha usuário e senha
- Confirme

### Workflow Normal

1. **Login**: Faça login com suas credenciais
2. **Desenhe**: Crie seu diagrama normalmente
3. **Nomeie**: Clique no lápis ✏️ e defina um nome
4. **Auto-save**: Sistema salva automaticamente a cada 10 min
5. **Histórico**: Clique em "📋 Histórico" para ver versões

### Sessões Múltiplas

**Cenário:** Você abre o Excalidraw em 2 navegadores com o mesmo usuário

1. **Navegador 1** (primeiro a abrir):
   - ✅ Pode editar normalmente
   - Sessão ativa marcada no backend

2. **Navegador 2** (segundo a abrir):
   - 👁️ Banner laranja: "Você está visualizando este diagrama"
   - Canvas em modo somente leitura
   - Botão "🔄 Assumir Controle" disponível

3. **Transferir Controle**:
   - No Navegador 2, clique "Assumir Controle"
   - Navegador 2 agora pode editar
   - Navegador 1 entra em modo visualização
   - Banner aparece automaticamente no Navegador 1

## 🔧 Configuração

### Variáveis de Ambiente

**.env (raiz do projeto):**
```env
POSTGRES_USER=excalidraw
POSTGRES_PASSWORD=excalidraw123
POSTGRES_DB=excalidraw
POSTGRES_API_URL=http://localhost:4001
```

**postgres-api/.env:**
```env
DATABASE_URL=postgresql://excalidraw:excalidraw123@postgres-db:5432/excalidraw
JWT_SECRET=your-secret-key-change-in-production
PORT=4001
```

### Portas

- **Frontend**: `9500`
- **API**: `4001`
- **PostgreSQL**: `5432`

## 📊 Fluxo de Dados

### Salvamento
```
Usuário edita
    ↓
Timer 10 min ou Manual
    ↓
saveLocalSessionToPostgres()
    ↓
POST /local-sessions/:userId
    ↓
PostgreSQL INSERT session_versions
    ↓
Status "Salvo" atualizado
```

### Controle de Sessão
```
Login + Load Diagram
    ↓
claimActiveSession()
    ↓
POST /sessions/claim
    ↓
Check active_sessions table
    ↓
Se outra sessão ativa:
    → isActive: false
    → ViewOnlyBanner aparece
Senão:
    → isActive: true
    → Criar registro em active_sessions
    → Iniciar heartbeat (5s)
```

### Heartbeat
```
A cada 5 segundos (se sessão ativa):
    ↓
sendSessionHeartbeat()
    ↓
POST /sessions/heartbeat
    ↓
UPDATE last_heartbeat
    ↓
Se outra sessão assumiu:
    → isActive: false
    → Parar heartbeat
    → Mostrar ViewOnlyBanner
```

## 🐛 Troubleshooting

### Problema: "Ambas as sessões editando"
**Causa:** Heartbeat não está funcionando
**Solução:**
1. Verificar logs do backend: `docker compose logs postgres-api`
2. Confirmar que `/sessions/heartbeat` está retornando `isActive: false` para segunda sessão
3. Limpar tabela: `DELETE FROM active_sessions;`

### Problema: "Erro 500 ao assumir controle"
**Causa:** Endpoint `/sessions/transfer` com erro
**Solução:**
1. Verificar logs: `docker compose logs postgres-api --tail=50`
2. Checar constraint UNIQUE em `active_sessions`
3. Reconstruir API: `docker compose up -d --build postgres-api`

### Problema: "Dados não aparecem após login"
**Causa:** Session ID diferente
**Solução:**
1. Verificar `sessionStorage` no DevTools
2. Confirmar que `excalidraw-session-id` está definido
3. Carregar versão do histórico para sincronizar

## 📈 Melhorias Futuras

- [ ] Fork automático ao renomear diagrama
- [ ] Agrupamento de versões por diagram_name no histórico
- [ ] Fontes do Excalidraw nos componentes customizados
- [ ] Colaboração real-time (WebSockets)
- [ ] Compartilhamento de diagramas entre usuários
- [ ] Permissões granulares (visualizar/editar/admin)
- [ ] Exportação em batch
- [ ] Busca full-text nos diagramas

## 📝 Notas Técnicas

### Performance
- Auto-save otimizado (debounce de 10 min)
- Índices em user_id, session_id, created_at
- Cleanup automático de sessões antigas
- Lazy loading do histórico (50 versões por vez)

### Segurança
- Senhas hasheadas com bcrypt (10 rounds)
- JWT com expiração (24h)
- CORS configurado para localhost
- SQL parametrizado (proteção contra injection)
- Browser session IDs únicos e seguros

### Compatibilidade
- Funciona com dados locais existentes
- Dialog de escolha ao fazer login
- Migração transparente
- Preserva estrutura original do Excalidraw

## 🤝 Contribuindo

Para reportar bugs ou sugerir melhorias:
1. Abra uma issue no GitHub
2. Descreva o comportamento esperado vs atual
3. Inclua logs relevantes
4. Adicione screenshots se possível

## 📄 Licença

MIT License - veja LICENSE file
