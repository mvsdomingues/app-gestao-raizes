import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PaginaPublica } from './PaginaPublica';
import '../styles/00-tokens-base.css';
import '../styles/50-atualizacao-historico.css';
import '../styles/80-formularios.css';
import '../styles/99c-clientes.css';
import '../styles/99d-link-publico.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PaginaPublica />
  </StrictMode>,
);
