# Garrafinhas do Gustavo

Quebra-cabeça de separar líquidos coloridos para crianças pequenas, **sem propagandas, sem compras e sem coleta de dados**.
O objetivo é despejar os líquidos de uma garrafinha para outra até cada uma ficar com uma cor só.

**Jogar:** https://micheltlutz.github.io/garrafinhas-do-gustavo/

## Instalar no iPad

1. Abra o link acima no **Safari**.
2. Toque em **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início**.
3. Abra o jogo pelo ícone **uma vez com internet**. Depois disso ele funciona offline.

Bom saber:
- O progresso fica salvo no app do ícone. Apagar o ícone apaga o progresso.
- **Acesso Guiado** (Ajustes → Acessibilidade → Acesso Guiado; depois clique três vezes no botão lateral) mantém a criança dentro do jogo.
- Atualizações chegam sozinhas quando o jogo é aberto com internet (são aplicadas fora das fases, nunca no meio de uma).

## Como se joga

- **Toque** numa garrafinha (ela sobe) e depois em outra: o líquido de cima passa para ela. Também dá para **arrastar** uma garrafinha até a outra.
- Só dá para despejar sobre a **mesma cor** ou numa garrafinha **vazia**. Se não der, a garrafinha balança, sem castigo.
- Garrafinha cheia de uma cor só ganha **rolha** e brilho. Todas prontas = festa com confete.
- **Botões:** mapa de fases, desfazer, recomeçar e dica (a lâmpada mostra qual garrafinha pegar e onde despejar). A dica também aparece sozinha depois de 40 segundos parado.
- Se a fase ficar **sem saída**, o botão de desfazer fica amarelo e pisca.

**Fases:** 36, em 3 mundos de 12, todas liberadas.
- Mundo 1 (verde): 2 ou 3 cores, garrafinhas pequenas, 1 a 5 jogadas e **sem armadilhas** (nenhuma jogada deixa a fase sem saída).
- Mundo 2 (azul): 3 ou 4 cores, 5 a 10 jogadas.
- Mundo 3 (roxo): 4 a 6 cores, 11 a 18 jogadas.

## Desenvolvimento

Requer Node 24 ou mais novo.

```sh
npm install
npm run dev -- --host   # abre na rede local (teste no iPad pela Wi-Fi)
npm test                # regras, resolvedor e validação das fases
npm run build           # versão final em dist/
npm run levels          # gera de novo as fases (src/game/levels.json)
npm run icons           # gera os ícones PNG a partir de public/icon.svg
```

Estrutura:
- `src/game/tubes.ts`: regras (despejar, garrafinha pronta, fase resolvida). Código puro, testado.
- `src/game/solver.ts`: resolvedor (menor nº de jogadas, dica, "sem saída", "sem armadilhas").
- `scripts/generate-levels.ts`: sorteia, resolve e escolhe as fases.
- `src/ui/rackView.ts`: as garrafinhas na tela, toque, arrasto e animação de despejar.
- `src/ui/screens.ts`: telas inicial, mapa e fase.
- `src/audio/sfx.ts`: sons sintetizados (sem arquivos de áudio).

Cada push na branch `main` roda os testes e publica no GitHub Pages.
