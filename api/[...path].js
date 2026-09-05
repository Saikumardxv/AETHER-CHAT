import { app } from '../server/server.js';
import { connectDB } from '../server/config/db.js';

const databaseReady = connectDB();

export default async function handler(request, response) {
  await databaseReady;
  return app(request, response);
}