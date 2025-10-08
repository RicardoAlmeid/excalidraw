import { useState, useEffect } from "react";
import "./VersionHistory.scss";

interface Version {
  id: number;
  versionNumber: number;
  createdAt: string;
  elementCount: number;
  diagramName?: string | null;
  versionNote?: string | null;
  isAutoSave?: boolean;
}

interface VersionHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  onRestore: (versionId: number) => Promise<void>;
  onPreview?: (versionId: number) => void;
}

export const VersionHistory = ({ isOpen, onClose, onRestore, onPreview }: VersionHistoryProps) => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState<number | null>(null);
  const [showAllVersions, setShowAllVersions] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadVersions();
    }
  }, [isOpen, showAllVersions]);

  const loadVersions = async () => {
    setLoading(true);
    try {
      const { listSessionVersions, getSessionId } = await import("../data/PostgresLocalStorage");
      const currentSessionId = getSessionId();
      console.log('[VersionHistory] Carregando versões para session_id:', currentSessionId);
      
      const versionList = await listSessionVersions({ 
        includeAll: showAllVersions 
      });
      console.log('[VersionHistory] Versões carregadas:', versionList.length);
      
      setVersions(versionList);
    } catch (error) {
      console.error('Erro ao carregar versões:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMigrateLegacy = async () => {
    if (!confirm('Deseja associar todas as versões antigas ao diagrama atual?')) {
      return;
    }

    setMigrating(true);
    try {
      const { migrateLegacyVersions } = await import("../data/PostgresLocalStorage");
      const count = await migrateLegacyVersions();
      
      if (count > 0) {
        alert(`${count} versões antigas foram associadas ao diagrama atual`);
        await loadVersions();
      } else {
        alert('Nenhuma versão antiga encontrada para migrar');
      }
    } catch (error) {
      console.error('Erro ao migrar versões:', error);
      alert('Erro ao migrar versões');
    } finally {
      setMigrating(false);
    }
  };

  const handleDeleteVersion = async (versionId: number, versionNumber: number) => {
    if (!confirm(`Deseja excluir a Versão #${versionNumber}? Esta ação não pode ser desfeita.`)) {
      return;
    }

    setDeleting(versionId);
    try {
      const { deleteSessionVersion } = await import("../data/PostgresLocalStorage");
      const success = await deleteSessionVersion(versionId);
      
      if (success) {
        await loadVersions();
      } else {
        alert('Erro ao excluir versão');
      }
    } catch (error) {
      console.error('Erro ao excluir versão:', error);
      alert('Erro ao excluir versão');
    } finally {
      setDeleting(null);
    }
  };

  const handleClearAll = async () => {
    const message = showAllVersions 
      ? 'Deseja excluir TODAS as versões de TODOS os diagramas? Esta ação não pode ser desfeita!'
      : 'Deseja excluir todas as versões deste diagrama? Esta ação não pode ser desfeita!';
    
    if (!confirm(message)) {
      return;
    }

    setClearingAll(true);
    try {
      const { deleteAllSessionVersions } = await import("../data/PostgresLocalStorage");
      const count = await deleteAllSessionVersions({ 
        currentSessionOnly: !showAllVersions 
      });
      
      if (count > 0) {
        alert(`${count} versão(ões) excluída(s) com sucesso`);
        await loadVersions();
      } else {
        alert('Nenhuma versão encontrada para excluir');
      }
    } catch (error) {
      console.error('Erro ao limpar versões:', error);
      alert('Erro ao limpar versões');
    } finally {
      setClearingAll(false);
    }
  };

  const handleRestore = async (versionId: number) => {
    setRestoring(versionId);
    try {
      await onRestore(versionId);
      onClose();
    } catch (error) {
      console.error('Erro ao restaurar versão:', error);
    } finally {
      setRestoring(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins} min atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    if (diffDays < 7) return `${diffDays}d atrás`;

    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="version-history-overlay" onClick={onClose}>
      <div className="version-history" onClick={(e) => e.stopPropagation()}>
        <button className="version-history__close" onClick={onClose}>
          ×
        </button>

        <h2 className="version-history__title">
          <svg className="version-history__title-icon" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
            <polyline points="12 6 12 12 16 14" stroke="currentColor" strokeWidth="2"/>
          </svg>
          Histórico de Versões
        </h2>

        <p className="version-history__subtitle">
          Restaure versões anteriores do seu desenho
        </p>

        <div className="version-history__toolbar">
          <button
            className="version-history__toolbar-btn"
            onClick={() => setShowAllVersions(!showAllVersions)}
            disabled={loading}
          >
            {showAllVersions ? '📋 Apenas este diagrama' : '📚 Todas as versões'}
          </button>
          
          {!showAllVersions && (
            <button
              className="version-history__toolbar-btn version-history__toolbar-btn--migrate"
              onClick={handleMigrateLegacy}
              disabled={loading || migrating}
            >
              {migrating ? '⏳ Migrando...' : '🔄 Migrar versões antigas'}
            </button>
          )}

          {versions.length > 0 && (
            <button
              className="version-history__toolbar-btn version-history__toolbar-btn--danger"
              onClick={handleClearAll}
              disabled={loading || clearingAll}
            >
              {clearingAll ? '⏳ Limpando...' : '🗑️ Limpar todas'}
            </button>
          )}
        </div>

        {loading ? (
          <div className="version-history__loading">
            <div className="version-history__spinner"></div>
            <p>Carregando versões...</p>
          </div>
        ) : versions.length === 0 ? (
          <div className="version-history__empty">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="2"/>
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeWidth="2"/>
            </svg>
            <p>Nenhuma versão salva ainda</p>
            <small>Versões são criadas automaticamente ao fazer login com desenho local</small>
          </div>
        ) : (
          <div className="version-history__list">
            {versions.map((version) => (
              <div key={version.id} className="version-history__item">
                <div className="version-history__item-header">
                  <div className="version-history__item-info">
                    <h3 className="version-history__item-title">
                      {version.diagramName ? (
                        <>
                          {version.diagramName}
                          <span className="version-history__item-version-badge">
                            v{version.versionNumber}
                          </span>
                        </>
                      ) : (
                        `Versão #${version.versionNumber}`
                      )}
                      {version.isAutoSave && (
                        <span className="version-history__item-auto-badge" title="Salvamento automático">
                          ⏱️
                        </span>
                      )}
                    </h3>
                    {version.versionNote && (
                      <p className="version-history__item-note">
                        📝 {version.versionNote}
                      </p>
                    )}
                    <span className="version-history__item-date">
                      {formatDate(version.createdAt)}
                    </span>
                  </div>
                  <span className="version-history__item-count">
                    {version.elementCount} elemento{version.elementCount !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="version-history__item-actions">
                  {onPreview && (
                    <button
                      className="version-history__item-preview"
                      onClick={async () => {
                        setPreviewing(version.id);
                        try {
                          await onPreview(version.id);
                          // Fechar modal após visualizar para ver o diagrama completo
                          onClose();
                        } finally {
                          setPreviewing(null);
                        }
                      }}
                      disabled={restoring !== null || previewing !== null}
                      title="Pré-visualizar versão"
                    >
                      {previewing === version.id ? (
                        <>
                          <div className="version-history__spinner version-history__spinner--small"></div>
                          Carregando...
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 24 24" fill="none">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2"/>
                            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                          </svg>
                          Visualizar
                        </>
                      )}
                    </button>
                  )}
                  
                  <button
                    className="version-history__item-restore"
                    onClick={() => handleRestore(version.id)}
                    disabled={restoring !== null || previewing !== null || deleting !== null}
                  >
                    {restoring === version.id ? (
                      <>
                        <div className="version-history__spinner version-history__spinner--small"></div>
                        Restaurando...
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none">
                          <path d="M3 12a9 9 0 009 9 9 9 0 009-9 9 9 0 00-9-9" stroke="currentColor" strokeWidth="2"/>
                          <polyline points="3 4 3 12 11 12" stroke="currentColor" strokeWidth="2"/>
                        </svg>
                        Restaurar
                      </>
                    )}
                  </button>

                  <button
                    className="version-history__item-delete"
                    onClick={() => handleDeleteVersion(version.id, version.versionNumber)}
                    disabled={restoring !== null || previewing !== null || deleting !== null}
                    title="Excluir versão"
                  >
                    {deleting === version.id ? (
                      <>
                        <div className="version-history__spinner version-history__spinner--small"></div>
                      </>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none">
                        <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2"/>
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2"/>
                        <line x1="10" y1="11" x2="10" y2="17" stroke="currentColor" strokeWidth="2"/>
                        <line x1="14" y1="11" x2="14" y2="17" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="version-history__footer">
          <small>
            💡 Use "Visualizar" para ver a versão antes de restaurar
          </small>
        </div>
      </div>
    </div>
  );
};
