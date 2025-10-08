import { useState } from "react";
import "./ViewOnlyBanner.scss";

interface ViewOnlyBannerProps {
  onTakeControl: () => Promise<void>;
}

export const ViewOnlyBanner = ({ onTakeControl }: ViewOnlyBannerProps) => {
  const [isTransferring, setIsTransferring] = useState(false);

  const handleTakeControl = async () => {
    setIsTransferring(true);
    try {
      await onTakeControl();
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <div className="view-only-banner">
      <div className="view-only-banner__content">
        <div className="view-only-banner__icon">👁️</div>
        <div className="view-only-banner__text">
          <strong>Modo Somente Visualização</strong>
          <p>Outra sessão está editando este diagrama. Suas alterações não serão salvas.</p>
        </div>
        <button
          className="view-only-banner__button"
          onClick={handleTakeControl}
          disabled={isTransferring}
        >
          {isTransferring ? "⏳ Transferindo..." : "🔄 Assumir Controle"}
        </button>
      </div>
    </div>
  );
};
