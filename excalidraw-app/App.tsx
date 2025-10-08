import {
  Excalidraw,
  LiveCollaborationTrigger,
  TTDDialogTrigger,
  CaptureUpdateAction,
  reconcileElements,
} from "@excalidraw/excalidraw";
import { trackEvent } from "@excalidraw/excalidraw/analytics";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import {
  CommandPalette,
  DEFAULT_CATEGORIES,
} from "@excalidraw/excalidraw/components/CommandPalette/CommandPalette";
import { ErrorDialog } from "@excalidraw/excalidraw/components/ErrorDialog";
import { OverwriteConfirmDialog } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirm";
import { openConfirmModal } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirmState";
import { ShareableLinkDialog } from "@excalidraw/excalidraw/components/ShareableLinkDialog";
import Trans from "@excalidraw/excalidraw/components/Trans";
import {
  APP_NAME,
  EVENT,
  THEME,
  VERSION_TIMEOUT,
  debounce,
  getVersion,
  getFrame,
  isTestEnv,
  preventUnload,
  resolvablePromise,
  isRunningInIframe,
  isDevEnv,
} from "@excalidraw/common";
import polyfill from "@excalidraw/excalidraw/polyfill";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadFromBlob } from "@excalidraw/excalidraw/data/blob";
import { useCallbackRefState } from "@excalidraw/excalidraw/hooks/useCallbackRefState";
import { t } from "@excalidraw/excalidraw/i18n";

import {
  GithubIcon,
  XBrandIcon,
  DiscordIcon,
  ExcalLogo,
  usersIcon,
  exportToPlus,
  share,
  youtubeIcon,
} from "@excalidraw/excalidraw/components/icons";
import { isElementLink } from "@excalidraw/element";
import { restore, restoreAppState } from "@excalidraw/excalidraw/data/restore";
import { newElementWith } from "@excalidraw/element";
import { isInitializedImageElement } from "@excalidraw/element";
import clsx from "clsx";
import {
  parseLibraryTokensFromUrl,
  useHandleLibrary,
} from "@excalidraw/excalidraw/data/library";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type { RestoredDataState } from "@excalidraw/excalidraw/data/restore";
import type {
  FileId,
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
  ExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
  BinaryFiles,
  ExcalidrawInitialDataState,
  UIAppState,
} from "@excalidraw/excalidraw/types";
import type { ResolutionType } from "@excalidraw/common/utility-types";
import type { ResolvablePromise } from "@excalidraw/common/utils";

import CustomStats from "./CustomStats";
import {
  Provider,
  useAtom,
  useAtomValue,
  useAtomWithInitialValue,
  appJotaiStore,
} from "./app-jotai";
import {
  FIREBASE_STORAGE_PREFIXES,
  isExcalidrawPlusSignedUser,
  STORAGE_KEYS,
  SYNC_BROWSER_TABS_TIMEOUT,
} from "./app_constants";
import Collab, {
  collabAPIAtom,
  isCollaboratingAtom,
  isOfflineAtom,
} from "./collab/Collab";
import { AppFooter } from "./components/AppFooter";
import { AppMainMenu } from "./components/AppMainMenu";
import { AppWelcomeScreen } from "./components/AppWelcomeScreen";
import {
  ExportToExcalidrawPlus,
  exportToExcalidrawPlus,
} from "./components/ExportToExcalidrawPlus";
import { SaveIndicator } from "./components/SaveIndicator";
import { AuthDialog } from "./components/AuthDialog";
import { SessionChoiceDialog } from "./components/SessionChoiceDialog";
import { VersionHistory } from "./components/VersionHistory";
import { PreviewBanner } from "./components/PreviewBanner";
import { ViewOnlyBanner } from "./components/ViewOnlyBanner";
import { useSaveStatus } from "./hooks/useSaveStatus";
import { TopErrorBoundary } from "./components/TopErrorBoundary";
import { AuthService } from "./data/AuthService";

import {
  exportToBackend,
  getCollaborationLinkData,
  isCollaborationLink,
  loadScene,
} from "./data";

import { updateStaleImageStatuses } from "./data/FileManager";
import {
  importFromLocalStorage,
  importUsernameFromLocalStorage,
} from "./data/localStorage";

import { loadFilesFromFirebase } from "./data/firebase";
import {
  LibraryIndexedDBAdapter,
  LibraryLocalStorageMigrationAdapter,
  LocalData,
  localStorageQuotaExceededAtom,
} from "./data/LocalData";
import { isBrowserStorageStateNewer } from "./data/tabSync";
import { ShareDialog, shareDialogStateAtom } from "./share/ShareDialog";
import CollabError, { collabErrorIndicatorAtom } from "./collab/CollabError";
import { useHandleAppTheme } from "./useHandleAppTheme";
import { getPreferredLanguage } from "./app-language/language-detector";
import { useAppLangCode } from "./app-language/language-state";
import DebugCanvas, {
  debugRenderer,
  isVisualDebuggerEnabled,
  loadSavedDebugState,
} from "./components/DebugCanvas";
import { AIComponents } from "./components/AI";
import { ExcalidrawPlusIframeExport } from "./ExcalidrawPlusIframeExport";

import "./index.scss";

import type { CollabAPI } from "./collab/Collab";

polyfill();

window.EXCALIDRAW_THROTTLE_RENDER = true;

