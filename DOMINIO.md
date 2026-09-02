# Domínio próprio: palavrilha.com.br

Passo a passo para apontar `palavrilha.com.br` para o site que já está no
GitHub Pages (`https://glaucio1101.github.io/palavrilha/`).

> Enquanto o domínio não estiver pronto, **não** faça o passo 4 (não adicione o
> arquivo `CNAME` nem configure o domínio no GitHub). Se o domínio for
> configurado antes do DNS resolver, o site pode ficar fora do ar por um período.

---

## 1. Pré-requisitos

- **CPF ou CNPJ** — domínios `.com.br` só são registrados pelo
  [Registro.br](https://registro.br) e exigem documento brasileiro.
- Custo: cerca de **R$ 40 por ano**.
- Uma conta no Registro.br.

## 2. Registrar o domínio

1. Em <https://registro.br>, pesquise `palavrilha.com.br`.
2. Se estiver livre, conclua o registro e o pagamento.
3. Aguarde o domínio aparecer como **ativo** no painel.

## 3. Configurar o DNS no Registro.br

No painel do domínio, abra **DNS → Editar Zona** (editor de zona do próprio
Registro.br). Crie exatamente estes registros:

### Domínio raiz (`palavrilha.com.br`) — apontando para o GitHub Pages

| Tipo | Nome/Host | Valor |
|------|-----------|-------|
| A    | `@`       | `185.199.108.153` |
| A    | `@`       | `185.199.109.153` |
| A    | `@`       | `185.199.110.153` |
| A    | `@`       | `185.199.111.153` |
| AAAA | `@`       | `2606:50c0:8000::153` |
| AAAA | `@`       | `2606:50c0:8001::153` |
| AAAA | `@`       | `2606:50c0:8002::153` |
| AAAA | `@`       | `2606:50c0:8003::153` |

### Subdomínio `www`

| Tipo  | Nome/Host | Valor |
|-------|-----------|-------|
| CNAME | `www`     | `glaucio1101.github.io.` |

(Se o editor do Registro.br não aceitar `@`, deixe o campo de host **em branco**
para o domínio raiz. O ponto final em `glaucio1101.github.io.` é opcional na
maioria dos editores.)

> Estes são os IPs oficiais do GitHub Pages. Se algum dia o GitHub publicar IPs
> novos, confira em
> <https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site>.

A propagação leva de alguns minutos a algumas horas. Para conferir:

```bash
dig +short palavrilha.com.br
dig +short www.palavrilha.com.br
```

Os `A` devem retornar os quatro IPs `185.199.10x.153`.

## 4. Ligar o domínio no GitHub (só depois que o DNS acima estiver respondendo)

**Opção recomendada — pela interface:**

1. Repositório → **Settings → Pages**.
2. Em **Custom domain**, digite `palavrilha.com.br` e clique **Save**.
   (Isso cria automaticamente um arquivo `CNAME` no repositório com um commit.)
3. Espere a mensagem **"DNS check successful"**.
4. Marque **Enforce HTTPS** (pode levar até ~1 h para o certificado ficar pronto).

**Opção equivalente — pelo terminal:**

```bash
cd /Users/glaucio/Projects/Palavilha
echo 'palavrilha.com.br' > CNAME
git add CNAME
git commit -m "Domínio próprio: palavrilha.com.br"
git push
```

Depois, ainda em **Settings → Pages**, confirme o domínio e marque
**Enforce HTTPS**.

## 5. Depois de no ar

- O site passa a responder em `https://palavrilha.com.br` e
  `https://www.palavrilha.com.br` (o `www` redireciona para a raiz).
- O endereço `glaucio1101.github.io/palavrilha` passa a redirecionar para o
  domínio próprio.
- Como todos os caminhos do app são **relativos**, nada no código precisa mudar.
  A Política de Privacidade fica em `https://palavrilha.com.br/privacy.html`.
- **E-mail de contato:** a política cita `contato@palavrilha.com.br`. Crie esse
  endereço como redirecionamento para o seu e-mail pessoal — o Registro.br
  oferece encaminhamento de e-mail no próprio painel, ou use um serviço de
  e-mail à sua escolha.

## Observações para as próximas fases

- **Se o site migrar para o Firebase Hosting** (quando entrarem contas e
  placares), o domínio é reapontado lá: `firebase hosting:sites`, depois
  **Hosting → Add custom domain** no console do Firebase, que fornece novos
  registros `A`/`TXT` para pôr no Registro.br. É só trocar a zona DNS; o domínio
  em si continua o mesmo.
- **App iOS (Universal Links):** para abrir links `palavrilha.com.br` direto no
  app, será preciso servir um arquivo
  `/.well-known/apple-app-site-association` no domínio. Fica para a fase do app.
