import callClaude from './claude_client.js';

const prompt = `You are a helpful assistant. Respond in Portuguese: diga apenas "Olá, sou o Claude!"`;

(async () => {
  try {
    const resp = await callClaude(prompt, { max_tokens: 200 });
    console.log('Resposta raw:', JSON.stringify(resp, null, 2));

    // Tentativa simples de extrair texto da resposta (varia conforme versão da API)
    const text = resp.completion ?? resp.completion?.[0] ?? resp.output ?? JSON.stringify(resp);
    console.log('\nTexto extraído:', text);
  } catch (err) {
    console.error('Erro ao chamar Claude:', err);
  }
})();
