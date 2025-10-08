# Excalidraw com PostgreSQL - Guia Completo de Configuração

## 📋 Sumário

- [Pré-requisitos](#pré-requisitos)
- [Arquitetura do Projeto](#arquitetura-do-projeto)
- [Configuração Inicial](#configuração-inicial)
- [Build e Execução](#build-e-execução)
- [Verificação e Testes](#verificação-e-testes)
- [Comandos Úteis](#comandos-úteis)
- [Funcionalidades](#funcionalidades)
- [Troubleshooting](#troubleshooting)

---

## 🔧 Pré-requisitos

### Software Necessário

- **Docker**: versão 20.10 ou superior
- **Docker Compose**: versão 1.29 ou superior
- **Node.js**: versão 18 ou superior (para desenvolvimento local)
- **Git**: para clonar o repositório

### Verificar Instalações

```bash
docker --version
docker-compose --version
node --version
git --version
```

---

## 🏗️ Arquitetura do Projeto

O projeto utiliza 3 containers Docker orquestrados via Docker Compose:

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker Compose                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  excalidraw  │  │ postgres-api │  │  excalidraw-db  │  │
│  │              │  │              │  │                 │  │
│  │ Nginx 1.27   │  │  Node 18     │  │ PostgreSQL 15   │  │
│  │ Alpine       │  │  Express API │  │ Supabase Image  │  │
│  │              │  │              │  │                 │  │
│  │ Port: 3000   │  │  Port: 4001  │  │  Port: 5432     │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
│         │                  │                   │            │
│         └──────────────────┴───────────────────┘            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Componentes

1. **excalidraw** (Frontend)
   - Servidor Nginx servindo arquivos estáticos
   - Build da aplicação React/Vite
   - Porta: 3000

2. **postgres-api** (Backend API)
   - API REST em Node.js/Express
   - Gerencia persistência de dados
   - Porta: 4001

3. **excalidraw-db** (Banco de Dados)
   - PostgreSQL 15
   - Armazena sessões locais, colaboração e arquivos
   - Porta: 5432

---

## ⚙️ Configuração Inicial

### 1. Clone o Repositório

```bash
git clone https://github.com/RicardoAlmeid/excalidraw.git
cd excalidraw
```

### 2. Estrutura de Arquivos Importante

```
excalidraw/
├── docker-compose.yml           # Orquestração dos containers
├── Dockerfile                   # Build do frontend
├── postgres-api/
│   ├── server.js               # API REST
│   └── package.json            # Dependências da API
├── excalidraw-app/
│   ├── vite.config.mts         # Configuração Vite
│   ├── data/
│   │   ├── PostgresLocalStorage.ts  # Cliente PostgreSQL
│   │   ├── SaveEvents.ts            # Sistema de eventos
│   │   └── LocalData.ts             # Persistência local
│   ├── components/
│   │   ├── SaveIndicator.tsx        # Indicador de salvamento
│   │   └── SaveIndicator.scss       # Estilos do indicador
│   └── hooks/
│       └── useSaveStatus.ts         # Hook de status
└── packages/                    # Pacotes internos
```

### 3. Verificar Configuração do Docker Compose

O arquivo `docker-compose.yml` já está configurado:

```yaml
version: '3.8'

services:
  # Banco de dados PostgreSQL
  db:
    container_name: excalidraw-db
    image: supabase/postgres:15.1.0.117
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: excalidraw
      POSTGRES_USER: excalidraw
      POSTGRES_PASSWORD: excalidraw123
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U excalidraw"]
      interval: 10s
      timeout: 5s
      retries: 5

  # API REST
  postgres-api:
    container_name: excalidraw-postgres-api
    build: ./postgres-api
    ports:
      - "4001:4001"
    environment:
      DATABASE_URL: postgresql://excalidraw:excalidraw123@db:5432/excalidraw
      PORT: 4001
    depends_on:
      db:
        condition: service_healthy

  # Frontend
  excalidraw:
    container_name: excalidraw
    build:
      context: .
      dockerfile: Dockerfile
      args:
        VITE_APP_POSTGRES_API_BASE_URL: http://localhost:4001
    ports:
      - "3000:80"
    depends_on:
      - postgres-api

volumes:
  postgres_data:
```

---

## 🚀 Build e Execução

### Opção 1: Build e Execução em Um Comando

```bash
docker-compose up --build
```

Este comando:
- ✅ Baixa todas as imagens necessárias
- ✅ Compila o código TypeScript/React
- ✅ Instala dependências
- ✅ Cria os containers
- ✅ Inicia todos os serviços
- ✅ Exibe logs em tempo real

### Opção 2: Build e Execução Separados (Recomendado)

#### Passo 1: Build dos Containers

```bash
# Build de todos os serviços
docker-compose build

# Ou build individual
docker-compose build excalidraw      # Frontend
docker-compose build postgres-api    # API
```

**Tempo estimado**: 2-5 minutos (primeira vez)

#### Passo 2: Iniciar Containers

```bash
# Iniciar em background (daemon mode)
docker-compose up -d

# Ou iniciar com logs visíveis
docker-compose up
```

#### Passo 3: Verificar Status

```bash
docker-compose ps
```

Saída esperada:
```
NAME                       STATUS              PORTS
excalidraw                 Up 30 seconds       0.0.0.0:3000->80/tcp
excalidraw-postgres-api    Up 35 seconds       0.0.0.0:4001->4001/tcp
excalidraw-db              Up 40 seconds       0.0.0.0:5432->5432/tcp
```

### Opção 3: Desenvolvimento Local (Sem Docker)

#### Terminal 1: Banco de Dados

```bash
docker-compose up db
```

#### Terminal 2: API

```bash
cd postgres-api
npm install
npm start
```

#### Terminal 3: Frontend

```bash
cd excalidraw-app
npm install
npm start
```

---

## ✅ Verificação e Testes

### 1. Verificar Containers

```bash
# Status dos containers
docker-compose ps

# Logs de todos os serviços
docker-compose logs

# Logs de um serviço específico
docker-compose logs excalidraw
docker-compose logs postgres-api
docker-compose logs db

# Seguir logs em tempo real
docker-compose logs -f
```

### 2. Testar a Aplicação

#### Teste 1: Acessar o Frontend
```bash
# Abrir no navegador
http://localhost:3000
```

Você deve ver a interface do Excalidraw com:
- ✅ Canvas branco para desenhar
- ✅ Ferramentas de desenho no topo
- ✅ **Ícone de nuvem** na parte inferior central (indicador de salvamento)

#### Teste 2: Verificar API
```bash
# Health check
curl http://localhost:4001/health

# Resposta esperada:
# {"status":"ok","database":"connected"}
```

#### Teste 3: Verificar Banco de Dados
```bash
# Conectar ao PostgreSQL
docker exec -it excalidraw-db psql -U excalidraw -d excalidraw

# Dentro do psql:
\dt                          # Listar tabelas
SELECT * FROM local_sessions; # Ver sessões salvas
\q                           # Sair
```

### 3. Testar Salvamento Automático

1. **Desenhar no Canvas**
   - Crie círculos, retângulos, setas
   - O ícone de nuvem deve ficar **azul** (salvando)
   - Depois ficará **verde** (salvo)

2. **Verificar Persistência**
   ```bash
   # Verificar último salvamento
   curl http://localhost:4001/local-sessions/$(cat ~/.excalidraw-user-id 2>/dev/null || echo "user-123")
   ```

3. **Recarregar Página**
   - Pressione F5
   - Seus desenhos devem permanecer

4. **Fechar e Reabrir Navegador**
   - Feche completamente o navegador
   - Abra novamente em `http://localhost:3000`
   - Dados devem ser restaurados

### 4. Script de Teste Automatizado

```bash
# Criar script de teste
cat > test-storage.sh << 'EOF'
#!/bin/bash

echo "🧪 Testando Sistema de Armazenamento..."

# 1. Health check da API
echo -e "\n1️⃣ Verificando API..."
API_HEALTH=$(curl -s http://localhost:4001/health)
echo "   $API_HEALTH"

# 2. Verificar conexão com banco
echo -e "\n2️⃣ Testando conexão com PostgreSQL..."
docker exec excalidraw-db pg_isready -U excalidraw
if [ $? -eq 0 ]; then
    echo "   ✅ PostgreSQL está rodando"
else
    echo "   ❌ PostgreSQL não está acessível"
    exit 1
fi

# 3. Verificar tabelas
echo -e "\n3️⃣ Verificando tabelas..."
TABLES=$(docker exec excalidraw-db psql -U excalidraw -d excalidraw -t -c "\dt" | grep -c "local_sessions\|scenes\|files")
if [ "$TABLES" -eq 3 ]; then
    echo "   ✅ Todas as tabelas criadas (local_sessions, scenes, files)"
else
    echo "   ⚠️ Algumas tabelas podem estar faltando"
fi

# 4. Testar salvamento
echo -e "\n4️⃣ Testando endpoint de salvamento..."
USER_ID="test-user-$(date +%s)"
RESPONSE=$(curl -s -X PUT http://localhost:4001/local-sessions/$USER_ID \
  -H "Content-Type: application/json" \
  -d '{"elements":[{"type":"rectangle","id":"test"}],"appState":{"viewBackgroundColor":"#fff"}}')

if [ $? -eq 0 ]; then
    echo "   ✅ Salvamento bem-sucedido"
else
    echo "   ❌ Erro no salvamento"
fi

# 5. Testar recuperação
echo -e "\n5️⃣ Testando recuperação de dados..."
GET_RESPONSE=$(curl -s http://localhost:4001/local-sessions/$USER_ID)
if echo "$GET_RESPONSE" | grep -q "rectangle"; then
    echo "   ✅ Dados recuperados com sucesso"
else
    echo "   ❌ Erro na recuperação"
fi

echo -e "\n✨ Testes concluídos!"
EOF

chmod +x test-storage.sh
./test-storage.sh
```

---

## 🛠️ Comandos Úteis

### Gerenciamento de Containers

```bash
# Parar todos os containers
docker-compose down

# Parar e remover volumes (CUIDADO: apaga dados do banco)
docker-compose down -v

# Reiniciar serviços
docker-compose restart

# Reiniciar serviço específico
docker-compose restart excalidraw

# Ver uso de recursos
docker stats

# Limpar containers órfãos
docker-compose down --remove-orphans
```

### Build e Rebuild

```bash
# Rebuild completo (força reconstrução)
docker-compose build --no-cache

# Rebuild apenas frontend
docker-compose build --no-cache excalidraw

# Rebuild e reiniciar
docker-compose up --build -d
```

### Logs e Debugging

```bash
# Ver logs dos últimos 100 linhas
docker-compose logs --tail=100

# Logs de um serviço com timestamp
docker-compose logs -f --timestamps excalidraw

# Acessar shell do container
docker exec -it excalidraw sh
docker exec -it excalidraw-postgres-api sh
docker exec -it excalidraw-db bash

# Inspecionar container
docker inspect excalidraw
```

### Banco de Dados

```bash
# Backup do banco
docker exec excalidraw-db pg_dump -U excalidraw excalidraw > backup.sql

# Restaurar backup
docker exec -i excalidraw-db psql -U excalidraw excalidraw < backup.sql

# Ver dados salvos
docker exec -it excalidraw-db psql -U excalidraw -d excalidraw -c "SELECT user_id, updated_at FROM local_sessions ORDER BY updated_at DESC LIMIT 10;"

# Limpar dados antigos
docker exec -it excalidraw-db psql -U excalidraw -d excalidraw -c "DELETE FROM local_sessions WHERE updated_at < NOW() - INTERVAL '30 days';"
```

### Monitoramento

```bash
# Uso de CPU/Memória em tempo real
docker stats --no-stream

# Espaço em disco usado
docker system df

# Listar volumes
docker volume ls

# Inspecionar volume
docker volume inspect excalidraw_postgres_data
```

---

## ✨ Funcionalidades

### 1. Salvamento Automático

- **Dual Storage**: Dados salvos simultaneamente em:
  - `localStorage` (browser)
  - PostgreSQL (servidor)
  
- **Debouncing**: Salvamento otimizado (aguarda 1 segundo após última edição)

- **Indicador Visual**: Ícone de nuvem mostra status:
  - 🌥️ **Cinza**: Não salvo / Idle
  - 🌥️ **Azul** (pulsando): Salvando...
  - 🌥️ **Verde**: Salvo com sucesso
  - 🌥️ **Vermelho**: Erro no salvamento

### 2. Persistência de Dados

```
┌─────────────────────────────────────────────────┐
│              Fluxo de Salvamento                │
├─────────────────────────────────────────────────┤
│                                                 │
│  Usuário desenha                                │
│         ↓                                       │
│  LocalData.save() (debounced 1s)               │
│         ↓                                       │
│  ┌──────────────┐    ┌────────────────┐        │
│  │ localStorage │    │   PostgreSQL   │        │
│  │   (imediato) │    │  (via API)     │        │
│  └──────────────┘    └────────────────┘        │
│         ↓                     ↓                 │
│  SaveIndicator atualiza (evento)              │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 3. Esquema do Banco de Dados

```sql
-- Tabela de sessões locais
CREATE TABLE IF NOT EXISTS local_sessions (
    user_id TEXT PRIMARY KEY,
    elements JSONB NOT NULL,
    app_state JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de colaboração (rooms)
CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY,
    scene_version INTEGER,
    ciphertext TEXT,
    iv TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de arquivos/anexos
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    prefix TEXT,
    payload TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_local_sessions_updated 
    ON local_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_scenes_updated 
    ON scenes(updated_at DESC);
```

### 4. Endpoints da API

```
GET  /health
     → Status da API e banco

PUT  /local-sessions/:userId
     Body: { elements: [], appState: {} }
     → Salvar sessão local

GET  /local-sessions/:userId
     → Recuperar sessão local

PUT  /scenes/:roomId
     Body: { sceneVersion, ciphertext, iv }
     → Salvar cena colaborativa

GET  /scenes/:roomId
     → Recuperar cena colaborativa

POST /files/bulk
     Body: FormData com arquivos
     → Upload de múltiplos arquivos

GET  /files/:prefix/:id
     → Download de arquivo
```

---

## 🐛 Troubleshooting

### Problema 1: Containers não Iniciam

```bash
# Verificar erros nos logs
docker-compose logs

# Erro comum: porta em uso
# Solução: Parar processo usando a porta
sudo lsof -i :3000  # ou :4001, :5432
sudo kill -9 <PID>

# Ou mudar porta no docker-compose.yml
ports:
  - "3001:80"  # frontend
  - "4002:4001"  # api
  - "5433:5432"  # postgres
```

### Problema 2: Erro "ContainerConfig"

```bash
# Limpar containers órfãos
docker-compose down --remove-orphans

# Reiniciar
docker-compose up -d
```

### Problema 3: Build Falha

```bash
# Limpar cache do Docker
docker system prune -a

# Rebuild sem cache
docker-compose build --no-cache

# Verificar espaço em disco
df -h
```

### Problema 4: Banco de Dados não Conecta

```bash
# Verificar se PostgreSQL está healthy
docker-compose ps

# Recriar volume do banco
docker-compose down -v
docker-compose up -d

# Aguardar healthcheck
docker-compose logs db | grep "ready to accept"
```

### Problema 5: Dados Não Salvam

```bash
# 1. Verificar API
curl http://localhost:4001/health

# 2. Verificar logs da API
docker-compose logs postgres-api

# 3. Verificar tabelas
docker exec -it excalidraw-db psql -U excalidraw -d excalidraw -c "\dt"

# 4. Verificar permissões
docker exec -it excalidraw-db psql -U excalidraw -d excalidraw -c "INSERT INTO local_sessions (user_id, elements, app_state) VALUES ('test', '[]'::jsonb, '{}'::jsonb);"
```

### Problema 6: Indicador de Salvamento Não Aparece

```bash
# Verificar se foi builded corretamente
docker exec -it excalidraw ls -la /usr/share/nginx/html

# Verificar console do navegador (F12)
# Deve mostrar eventos de salvamento

# Rebuild do frontend
docker-compose build --no-cache excalidraw
docker-compose up -d excalidraw
```

### Problema 7: Erro de CORS na API

```bash
# Verificar se CORS está habilitado em postgres-api/server.js
docker exec -it excalidraw-postgres-api cat server.js | grep cors

# Deve ter:
# app.use(cors());
```

---

## 📦 Variáveis de Ambiente

### Frontend (Build Args no Dockerfile)

```dockerfile
ARG VITE_APP_POSTGRES_API_BASE_URL=http://localhost:4001
```

### Backend (postgres-api)

```yaml
environment:
  DATABASE_URL: postgresql://excalidraw:excalidraw123@db:5432/excalidraw
  PORT: 4001
```

### Banco de Dados

```yaml
environment:
  POSTGRES_DB: excalidraw
  POSTGRES_USER: excalidraw
  POSTGRES_PASSWORD: excalidraw123
```

**⚠️ IMPORTANTE**: Para produção, use variáveis seguras:

```bash
# Criar .env
cat > .env << EOF
POSTGRES_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 64)
EOF

# Usar no docker-compose.yml
environment:
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
```

---

## 🚀 Deploy em Produção

### Checklist de Segurança

- [ ] Alterar senhas padrão
- [ ] Usar HTTPS (certificado SSL)
- [ ] Configurar firewall (apenas portas necessárias)
- [ ] Implementar rate limiting na API
- [ ] Configurar backup automático do banco
- [ ] Usar secrets do Docker Compose
- [ ] Validar inputs na API
- [ ] Implementar autenticação (se necessário)

### Exemplo de Deploy com Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/excalidraw
server {
    listen 80;
    server_name excalidraw.seudominio.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /api/ {
        proxy_pass http://localhost:4001/;
        proxy_set_header Host $host;
    }
}
```

---

## 📚 Recursos Adicionais

- **Documentação Oficial**: https://docs.excalidraw.com
- **GitHub**: https://github.com/excalidraw/excalidraw
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **Docker Docs**: https://docs.docker.com/

---

## 🤝 Contribuindo

Para contribuir com melhorias:

1. Fork o repositório
2. Crie uma branch: `git checkout -b feature/minha-feature`
3. Commit: `git commit -m 'feat: adiciona nova feature'`
4. Push: `git push origin feature/minha-feature`
5. Abra um Pull Request

---

## 📄 Licença

Este projeto utiliza a licença MIT. Veja o arquivo LICENSE para detalhes.

---

**Última atualização**: Outubro 2025
**Versão**: 1.0.0
