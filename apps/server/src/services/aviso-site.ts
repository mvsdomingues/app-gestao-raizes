import { CAMINHO_AVISO_SITE } from '@raizes/contrato-site';

/**
 * Avisa o site que há novidade (produtos ou conteúdo), para ele sincronizar na hora em
 * vez de esperar o intervalo. Só "tem novidade": nenhum dado vai junto. Falha é ignorada
 * (o site sincroniza sozinho no intervalo).
 */
export class AvisoSite {
  private pendente: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opcoes: { url: string | null; token: string | null; atrasoMs?: number }) {}

  get ligado(): boolean {
    return !!this.opcoes.url && !!this.opcoes.token;
  }

  /** Agrupa vários avisos seguidos (ex.: várias alterações na tela) em um só. */
  avisar(): void {
    if (!this.ligado) return;
    if (this.pendente) clearTimeout(this.pendente);
    this.pendente = setTimeout(() => {
      this.pendente = null;
      void this.avisarAgora();
    }, this.opcoes.atrasoMs ?? 3000);
    this.pendente.unref?.();
  }

  async avisarAgora(): Promise<boolean> {
    if (!this.ligado) return false;
    try {
      const r = await fetch(this.opcoes.url!.replace(/\/+$/, '') + CAMINHO_AVISO_SITE, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.opcoes.token}` },
        signal: AbortSignal.timeout(5000),
      });
      return r.ok;
    } catch {
      return false;
    }
  }
}
