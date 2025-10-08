#!/bin/bash
# Script de teste para verificar salvamento de sessões locais no PostgreSQL

echo "=== Teste de Salvamento Local no PostgreSQL ==="
echo ""

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}1. Verificando se o PostgreSQL está acessível...${NC}"
docker exec excalidraw-db pg_isready -U postgres
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ PostgreSQL está rodando${NC}"
else
    echo "✗ PostgreSQL não está acessível"
    exit 1
fi

echo ""
echo -e "${YELLOW}2. Verificando se a API está respondendo...${NC}"
response=$(docker exec excalidraw-postgres-api wget -qO- http://localhost:4001/health 2>&1)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ API está respondendo: $response${NC}"
else
    echo "✗ API não está respondendo"
    exit 1
fi

echo ""
echo -e "${YELLOW}3. Verificando tabelas no banco de dados...${NC}"
docker exec excalidraw-db psql -U postgres -d postgres -c "\dt" | grep local_sessions > /dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Tabela local_sessions existe${NC}"
else
    echo "✗ Tabela local_sessions não encontrada"
    exit 1
fi

echo ""
echo -e "${YELLOW}4. Testando salvamento de sessão local...${NC}"
# Criar um usuário de teste
USER_ID="test-user-$(date +%s)"
echo "User ID de teste: $USER_ID"

# Dados de teste
ELEMENTS='[{"type":"rectangle","x":100,"y":100,"width":200,"height":150}]'
APP_STATE='{"viewBackgroundColor":"#ffffff","currentItemFontFamily":1}'

# Salvar via API
response=$(curl -s -w "\n%{http_code}" -X PUT "http://localhost:4001/local-sessions/$USER_ID" \
  -H "Content-Type: application/json" \
  -d "{\"elements\":$ELEMENTS,\"appState\":$APP_STATE}")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✓ Sessão salva com sucesso${NC}"
else
    echo "✗ Erro ao salvar sessão (HTTP $http_code)"
    echo "Response: $body"
    exit 1
fi

echo ""
echo -e "${YELLOW}5. Verificando dados no banco...${NC}"
docker exec excalidraw-db psql -U postgres -d postgres -c "SELECT user_id, LENGTH(elements) as elements_size, LENGTH(app_state) as appstate_size, created_at FROM local_sessions WHERE user_id = '$USER_ID';"

echo ""
echo -e "${YELLOW}6. Testando recuperação de sessão local...${NC}"
response=$(curl -s -w "\n%{http_code}" "http://localhost:4001/local-sessions/$USER_ID")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✓ Sessão recuperada com sucesso${NC}"
    echo "Dados recuperados:"
    echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
else
    echo "✗ Erro ao recuperar sessão (HTTP $http_code)"
    exit 1
fi

echo ""
echo -e "${YELLOW}7. Limpando dados de teste...${NC}"
docker exec excalidraw-db psql -U postgres -d postgres -c "DELETE FROM local_sessions WHERE user_id = '$USER_ID';" > /dev/null
echo -e "${GREEN}✓ Dados de teste removidos${NC}"

echo ""
echo -e "${GREEN}=== Teste concluído com sucesso! ===${NC}"
echo ""
echo "Resumo da funcionalidade:"
echo "1. ✓ Sessões locais são salvas automaticamente no PostgreSQL"
echo "2. ✓ Dados são armazenados de forma persistente"
echo "3. ✓ Sessões podem ser recuperadas mesmo após fechar o navegador"
echo ""
echo "Para visualizar todas as sessões locais salvas:"
echo "  docker exec excalidraw-db psql -U postgres -d postgres -c \"SELECT user_id, created_at, updated_at FROM local_sessions;\""
echo ""
echo "Para limpar todas as sessões locais:"
echo "  docker exec excalidraw-db psql -U postgres -d postgres -c \"TRUNCATE local_sessions;\""
