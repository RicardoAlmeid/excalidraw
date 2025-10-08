import {
  clearAppStateForLocalStorage,
  getDefaultAppState,
} from "@excalidraw/excalidraw/appState";
import { clearElementsForLocalStorage } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

import { STORAGE_KEYS } from "../app_constants";
import { loadLocalSessionFromPostgres } from "./PostgresLocalStorage";
import { AuthService } from "./AuthService";

export const saveUsernameToLocalStorage = (username: string) => {
  try {
    localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_COLLAB,
      JSON.stringify({ username }),
    );
  } catch (error: any) {
    // Unable to access window.localStorage
    console.error(error);
  }
};

export const importUsernameFromLocalStorage = (): string | null => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_COLLAB);
    if (data) {
      return JSON.parse(data).username;
    }
  } catch (error: any) {
    // Unable to access localStorage
    console.error(error);
  }

  return null;
};

export const importFromLocalStorage = async (): Promise<{
  elements: ExcalidrawElement[];
  appState: Partial<AppState> | null;
  files?: BinaryFiles;
}> => {
  // Primeiro, tentar carregar do PostgreSQL se o usuário estiver autenticado
  if (AuthService.isAuthenticated()) {
    try {
      console.log('[localStorage] Usuário autenticado, tentando carregar do PostgreSQL...');
      const postgresData = await loadLocalSessionFromPostgres();
      if (postgresData) {
        console.log('[localStorage] Dados carregados do PostgreSQL:', {
          elements: postgresData.elements.length,
          files: postgresData.files ? Object.keys(postgresData.files).length : 0,
        });
        return {
          elements: clearElementsForLocalStorage(postgresData.elements),
          appState: postgresData.appState
            ? {
                ...getDefaultAppState(),
                ...clearAppStateForLocalStorage(postgresData.appState as Partial<AppState>),
              }
            : null,
          files: postgresData.files,
        };
      }
    } catch (error) {
      console.warn('[localStorage] Erro ao carregar do PostgreSQL, fallback para localStorage:', error);
    }
  }

  // Fallback: carregar do localStorage
  let savedElements = null;
  let savedState = null;

  try {
    savedElements = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS);
    savedState = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_APP_STATE);
  } catch (error: any) {
    // Unable to access localStorage
    console.error(error);
  }

  let elements: ExcalidrawElement[] = [];
  if (savedElements) {
    try {
      elements = clearElementsForLocalStorage(JSON.parse(savedElements));
    } catch (error: any) {
      console.error(error);
      // Do nothing because elements array is already empty
    }
  }

  let appState = null;
  if (savedState) {
    try {
      appState = {
        ...getDefaultAppState(),
        ...clearAppStateForLocalStorage(
          JSON.parse(savedState) as Partial<AppState>,
        ),
      };
    } catch (error: any) {
      console.error(error);
      // Do nothing because appState is already null
    }
  }
  
  console.log('[localStorage] Dados carregados do localStorage:', {
    elements: elements.length,
  });
  
  return { elements, appState };
};

export const getElementsStorageSize = () => {
  try {
    const elements = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS);
    const elementsSize = elements?.length || 0;
    return elementsSize;
  } catch (error: any) {
    console.error(error);
    return 0;
  }
};

export const getTotalStorageSize = () => {
  try {
    const appState = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_APP_STATE);
    const collab = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_COLLAB);

    const appStateSize = appState?.length || 0;
    const collabSize = collab?.length || 0;

    return appStateSize + collabSize + getElementsStorageSize();
  } catch (error: any) {
    console.error(error);
    return 0;
  }
};
