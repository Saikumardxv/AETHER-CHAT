import { app } from '../server/server.js';
import { connectDB } from '../server/config/db.js';

const databaseReady = connectDB();

export default async function handler(request, response) {
  if (request.query?.route) {
    const route = String(request.query.route).replace(/^\/+/, '');
    const query = new URLSearchParams(request.query);
    query.delete('route');
    request.url = `/api/${route}${query.toString() ? `?${query}` : ''}`;
  }
  await databaseReady;
  return app(request, response);
}