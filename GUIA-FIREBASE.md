# GUIA COMPLETO - Configurar Firebase Auth

## PARTE 1: Acessar o Firebase Console

1. Abra o navegador (Chrome recomendado)
2. Acesse: https://console.firebase.google.com
3. Faça login com sua conta Google
4. Clique no projeto: **plataforma-escolar-71635**

---

## PARTE 2: Habilitar Autenticação

### Passo 2.1 - Encontrar Authentication
```
No menu do lado ESQUERDO, procure:
    → Authentication (ícone de pessoa/👤)
    → Clique nele
```

### Passo 2.2 - Habilitar Email/Password
```
Na tela que abrir:
    → Clique na aba "Sign-in method" (no topo)
    → Procure "Email/Password" na lista
    → Clique no ícone de EDITAR (lápis/✏️) ou no toggle
    → Ative o toggle "Enable"
    → Clique "Save" (salvar)
```

### Passo 2.3 - Adicionar Domínio
```
Ainda em Authentication:
    → Clique em "Settings" (engrenagem/⚙️) no topo
    → Procure "Authorized domains"
    → Clique "Add domain"
    → Digite: localhost
    → Clique "Add"
    → (Depois, quando for hospedar, adicione seu domínio real)
```

---

## PARTE 3: Criar Conta do Professor

### Passo 3.1 - Criar Usuário
```
No menu esquerdo:
    → Authentication
    → Clique na aba "Users" (no topo)
    → Clique botão "+ Add user" (ou "Add user")
    
    Formulário que abrir:
        → Email: professor@plataforma.app
        → Password: Digite uma senha forte (mín 6 caracteres)
        → Clique "Add user" ou "Save"
```

### Passo 3.2 - Copiar o UID
```
Após criar, você verá uma tabela com usuários.
    → Na linha do professor, procure a COLUNA "User UID"
    → COPIE o valor (ex: algo como: Xk2L9abc123XYZ...)
    → ANOTE esse valor - você precisará dele!
```

---

## PARTE 4: Criar Documento no Firestore

### Passo 4.1 - Acessar Firestore
```
No menu esquerdo do Firebase Console:
    → Procure "Firestore Database" (ícone de banco de dados/📊)
    → Clique nele
    → Se pedir para criar banco:
        → Selecione "Start in test mode" ou "Start collection"
        → Clique "Next" ou "Next step"
```

### Passo 4.2 - Criar Coleção "users"
```
Na tela do Firestore:
    → Clique "Start collection"
    
    Campo que aparecer:
        → Collection ID: users
        → Clique "Next"
```

### Passo 4.3 - Criar Documento do Professor
```
Formulário que aparecer:
    → Document ID: COLE O UID que você copiou no passo 3.2
        (ex: Xk2L9abc123XYZ...)
    → Agora você adiciona os campos:
    
    Clique "Add field" para cada campo:
    
    CAMPO 1:
        → Field: nome
        → Type: string
        → Value: Professor
        → Clique check/✓ para confirmar
    
    CAMPO 2:
        → Clique "Add field"
        → Field: role
        → Type: string
        → Value: professor
        → Clique check/✓ para confirmar
    
    CAMPO 3:
        → Clique "Add field"
        → Field: turmas
        → Type: array
        → Value: leave empty (vazio)
        → Clique check/✓ para confirmar
    
    → Após todos os campos, clique "Save" (ou "Save document")
```

---

## PARTE 5: Testar Login

### Agora você pode testar!

1. Abra o arquivo `index.html` no navegador
2. No campo Login, digite:
   ```
   professor
   ```
3. No campo Senha, digite:
   ```
   A senha que você criou no passo 3.1
   ```
4. Clique "Entrar"

### Se funcionar:
- Você será redirecionado para `professor.html`

### Se não funcionar:
- Verifique se criou tudo corretamente
- Verifique os campos no Firestore (nome exato: `role`, não `Role`)

---

## RESOLUÇÃO DE PROBLEMAS

### "Email/password sign-in is disabled"
```
→ Authentication → Sign-in method
→ Encontrar Email/Password
→ Clicar no toggle "Enable"
→ Salvar
```

### "User not found" após login
```
→ Verifique se criou o documento em "users" no Firestore
→ Verifique se o Document ID é IGUAL ao UID do passo 3.2
→ Verifique se os campos estão corretos:
    nome: "Professor" (com P maiúsculo)
    role: "professor" (com p minúsculo)
    turmas: [] (array vazio)
```

### "Email already in use"
```
→ Esse email já foi cadastrado antes
→ Use outro email ou recupere a senha existente
```

### Não encontra Firestore Database
```
→ Às vezes está com outro nome no menu
→ Procure por "Cloud Firestore" ou "Firestore"
→ Se não encontrar, clique em "Build" no menu
→ Depois procure "Firestore Database"
```

###botão "Add user" não aparece
```
→ Certifique-se de estar na aba "Users"
→ Às vezes está como "Users" ou "All users"
→ Procure no canto superior direito
```

---

## CHECKLIST FINAL

Antes de testar, verifique tudo:

- [ ] Authentication habilitado (Email/Password)
- [ ] Domínio "localhost" adicionado
- [ ] Usuário criado em Authentication
- [ ] UID copiado
- [ ] Coleção "users" criada
- [ ] Documento com UID correto
- [ ] Campos: nome, role, turmas

---

## PRÓXIMO PASSO

Após conseguir fazer login como professor, você podrá:

1. Criar turmas no painel
2. Adicionar alunos (que serão criados automaticamente no Firebase Auth)
3. Criar provas
4. Atribuir provas às turmas

Boa sorte! 🍀