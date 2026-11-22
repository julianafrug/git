// ============================================================
//  CONFIGURAÇÃO DO SEU MUNDO
//  Edite este arquivo para mudar textos, cores, portas e modelos.
// ============================================================
//
//  MODELOS DO BLENDER
//  No Blender: File > Export > glTF 2.0 (.glb). Salve na pasta /models
//  e coloque o caminho em `models`. Exemplo:
//
//    models: [{ url: 'models/minha-estatua.glb', position: [0, 0, -6], scale: 1, rotationY: 0 }]
//
//  Se o modelo tiver animações, elas tocam sozinhas em loop.
// ============================================================

export const CONFIG = {
  title: 'MEU MUNDO',
  subtitle: 'bem-vindo(a) ao meu universo',

  // O corredor de entrada (carpete vermelho + cortinas rosa)
  corridor: {
    carpet: '#8a0c16',
    curtain: '#f27aae',
    door: '#f7f3ef',
    length: 30, // metros
    models: [
      // { url: 'models/estatua.glb', position: [1.4, 0, 2], scale: 1 },
    ],
  },

  // Cada sala = uma porta branca.
  // A primeira fica no fim do corredor; as próximas (se você adicionar) aparecem nas laterais.
  // type: 'cristal' | 'galeria' | 'galaxia' | 'contato'
  rooms: [
    {
      id: 'sobre',
      door: 'SOBRE MIM',
      color: '#ff7ac0',
      type: 'cristal',
      kicker: 'SALA 01',
      title: 'Quem sou eu',
      html: `
        <p>Oi! Esse é o meu mundo. Aqui você descobre um pouco de quem eu sou,
        o que eu faço e o que me move.</p>
        <p>Troque esse texto em <b>js/config.js</b> pela sua história.</p>
      `,
      models: [],
    },

    // ---- Exemplos de outras salas: descomente para criar mais portas ----
    // {
    //   id: 'projetos', door: 'PROJETOS', color: '#ff2bd6', type: 'galeria',
    //   kicker: 'SALA 02', title: 'Projetos', html: '<p>Clique nos painéis.</p>',
    //   items: [
    //     { title: 'PROJETO 01', sub: 'Branding', desc: 'Descrição curta.', link: '' },
    //     { title: 'PROJETO 02', sub: '3D / Blender', desc: 'Outro projeto.', link: '' },
    //   ],
    // },
    // {
    //   id: 'universo', door: 'UNIVERSO', color: '#8a5cff', type: 'galaxia',
    //   kicker: 'SALA 03', title: 'Meu universo', html: '<p>Clique nos planetas.</p>',
    //   items: [
    //     { title: 'MÚSICA', desc: 'O que eu escuto.', color: '#ff2bd6' },
    //     { title: 'CINEMA', desc: 'Filmes favoritos.', color: '#00f0ff' },
    //   ],
    // },
    // {
    //   id: 'contato', door: 'CONTATO', color: '#39ff88', type: 'contato',
    //   kicker: 'SALA 04', title: 'Fala comigo', html: '<p>Escolha um canal.</p>',
    //   items: [
    //     { title: 'INSTAGRAM', sub: '@seuuser', link: 'https://instagram.com/' },
    //     { title: 'E-MAIL', sub: 'voce@email.com', link: 'mailto:voce@email.com' },
    //   ],
    // },
  ],
};
