# Placar global e de amigos

O jogo funciona 100% sem isto. O placar é uma camada opcional: quando
`firebase-config.js` está preenchido, aparece a seção **Placar** abaixo do
tabuleiro; quando não está (ou quando não há internet), nada disso roda.

- **Backend:** Firebase — Authentication (login anônimo) + Cloud Firestore.
- **Sem build:** o SDK "compat" do Firebase é carregado por `<script>` no
  `index.html`. Nenhuma ferramenta de build é necessária.
- **Login:** anônimo por padrão (o jogador só escolhe um apelido). Google é
  opcional e pode ser ligado depois.
- **Custo:** o plano gratuito (Spark) cobre com folga um jogo pequeno
  (50 mil leituras / 20 mil escritas por dia).

---

## 1. Criar o projeto no Firebase

1. Acesse <https://console.firebase.google.com> e **Adicionar projeto**
   (pode recusar o Google Analytics).
2. Dentro do projeto, clique no ícone **Web (`</>`)** em "Adicione um app".
   Dê um apelido (ex.: `palavrilha-web`). **Não** marque "Firebase Hosting".
3. O console mostra um objeto `firebaseConfig` com `apiKey`, `authDomain`,
   `projectId`, `appId` etc. Deixe essa tela aberta.

## 2. Preencher `firebase-config.js`

Copie os valores para o arquivo `firebase-config.js` deste repositório:

```js
window.PALAVRILHA_FIREBASE = {
  apiKey: 'AIza...',
  authDomain: 'SEU-PROJETO.firebaseapp.com',
  projectId: 'SEU-PROJETO',
  appId: '1:1234567890:web:abcdef...',
  google: false
};
```

Esses valores **não são segredo** — eles vão para todos os navegadores. Quem
protege os dados são as regras do passo 5.

## 3. Ativar o login anônimo

No console: **Build → Authentication → Get started →** aba **Sign-in method →**
ative **Anônimo** e salve.

## 4. Criar o banco Firestore

**Build → Firestore Database → Create database.**

- Modo: **Production mode** (as regras do passo 5 abrem só o necessário).
- Região: escolha uma perto do Brasil, ex.: **`southamerica-east1` (São Paulo)**.
  A região não pode ser mudada depois.

## 5. Publicar as regras de segurança

Abra **Firestore Database → aba Rules**, apague o conteúdo e cole o arquivo
[`firestore.rules`](firestore.rules) deste repositório. Clique **Publish**.

(Se usar a CLI: `npm i -g firebase-tools`, `firebase login`,
`firebase deploy --only firestore:rules`.)

## 6. Publicar o site

```bash
cd /Users/glaucio/Projects/Palavilha
git add firebase-config.js
git commit -m "Liga o placar (Firebase)"
git push
```

O GitHub Pages republica sozinho. Abra o site, termine o desafio do dia,
escolha um apelido em **Placar → Entrar** e você aparece no **Global**. Na aba
**Amigos**, seu **código** de 5 letras fica visível; quem digitar esse código
na aba Amigos passa a te acompanhar.

---

## Opcional: login com Google (mais tarde)

Assim o progresso e os amigos não se perdem se o jogador limpar o navegador.
Não precisa de conta paga da Apple; é só configuração no Firebase.

1. **Authentication → Sign-in method →** ative **Google**.
2. **Authentication → Settings → Authorized domains →** adicione
   `glaucio1101.github.io` (e o domínio próprio, se um dia existir).
   `localhost` já vem liberado.
3. Em `firebase-config.js`, mude para `google: true` e faça push.

O botão **Entrar com Google** passa a aparecer na tela de entrada do placar.

---

## Como os dados são organizados

| Caminho | Conteúdo |
|---|---|
| `users/{uid}` | `name`, `code` (código de amigo), `streak`, `provider`, datas |
| `users/{uid}/friends/{amigoUid}` | `name`, `since` — lista de quem **eu** acompanho (só eu edito a minha) |
| `scores/{dayIndex}/entries/{uid}` | `name`, `timeMs`, `hints`, `streak`, `puzzleId`, `solvedAt` |

`dayIndex` = número de dias desde 01/01/1970 (a mesma chave que escolhe o
quebra-cabeça do dia), então cada dia tem seu próprio placar e não há
mistura entre os ciclos de 60 quebra-cabeças.

**Consultas usadas** (todas com índice automático, nenhuma composta):
`scores/{dia}/entries` ordenado por `timeMs`; `users` filtrado por `code`;
leituras diretas por id para os amigos.

## Limitações conhecidas (v1)

- O tempo é enviado pelo próprio cliente; as regras só validam faixas
  (`1s`–`24h`, dicas `0`–`5`). Blindar contra trapaça exigiria Cloud Functions
  / App Check — fica para depois.
- "Amigos" é acompanhamento de mão única: você vê quem adicionou, mesmo que a
  pessoa não tenha adicionado você. Pedido/aceite mútuo fica para uma próxima
  versão.
- Sem internet ou abrindo via `file://`, o placar não aparece; o jogo funciona
  normalmente. O SDK do Firebase só é baixado quando `firebase-config.js` está
  preenchido — sem configuração, o jogo não faz nenhuma requisição externa.
- Versão do SDK fixada na constante `SDK` no topo de `leaderboard.js`
  (`'10.14.1'`). Para atualizar, troque só esse valor.
