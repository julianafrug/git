# Meu Mundo 🚪

Um site 3D feito com **Three.js**: um corredor com chão de carpete vermelho, paredes de cortina rosa
e uma porta branca no fim. Chegue perto (ou clique nela) e a porta se abre. Atravesse e você entra no meu mundo.

## Como abrir

O site precisa ser servido por um servidor local (não funciona abrindo o arquivo direto):

```bash
python3 -m http.server 8080
# depois abra http://localhost:8080
```

Ou publique a pasta no GitHub Pages, Netlify ou Vercel. É só HTML/CSS/JS, sem build.

## Controles

| Ação | Desktop | Celular |
|---|---|---|
| Olhar | arrastar o mouse | arrastar o dedo |
| Andar | `W A S D` / setas (`Shift` corre) | tocar no chão |
| Entrar | andar até a porta ou clicar nela | tocar na porta |
| Voltar | `Esc` ou botão VOLTAR | botão VOLTAR |

## Personalizar

Tudo fica em **`js/config.js`**:

- `title` / `subtitle`: nome do seu mundo
- `corridor`: cores do carpete, da cortina e da porta, e o comprimento do corredor
- `rooms`: cada sala é uma porta. A primeira fica no fim do corredor; se você adicionar mais, elas aparecem nas laterais.
  Tipos prontos: `cristal`, `galeria`, `galaxia`, `contato`

## Modelos do Blender

1. No Blender: **File → Export → glTF 2.0** e escolha o formato **.glb**
2. Salve o arquivo em `models/` (ex.: `models/estatua.glb`)
3. Em `js/config.js`, adicione no corredor ou numa sala:

```js
models: [{ url: 'models/estatua.glb', position: [1.4, 0, 2], scale: 1, rotationY: 0 }]
```

As animações do Blender tocam sozinhas em loop. Dica: 1 unidade do Blender = 1 metro aqui,
e o corredor tem 4,8 m de largura e 4,4 m de altura.

## Arquivos

- `index.html`: página, HUD e tela de entrada
- `css/style.css`: visual da interface
- `js/main.js`: cena 3D (corredor, porta, salas, movimento, som)
- `js/config.js`: textos, cores, salas e modelos
- `models/`: seus `.glb` do Blender

---

O projeto antigo de teste da API do Claude continua em `src/` (`npm start`).
