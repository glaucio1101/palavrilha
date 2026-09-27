# Placar global e de amigos (Palavrilha 2.0)

> Esta é a versão **2.0** (e-mail como identificador, sem senha). A versão
> **clássica** (apelido + código de amigo) tem seu próprio guia em
> [`classic/LEADERBOARD.md`](classic/LEADERBOARD.md).

O jogo funciona 100% sem isto. O placar é uma camada opcional: quando
`firebase-config.js` (na raiz) está preenchido, aparece a seção **Placar**
abaixo do tabuleiro; sem isso (ou sem internet), nada roda e o jogo segue
100% local.

- **Backend:** Firebase — Authentication (login por **link de e-mail**,
  passwordless) + Cloud Firestore.
- **Identidade:** você digita um e-mail e recebe um link de entrada — sem
  senha, mas com identidade de verdade: o mesmo e-mail sempre volta à mesma
  conta, em qualquer aparelho ou navegador. Isso evita duplicidade no placar.
- **Convite:** para acompanhar alguém na aba **Amigos**, digite o e-mail dela
  (ou use o botão **"+"** direto numa linha do Global, ou mande o
  **"Convidar por link"**). Não enviamos e-mail de convite automaticamente
  (o site é estático, sem servidor) — o link de entrada em si (que o
  Firebase manda) é a única mensagem automática que existe.
- **Privacidade:** o e-mail nunca aparece nos placares nem é legível por
  outros jogadores. O que é público é um **nome de exibição** derivado
  automaticamente (a parte antes do "@"). Ver "Como os dados são organizados".
- **Sem build:** SDK "compat" do Firebase, carregado por `<script>` só quando
  configurado. **Custo:** plano gratuito (Spark) cobre um jogo pequeno (inclui
  uma cota diária de e-mails de login, também de sobra para poucos jogadores).

---

## 1. Criar o projeto no Firebase

1. Acesse <https://console.firebase.google.com> e **Adicionar projeto** (pode
   recusar o Google Analytics). Pode ser o **mesmo projeto** já usado pela
   versão clássica, ou um novo — tanto faz, as coleções não colidem.
2. Clique no ícone **Web (`</>`)** em "Adicione um app". Dê um apelido (ex.:
   `palavrilha-2`). **Não** marque "Firebase Hosting".
3. Copie o objeto `firebaseConfig` mostrado (`apiKey`, `authDomain`,
   `projectId`, `appId`).

## 2. Preencher `firebase-config.js` (na raiz do projeto)

```js
window.PALAVRILHA_FIREBASE = {
  apiKey: 'AIza...',
  authDomain: 'SEU-PROJETO.firebaseapp.com',
  projectId: 'SEU-PROJETO',
  appId: '1:1234567890:web:abcdef...'
};
```

