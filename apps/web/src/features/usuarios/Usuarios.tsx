import { useCallback, useEffect, useRef, useState } from 'react';
import type { Usuario } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { useSessao } from '../../app/sessao';
import { Carregando } from '../../components/Carregando';
import { api } from '../../lib/api';
import { FormularioUsuario, type ModoFormulario } from './FormularioUsuario';

type Estado = { tipo: 'carregando' } | { tipo: 'erro'; msg: string } | { tipo: 'ok'; linhas: Usuario[] };

/** "2026-10-28T19:53:05" → "28/10/2026 19:53" */
function formatarData(v: string | null): string {
  const m = v ? /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)/.exec(v) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : (v ?? '');
}

/** Tela "Usuários": inclusão, alteração de nome/senha, inativação e reativação (nunca exclui). */
export function Usuarios() {
  const { tela, visitas, abrirAcessos } = useApp();
  const { usuario: eu, pode, atualizar } = useSessao();
  const [busca, setBusca] = useState('');
  const [inativos, setInativos] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [modo, setModo] = useState<ModoFormulario | null>(null);
  const [aviso, setAviso] = useState('');
  const filtros = useRef({ busca, inativos });
  filtros.current = { busca, inativos };
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async () => {
    try {
      const { busca: q, inativos: ina } = filtros.current;
      setEstado({ tipo: 'ok', linhas: await api.usuarios(q.trim(), ina) });
    } catch (e) {
      setEstado({ tipo: 'erro', msg: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    if (visitas.usuarios > 0) void carregar();
  }, [visitas.usuarios, carregar]);

  const inativar = async (u: Usuario) => {
    if (
      !confirm(
        `Inativar o usuário ${u.nome} (${u.login})?\n\n` +
          'Ele não poderá mais entrar no sistema até ser reativado. O cadastro, os acessos e o histórico ' +
          'das ações dele são mantidos.',
      )
    ) {
      return;
    }
    try {
      await api.inativarUsuario(u.id);
      setAviso(`✓ Usuário ${u.login} inativado.`);
      void carregar();
    } catch (e) {
      alert('Não foi possível inativar: ' + (e instanceof Error ? e.message : e));
    }
  };

  const reativar = async (u: Usuario) => {
    if (!confirm(`Reativar o usuário ${u.nome} (${u.login})?\n\nEle volta a entrar com os mesmos acessos de antes.`)) return;
    try {
      await api.reativarUsuario(u.id);
      setAviso(`✓ Usuário ${u.login} reativado.`);
      void carregar();
    } catch (e) {
      alert('Não foi possível reativar: ' + (e instanceof Error ? e.message : e));
    }
  };

  const linhas = estado.tipo === 'ok' ? estado.linhas : [];

  return (
    <div id="view-usuarios" className="view-cadastro" style={{ display: tela === 'usuarios' ? 'block' : 'none' }}>
      <div className="cadastro-wrap">
        <div className="carrinho-header-bar">
          <div>
            <h2 className="carrinho-page-title">Usuários</h2>
            <p className="carrinho-page-sub">
              Quem pode entrar no sistema. As telas liberadas para cada usuário são definidas em Acessos.
            </p>
          </div>
          <button className="btn-novo" id="btn-novo-usuario" onClick={() => setModo({ tipo: 'novo' })}>
            + Novo usuário
          </button>
        </div>

        <div className="cadastro-toolbar">
          <div className="search-input-wrap">
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              id="busca-usuarios"
              type="text"
              placeholder="Buscar por nome ou login…"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                filtros.current.busca = e.target.value;
                if (debounce.current) clearTimeout(debounce.current);
                debounce.current = setTimeout(() => void carregar(), 300);
              }}
            />
          </div>
          <label className="usuarios-inativos">
            <input
              type="checkbox"
              id="mostrar-inativos"
              checked={inativos}
              onChange={(e) => {
                setInativos(e.target.checked);
                filtros.current.inativos = e.target.checked;
                void carregar();
              }}
            />
            Mostrar inativos
          </label>
          <span className="result-info">
            {estado.tipo === 'ok' && `${linhas.length} usuário${linhas.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {aviso && (
          <div className="form-mensagem ok" onClick={() => setAviso('')}>
            {aviso}
          </div>
        )}

        {estado.tipo === 'carregando' ? (
          <Carregando texto="Carregando usuários…" />
        ) : estado.tipo === 'erro' ? (
          <div className="orc-empty-state">
            <h2>Erro ao carregar os usuários</h2>
            <p>{estado.msg}</p>
          </div>
        ) : linhas.length === 0 ? (
          <div className="orc-empty-state">
            <div className="orc-empty-icon">👤</div>
            <h2>Nenhum usuário encontrado</h2>
            <p>Tente outro termo de busca.</p>
          </div>
        ) : (
          <table className="orc-table cadastro-table" id="tabela-usuarios">
            <thead>
              <tr>
                <th>Nome</th>
                <th style={{ width: 170 }}>Login</th>
                <th style={{ width: 120 }}>Situação</th>
                <th style={{ width: 150 }}>Cadastrado em</th>
                <th style={{ width: 150 }} />
              </tr>
            </thead>
            <tbody>
              {linhas.map((u) => (
                <tr
                  key={u.id}
                  className={`cadastro-row${u.ativo ? '' : ' usuario-inativo'}`}
                  data-login={u.login}
                  onDoubleClick={() => setModo({ tipo: 'editar', usuario: u })}
                >
                  <td className="cadastro-nome">
                    {u.nome}
                    {u.id === eu?.id && <span className="tag-voce">você</span>}
                  </td>
                  <td>
                    <span className="usuario-login">{u.login}</span>
                  </td>
                  <td>
                    {u.ativo ? (
                      <span className="tag-usuario ativo">Ativo</span>
                    ) : (
                      <span className="tag-usuario inativo" title={`Inativado em ${formatarData(u.inativado_em)}`}>
                        Inativo
                      </span>
                    )}
                  </td>
                  <td className="cadastro-data">{formatarData(u.criado)}</td>
                  <td className="cadastro-acoes">
                    {u.ativo && pode('acessos') && (
                      <button className="cadastro-acao" title="Telas que pode acessar" onClick={() => abrirAcessos(u.id)}>
                        🔑
                      </button>
                    )}
                    <button
                      className="cadastro-acao"
                      title="Alterar nome ou senha"
                      onClick={() => setModo({ tipo: 'editar', usuario: u })}
                    >
                      ✎
                    </button>
                    {u.ativo ? (
                      <button
                        className="cadastro-acao perigo btn-inativar"
                        title={u.id === eu?.id ? 'Você não pode inativar o seu próprio usuário' : 'Inativar'}
                        disabled={u.id === eu?.id}
                        onClick={() => void inativar(u)}
                      >
                        ⏻
                      </button>
                    ) : (
                      <button className="cadastro-acao btn-reativar" title="Reativar" onClick={() => void reativar(u)}>
                        ↺
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <FormularioUsuario
        modo={modo}
        fechar={() => setModo(null)}
        salvo={(msg, u) => {
          setModo(null);
          setAviso(msg);
          void carregar();
          if (u.id === eu?.id) void atualizar(); // alterou a si mesmo
        }}
      />
    </div>
  );
}
