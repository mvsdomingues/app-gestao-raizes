// Configuração do PM2 — Raízes · Catálogo & Orçamento
//   pm2 start ecosystem.config.cjs
//
// IMPORTANTE: a aplicação deve rodar em UMA única instância (fork, instances: 1),
// porque o status/log da atualização fica em memória e o SQLite é um arquivo local.

module.exports = {
  apps: [
    {
      name: 'raizes',
      cwd: __dirname,
      script: 'apps/server/dist/index.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '600M',
      kill_timeout: 5000,
      time: true,
      env: {
        NODE_ENV: 'production',
        // Porta e host também podem ficar no .env (PORT / HOST).
        // Mantenha 127.0.0.1: o acesso externo deve passar pelo Caddy/Nginx com senha.
        HOST: '127.0.0.1',
        PORT: '5000',
      },
    },
    {
      // Atualização diária dos fornecedores (06:37 no fuso do servidor; fora da hora cheia, para evitar indisponibilidade dos fornecedores).
      // Roda e termina; o PM2 a dispara de novo no horário do cron.
      name: 'raizes-atualizar',
      cwd: __dirname,
      script: 'apps/server/dist/cli/atualizar-produtos.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: false,
      cron_restart: '37 6 * * *',
      time: true,
      env: { NODE_ENV: 'production' },
    },
    {
      // Site (catálogo público): processo, porta, banco (data/catalogo.db) e configuração (.env.site) próprios.
      // Se cair, a gestão continua de pé, e vice-versa. Fala com a gestão só por 127.0.0.1, com o token de serviço.
      name: 'raizes-site',
      cwd: __dirname,
      script: 'apps/site-server/dist/index.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '500M',
      kill_timeout: 5000,
      time: true,
      env: {
        NODE_ENV: 'production',
        SITE_HOST: '127.0.0.1',
        SITE_PORT: '5100',
      },
    },
  ],
};
