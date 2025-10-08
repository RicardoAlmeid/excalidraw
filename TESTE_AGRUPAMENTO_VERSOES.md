# 🧪 Teste de Agrupamento de Versões por Diagrama

## 🎯 Objetivo

Verificar que as versões são agrupadas corretamente por diagrama (`session_id`) e que o histórico mostra apenas versões do diagrama atual.

---

## 📋 Preparação

### 1. Limpar versões antigas (opcional)
```bash
docker exec excalidraw-db psql -U postgres -d postgres -c "TRUNCATE session_versions;"
```

### 2. Verificar estado inicial
```bash
docker exec excalidraw-db psql -U postgres -d postgres -c \
  "SELECT id, user_id, session_id, version_number, is_auto_save, created_at FROM session_versions ORDER BY created_at DESC LIMIT 10;"
```

---

## 🧪 Teste 1: Criar Diagrama A com Versões

### Passo 1: Abrir novo diagrama
1. Abra http://localhost:3000
2. Faça login (se ainda não estiver logado)
3. **Console (F12)**: Anote o `session_id`
   ```javascript
   sessionStorage.getItem('excalidraw-session-id')
   // Exemplo: "session-1759942296323-7biy66ahq"
   ```

### Passo 2: Desenhar e criar versão
1. Desenhe 3 elementos (retângulo, círculo, seta)
2. Aguarde 2 segundos (auto-save da sessão principal)
3. Clique no indicador de salvamento → "Versões"
4. Clique no botão **"📚 Todas as versões"**
5. Se houver versões antigas sem session_id:
   - Clique em **"🔄 Migrar versões antigas"**
   - Confirme a migração
   - Versões antigas agora têm o session_id atual

### Passo 3: Criar mais versões no Diagrama A
1. Feche o modal de versões
2. Adicione 2 elementos (linha, texto)
3. Aguarde 2 segundos
4. Abra "Versões" novamente
5. Clique em "Restaurar" em uma versão anterior
   - Isso cria um backup da versão atual (versão 2)
6. Agora você tem pelo menos 2 versões do Diagrama A

### Passo 4: Verificar no banco
```bash
docker exec excalidraw-db psql -U postgres -d postgres -c \
  "SELECT id, session_id, version_number, element_count, is_auto_save, created_at 
   FROM session_versions 
   WHERE session_id = 'session-1759942296323-7biy66ahq' 
   ORDER BY version_number;"
```

**Resultado Esperado:**
```
 id |           session_id            | version_number | element_count | is_auto_save |          created_at           
----+---------------------------------+----------------+---------------+--------------+-------------------------------
 24 | session-1759942296323-7biy66ahq |              1 | f             |            3 | 2025-10-08 17:30:00.000000+00
 25 | session-1759942296323-7biy66ahq |              2 | f             |            5 | 2025-10-08 17:31:00.000000+00
```

---

## 🧪 Teste 2: Criar Diagrama B em Nova Aba

### Passo 1: Abrir nova aba/janela
1. Abra uma **nova aba** do navegador
2. Acesse http://localhost:3000
3. **Console (F12)**: Verifique o novo `session_id`
   ```javascript
   sessionStorage.getItem('excalidraw-session-id')
   // Deve ser DIFERENTE: "session-1759943456789-xyz123"
   ```

### Passo 2: Desenhar Diagrama B
1. Desenhe 4 elementos diferentes (diamante, estrela, nuvem, flecha)
2. Aguarde 2 segundos

### Passo 3: Criar versão do Diagrama B
1. Adicione mais 2 elementos
2. Abra "Versões"
3. Deve ver **apenas as versões do Diagrama B**
4. Clique em "Restaurar" para criar mais uma versão

### Passo 4: Verificar no banco - Diagrama B
```bash
docker exec excalidraw-db psql -U postgres -d postgres -c \
  "SELECT id, session_id, version_number, element_count, is_auto_save, created_at 
   FROM session_versions 
   WHERE session_id LIKE 'session-1759943%'
   ORDER BY version_number;"
```

**Resultado Esperado:**
```
 id |           session_id            | version_number | element_count | is_auto_save |          created_at           
----+---------------------------------+----------------+---------------+--------------+-------------------------------
 26 | session-1759943456789-xyz123    |              1 | f             |            4 | 2025-10-08 17:35:00.000000+00
 27 | session-1759943456789-xyz123    |              2 | f             |            6 | 2025-10-08 17:36:00.000000+00
```

---

## 🧪 Teste 3: Verificar Isolamento entre Diagramas

### Passo 1: Voltar para Aba do Diagrama A
1. Clique na aba do Diagrama A
2. Abra "Versões"
3. Deve ver **apenas 2 versões** (do Diagrama A)
4. **NÃO** deve ver as versões do Diagrama B

