-- ============================================================
-- Task Board schema - run with `supabase db push`
-- Hierarchy: User -> Folders -> Projects -> Tasks -> Labels
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid not null references folders(id) on delete cascade,
  name text not null,
  color text default '#4d8dff',
  created_at timestamptz default now()
);

alter table projects add column if not exists color text default '#4d8dff';

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  notes text,
  due_date date,
  workflow text default 'backlog',
  progress integer default 0 check (progress >= 0 and progress <= 100),
  done boolean default false,
  created_at timestamptz default now()
);

alter table tasks add column if not exists due_date date;
alter table tasks add column if not exists workflow text default 'backlog';
alter table tasks add column if not exists progress integer default 0 check (progress >= 0 and progress <= 100);

create table if not exists labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists task_labels (
  task_id uuid not null references tasks(id) on delete cascade,
  label_id uuid not null references labels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (task_id, label_id)
);

create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz default now()
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on folders to authenticated;
grant select, insert, update, delete on projects to authenticated;
grant select, insert, update, delete on tasks to authenticated;
grant select, insert, update, delete on labels to authenticated;
grant select, insert, update, delete on task_labels to authenticated;
grant select, insert, update, delete on task_comments to authenticated;

alter table folders enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table labels enable row level security;
alter table task_labels enable row level security;
alter table task_comments enable row level security;

drop policy if exists "own folders" on folders;
drop policy if exists "own projects" on projects;
drop policy if exists "own tasks" on tasks;
drop policy if exists "own labels" on labels;
drop policy if exists "own task_labels" on task_labels;
drop policy if exists "own task_comments" on task_comments;

create policy "own folders"
  on folders
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own projects"
  on projects
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own tasks"
  on tasks
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own labels"
  on labels
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own task_comments"
  on task_comments
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from tasks
      where tasks.id = task_comments.task_id
        and tasks.user_id = (select auth.uid())
    )
  );

create policy "own task_labels"
  on task_labels
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from tasks
      where tasks.id = task_labels.task_id
        and tasks.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from labels
      where labels.id = task_labels.label_id
        and labels.user_id = (select auth.uid())
    )
  );

notify pgrst, 'reload schema';
