# Guia de Uso do PostgreSQL no Excalidraw

## Como o PostgreSQL funciona no Excalidraw

O Excalidraw usa o PostgreSQL para **armazenamento remoto em salas de colaboração**. Os dados são salvos automaticamente, não através de um botão de "Salvar" tradicional.

## Como salvar desenhos no PostgreSQL

### 1. Iniciar uma sessão de colaboração

1. Abra o Excalidraw em: http://localhost:3000
2. Crie um desenho
3. Clique no botão **"Live collaboration"** (ícone de pessoas) no canto superior direito
4. Uma janela modal será aberta com:
   - Link da sala colaborativa
   - QR Code para compartilhar

### 2. O que acontece automaticamente

- O Excalidraw gera um `roomId` e `roomKey` únicos
- Os elementos do desenho são **criptografados** usando o `roomKey`
- Os dados criptografados são salvos no PostgreSQL
- Qualquer mudança no desenho é **salva automaticamente** no PostgreSQL
- Outros usuários com o link podem colaborar em tempo real

### 3. Verificar se os dados foram salvos

```bash
# Ver todas as cenas salvas
docker exec excalidraw-db psql -U postgres -d postgres -c "SELECT id, scene_version, created_at, updated_at FROM scenes;"

# Ver arquivos salvos
docker exec excalidraw-db psql -U postgres -d postgres -c "SELECT id, prefix, created_at FROM files;"

# Contar registros
docker exec excalidraw-db psql -U postgres -d postgres -c "SELECT COUNT(*) as total_scenes FROM scenes; SELECT COUNT(*) as total_files FROM files;"
```

### 4. Carregar um desenho salvo

1. Copie o link da sala colaborativa (começa com `http://localhost:3000/#room=...`)
2. Abra esse link em uma nova aba ou janela
3. O desenho será **carregado automaticamente do PostgreSQL**

## Estrutura do Banco de Dados

### Tabela `scenes`
```sql
- id TEXT PRIMARY KEY           -- ID da sala (roomId)
- scene_version INTEGER         -- Versão da cena para reconciliação
- ciphertext TEXT              -- Elementos criptografados (JSON)
- iv TEXT                      -- Vetor de inicialização para descriptografia
- created_at TIMESTAMPTZ       -- Data de criação
- updated_at TIMESTAMPTZ       -- Data da última atualização
```

### Tabela `files`
```sql
- id TEXT                      -- ID do arquivo (FileId)
- prefix TEXT                  -- Prefixo da sala (rooms/{roomId})
- payload TEXT                 -- Arquivo comprimido e criptografado (base64)
- metadata JSONB               -- Metadados do arquivo
- created_at TIMESTAMPTZ       -- Data de criação
- updated_at TIMESTAMPTZ       -- Data da última atualização
- PRIMARY KEY (id, prefix)
```

## Diferença entre Local Storage e PostgreSQL

| Recurso | Local Storage | PostgreSQL |
|---------|---------------|------------|
| **Escopo** | Apenas navegador local | Compartilhado entre usuários |
| **Uso** | Desenhos individuais | Salas de colaboração |
| **Persistência** | Dados do navegador | Banco de dados remoto |
| **Sincronização** | Não sincroniza | Sincroniza em tempo real |
| **Botão para salvar** | Salvamento automático | Salvamento automático (colaboração) |

## Fluxo de Salvamento

```
1. Usuário cria/edita desenho
   ↓
2. Inicia colaboração (Live collaboration)
   ↓
3. Sistema gera roomId + roomKey
   ↓
4. Elementos são criptografados com roomKey
   ↓
5. Dados criptografados salvos no PostgreSQL
   ↓
6. Qualquer mudança → salvamento automático
```

## Comandos Úteis

### Verificar serviços
```bash
docker-compose ps
```

### Ver logs da API
```bash
docker logs excalidraw-postgres-api --tail 50 -f
```

### Acessar console do PostgreSQL
```bash
docker exec -it excalidraw-db psql -U postgres -d postgres
```

### Limpar todas as cenas
```bash
docker exec excalidraw-db psql -U postgres -d postgres -c "TRUNCATE scenes, files;"
```

### Backup do banco de dados
```bash
docker exec excalidraw-db pg_dump -U postgres postgres > backup.sql
```

### Restaurar backup
```bash
cat backup.sql | docker exec -i excalidraw-db psql -U postgres postgres
```

## Solução de Problemas

### Os dados não estão sendo salvos
1. Verifique se você iniciou a colaboração (botão "Live collaboration")
2. Verifique os logs da API: `docker logs excalidraw-postgres-api`
3. Teste se a API está respondendo: `curl http://localhost:4001/health`

### Erro de conexão com o banco
```bash
# Reiniciar os serviços
docker-compose restart

# Recriar tudo do zero
docker-compose down -v
docker-compose up -d
```

### Ver detalhes de uma cena específica
```sql
-- Copie o roomId do link (parte após #room=)
SELECT 
  id,
  scene_version,
  LENGTH(ciphertext) as data_size,
  created_at,
  updated_at
FROM scenes 
WHERE id = 'SEU_ROOM_ID';
```

## Arquitetura da Solução

```
┌─────────────┐
│  Navegador  │ ← http://localhost:3000
└──────┬──────┘
       │
       ↓ (colaboração)
┌─────────────┐
│ Excalidraw  │ ← Container nginx (porta 3000)
│     App     │
└──────┬──────┘
       │
       ↓ (API REST)
┌─────────────┐
│ Postgres    │ ← Container Node.js (porta 4001)
│     API     │
└──────┬──────┘
       │
       ↓ (SQL)
┌─────────────┐
│ PostgreSQL  │ ← Container postgres (porta 5432)
│     DB      │
└─────────────┘
```

## Segurança

- ✅ Dados são **criptografados** antes de serem salvos
- ✅ A chave de criptografia (`roomKey`) está no **link da sala** (não no servidor)
- ✅ Sem a chave, os dados no banco são **ilegíveis**
- ⚠️ **Importante**: Quem tem o link completo tem acesso aos dados

## Próximos Passos

1. ✅ PostgreSQL configurado e funcionando
2. ✅ API REST para salvar/carregar dados
3. ✅ Excalidraw integrado com PostgreSQL
4. 🔄 Teste criar uma sala e compartilhar o link
5. 🔄 Verifique os dados sendo salvos no banco
