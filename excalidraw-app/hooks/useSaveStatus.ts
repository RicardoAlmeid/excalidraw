import { useState, useCallback, useRef, useEffect } from "react";
import type { SaveStatus } from "../components/SaveIndicator";
import { saveEventEmitter } from "../data/SaveEvents";

export const useSaveStatus = () => {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const postgresStatusRef = useRef<"idle" | "saving" | "saved" | "error">("idle");
  const localStorageStatusRef = useRef<"idle" | "saving" | "saved" | "error">("idle");

  // Atualiza o status geral baseado nos status individuais
  const updateGeneralStatus = useCallback(() => {
    const pgStatus = postgresStatusRef.current;
    const lsStatus = localStorageStatusRef.current;

    // Se qualquer um está salvando, mostra "saving"
    if (pgStatus === "saving" || lsStatus === "saving") {
      setStatus("saving");
      return;
    }

    // Se qualquer um tem erro, mostra "error"
    if (pgStatus === "error" || lsStatus === "error") {
      setStatus("error");
      
      // Volta para "idle" após 5 segundos
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        postgresStatusRef.current = "idle";
        localStorageStatusRef.current = "idle";
        setStatus("idle");
      }, 5000);
      return;
    }

    // Se ambos salvaram OU se só postgres salvou (quando usuário está logado), mostra "saved"
    if ((pgStatus === "saved" && lsStatus === "saved") || 
        (pgStatus === "saved" && lsStatus === "idle")) {
      setStatus("saved");
      setLastSaved(new Date());

      // Volta para "idle" após 3 segundos
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        postgresStatusRef.current = "idle";
        localStorageStatusRef.current = "idle";
        setStatus("idle");
      }, 3000);
      return;
    }

    // Se pelo menos localStorage salvou (mesmo se postgres falhou), considera salvo
    if (lsStatus === "saved") {
      setStatus("saved");
      setLastSaved(new Date());

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        postgresStatusRef.current = "idle";
        localStorageStatusRef.current = "idle";
        setStatus("idle");
      }, 3000);
    }
  }, []);

  // Marca como "salvando"
  const markAsSaving = useCallback(() => {
    setStatus("saving");
  }, []);

  // Marca como "salvo" com sucesso
  const markAsSaved = useCallback(() => {
    setStatus("saved");
    setLastSaved(new Date());

    // Volta para "idle" após 3 segundos
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      setStatus("idle");
    }, 3000);
  }, []);

  // Marca como "erro"
  const markAsError = useCallback(() => {
    setStatus("error");

    // Volta para "idle" após 5 segundos
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      setStatus("idle");
    }, 5000);
  }, []);

  // Inscrever nos eventos de salvamento
  useEffect(() => {
    const unsubscribe = saveEventEmitter.subscribe((event) => {
      if (event.target === "localStorage" || event.target === "both") {
        if (event.type === "saving") {
          localStorageStatusRef.current = "saving";
        } else if (event.type === "saved") {
          localStorageStatusRef.current = "saved";
        } else if (event.type === "error") {
          localStorageStatusRef.current = "error";
        }
      }

      if (event.target === "postgres" || event.target === "both") {
        if (event.type === "saving") {
          postgresStatusRef.current = "saving";
        } else if (event.type === "saved") {
          postgresStatusRef.current = "saved";
        } else if (event.type === "error") {
          postgresStatusRef.current = "error";
        }
      }

      updateGeneralStatus();
    });

    return () => {
      unsubscribe();
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [updateGeneralStatus]);

  return {
    status,
    lastSaved,
    markAsSaving,
    markAsSaved,
    markAsError,
  };
};
