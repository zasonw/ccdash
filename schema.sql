-- ============================================================
-- Task Board schema — run this in Supabase SQL editor
-- Hierarchy: User → Folders → Projects → Tasks → (Labels via task_labels)
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
-- if the table already exists, add the column safely:
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

-- ===== Row-Level Security =====
alter table folders     enable row level security;
alter table projects    enable row level security;
alter table tasks       enable row level security;
alter table labels      enable row level security;
alter table task_labels enable row level security;
alter table task_comments enable row level security;

-- One policy per table: a user only sees/edits their own rows.
create policy "own folders"     on folders     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own projects"    on projects    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own tasks"       on tasks       for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own labels"      on labels      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own task_comments" on task_comments
  for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    AND exists (select 1 from tasks where id = task_id and user_id = auth.uid())
  );
-- ⑤ Strengthened: also verify task_id and label_id belong to this user,
--    preventing cross-user data association (e.g. linking another user's label).
create policy "own task_labels" on task_labels
  for all
  using  (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    AND exists (select 1 from tasks   where id = task_id   and user_id = auth.uid())
    AND exists (select 1 from labels  where id = label_id  and user_id = auth.uid())
  );
