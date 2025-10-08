# Sistema de Autenticação - Sincronização Cross-Browser

## 📋 Visão Geral

O Excalidraw agora possui um sistema de autenticação que permite sincronizar seus desenhos entre diferentes navegadores e dispositivos. Sem login, os desenhos são salvos apenas no navegador atual. Com login, seus desenhos ficam disponíveis em qualquer lugar.

## 🔐 Funcionalidades

### Sem Autenticação (Modo Anônimo)
- ✅ Desenhos salvos no `localStorage` do navegador
- ✅ Backup automático no PostgreSQL com ID anônimo
- ⚠️ Dados acessíveis apenas no navegador atual
- ⚠️ Ao limpar cache/dados do navegador, pode perder acesso

### Com Autenticação (Modo Sincronizado)
- ✅ Desenhos salvos no `localStorage` + PostgreSQL
- ✅ Sincronização automática com seu username
- ✅ Acesse de qualquer navegador/dispositivo
- ✅ Segurança com senha e JWT tokens
- ✅ Dados persistentes mesmo ao limpar cache

## 🚀 Como Usar

### 1. Criar Conta

1. Acesse http://localhost:3000
2. Desenhe algo no canvas
3. Passe o mouse sobre o **ícone de nuvem** na parte inferior
4. Clique em **"Entrar para sincronizar"**
5. Na modal que abrir, clique em **"Não tem conta? Criar uma"**
6. Preencha:
   - **Usuário**: mínimo 3 caracteres (ex: joao123)
   - **Senha**: mínimo 6 caracteres
   - **Confirmar Senha**: mesma senha
7. Clique em **"Criar Conta"**

✅ Pronto! Você está autenticado e seus desenhos serão sincronizados.

### 2. Fazer Login

Se você já tem uma conta:

1. Passe o mouse sobre o ícone de nuvem
2. Clique em **"Entrar para sincronizar"**
3. Digite seu **usuário** e **senha**
4. Clique em **"Entrar"**

### 3. Testar Sincronização Cross-Browser

#### Teste no Mesmo Computador

**Terminal 1 - Chrome:**
```bash
google-chrome http://localhost:3000
```

**Terminal 2 - Firefox:**
```bash
firefox http://localhost:3000
```

**Passos:**
1. No Chrome: crie uma conta e desenhe algo
2. No Firefox: faça login com a mesma conta
3. Seus desenhos aparecerão automaticamente!

#### Teste em Dispositivos Diferentes

1. **Desktop**: Faça login e desenhe
2. **Celular/Tablet**: Acesse `http://SEU-IP:3000` e faça login
3. Seus desenhos estarão sincronizados

### 4. Sair da Conta

1. Passe o mouse sobre o ícone de nuvem
2. Clique em **"Sair"**
3. Seus desenhos locais permanecem, mas param de sincronizar

## 🔧 API Endpoints

### POST /auth/register
Criar nova conta

**Request:**
```json
{
  "username": "joao123",
  "password": "senha123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "joao123",
    "createdAt": "2025-10-07T21:30:00.000Z"
  }
}
```

**Validações:**
- Username: mínimo 3 caracteres, convertido para lowercase
- Password: mínimo 6 caracteres
- Username deve ser único

### POST /auth/login
Fazer login

**Request:**
```json
{
  "username": "joao123",
  "password": "senha123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "joao123",
    "createdAt": "2025-10-07T21:30:00.000Z"
  }
}
```

### GET /auth/me
Obter informações do usuário autenticado

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "user": {
    "id": 1,
    "username": "joao123",
    "created_at": "2025-10-07T21:30:00.000Z"
  }
}
```

## 🗄️ Esquema do Banco de Dados

### Tabela `users`

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users(username);
```

**Campos:**
- `id`: ID auto-incrementado do usuário
- `username`: Nome de usuário único (lowercase)
- `password_hash`: Senha com hash bcrypt (salt rounds: 10)
- `created_at`: Data de criação da conta
- `updated_at`: Data de última atualização

### Relação com `local_sessions`

```sql
-- Antes: user_id era um ID aleatório
-- Agora: user_id é o username do usuário autenticado

SELECT * FROM local_sessions WHERE user_id = 'joao123';
```

