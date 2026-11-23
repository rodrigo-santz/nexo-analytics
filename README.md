# NEXO Analytics ✦

Central de acompanhamento de **lives, raids para a NEXO, raids externas, lives sem raid detectada e registros inconclusivos**. O layout usa a identidade visual roxo/preto e a logo da imagem de referência fornecida. O projeto é independente do bot de WhatsApp: **não envia nenhuma mensagem**.

## O que está pronto

- Painel responsivo em HTML, CSS e JavaScript, com fundo de constelações, animações leves, métricas, gráfico de atividade e distribuição de raids.
- Busca e ordenação de streamers, fichas individuais, histórico filtrável e identificação de cobertura parcial.
- `worker/index.js`: recebe eventos oficiais da Twitch EventSub, valida assinatura HMAC e grava um arquivo JSON **por evento** no GitHub, com idempotência por identificador.
- `scripts/sync-subscriptions.mjs`: cria as inscrições `stream.online`, `stream.offline` e `channel.raid` para os logins cadastrados.
- `scripts/watchdog.mjs`: verifica inscrições, detecta períodos prolongados sem checagem e reconcilia início/fim observável pela API da Twitch. Se a cobertura for interrompida, marca as sessões como inconclusivas.
- `scripts/aggregate.mjs`: consolida os arquivos em `data/dashboard.json` e atualiza o painel.
- GitHub Actions para sincronizar assinaturas e atualizar/publicar o site a cada 5 minutos (a execução agendada pode atrasar).
- Testes automatizados para classificação de raids, lacunas e assinatura de eventos.

## Arquitetura

```
Twitch EventSub
    │ webhook HTTPS (HMAC verificado)
    ▼
Cloudflare Worker gratuito (somente receptor)
    │ PUT de data/events/AAAA-MM-DD/ID.json
    ▼
GitHub repositório `nexo-analytics` (arquivos JSON)
    │ GitHub Actions a cada 5 min: saúde, agregação, deploy
    ▼
GitHub Pages `https://SEU_USUARIO.github.io/nexo-analytics/`
```

**Não há banco de dados externo**. O GitHub é a base permanente em arquivos JSON. O Worker só recebe dados em tempo real; o site lê JSON estático. O bot de avisos de LIVE ON não precisa ser alterado.

## 1. Testar no seu computador

Requer Node.js 20+ (recomendado Node 22).

```bash
npm test
npm run build:data
npm run dev
```

Acesse `http://localhost:4173/` para **dados reais**, inicialmente zerados.

## 2. Criar o repositório GitHub

1. Crie um repositório **público** chamado `nexo-analytics`, com branch principal `main`.
2. Extraia o ZIP e envie **todo o conteúdo interno da pasta**, incluindo `.github/workflows`, para a raiz do repositório. Por exemplo:

```bash
git init
git branch -M main
git add .
git commit -m "feat: iniciar NEXO Analytics"
git remote add origin https://github.com/SEU_USUARIO/nexo-analytics.git
git push -u origin main
```

3. No repositório: **Settings → Pages → Build and deployment → Source → GitHub Actions**.
4. O workflow **Atualizar dados e publicar painel** implanta o site. Use **Actions → Atualizar dados e publicar painel → Run workflow** para uma execução manual inicial, se necessário.
5. A URL pública será `https://SEU_USUARIO.github.io/nexo-analytics/`.

> Se o seu login GitHub não for `rodrigo-santz`, altere `GITHUB_OWNER` em `worker/wrangler.toml` antes de publicar.

## 3. Cadastrar uma aplicação na Twitch

