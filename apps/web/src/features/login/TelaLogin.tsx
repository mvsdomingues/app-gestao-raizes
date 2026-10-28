import { useState, type FormEvent } from 'react';
import { useSessao } from '../../app/sessao';

/** Tela de entrada: apenas login e senha. */
export function TelaLogin() {
  const { entrar, aviso } = useSessao();
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [entrando, setEntrando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !senha) return setErro('Informe login e senha.');
    setEntrando(true);
    setErro('');
    try {
      await entrar(login.trim(), senha);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setSenha('');
    } finally {
      setEntrando(false);
    }
  };

  return (
    <div className="login-fundo">
      <form className="login-card" onSubmit={enviar} id="form-login" noValidate>
        <div className="login-marca">
          <span className="login-raizes">Raízes</span>
          <span className="login-sub">Personalizados</span>
        </div>

        {aviso && !erro && <div className="form-mensagem erro">{aviso}</div>}
        {erro && <div className="form-mensagem erro" role="alert">{erro}</div>}

        <div className="custom-modal-field">
          <label className="custom-modal-label" htmlFor="login-usuario">
            Login
          </label>
          <input
            id="login-usuario"
            className="custom-input"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
        </div>
        <div className="custom-modal-field">
          <label className="custom-modal-label" htmlFor="login-senha">
            Senha
          </label>
          <input
            id="login-senha"
            className="custom-input"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary login-entrar" id="btn-entrar" disabled={entrando}>
          {entrando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
