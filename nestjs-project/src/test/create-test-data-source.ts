import { DataSource, EntitySchema, MigrationInterface } from 'typeorm';

interface TestDataSourceOptions {
  synchronize?: boolean;
  migrations?: (new () => MigrationInterface)[];
}

export function createTestDataSource(
  // TypeORM's DataSourceOptions still accepts Function constructors here.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  entities: (Function | string | EntitySchema<any>)[],
  options: TestDataSourceOptions = {},
): DataSource {
  const { synchronize = true, migrations } = options;
  return new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'db',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'streamtube',
    password: process.env.DB_PASSWORD ?? 'streamtube',
    database: process.env.DB_DATABASE ?? 'streamtube',
    entities,
    synchronize,
    ...(migrations !== undefined && { migrations, migrationsRun: false }),
  });
}

export async function cleanAllTables(dataSource: DataSource): Promise<void> {
  await deleteIfExists(dataSource, 'videos');
  await deleteIfExists(dataSource, 'refresh_tokens');
  await deleteIfExists(dataSource, 'verification_tokens');
  await deleteIfExists(dataSource, 'channels');
  await deleteIfExists(dataSource, 'users');
}

async function deleteIfExists(
  dataSource: DataSource,
  tableName: string,
): Promise<void> {
  await dataSource.query(`
    DO $$
    BEGIN
      IF to_regclass('public.${tableName}') IS NOT NULL THEN
        EXECUTE 'DELETE FROM "${tableName}"';
      END IF;
    END $$;
  `);
}
