# Placar global e de amigos (Palavrilha 2.0)

> Esta é a versão **2.0** (e-mail como identificador, sem senha). A versão
> **clássica** (apelido + código de amigo) tem seu próprio guia em
> [`classic/LEADERBOARD.md`](classic/LEADERBOARD.md).

O jogo funciona 100% sem isto. O placar é uma camada opcional: quando
`firebase-config.js` (na raiz) está preenchido, aparece a seção **Placar**
abaixo do tabuleiro; sem isso (ou sem internet), nada roda e o jogo segue
100% local.

- **Backend:** Firebase — Authentication (login anônimo, por baixo dos panos)
  + Cloud Firestore.
- **Identidade:** você digita um **e-mail** para aparecer nos placares e
  convidar amigos. **Não há senha nem verificação** — é só um identificador,
  não uma conta de verdade. Ver "Limitações" abaixo.
- **Convite:** para acompanhar alguém na aba **Amigos**, digite o e-mail que
  essa pessoa usou para entrar no Palavrilha. Não enviamos e-mail nenhum
  automaticamente (o site é estático, sem servidor) — combine com a pessoa
  por WhatsApp, mensagem etc.
- **Privacidade:** o e-mail nunca aparece nos placares nem é legível por
  outros jogadores. O que é público é um **nome de exibição** derivado
  automaticamente (a parte antes do "@"). Ver "Como os dados são organizados".
- **Sem build:** SDK "compat" do Firebase, carregado por `<script>` só quando
  configurado. **Custo:** plano gratuito (Spark) cobre um jogo pequeno.

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
protege os dados são as regras do passo 5.

## 3. Ativar o login anônimo

**Build → Authentication → Get started → Sign-in method → Anônimo → Ativar.**
(É só o mecanismo por baixo; o jogador nunca vê a palavra "anônimo" — ele só
digita o e-mail.)

## 4. Criar o banco Firestore

**Build → Firestore Database → Create database.**

- Modo: **Production mode**.
- Região: perto do Brasil, ex. **`southamerica-east1` (São Paulo)** — não
  muda depois. Se a versão clássica já criou o banco no mesmo projeto, é o
  mesmo banco: não precisa criar de novo.

## 5. Publicar as regras de segurança

Abra **Firestore Database → aba Rules**, apague o conteúdo e cole o arquivo
[`firestore.rules`](firestore.rules) da raiz do repositório — ele cobre as
coleções da versão 2.0 (`v2_*`) **e** as da clássica (`users`/`scores`) no
mesmo arquivo, sem conflito. Clique **Publish**.

## 6. Publicar o site

```bash
cd /Users/glaucio/Projects/Palavilha
git add firebase-config.js
git commit -m "Liga o placar do Palavrilha 2.0 (Firebase)"
git push
```

Abra o site, termine o desafio do dia, digite um e-mail em **Placar → Entrar**
e você aparece no **Global**. Na aba **Amigos**, seu **e-mail** fica visível
para você mesmo — combine com um amigo para vocês se adicionarem mutuamente
(cada um digita o e-mail do outro), ou use o botão **"Convidar por link"**
(ver abaixo).

## Convidar por link (SMS, WhatsApp, iMessage…)

Na aba **Amigos**, o botão **"Convidar por link (SMS, WhatsApp…)"** gera um
link com o seu e-mail embutido (`?convite=voce@email.com`) e abre a folha de
compartilhamento nativa (`navigator.share`) — ou copia o texto, se o
navegador não tiver isso. Manda por SMS, WhatsApp, iMessage, e-mail etc.

Quando a pessoa convidada abre o link:

- Se ela ainda não tem cadastro, a tela de entrada já avisa quem convidou e,
  assim que ela digitar o próprio e-mail, os dois já ficam conectados.
- Se ela já tem cadastro, você é adicionado à lista de amigos dela
  automaticamente, na hora, sem precisar digitar nada.

Isso só adiciona **você à lista de quem a pessoa convidada acompanha** (o
mesmo modelo de "amigo" de mão única descrito em "Limitações conhecidas"
abaixo) — se você também quiser ver os tempos dela, adicione o e-mail dela
manualmente (ou peça para ela te mandar o link dela de volta).

## Adicionar direto pelo placar Global

Cada linha do placar **Global** (menos a sua) tem um botão **"+"**. Toque
nele para adicionar aquela pessoa aos seus amigos na hora, sem precisar
saber o e-mail dela — útil quando você já vê alguém no Global e só quer
acompanhar essa pessoa.

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
dia), então cada dia tem seu próprio placar.

## O que acontece se o mesmo e-mail for usado em dois aparelhos

Como não há senha, a "conta" é presa ao navegador/aparelho onde você entrou
(login anônimo por baixo dos panos). Se você digitar o mesmo e-mail em outro
navegador, o app avisa que aquele e-mail já está em uso e oferece **"Usar
este e-mail mesmo assim"** — isso só reaponta o índice de convite
(`v2_emailIndex`) para o novo aparelho; o progresso do aparelho antigo
continua existindo, mas passa a não ser mais encontrado por esse e-mail.
Não é possível "recuperar" a conta antiga a partir daqui — essa é a
limitação de propósito de um login sem senha.

## Limitações conhecidas

- **Sem senha, sem verificação, sem recuperação entre aparelhos** — decisão
  deliberada para manter o cadastro leve. Se isso incomodar mais adiante, o
  caminho natural é trocar o login anônimo por e-mail + link mágico do
  próprio Firebase Authentication (link de verdade, com posse do e-mail
  confirmada).
- **Convite é manual**: o site é estático (GitHub Pages), não há servidor
  para mandar e-mail de convite automaticamente. Combine com a pessoa por
  fora e cada um digita o e-mail do outro.
- Tempo enviado pelo próprio cliente; as regras só validam faixas
  (`1s`–`24h`, dicas `0`–`5`). Blindagem contra trapaça ficaria por conta de
  Cloud Functions / App Check, fora do escopo desta versão.
- Sem internet ou via `file://`, o placar não aparece — o jogo segue normal.
- Versão do SDK fixada na constante `SDK` no topo de `leaderboard.js`.
