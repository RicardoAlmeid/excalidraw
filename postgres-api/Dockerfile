FROM node:18-alpine

WORKDIR /app

# Copiar package.json e instalar dependências
COPY package*.json ./
RUN npm install

# Copiar código fonte
COPY server.js .

# Expor porta
EXPOSE 4001

# Comando para iniciar
CMD ["npm", "start"]