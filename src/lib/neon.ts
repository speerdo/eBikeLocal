import postgres from 'postgres';

const connectionString = import.meta.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    '[neon] DATABASE_URL is not set. Database queries will fail. See .env.example for setup instructions.'
  );
}

const sql = postgres(connectionString || '', {
  ssl: 'require',
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export default sql;
