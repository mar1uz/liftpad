# market-snapshot (daily job)

Stores one daily-close market snapshot per token in `public.token_market_snapshots`
and logs every execution in `public.job_runs`. This is what keeps the Supabase
project active (free-tier projects pause after ~7 days without activity) and
powers the token-page daily chart, network-rank badge, and homepage movers strip.

## Deploy

```sh
supabase functions deploy market-snapshot --project-ref efapexfqzymileohqlmx
```

Optional env (dashboard → Edge Functions → Secrets):

- `MARKET_SNAPSHOT_APP_ORIGIN` — defaults to `https://liftpad.xyz`.

## Schedule (once per day, 00:05 UTC)

Run this once in the Supabase SQL editor. Replace `<SERVICE_ROLE_KEY>` — it never
lives in the repo. The function itself rejects calls without the service key.

```sql
select cron.schedule(
  'market-snapshot-daily',
  '5 0 * * *',
  $$
  select net.http_post(
    url := 'https://efapexfqzymileohqlmx.supabase.co/functions/v1/market-snapshot',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Requires the `pg_cron` and `pg_net` extensions (both available on the free tier;
enable under Database → Extensions if missing).

## Verify

```sql
select * from public.job_runs order by started_at desc limit 5;
select day, count(*) from public.token_market_snapshots group by day order by day desc limit 7;
```
