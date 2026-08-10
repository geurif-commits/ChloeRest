import pg from 'pg';
import { config } from './config.js';

const pool = new pg.Pool(config.database);

pool.on('error', (error) => {
  console.error('Conexión inesperada de PostgreSQL perdida:', error.message);
});

export default pool;
