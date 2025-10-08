import { useState } from "react";
import "./SessionChoiceDialog.scss";

interface SessionChoiceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onChoice: (choice: "load" | "keep") => void;
  localElementCount: number;
  remoteElementCount: number;
}

export const SessionChoiceDialog = ({
  isOpen,
  onClose,
  onChoice,
  localElementCount,
  remoteElementCount,
}: SessionChoiceDialogProps) => {
  const [loading, setLoading] = useState(false);

  if (!isOpen) {
    return null;
  }

  const handleChoice = async (choice: "load" | "keep") => {
    setLoading(true);
    try {
      await onChoice(choice);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="session-choice-dialog-overlay" onClick={onClose}>
      <div className="session-choice-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="session-choice-dialog__close" onClick={onClose}>
          ×
        </button>

        <h2 className="session-choice-dialog__title">
          Desenho Detectado
        </h2>

        <p className="session-choice-dialog__subtitle">
          Você tem um desenho local e outro salvo no servidor. O que deseja fazer?
        </p>

        <div className="session-choice-dialog__options">
          <div className="session-choice-dialog__option">
            <div className="session-choice-dialog__option-header">
              <svg className="session-choice-dialog__icon" viewBox="0 0 24 24" fill="none">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" stroke="currentColor" strokeWidth="2"/>
                <polyline points="17 21 17 13 7 13 7 21" stroke="currentColor" strokeWidth="2"/>
                <polyline points="7 3 7 8 15 8" stroke="currentColor" strokeWidth="2"/>
              </svg>
              <h3>Desenho Local</h3>
            </div>
            <p className="session-choice-dialog__info">
              {localElementCount} elemento{localElementCount !== 1 ? "s" : ""}
            </p>
            <button
              className="session-choice-dialog__button session-choice-dialog__button--primary"
              onClick={() => handleChoice("keep")}
              disabled={loading}
            >
              {loading ? "Salvando..." : "Manter Este"}
            </button>
            <p className="session-choice-dialog__note">
              O desenho do servidor será salvo como versão anterior
            </p>
          </div>

          <div className="session-choice-dialog__divider">
            <span>ou</span>
          </div>

          <div className="session-choice-dialog__option">
            <div className="session-choice-dialog__option-header">
              <svg className="session-choice-dialog__icon" viewBox="0 0 24 24" fill="none">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2"/>
                <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87m-4-12a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2"/>
              </svg>
              <h3>Desenho do Servidor</h3>
            </div>
            <p className="session-choice-dialog__info">
              {remoteElementCount} elemento{remoteElementCount !== 1 ? "s" : ""}
            </p>
            <button
              className="session-choice-dialog__button session-choice-dialog__button--secondary"
              onClick={() => handleChoice("load")}
              disabled={loading}
            >
              {loading ? "Carregando..." : "Carregar Este"}
            </button>
            <p className="session-choice-dialog__note">
              O desenho local será descartado
            </p>
          </div>
        </div>

        <div className="session-choice-dialog__footer">
          <small>
            💡 Você pode recuperar versões anteriores no menu "Versões"
          </small>
        </div>
      </div>
    </div>
  );
};
