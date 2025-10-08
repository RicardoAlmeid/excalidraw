/**
 * Sistema de eventos para notificar o status de salvamento
 */

export type SaveEventType = "saving" | "saved" | "error";

export interface SaveEvent {
  type: SaveEventType;
  timestamp: Date;
  target: "localStorage" | "postgres" | "both";
}

type SaveEventListener = (event: SaveEvent) => void;

class SaveEventEmitter {
  private listeners: SaveEventListener[] = [];

  subscribe(listener: SaveEventListener): () => void {
    this.listeners.push(listener);
    
    // Retorna função de unsubscribe
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  emit(event: SaveEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error("Erro ao notificar listener de salvamento:", error);
      }
    });
  }

  emitSaving(target: SaveEvent["target"] = "both"): void {
    this.emit({
      type: "saving",
      timestamp: new Date(),
      target,
    });
  }

  emitSaved(target: SaveEvent["target"] = "both"): void {
    this.emit({
      type: "saved",
      timestamp: new Date(),
      target,
    });
  }

  emitError(target: SaveEvent["target"] = "both"): void {
    this.emit({
      type: "error",
      timestamp: new Date(),
      target,
    });
  }
}

// Instância global
export const saveEventEmitter = new SaveEventEmitter();
