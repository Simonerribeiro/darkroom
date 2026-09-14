Deployment no Railway - Chamada Exclusiva

Configuracao da Variavel BASE_URL

Usando .env.production (Recomendado - Atual)

O arquivo .env.production esta configurado com a URL correta:
BASE_URL=https://darkroom-production-0014.up.railway.app

Como funciona:
1. O Node.js carrega dotenv automaticamente no server.js (linha 1)
2. O arquivo .env.production e usado quando NODE_ENV=production (padrao no Railway)
3. A variavel BASE_URL fica disponivel como process.env.BASE_URL
4. Os links gerados em /links/share usarao essa URL

Por que nao usar Railway Variables Dashboard

O dashboard do Railway tem limitacoes de salvamento. A solucao do arquivo .env.production e:
- Permanente (versionado no Git)
- Nao depende de UI do Railway
- Pode ser atualizado com simples commit

Quando Atualizar BASE_URL

Cenario 1: Dominio customizado propagar

Quando www.chamadaexclusiva.com.br DNS estiver 100% propagado:

1. Editar .env.production:
   BASE_URL=https://www.chamadaexclusiva.com.br

2. Commit e push:
   git add .env.production
   git commit -m "Update BASE_URL to custom domain"
   git push origin main

3. Railway fara deploy automatico

Cenario 2: Mudar para nova URL Railway

Se o projeto foi movido ou recriado no Railway:

1. Editar .env.production
2. Atualizar a URL
3. Commit e deploy

Verificacao

Para confirmar que BASE_URL esta sendo lido corretamente:

1. Acesse o dashboard: https://darkroom-production-0014.up.railway.app/dashboard
2. Gere um link de chamada
3. A URL gerada deve comecar com: https://darkroom-production-0014.up.railway.app/go/...

Se comecar com outra URL, significa que .env.production nao foi aplicado.

Estrutura de Arquivos

darkroom/
- server.js (Carrega dotenv na linha 1)
- .env.production (BASE_URL configurado aqui - PRODUCAO)
- .env.example (Documentacao de todas as variaveis)
- DEPLOYMENT.md (Este arquivo)
- ... (outros arquivos)

Referencia de Codigo

Arquivo: routes/links.js (linhas 216-220)

let baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
if (!baseUrl.includes('://')) {
  baseUrl = `https://${baseUrl}`;
}

A variavel BASE_URL e lida do ambiente e usada para montar os URLs dos convites.
