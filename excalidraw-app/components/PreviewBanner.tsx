import "./PreviewBanner.scss";

interface PreviewBannerProps {
  onOpenHistory: () => void;
  onCancelPreview: () => void;
}

export const PreviewBanner = ({ onOpenHistory, onCancelPreview }: PreviewBannerProps) => {
  return (
    <div className="preview-banner">
      <div className="preview-banner__content">
        <div className="preview-banner__info">
          <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
            <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span className="preview-banner__text">
            <strong>Modo Preview</strong> - Visualizando versão anterior
          </span>
        </div>
        
        <div className="preview-banner__actions">
          <button
            className="preview-banner__btn preview-banner__btn--secondary"
            onClick={onOpenHistory}
            title="Ver outras versões"
          >
            📜 Histórico
          </button>
          <button
            className="preview-banner__btn preview-banner__btn--primary"
            onClick={onCancelPreview}
            title="Voltar ao diagrama original"
          >
            ← Voltar ao Original
          </button>
        </div>
      </div>
    </div>
  );
};