## 🔒 Segurança

### Hashing de Senhas
- Algoritmo: **bcrypt**
- Salt rounds: **10**
- Senhas nunca são armazenadas em texto puro

```javascript
const passwordHash = await bcrypt.hash(password, 10);
const match = await bcrypt.compare(password, passwordHash);
```

### JSON Web Tokens (JWT)
- Algoritmo: **HS256**
- Expiração: **30 dias**
- Payload: `{ id, username }`

```javascript
const token = jwt.sign(
  { id: user.id, username: user.username },
  JWT_SECRET,
  { expiresIn: '30d' }
);
```

### Armazenamento do Token
- Armazenado em `localStorage` do navegador
- Chave: `excalidraw-auth-token`
- Enviado no header: `Authorization: Bearer <token>`

### Variáveis de Ambiente

**⚠️ IMPORTANTE para Produção:**

```bash
# .env
JWT_SECRET=$(openssl rand -base64 64)
```

No `docker-compose.yml`:
```yaml
postgres-api:
  environment:
    JWT_SECRET: ${JWT_SECRET}
```

## 🧪 Testes

### Teste 1: Criar Conta e Login

```bash
# Criar conta
curl -X POST http://localhost:4001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"teste123","password":"senha123"}'

# Login
curl -X POST http://localhost:4001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"teste123","password":"senha123"}'
```

### Teste 2: Verificar Token

```bash
# Salvar token
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Verificar usuário
curl -X GET http://localhost:4001/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### Teste 3: Sincronização Cross-Browser

**Script de teste:**

```bash
#!/bin/bash

