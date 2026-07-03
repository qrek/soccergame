# Image minimale pour héberger le serveur de jeu n'importe où
# (Railway, Fly.io, Scaleway, VPS...). Aucune dépendance npm.
FROM node:22-alpine
WORKDIR /app
COPY . .
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
