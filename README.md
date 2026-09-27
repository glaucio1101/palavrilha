# Palavrilha

Jogo diário de caça-palavras em português do Brasil. Página única em HTML, CSS e
JavaScript puro — sem build, sem frameworks, sem servidor. Um quebra-cabeça novo
por dia (escolhido pela data do aparelho), pensado para tela de celular e para
rodar dentro de um `WKWebView` de app iOS.

Nome, cores, wordmark e ícone são próprios. Inspirado em jogos de palavras em
grade, mas não usa a marca nem o logo de nenhum outro produto.

> Quer a versão original (5×5, sempre 5 palavras de 2 a 6 letras)? Ela continua
> em [`classic/`](classic/README.md) — nada muda lá.

## O que muda na 2.0

- **Sem palavras curtas**: só de **4 a 7 letras** (nada de 2 ou 3).
- **Número de palavras variável**: 4, 5 ou 6 por dia, não sempre 5.
- **Tabuleiro de tamanho variável**: as linhas/colunas se ajustam ao total de
  letras do dia (de 5×5 até 6×8 nos 60 quebra-cabeças já gerados) — nunca
  sempre o mesmo formato.
- Qual combinação aparece em cada dia é sorteado de forma determinística por
  quebra-cabeça (todo mundo vê o mesmo no mesmo dia; muda de um dia para o
  outro).
- **Resultado em popup**: ao terminar, "Parabéns!" com tempo, sequência e
  dicas aparece na hora, num popup — sem precisar rolar a página. O botão de
  compartilhar fica dentro do popup. Uma barrinha fixa ("Ver resultado") deixa
  reabrir o popup depois de fechado.
- **Placar por e-mail** (opcional): ver [`LEADERBOARD.md`](LEADERBOARD.md).

## Como jogar

- Um número de palavras diferente por dia (4, 5 ou 6), de 4 a 7 letras,
  escondidas nas células livres do tabuleiro do dia. As células escuras são
  paredes.
- Toque numa letra e siga por células **vizinhas** (cima, baixo, esquerda,
  direita — nunca diagonal). As palavras podem virar esquina. Também dá para
  arrastar.
- Cada célula livre pertence a **uma única** palavra.
- Abaixo do tabuleiro, as fileiras de casas mostram o tamanho de cada palavra e
  se preenchem quando você a encontra.
- **Dica** destaca o início de uma palavra. **Desfazer** remove a última.
  **Reiniciar** limpa tudo. Tempo, sequência (streak) e progresso ficam salvos
  no `localStorage` do navegador (chaves próprias, não interferem com a versão
  clássica mesmo estando na mesma origem).

## Rodar localmente

**Abrir direto:** dê um duplo-clique em `index.html` (ou `open index.html`).
Funciona em `file://` porque os dados também vêm de `puzzles.js`.

**Servindo (mais fiel ao ambiente real, e serve as duas versões de uma vez):**

```bash
cd /Users/glaucio/Projects/Palavilha
python3 -m http.server 8777
```

Abra `http://localhost:8777/` para a 2.0, ou `http://localhost:8777/classic/`
para a versão clássica.

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.html`, `styles.css`, `game.js` | O app 2.0. Caminhos relativos — funciona em subpasta (ex.: `usuario.github.io/palavrilha/`). |
| `puzzles.json` / `puzzles.js` | 60 quebra-cabeças pré-gerados (1–60) da 2.0. |
| `generate-puzzles.js` | Gerador em Node.js da 2.0 (uso local, não vai para o navegador). |
| `wordlist-ptbr.txt` | Lista de palavras usada pelos dois geradores (2.0 e clássico). |
| `leaderboard.js`, `firebase-config.js` | Placar opcional por e-mail (ver `LEADERBOARD.md`). |
| `firestore.rules` | Regras do Firestore — cobre as coleções da 2.0 e da clássica no mesmo arquivo. |
| `privacy.html` | Política de privacidade única para as duas versões. |
| `classic/` | Versão 1.0 completa e congelada — seu próprio `README.md`, `LEADERBOARD.md`, gerador e dados. |
| `.github/workflows/pages.yml` | Publica a pasta inteira (2.0 + `classic/`) no GitHub Pages a cada push na `main`. |

## Gerar os quebra-cabeças de novo

```bash
node generate-puzzles.js
```

Reescreve `puzzles.json` e `puzzles.js` com 60 quebra-cabeças determinísticos.
Para cada um: sorteia (com semente fixa por número de quebra-cabeça) quantas
palavras (4–6) e de que tamanhos (4–7 letras); escolhe as dimensões do
tabuleiro que melhor acomodam esse total com ~20% de paredes; particiona as
células livres em caminhos ortogonais que não se cruzam; escolhe palavras reais
e comuns (acentuação preservada); e um verificador garante que existe **uma
única** solução válida contra o dicionário inteiro antes de aceitar o
quebra-cabeça.

## Fonte da lista de palavras

`wordlist-ptbr.txt` vem de <https://github.com/pythonprobr/palavras>
(`palavras.txt`, ~320 mil formas), lista aberta derivada do dicionário Hunspell
**pt_BR do projeto VERO** (BrOffice / LibreOffice), sob licença livre (LGPL/BSD).
As palavras dos quebra-cabeças saem de um conjunto curado de termos comuns e são
conferidas contra essa lista; a lista inteira serve de dicionário no teste de
solução única.

## Publicação (GitHub Pages)

O workflow em `.github/workflows/pages.yml` publica o repositório inteiro
(raiz = 2.0, `classic/` = versão 1.0) a cada push na `main`. No repositório:
**Settings → Pages → Build and deployment → Source → GitHub Actions**. O site
fica em `https://SEU-USUARIO.github.io/NOME-DO-REPO/` (e a versão clássica em
`.../classic/`).

## Sobre o app iOS / App Store

Adiado por enquanto — o foco é validar a 2.0 com jogadores reais no GitHub
Pages primeiro. Quando fizer sentido embutir num `WKWebView` e publicar na
App Store, os dois apps já são compatíveis com isso (sem dependências de
build, tudo relativo).