# 1. Criar usuário
echo "1️⃣ Criando usuário..."
RESPONSE=$(curl -s -X POST http://localhost:4001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"sync-test","password":"test123"}')

TOKEN=$(echo $RESPONSE | jq -r '.token')
USERNAME=$(echo $RESPONSE | jq -r '.user.username')

echo "   Token: $TOKEN"
echo "   Username: $USERNAME"

# 2. Salvar dados como usuário autenticado
echo -e "\n2️⃣ Salvando desenho..."
curl -s -X PUT http://localhost:4001/local-sessions/$USERNAME \
  -H "Content-Type: application/json" \
  -d '{"elements":[{"type":"rectangle","id":"test","x":100,"y":100}],"appState":{"viewBackgroundColor":"#fff"}}'

# 3. Recuperar dados (simula outro navegador)
echo -e "\n3️⃣ Recuperando em outro navegador..."
DATA=$(curl -s http://localhost:4001/local-sessions/$USERNAME)

if echo "$DATA" | jq -e '.elements | length > 0' > /dev/null; then
  echo "   ✅ Dados sincronizados com sucesso!"
  echo "   Elementos encontrados: $(echo $DATA | jq '.elements | length')"
else
  echo "   ❌ Erro na sincronização"
fi

# 4. Verificar autenticação
echo -e "\n4️⃣ Verificando autenticação..."
AUTH_CHECK=$(curl -s http://localhost:4001/auth/me \
  -H "Authorization: Bearer $TOKEN")

if echo "$AUTH_CHECK" | jq -e '.user.username' > /dev/null; then
  echo "   ✅ Autenticação válida"
else
  echo "   ❌ Token inválido"
fi

echo -e "\n✨ Teste concluído!"
```

Salve como `test-auth.sh` e execute:
```bash
chmod +x test-auth.sh
./test-auth.sh
```

### Teste 4: Verificar no Banco

```bash
# Conectar ao PostgreSQL
docker exec -it excalidraw-db psql -U excalidraw -d excalidraw

# Ver usuários cadastrados
SELECT id, username, created_at FROM users;

# Ver sessões por usuário
SELECT user_id, created_at, updated_at 
FROM local_sessions 
WHERE user_id = 'teste123';

# Sair
\q
```

## 📊 Fluxo de Dados

```
┌─────────────────────────────────────────────────────────┐
│                  Fluxo de Autenticação                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Usuário cria conta/faz login                        │
│          ↓                                              │
│  2. API valida e gera JWT token                         │
│          ↓                                              │
│  3. Frontend salva token + username no localStorage     │
│          ↓                                              │
│  4. getUserId() retorna username (não mais ID aleatório)│
│          ↓                                              │
│  5. Desenhos salvos com user_id = username             │
│          ↓                                              │
│  6. Em outro navegador: login com mesmo username       │
│          ↓                                              │
│  7. Desenhos carregados automaticamente!               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## 🎨 Interface do Usuário

### Ícone de Nuvem (Save Indicator)

**Estados:**
- 🌥️ **Cinza**: Não autenticado
- 🌥️ **Verde**: Salvo (autenticado ou não)
- 🌥️ **Azul**: Salvando...
- 🌥️ **Vermelho**: Erro

**Tooltip (hover):**
```
Sem login:
┌─────────────────────────┐
│ Salvo com segurança     │
│ localStorage: ✓         │
│ PostgreSQL: ✓           │
│ Última atualização: 2s  │
│                         │
│ Seguro para fechar      │
│ [Entrar para sincronizar]│
└─────────────────────────┘

Com login:
┌─────────────────────────┐
│ Salvo com segurança     │
│ localStorage: ✓         │
│ PostgreSQL: ✓           │
│ Usuário: joao123        │
│ Última atualização: 2s  │
│                         │
│ Sincronizado em todos   │
│ os dispositivos         │
│ [Sair]                  │
└─────────────────────────┘
```

### Modal de Login/Registro

**Campos:**
- Username (mínimo 3 caracteres)
- Password (mínimo 6 caracteres)
- Confirmar Password (apenas no registro)

**Botões:**
- "Entrar" / "Criar Conta"
- "Não tem conta? Criar uma" / "Já tem conta? Entrar"

## 🐛 Troubleshooting

### Problema 1: "Token inválido"

```bash
# Verificar se JWT_SECRET está correto
docker exec excalidraw-postgres-api env | grep JWT_SECRET

# Limpar token local
localStorage.removeItem('excalidraw-auth-token')
```

### Problema 2: Dados não sincronizam

```bash
# 1. Verificar se está autenticado
curl http://localhost:4001/auth/me \
  -H "Authorization: Bearer SEU_TOKEN"

# 2. Verificar user_id no banco
docker exec -it excalidraw-db psql -U excalidraw -d excalidraw \
  -c "SELECT user_id FROM local_sessions;"

# 3. Verificar se getUserId() retorna username correto
# No console do navegador (F12):
console.log(localStorage.getItem('excalidraw-username'))
```

### Problema 3: "Username já existe"

Usernames são únicos e case-insensitive:
- "JoaoSilva" e "joaosilva" são o mesmo usuário
- Escolha outro username

### Problema 4: Senha incorreta

- Mínimo 6 caracteres
- Sem recuperação de senha (implementar futuramente)
- Crie uma nova conta se esqueceu

## 🔜 Próximos Passos

### Melhorias Futuras

1. **Recuperação de Senha**
   - Endpoint `/auth/forgot-password`
   - Envio de email com token de reset

2. **Perfil do Usuário**
   - Avatar
   - Email
   - Preferências

3. **Histórico de Versões**
   - Salvar versões anteriores dos desenhos
   - Permitir restaurar versões antigas

4. **Compartilhamento**
   - Compartilhar desenho com outros usuários
   - Permissões (visualizar/editar)

5. **2FA (Two-Factor Authentication)**
   - Autenticação em duas etapas
   - Códigos TOTP

## 📚 Arquivos Relacionados

```
excalidraw/
├── postgres-api/
│   ├── server.js                    # Endpoints /auth/*
│   └── package.json                 # bcrypt, jsonwebtoken
├── excalidraw-app/
│   ├── components/
│   │   ├── AuthDialog.tsx          # Modal de login/registro
│   │   ├── AuthDialog.scss         # Estilos do modal
│   │   ├── SaveIndicator.tsx       # Ícone com botões auth
│   │   └── SaveIndicator.scss      # Estilos do indicador
│   ├── data/
│   │   ├── AuthService.ts          # Gerenciamento de token
│   │   └── PostgresLocalStorage.ts # getUserId() atualizado
│   └── App.tsx                      # Integração dos componentes
└── SETUP_COMPLETO.md                # Documentação geral
```

---

**Última atualização**: Outubro 2025
**Versão**: 1.0.0
