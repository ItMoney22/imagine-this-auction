-- The old project had these catalog-upload policies configured manually.
-- Reproduce them for the new project, matching lot-form.tsx's auction-id folders.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ar-models','ar-models',true,52428800,array['model/vnd.usdz+zip']) on conflict(id) do nothing;
drop policy if exists "Auction owners upload catalog assets" on storage.objects;
create policy "Auction owners upload catalog assets" on storage.objects for insert to authenticated
with check(bucket_id in ('lot-images','ar-models') and exists(
 select 1 from public.auctions a join public.auctioneers h on h.id=a.auctioneer_id
 where a.id::text=(storage.foldername(name))[1] and h.user_id=auth.uid() and h.is_approved
));
drop policy if exists "Auction owners read catalog assets" on storage.objects;
create policy "Auction owners read catalog assets" on storage.objects for select to authenticated
using(bucket_id in ('lot-images','ar-models') and exists(
 select 1 from public.auctions a join public.auctioneers h on h.id=a.auctioneer_id
 where a.id::text=(storage.foldername(name))[1] and h.user_id=auth.uid()
));
drop policy if exists "Auction owners remove catalog assets" on storage.objects;
create policy "Auction owners remove catalog assets" on storage.objects for delete to authenticated
using(bucket_id in ('lot-images','ar-models') and exists(
 select 1 from public.auctions a join public.auctioneers h on h.id=a.auctioneer_id
 where a.id::text=(storage.foldername(name))[1] and h.user_id=auth.uid()
));
notify pgrst,'reload schema';
commit;
