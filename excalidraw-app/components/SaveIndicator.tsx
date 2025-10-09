import { useState, useEffect, useRef } from "react";
import { updateDiagramName, saveSessionVersion, getCurrentDiagramName } from "../data/PostgresLocalStorage";
import "./SaveIndicator.scss";

export type SaveStatus = "saved" | "saving" | "error" | "idle";

interface SaveIndicatorProps {
  status: SaveStatus;
  lastSaved?: Date | null;
  username?: string | null;
  onLoginClick?: () => void;
  onLogoutClick?: () => void;
  onVersionHistoryClick?: () => void;
  onNewDiagram?: () => void;
  elements?: readonly any[];
  appState?: any;
  files?: any;
}

export const SaveIndicator = ({ 
  status, 
  lastSaved,
  username,
  onLoginClick,
  onLogoutClick,
  onVersionHistoryClick,
  onNewDiagram,
  elements,
  appState,
  files
}: SaveIndicatorProps) => {
  const [showDetails, setShowDetails] = useState(false);
  const [keepTooltipOpen, setKeepTooltipOpen] = useState(false);
  const [diagramName, setDiagramName] = useState("");
  const [versionNote, setVersionNote] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameSaveSuccess, setNameSaveSuccess] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [currentDiagramName, setCurrentDiagramName] = useState<string | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Carregar nome do diagrama ao montar componente
  useEffect(() => {
    const loadDiagramName = async () => {
      if (username) {
        const name = await getCurrentDiagramName();
        setCurrentDiagramName(name);
        if (name) {
          setDiagramName(name);
        } else {
          // Se não há nome, mostrar campo de edição automaticamente
          setTimeout(() => {
            setKeepTooltipOpen(true);
            setShowDetails(true);
          }, 1000);
        }
      }
    };
    loadDiagramName();
  }, [username]);

  // Escutar evento de diagrama carregado
  useEffect(() => {
    const handleDiagramLoaded = (event: CustomEvent) => {
      const { diagramName } = event.detail;
      if (diagramName) {
        setDiagramName(diagramName);
        setCurrentDiagramName(diagramName);
        console.log('[SaveIndicator] Nome do diagrama atualizado:', diagramName);
      }
    };

    window.addEventListener('diagram-loaded', handleDiagramLoaded as EventListener);
    
    return () => {
      window.removeEventListener('diagram-loaded', handleDiagramLoaded as EventListener);
    };
  }, []);

  // Handler para salvar nome do diagrama e nota da versão
  const handleSaveDiagramName = async () => {
    if (!diagramName.trim() || !username) return;
    
    setIsSavingName(true);
    setNameSaveSuccess(false);

    try {
      const newName = diagramName.trim();
      const isNameChange = currentDiagramName && currentDiagramName !== newName;
      
      if (isNameChange) {
        // FORK: Nome mudou - criar novo diagrama (novo session_id)
        console.log(`[SaveIndicator] Nome mudou de "${currentDiagramName}" para "${newName}" - criando fork`);
        
        // Salvar versão atual antes do fork
        if (elements && appState) {
          await saveSessionVersion(
            elements, 
            appState, 
            files || {}, 
            false, 
            currentDiagramName,
            "Versão antes de renomear diagrama"
          );
        }
        
        // Emitir evento para criar novo session_id
        window.dispatchEvent(new CustomEvent('diagram-fork', { 
          detail: { newDiagramName: newName } 
        }));
        
        setCurrentDiagramName(newName);
        setIsEditingName(false);
        setNameSaveSuccess(true);
        
        setTimeout(() => {
          setNameSaveSuccess(false);
          setVersionNote("");
        }, 2000);
      } else {
        // Primeiro salvamento ou mesmo nome - apenas atualizar
        const updated = await updateDiagramName(newName);
        
        // Criar uma nova versão com o nome e nota (salvamento manual)
        if (elements && appState) {
          await saveSessionVersion(
            elements, 
            appState, 
            files || {}, 
            false, 
            newName,
            versionNote.trim() || null
          );
        }
        
        if (updated) {
          setCurrentDiagramName(newName);
          setIsEditingName(false);
          setNameSaveSuccess(true);
          
          // Emitir evento para notificar App.tsx sobre mudança no nome do diagrama
          window.dispatchEvent(new CustomEvent('diagram-name-changed', { 
            detail: { diagramName: newName } 
          }));
          
          setTimeout(() => {
            setNameSaveSuccess(false);
            setVersionNote("");
          }, 2000);
        }
      }
    } catch (error) {
      console.error("Erro ao salvar nome do diagrama:", error);
    } finally {
      setIsSavingName(false);
    }
  };

  // Handler para criar novo diagrama
  const handleNewDiagram = async () => {
    if (!username || !elements || !appState) return;

    const confirmed = window.confirm(
      "Deseja salvar o trabalho atual e criar um novo diagrama?\n\nIsso irá limpar o canvas e criar um novo diagrama vazio."
    );

    if (!confirmed) return;

    try {
      // Salvar estado atual antes de limpar
      await saveSessionVersion(
        elements,
        appState,
        files || {},
        false,
        currentDiagramName || diagramName.trim() || "Sem nome",
        "Salvamento automático antes de criar novo diagrama"
      );

      // Chamar callback para limpar canvas e criar novo session_id
      if (onNewDiagram) {
        onNewDiagram();
        // Reset estados locais
        setCurrentDiagramName(null);
        setDiagramName("");
        setVersionNote("");
        setIsEditingName(false);
      }
    } catch (error) {
      console.error("Erro ao criar novo diagrama:", error);
      alert("Erro ao criar novo diagrama. Tente novamente.");
    }
  };

  // Manter tooltip aberto quando o mouse estiver sobre ele
  const handleTooltipMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setKeepTooltipOpen(true);
  };

  const handleTooltipMouseLeave = () => {
    setKeepTooltipOpen(false);
    setShowDetails(false);
  };

  const handleIndicatorMouseLeave = () => {
    if (!keepTooltipOpen) {
      // Adicionar delay de 200ms antes de fechar
      hideTimeoutRef.current = setTimeout(() => {
        setShowDetails(false);
      }, 200);
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  const shouldShowTooltip = showDetails || keepTooltipOpen;

  const getStatusInfo = () => {
    switch (status) {
      case "saved":
        return {
          icon: (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 7.5c1.5 0 3 1 3 3 0 2-1.5 3-3 3H6c-2 0-3.5-1.5-3.5-3.5S4 6.5 6 6.5c0-2.5 2-4.5 4.5-4.5 2 0 3.7 1.3 4.3 3.1" stroke="#4ade80" />
            </svg>
          ),
          text: "Salvo",
          className: "saved",
          color: "#4ade80",
        };
      case "saving":
        return {
          icon: (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 7.5c1.5 0 3 1 3 3 0 2-1.5 3-3 3H6c-2 0-3.5-1.5-3.5-3.5S4 6.5 6 6.5c0-2.5 2-4.5 4.5-4.5 2 0 3.7 1.3 4.3 3.1" stroke="#60a5fa" />
            </svg>
          ),
          text: "Salvando...",
          className: "saving",
          color: "#60a5fa",
        };
      case "error":
        return {
          icon: (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 7.5c1.5 0 3 1 3 3 0 2-1.5 3-3 3H6c-2 0-3.5-1.5-3.5-3.5S4 6.5 6 6.5c0-2.5 2-4.5 4.5-4.5 2 0 3.7 1.3 4.3 3.1" stroke="#f87171" />
              <path d="M10 8v4M10 14h.01" stroke="#f87171" />
            </svg>
          ),
          text: "Erro ao salvar",
          className: "error",
          color: "#f87171",
        };
      default:
        return {
          icon: (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 7.5c1.5 0 3 1 3 3 0 2-1.5 3-3 3H6c-2 0-3.5-1.5-3.5-3.5S4 6.5 6 6.5c0-2.5 2-4.5 4.5-4.5 2 0 3.7 1.3 4.3 3.1" stroke="#94a3b8" />
            </svg>
          ),
          text: "Não salvo",
          className: "idle",
          color: "#94a3b8",
        };
    }
  };

  const statusInfo = getStatusInfo();

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 10) {
      return "agora mesmo";
    } else if (seconds < 60) {
      return `${seconds}s atrás`;
    } else if (minutes < 60) {
      return `${minutes}m atrás`;
    } else if (hours < 24) {
      return `${hours}h atrás`;
    } else {
      return date.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  };

  return (
    <>
      <div
        className={`save-indicator save-indicator--${statusInfo.className}`}
        onMouseEnter={() => {
          if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
          }
          setShowDetails(true);
        }}
        onMouseLeave={handleIndicatorMouseLeave}
        title={
          status === "saved" && lastSaved
            ? `Última atualização: ${formatTime(lastSaved)}`
            : statusInfo.text
        }
      >
        <div className="save-indicator__icon" style={{ color: statusInfo.color }}>
          {statusInfo.icon}
        </div>
        <div className="save-indicator__text">{statusInfo.text}</div>

        {shouldShowTooltip && (
          <div 
            className="save-indicator__tooltip"
            onMouseEnter={handleTooltipMouseEnter}
            onMouseLeave={handleTooltipMouseLeave}
          >
            <div className="save-indicator__tooltip-title">
              {status === "saved" ? "Salvo com segurança" : statusInfo.text}
            </div>
            <div className="save-indicator__tooltip-details">
              <div>
                <strong>localStorage:</strong> {status === "saved" ? "✓" : status === "saving" ? "⏳" : status === "error" ? "✗" : "⊝"}
              </div>
              <div>
                <strong>PostgreSQL:</strong> {status === "saved" ? "✓" : status === "saving" ? "⏳" : status === "error" ? "✗" : "⊝"}
              </div>
              {username && (
                <div>
                  <strong>Usuário:</strong> {username}
                </div>
              )}
              {lastSaved && (
                <div className="save-indicator__tooltip-time">
                  {formatTime(lastSaved)}
                </div>
              )}
            </div>
            <div className="save-indicator__tooltip-footer">
              {username ? (
                <>
                  <div className="save-indicator__sync-message">Sincronizado em todos os dispositivos</div>
                  
                  {/* Campos para nomear diagrama e adicionar nota */}
                  <div className="save-indicator__diagram-fields">
                    {!currentDiagramName && !isEditingName && (
                      <div style={{ 
                        background: '#fef3c7', 
                        color: '#92400e', 
                        padding: '8px', 
                        borderRadius: '6px', 
                        fontSize: '0.75rem',
                        marginBottom: '12px',
                        textAlign: 'center',
                        fontWeight: 600
                      }}>
                        ⚠️ Defina um nome para habilitar salvamento automático
                      </div>
                    )}
                    
                    <div className="save-indicator__field-group">
                      <label className="save-indicator__field-label">Nome do Diagrama *</label>
                      {currentDiagramName && !isEditingName ? (
                        <div className="save-indicator__diagram-display">
                          <span className="save-indicator__diagram-name">{currentDiagramName}</span>
                          <button
                            className="save-indicator__edit-button"
                            onClick={() => setIsEditingName(true)}
                            title="Editar nome do diagrama"
                          >
                            ✏️
                          </button>
                        </div>
                      ) : (
                        <input
                          type="text"
                          placeholder="Ex: Diagrama de fluxo de venda"
                          value={diagramName}
                          onChange={(e) => setDiagramName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && diagramName.trim()) {
                              handleSaveDiagramName();
                            }
                          }}
                          disabled={isSavingName}
                          className="save-indicator__diagram-input"
                          maxLength={100}
                          autoFocus={!currentDiagramName}
                        />
                      )}
                    </div>
                    
                    <div className="save-indicator__field-group">
                      <label className="save-indicator__field-label">Nota desta Versão (opcional)</label>
                      <input
                        type="text"
                        placeholder="Ex: Adicionado fluxo de caixa"
                        value={versionNote}
                        onChange={(e) => setVersionNote(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && diagramName.trim()) {
                            handleSaveDiagramName();
                          }
                        }}
                        disabled={isSavingName}
                        className="save-indicator__diagram-input"
                        maxLength={200}
                      />
                    </div>
                    
                    <button
                      className="save-indicator__tooltip-button save-indicator__tooltip-button--primary"
                      onClick={handleSaveDiagramName}
                      disabled={isSavingName || !diagramName.trim()}
                      title="Salva uma nova versão com o nome e nota"
                    >
                      {isSavingName ? "⏳ Salvando..." : nameSaveSuccess ? "✓ Salvo!" : "💾 Salvar Versão"}
                    </button>
                  </div>
                  
                  <div className="save-indicator__tooltip-buttons">
                    {onVersionHistoryClick && (
                      <button 
                        className="save-indicator__tooltip-button save-indicator__tooltip-button--secondary"
                        onClick={() => {
                          onVersionHistoryClick();
                          setShowDetails(false);
                        }}
                      >
                        📜 Versões
                      </button>
                    )}
                    {onNewDiagram && (
                      <button 
                        className="save-indicator__tooltip-button save-indicator__tooltip-button--success"
                        onClick={handleNewDiagram}
                        title="Salva o trabalho atual e cria um novo diagrama vazio"
                      >
                        ➕ Novo Diagrama
                      </button>
                    )}
                    {onLogoutClick && (
                      <button 
                        className="save-indicator__tooltip-button"
                        onClick={onLogoutClick}
                      >
                        Sair
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div>{status === "saved" ? "Seguro para fechar o navegador" : "Aguardando salvamento..."}</div>
                  {onLoginClick && (
                    <button 
                      className="save-indicator__tooltip-button"
                      onClick={onLoginClick}
                    >
                      Entrar para sincronizar
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};
