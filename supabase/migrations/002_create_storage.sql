INSERT INTO storage.buckets (id, name, public)
VALUES ('excalidraw-files', 'excalidraw-files', true)
ON CONFLICT DO NOTHING;
