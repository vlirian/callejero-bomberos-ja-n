module.exports = {
  apps: [
    {
      name: 'callejero-jaen',
      script: 'server.js',
      cwd: '/Users/victor/Desktop/CALLEJERO 2.0',
      env: {
        NODE_ENV: 'production',
        GOOGLE_MAPS_API_KEY: 'AIzaSyAZd52IQi-yHYM19mlpbdvWtDIUJH7pEb4'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '400M'
    }
  ]
};