Esses valores **não são segredo** — vão para todos os navegadores. Quem
protege os dados são as regras do passo 5. (Ver "É seguro deixar a apiKey
pública?" mais abaixo.)

## 3. Ativar o login por link de e-mail

**Build → Authentication → Get started → Sign-in method → Email/Password →**
ative o provedor e marque a opção **"Email link (passwordless sign-in)"**.
Salve.

## 4. Autorizar o domínio do GitHub Pages

**Build → Authentication → Settings → Authorized domains → Add domain →**
adicione `SEU-USUARIO.github.io` (ex.: `glaucio1101.github.io` — vale tanto
para `/` quanto para `/classic/`, é o mesmo domínio). Sem isso, o link de
entrada falha com "domínio não autorizado". `localhost` já vem liberado, útil
para testar localmente.

## 5. Criar o banco Firestore

**Build → Firestore Database → Create database.**

- Modo: **Production mode**.
- Região: perto do Brasil, ex. **`southamerica-east1` (São Paulo)** — não
  muda depois. Se a versão clássica já criou o banco no mesmo projeto, é o
  mesmo banco: não precisa criar de novo.

## 6. Publicar as regras de segurança

Abra **Firestore Database → aba Rules**, apague o conteúdo e cole o arquivo
[`firestore.rules`](firestore.rules) da raiz do repositório — ele cobre as
coleções da versão 2.0 (`v2_*`) **e** as da clássica (`users`/`scores`) no
mesmo arquivo, sem conflito. Clique **Publish**.

## 7. Publicar o site

```bash
cd /Users/glaucio/Projects/Palavilha
git add firebase-config.js
git commit -m "Liga o placar do Palavrilha 2.0 (Firebase)"
git push
```

Abra o site, termine o desafio do dia, digite um e-mail em
**Placar → Enviar link de entrada**. Você recebe um e-mail do Firebase com um
link — toque nele e volta ao site já conectado, aparecendo no **Global**.
Repita numa aba/aparelho diferente com o mesmo e-mail: você continua sendo a
**mesma pessoa** no placar (sem duplicar).

## Convidar por link (SMS, WhatsApp, iMessage…)

Na aba **Amigos**, o botão **"Convidar por link (SMS, WhatsApp…)"** gera um
link com o seu e-mail embutido (`?convite=voce@email.com`) e abre a folha de
compartilhamento nativa (`navigator.share`) — ou copia o texto, se o
navegador não tiver isso. Manda por SMS, WhatsApp, iMessage, e-mail etc.

Quando a pessoa convidada abre o link:

- Se ela ainda não tem cadastro, a tela de entrada já avisa quem convidou e,
  assim que ela pedir o próprio link de entrada e tocar nele, os dois já
  ficam conectados.
- Se ela já tem cadastro (já está com uma sessão ativa nesse navegador), você
  é adicionado à lista de amigos dela automaticamente, na hora.

Isso só adiciona **você à lista de quem a pessoa convidada acompanha** (o
mesmo modelo de "amigo" de mão única descrito em "Limitações conhecidas"
abaixo) — se você também quiser ver os tempos dela, adicione o e-mail dela
manualmente (ou peça para ela te mandar o link dela de volta).

## Adicionar direto pelo placar Global

Cada linha do placar **Global** (menos a sua) tem um botão **"+"**. Toque
nele para adicionar aquela pessoa aos seus amigos na hora, sem precisar
saber o e-mail dela — útil quando você já vê alguém no Global e só quer
acompanhar essa pessoa.

## Sair (trocar de e-mail no mesmo aparelho)

No card do placar, ao lado do seu nome, o link **"sair"** desconecta a sessão
atual (`auth.signOut()`), voltando à tela de entrada — útil se um aparelho é
compartilhado ou se você quer testar com outro e-mail.

---

## Como os dados são organizados

| Caminho | Visibilidade | Conteúdo |
|---|---|---|
| `v2_users/{uid}` | privado (só o dono lê) | `email`, `displayName`, `streak`, datas |
| `v2_users/{uid}/friends/{uid do amigo}` | privado | `displayName` do amigo, `since` |
| `v2_public/{uid}` | público (qualquer logado) | `displayName`, `streak` — **sem e-mail** |
| `v2_emailIndex/{email}` | só busca por chave exata | `{ uid }` — não é possível listar todos os e-mails |
| `v2_scores/{dayIndex}/entries/{uid}` | público | `displayName`, `timeMs`, `hints`, `streak`, `puzzleId` — **sem e-mail** |

O e-mail em si só existe em `v2_users` (privado) e como o próprio nome do
documento em `v2_emailIndex` (que só é lido por busca exata — alguém só acha
seu e-mail ali se já souber exatamente qual é, para te convidar). Tudo que é
publicamente legível (`v2_public`, `v2_scores`) usa `displayName`, a parte do
e-mail antes do "@" (ex.: `glaucio1101@gmail.com` → `glaucio1101`).

`dayIndex` = dias desde 01/01/1970 (a mesma chave que escolhe o desafio do
dia), então cada dia tem seu próprio placar. O `uid` vem do Firebase
Authentication e é **sempre o mesmo para o mesmo e-mail**, em qualquer
aparelho — é isso que garante uma entrada só por pessoa no placar.

## Se você já tinha jogado com o login antigo (antes do link de e-mail)

As primeiras versões deste placar usavam login anônimo com o e-mail só como
rótulo — cada navegador virava uma "pessoa" diferente, mesmo com o mesmo
e-mail (foi exatamente o bug de duplicidade que motivou essa mudança). Se
você já tinha um ou mais desses perfis antigos, eles **não são migrados
automaticamente** para a conta nova baseada em e-mail — o login por link
sempre cria/usa um uid diferente daqueles.

Para limpar os fantasmas antigos do Global: em
**Firestore Database → Data**, abra a coleção `v2_public`, ache os
documentos com seu nome antigos (que não sejam mais usados) e apague cada um
deles junto com o `v2_users/{mesmo uid}` correspondente e qualquer
`v2_scores/{algum dia}/entries/{mesmo uid}`. Depois disso, entre de novo pelo
site normalmente (**Placar → Enviar link de entrada**) para criar sua conta
definitiva.

## Limitações conhecidas

- **Convite ainda é manual** (digitar e-mail, botão "+" no Global, ou mandar
  o link de convite): o site é estático (GitHub Pages), não há servidor para
  mandar convite por e-mail sozinho. O único e-mail automático é o próprio
  link de entrada, mandado pelo Firebase.
- **"Amigos" é acompanhamento de mão única**: adicionar alguém (por e-mail,
  pelo "+" ou por link de convite) só coloca essa pessoa na SUA lista; não
  avisa nem adiciona você na lista dela automaticamente (a não ser que ela
  também tenha usado seu link de convite).
- Tempo enviado pelo próprio cliente; as regras só validam faixas
  (`1s`–`24h`, dicas `0`–`5`). Blindagem contra trapaça ficaria por conta de
  Cloud Functions / App Check, fora do escopo desta versão.
- Sem internet ou via `file://`, o placar não aparece — o jogo segue normal.
- Versão do SDK fixada na constante `SDK` no topo de `leaderboard.js`.

## É seguro deixar a `apiKey` pública no `firebase-config.js`?

Sim. A `apiKey` de um app Web do Firebase não é um segredo — ela só
identifica o seu projeto para o Google, não concede acesso a dados por si
só. Quem protege os dados de verdade são:

1. **As regras do Firestore** (`firestore.rules`) — cada pessoa só lê/escreve
   exatamente o que as regras permitem, não importa quem tenha a `apiKey`.
2. **O plano gratuito (Spark)** tem cotas diárias fixas; se alguém abusar,
   o projeto para de responder (erro), nunca gera cobrança surpresa, porque
   não há cartão associado.

Reforço opcional (não obrigatório): no
[Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials),
ache a chave "Browser key (auto created by Firebase)" do seu projeto e, em
**Application restrictions → HTTP referrers**, adicione
`https://SEU-USUARIO.github.io/*` (e `http://localhost:*` para testar). Isso
impede que outros sites usem essa chave específica pelo navegador — não muda
nada para os seus próprios usuários. **Nunca** publique, por outro lado, uma
**chave de conta de serviço** (Admin SDK) — essa sim é secreta; este projeto
não usa nenhuma.
