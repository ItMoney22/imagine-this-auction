module.exports = {
  apps: [{
    name: 'imagine-web',
    script: 'npm',
    args: 'start -- -p 8080 -H 127.0.0.1',
    cwd: '/root/imagine-this-auction/apps/web',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 8080,
      HOST: '127.0.0.1'
    }
  }]
}