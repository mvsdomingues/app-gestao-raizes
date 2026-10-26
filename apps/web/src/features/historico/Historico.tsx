import { useEffect, useState } from 'react';
import { formatBRL, type ResumoOrcamento } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { Carregando } from '../../components/Carregando';
import { api } from '../../lib/api';

type Estado = { tipo: 'carregando' } | { tipo: 'erro' } | { tipo: 'ok'; linhas: ResumoOrcamento[] };

function formatarData(dataHora: string): string {
  const d = new Date(dataHora);
  if (Number.isNaN(d.getTime())) return dataHora;
  return (
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' às ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
}

/** Aba "Histórico": todos os orçamentos salvos, do mais recente ao mais antigo. */
export function Historico() {
  const { tela, visitas, mostrarOrcamento } = useApp();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });

  useEffect(() => {
    if (visitas.historico === 0) return;
    let ativo = true;
    setEstado({ tipo: 'carregando' });
    api.orcamentos().then(
      (linhas) => ativo && setEstado({ tipo: 'ok', linhas }),
      (e) => {
        console.error(e);
        if (ativo) setEstado({ tipo: 'erro' });
      },
    );
    return () => {
      ativo = false;
    };
  }, [visitas.historico]);

  const abrir = async (id: number) => {
    try {
      const o = await api.orcamento(id);
      mostrarOrcamento({
        numero: o.numero,
        dataHora: o.data_hora,
        itens: o.itens,
        subtotal: o.subtotal,
        frete: o.frete,
        total: o.total,
      });
    } catch (e) {
      console.error(e);
      alert('Não foi possível abrir este orçamento.');
    }
  };

  return (
    <div id="view-historico" style={{ display: tela === 'historico' ? 'block' : 'none' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div className="status-page-title">Histórico de Orçamentos</div>
        <p className="status-page-sub">Todos os orçamentos gerados ficam salvos aqui, com numeração sequencial.</p>
        <div id="historico-list">
          {estado.tipo === 'carregando' ? (
            <Carregando texto="Carregando histórico…" />
          ) : estado.tipo === 'erro' ? (
            <div className="orc-empty-state">
              <h2>Erro ao carregar histórico</h2>
              <p>Verifique a conexão com o servidor e tente novamente.</p>
            </div>
          ) : !estado.linhas.length ? (
            <div className="orc-empty-state">
              <div className="orc-empty-icon">📄</div>
              <h2>Nenhum orçamento salvo ainda</h2>
              <p>
                Orçamentos gerados na aba <b>Orçamento</b> aparecerão aqui automaticamente.
              </p>
            </div>
          ) : (
            <table className="orc-table hist-table">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Número</th>
                  <th>Data</th>
                  <th className="num" style={{ width: 80 }}>
                    Itens
                  </th>
                  <th className="num" style={{ width: 140 }}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {estado.linhas.map((r) => (
                  <tr className="hist-row" key={r.id} onClick={() => void abrir(r.id)}>
                    <td>
                      <span className="orc-num-badge">{r.numero}</span>
                    </td>
                    <td>{formatarData(r.data_hora)}</td>
                    <td className="num">{r.qtd_itens}</td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {formatBRL(r.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
