FROM node:20-slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Expose port (if needed by Koyeb, though Bot only needs outbound)
EXPOSE 8000

CMD [ "node", "index.js" ]
