const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 4001;

// Segredo para JWT (em produção, use variável de ambiente)
const JWT_SECRET = process.env.JWT_SECRET || 'excalidraw-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Configuração do multer para upload de arquivos
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 4 * 1024 * 1024 } }); // 4MB

// Configuração do PostgreSQL
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'postgres',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
});

// Inicializar tabelas
async function initTables() {
  try {
    // Criar tabela de cenas se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scenes (
        id TEXT PRIMARY KEY,
        scene_version INTEGER NOT NULL,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Criar tabela de arquivos se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT NOT NULL,
        prefix TEXT NOT NULL,
        payload TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id, prefix)
      )
    `);

    // Criar tabela de sessões locais se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS local_sessions (
        user_id TEXT PRIMARY KEY,
        elements TEXT NOT NULL,
        app_state TEXT NOT NULL,
        files JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Adicionar coluna diagram_name na local_sessions se não existir
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'local_sessions' AND column_name = 'diagram_name'
        ) THEN
          ALTER TABLE local_sessions ADD COLUMN diagram_name VARCHAR(255);
        END IF;
      END $$;
    `);

    // Criar tabela de usuários se não existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Criar tabela de versões de sessões locais
    await pool.query(`
      CREATE TABLE IF NOT EXISTS session_versions (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        elements TEXT NOT NULL,
        app_state TEXT NOT NULL,
        files JSONB DEFAULT '{}'::jsonb,
        version_number INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Adicionar colunas session_id, is_auto_save, diagram_name e version_note se não existirem (migration para instâncias existentes)
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'session_versions' AND column_name = 'session_id'
        ) THEN
          ALTER TABLE session_versions ADD COLUMN session_id TEXT;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'session_versions' AND column_name = 'is_auto_save'
        ) THEN
          ALTER TABLE session_versions ADD COLUMN is_auto_save BOOLEAN DEFAULT FALSE;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'session_versions' AND column_name = 'diagram_name'
        ) THEN
          ALTER TABLE session_versions ADD COLUMN diagram_name VARCHAR(255) DEFAULT NULL;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'session_versions' AND column_name = 'version_note'
        ) THEN
          ALTER TABLE session_versions ADD COLUMN version_note TEXT DEFAULT NULL;
        END IF;
      END $$;
    `);

    // Criar índices
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_scenes_updated_at ON scenes(updated_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_files_prefix ON files(prefix)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_local_sessions_updated_at ON local_sessions(updated_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_session_versions_user_id ON session_versions(user_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_session_versions_session_id ON session_versions(session_id, created_at DESC)`);

    // Criar tabela de sessões ativas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS active_sessions (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        diagram_name VARCHAR(255),
        browser_session_id TEXT NOT NULL UNIQUE,
        last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Adicionar coluna diagram_name se não existir
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'active_sessions' AND column_name = 'diagram_name'
        ) THEN
          ALTER TABLE active_sessions ADD COLUMN diagram_name VARCHAR(255);
        END IF;
      END $$;
    `);

    // Remover constraint antiga e criar nova baseada apenas em user_id
    await pool.query(`
      DO $$ 
      BEGIN
        -- Remover constraint antiga se existir
        IF EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'active_sessions_user_id_session_id_key'
        ) THEN
          ALTER TABLE active_sessions DROP CONSTRAINT active_sessions_user_id_session_id_key;
        END IF;
        
        -- Remover constraint de diagram_name se existir
        IF EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'active_sessions_user_id_diagram_name_key'
        ) THEN
          ALTER TABLE active_sessions DROP CONSTRAINT active_sessions_user_id_diagram_name_key;
        END IF;
        
        -- Criar constraint baseada apenas em user_id (uma sessão ativa por usuário)
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'active_sessions_user_id_key'
        ) THEN
          ALTER TABLE active_sessions ADD CONSTRAINT active_sessions_user_id_key 
          UNIQUE(user_id);
        END IF;
      END $$;
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_active_sessions_user_session ON active_sessions(user_id, session_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_active_sessions_user_diagram ON active_sessions(user_id, diagram_name)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_active_sessions_heartbeat ON active_sessions(last_heartbeat)`);

    console.log('Tabelas inicializadas com sucesso');
  } catch (error) {
    console.error('Erro ao inicializar tabelas:', error);
  }
}

// Rotas para cenas

