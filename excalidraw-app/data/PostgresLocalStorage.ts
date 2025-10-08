/**
 * PostgresLocalStorage - Adapter para salvar sessões locais no PostgreSQL
 * 
 * Este módulo permite que o Excalidraw salve desenhos locais (não colaborativos)
 * no PostgreSQL em vez de apenas no localStorage do navegador.
 */

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import { clearAppStateForLocalStorage } from "@excalidraw/excalidraw/appState";
import { clearElementsForLocalStorage } from "@excalidraw/element";
import { saveEventEmitter } from "./SaveEvents";
import { AuthService } from "./AuthService";

const DEFAULT_POSTGRES_API_BASE_URL = "http://localhost:4001";

const POSTGRES_API_BASE_URL =
  import.meta.env.VITE_APP_POSTGRES_API_BASE_URL ?? DEFAULT_POSTGRES_API_BASE_URL;

const LOCAL_SESSIONS_ENDPOINT = `${POSTGRES_API_BASE_URL}/local-sessions`;

/**
 * Gera ou recupera um ID único do usuário para identificar a sessão
 * Se o usuário estiver autenticado, usa o username
 * Caso contrário, gera/recupera um ID local
 */
export const getUserId = (): string => {
  // Primeiro, verificar se há um usuário autenticado
  const authUser = AuthService.getAuth();
  if (authUser) {
    return authUser.username;
  }
  
  // Fallback: usar ID local do localStorage
  const STORAGE_KEY = "excalidraw-local-user-id";
  let userId = localStorage.getItem(STORAGE_KEY);
  
  if (!userId) {
    // Gera um UUID simples
    userId = 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem(STORAGE_KEY, userId);
  }
  
  return userId;
};

/**
 * Gera ou recupera um ID único para a sessão/diagrama atual
 * Este ID persiste enquanto o usuário trabalha no mesmo diagrama
 */
export const getSessionId = (): string => {
  const STORAGE_KEY = "excalidraw-session-id";
  let sessionId = sessionStorage.getItem(STORAGE_KEY);
  
  if (!sessionId) {
    // Gera um UUID simples para a sessão
    sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    sessionStorage.setItem(STORAGE_KEY, sessionId);
  }
  
  return sessionId;
};

/**
 * Limpa o ID da sessão atual (usado ao criar novo diagrama)
 */
export const clearSessionId = (): void => {
  const STORAGE_KEY = "excalidraw-session-id";
  sessionStorage.removeItem(STORAGE_KEY);
};

/**
 * Gera ou recupera um ID único para o navegador atual
 * Usado para controlar qual navegador tem controle ativo
 */
export const getBrowserSessionId = (): string => {
  const STORAGE_KEY = "excalidraw-browser-session-id";
  let browserSessionId = sessionStorage.getItem(STORAGE_KEY);
  
  if (!browserSessionId) {
    browserSessionId = 'browser-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    sessionStorage.setItem(STORAGE_KEY, browserSessionId);
  }
  
  return browserSessionId;
};

/**
 * Verifica se o PostgreSQL está disponível
 */
export const isPostgresAvailable = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${POSTGRES_API_BASE_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000), // timeout de 2 segundos
    });
    return response.ok;
  } catch (error) {
    console.warn('PostgreSQL não está disponível:', error);
    return false;
  }
};

/**
 * Salva a sessão local no PostgreSQL incluindo arquivos binários
 */