declare global {
  interface BeforeInstallPromptEventChoiceResult {
    outcome: "accepted" | "dismissed";
  }

  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<BeforeInstallPromptEventChoiceResult>;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

let pwaEvent: BeforeInstallPromptEvent | null = null;

// Adding a listener outside of the component as it may (?) need to be
// subscribed early to catch the event.
//
// Also note that it will fire only if certain heuristics are met (user has
// used the app for some time, etc.)
window.addEventListener(
  "beforeinstallprompt",
  (event: BeforeInstallPromptEvent) => {
    // prevent Chrome <= 67 from automatically showing the prompt
    event.preventDefault();
    // cache for later use
    pwaEvent = event;
  },
);

let isSelfEmbedding = false;

if (window.self !== window.top) {
  try {
    const parentUrl = new URL(document.referrer);
    const currentUrl = new URL(window.location.href);
    if (parentUrl.origin === currentUrl.origin) {
      isSelfEmbedding = true;
    }
  } catch (error) {
    // ignore
  }
}

const shareableLinkConfirmDialog = {
  title: t("overwriteConfirm.modal.shareableLink.title"),
  description: (
    <Trans
      i18nKey="overwriteConfirm.modal.shareableLink.description"
      bold={(text) => <strong>{text}</strong>}
      br={() => <br />}
    />
  ),
  actionLabel: t("overwriteConfirm.modal.shareableLink.button"),
  color: "danger",
} as const;

const initializeScene = async (opts: {
  collabAPI: CollabAPI | null;
  excalidrawAPI: ExcalidrawImperativeAPI;
}): Promise<
  { scene: ExcalidrawInitialDataState | null } & (
    | { isExternalScene: true; id: string; key: string }
    | { isExternalScene: false; id?: null; key?: null }
  )
> => {
  const searchParams = new URLSearchParams(window.location.search);
  const id = searchParams.get("id");
  const jsonBackendMatch = window.location.hash.match(
    /^#json=([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/,
  );
  const externalUrlMatch = window.location.hash.match(/^#url=(.*)$/);

  const localDataState = await importFromLocalStorage();

  let scene: RestoredDataState & {
    scrollToContent?: boolean;
  } = await loadScene(null, null, localDataState);

  let roomLinkData = getCollaborationLinkData(window.location.href);
  const isExternalScene = !!(id || jsonBackendMatch || roomLinkData);
  if (isExternalScene) {
    if (
      // don't prompt if scene is empty
      !scene.elements.length ||
      // don't prompt for collab scenes because we don't override local storage
      roomLinkData ||
      // otherwise, prompt whether user wants to override current scene
      (await openConfirmModal(shareableLinkConfirmDialog))
    ) {
      if (jsonBackendMatch) {
        scene = await loadScene(
          jsonBackendMatch[1],
          jsonBackendMatch[2],
          localDataState,
        );
      }
      scene.scrollToContent = true;
      if (!roomLinkData) {
        window.history.replaceState({}, APP_NAME, window.location.origin);
      }
    } else {
      // https://github.com/excalidraw/excalidraw/issues/1919
      if (document.hidden) {
        return new Promise((resolve, reject) => {
          window.addEventListener(
            "focus",
            () => initializeScene(opts).then(resolve).catch(reject),
            {
              once: true,
            },
          );
        });
      }

      roomLinkData = null;
      window.history.replaceState({}, APP_NAME, window.location.origin);
    }
  } else if (externalUrlMatch) {
    window.history.replaceState({}, APP_NAME, window.location.origin);

    const url = externalUrlMatch[1];
    try {
      const request = await fetch(window.decodeURIComponent(url));
      const data = await loadFromBlob(await request.blob(), null, null);
      if (
        !scene.elements.length ||
        (await openConfirmModal(shareableLinkConfirmDialog))
      ) {
        return { scene: data, isExternalScene };
      }
    } catch (error: any) {
      return {
        scene: {
          appState: {
            errorMessage: t("alerts.invalidSceneUrl"),
          },
        },
        isExternalScene,
      };
    }
  }

  if (roomLinkData && opts.collabAPI) {
    const { excalidrawAPI } = opts;

    const scene = await opts.collabAPI.startCollaboration(roomLinkData);

    return {
      // when collaborating, the state may have already been updated at this
      // point (we may have received updates from other clients), so reconcile
      // elements and appState with existing state
      scene: {
        ...scene,
        appState: {
          ...restoreAppState(
            {
              ...scene?.appState,
              theme: localDataState?.appState?.theme || scene?.appState?.theme,
            },
            excalidrawAPI.getAppState(),
          ),
          // necessary if we're invoking from a hashchange handler which doesn't
          // go through App.initializeScene() that resets this flag
          isLoading: false,
        },
        elements: reconcileElements(
          scene?.elements || [],
          excalidrawAPI.getSceneElementsIncludingDeleted() as RemoteExcalidrawElement[],
          excalidrawAPI.getAppState(),
        ),
      },
      isExternalScene: true,
      id: roomLinkData.roomId,
      key: roomLinkData.roomKey,
    };
  } else if (scene) {
    return isExternalScene && jsonBackendMatch
      ? {
          scene,
          isExternalScene,
          id: jsonBackendMatch[1],
          key: jsonBackendMatch[2],
        }
      : { scene, isExternalScene: false };
  }
  return { scene: null, isExternalScene: false };
};

const ExcalidrawWrapper = () => {
  const [errorMessage, setErrorMessage] = useState("");
  const isCollabDisabled = isRunningInIframe();

  const { editorTheme, appTheme, setAppTheme } = useHandleAppTheme();

  const [langCode, setLangCode] = useAppLangCode();
  
  // Save status indicator
  const { status: saveStatus, lastSaved } = useSaveStatus();

  // Auth dialog state
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showSessionChoiceDialog, setShowSessionChoiceDialog] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [previewState, setPreviewState] = useState<{
    elements: readonly ExcalidrawElement[];
    appState: AppState;
    files: BinaryFiles;
  } | null>(null);
  const [sessionChoiceData, setSessionChoiceData] = useState<{
    localElements: readonly ExcalidrawElement[];
    localAppState: AppState;
    localFiles: BinaryFiles;
    remoteElements: readonly ExcalidrawElement[];
    remoteAppState: Partial<AppState>;
    remoteFiles: BinaryFiles;
    token: string;
    username: string;
  } | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(
    AuthService.getUsername()
  );
  const [isViewOnlyMode, setIsViewOnlyMode] = useState(false);
  const [currentDiagramName, setCurrentDiagramName] = useState<string | null>(null);
  const sessionCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasActiveControlRef = useRef(false);

  // Verificar autenticação no mount
  useEffect(() => {
    const validateAuth = async () => {
      if (AuthService.isAuthenticated()) {
        const isValid = await AuthService.validateToken();
        if (!isValid) {
          setCurrentUsername(null);
        }
      }
    };
    validateAuth();
  }, []);

  // Carregar nome do diagrama atual
  useEffect(() => {
    const loadDiagramName = async () => {
      if (currentUsername) {
        const { getCurrentDiagramName } = await import("./data/PostgresLocalStorage");
        const name = await getCurrentDiagramName();
        console.log('[App] Loaded diagram name:', name);
        setCurrentDiagramName(name);
      } else {
        setCurrentDiagramName(null);
      }
    };
    
    loadDiagramName();
    
    // Listener para mudanças no nome do diagrama
    const handleDiagramNameChanged = (event: CustomEvent) => {
      console.log('[App] Diagram name changed event:', event.detail.diagramName);
      setCurrentDiagramName(event.detail.diagramName);
    };
    
    window.addEventListener('diagram-name-changed', handleDiagramNameChanged as EventListener);
    
    return () => {
      window.removeEventListener('diagram-name-changed', handleDiagramNameChanged as EventListener);
    };
  }, [currentUsername]);

  const handleAuthSuccess = async (token: string, username: string) => {
    // Salvar credenciais temporariamente
    AuthService.saveAuth(token, username);
    
    // Verificar se há desenho local
    const currentElements = excalidrawAPI?.getSceneElements() || [];
    const currentAppState = excalidrawAPI?.getAppState() || {};
    const currentFiles = excalidrawAPI?.getFiles() || {};
    
    const hasLocalContent = currentElements.length > 0;
    
    if (hasLocalContent) {
      // Tentar carregar dados do servidor
      try {
        const { loadLocalSessionFromPostgres } = await import("./data/PostgresLocalStorage");
        const remoteData = await loadLocalSessionFromPostgres();
        
        if (remoteData && remoteData.elements && remoteData.elements.length > 0) {
          // Há dados tanto locais quanto remotos - mostrar escolha
          setSessionChoiceData({
            localElements: currentElements,
            localAppState: currentAppState as AppState,
            localFiles: currentFiles,
            remoteElements: remoteData.elements,
            remoteAppState: remoteData.appState,
            remoteFiles: remoteData.files || {},
            token,
            username,
          });
          setShowSessionChoiceDialog(true);
          setShowAuthDialog(false);
          return;
        }
      } catch (error) {
        console.error('Erro ao verificar sessão remota:', error);
      }
    }
    
    // Caso padrão: apenas recarregar
    setCurrentUsername(username);
    window.location.reload();
  };

  const handleSessionChoice = async (choice: "load" | "keep") => {
    if (!sessionChoiceData) return;
    
    const { loadLocalSessionFromPostgres, saveSessionVersion, saveLocalSessionToPostgres, claimActiveSession } = 
      await import("./data/PostgresLocalStorage");
    
    if (choice === "keep") {
      // Manter desenho local, mas salvar o remoto como versão
      try {
        // Salvar versão do desenho remoto (atual do banco)
        await saveSessionVersion(
          sessionChoiceData.remoteElements,
          sessionChoiceData.remoteAppState as AppState,
          sessionChoiceData.remoteFiles
        );
        
        // Salvar desenho local como sessão principal
        await saveLocalSessionToPostgres(
          sessionChoiceData.localElements,
          sessionChoiceData.localAppState,
          sessionChoiceData.localFiles
        );
        
        console.log('Desenho local mantido, versão remota salva como backup');
      } catch (error) {
        console.error('Erro ao salvar versão:', error);
      }
    } else {
      // Carregar desenho remoto, descartar local
      try {
        excalidrawAPI?.updateScene({
          elements: sessionChoiceData.remoteElements,
          appState: sessionChoiceData.remoteAppState as AppState,
        });
        
        // Atualizar arquivos separadamente
        if (sessionChoiceData.remoteFiles && Object.keys(sessionChoiceData.remoteFiles).length > 0) {
          excalidrawAPI?.addFiles(Object.values(sessionChoiceData.remoteFiles));
        }
        
        console.log('Desenho remoto carregado, local descartado');
      } catch (error) {
        console.error('Erro ao carregar desenho remoto:', error);
      }
    }
    
    setCurrentUsername(sessionChoiceData.username);
    setSessionChoiceData(null);
  };

  const handleRestoreVersion = async (versionId: number) => {
    try {
      // Se estiver em preview, limpar o estado de preview primeiro
      if (previewState) {
        setPreviewState(null);
      }
      
      const { loadSessionVersion, saveSessionVersion } = 
        await import("./data/PostgresLocalStorage");
      
      // Salvar versão atual como backup (a menos que seja um preview)
      const currentElements = excalidrawAPI?.getSceneElements() || [];
      const currentAppState = excalidrawAPI?.getAppState() || {};
      const currentFiles = excalidrawAPI?.getFiles() || {};
      
      if (currentElements.length > 0 && !previewState) {
        await saveSessionVersion(
          currentElements,
          currentAppState as AppState,
          currentFiles
        );
        console.log('Versão atual salva como backup');
      }
      
      // Carregar versão selecionada
      const versionData = await loadSessionVersion(versionId);
      
      if (versionData) {
        excalidrawAPI?.updateScene({
          elements: versionData.elements,
          appState: versionData.appState as AppState,
        });
        
        // Atualizar arquivos
        if (versionData.files && Object.keys(versionData.files).length > 0) {
          excalidrawAPI?.addFiles(Object.values(versionData.files));
        }
        
        console.log('Versão restaurada com sucesso');
      }
    } catch (error) {
      console.error('Erro ao restaurar versão:', error);
      throw error;
    }
  };

  const handlePreviewVersion = async (versionId: number) => {
    try {
      // Se ainda não estamos em modo preview, salvar o estado atual
      if (!previewState) {
        const currentElements = excalidrawAPI?.getSceneElements() || [];
        const currentAppState = excalidrawAPI?.getAppState() || {} as AppState;
        const currentFiles = excalidrawAPI?.getFiles() || {};
        
        setPreviewState({
          elements: currentElements,
          appState: currentAppState,
          files: currentFiles,
        });
      }
      
      const { loadSessionVersion } = 
        await import("./data/PostgresLocalStorage");
      
      // Carregar versão para preview
      const versionData = await loadSessionVersion(versionId);
      
      if (versionData) {
        excalidrawAPI?.updateScene({
          elements: versionData.elements,
          appState: {
            ...versionData.appState,
            viewBackgroundColor: versionData.appState?.viewBackgroundColor || "#ffffff",
          } as AppState,
        });
        
        // Atualizar arquivos
        if (versionData.files && Object.keys(versionData.files).length > 0) {
          excalidrawAPI?.addFiles(Object.values(versionData.files));
        }
        
        console.log('Preview da versão carregado (estado atual salvo)');
      }
    } catch (error) {
      console.error('Erro ao visualizar versão:', error);
      throw error;
    }
  };

  const handleCancelPreview = () => {
    if (previewState && excalidrawAPI) {
      // Restaurar o estado salvo antes do preview
      excalidrawAPI.updateScene({
        elements: previewState.elements,
        appState: previewState.appState,
      });
      
      // Restaurar arquivos
      if (previewState.files && Object.keys(previewState.files).length > 0) {
        excalidrawAPI.addFiles(Object.values(previewState.files));
      }
      
      setPreviewState(null);
      console.log('Preview cancelado, estado original restaurado');
    }
  };

  const handleLogout = async () => {
    // Liberar sessão antes de deslogar
    if (currentUsername && !isViewOnlyMode) {
      const { releaseActiveSession, saveSessionVersion } = await import("./data/PostgresLocalStorage");
      
      // Salvar estado atual
      const elements = excalidrawAPI?.getSceneElements();
      const appState = excalidrawAPI?.getAppState();
      const files = excalidrawAPI?.getFiles();
      
      if (elements && appState) {
        await saveSessionVersion(
          elements,
          appState,
          files || {},
          false,
          undefined,
          "Salvamento automático ao sair"
        );
      }
      
      await releaseActiveSession();
    }
    
    AuthService.clearAuth();
    setCurrentUsername(null);
    // Recarregar para limpar estado
    window.location.reload();
  };

  const handleTakeControl = async () => {
    const { transferSessionControl } = await import("./data/PostgresLocalStorage");
    const success = await transferSessionControl();
    
    if (success) {
      console.log('[Session] Controle transferido com sucesso');
      hasActiveControlRef.current = true;
      setIsViewOnlyMode(false);
      
      // Limpar intervalo antigo
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
        sessionCheckIntervalRef.current = null;
      }
      
      // Reiniciar heartbeat loop
      const { sendSessionHeartbeat } = await import("./data/PostgresLocalStorage");
      const checkSessionStatus = async () => {
        if (hasActiveControlRef.current) {
          const result = await sendSessionHeartbeat();
          const isActive = result.isActive;
          setIsViewOnlyMode(!isActive);
          hasActiveControlRef.current = isActive;
          
          if (!isActive) {
            console.log('[Session] Controle perdido durante heartbeat');
          }
        }
      };
      
      sessionCheckIntervalRef.current = setInterval(checkSessionStatus, 5000);
    } else {
      console.error('[Session] Falha ao transferir controle');
    }
  };

  // initial state
  // ---------------------------------------------------------------------------

  const initialStatePromiseRef = useRef<{
    promise: ResolvablePromise<ExcalidrawInitialDataState | null>;
  }>({ promise: null! });
  if (!initialStatePromiseRef.current.promise) {
    initialStatePromiseRef.current.promise =
      resolvablePromise<ExcalidrawInitialDataState | null>();
  }

  const debugCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    trackEvent("load", "frame", getFrame());
    // Delayed so that the app has a time to load the latest SW
    setTimeout(() => {
      trackEvent("load", "version", getVersion());
    }, VERSION_TIMEOUT);
  }, []);

  const [excalidrawAPI, excalidrawRefCallback] =
    useCallbackRefState<ExcalidrawImperativeAPI>();

  // Controle de sessão ativa
  useEffect(() => {
    console.log('[Session] useEffect triggered, currentUsername:', currentUsername, 'diagramName:', currentDiagramName);
    
    if (!currentUsername) {
      console.log('[Session] No username, disabling view-only mode');
      setIsViewOnlyMode(false);
      hasActiveControlRef.current = false;
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
        sessionCheckIntervalRef.current = null;
      }
      return;
    }

    let isFirstCall = true;

    const checkSessionStatus = async () => {
      console.log('[Session] checkSessionStatus called, isFirstCall:', isFirstCall, 'hasActiveControl:', hasActiveControlRef.current, 'diagramName:', currentDiagramName);
      
      const { claimActiveSession, sendSessionHeartbeat, getCurrentDiagramName } = await import("./data/PostgresLocalStorage");
      
      // Obter nome do diagrama atualizado
      const latestDiagramName = await getCurrentDiagramName();
      if (latestDiagramName !== currentDiagramName) {
        console.log('[Session] Diagram name changed from', currentDiagramName, 'to', latestDiagramName);
        setCurrentDiagramName(latestDiagramName);
      }
      
      // Primeira chamada: reivindicar sessão
      if (isFirstCall) {
        isFirstCall = false;
        console.log('[Session] First call - claiming session');
        const result = await claimActiveSession(latestDiagramName);
        console.log('[Session] Claim result:', result);
        const isActive = result.isActive;
        setIsViewOnlyMode(!isActive);
        hasActiveControlRef.current = isActive;
      } else {
        // Apenas enviar heartbeat se tivermos controle ativo
        if (hasActiveControlRef.current) {
          console.log('[Session] Sending heartbeat');
          const result = await sendSessionHeartbeat(latestDiagramName);
          console.log('[Session] Heartbeat result:', result);
          const isActive = result.isActive;
          setIsViewOnlyMode(!isActive);
          hasActiveControlRef.current = isActive;
          
          // Se perdemos o controle, parar de enviar heartbeat
          if (!isActive) {
            console.log('[Session] Controle perdido, parando heartbeat');
          }
        } else {
          console.log('[Session] Skipping heartbeat - no active control');
        }
      }
    };

    // Chamar imediatamente
    checkSessionStatus();

    // Verificar a cada 5 segundos
    sessionCheckIntervalRef.current = setInterval(checkSessionStatus, 5000);

    // Cleanup ao desmontar ou deslogar
    return () => {
      console.log('[Session] Cleaning up session control');
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
        sessionCheckIntervalRef.current = null;
      }
      hasActiveControlRef.current = false;
    };
  }, [currentUsername, currentDiagramName]);

  // Liberar sessão ao fechar/sair
  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (currentUsername && !isViewOnlyMode && excalidrawAPI) {
        const { releaseActiveSession, saveSessionVersion } = await import("./data/PostgresLocalStorage");
        
        // Salvar estado atual antes de sair
        const elements = excalidrawAPI.getSceneElements();
        const appState = excalidrawAPI.getAppState();
        const files = excalidrawAPI.getFiles();
        
        if (elements && appState) {
          await saveSessionVersion(
            elements,
            appState,
            files || {},
            false,
            undefined,
            "Salvamento automático ao fechar"
          );
        }
        
        await releaseActiveSession();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      handleBeforeUnload(); // Tentar liberar ao desmontar componente
    };
  }, [currentUsername, isViewOnlyMode, excalidrawAPI]);

  const [, setShareDialogState] = useAtom(shareDialogStateAtom);
  const [collabAPI] = useAtom(collabAPIAtom);
  const [isCollaborating] = useAtomWithInitialValue(isCollaboratingAtom, () => {
    return isCollaborationLink(window.location.href);
  });
  const collabError = useAtomValue(collabErrorIndicatorAtom);

  useHandleLibrary({
    excalidrawAPI,
    adapter: LibraryIndexedDBAdapter,
    // TODO maybe remove this in several months (shipped: 24-03-11)
    migrationAdapter: LibraryLocalStorageMigrationAdapter,
  });

  const [, forceRefresh] = useState(false);

  useEffect(() => {
    if (isDevEnv()) {
      const debugState = loadSavedDebugState();

      if (debugState.enabled && !window.visualDebug) {
        window.visualDebug = {
          data: [],
        };
      } else {
        delete window.visualDebug;
      }
      forceRefresh((prev) => !prev);
    }
  }, [excalidrawAPI]);

  // Auto-save a cada 10 minutos para usuários logados
  useEffect(() => {
    if (!currentUsername || !excalidrawAPI) {
      return;
    }

    console.log('[AutoSave] Timer iniciado - salvando versão a cada 10 minutos');

    const autoSaveInterval = setInterval(async () => {
      try {
        const elements = excalidrawAPI.getSceneElements();
        const appState = excalidrawAPI.getAppState();
        const files = excalidrawAPI.getFiles();

        // Só salvar se houver conteúdo
        if (elements.length > 0) {
          const { saveSessionVersion } = await import("./data/PostgresLocalStorage");
          await saveSessionVersion(
            elements,
            appState as AppState,
            files,
            true // isAutoSave = true
          );
          console.log('[AutoSave] Versão automática salva com sucesso');
        }
      } catch (error) {
        console.error('[AutoSave] Erro ao salvar versão automática:', error);
      }
    }, 10 * 60 * 1000); // 10 minutos em milissegundos

    return () => {
      console.log('[AutoSave] Timer removido');
      clearInterval(autoSaveInterval);
    };
  }, [currentUsername, excalidrawAPI]);

  useEffect(() => {
    if (!excalidrawAPI || (!isCollabDisabled && !collabAPI)) {
      return;
    }

    const loadImages = (
      data: ResolutionType<typeof initializeScene>,
      isInitialLoad = false,
    ) => {
      if (!data.scene) {
        return;
      }
      if (collabAPI?.isCollaborating()) {
        if (data.scene.elements) {
          collabAPI
            .fetchImageFilesFromFirebase({
              elements: data.scene.elements,
              forceFetchFiles: true,
            })
            .then(({ loadedFiles, erroredFiles }) => {
              excalidrawAPI.addFiles(loadedFiles);
              updateStaleImageStatuses({
                excalidrawAPI,
                erroredFiles,
                elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
              });
            });
        }
      } else {
        const fileIds =
          data.scene.elements?.reduce((acc, element) => {
            if (isInitializedImageElement(element)) {
              return acc.concat(element.fileId);
            }
            return acc;
          }, [] as FileId[]) || [];

        if (data.isExternalScene) {
          loadFilesFromFirebase(
            `${FIREBASE_STORAGE_PREFIXES.shareLinkFiles}/${data.id}`,
            data.key,
            fileIds,
          ).then(({ loadedFiles, erroredFiles }) => {
            excalidrawAPI.addFiles(loadedFiles);
            updateStaleImageStatuses({
              excalidrawAPI,
              erroredFiles,
              elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
            });
          });
        } else if (isInitialLoad) {
          if (fileIds.length) {
            LocalData.fileStorage
              .getFiles(fileIds)
              .then(({ loadedFiles, erroredFiles }) => {
                if (loadedFiles.length) {
                  excalidrawAPI.addFiles(loadedFiles);
                }
                updateStaleImageStatuses({
                  excalidrawAPI,
                  erroredFiles,
                  elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
                });
              });
          }
          // on fresh load, clear unused files from IDB (from previous
          // session)
          LocalData.fileStorage.clearObsoleteFiles({ currentFileIds: fileIds });
        }
      }
    };

    initializeScene({ collabAPI, excalidrawAPI }).then(async (data) => {
      loadImages(data, /* isInitialLoad */ true);
      initialStatePromiseRef.current.promise.resolve(data.scene);
    });

    const onHashChange = async (event: HashChangeEvent) => {
      event.preventDefault();
      const libraryUrlTokens = parseLibraryTokensFromUrl();
      if (!libraryUrlTokens) {
        if (
          collabAPI?.isCollaborating() &&
          !isCollaborationLink(window.location.href)
        ) {
          collabAPI.stopCollaboration(false);
        }
        excalidrawAPI.updateScene({ appState: { isLoading: true } });

        initializeScene({ collabAPI, excalidrawAPI }).then((data) => {
          loadImages(data);
          if (data.scene) {
            excalidrawAPI.updateScene({
              ...data.scene,
              ...restore(data.scene, null, null, { repairBindings: true }),
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
          }
        });
      }
    };

    const syncData = debounce(async () => {
      if (isTestEnv()) {
        return;
      }
      if (
        !document.hidden &&
        ((collabAPI && !collabAPI.isCollaborating()) || isCollabDisabled)
      ) {
        // don't sync if local state is newer or identical to browser state
        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_DATA_STATE)) {
          const localDataState = await importFromLocalStorage();
          const username = importUsernameFromLocalStorage();
          setLangCode(getPreferredLanguage());
          console.log('[App.tsx] Sincronizando dados, files:', localDataState.files ? Object.keys(localDataState.files).length : 0);
          excalidrawAPI.updateScene({
            elements: localDataState.elements,
            appState: localDataState.appState as any,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
          // Adicionar arquivos se existirem
          if (localDataState.files && Object.keys(localDataState.files).length > 0) {
            const filesArray = Object.values(localDataState.files);
            console.log('[App.tsx] Adicionando files:', filesArray.length);
            console.log('[App.tsx] Primeiro file:', filesArray[0] ? { id: filesArray[0].id, mimeType: filesArray[0].mimeType, hasDataURL: !!filesArray[0].dataURL } : 'nenhum');
            excalidrawAPI.addFiles(filesArray);
          }
          LibraryIndexedDBAdapter.load().then((data) => {
            if (data) {
              excalidrawAPI.updateLibrary({
                libraryItems: data.libraryItems,
              });
            }
          });
          collabAPI?.setUsername(username || "");
        }

        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_FILES)) {
          const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
          const currFiles = excalidrawAPI.getFiles();
          const fileIds =
            elements?.reduce((acc, element) => {
              if (
                isInitializedImageElement(element) &&
                // only load and update images that aren't already loaded
                !currFiles[element.fileId]
              ) {
                return acc.concat(element.fileId);
              }
              return acc;
            }, [] as FileId[]) || [];
          if (fileIds.length) {
            LocalData.fileStorage
              .getFiles(fileIds)
              .then(({ loadedFiles, erroredFiles }) => {
                if (loadedFiles.length) {
                  excalidrawAPI.addFiles(loadedFiles);
                }
                updateStaleImageStatuses({
                  excalidrawAPI,
                  erroredFiles,
                  elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
                });
              });
          }
        }
      }
    }, SYNC_BROWSER_TABS_TIMEOUT);

    const onUnload = () => {
      LocalData.flushSave();
    };

    const visibilityChange = (event: FocusEvent | Event) => {
      if (event.type === EVENT.BLUR || document.hidden) {
        LocalData.flushSave();
      }
      if (
        event.type === EVENT.VISIBILITY_CHANGE ||
        event.type === EVENT.FOCUS
      ) {
        syncData();
      }
    };

    window.addEventListener(EVENT.HASHCHANGE, onHashChange, false);
    window.addEventListener(EVENT.UNLOAD, onUnload, false);
    window.addEventListener(EVENT.BLUR, visibilityChange, false);
    document.addEventListener(EVENT.VISIBILITY_CHANGE, visibilityChange, false);
    window.addEventListener(EVENT.FOCUS, visibilityChange, false);
    return () => {
      window.removeEventListener(EVENT.HASHCHANGE, onHashChange, false);
      window.removeEventListener(EVENT.UNLOAD, onUnload, false);
      window.removeEventListener(EVENT.BLUR, visibilityChange, false);
      window.removeEventListener(EVENT.FOCUS, visibilityChange, false);
      document.removeEventListener(
        EVENT.VISIBILITY_CHANGE,
        visibilityChange,
        false,
      );
    };
  }, [isCollabDisabled, collabAPI, excalidrawAPI, setLangCode]);

  useEffect(() => {
    const unloadHandler = (event: BeforeUnloadEvent) => {
      LocalData.flushSave();

      if (
        excalidrawAPI &&
        LocalData.fileStorage.shouldPreventUnload(
          excalidrawAPI.getSceneElements(),
        )
      ) {
        if (import.meta.env.VITE_APP_DISABLE_PREVENT_UNLOAD !== "true") {
          preventUnload(event);
        } else {
          console.warn(
            "preventing unload disabled (VITE_APP_DISABLE_PREVENT_UNLOAD)",
          );
        }
      }
    };
    window.addEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    return () => {
      window.removeEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    };
  }, [excalidrawAPI]);

  const onChange = (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    if (collabAPI?.isCollaborating()) {
      collabAPI.syncElements(elements);
    }

    // Bloquear salvamento se estiver em modo somente visualização
    if (isViewOnlyMode) {
      return;
    }

    // this check is redundant, but since this is a hot path, it's best
    // not to evaludate the nested expression every time
    if (!LocalData.isSavePaused()) {
      LocalData.save(elements, appState, files, () => {
        if (excalidrawAPI) {
          let didChange = false;

          const elements = excalidrawAPI
            .getSceneElementsIncludingDeleted()
            .map((element) => {
              if (
                LocalData.fileStorage.shouldUpdateImageElementStatus(element)
              ) {
                const newElement = newElementWith(element, { status: "saved" });
                if (newElement !== element) {
                  didChange = true;
                }
                return newElement;
              }
              return element;
            });

          if (didChange) {
            excalidrawAPI.updateScene({
              elements,
              captureUpdate: CaptureUpdateAction.NEVER,
            });
          }
        }
      });
    }

    // Render the debug scene if the debug canvas is available
    if (debugCanvasRef.current && excalidrawAPI) {
      debugRenderer(
        debugCanvasRef.current,
        appState,
        window.devicePixelRatio,
        () => forceRefresh((prev) => !prev),
      );
    }
  };

  const [latestShareableLink, setLatestShareableLink] = useState<string | null>(
    null,
  );

  const onExportToBackend = async (
    exportedElements: readonly NonDeletedExcalidrawElement[],
    appState: Partial<AppState>,
    files: BinaryFiles,
  ) => {
    if (exportedElements.length === 0) {
      throw new Error(t("alerts.cannotExportEmptyCanvas"));
    }
    try {
      const { url, errorMessage } = await exportToBackend(
        exportedElements,
        {
          ...appState,
          viewBackgroundColor: appState.exportBackground
            ? appState.viewBackgroundColor
            : getDefaultAppState().viewBackgroundColor,
        },
        files,
      );

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      if (url) {
        setLatestShareableLink(url);
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        const { width, height } = appState;
        console.error(error, {
          width,
          height,
          devicePixelRatio: window.devicePixelRatio,
        });
        throw new Error(error.message);
      }
    }
  };

  const renderCustomStats = (
    elements: readonly NonDeletedExcalidrawElement[],
    appState: UIAppState,
  ) => {
    return (
      <CustomStats
        setToast={(message) => excalidrawAPI!.setToast({ message })}
        appState={appState}
        elements={elements}
      />
    );
  };

  const isOffline = useAtomValue(isOfflineAtom);

  const localStorageQuotaExceeded = useAtomValue(localStorageQuotaExceededAtom);

  const onCollabDialogOpen = useCallback(
    () => setShareDialogState({ isOpen: true, type: "collaborationOnly" }),
    [setShareDialogState],
  );

  // browsers generally prevent infinite self-embedding, there are
  // cases where it still happens, and while we disallow self-embedding
  // by not whitelisting our own origin, this serves as an additional guard
  if (isSelfEmbedding) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          height: "100%",
        }}
      >
        <h1>I'm not a pretzel!</h1>
      </div>
    );
  }

  const ExcalidrawPlusCommand = {
    label: "Excalidraw+",
    category: DEFAULT_CATEGORIES.links,
    predicate: true,
    icon: <div style={{ width: 14 }}>{ExcalLogo}</div>,
    keywords: ["plus", "cloud", "server"],
    perform: () => {
      window.open(
        `${
          import.meta.env.VITE_APP_PLUS_LP
        }/plus?utm_source=excalidraw&utm_medium=app&utm_content=command_palette`,
        "_blank",
      );
    },
  };
  const ExcalidrawPlusAppCommand = {
    label: "Sign up",
    category: DEFAULT_CATEGORIES.links,
    predicate: true,
    icon: <div style={{ width: 14 }}>{ExcalLogo}</div>,
    keywords: [
      "excalidraw",
      "plus",
      "cloud",
      "server",
      "signin",
      "login",
      "signup",
    ],
    perform: () => {
      window.open(
        `${
          import.meta.env.VITE_APP_PLUS_APP
        }?utm_source=excalidraw&utm_medium=app&utm_content=command_palette`,
        "_blank",
      );
    },
  };

  return (
    <div
      style={{ height: "100%" }}
      className={clsx("excalidraw-app", {
        "is-collaborating": isCollaborating,
      })}
    >
      <Excalidraw
        excalidrawAPI={excalidrawRefCallback}
        onChange={onChange}
        initialData={initialStatePromiseRef.current.promise}
        isCollaborating={isCollaborating}
        onPointerUpdate={collabAPI?.onPointerUpdate}
        viewModeEnabled={isViewOnlyMode}
        UIOptions={{
          canvasActions: {
            toggleTheme: true,
            export: {
              onExportToBackend,
              renderCustomUI: excalidrawAPI
                ? (elements, appState, files) => {
                    return (
                      <ExportToExcalidrawPlus
                        elements={elements}
                        appState={appState}
                        files={files}
                        name={excalidrawAPI.getName()}
                        onError={(error) => {
                          excalidrawAPI?.updateScene({
                            appState: {
                              errorMessage: error.message,
                            },
                          });
                        }}
                        onSuccess={() => {
                          excalidrawAPI.updateScene({
                            appState: { openDialog: null },
                          });
                        }}
                      />
                    );
                  }
                : undefined,
            },
          },
        }}
        langCode={langCode}
        renderCustomStats={renderCustomStats}
        detectScroll={false}
        handleKeyboardGlobally={true}
        autoFocus={true}
        theme={editorTheme}
        renderTopRightUI={(isMobile) => {
          if (isMobile || !collabAPI || isCollabDisabled) {
            return null;
          }
          return (
            <div className="top-right-ui">
              {collabError.message && <CollabError collabError={collabError} />}
              <LiveCollaborationTrigger
                isCollaborating={isCollaborating}
                onSelect={() =>
                  setShareDialogState({ isOpen: true, type: "share" })
                }
              />
            </div>
          );
        }}
        onLinkOpen={(element, event) => {
          if (element.link && isElementLink(element.link)) {
            event.preventDefault();
            excalidrawAPI?.scrollToContent(element.link, { animate: true });
          }
        }}
      >
        <AppMainMenu
          onCollabDialogOpen={onCollabDialogOpen}
          isCollaborating={isCollaborating}
          isCollabEnabled={!isCollabDisabled}
          theme={appTheme}
          setTheme={(theme) => setAppTheme(theme)}
          refresh={() => forceRefresh((prev) => !prev)}
        />
        <AppWelcomeScreen
          onCollabDialogOpen={onCollabDialogOpen}
          isCollabEnabled={!isCollabDisabled}
        />
        <OverwriteConfirmDialog>
          <OverwriteConfirmDialog.Actions.ExportToImage />
          <OverwriteConfirmDialog.Actions.SaveToDisk />
          {excalidrawAPI && (
            <OverwriteConfirmDialog.Action
              title={t("overwriteConfirm.action.excalidrawPlus.title")}
              actionLabel={t("overwriteConfirm.action.excalidrawPlus.button")}
              onClick={() => {
                exportToExcalidrawPlus(
                  excalidrawAPI.getSceneElements(),
                  excalidrawAPI.getAppState(),
                  excalidrawAPI.getFiles(),
                  excalidrawAPI.getName(),
                );
              }}
            >
              {t("overwriteConfirm.action.excalidrawPlus.description")}
            </OverwriteConfirmDialog.Action>
          )}
        </OverwriteConfirmDialog>
        <AppFooter onChange={() => excalidrawAPI?.refresh()} />
        {excalidrawAPI && <AIComponents excalidrawAPI={excalidrawAPI} />}

        <TTDDialogTrigger />
        {isCollaborating && isOffline && (
          <div className="alertalert--warning">
            {t("alerts.collabOfflineWarning")}
          </div>
        )}
        {localStorageQuotaExceeded && (
          <div className="alert alert--danger">
            {t("alerts.localStorageQuotaExceeded")}
          </div>
        )}
        {latestShareableLink && (
          <ShareableLinkDialog
            link={latestShareableLink}
            onCloseRequest={() => setLatestShareableLink(null)}
            setErrorMessage={setErrorMessage}
          />
        )}
        {excalidrawAPI && !isCollabDisabled && (
          <Collab excalidrawAPI={excalidrawAPI} />
        )}

        <ShareDialog
          collabAPI={collabAPI}
          onExportToBackend={async () => {
            if (excalidrawAPI) {
              try {
                await onExportToBackend(
                  excalidrawAPI.getSceneElements(),
                  excalidrawAPI.getAppState(),
                  excalidrawAPI.getFiles(),
                );
              } catch (error: any) {
                setErrorMessage(error.message);
              }
            }
          }}
        />

        {errorMessage && (
          <ErrorDialog onClose={() => setErrorMessage("")}>
            {errorMessage}
          </ErrorDialog>
        )}

        <CommandPalette
          customCommandPaletteItems={[
            {
              label: t("labels.liveCollaboration"),
              category: DEFAULT_CATEGORIES.app,
              keywords: [
                "team",
                "multiplayer",
                "share",
                "public",
                "session",
                "invite",
              ],
              icon: usersIcon,
              perform: () => {
                setShareDialogState({
                  isOpen: true,
                  type: "collaborationOnly",
                });
              },
            },
            {
              label: t("roomDialog.button_stopSession"),
              category: DEFAULT_CATEGORIES.app,
              predicate: () => !!collabAPI?.isCollaborating(),
              keywords: [
                "stop",
                "session",
                "end",
                "leave",
                "close",
                "exit",
                "collaboration",
              ],
              perform: () => {
                if (collabAPI) {
                  collabAPI.stopCollaboration();
                  if (!collabAPI.isCollaborating()) {
                    setShareDialogState({ isOpen: false });
                  }
                }
              },
            },
            {
              label: t("labels.share"),
              category: DEFAULT_CATEGORIES.app,
              predicate: true,
              icon: share,
              keywords: [
                "link",
                "shareable",
                "readonly",
                "export",
                "publish",
                "snapshot",
                "url",
                "collaborate",
                "invite",
              ],
              perform: async () => {
                setShareDialogState({ isOpen: true, type: "share" });
              },
            },
            {
              label: "GitHub",
              icon: GithubIcon,
              category: DEFAULT_CATEGORIES.links,
              predicate: true,
              keywords: [
                "issues",
                "bugs",
                "requests",
                "report",
                "features",
                "social",
                "community",
              ],
              perform: () => {
                window.open(
                  "https://github.com/excalidraw/excalidraw",
                  "_blank",
                  "noopener noreferrer",
                );
              },
            },
            {
              label: t("labels.followUs"),
              icon: XBrandIcon,
              category: DEFAULT_CATEGORIES.links,
              predicate: true,
              keywords: ["twitter", "contact", "social", "community"],
              perform: () => {
                window.open(
                  "https://x.com/excalidraw",
                  "_blank",
                  "noopener noreferrer",
                );
              },
            },
            {
              label: t("labels.discordChat"),
              category: DEFAULT_CATEGORIES.links,
              predicate: true,
              icon: DiscordIcon,
              keywords: [
                "chat",
                "talk",
                "contact",
                "bugs",
                "requests",
                "report",
                "feedback",
                "suggestions",
                "social",
                "community",
              ],
              perform: () => {
                window.open(
                  "https://discord.gg/UexuTaE",
                  "_blank",
                  "noopener noreferrer",
                );
              },
            },
            {
              label: "YouTube",
              icon: youtubeIcon,
              category: DEFAULT_CATEGORIES.links,
              predicate: true,
              keywords: ["features", "tutorials", "howto", "help", "community"],
              perform: () => {
                window.open(
                  "https://youtube.com/@excalidraw",
                  "_blank",
                  "noopener noreferrer",
                );
              },
            },
            ...(isExcalidrawPlusSignedUser
              ? [
                  {
                    ...ExcalidrawPlusAppCommand,
                    label: "Sign in / Go to Excalidraw+",
                  },
                ]
              : [ExcalidrawPlusCommand, ExcalidrawPlusAppCommand]),

            {
              label: t("overwriteConfirm.action.excalidrawPlus.button"),
              category: DEFAULT_CATEGORIES.export,
              icon: exportToPlus,
              predicate: true,
              keywords: ["plus", "export", "save", "backup"],
              perform: () => {
                if (excalidrawAPI) {
                  exportToExcalidrawPlus(
                    excalidrawAPI.getSceneElements(),
                    excalidrawAPI.getAppState(),
                    excalidrawAPI.getFiles(),
                    excalidrawAPI.getName(),
                  );
                }
              },
            },
            {
              ...CommandPalette.defaultItems.toggleTheme,
              perform: () => {
                setAppTheme(
                  editorTheme === THEME.DARK ? THEME.LIGHT : THEME.DARK,
                );
              },
            },
            {
              label: t("labels.installPWA"),
              category: DEFAULT_CATEGORIES.app,
              predicate: () => !!pwaEvent,
              perform: () => {
                if (pwaEvent) {
                  pwaEvent.prompt();
                  pwaEvent.userChoice.then(() => {
                    // event cannot be reused, but we'll hopefully
                    // grab new one as the event should be fired again
                    pwaEvent = null;
                  });
                }
              },
            },
          ]}
        />
        {isVisualDebuggerEnabled() && excalidrawAPI && (
          <DebugCanvas
            appState={excalidrawAPI.getAppState()}
            scale={window.devicePixelRatio}
            ref={debugCanvasRef}
          />
        )}
      </Excalidraw>
      
      {/* Save Status Indicator */}
      {!isCollaborating && (
        <SaveIndicator 
          status={saveStatus} 
          lastSaved={lastSaved}
          username={currentUsername}
          onLoginClick={() => setShowAuthDialog(true)}
          onLogoutClick={handleLogout}
          onVersionHistoryClick={() => setShowVersionHistory(true)}
          onNewDiagram={() => {
            // Limpar canvas
            excalidrawAPI?.updateScene({
              elements: [],
              appState: {}
            });
            // Forçar novo session_id no próximo salvamento
            sessionStorage.removeItem("excalidraw-session-id");
          }}
          elements={excalidrawAPI?.getSceneElements()}
          appState={excalidrawAPI?.getAppState()}
          files={excalidrawAPI?.getFiles()}
        />
      )}

      {/* Preview Mode Banner */}
      {!isCollaborating && previewState && (
        <PreviewBanner
          onOpenHistory={() => setShowVersionHistory(true)}
          onCancelPreview={handleCancelPreview}
        />
      )}

      {/* View Only Mode Banner */}
      {!isCollaborating && currentUsername && isViewOnlyMode && (
        <ViewOnlyBanner
          onTakeControl={handleTakeControl}
        />
      )}

      {/* Auth Dialog */}
      <AuthDialog
        isOpen={showAuthDialog}
        onClose={() => setShowAuthDialog(false)}
        onSuccess={handleAuthSuccess}
      />

      {/* Session Choice Dialog */}
      <SessionChoiceDialog
        isOpen={showSessionChoiceDialog}
        onClose={() => {
          setShowSessionChoiceDialog(false);
          setSessionChoiceData(null);
        }}
        onChoice={handleSessionChoice}
        localElementCount={sessionChoiceData?.localElements.length || 0}
        remoteElementCount={sessionChoiceData?.remoteElements.length || 0}
      />

      {/* Version History Dialog */}
      <VersionHistory
        isOpen={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
        onRestore={handleRestoreVersion}
        onPreview={handlePreviewVersion}
      />
    </div>
  );
};

const ExcalidrawApp = () => {
  const isCloudExportWindow =
    window.location.pathname === "/excalidraw-plus-export";
  if (isCloudExportWindow) {
    return <ExcalidrawPlusIframeExport />;
  }

  return (
    <TopErrorBoundary>
      <Provider store={appJotaiStore}>
        <ExcalidrawWrapper />
      </Provider>
    </TopErrorBoundary>
  );
};

export default ExcalidrawApp;
