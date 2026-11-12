module.exports = {
  apps: [
    {
      name: 'studyhub',
      script: 'server/index.js',
      instances: 1, // Single instance preserves in-memory liveRooms & Socket.IO presence without Redis
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      kill_timeout: 5000
    }
  ]
};
