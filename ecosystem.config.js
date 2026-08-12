module.exports = {
  apps: [{
    name: 'mi-contador',
    script: 'src/server.js',
    env: {
      PORT: 4040,
      OLLAMA_URL: 'http://localhost:11434',
      OLLAMA_MODEL: 'qwen3:4b',
      OLLAMA_KEEP_ALIVE: '-1'
    }
  }]
};
