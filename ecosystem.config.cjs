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
      // Atualização diária dos fornecedores (07:00 no fuso do servidor).
      // Roda e termina; o PM2 a dispara de novo no horário do cron.
      name: 'raizes-atualizar',
      cwd: __dirname,
      script: 'apps/server/dist/cli/atualizar-produtos.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: false,
      cron_restart: '0 7 * * *',
      time: true,
      env: { NODE_ENV: 'production' },
    },
  ],
};