export const saveLocalSessionToPostgres = async (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles = {},
): Promise<boolean> => {
  const userId = getUserId();
  
  try {
    // Limpar dados antes de salvar (remove propriedades internas/temporárias)
    const cleanedElements = clearElementsForLocalStorage(elements);
    const cleanedAppState = clearAppStateForLocalStorage(appState);
    
    // Converter files para formato serializável
    const filesData: Record<string, { 
      mimeType: string; 
      dataURL: string;
      created?: number;
    }> = {};
    
    console.log('[PostgresLocalStorage] Salvando sessão com files:', Object.keys(files).length, 'arquivos');
    
    for (const [fileId, fileData] of Object.entries(files)) {
      if (fileData?.dataURL) {
        filesData[fileId] = {
          mimeType: fileData.mimeType,
          dataURL: fileData.dataURL,
          created: fileData.created,
        };
      }
    }
    
    console.log('[PostgresLocalStorage] FilesData preparado:', Object.keys(filesData).length, 'arquivos');
    
    // Se não há arquivos para salvar, carregar os existentes para preservá-los
    let finalFilesData = filesData;
    if (Object.keys(filesData).length === 0) {
      console.log('[PostgresLocalStorage] Nenhum arquivo novo, verificando arquivos existentes...');
      try {
        const existingSession = await loadLocalSessionFromPostgres();
        if (existingSession?.files && Object.keys(existingSession.files).length > 0) {
          console.log('[PostgresLocalStorage] Preservando', Object.keys(existingSession.files).length, 'arquivos existentes');
          // Converter BinaryFiles de volta para formato de salvamento
          for (const [fileId, fileData] of Object.entries(existingSession.files)) {
            if (fileData?.dataURL) {
              finalFilesData[fileId] = {
                mimeType: fileData.mimeType,
                dataURL: fileData.dataURL,
                created: fileData.created,
              };
            }
          }
        }
      } catch (error) {
        console.warn('[PostgresLocalStorage] Erro ao carregar arquivos existentes:', error);
      }
    }
    
    const response = await fetch(`${LOCAL_SESSIONS_ENDPOINT}/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        elements: cleanedElements,
        appState: cleanedAppState,
        files: finalFilesData,
      }),
    });

    if (!response.ok) {
      console.error('Erro ao salvar sessão local:', await response.text());
      saveEventEmitter.emitError("postgres");
      return false;
    }

    console.log('[PostgresLocalStorage] Sessão local salva no PostgreSQL com sucesso (com arquivos)');
    console.log('[PostgresLocalStorage] Chamando emitSaved("postgres")');
    saveEventEmitter.emitSaved("postgres");
    console.log('[PostgresLocalStorage] emitSaved("postgres") chamado');
    return true;
  } catch (error) {
    console.error('Erro ao salvar sessão local no PostgreSQL:', error);
    saveEventEmitter.emitError("postgres");
    return false;
  }
};

/**
 * Carrega a sessão local do PostgreSQL incluindo arquivos binários
 */
export const loadLocalSessionFromPostgres = async (): Promise<{
  elements: ExcalidrawElement[];
  appState: Partial<AppState>;
  files?: BinaryFiles;
} | null> => {
  const userId = getUserId();
  
  try {
    const response = await fetch(`${LOCAL_SESSIONS_ENDPOINT}/${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) {
      // Sessão não encontrada é um caso normal
      return null;
    }

    if (!response.ok) {
      console.error('Erro ao carregar sessão local:', await response.text());
      return null;
    }

    const data = await response.json();
    console.log('[PostgresLocalStorage] Sessão local carregada do PostgreSQL com sucesso');
    console.log('[PostgresLocalStorage] Files recebidos do servidor:', data.files ? Object.keys(data.files).length : 0, 'arquivos');
    
    // Converter filesData de volta para BinaryFiles
    const files: BinaryFiles = {};
    if (data.files) {
      for (const [fileId, fileData] of Object.entries(data.files as Record<string, any>)) {
        if (fileData?.dataURL) {
          files[fileId as any] = {
            mimeType: fileData.mimeType,
            dataURL: fileData.dataURL,
            id: fileId as any,
            created: fileData.created || Date.now(),
            lastRetrieved: Date.now(),
          };
        }
      }
    }
    
    console.log('[PostgresLocalStorage] Files convertidos:', Object.keys(files).length, 'arquivos');
    
    return {
      elements: data.elements,
      appState: data.appState,
      files: Object.keys(files).length > 0 ? files : undefined,
    };
  } catch (error) {
    console.error('Erro ao carregar sessão local do PostgreSQL:', error);
    return null;
  }
};

/**
 * Salva a sessão local com debounce para evitar chamadas excessivas
 */
let saveTimeout: NodeJS.Timeout | null = null;
const SAVE_DEBOUNCE_MS = 2000; // 2 segundos

export const saveLocalSessionToPostgresDebounced = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles = {},
) => {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  
  saveTimeout = setTimeout(() => {
    saveLocalSessionToPostgres(elements, appState, files);
  }, SAVE_DEBOUNCE_MS);
};

