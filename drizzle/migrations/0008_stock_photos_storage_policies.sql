CREATE POLICY "Users can upload stock photos to own folder" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'stock_photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can read stock photos from own folder" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'stock_photos' AND (storage.foldername(name))[1] = auth.uid()::text);