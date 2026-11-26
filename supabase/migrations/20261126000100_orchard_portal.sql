create table public.orchard_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  family_id uuid not null,
  role text not null check (role in ('parent', 'child')),
  unique (family_id, role)
);

create table public.orchard_goal_state (
  family_id uuid primary key,
  version integer not null default 1 check (version > 0),
  state jsonb not null check (
    jsonb_typeof(state) = 'object'
    and jsonb_typeof(state->'records') = 'array'
    and jsonb_typeof(state->'ticks') = 'object'
  )
);

alter table public.orchard_members enable row level security;
alter table public.orchard_goal_state enable row level security;
revoke all on public.orchard_members, public.orchard_goal_state from anon, authenticated;
grant select on public.orchard_members to service_role;
grant select, insert, update on public.orchard_goal_state to service_role;

-- Account membership is issued by the portal through the Auth admin endpoint.
-- User-editable metadata is never consulted.
create function public.orchard_add_member() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  membership jsonb := new.raw_app_meta_data->'orchard';
begin
  if membership is null then return new; end if;
  if membership->>'role' = 'child' and not exists (
    select 1 from public.orchard_members
    where family_id = (membership->>'family_id')::uuid and role = 'parent'
  ) then
    raise exception 'Orchard parent is required';
  end if;
  insert into public.orchard_members (user_id, family_id, role)
  values (new.id, (membership->>'family_id')::uuid, membership->>'role');
  return new;
end;
$$;

revoke all on function public.orchard_add_member() from public, anon, authenticated;
create trigger orchard_add_member
after insert on auth.users
for each row execute function public.orchard_add_member();
