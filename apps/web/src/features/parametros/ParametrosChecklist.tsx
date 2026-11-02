import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ItemChecklist } from '@raizes/shared';
import { api } from '../../lib/api';
import { confirmar } from '../../lib/dialogo';

type Linha = ItemChecklist & { chave: number };

function dataBr(v: string): string {
  return v.replace(/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d:\d\d).*/, '$3/$2/$1 às $4');
}

let seq = 0;
const linha = (i: ItemChecklist): Linha => ({ ...i, chave: ++seq });

/** Aba "Checklist de fechamento": itens que o pedido recebe ao entrar na etapa Em Fechamento. */
export function ParametrosChecklist({ visitas }: { visitas: number }) {
  const [gravado, setGravado] = useState<ItemChecklist[] | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [novo, setNovo] = useState('');
  const [atualizado, setAtualizado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const campoNovo = useRef<HTMLInputElement>(null);

  const aplicar = (itens: ItemChecklist[], quando: string | null) => {
    setGravado(itens);
    setLinhas(itens.map(linha));
    setAtualizado(quando);
  };

  useEffect(() => {
    setMensagem(null);
    api.checklistFechamento().then(
      (r) => aplicar(r.itens, r.atualizado),
      (e: Error) => setMensagem({ tipo: 'erro', texto: e.message }),
    );
  }, [visitas]);

  const atual = linhas.map(({ id, texto }) => ({ id, texto: texto.trim() }));
  const alterado = !!gravado && JSON.stringify(atual) !== JSON.stringify(gravado);
  const vazio = linhas.some((l) => !l.texto.trim());

  const mudar = (fn: (l: Linha[]) => Linha[]) => {
    setLinhas(fn);
    setMensagem(null);
  };
  const mover = (i: number, d: -1 | 1) =>
    mudar((l) => {
      const n = [...l];
      const j = i + d;
      if (j < 0 || j >= n.length) return l;
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });
  const incluir = () => {
    const t = novo.trim();
    if (!t) return;
    mudar((l) => [...l, linha({ texto: t })]);
    setNovo('');
    campoNovo.current?.focus();
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await api.salvarChecklistFechamento(atual);
      aplicar(r.itens, r.atualizado);
      setMensagem({ tipo: 'ok', texto: '✓ Checklist salvo. Vale para os pedidos que entrarem em "Em Fechamento" a partir de agora.' });
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(false);
    }
  };

  const descartar = async () => {
    if (!gravado) return;
    if (alterado && !(await confirmar('Descartar as alterações do checklist?', { ok: 'Descartar', perigo: true }))) return;
    setLinhas(gravado.map(linha));
    setMensagem(null);
  };

  return (
    <div className="update-panel param-panel param-sistema" id="param-checklist">
      <div className="update-panel-header">
        <div>
          <h3 className="update-panel-title">Checklist de fechamento</h3>
          <p className="update-panel-sub">{atualizado ? `Última alteração: ${dataBr(atualizado)}` : 'Nenhum item cadastrado ainda.'}</p>
        </div>
      </div>
      <p className="param-nota" style={{ marginTop: 4 }}>
        Itens que o pedido recebe ao entrar na etapa <b>Em Fechamento</b>, para marcar o que já foi feito. Marcar todos não é
        obrigatório para seguir com o fluxo. Mudanças aqui valem para os próximos pedidos; os que já passaram por essa etapa
        mantêm a própria lista.
      </p>

      <ol className="checklist-cadastro" id="checklist-cadastro">
        {linhas.map((l, i) => (
          <li key={l.chave}>
            <span className="checklist-num">{i + 1}</span>
            <input
              className="custom-input"
              value={l.texto}
              maxLength={200}
              aria-label={`Item ${i + 1}`}
              onChange={(e) => mudar((ls) => ls.map((x) => (x.chave === l.chave ? { ...x, texto: e.target.value } : x)))}
            />
            <button type="button" className="checklist-acao" title="Subir" disabled={i === 0} onClick={() => mover(i, -1)}>
              ↑
            </button>
            <button type="button" className="checklist-acao" title="Descer" disabled={i === linhas.length - 1} onClick={() => mover(i, 1)}>
              ↓
            </button>
            <button
              type="button"
              className="checklist-acao perigo"
              title="Remover"
              onClick={() => mudar((ls) => ls.filter((x) => x.chave !== l.chave))}
            >
              ✕
            </button>
          </li>
        ))}
      </ol>

      <div className="checklist-novo">
        <input
          ref={campoNovo}
          id="checklist-novo-texto"
          className="custom-input"
          placeholder="Novo item (ex.: Arte aprovada pelo cliente)"
          maxLength={200}
          value={novo}
          disabled={!gravado}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              incluir();
            }
          }}
        />
        <button type="button" className="btn-back" id="btn-checklist-incluir" onClick={incluir} disabled={!novo.trim()}>
          + Incluir
        </button>
      </div>

      {vazio && <ul className="form-erros"><li>Há itens sem texto: preencha ou remova.</li></ul>}
      {mensagem && <div className={`form-mensagem ${mensagem.tipo}`}>{mensagem.texto}</div>}

      <div className="param-acoes">
        <button className="btn-secondary" type="button" disabled={!alterado} onClick={() => void descartar()}>
          Descartar alterações
        </button>
        <button className="btn-update" id="btn-salvar-checklist" onClick={() => void salvar()} disabled={salvando || !alterado || vazio}>
          {salvando ? 'Salvando…' : 'Salvar checklist'}
        </button>
      </div>
    </div>
  );
}
