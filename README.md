# Palavrilha

Jogo diário de caça-palavras em português do Brasil. Página única em HTML, CSS e
JavaScript puro — sem build, sem frameworks, sem servidor. Um quebra-cabeça novo
por dia (escolhido pela data do aparelho), pensado para tela de celular e para
rodar dentro de um `WKWebView` de app iOS.

Nome, cores, wordmark e ícone são próprios. Inspirado em jogos de palavras em
grade, mas não usa a marca nem o logo de nenhum outro produto.

## Como jogar

- 5 palavras escondidas numa grade 5×5. As células escuras são paredes.
- Toque numa letra e siga por células **vizinhas** (cima, baixo, esquerda,
  direita — nunca diagonal). As palavras podem virar esquina. Também dá para
  arrastar.
- Cada célula livre pertence a **uma única** palavra.
- Abaixo do tabuleiro, as fileiras de casas mostram o tamanho de cada palavra e
  se preenchem quando você a encontra.
- **Dica** destaca o início de uma palavra. **Desfazer** remove a última.
  **Reiniciar** limpa tudo. Tempo, sequência (streak) e progresso ficam salvos
  no `localStorage` do navegador.

## Rodar localmente

**Abrir direto:** dê um duplo-clique em `index.html` (ou `open index.html`).
Funciona em `file://` porque os dados também vêm de `puzzles.js`.

**Servindo (mais fiel ao ambiente real):**

```bash
cd /Users/glaucio/Projects/Palavilha
python3 -m http.server 8777
```

Abra `http://localhost:8777/`.

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.html`, `styles.css`, `game.js` | O app. Todos os caminhos são relativos, então funciona em subpasta (ex.: `usuario.github.io/palavrilha/`). |
| `puzzles.json` | 60 quebra-cabeças pré-gerados (1–60). Formato canônico. |
| `puzzles.js` | Os mesmos dados em `window.PALAVRILHA_PUZZLES`, para funcionar via `file://`. |
| `generate-puzzles.js` | Gerador em Node.js (uso local, não vai para o navegador). |
| `wordlist-ptbr.txt` | Lista de palavras usada pelo gerador. |
| `.github/workflows/pages.yml` | Publica o site no GitHub Pages a cada push na branch `main`. |

## Gerar os quebra-cabeças de novo

```bash
node generate-puzzles.js
```

Reescreve `puzzles.json` e `puzzles.js` com 60 quebra-cabeças determinísticos.
Cada um: 5 paredes, as 20 células livres divididas em 5 caminhos ortogonais de
comprimentos 2, 3, 4, 5 e 6 cobrindo cada célula uma vez; 5 palavras reais e
comuns (acentuação preservada); e um verificador garante que existe **uma única**
solução válida contra o dicionário inteiro.

## Fonte da lista de palavras

`wordlist-ptbr.txt` vem de <https://github.com/pythonprobr/palavras>
(`palavras.txt`, ~320 mil formas), lista aberta derivada do dicionário Hunspell
**pt_BR do projeto VERO** (BrOffice / LibreOffice), sob licença livre (LGPL/BSD).
As palavras dos quebra-cabeças saem de um conjunto curado de termos comuns e são
conferidas contra essa lista; a lista inteira serve de dicionário no teste de
solução única.

## Publicação (GitHub Pages)

O workflow em `.github/workflows/pages.yml` publica a pasta a cada push na
`main`. No repositório: **Settings → Pages → Build and deployment → Source →
GitHub Actions**. O site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.
