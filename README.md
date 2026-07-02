# Sistema de Ponto Online

Sistema web simples para bater ponto com CPF, data de nascimento, localização e foto. Feito para rodar como site estático no GitHub Pages usando Firebase Authentication, Cloud Firestore e Cloud Storage.

## Funções incluídas

### Funcionário
- Login usando CPF e data de nascimento.
- Captura da localização atual.
- Captura de foto pela câmera do dispositivo.
- Registro de Bater ponto.
- Histórico dos últimos pontos do funcionário logado.

### Administrador
- Login por e-mail e senha do Firebase Authentication.
- Cadastro e edição de funcionários.
- Ativar ou inativar funcionários.
- Visualização dos pontos registrados.
- Filtros por data e funcionário.
- Link para abrir localização no Google Maps.
- Link para visualizar foto salva no Firebase Storage.
- Exportação CSV dos registros.

## Estrutura do Firebase

### Coleções do Firestore

#### admins/{UID_DO_ADMIN}
```js
{
  nome: "Eliel",
  email: "seuemail@dominio.com",
  ativo: true,
  role: "admin"
}
```

#### funcionarios/{CPF_SOMENTE_NUMEROS}
```js
{
  cpf: "00000000000",
  nome: "Nome do Funcionário",
  nascimento: "1990-01-01",
  setor: "Produção",
  cargo: "Costureira",
  ativo: true,
  criadoEm: timestamp,
  atualizadoEm: timestamp
}
```

#### sessoes/{UID_ANONIMO}
Criada automaticamente quando o funcionário faz login.

#### pontos/{ID_AUTOMATICO}
Criada automaticamente ao bater ponto.

### Storage
Fotos salvas em:
```txt
pontos/CPF/ID_DO_PONTO.jpg
```

## Como configurar o Firebase

1. Entre no Firebase Console e crie um projeto.
2. Crie um app Web dentro do projeto.
3. Copie a configuração do app Web.
4. Abra o arquivo `firebase-config.js` e cole os dados no objeto `firebaseConfig`.
5. Em Authentication > Sign-in method, ative:
   - Email/Senha
   - Anonymous
6. Crie o Cloud Firestore.
7. Crie o Cloud Storage.
8. Publique as regras:
   - Firestore: use o conteúdo de `firestore.rules`.
   - Storage: use o conteúdo de `storage.rules`.

## Criar o primeiro administrador

1. Firebase Console > Authentication > Users.
2. Clique em Add user.
3. Crie seu e-mail e senha de administrador.
4. Copie o UID do usuário criado.
5. Vá em Firestore Database.
6. Crie a coleção `admins`.
7. Dentro dela, crie um documento com o ID exatamente igual ao UID do usuário.
8. Adicione os campos:

```js
nome: "Eliel"
email: "seuemail@dominio.com"
ativo: true
role: "admin"
```

Depois disso, entre no painel administrativo pelo site usando o e-mail e senha criados no Authentication.

## Subir no GitHub Pages

1. Crie um repositório no GitHub, por exemplo: `sistema-ponto-online`.
2. Envie todos os arquivos deste pacote para o repositório.
3. No GitHub, vá em Settings > Pages.
4. Em Build and deployment, selecione:
   - Source: Deploy from a branch
   - Branch: main
   - Folder: /root
5. Salve e aguarde o link do GitHub Pages.

## Atenção sobre CPF, foto e localização

Este sistema coleta dados pessoais e dados sensíveis de operação, como foto e localização. Para uso real, informe os funcionários, registre a finalidade, controle quem tem acesso e mantenha regras de segurança revisadas. Para produção, o ideal é evoluir o login com Cloud Functions ou outro backend, evitando validação somente pelo navegador.


## Ajuste desta versão

Nesta versão o funcionário usa somente o botão **Bater ponto**. Cada registro salva data, horário, foto e localização, e o painel administrativo exibe os horários no relatório.