/**
 * Força o salvamento imediato (flush)
 */
export const flushLocalSessionToPostgres = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles = {},
) => {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  
  return saveLocalSessionToPostgres(elements, appState, files);
};

/**
 * Salva a sessão atual como uma versão (backup)
 */
export const saveSessionVersion = async (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles = {},
  isAutoSave: boolean = false,
  diagramName?: string,
  versionNote?: string | null,
): Promise<{ id: number; versionNumber: number; createdAt: string } | null> => {
  const userId = getUserId();
  const sessionId = getSessionId();
  
  try {
    const cleanedElements = clearElementsForLocalStorage(elements);
    const cleanedAppState = clearAppStateForLocalStorage(appState);
    
    const filesData: Record<string, { 
      mimeType: string; 
      dataURL: string;
      created?: number;
    }> = {};
    
    for (const [fileId, fileData] of Object.entries(files)) {
      if (fileData?.dataURL) {
        filesData[fileId] = {
          mimeType: fileData.mimeType,
          dataURL: fileData.dataURL,
          created: fileData.created,
        };
      }
    }
    
    const response = await fetch(`${LOCAL_SESSIONS_ENDPOINT}/${userId}/versions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        elements: cleanedElements,
        appState: cleanedAppState,
        files: filesData,
        sessionId,
        isAutoSave,
        diagramName,
        versionNote,
      }),
    });

    if (!response.ok) {
      console.error('Erro ao salvar versão:', await response.text());
      return null;
    }

    const data = await response.json();
    const saveType = isAutoSave ? 'automático' : 'manual';
    console.log(`[PostgresLocalStorage] Versão salva (${saveType}):`, data.version_number);
    return {
      id: data.id,
      versionNumber: data.version_number,
      createdAt: data.created_at,
    };
  } catch (error) {
    console.error('Erro ao salvar versão:', error);
    return null;
  }
};

/**
 * Atualiza o nome do diagrama para todas as versões da sessão atual
 */
export const updateDiagramName = async (diagramName: string): Promise<boolean> => {
  const userId = getUserId();
  const sessionId = getSessionId();
  
  try {
    const response = await fetch(`${LOCAL_SESSIONS_ENDPOINT}/${userId}/diagram-name`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        diagramName,
      }),
    });

    if (!response.ok) {
      console.error('Erro ao atualizar nome do diagrama:', await response.text());
      return false;
    }

    const data = await response.json();
    console.log(`[PostgresLocalStorage] Nome do diagrama atualizado para ${data.updated} versões`);
    return true;
  } catch (error) {
    console.error('Erro ao atualizar nome do diagrama:', error);
    return false;
  }
};

/**
 * Obtém o nome do diagrama da sessão atual
 */
export const getCurrentDiagramName = async (): Promise<string | null> => {
  const userId = getUserId();
  const sessionId = getSessionId();
  
  try {
    const response = await fetch(`${LOCAL_SESSIONS_ENDPOINT}/${userId}/diagram-name?sessionId=${sessionId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.diagramName || null;
  } catch (error) {
    console.error('Erro ao obter nome do diagrama:', error);
    return null;
  }
};

/**
 * Lista todas as versões salvas (opcionalmente filtradas por sessão)
 */
export const listSessionVersions = async (options?: { 
  sessionId?: string;
  includeAll?: boolean;
}): Promise<Array<{
  id: number;
  sessionId: string;
  versionNumber: number;
  createdAt: string;
  elementCount: number;
  isAutoSave: boolean;
  diagramName?: string | null;
  versionNote?: string | null;
}>> => {
  const userId = getUserId();
  const currentSessionId = options?.sessionId || getSessionId();
  const includeAll = options?.includeAll || false;
  
  try {
    let url = `${LOCAL_SESSIONS_ENDPOINT}/${userId}/versions`;
    
    // Se includeAll = false, filtrar por sessionId
    if (!includeAll) {
      url += `?sessionId=${encodeURIComponent(currentSessionId)}`;
    }
    
    console.log('[listSessionVersions] URL:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Erro ao listar versões:', await response.text());
      return [];
    }

    const data = await response.json();
    console.log('[listSessionVersions] Dados recebidos:', data.length, 'versões');
    
    return data.map((v: any) => ({
      id: v.id,
      sessionId: v.session_id || 'legacy',
      versionNumber: v.version_number,
      createdAt: v.created_at,
      elementCount: v.element_count,
      isAutoSave: v.is_auto_save || false,
      diagramName: v.diagram_name || null,
      versionNote: v.version_note || null,
    }));
  } catch (error) {
    console.error('Erro ao listar versões:', error);
    return [];
  }
};

/**
 * Migra versões antigas sem session_id para o session_id atual
 */
export const migrateLegacyVersions = async (): Promise<number> => {
  const userId = getUserId();
  const currentSessionId = getSessionId();
  
  try {
    const response = await fetch(`${LOCAL_SESSIONS_ENDPOINT}/${userId}/versions/migrate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: currentSessionId,
      }),
    });

    if (!response.ok) {
      console.error('Erro ao migrar versões:', await response.text());
      return 0;
    }

    const data = await response.json();
    console.log('[migrateLegacyVersions] Migradas:', data.count, 'versões');
    return data.count;
  } catch (error) {
    console.error('Erro ao migrar versões:', error);
    return 0;
  }
};

/**
 * Exclui uma versão específica
 */
export const deleteSessionVersion = async (versionId: number): Promise<boolean> => {
  const userId = getUserId();
  
  try {
    const response = await fetch(`${LOCAL_SESSIONS_ENDPOINT}/${userId}/versions/${versionId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Erro ao excluir versão:', await response.text());
      return false;
    }

    const data = await response.json();
    console.log('[deleteSessionVersion] Versão excluída:', data.id);
    return true;
  } catch (error) {
    console.error('Erro ao excluir versão:', error);
    return false;
  }
};

/**
 * Exclui todas as versões (opcionalmente filtradas por sessão)
 */
export const deleteAllSessionVersions = async (options?: {
  currentSessionOnly?: boolean;
}): Promise<number> => {
  const userId = getUserId();
  const currentSessionId = getSessionId();
  
  try {
    let url = `${LOCAL_SESSIONS_ENDPOINT}/${userId}/versions`;
    
    // Se currentSessionOnly = true, filtrar por sessionId
    if (options?.currentSessionOnly) {
      url += `?sessionId=${encodeURIComponent(currentSessionId)}`;
    }
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Erro ao excluir versões:', await response.text());
      return 0;
    }

    const data = await response.json();
    console.log('[deleteAllSessionVersions] Versões excluídas:', data.count);
    return data.count;
  } catch (error) {
    console.error('Erro ao excluir versões:', error);
    return 0;
  }
};

/**
 * Carrega uma versão específica
 */
export const loadSessionVersion = async (versionId: number): Promise<{
  elements: ExcalidrawElement[];
  appState: Partial<AppState>;
  files?: BinaryFiles;
  versionNumber: number;
  createdAt: string;
} | null> => {
  const userId = getUserId();
  
  try {
    const response = await fetch(`${LOCAL_SESSIONS_ENDPOINT}/${userId}/versions/${versionId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Erro ao carregar versão:', await response.text());
      return null;
    }

    const data = await response.json();
    
    // Converter filesData de volta para BinaryFiles
    const files: BinaryFiles = {};
    if (data.files) {
      for (const [fileId, fileData] of Object.entries(data.files as Record<string, any>)) {
        if (fileData?.dataURL) {
          files[fileId as any] = {
            mimeType: fileData.mimeType,
            dataURL: fileData.dataURL,
            id: fileId as any,
            created: fileData.created || Date.now(),
            lastRetrieved: Date.now(),
          };
        }
      }
    }
    
    return {
      elements: data.elements,
      appState: data.appState,
      files: Object.keys(files).length > 0 ? files : undefined,
      versionNumber: data.versionNumber,
      createdAt: data.createdAt,
    };
  } catch (error) {
    console.error('Erro ao carregar versão:', error);
    return null;
  }
};

/**
 * Reivindicar sessão ativa
 */
export const claimActiveSession = async (diagramName?: string | null): Promise<{ isActive: boolean; activeBrowserSessionId?: string }> => {
  const userId = getUserId();
  const sessionId = getSessionId();
  const browserSessionId = getBrowserSessionId();

  console.log('[claimActiveSession] Requesting claim:', { userId, sessionId, browserSessionId, diagramName });

  try {
    const response = await fetch(`${POSTGRES_API_BASE_URL}/sessions/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        sessionId,
        browserSessionId,
        diagramName: diagramName || null,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[claimActiveSession] Error response:', text);
      return { isActive: false };
    }

    const data = await response.json();
    console.log('[claimActiveSession] Success:', data);
    return data;
  } catch (error) {
    console.error('[claimActiveSession] Exception:', error);
    return { isActive: false };
  }
};

/**
 * Enviar heartbeat para manter sessão ativa
 */
export const sendSessionHeartbeat = async (diagramName?: string | null): Promise<{ isActive: boolean; activeBrowserSessionId?: string }> => {
  const userId = getUserId();
  const sessionId = getSessionId();
  const browserSessionId = getBrowserSessionId();

  console.log('[sendSessionHeartbeat] Sending heartbeat:', { userId, sessionId, browserSessionId, diagramName });

  try {
    const response = await fetch(`${POSTGRES_API_BASE_URL}/sessions/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        sessionId,
        browserSessionId,
        diagramName: diagramName || null,
      }),
    });

    if (!response.ok) {
      console.log('[sendSessionHeartbeat] Not active (response not ok)');
      return { isActive: false };
    }

    const data = await response.json();
    console.log('[sendSessionHeartbeat] Result:', data);
    return data;
  } catch (error) {
    console.error('[sendSessionHeartbeat] Exception:', error);
    return { isActive: false };
  }
};

/**
 * Transferir controle da sessão para este navegador
 */
export const transferSessionControl = async (): Promise<boolean> => {
  const userId = getUserId();
  const sessionId = getSessionId();
  const browserSessionId = getBrowserSessionId();
  
  // Obter nome do diagrama atual
  const diagramName = await getCurrentDiagramName();

  try {
    const response = await fetch(`${POSTGRES_API_BASE_URL}/sessions/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        sessionId,
        newBrowserSessionId: browserSessionId,
        diagramName,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Erro ao transferir sessão:', text);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Erro ao transferir sessão:', error);
    return false;
  }
};

/**
 * Liberar sessão ativa (ao sair ou fechar)
 */
export const releaseActiveSession = async (): Promise<boolean> => {
  const userId = getUserId();
  const sessionId = getSessionId();
  const browserSessionId = getBrowserSessionId();

  try {
    const response = await fetch(`${POSTGRES_API_BASE_URL}/sessions/release`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        sessionId,
        browserSessionId,
      }),
    });

    if (!response.ok) {
      console.error('Erro ao liberar sessão:', await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error('Erro ao liberar sessão:', error);
    return false;
  }
};
