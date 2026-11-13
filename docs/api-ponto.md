# API de ponto · Pontomais

O sistema busca as marcações de ponto no **Pontomais**, fornecedor de ponto do restaurante.
Toda a conversa com o Pontomais fica em `src/lib/integracoes/ponto.ts`: trocar de fornecedor
de novo é mexer só nesse arquivo, mantendo o formato `MarcacaoPonto` (`src/lib/tipos.ts`).

Documentação oficial (Postman): https://documenter.getpostman.com/view/4785048/RWMCvVxN

## Acesso: um token
| O quê | Variável de ambiente | Onde vai na chamada |
| --- | --- | --- |
| Endereço da API | `PONTO_API_URL` (ex.: `https://api.pontomais.com.br`) | início de todas as URLs |
| "Token público" do painel | `PONTO_API_TOKEN` (cadastrar como **Sensitive** na Vercel) | cabeçalho `access-token` |

- O token fica no painel do Pontomais: entrar como administrador, menu **Marketplace**,
  área **API Pontomais** ("Saiba mais"), campo **Token público** (a API precisa estar contratada).
- Não há troca por token temporário: o mesmo token vai em todas as chamadas.
- As chamadas acontecem só no servidor (rota `/api/ponto/marcacoes`), nunca no navegador.
- `401` = token ausente ou inválido.

## O que o adaptador usa
1. **Colaboradores** · `GET /external_api/v1/employees?active=true&attributes=id,cpf,nis,registration_number&page=N&per_page=20`
   Resposta: `{"employees": [{"id": 8, "cpf": "999.999.999-99", "nis": "999.99999.99-9", "registration_number": "456"}], "meta": {...}}`
2. **Registros de ponto do dia** · `POST /external_api/v1/reports/time_cards`
   ```json
   {"report": {"start_date": "2026-11-04", "end_date": "2026-11-04", "group_by": "employee",
     "row_filters": "", "columns": "employee_name,pis,registration_number,date,time,time_card_index",
     "format": "json"}}
   ```
   Cada batida vem como `{"date": "Ter, 04/09/2018", "time": "08:00", "pis": "...",
   "registration_number": "0001", "time_card_index": "1ª Entrada"}`, dentro de `data` (agrupada).
3. **Datas de admissão** (botão "Buscar datas no Pontomais" da tela Equipe) ·
   `POST /external_api/v1/reports/employees`
   ```json
   {"report": {"group_by": "", "row_filters": "", "columns": "name,cpf,admission_date",
     "format": "json", "page": 1, "per_page": 500}}
   ```
   Cada colaborador ativo vem como `{"name": "...", "cpf": "999.999.999-99",
   "admission_date": "Ter, 07/08/2018"}`, dentro de `data`. `heading.page` traz "página/total".
   A rota `/api/ponto/admissoes` liga pelo CPF e grava em `funcionarios.data_admissao`
   **só de quem está sem data** (data acertada à mão não é trocada). Se o mesmo CPF aparecer
   duas vezes (readmissão), vale a admissão mais recente.

## Tradução para o formato do sistema
- O relatório **não traz o CPF**: cada batida é ligada ao CPF pela **matrícula**
  (`registration_number`, sem zeros à esquerda) ou, se faltar, pelo **PIS** (`nis`/`pis`).
  Batidas sem pessoa reconhecida são ignoradas (o registro da Vercel mostra só a quantidade).
- As batidas de cada pessoa no dia, em ordem de horário, viram:
  - 1ª batida → `entrada`; última, se for uma saída → `saida`
    (número ímpar de batidas, ex.: ainda não saiu → `saida` vazia);
  - com 3 ou mais batidas, a 2ª e a 3ª → `saidaIntervalo` e `voltaIntervalo`.
- Datas "Ter, 04/09/2018" → "2018-09-04"; CPF com pontos → só dígitos.
- A ligação com o funcionário do nosso sistema continua pelo **CPF**: cadastre na tela Equipe
  o mesmo CPF que está no Pontomais.

## Regras da conferência (o que o sistema faz com esses dados)
- No horário: entrada até 10 minutos depois do início do turno (`src/config/regras.ts`)
- Atrasado: entrada depois da tolerância; mostra os minutos de atraso
- Faltou: funcionário escalado sem nenhuma marcação no dia
- Hora extra: saída mais de 30 minutos depois do fim do turno
- Não escalado: bateu ponto mas não estava na escala do dia

## Se o Pontomais não responder
A tela usa `docs/marcacoes-exemplo.json` (dias 04/11 e 05/11/2026, da antiga API de demonstração)
e avisa que são dados de exemplo, com o motivo.
