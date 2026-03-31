FROM node:22-alpine

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar todas as dependências (incluindo devDependencies para o Vite e tsx)
RUN npm install

# Copiar o restante do código da aplicação
COPY . .

# Fazer o build do frontend (React/Vite)
RUN npm run build

# Criar diretório de backup para persistência de dados (certificados e clientes)
RUN mkdir -p backup

# Definir variáveis de ambiente para produção
ENV NODE_ENV=production
ENV PORT=3000

# Expor a porta que a aplicação vai rodar
EXPOSE 3000

# Comando para iniciar a aplicação usando tsx
CMD ["npx", "tsx", "server.ts"]
