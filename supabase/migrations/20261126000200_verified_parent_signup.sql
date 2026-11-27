create function public.orchard_add_verified_parent() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null
     and new.confirmation_sent_at is not null
     and new.raw_app_meta_data->>'provider' = 'email'
     and new.raw_user_meta_data->'orchard_parent_signup' = 'true'::jsonb then
    insert into public.orchard_members (user_id, family_id, role)
    values (new.id, new.id, 'parent') on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.orchard_add_verified_parent() from public, anon, authenticated;
create trigger orchard_add_verified_parent after update of email_confirmed_at on auth.users
for each row execute function public.orchard_add_verified_parent();
