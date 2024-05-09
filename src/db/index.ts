import { Database } from './models'; // this is the Database interface we defined earlier
import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';

const dialect = new PostgresDialect({
  pool: new Pool({
    connectionString: process.env.POSTGRES_URL,
  }),
});

// Database interface is passed to Kysely's constructor, and from now on, Kysely
// knows your database structure.
// Dialect is passed to Kysely's constructor, and from now on, Kysely knows how
// to communicate with your database.
const db = new Kysely<Database>({
  dialect,
});

export const initUserTable = async () =>
  await db.schema
    .createTable('user')
    .addColumn('id', 'numeric', (col) => col.primaryKey())
    .addColumn('first_name', 'text')
    .addColumn('last_name', 'text')
    .addColumn('created_at', 'timestamp')
    .addColumn('metadata', 'text')
    .execute();

export const dropUserTable = async () =>
  await db.schema.dropTable('user').execute();

export const getUser = async (id: number) => {
  return await db
    .selectFrom('user')
    .where('id', '=', id)
    .select(['id', 'first_name', 'last_name', 'created_at', 'metadata'])
    .executeTakeFirst();
};

export const createUser = async (
  id: number,
  first_name?: string,
  last_name?: string,
) => {
  return await db
    .insertInto('user')
    .values({
      id,
      first_name: first_name || id.toString(),
      last_name,
      metadata: JSON.stringify({
        wallet: null,
      }),
    })
    .returning(['id', 'first_name', 'last_name', 'created_at', 'metadata'])
    .executeTakeFirst();
};

export const updateUserMetaData = async (
  id?: number,
  payload?: { [key: string]: any },
) => {
  if (!id) {
    throw new Error('User id not found');
  }
  const user = await getUser(id);

  if (!user) {
    throw new Error('User not found');
  }

  console.log('updateUserMetaData', user, payload);

  await db
    .updateTable('user')
    .set(
      'metadata',
      JSON.stringify({
        ...(JSON.parse(user.metadata || '{}') || {}),
        ...payload,
      }),
    )
    .where('id', '=', id)
    .returning(['id', 'first_name', 'last_name', 'created_at', 'metadata'])
    .executeTakeFirst();
};