No [Twitch Developer Console](https://dev.twitch.tv/console/apps), crie uma aplicação. Guarde o **Client ID** e gere um **Client Secret**. Os eventos usados são de leitura pública e usam token de aplicativo, sem exigir que cada streamer faça login na aplicação. Não publique credenciais no repositório.

Defina um **segredo de webhook** próprio, aleatório, com 10 a 100 caracteres ASCII (recomenda-se 32+). O **mesmo segredo** será usado no Worker e no GitHub Actions.

## 4. Criar o token do GitHub

Em **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**, crie um token com acesso **apenas ao repositório `nexo-analytics`** e permissão **Contents: Read and write**. Ele permite que o Worker escreva arquivos de eventos JSON. Não o coloque no JavaScript do site ou no repositório.

## 5. Publicar o receptor Cloudflare

Crie uma conta gratuita na [Cloudflare](https://dash.cloudflare.com/). No computador:

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put TWITCH_EVENTSUB_SECRET
npx wrangler secret put GITHUB_TOKEN
npm run deploy
```

Ao solicitar os valores, cole o segredo do webhook e depois o token fino do GitHub. O terminal não deve publicá-los. Confira `worker/wrangler.toml` com seu `GITHUB_OWNER` e `GITHUB_REPO`.

O deploy retornará uma URL como:

```text
https://nexo-analytics-eventsub.SEU_SUBDOMINIO.workers.dev
```

- `.../health`: verifica que o receptor está acessível, **não** que a Twitch está cadastrada.
- `.../webhook`: endereço usado nas inscrições EventSub, exatamente esse caminho.

**Atenção:** o Worker não gera token da Twitch nem envia mensagens ao WhatsApp. A verificação HMAC protege a rota pública, e o token do GitHub fica como segredo no servidor.

## 6. Configurar secrets no GitHub Actions

No repositório `nexo-analytics`, vá a **Settings → Secrets and variables → Actions → New repository secret** e cadastre:

| Nome | Valor |
|---|---|
| `TWITCH_CLIENT_ID` | Client ID da aplicação Twitch |
| `TWITCH_CLIENT_SECRET` | Client Secret da Twitch |
| `TWITCH_EVENTSUB_SECRET` | Mesmo segredo informado ao Worker |
| `TWITCH_WEBHOOK_URL` | `https://...workers.dev/webhook` (com `/webhook`) |

O **token fino do GitHub** vai **somente** no segredo `GITHUB_TOKEN` do Worker, não nesses secrets.

Depois, em **Actions → Sincronizar EventSub → Run workflow**, execute manualmente. Aguarde a Twitch validar os webhooks. O workflow também roda a cada 6 horas para tentar restaurar inscrições faltantes. Execute **Atualizar dados e publicar painel** para gerar e publicar um primeiro relatório.

## 7. Como gerenciar os streamers

Edite `data/streamers.json`, mantendo um array JSON de logins da Twitch em letras minúsculas:

```json
["santz_rj", "dree_sp", "hecazinha"]
```

O pacote já vem com uma **lista inicial de 18 canais**. Ajuste livremente. Após modificar a lista, rode **Sincronizar EventSub** manualmente no GitHub Actions; a sincronização periódica também adiciona assinaturas faltantes. O projeto **não sincroniza automaticamente** novas adições do repositório do bot do WhatsApp.

Para excluir um membro, remova seu login da lista. Os eventos antigos podem permanecer na base bruta, mas não serão mostrados nos relatórios atuais. Se quiser apagar eventos antigos da base, revise os arquivos manualmente. Inscrições antigas de membros removidos não são apagadas automaticamente na Twitch; se necessário, faça a limpeza na [API EventSub](https://dev.twitch.tv/docs/api/reference/#delete-eventsub-subscription).

## 8. Regras do sistema

- `RAID NEXO`: foi capturado um evento `channel.raid` cujo destino está em `streamers.json`.
- `RAID EXTERNA`: houve evento de raid para canal não listado.
- `SEM RAID DETECTADA`: fim registrado; 10 minutos de tolerância após o encerramento; verificação disponível após o fim; nenhum evento de raid observado e nenhuma lacuna conhecida durante a live.
- `INCONCLUSIVA`: falta de início/fim ou lacuna detectada no monitoramento — não contamos como “sem raid”.
- `AO VIVO`: transmissão ainda sem encerramento registrado.
- `AGUARDANDO`: encerramento recente, aguardando janela de tolerância.

**Limitação essencial:** “sem raid detectada” **não prova** que nenhuma raid aconteceu. A Twitch não oferece nesta solução uma API histórica de todas as raids para recuperar eventos perdidos. Falhas breves entre duas verificações podem passar despercebidas. O sistema marca como inconclusivo quando há **evidência de falha**, e o painel deixa essa diferença clara. O histórico começa após as inscrições serem ativadas; não recupera lives antigas.

**Outra limitação:** alterações frequentes geram muitos arquivos/commits no GitHub. Para o volume inicial da comunidade, isso simplifica a infraestrutura, mas um crescimento grande pode justificar banco de dados. GitHub Actions `schedule` é **best effort** e pode atrasar ou ser desativado em repositórios públicos inativos. O plano gratuito da Cloudflare e os limites do GitHub podem mudar.

## 9. Pastas

```text
nexo-analytics/
├── .github/workflows/
│   ├── publish.yml          # Consolidação, watchdog e Pages
│   └── sync-eventsub.yml    # Inscrições Twitch
├── data/
│   ├── streamers.json       # Relação oficial da NEXO
│   ├── dashboard.json       # Resumo gerado
│   ├── health/status.json   # Lacunas e checagens
│   └── events/              # 1 JSON por mensagem EventSub
├── scripts/                 # API Twitch, consolidação e watchdog
├── site/                    # Interface estática e logo
├── tests/                   # Testes de regressão
├── worker/                  # Receptor Cloudflare
├── package.json
└── README.md
```

### Fontes oficiais

- Twitch [EventSub](https://dev.twitch.tv/docs/eventsub) · [raid](https://dev.twitch.tv/docs/eventsub/reference/channel#channel-raid) · [stream online/offline](https://dev.twitch.tv/docs/eventsub/reference/stream) · [webhooks](https://dev.twitch.tv/docs/eventsub/handling-webhook-events)
- GitHub [Pages](https://docs.github.com/pages) · [Actions](https://docs.github.com/actions)
- Cloudflare [Workers](https://developers.cloudflare.com/workers/)

---

Feito como ponto de partida implantável: **é preciso conectar suas próprias contas e configurar os segredos para começar a coletar dados reais**. Não foi publicado em nenhuma conta externa automaticamente.
