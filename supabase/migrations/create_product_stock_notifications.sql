-- ==============================================================================
-- WishRite: Back-in-Stock Notification Table Migration
-- Creates product_stock_notifications table with idempotency & duplicate guard
-- ==============================================================================

create table if not exists public.product_stock_notifications (
    id uuid primary key default gen_random_uuid(),
    product_id text,
    product_code text not null,
    product_name text,
    customer_email text not null,
    created_at timestamptz default now() not null,
    notified_at timestamptz,
    status text default 'pending' not null check (status in ('pending', 'notified', 'cancelled'))
);

-- Idempotency protection: Prevent duplicate active subscriptions for same email + product
create unique index if not exists idx_unique_pending_stock_notification 
on public.product_stock_notifications (product_code, customer_email, status) 
where status = 'pending';

-- Index for fast lookup when stock changes
create index if not exists idx_stock_notifications_lookup 
on public.product_stock_notifications (product_code, status);

-- Enable Row Level Security (RLS)
alter table public.product_stock_notifications enable row level security;

-- Public customer storefront can subscribe with their email
create policy "Allow public subscription insert" 
on public.product_stock_notifications 
for insert 
with check (true);

-- Authenticated admins / edge functions can query subscriptions
create policy "Allow read access for notifications processing" 
on public.product_stock_notifications 
for select 
using (true);

-- Authenticated admins / edge functions can update status to notified
create policy "Allow update access for notification dispatch" 
on public.product_stock_notifications 
for update 
using (true);