### Passo 2: Voltar para Aba do Diagrama B
1. Clique na aba do Diagrama B
2. Abra "Versões"
3. Deve ver **apenas 2 versões** (do Diagrama B)
4. **NÃO** deve ver as versões do Diagrama A

### Passo 3: Verificar com "Todas as versões"
1. Em qualquer aba, abra "Versões"
2. Clique no botão **"📚 Todas as versões"**
3. Agora deve ver **todas as 4 versões** (2 do A + 2 do B)
4. Cada versão mostra seu próprio `version_number` (começa do 1 em cada diagrama)

### Passo 4: Verificar numeração independente
```bash
docker exec excalidraw-db psql -U postgres -d postgres -c \
  "SELECT session_id, version_number, element_count, created_at 
   FROM session_versions 
   ORDER BY session_id, version_number;"
```

**Resultado Esperado:**
```
           session_id            | version_number | element_count |          created_at           
---------------------------------+----------------+---------------+-------------------------------
 session-1759942296323-7biy66ahq |              1 |             3 | 2025-10-08 17:30:00.000000+00
 session-1759942296323-7biy66ahq |              2 |             5 | 2025-10-08 17:31:00.000000+00
 session-1759943456789-xyz123    |              1 |             4 | 2025-10-08 17:35:00.000000+00
 session-1759943456789-xyz123    |              2 |             6 | 2025-10-08 17:36:00.000000+00
```

✅ **Cada diagrama tem numeração independente começando do 1!**

---

## 🧪 Teste 4: Auto-Save Mantém session_id

### Passo 1: Aguardar auto-save (10 minutos ou modificar código para 10 segundos)
Para testar rapidamente, modifique temporariamente:

**excalidraw-app/App.tsx** (linha ~607):
```typescript
}, 10 * 1000);  // 10 segundos para teste
```

### Passo 2: Fazer login e desenhar
1. Faça login
2. Desenhe algo
3. Aguarde 10 segundos

### Passo 3: Verificar auto-save no console
```
[AutoSave] Timer iniciado - salvando versão a cada 10 minutos
[AutoSave] Versão automática salva com sucesso
```

### Passo 4: Verificar no banco
```bash
docker exec excalidraw-db psql -U postgres -d postgres -c \
  "SELECT id, session_id, version_number, is_auto_save, created_at 
   FROM session_versions 
   WHERE is_auto_save = true 
   ORDER BY created_at DESC LIMIT 5;"
```

**Resultado Esperado:**
- `is_auto_save = true` ✅
- `session_id` preenchido ✅
- `version_number` incrementa corretamente ✅

---

## 🧪 Teste 5: Migração de Versões Antigas

### Cenário: Versões criadas antes da implementação do session_id

### Passo 1: Verificar versões sem session_id
```bash
docker exec excalidraw-db psql -U postgres -d postgres -c \
  "SELECT id, user_id, session_id, version_number, created_at 
   FROM session_versions 
   WHERE session_id IS NULL OR session_id = '' 
   ORDER BY created_at DESC;"
```

### Passo 2: Migrar versões antigas
1. Abra http://localhost:3000
2. Faça login
3. Abra "Versões"
4. Clique em **"📚 Todas as versões"** (para ver todas)
5. Se houver versões sem session_id, aparecem como "legacy"
6. Volte para **"📋 Apenas este diagrama"**
7. Clique em **"🔄 Migrar versões antigas"**
8. Confirme: "Deseja associar todas as versões antigas ao diagrama atual?"
9. Alert aparece: "X versões antigas foram associadas ao diagrama atual"

### Passo 3: Verificar migração
```bash
docker exec excalidraw-db psql -U postgres -d postgres -c \
  "SELECT id, user_id, session_id, version_number, created_at 
   FROM session_versions 
   WHERE session_id IS NULL OR session_id = '' 
   ORDER BY created_at DESC;"
```

**Resultado Esperado:**
- Nenhuma versão com `session_id` vazio ✅
- Todas agora têm o `session_id` do diagrama atual ✅

---

## 📊 Comandos de Monitoramento

### Ver todas as versões agrupadas por diagrama
```bash
docker exec excalidraw-db psql -U postgres -d postgres -c \
  "SELECT session_id, COUNT(*) as total_versoes, MIN(created_at) as primeira, MAX(created_at) as ultima 
   FROM session_versions 
   GROUP BY session_id 
   ORDER BY primeira DESC;"
```

### Ver diagramas únicos
```bash
docker exec excalidraw-db psql -U postgres -d postgres -c \
  "SELECT DISTINCT session_id, 
   (SELECT COUNT(*) FROM session_versions sv2 WHERE sv2.session_id = sv1.session_id) as versoes 
   FROM session_versions sv1 
   ORDER BY session_id;"
```

### Ver versões de um usuário específico
```bash
docker exec excalidraw-db psql -U postgres -d postgres -c \
  "SELECT session_id, version_number, is_auto_save, element_count, created_at 
   FROM session_versions 
   WHERE user_id = 'ricardo' 
   ORDER BY session_id, version_number;"
```

