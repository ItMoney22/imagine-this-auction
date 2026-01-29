import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createClient } = require('../apps/web/node_modules/@supabase/supabase-js/dist/main/index.js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('Missing SUPABASE envs');
}

const supa = createClient(url, key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const users = await supa.auth.admin
  .listUsers({ page: 1, perPage: 1 })
  .catch((error) => ({ error }));

console.log('admin.listUsers ok?', !users.error);

const { error } = await supa
  .from('users')
  .select('*', { count: 'exact', head: true });

console.log(
  'select users reachable?',
  error ? `error:${error.message}` : 'ok',
);

process.exit(0);
