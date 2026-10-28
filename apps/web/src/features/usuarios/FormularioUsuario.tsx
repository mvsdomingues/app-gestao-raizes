import { useEffect, useState } from 'react';
import { LOGIN_MAX, SENHA_MIN, validarLogin, validarSenha, type Usuario, type UsuarioSessao } from '@raizes/shared';
import { api } from '../../lib/api';

/**
 * Formulário de usuário (modal), usado em três situações:
 * - 'novo': inclusão (nome, login e senha);
 * - 'editar': o administrador altera nome e/ou senha de outro usuário;
 * - 'meus-dados': o próprio usuário altera nome e/ou senha (exige a senha atual).
 * O login nunca pode ser alterado depois de criado.
 */
export type ModoFormulario = { tipo: 'novo' } | { tipo: 'editar'; usuario: Usuario } | { tipo: 'meus-dados'; usuario: UsuarioSessao };

interface Props {
  modo: ModoFormulario | null;
  fechar: () => void;
  salvo: (mensagem: string, u: Usuario | UsuarioSessao) => void;
}

export function FormularioUsuario({ modo, fechar, salvo }: Props) {
  const [nome, setNome] = useState('');
  const [login, setLogin] = useState('');
  const [senhaAtual, setSenhaAtual] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!modo) return;
    setNome(modo.tipo === 'novo' ? '' : modo.usuario.nome);
    setLogin(modo.tipo === 'novo' ? '' : modo.usuario.login);
    setSenhaAtual('');
    setSenha('');
    setConfirmacao('');
    setErro('');
  }, [modo]);

  if (!modo) return null;
  const novo = modo.tipo === 'novo';
  const meus = modo.tipo === 'meus-dados';
  const trocandoSenha = novo || !!senha || !!confirmacao || (meus && !!senhaAtual);

  // Validação ao digitar (as mesmas regras do servidor)
  const erroLogin = novo && login ? validarLogin(login) : null;
  const erroSenha = senha ? validarSenha(senha) : null;
  const erroConfirmacao = confirmacao && senha !== confirmacao ? 'As senhas não conferem' : null;

  const salvar = async () => {
    setErro('');
    if (!nome.trim()) return setErro('Informe o nome.');
    if (novo) {
      const e = validarLogin(login.trim());
      if (e) return setErro(e + '.');
    }
    if (trocandoSenha) {
      if (meus && !senhaAtual) return setErro('Informe a senha atual para trocar a senha.');
      const e = validarSenha(senha);
      if (e) return setErro(e + '.');
      if (senha !== confirmacao) return setErro('A confirmação não confere com a nova senha.');
    }
    setSalvando(true);
    try {
      if (novo) {
        const u = await api.criarUsuario({ nome: nome.trim(), login: login.trim(), senha });
        salvo(`✓ Usuário ${u.login} cadastrado. Defina as telas que ele pode acessar em Acessos.`, u);
      } else if (meus) {
        const u = await api.salvarMeusDados({
          nome: nome.trim(),
          ...(trocandoSenha ? { senha_atual: senhaAtual, senha_nova: senha } : {}),
        });
        salvo(trocandoSenha ? '✓ Dados e senha atualizados.' : '✓ Dados atualizados.', u);
      } else {
        const u = await api.alterarUsuario(modo.usuario.id, { nome: nome.trim(), ...(senha ? { senha } : {}) });
        salvo(senha ? `✓ Senha de ${u.login} alterada.` : `✓ Usuário ${u.login} atualizado.`, u);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  const titulo = novo ? 'Novo usuário' : meus ? 'Meus dados' : `Alterar usuário ${modo.usuario.login}`;

  return (
    <div
      className="custom-modal-backdrop open"
      id="modal-usuario"
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <form
        className="custom-modal-card modal-usuario"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
        noValidate
      >
        <div className="custom-modal-header">
          <h3 className="custom-modal-title">{titulo}</h3>
          <button type="button" className="custom-modal-close" onClick={fechar} aria-label="Fechar">
            ✕
          </button>
        </div>
        <p className="custom-modal-sub">
          {novo
            ? 'O login é a identificação única do usuário e não poderá ser alterado nem reaproveitado.'
            : 'O login não pode ser alterado. Deixe a senha em branco para mantê-la.'}
        </p>

        <div className="custom-modal-field">
          <label className="custom-modal-label" htmlFor="usuario-nome">
            Nome *
          </label>
          <input
            id="usuario-nome"
            className="custom-input"
            maxLength={120}
            value={nome}
            autoFocus
            onChange={(e) => setNome(e.target.value)}
          />
        </div>

        <div className="custom-modal-field">
          <label className="custom-modal-label" htmlFor="usuario-login">
            Login {novo && '*'}
          </label>
          <input
            id="usuario-login"
            className={`custom-input${erroLogin ? ' invalido' : ''}`}
            maxLength={LOGIN_MAX}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={login}
            disabled={!novo}
            onChange={(e) => setLogin(e.target.value)}
          />
          <div className={`campo-dica${erroLogin ? ' erro' : ''}`}>
            {erroLogin ?? (novo ? 'Somente letras e números, sem acentos, espaços ou caracteres especiais.' : 'Chave única do usuário.')}
          </div>
        </div>

        {meus && (
          <div className="custom-modal-field">
            <label className="custom-modal-label" htmlFor="usuario-senha-atual">
              Senha atual {trocandoSenha && '*'}
            </label>
            <input
              id="usuario-senha-atual"
              className="custom-input"
              type="password"
              autoComplete="current-password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
            />
          </div>
        )}

        <div className="custom-modal-row">
          <div className="custom-modal-field" style={{ flex: 1 }}>
            <label className="custom-modal-label" htmlFor="usuario-senha">
              {novo ? 'Senha *' : 'Nova senha'}
            </label>
            <input
              id="usuario-senha"
              className={`custom-input${erroSenha ? ' invalido' : ''}`}
              type="password"
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </div>
          <div className="custom-modal-field" style={{ flex: 1 }}>
            <label className="custom-modal-label" htmlFor="usuario-senha-confirmacao">
              Confirmar senha {trocandoSenha && '*'}
            </label>
            <input
              id="usuario-senha-confirmacao"
              className={`custom-input${erroConfirmacao ? ' invalido' : ''}`}
              type="password"
              autoComplete="new-password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
            />
          </div>
        </div>
        <div className={`campo-dica${erroSenha || erroConfirmacao ? ' erro' : ''}`} style={{ marginTop: -8, marginBottom: 14 }}>
          {erroSenha ?? erroConfirmacao ?? `Mínimo de ${SENHA_MIN} caracteres, com letras e números.`}
        </div>

        {erro && <div className="form-mensagem erro">{erro}</div>}

        <div className="custom-modal-actions">
          <button type="button" className="btn-secondary" onClick={fechar}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" id="btn-salvar-usuario" disabled={salvando}>
            {salvando ? 'Salvando…' : novo ? 'Cadastrar' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}