---

## ✅ Checklist de Verificação

**Agrupamento por Diagrama:**
- [ ] Cada aba do navegador gera um `session_id` único
- [ ] Versões do Diagrama A não aparecem no histórico do Diagrama B
- [ ] Versões do Diagrama B não aparecem no histórico do Diagrama A
- [ ] Botão "Todas as versões" mostra versões de todos os diagramas
- [ ] Botão "Apenas este diagrama" filtra pelo diagrama atual

**Numeração de Versões:**
- [ ] Cada diagrama tem numeração independente (começa do 1)
- [ ] version_number incrementa corretamente (1, 2, 3, 4...)
- [ ] Auto-save mantém numeração sequencial
- [ ] Restaurar versão cria novo número de versão

**Migração de Versões Antigas:**
- [ ] Botão "Migrar versões antigas" aparece quando necessário
- [ ] Migração associa versões antigas ao diagrama atual
- [ ] Após migração, versões antigas aparecem no histórico
- [ ] Nenhuma versão fica com session_id vazio

**Auto-Save:**
- [ ] Auto-save inclui session_id correto
- [ ] Flag `is_auto_save = true` está correta
- [ ] Auto-save não cria novo diagrama (usa o atual)

**Console Logs:**
- [ ] `[VersionHistory] Carregando versões para session_id: ...`
- [ ] `[VersionHistory] Versões carregadas: X`
- [ ] `[AutoSave] Timer iniciado - salvando versão a cada 10 minutos`
- [ ] `[listSessionVersions] URL: ...`
- [ ] `[listSessionVersions] Dados recebidos: X versões`

---

## 🎯 Resultado Final Esperado

### ✅ Sistema Funcionando Corretamente:

1. **Isolamento Perfeito**: Cada diagrama (aba do navegador) tem suas próprias versões
2. **Numeração Independente**: Cada diagrama começa a numeração do 1
3. **Histórico Filtrado**: Por padrão, mostra apenas versões do diagrama atual
4. **Visão Global**: Botão "Todas as versões" permite ver todos os diagramas
5. **Migração Fácil**: Versões antigas podem ser associadas ao diagrama atual
6. **Auto-Save Inteligente**: Mantém o session_id do diagrama sendo editado

### 📈 Exemplo de Uso Real:

**Cenário:**
- Designer trabalha em 3 projetos simultaneamente (3 abas abertas)
- Projeto A: Logo da empresa (10 versões)
- Projeto B: Fluxograma de processo (8 versões)
- Projeto C: Mockup de interface (12 versões)

**Comportamento:**
- Aba A mostra apenas 10 versões do logo
- Aba B mostra apenas 8 versões do fluxograma
- Aba C mostra apenas 12 versões do mockup
- Total no banco: 30 versões, perfeitamente organizadas por projeto

---

## 🚨 Troubleshooting

### Problema: "Versões de outros diagramas aparecem no histórico"

**Causa:** Filtro por session_id não está funcionando

**Verificar:**
```javascript
// Console do navegador
sessionStorage.getItem('excalidraw-session-id')
```

**Solução:**
1. Limpar sessionStorage: `sessionStorage.clear()`
2. Recarregar página (F5)
3. Novo session_id será gerado

---

### Problema: "Botão 'Migrar versões antigas' não aparece"

**Causa:** Não há versões sem session_id OU está em modo "Todas as versões"

**Verificar:**
```bash
docker exec excalidraw-db psql -U postgres -d postgres -c \
  "SELECT COUNT(*) FROM session_versions WHERE session_id IS NULL OR session_id = '';"
```

**Solução:**
- Se retornar 0: Não há versões antigas para migrar ✅
- Botão só aparece em modo "Apenas este diagrama"

---

### Problema: "Numeração de versões está errada"

**Causa:** Versões de diagramas diferentes sendo misturadas

**Verificar:**
```bash
docker exec excalidraw-db psql -U postgres -d postgres -c \
  "SELECT session_id, array_agg(version_number ORDER BY version_number) as numeros 
   FROM session_versions 
   GROUP BY session_id;"
```

**Resultado Esperado:**
```
           session_id            |   numeros   
---------------------------------+-------------
 session-1759942296323-7biy66ahq | {1,2,3,4}
 session-1759943456789-xyz123    | {1,2,3}
```

---

## 📝 Conclusão

Sistema de agrupamento por diagrama implementado com sucesso! Cada diagrama mantém suas próprias versões independentes, permitindo:

✅ Trabalhar em múltiplos projetos simultaneamente  
✅ Histórico limpo e organizado por projeto  
✅ Migração fácil de versões antigas  
✅ Auto-save mantém contexto do diagrama  
✅ Visualização global quando necessário  

**Documentado em:** 08/10/2025  
**Status:** ✅ Produção Ready
