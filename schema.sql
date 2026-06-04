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
  created_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  notes text,
  due_date date,
  done boolean default false,
  created_at timestamptz default now()
);
-- if the table already exists, add the column safely:
alter table tasks add column if not exists due_date date;

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

-- ===== Row-Level Security =====
alter table folders     enable row level security;
alter table projects    enable row level security;
alter table tasks       enable row level security;
alter table labels      enable row level security;
alter table task_labels enable row level security;

-- One policy per table: a user only sees/edits their own rows.
create policy "own folders"     on folders     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own projects"    on projects    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own tasks"       on tasks       for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own labels"      on labels      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own task_labels" on task_labels for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
