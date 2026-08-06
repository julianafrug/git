# Meu Primeiro Projeto Claude (Node.js)

Este projeto demonstra como chamar a API do Claude (Anthropic) a partir de Node.js.

1. Copie `.env.example` para `.env` e defina `ANTHROPIC_API_KEY`.

2. Instale dependências:

```bash
npm install
```

3. Execute o demo:

```bash
npm start
# ou
node src/demo.js
```

Arquivos importantes:
- `src/claude_client.js` - cliente simples para chamar a API HTTP de Anthropic.
- `.env.example` - exemplo de variável de ambiente.
