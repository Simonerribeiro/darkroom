# Encurtador de URLs - Chamada Exclusiva

## Visão Geral

Sistema de encurtamento automático de links de chamadas. Ao invés de gerar URLs longas, o sistema agora cria códigos curtos e memoráveis.

### Exemplos

**Antes (URL longa):**
https://darkroom-production-0014.up.railway.app/go/6-26/30f1c969-5611-4c74-930d-031eda49c0b7

**Depois (URL encurtada):**
https://darkroom-production-0014.up.railway.app/s/5pc-6nhr-fo8

Quando o domínio propagar:
https://www.chamadaexclusiva.com.br/s/5pc-6nhr-fo8

---

## Como Funciona

### 1. Geração de Link Encurtado

Quando um usuário clica em "Compartilhar" uma chamada:

1. Sistema gera um UUID único para a sessão (como antes)
2. **NOVO:** Sistema gera um código curto único (ex: 5pc-6nhr-fo8)
3. Código encurtado é armazenado no banco de dados (tabela shortened_links)
4. URL retornada ao usuário usa o código encurtado

### 2. Redirecionamento

Quando um cliente acessa o link encurtado:

1. Acessa: https://www.chamadaexclusiva.com.br/s/5pc-6nhr-fo8
2. Servidor consulta banco e encontra o UUID correspondente
3. Redireciona automaticamente para: /go/6-26/30f1c969...
4. Cliente vê a chamada normalmente

### 3. Estrutura dos Códigos

- **Formato:** XXX-XXX-XXX (9 caracteres + 2 hífens)
- **Caracteres permitidos:** 2345679acdefghjkmnpqrstvwxyz (sem ambiguidade visual)
- **Exemplo:** 5pc-6nhr-fo8

---

## Funcionalidades

✅ Encurtamento automático ao compartilhar
✅ Códigos aleatórios únicos
✅ Redirecionamento transparente
✅ Sem impacto nas chamadas existentes
✅ Funciona com qualquer domínio (Railway ou customizado)
