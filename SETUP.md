# Plataforma Escolar - Configuração Firebase Auth

## Passo 1: Habilitar Firebase Auth

1. Acesse o [Console Firebase](https://console.firebase.google.com)
2. Selecione o projeto `plataforma-escolar-71635`
3. No menu lateral, clique em **Authentication**
4. Clique em **Sign-in method**
5. Clique em **Email/Password**
6. Habilite o toggle **Enable**
7. (Opcional) Desabilite "Email link" se não quiser login por link
8. Clique **Save**

## Passo 2: Configurar Domínios Autorizados

1. Em **Authentication** → **Settings** → **Authorized domains**
2. Adicione os domínios onde a aplicação será hospedada:
   - `localhost` (para testes locais)
   - Seu domínio de produção (ex: `plataforma.app`)

## Passo 3: Criar Conta do Professor

### Opção A: Via Console Firebase (Recomendado)

1. Vá em **Authentication** → **Users**
2. Clique em **Add user**
3. Preencha:
   - Email: `professor@plataforma.app`
   - Password: senha forte
4. Clique **Add user**
5. Copie o **User UID** gerado
6. Vá em **Firestore** → crie coleção `users` → novo documento:
   - Document ID: cole o UID
   - `nome`: "Professor"
   - `role`: "professor"
   - `turmas`: [] (vazio)

### Opção B: Via Interface (Script Helper)

No painel do professor, há um botão para criar novos professores.
Após criar pelo Console, o documento em `users/{uid}` é necessário.

## Passo 4: Migrar Dados Antigos

Se você tinha dados em `turmas` e `professores`, verifique se:

- Cada professor tem um documento em `users/{uid}` com:
  ```json
  {
    "nome": "Nome do Professor",
    "role": "professor",
    "turmas": []
  }
  ```

- Cada aluno novo adicionado terá automaticamente:
  ```json
  {
    "nome": "Nome do Aluno",
    "role": "aluno",
    "turmaId": "idDaTurma"
  }
  ```

## Passo 5: Testar Login

1. Abra `index.html` no navegador
2. Use as credenciais:
   - **Login**: `professor@plataforma.app` → use `professor` (será convertido para email)
   - **Senha**: a senha cadastrada

## Estrutura de Dados

### Coleção `users/{uid}`
```json
{
  "nome": "João Silva",
  "role": "aluno" | "professor",
  "turmaId": "abc123",  // apenas para alunos
  "turmas": []        // apenas para professores
}
```

### Coleção `turmas/{id}`
```json
{
  "nome": "6º Ano A",
  "alunos": [
    {"nome": "Maria", "senha": "senha123"}
  ],
  "provas": ["idProva1", "idProva2"],
  "criadoPor": "uidProfessor"
}
```

## FAQ

**P: Esqueci a senha do professor**
R: No Console Firebase → Authentication → Users → redefinir senha

**P: Como criar novos alunos?**
R: No painel do professor, abra uma turma e adicione aluno. A conta Firebase será criada automaticamente.

**P: Posso usar o sistema sem migrar dados?**
R: Sim, mas dados antigos (turmas/provas existentes) precisam do campo `criadoPor`.