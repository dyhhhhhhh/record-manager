create or replace function public.try_start_mail_sync(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  run_id uuid;
begin
  if auth.role() <> 'service_role'
     and (auth.uid() is distinct from p_user_id or not public.is_app_owner()) then
    raise exception 'not allowed';
  end if;

  update public.mail_sync_runs
  set status = 'failed',
      finished_at = now(),
      error_summary = 'stale synchronization lock expired'
  where user_id = p_user_id
    and status = 'running'
    and started_at < now() - interval '10 minutes';

  insert into public.mail_sync_runs(user_id)
  values (p_user_id)
  returning id into run_id;

  return run_id;
exception
  when unique_violation then return null;
end;
$$;

revoke all on function public.try_start_mail_sync(uuid) from public;
grant execute on function public.try_start_mail_sync(uuid) to authenticated, service_role;
