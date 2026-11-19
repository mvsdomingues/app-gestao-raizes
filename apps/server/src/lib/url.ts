import type { Request } from 'express';

/**
 * Endereço público do sistema, usado nos links enviados aos clientes:
 * APP_URL_PUBLICA do .env; sem ela, o endereço pelo qual a tela foi aberta
 * (IP, domínio ou localhost — atrás do Nginx, pelos cabeçalhos X-Forwarded-*).
 */
export function urlBase(req: Request, fixa: string | null | undefined): string {
  if (fixa) return fixa;
  return `${req.protocol}://${req.get('host') ?? 'localhost'}`;
}
