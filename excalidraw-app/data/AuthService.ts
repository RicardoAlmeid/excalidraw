const TOKEN_KEY = "excalidraw-auth-token";
const USERNAME_KEY = "excalidraw-username";

export interface AuthUser {
  username: string;
  token: string;
}

export const AuthService = {
  // Salvar token e username
  saveAuth(token: string, username: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USERNAME_KEY, username);
    } catch (error) {
      console.error("Erro ao salvar autenticação:", error);
    }
  },

  // Obter token
  getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (error) {
      console.error("Erro ao obter token:", error);
      return null;
    }
  },

  // Obter username
  getUsername(): string | null {
    try {
      return localStorage.getItem(USERNAME_KEY);
    } catch (error) {
      console.error("Erro ao obter username:", error);
      return null;
    }
  },

  // Obter dados do usuário autenticado
  getAuth(): AuthUser | null {
    const token = this.getToken();
    const username = this.getUsername();

    if (token && username) {
      return { token, username };
    }

    return null;
  },

  // Verificar se está autenticado
  isAuthenticated(): boolean {
    return this.getToken() !== null && this.getUsername() !== null;
  },

  // Limpar autenticação (logout)
  clearAuth(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USERNAME_KEY);
    } catch (error) {
      console.error("Erro ao limpar autenticação:", error);
    }
  },

  // Validar token com o servidor
  async validateToken(): Promise<boolean> {
    const token = this.getToken();

    if (!token) {
      return false;
    }

    try {
      const apiUrl =
        import.meta.env.VITE_APP_POSTGRES_API_BASE_URL ||
        "http://localhost:4001";

      const response = await fetch(`${apiUrl}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        this.clearAuth();
        return false;
      }

      return true;
    } catch (error) {
      console.error("Erro ao validar token:", error);
      return false;
    }
  },
};
