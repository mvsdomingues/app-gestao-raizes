import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Se uma página quebrar, mostra um aviso no lugar dela (com o menu e o rodapé de pé),
 * em vez de deixar a tela em branco. Volta ao normal ao trocar de página.
 */
export class ProtecaoErro extends Component<{ chave: string; children: ReactNode }, { erro: boolean }> {
  override state = { erro: false };

  static getDerivedStateFromError() {
    return { erro: true };
  }

  override componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('[site] Erro ao montar a página:', erro, info.componentStack);
  }

  override componentDidUpdate(anterior: { chave: string }) {
    if (anterior.chave !== this.props.chave && this.state.erro) this.setState({ erro: false });
  }

  override render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="aviso">
        <h2>Não foi possível mostrar esta página</h2>
        <p>Tente de novo em instantes. Se continuar, fale com a gente.</p>
        <button type="button" className="botao" onClick={() => window.location.reload()}>
          Recarregar
        </button>
      </div>
    );
  }
}