// PUT /scenes/:roomId - Salvar cena
app.put('/scenes/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { sceneVersion, ciphertext, iv } = req.body;

    if (!sceneVersion || !ciphertext || !iv) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const result = await pool.query(`
      INSERT INTO scenes (id, scene_version, ciphertext, iv, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (id) DO UPDATE SET
        scene_version = EXCLUDED.scene_version,
        ciphertext = EXCLUDED.ciphertext,
        iv = EXCLUDED.iv,
        updated_at = NOW()
      RETURNING *
    `, [roomId, sceneVersion, ciphertext, iv]);

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao salvar cena:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// GET /scenes/:roomId - Carregar cena
app.get('/scenes/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;

    const result = await pool.query(`
      SELECT scene_version, ciphertext, iv
      FROM scenes
      WHERE id = $1
    `, [roomId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cena não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao carregar cena:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rotas para sessões locais

// PUT /local-sessions/:userId - Salvar sessão local
app.put('/local-sessions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { elements, appState, files, diagramName } = req.body;

    if (!elements || !appState) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const result = await pool.query(`
      INSERT INTO local_sessions (user_id, elements, app_state, files, diagram_name, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        elements = EXCLUDED.elements,
        app_state = EXCLUDED.app_state,
        files = EXCLUDED.files,
        diagram_name = EXCLUDED.diagram_name,
        updated_at = NOW()
      RETURNING *
    `, [
      userId, 
      JSON.stringify(elements), 
      JSON.stringify(appState),
      JSON.stringify(files || {}),
      diagramName || null
    ]);

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao salvar sessão local:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// GET /local-sessions/:userId - Carregar sessão local
app.get('/local-sessions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(`
      SELECT 
        ls.elements, 
        ls.app_state, 
        ls.files, 
        COALESCE(
          ls.diagram_name,
          (
            SELECT diagram_name 
            FROM session_versions 
            WHERE user_id = ls.user_id 
            AND diagram_name IS NOT NULL 
            ORDER BY created_at DESC 
            LIMIT 1
          )
        ) as diagram_name
      FROM local_sessions ls
      WHERE ls.user_id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    const session = result.rows[0];
    res.json({
      elements: JSON.parse(session.elements),
      appState: JSON.parse(session.app_state),
      files: session.files || {},
      diagramName: session.diagram_name,
    });
  } catch (error) {
    console.error('Erro ao carregar sessão local:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /local-sessions/:userId/versions - Salvar versão da sessão
app.post('/local-sessions/:userId/versions', async (req, res) => {
  try {
    const { userId } = req.params;
    const { elements, appState, files, sessionId, isAutoSave = false, diagramName = null, versionNote = null } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId é obrigatório' });
    }

    // Obter o próximo número de versão para esta sessão específica
    const versionResult = await pool.query(`
      SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
      FROM session_versions
      WHERE user_id = $1 AND session_id = $2
    `, [userId, sessionId]);

    const versionNumber = versionResult.rows[0].next_version;

    // Salvar a versão
    const result = await pool.query(`
      INSERT INTO session_versions (user_id, session_id, elements, app_state, files, version_number, is_auto_save, diagram_name, version_note)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, version_number, created_at, is_auto_save, diagram_name, version_note
    `, [
      userId,
      sessionId,
      JSON.stringify(elements),
      JSON.stringify(appState),
      JSON.stringify(files || {}),
      versionNumber,
      isAutoSave,
      diagramName,
      versionNote
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao salvar versão:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// GET /local-sessions/:userId/versions - Listar versões
app.get('/local-sessions/:userId/versions', async (req, res) => {
  try {
    const { userId } = req.params;
    const { sessionId } = req.query;

    let query, params;
    
    if (sessionId) {
      // Filtrar por sessão específica
      query = `
        SELECT 
          id, 
          session_id,
          version_number, 
          is_auto_save,
          diagram_name,
          version_note,
          created_at,
          (SELECT COUNT(*) FROM json_array_elements(elements::json)) as element_count
        FROM session_versions
        WHERE user_id = $1 AND session_id = $2
        ORDER BY created_at DESC
        LIMIT 50
      `;
      params = [userId, sessionId];
    } else {
      // Listar todas as versões do usuário
      query = `
        SELECT 
          id, 
          session_id,
          version_number, 
          is_auto_save,
          diagram_name,
          version_note,
          created_at,
          (SELECT COUNT(*) FROM json_array_elements(elements::json)) as element_count
        FROM session_versions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `;
      params = [userId];
    }

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao listar versões:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// PUT /local-sessions/:userId/diagram-name - Atualizar nome do diagrama para todas as versões da sessão
app.put('/local-sessions/:userId/diagram-name', async (req, res) => {
  try {
    const { userId } = req.params;
    const { sessionId, diagramName } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId é obrigatório' });
    }

    // Atualizar todas as versões desta sessão com o novo nome
    const result = await pool.query(`
      UPDATE session_versions
      SET diagram_name = $3
      WHERE user_id = $1 AND session_id = $2
      RETURNING id
    `, [userId, sessionId, diagramName || null]);

    res.status(200).json({ 
      success: true, 
      updated: result.rowCount,
      diagramName: diagramName || null
    });
  } catch (error) {
    console.error('Erro ao atualizar nome do diagrama:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// GET /local-sessions/:userId/diagram-name - Obter nome do diagrama da sessão
app.get('/local-sessions/:userId/diagram-name', async (req, res) => {
  try {
    const { userId } = req.params;
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId é obrigatório' });
    }

    // Buscar o nome do diagrama da última versão dessa sessão
    const result = await pool.query(`
      SELECT diagram_name
      FROM session_versions
      WHERE user_id = $1 AND session_id = $2
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId, sessionId]);

    const diagramName = result.rows.length > 0 ? result.rows[0].diagram_name : null;

    res.status(200).json({ 
      diagramName: diagramName
    });
  } catch (error) {
    console.error('Erro ao obter nome do diagrama:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// GET /local-sessions/:userId/versions/:versionId - Recuperar versão específica
app.get('/local-sessions/:userId/versions/:versionId', async (req, res) => {
  try {
    const { userId, versionId } = req.params;

    const result = await pool.query(`
      SELECT elements, app_state, files, version_number, created_at, diagram_name, version_note, session_id
      FROM session_versions
      WHERE user_id = $1 AND id = $2
    `, [userId, versionId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Versão não encontrada' });
    }

    const version = result.rows[0];
    res.json({
      elements: JSON.parse(version.elements),
      appState: JSON.parse(version.app_state),
      files: version.files || {},
      versionNumber: version.version_number,
      createdAt: version.created_at,
      diagramName: version.diagram_name,
      versionNote: version.version_note,
      sessionId: version.session_id,
    });
  } catch (error) {
    console.error('Erro ao recuperar versão:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// DELETE /local-sessions/:userId/versions/:versionId - Excluir versão específica
app.delete('/local-sessions/:userId/versions/:versionId', async (req, res) => {
  try {
    const { userId, versionId } = req.params;

    // Verificar se a versão existe e pertence ao usuário
    const checkResult = await pool.query(`
      SELECT id FROM session_versions
      WHERE user_id = $1 AND id = $2
    `, [userId, versionId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Versão não encontrada' });
    }

    // Excluir a versão
    await pool.query(`
      DELETE FROM session_versions
      WHERE user_id = $1 AND id = $2
    `, [userId, versionId]);

    console.log(`Versão ${versionId} excluída para usuário ${userId}`);
    res.json({ success: true, id: versionId });
  } catch (error) {
    console.error('Erro ao excluir versão:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// DELETE /local-sessions/:userId/versions - Excluir todas as versões (opcionalmente filtradas por sessionId)
app.delete('/local-sessions/:userId/versions', async (req, res) => {
  try {
    const { userId } = req.params;
    const { sessionId } = req.query;

    let query, params;

    if (sessionId) {
      // Excluir apenas versões do diagrama específico
      query = `
        DELETE FROM session_versions
        WHERE user_id = $1 AND session_id = $2
        RETURNING id
      `;
      params = [userId, sessionId];
    } else {
      // Excluir todas as versões do usuário
      query = `
        DELETE FROM session_versions
        WHERE user_id = $1
        RETURNING id
      `;
      params = [userId];
    }

    const result = await pool.query(query, params);
    const count = result.rowCount;

    console.log(`${count} versões excluídas para usuário ${userId}${sessionId ? ` (session: ${sessionId})` : ' (todas)'}`);
    res.json({ success: true, count, sessionId: sessionId || null });
  } catch (error) {
    console.error('Erro ao excluir versões:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /local-sessions/:userId/versions/migrate - Migrar versões antigas para session_id atual
app.post('/local-sessions/:userId/versions/migrate', async (req, res) => {
  try {
    const { userId } = req.params;
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId é obrigatório' });
    }

    // Atualizar todas as versões sem session_id para o session_id fornecido
    const result = await pool.query(`
      UPDATE session_versions
      SET session_id = $1
      WHERE user_id = $2 AND (session_id IS NULL OR session_id = '')
      RETURNING id
    `, [sessionId, userId]);

    const count = result.rowCount;
    console.log(`Migradas ${count} versões antigas para session_id: ${sessionId}`);

    res.json({ count, sessionId });
  } catch (error) {
    console.error('Erro ao migrar versões:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rotas para arquivos

// POST /files/bulk - Salvar múltiplos arquivos
app.post('/files/bulk', upload.none(), async (req, res) => {
  try {
    const { prefix, files } = req.body;

    if (!Array.isArray(files)) {
      return res.status(400).json({ error: 'Files deve ser um array' });
    }

    const savedFiles = [];
    const erroredFiles = [];

    for (const file of files) {
      try {
        await pool.query(`
          INSERT INTO files (id, prefix, payload, updated_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (id, prefix) DO UPDATE SET
            payload = EXCLUDED.payload,
            updated_at = NOW()
        `, [file.id, prefix, file.payload]);

        savedFiles.push(file.id);
      } catch (error) {
        console.error(`Erro ao salvar arquivo ${file.id}:`, error);
        erroredFiles.push(file.id);
      }
    }

    res.json({ saved: savedFiles, errored: erroredFiles });
  } catch (error) {
    console.error('Erro ao salvar arquivos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /files/bulk-read - Carregar múltiplos arquivos
app.post('/files/bulk-read', async (req, res) => {
  try {
    const { prefix, fileIds } = req.body;

    if (!Array.isArray(fileIds)) {
      return res.status(400).json({ error: 'fileIds deve ser um array' });
    }

    const result = await pool.query(`
      SELECT id, payload, metadata
      FROM files
      WHERE prefix = $1 AND id = ANY($2)
    `, [prefix, fileIds]);

    res.json({ files: result.rows });
  } catch (error) {
    console.error('Erro ao carregar arquivos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido' });
    }
    req.user = user;
    next();
  });
};

// Rotas de autenticação

// POST /auth/register - Registrar novo usuário
app.post('/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username e password são obrigatórios' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username deve ter no mínimo 3 caracteres' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password deve ter no mínimo 6 caracteres' });
    }

    // Verificar se usuário já existe
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Username já existe' });
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(password, 10);

    // Inserir usuário
    const result = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, created_at',
      [username.toLowerCase(), passwordHash]
    );

    const user = result.rows[0];

    // Gerar token
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Erro ao registrar usuário:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /auth/login - Login de usuário
app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username e password são obrigatórios' });
    }

    // Buscar usuário
    const result = await pool.query(
      'SELECT id, username, password_hash, created_at FROM users WHERE username = $1',
      [username.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const user = result.rows[0];

    // Verificar senha
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Gerar token
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Erro ao fazer login:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// GET /auth/me - Obter informações do usuário autenticado
app.get('/auth/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Erro ao obter usuário:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /sessions/claim - Reivindicar sessão ativa
app.post('/sessions/claim', async (req, res) => {
  try {
    const { userId, sessionId, browserSessionId, diagramName } = req.body;

    console.log('[/sessions/claim] Request:', { userId, sessionId, browserSessionId, diagramName });

    if (!userId || !sessionId || !browserSessionId) {
      return res.status(400).json({ error: 'userId, sessionId e browserSessionId são obrigatórios' });
    }

    // Verificar se já existe sessão ativa para este usuário (independente do diagrama)
    const existingSession = await pool.query(
      'SELECT * FROM active_sessions WHERE user_id = $1',
      [userId]
    );

    console.log('[/sessions/claim] Existing sessions for user:', existingSession.rows);

    if (existingSession.rows.length > 0) {
      const existing = existingSession.rows[0];
      
      // Se é a mesma browser session, apenas atualizar heartbeat
      if (existing.browser_session_id === browserSessionId) {
        await pool.query(
          'UPDATE active_sessions SET last_heartbeat = NOW(), session_id = $1, diagram_name = $2 WHERE id = $3',
          [sessionId, diagramName, existing.id]
        );
        console.log('[/sessions/claim] Same browser session, updated heartbeat');
        return res.json({ isActive: true, browserSessionId: existing.browser_session_id });
      }
      
      // Outra sessão está ativa para este usuário
      console.log('[/sessions/claim] Different browser session active:', existing.browser_session_id);
      return res.json({ 
        isActive: false, 
        activeBrowserSessionId: existing.browser_session_id,
        message: 'Outra sessão já está ativa para este usuário' 
      });
    }

    // Criar nova sessão ativa
    await pool.query(
      'INSERT INTO active_sessions (user_id, session_id, diagram_name, browser_session_id, last_heartbeat) VALUES ($1, $2, $3, $4, NOW())',
      [userId, sessionId, diagramName, browserSessionId]
    );

    console.log('[/sessions/claim] New active session created for user');
    res.json({ isActive: true, browserSessionId });
  } catch (error) {
    console.error('Erro ao reivindicar sessão:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /sessions/heartbeat - Atualizar heartbeat da sessão
app.post('/sessions/heartbeat', async (req, res) => {
  try {
    const { userId, sessionId, browserSessionId, diagramName } = req.body;

    console.log('[/sessions/heartbeat] Request:', { userId, sessionId, browserSessionId, diagramName });

    if (!userId || !sessionId || !browserSessionId) {
      return res.status(400).json({ error: 'userId, sessionId e browserSessionId são obrigatórios' });
    }

    // Verificar se esta browser session é a ativa para o usuário
    const result = await pool.query(
      'SELECT * FROM active_sessions WHERE user_id = $1',
      [userId]
    );

    console.log('[/sessions/heartbeat] Active sessions found:', result.rows);

    if (result.rows.length === 0) {
      console.log('[/sessions/heartbeat] No active session found');
      return res.json({ isActive: false, message: 'Nenhuma sessão ativa encontrada' });
    }

    const activeSession = result.rows[0];

    if (activeSession.browser_session_id !== browserSessionId) {
      console.log('[/sessions/heartbeat] Different browser session is active:', activeSession.browser_session_id);
      return res.json({ 
        isActive: false, 
        activeBrowserSessionId: activeSession.browser_session_id,
        message: 'Outra sessão está ativa' 
      });
    }

    // Atualizar heartbeat, session_id e diagram_name
    await pool.query(
      'UPDATE active_sessions SET last_heartbeat = NOW(), session_id = $1, diagram_name = $2 WHERE id = $3',
      [sessionId, diagramName, activeSession.id]
    );

    res.json({ isActive: true });
  } catch (error) {
    console.error('Erro ao atualizar heartbeat:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /sessions/transfer - Transferir controle da sessão
app.post('/sessions/transfer', async (req, res) => {
  try {
    const { userId, sessionId, newBrowserSessionId, diagramName } = req.body;

    console.log('[/sessions/transfer] Request:', { userId, sessionId, newBrowserSessionId, diagramName });

    if (!userId || !sessionId || !newBrowserSessionId) {
      return res.status(400).json({ error: 'userId, sessionId e newBrowserSessionId são obrigatórios' });
    }

    // Atualizar sessão existente do usuário ou criar nova
    const result = await pool.query(
      `UPDATE active_sessions 
       SET browser_session_id = $2, session_id = $3, diagram_name = $4, last_heartbeat = NOW() 
       WHERE user_id = $1
       RETURNING *`,
      [userId, newBrowserSessionId, sessionId, diagramName]
    );

    if (result.rows.length === 0) {
      // Criar nova se não existir
      await pool.query(
        'INSERT INTO active_sessions (user_id, session_id, diagram_name, browser_session_id, last_heartbeat) VALUES ($1, $2, $3, $4, NOW())',
        [userId, sessionId, diagramName, newBrowserSessionId]
      );
      console.log('[/sessions/transfer] New session created');
    } else {
      console.log('[/sessions/transfer] Session transferred to new browser');
    }

    res.json({ success: true, browserSessionId: newBrowserSessionId });
  } catch (error) {
    console.error('[/sessions/transfer] Error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /sessions/release - Liberar sessão ativa
app.post('/sessions/release', async (req, res) => {
  try {
    const { userId, sessionId, browserSessionId } = req.body;

    console.log('[/sessions/release] Request:', { userId, sessionId, browserSessionId });

    if (!userId || !browserSessionId) {
      return res.status(400).json({ error: 'userId e browserSessionId são obrigatórios' });
    }

    // Apenas liberar se for a sessão ativa do usuário
    const result = await pool.query(
      'DELETE FROM active_sessions WHERE user_id = $1 AND browser_session_id = $2 RETURNING *',
      [userId, browserSessionId]
    );

    if (result.rows.length > 0) {
      console.log('[/sessions/release] Session released for user:', userId);
    } else {
      console.log('[/sessions/release] No active session found to release');
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[/sessions/release] Error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Cleanup de sessões expiradas (heartbeat > 30 segundos)
setInterval(async () => {
  try {
    await pool.query(
      "DELETE FROM active_sessions WHERE last_heartbeat < NOW() - INTERVAL '30 seconds'"
    );
  } catch (error) {
    console.error('Erro ao limpar sessões expiradas:', error);
  }
}, 10000); // A cada 10 segundos

// Inicializar e iniciar servidor
async function startServer() {
  await initTables();

  app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
  });
}

startServer().catch(console.error);