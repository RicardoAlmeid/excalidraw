import { useState } from "react";
import "./AuthDialog.scss";

interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (token: string, username: string) => void;
}

type AuthMode = "login" | "register";

export const AuthDialog = ({ isOpen, onClose, onSuccess }: AuthDialogProps) => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username || !password) {
      setError("Preencha todos os campos");
      return;
    }

    if (mode === "register" && password !== confirmPassword) {
      setError("As senhas não coincidem");
      return;
    }

    setLoading(true);

    try {
      const apiUrl = import.meta.env.VITE_APP_POSTGRES_API_BASE_URL || "http://localhost:4001";
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";

      const response = await fetch(`${apiUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao autenticar");
      }

      // Salvar token e username
      onSuccess(data.token, data.user.username);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === "login" ? "register" : "login");
    setError("");
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="auth-dialog-overlay" onClick={onClose}>
      <div className="auth-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="auth-dialog__close" onClick={onClose}>
          ×
        </button>

        <h2 className="auth-dialog__title">
          {mode === "login" ? "Entrar" : "Criar Conta"}
        </h2>

        <p className="auth-dialog__subtitle">
          {mode === "login"
            ? "Acesse seus desenhos em qualquer dispositivo"
            : "Crie uma conta para sincronizar seus desenhos"}
        </p>

        <form onSubmit={handleSubmit} className="auth-dialog__form">
          <div className="auth-dialog__field">
            <label htmlFor="username">Usuário</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="seu-usuario"
              autoComplete="username"
              disabled={loading}
              required
              minLength={3}
            />
          </div>

          <div className="auth-dialog__field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              disabled={loading}
              required
              minLength={6}
            />
          </div>

          {mode === "register" && (
            <div className="auth-dialog__field">
              <label htmlFor="confirmPassword">Confirmar Senha</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                disabled={loading}
                required
                minLength={6}
              />
            </div>
          )}

          {error && <div className="auth-dialog__error">{error}</div>}

          <button
            type="submit"
            className="auth-dialog__submit"
            disabled={loading}
          >
            {loading
              ? "Processando..."
              : mode === "login"
              ? "Entrar"
              : "Criar Conta"}
          </button>
        </form>

        <div className="auth-dialog__footer">
          <button
            type="button"
            onClick={switchMode}
            className="auth-dialog__switch"
            disabled={loading}
          >
            {mode === "login"
              ? "Não tem conta? Criar uma"
              : "Já tem conta? Entrar"}
          </button>
        </div>

        <div className="auth-dialog__info">
          <small>
            Seus dados são criptografados e armazenados com segurança.
          </small>
        </div>
      </div>
    </div>
  );
};
